export type StatutDemande = "EN_ATTENTE" | "APPROUVEE" | "REFUSEE" | "EXPIREE" | "EXECUTEE" | "ANNULEE";
export type ActionDemande = "approuver" | "refuser" | "annuler" | "executer";

export interface DemandeApprobationUI {
  id: string;
  action: string;
  cible_type: string;
  cible_id: string;
  parametres: { actif?: boolean; version?: number };
  motif: string;
  demandeur_id: string;
  statut: StatutDemande;
  decide_par: string | null;
  decide_le: string | null;
  motif_decision: string | null;
  execute_le: string | null;
  cree_le: string;
  expire_le: string;
}

export interface DrapeauUI {
  code: string;
  categorie: "PRESENTATION" | "AUTORISATION" | "TECHNIQUE";
  description: string;
  actif: boolean;
  double_controle: boolean;
  version: number;
  modifie_le: string;
}

export const LIBELLES_STATUT: Record<StatutDemande, string> = {
  EN_ATTENTE: "En attente",
  APPROUVEE: "Approuvée",
  REFUSEE: "Refusée",
  EXPIREE: "Expirée",
  EXECUTEE: "Exécutée",
  ANNULEE: "Annulée",
};

/**
 * Actions proposées dans l'interface. Reflète les règles du serveur (séparation des tâches) sans les remplacer:
 * le serveur reste l'autorité et revérifie chaque transition.
 */
export function actionsDisponibles(demande: Pick<DemandeApprobationUI, "statut" | "demandeur_id">, utilisateurId: string): ActionDemande[] {
  const demandeur = demande.demandeur_id === utilisateurId;
  if (demande.statut === "EN_ATTENTE") return demandeur ? ["annuler"] : ["approuver", "refuser"];
  if (demande.statut === "APPROUVEE") return demandeur ? ["executer"] : [];
  return [];
}

export function motifValide(motif: string): boolean {
  return motif.trim().length >= 10 && motif.trim().length <= 500;
}

export function codeTotpValide(code: string): boolean {
  return /^\d{6}$/u.test(code);
}

export function libelleChangement(demande: Pick<DemandeApprobationUI, "cible_id" | "parametres">): string {
  const etat = demande.parametres.actif === undefined ? "?" : demande.parametres.actif ? "activer" : "désactiver";
  return `${etat} le drapeau « ${demande.cible_id} »`;
}
