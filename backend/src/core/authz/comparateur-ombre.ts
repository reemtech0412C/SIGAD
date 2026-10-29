import type { RoleSIGAD } from "../../../../shared/permissions/catalogue.ts";

type Ligne = Record<string, unknown>;

interface InstructionSql {
  get(...parametres: unknown[]): unknown;
  all(...parametres: unknown[]): unknown[];
}

export interface BaseLectureOmbre {
  prepare(sql: string): InstructionSql;
}

export type DecisionAutorisation = "ALLOW" | "DENY" | "INDETERMINATE" | "ERROR";
export type NiveauEvaluation = "ROUTE_GATE" | "AUTORISATION_COMPLETE";
export type ClasseComparaison = "MATCH" | "MISMATCH" | "INDETERMINATE" | "ERROR";

export interface ContexteGeographique {
  readonly typeUnite: "NATIONALE" | "PROVINCE" | "LOCALITE";
  readonly gid: string | null;
}

export interface ExigencesRessource {
  readonly proprietaire?: boolean;
  readonly geographique?: boolean;
  readonly organisation?: boolean;
}

export interface RequeteComparaisonOmbre {
  readonly methode: string;
  readonly chemin: string;
  readonly actionDemandee?: string;
  readonly utilisateurId?: string;
  readonly sessionId?: string;
  readonly appareilId?: string;
  readonly mfaVerifieeRequise?: boolean;
  readonly preAuthentifie?: boolean;
  readonly exigences?: ExigencesRessource;
  readonly proprietaireRessourceId?: string | null;
  readonly porteeRessource?: ContexteGeographique | null;
  readonly sensibiliteRapport?: "NON_SENSIBLE" | "SENSIBLE";
  readonly maintenant?: string;
}

export interface ResultatEvaluation {
  readonly decision: DecisionAutorisation;
  readonly niveau: NiveauEvaluation;
  readonly motifs: readonly string[];
  readonly permission?: string;
  readonly rolesShadow?: readonly string[];
}

export interface ResultatComparaison {
  readonly classe: ClasseComparaison;
  readonly legacy: DecisionAutorisation;
  readonly shadow: DecisionAutorisation;
  readonly niveau: NiveauEvaluation;
  readonly motif: string;
}

/** Un statut de validation métier ne prouve pas l'autorisation de la route. */
export function normaliserObservationHttp(statut: number): DecisionAutorisation {
  if (statut >= 200 && statut < 300) return "ALLOW";
  if (statut === 401 || statut === 403) return "DENY";
  if (statut >= 500) return "ERROR";
  return "INDETERMINATE";
}

function plusieursLignes<T extends Ligne>(base: BaseLectureOmbre, sql: string, ...parametres: unknown[]): T[] {
  return base.prepare(sql).all(...parametres) as T[];
}

function instant(valeur: string | null | undefined): number | null {
  if (!valeur) return null;
  const normalisee = valeur.includes("T") ? valeur : `${valeur.replace(" ", "T")}Z`;
  const temps = Date.parse(normalisee);
  return Number.isFinite(temps) ? temps : null;
}

function estValideMaintenant(debut: unknown, fin: unknown, maintenant: number): boolean {
  const du = typeof debut === "string" ? instant(debut) : null;
  const au = typeof fin === "string" ? instant(fin) : null;
  if ((debut !== null && debut !== undefined && du === null) || (fin !== null && fin !== undefined && au === null)) return false;
  return (du === null || du <= maintenant) && (au === null || maintenant < au);
}

function resultat(
  decision: DecisionAutorisation,
  niveau: NiveauEvaluation,
  motif: string,
  permission?: string,
  rolesShadow?: readonly string[],
): ResultatEvaluation {
  return { decision, niveau, motifs: [motif], ...(permission ? { permission } : {}), ...(rolesShadow ? { rolesShadow } : {}) };
}

interface AffectationOmbre extends Ligne {
  affectation_id: string | null;
  role_code: RoleSIGAD;
  portee_id: string | null;
  statut_affectation: string;
  valide_du: string | null;
  valide_au: string | null;
  statut_role: string | null;
  type_unite: ContexteGeographique["typeUnite"] | null;
  gid: string | null;
  inclut_descendants: number | null;
}

function evaluerProprietaire(
  exige: boolean,
  acteur: string | undefined,
  proprietaireRessource: string | null | undefined,
): "ALLOW" | "DENY" | "INDETERMINATE" {
  if (!exige) return "ALLOW";
  if (!acteur || proprietaireRessource === null || proprietaireRessource === undefined) return "INDETERMINATE";
  return acteur === proprietaireRessource ? "ALLOW" : "DENY";
}

