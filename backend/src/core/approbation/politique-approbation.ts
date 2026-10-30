import type { RoleSIGAD } from "../../../../shared/permissions/catalogue.ts";

/**
 * Politique D-15/D-16/D-17 (console Plateforme B3.2). Module pur et inerte: il n'est branché sur aucune route.
 * Les décisions restent des recommandations tant qu'elles ne sont pas confirmées.
 */

export type RoleApprobateur = "PROPRIETAIRE" | "ADMIN_CENTRAL";

export const DUREE_MAX_DEMANDE_MS = 24 * 60 * 60 * 1000;
export const FRAICHEUR_MFA_MAX_MS = 15 * 60 * 1000;

/** Classe A: second approbateur obligatoire. L'autorité requise suit D-17. */
export const OPERATIONS_CLASSE_A = {
  BASCULER_DRAPEAU_AUTORISATION: "PROPRIETAIRE",
  MODIFIER_CATALOGUE_PERMISSIONS: "PROPRIETAIRE",
  MODIFIER_PORTEE_ACCES: "PROPRIETAIRE",
  ATTRIBUER_ROLE_PRIVILEGIE: "PROPRIETAIRE",
  RETIRER_ROLE_PRIVILEGIE: "PROPRIETAIRE",
  REINITIALISER_ACCES_PRIVILEGIE: "PROPRIETAIRE",
  REVOQUER_COMPTE_PRIVILEGIE: "PROPRIETAIRE",
  REVOCATION_MASSIVE_SESSIONS: "PROPRIETAIRE",
  NETTOYER_DONNEES_TEST: "PROPRIETAIRE",
  EXECUTER_FUSION_TERRITORIALE: "PROPRIETAIRE",
  EXECUTER_IMPORT_TERRITORIAL: "PROPRIETAIRE",
  EXPORTER_AUDIT: "PROPRIETAIRE",
  EXCEPTION_ACCES_NOMINATIF: "ADMIN_CENTRAL",
} as const satisfies Record<string, RoleApprobateur>;

export type ActionClasseA = keyof typeof OPERATIONS_CLASSE_A;

/** Classe B: simple contrôle avec motif et audit, sans second approbateur. */
export const OPERATIONS_CLASSE_B = [
  "SUSPENDRE_COMPTE",
  "REACTIVER_COMPTE",
  "REVOQUER_APPAREIL",
  "REVOQUER_SESSION",
] as const;

/** Actions interdites à tous, quel que soit le rôle ou le nombre d'approbateurs. */
export const ACTIONS_INTERDITES = [
  "MODIFIER_JOURNAL_AUDIT",
  "SUPPRIMER_JOURNAL_AUDIT",
  "RETIRER_DERNIER_PROPRIETAIRE",
] as const;

export const CODES_DRAPEAUX_AUTORISATION = ["authz_observation", "roles_personnalises"] as const;

export interface DemandeApprobation {
  readonly actionCode: string;
  readonly cibleType: string;
  readonly cibleId: string;
  readonly empreinteAction: string;
  readonly demandeurId: string;
  readonly statut: "EN_ATTENTE" | "APPROUVEE" | "REFUSEE" | "EXPIREE" | "EXECUTEE" | "ANNULEE";
  readonly creeLe: string;
  readonly expireLe: string;
}

export interface Approbateur {
  readonly id: string;
  readonly role: RoleSIGAD;
  readonly actif: boolean;
  /** Dernière vérification MFA de la session, ISO 8601, ou null. */
  readonly mfaVerifieeLe: string | null;
}

export interface ContexteApprobation {
  readonly maintenant: string;
  /** Nombre de comptes PROPRIETAIRE actifs relu en base. */
  readonly proprietairesActifs: number;
}

export interface DecisionApprobation {
  readonly autorise: boolean;
  readonly motif: string;
}

function refus(motif: string): DecisionApprobation {
  return { autorise: false, motif };
}

function instant(valeur: string): number {
  const normalise = valeur.includes("T") ? valeur : `${valeur.replace(" ", "T")}Z`;
  return Date.parse(normalise);
}

export function roleApprobateurRequis(actionCode: string): RoleApprobateur | null {
  return Object.hasOwn(OPERATIONS_CLASSE_A, actionCode) ? OPERATIONS_CLASSE_A[actionCode as ActionClasseA] : null;
}

/** Empreinte SHA-256 hexadécimale d'une action canonique (clés triées), pour lier l'approbation à l'action exacte. */
export async function empreinteAction(action: { actionCode: string; cibleType: string; cibleId: string; parametres?: Record<string, unknown> }): Promise<string> {
  const canonique = JSON.stringify({
    a: action.actionCode,
    t: action.cibleType,
    i: action.cibleId,
    p: Object.fromEntries(Object.entries(action.parametres ?? {}).sort(([x], [y]) => x.localeCompare(y))),
  });
  const octets = new TextEncoder().encode(canonique);
  const condense = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(condense)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** Création d'une demande: l'action doit être de classe A, jamais interdite, et le repli D-17 s'applique. */
export function evaluerCreationDemande(
  actionCode: string,
  demandeur: Pick<Approbateur, "role" | "actif">,
  contexte: ContexteApprobation,
): DecisionApprobation {
  if ((ACTIONS_INTERDITES as readonly string[]).includes(actionCode)) return refus("ACTION_INTERDITE");
  const requis = roleApprobateurRequis(actionCode);
  if (!requis) return refus("ACTION_HORS_CLASSE_A");
  if (!demandeur.actif) return refus("DEMANDEUR_INACTIF");
  if (requis === "PROPRIETAIRE" && (demandeur.role !== "PROPRIETAIRE" || contexte.proprietairesActifs < 2)) {
    return refus(demandeur.role !== "PROPRIETAIRE" ? "DEMANDEUR_NON_HABILITE" : "SECOND_PROPRIETAIRE_ABSENT");
  }
  return { autorise: true, motif: "DEMANDE_RECEVABLE" };
}

/** Approbation: séparation des tâches, habilitation identique, MFA récente, expiration, usage unique. */
export function evaluerApprobation(
  demande: DemandeApprobation,
  approbateur: Approbateur,
  contexte: ContexteApprobation,
): DecisionApprobation {
  const requis = roleApprobateurRequis(demande.actionCode);
  if (!requis) return refus("ACTION_HORS_CLASSE_A");
  if (demande.statut !== "EN_ATTENTE") return refus("DEMANDE_NON_EN_ATTENTE");
  const maintenant = instant(contexte.maintenant);
  const expiration = instant(demande.expireLe);
  const creation = instant(demande.creeLe);
  if ([maintenant, expiration, creation].some(Number.isNaN)) return refus("DATE_INVALIDE");
  if (expiration - creation > DUREE_MAX_DEMANDE_MS) return refus("DUREE_DEMANDE_EXCESSIVE");
  if (maintenant >= expiration) return refus("DEMANDE_EXPIREE");
  if (!approbateur.actif) return refus("APPROBATEUR_INACTIF");
  if (approbateur.id === demande.demandeurId) return refus("AUTO_APPROBATION_INTERDITE");
  if (demande.cibleType === "UTILISATEUR" && approbateur.id === demande.cibleId) return refus("APPROBATEUR_EST_LA_CIBLE");
  if (approbateur.role !== requis) return refus("HABILITATION_INSUFFISANTE");
  if (requis === "PROPRIETAIRE" && contexte.proprietairesActifs < 2) return refus("SECOND_PROPRIETAIRE_ABSENT");
  const mfa = approbateur.mfaVerifieeLe ? instant(approbateur.mfaVerifieeLe) : Number.NaN;
  if (Number.isNaN(mfa) || maintenant - mfa > FRAICHEUR_MFA_MAX_MS || mfa > maintenant) return refus("MFA_NON_RECENTE");
  return { autorise: true, motif: "APPROBATION_VALIDE" };
}

/** Exécution: la demande doit être approuvée, non expirée, et l'action présentée identique à l'approuvée. */
export function evaluerExecution(
  demande: DemandeApprobation,
  empreinteAExecuter: string,
  contexte: ContexteApprobation,
): DecisionApprobation {
  if (demande.statut !== "APPROUVEE") return refus("DEMANDE_NON_APPROUVEE");
  if (instant(contexte.maintenant) >= instant(demande.expireLe)) return refus("APPROBATION_EXPIREE");
  if (empreinteAExecuter !== demande.empreinteAction) return refus("ACTION_DIFFERENTE_DE_CELLE_APPROUVEE");
  return { autorise: true, motif: "EXECUTION_AUTORISEE" };
}