function evaluerPortee(
  exige: boolean,
  portee: AffectationOmbre,
  ressource: ContexteGeographique | null | undefined,
): "ALLOW" | "DENY" | "INDETERMINATE" {
  if (!exige) return "ALLOW";
  if (!ressource) return "INDETERMINATE";
  if (portee.type_unite === "NATIONALE" && portee.gid === null) return "ALLOW";
  if (portee.type_unite === ressource.typeUnite && portee.gid === ressource.gid) return "ALLOW";
  if (portee.type_unite === ressource.typeUnite) return "DENY";
  if (portee.inclut_descendants === 1) {
    // Les GID Shadow n'ont pas encore de lien vérifié avec le référentiel B2.3.
    return "INDETERMINATE";
  }
  return "INDETERMINATE";
}

function evaluerCondition(code: string, sensibilite?: "NON_SENSIBLE" | "SENSIBLE"): "ALLOW" | "DENY" | "INDETERMINATE" {
  if (code === "") return "ALLOW";
  if (code === "RAPPORT_NON_SENSIBLE") {
    if (sensibilite === undefined) return "INDETERMINATE";
    return sensibilite === "NON_SENSIBLE" ? "ALLOW" : "DENY";
  }
  return "INDETERMINATE";
}

/** Évalue les tables B2.2 directement. Cette fonction est diagnostique et ne participe pas au middleware d'accès. */
export function evaluerDecisionOmbre(base: BaseLectureOmbre, requete: RequeteComparaisonOmbre): ResultatEvaluation {
  const niveau: NiveauEvaluation = requete.exigences
    ? "AUTORISATION_COMPLETE"
    : "ROUTE_GATE";
  const methode = requete.methode.toUpperCase();
  try {
    // Une seule instruction capture politiques, compte, session, appareil et
    // affectations dans le même instantané SQLite; elle évite un résultat mixte
    // si la réconciliation s'exécute en parallèle.
    const lignes = plusieursLignes<Ligne>(base, `SELECT p.code AS permission_code, p.action AS permission_action,
        p.mode_acces, u.id AS compte_id, u.statut AS compte_statut,
        cc.statut AS consultation_statut, s.id AS session_id, s.utilisateur_id AS session_utilisateur_id,
        s.expire_le AS session_expire_le, s.revoquee AS session_revoquee,
        s.appareil_id AS session_appareil_id, s.type AS session_type,
        s.mfa_verifiee AS session_mfa_verifiee, a.id AS appareil_lie_id,
        a.utilisateur_id AS appareil_utilisateur_id, a.statut AS appareil_statut,
        e.resultat AS reconciliation_resultat, ar.id AS affectation_id,
        ar.role_code, ar.portee_id, ar.statut AS statut_affectation,
        ar.valide_du, ar.valide_au, r.statut AS statut_role,
        pa.type_unite, pa.gid, pa.inclut_descendants,
        rp.permission_code AS role_permission_code, rp.condition_code
      FROM (SELECT 1) racine
      LEFT JOIN permissions p ON p.methode = ? AND p.chemin = ?
      LEFT JOIN utilisateurs u ON u.id = ?
      LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
      LEFT JOIN sessions s ON s.id = ? AND s.utilisateur_id = u.id
      LEFT JOIN appareils a ON a.id = s.appareil_id
      LEFT JOIN b22_reconciliation_etat e ON e.utilisateur_id = u.id
      LEFT JOIN affectations_roles ar ON ar.utilisateur_id = u.id
      LEFT JOIN roles r ON r.code = ar.role_code
      LEFT JOIN portees_acces pa ON pa.id = ar.portee_id
      LEFT JOIN roles_permissions rp ON rp.role_code = ar.role_code AND rp.permission_code = p.code`,
    methode, requete.chemin, requete.utilisateurId ?? null, requete.sessionId ?? null);
    if (lignes.length === 0) return resultat("ERROR", niveau, "LECTURE_SHADOW_VIDE");
    const ligneInitiale = lignes[0] ?? {};
    const politique = ligneInitiale.permission_code
      ? { code: String(ligneInitiale.permission_code), action: String(ligneInitiale.permission_action ?? ""), mode_acces: String(ligneInitiale.mode_acces ?? "") }
      : undefined;
    if (!politique) return resultat("INDETERMINATE", niveau, "POLITIQUE_SHADOW_ABSENTE");
    if (!new Set(["PUBLIC", "PREAUTH", "SESSION", "ROLE"]).has(politique.mode_acces)) {
      return resultat("ERROR", niveau, "MODE_ACCES_SHADOW_INVALIDE", politique.code);
    }
    if (requete.actionDemandee && requete.actionDemandee !== politique.action) {
      return resultat("ERROR", niveau, "ACTION_DEMANDEE_DIFFERENTE_DE_LA_POLITIQUE", politique.code);
    }

    if (politique.mode_acces === "PUBLIC") {
      if (requete.exigences?.organisation) return resultat("INDETERMINATE", niveau, "PORTEE_ORGANISATION_NON_MODELISEE", politique.code);
      if (requete.exigences?.proprietaire || requete.exigences?.geographique) {
        return resultat("INDETERMINATE", niveau, "CONTEXTE_RESSOURCE_REQUIS", politique.code);
      }
      return resultat("ALLOW", niveau, "POLITIQUE_PUBLIQUE", politique.code);
    }
    if (politique.mode_acces === "PREAUTH") {
      if (requete.preAuthentifie === undefined) return resultat("INDETERMINATE", niveau, "PREAUTH_NON_ETABLIE", politique.code);
      if (!requete.preAuthentifie) return resultat("DENY", niveau, "PREAUTH_ABSENTE", politique.code);
      // Le registre Shadow ne relie pas encore le défi pré-authentifié à son
      // état consommé; un booléen d'appelant ne constitue pas une preuve.
      return resultat("INDETERMINATE", niveau, "PREAUTH_NON_REPRESENTEE_DANS_SHADOW", politique.code);
    }

    if (!requete.utilisateurId) return resultat("INDETERMINATE", niveau, "IDENTITE_ABSENTE", politique.code);
    if (!ligneInitiale.compte_id) return resultat("INDETERMINATE", niveau, "COMPTE_SHADOW_ABSENT", politique.code);
    if (ligneInitiale.compte_statut !== "ACTIF") return resultat("DENY", niveau, "COMPTE_NON_ACTIF", politique.code);
    if (ligneInitiale.consultation_statut && ligneInitiale.consultation_statut !== "ACTIF") {
      return resultat("DENY", niveau, "COMPTE_CONSULTATION_NON_ACTIF", politique.code);
    }

    if (!requete.sessionId) return resultat("INDETERMINATE", niveau, "SESSION_NON_FOURNIE", politique.code);
    if (!ligneInitiale.session_id || ligneInitiale.session_utilisateur_id !== requete.utilisateurId) {
      return resultat("DENY", niveau, "SESSION_ABSENTE_OU_AUTRE_COMPTE", politique.code);
    }
    const maintenant = instant(requete.maintenant ?? new Date().toISOString());
    const expiration = instant(String(ligneInitiale.session_expire_le ?? ""));
    if (maintenant === null || expiration === null) return resultat("ERROR", niveau, "DATE_SESSION_INVALIDE", politique.code);
    if (ligneInitiale.session_revoquee !== 0 || expiration <= maintenant) return resultat("DENY", niveau, "SESSION_REVOQUEE_OU_EXPIREE", politique.code);
    if (requete.mfaVerifieeRequise && ligneInitiale.session_mfa_verifiee !== 1) {
      return resultat("DENY", niveau, "MFA_SESSION_NON_VERIFIEE", politique.code);
    }

    const appareilIdSession = typeof ligneInitiale.session_appareil_id === "string" ? ligneInitiale.session_appareil_id : null;
    if (ligneInitiale.session_type === "MOBILE" && !appareilIdSession) return resultat("DENY", niveau, "SESSION_MOBILE_SANS_APPAREIL", politique.code);
    if (requete.appareilId && requete.appareilId !== appareilIdSession) {
      return resultat("DENY", niveau, "APPAREIL_DIFFERENT_DE_LA_SESSION", politique.code);
    }
    if (appareilIdSession) {
      if (!ligneInitiale.appareil_lie_id || ligneInitiale.appareil_utilisateur_id !== requete.utilisateurId
        || ligneInitiale.appareil_statut !== "AUTORISE") {
        return resultat("DENY", niveau, "APPAREIL_NON_AUTORISE", politique.code);
      }
    }

    if (politique.mode_acces === "SESSION") {
      if (requete.exigences?.organisation) return resultat("INDETERMINATE", niveau, "PORTEE_ORGANISATION_NON_MODELISEE", politique.code);
      const proprietaire = evaluerProprietaire(
        requete.exigences?.proprietaire === true,
        requete.utilisateurId,
        requete.proprietaireRessourceId,
      );
      if (proprietaire === "DENY") return resultat("DENY", niveau, "PROPRIETAIRE_RESSOURCE_DIFFERENT", politique.code);
      if (proprietaire === "INDETERMINATE") return resultat("INDETERMINATE", niveau, "PROPRIETAIRE_RESSOURCE_ABSENT", politique.code);
      if (requete.exigences?.geographique) {
        return resultat("INDETERMINATE", niveau, "PORTÉE_RESSOURCE_SANS_AFFECTATION_ROLE", politique.code);
      }
      return resultat("ALLOW", niveau, "SESSION_ACTIVE", politique.code);
    }

    if (ligneInitiale.reconciliation_resultat !== "RECONCILIE") {
      return resultat("INDETERMINATE", niveau, "RECONCILIATION_SHADOW_ABSENTE_OU_EN_CONFLIT", politique.code);
    }

    const maintenantMs = instant(requete.maintenant ?? new Date().toISOString());
    if (maintenantMs === null) return resultat("ERROR", niveau, "HORLOGE_INVALIDE", politique.code);
    const affectationsMap = new Map<string, AffectationOmbre[]>();
    for (const ligne of lignes) {
      if (typeof ligne.affectation_id !== "string" || typeof ligne.role_code !== "string") continue;
      const affectation = ligne as AffectationOmbre;
      if (affectation.statut_affectation !== "ACTIF" || affectation.statut_role !== "ACTIF"
        || !estValideMaintenant(affectation.valide_du, affectation.valide_au, maintenantMs)) continue;
      const groupe = affectationsMap.get(ligne.affectation_id) ?? [];
      groupe.push(affectation);
      affectationsMap.set(ligne.affectation_id, groupe);
    }
    const affectations = [...affectationsMap.values()];
    if (affectations.length === 0) return resultat("DENY", niveau, "AUCUNE_AFFECTATION_ACTIVE", politique.code);

    const decisionsCandidates: Array<"ALLOW" | "DENY" | "INDETERMINATE"> = [];
    for (const groupeAffectation of affectations) {
      const affectation = groupeAffectation[0];
      if (!affectation) continue;
      const correspondances = groupeAffectation.filter((ligne) => ligne.role_permission_code !== null);
      if (correspondances.length === 0) {
        decisionsCandidates.push("DENY");
        continue;
      }
      for (const correspondance of correspondances) {
        const condition = evaluerCondition(String(correspondance.condition_code ?? ""), requete.sensibiliteRapport);
        if (condition !== "ALLOW") {
          decisionsCandidates.push(condition);
          continue;
        }
        if (requete.exigences?.geographique && (!affectation.portee_id || !affectation.type_unite)) {
          decisionsCandidates.push("INDETERMINATE");
          continue;
        }
        if (requete.exigences?.organisation) {
          decisionsCandidates.push("INDETERMINATE");
          continue;
        }
        const proprietaire = evaluerProprietaire(
          requete.exigences?.proprietaire === true,
          requete.utilisateurId,
          requete.proprietaireRessourceId,
        );
        const geographique = evaluerPortee(
          requete.exigences?.geographique === true,
          affectation,
          requete.porteeRessource,
        );
        decisionsCandidates.push(proprietaire === "DENY" || geographique === "DENY"
          ? "DENY"
          : proprietaire === "INDETERMINATE" || geographique === "INDETERMINATE" ? "INDETERMINATE" : "ALLOW");
      }
    }

    const rolesShadow = [...new Set(affectations.map((groupe) => groupe[0]?.role_code)
      .filter((role): role is RoleSIGAD => typeof role === "string"))].sort();
    if (decisionsCandidates.includes("ALLOW")) return resultat("ALLOW", niveau, "PERMISSION_SHADOW_ACCORDEE", politique.code, rolesShadow);
    if (decisionsCandidates.includes("INDETERMINATE")) return resultat("INDETERMINATE", niveau, "DONNEES_DE_PORTEE_INSUFFISANTES", politique.code, rolesShadow);
    return resultat("DENY", niveau, "AUCUNE_AFFECTATION_ROLE_PERMISSION_VALIDE", politique.code, rolesShadow);
  } catch {
    return resultat("ERROR", niveau, "ERREUR_TECHNIQUE_EVALUATION");
  }
}

/** Les comparaisons de niveaux différents ne sont pas présentées comme une équivalence. */
export function comparerDecisions(
  legacy: { readonly decision: DecisionAutorisation; readonly niveau: NiveauEvaluation },
  shadow: ResultatEvaluation,
): ResultatComparaison {
  if (legacy.decision === "ERROR" || shadow.decision === "ERROR") {
    return { classe: "ERROR", legacy: legacy.decision, shadow: shadow.decision, niveau: shadow.niveau, motif: "ERREUR_TECHNIQUE" };
  }
  if (legacy.niveau !== shadow.niveau) {
    return { classe: "INDETERMINATE", legacy: legacy.decision, shadow: shadow.decision, niveau: shadow.niveau, motif: "NIVEAUX_EVALUATION_DIFFERENTS" };
  }
  if (legacy.decision === "INDETERMINATE" || shadow.decision === "INDETERMINATE") {
    return { classe: "INDETERMINATE", legacy: legacy.decision, shadow: shadow.decision, niveau: shadow.niveau, motif: "DECISION_NON_CONCLUANTE" };
  }
  const classe: ClasseComparaison = legacy.decision === shadow.decision ? "MATCH" : "MISMATCH";
  return { classe, legacy: legacy.decision, shadow: shadow.decision, niveau: shadow.niveau, motif: classe };
}
