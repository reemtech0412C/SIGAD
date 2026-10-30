import type { RoleSIGAD } from "../../../../shared/permissions/catalogue.ts";

/**
 * Règles candidates D-02/D-04 (option A approuvée en principe).
 * Module diagnostique en lecture seule: il n'est branché ni sur le middleware
 * ni sur exigerPermission, et ne change aucune décision Legacy.
 */

export type DecisionCandidate = "ALLOW" | "DENY";

export type ProfilEcart = "A1" | "A2" | "A3" | "A4" | "B1" | "B2" | "B3" | "B4";

export interface ContexteCandidat {
  readonly utilisateurId?: string;
  /** Relation d'affectation relue en base par le serveur; jamais fournie par le client. */
  readonly affectationVerifiee?: boolean;
  /** Propriétaire de la ressource relu en base (ex. destinataire d'une notification). */
  readonly proprietaireRessourceId?: string | null;
  readonly sensibiliteRapport?: "NON_SENSIBLE" | "SENSIBLE";
}

export interface DecisionRegleCandidate {
  readonly decision: DecisionCandidate;
  readonly motif: string;
}

export interface EcartB11 {
  readonly profil: ProfilEcart;
  readonly roles: readonly RoleSIGAD[];
  readonly methode: "GET" | "POST";
  readonly chemin: string;
}

const ROLES_TERRAIN: readonly RoleSIGAD[] = ["AGENT_DISTRIBUTION", "RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN"];
const ROLES_STOCK: readonly RoleSIGAD[] = ["RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN"];

const ROUTES_A1 = [
  "/api/approvisionnements",
  "/api/approvisionnements/:id/destinations",
  "/api/approvisionnements/:id/expeditions",
  "/api/approvisionnements/:id/receptions",
  "/api/approvisionnements/:id/repartition",
  "/api/distributions",
  "/api/operations-centrales",
];

/** Référentiels publics nécessaires au travail: lecture seule, sans droit sur les données opérationnelles. */
export const REFERENTIELS_PUBLICS = [
  "/api/territoire/cantons",
  "/api/territoire/communes",
  "/api/territoire/departements",
  "/api/territoire/localites",
  "/api/territoire/provinces",
  "/api/territoire/sous-prefectures",
];
/** Plus sensibles: exigent une affectation vérifiée. */
export const REFERENTIELS_SENSIBLES = [
  "/api/territoire/rattachements-territoriaux",
  "/api/territoire/sites-humanitaires",
];

const ROUTES_A3 = [
  "ajustements-stock", "articles", "categories-aide", "conditionnements", "entrepots",
  "lots-stock", "mouvements-stock", "receptions-stock", "soldes-stock", "unites-mesure",
].map((nom) => `/api/stocks/${nom}`);

const ROUTES_A4 = [
  "/api/rapports/:type/apercu",
  "/api/rapports/catalogue",
  "/api/rapports/filtres",
  "/api/rapports/indicateurs-carte",
  "/api/rapports/tableau-de-bord",
];

const ROUTES_B3_NOTIFICATIONS: readonly (readonly [("GET" | "POST"), string])[] = [
  ["GET", "/api/notifications"],
  ["POST", "/api/notifications/:id/lecture"],
  ["POST", "/api/notifications/lecture-toutes"],
];
const ROUTES_B3_OPERATIONS = [
  "/api/operations-centrales",
  "/api/operations-centrales/:id",
  "/api/operations-centrales/:id/consolidation",
  "/api/operations-centrales/:id/documents/:docId",
];

function ecarts(profil: ProfilEcart, roles: readonly RoleSIGAD[], methode: "GET" | "POST", chemins: readonly string[]): EcartB11[] {
  return chemins.map((chemin) => ({ profil, roles, methode, chemin }));
}

/** Registre exact des 80 couples rôle-route (somme: 21+24+20+5+1+1+7+1). */
export const ECARTS_B11: readonly EcartB11[] = [
  ...ecarts("A1", ROLES_TERRAIN, "GET", ROUTES_A1),
  ...ecarts("A2", ROLES_TERRAIN, "GET", [...REFERENTIELS_PUBLICS, ...REFERENTIELS_SENSIBLES]),
  ...ecarts("A3", ROLES_STOCK, "GET", ROUTES_A3),
  ...ecarts("A4", ["CONSULTATION_INSTITUTIONNELLE"], "GET", ROUTES_A4),
  ...ecarts("B1", ["ADMIN_CENTRAL"], "GET", ["/api/distributions/menages"]),
  ...ecarts("B2", ["PROPRIETAIRE"], "GET", ["/api/distributions/menages"]),
  ...ROUTES_B3_NOTIFICATIONS.map(([methode, chemin]) => ({
    profil: "B3" as const, roles: ["CONSULTATION_INSTITUTIONNELLE"] as const, methode, chemin,
  })),
  ...ecarts("B3", ["CONSULTATION_INSTITUTIONNELLE"], "GET", ROUTES_B3_OPERATIONS),
  ...ecarts("B4", ["DELEGUE_PROVINCIAL"], "GET", ["/api/operations-centrales/:id/consolidation"]),
];

/** Nombre de couples rôle × route couverts par un écart. */
export function compterCouples(liste: readonly EcartB11[] = ECARTS_B11): number {
  return liste.reduce((total, ecart) => total + ecart.roles.length, 0);
}

function refuser(motif: string): DecisionRegleCandidate {
  return { decision: "DENY", motif };
}
function autoriser(motif: string): DecisionRegleCandidate {
  return { decision: "ALLOW", motif };
}

/**
 * Évalue la règle candidate d'un couple. Échec fermé: sans relation vérifiable,
 * ou pour toute combinaison hors registre, la décision est DENY.
 */
export function evaluerRegleCandidate(
  role: RoleSIGAD,
  methode: string,
  chemin: string,
  contexte: ContexteCandidat = {},
): DecisionRegleCandidate {
  const ecart = ECARTS_B11.find((e) => e.methode === methode.toUpperCase() && e.chemin === chemin && e.roles.includes(role));
  if (!ecart) return refuser("COUPLE_HORS_REGISTRE_D02_D04");

  switch (ecart.profil) {
    case "A1":
      // Seule la relation agent/superviseur ↔ distribution est modélisée (0044): les autres ressources restent fermées.
      if (chemin !== "/api/distributions") return refuser("A1_RELATION_NON_MODELISEE_POUR_CETTE_RESSOURCE");
      return contexte.affectationVerifiee === true
        ? autoriser("A1_DOSSIER_ASSIGNE_VERIFIE")
        : refuser("A1_AFFECTATION_ABSENTE_OU_NON_VERIFIABLE");
    case "A2":
      if (REFERENTIELS_PUBLICS.includes(chemin)) return autoriser("A2_REFERENTIEL_PUBLIC_LECTURE_SEULE");
      return contexte.affectationVerifiee === true
        ? autoriser("A2_REFERENTIEL_SENSIBLE_AFFECTE")
        : refuser("A2_REFERENTIEL_SENSIBLE_SANS_AFFECTATION");
    case "A3":
      if (role === "RESPONSABLE_STOCK") {
        return contexte.affectationVerifiee === true
          ? autoriser("A3_ENTREPOT_ASSIGNE_VERIFIE")
          : refuser("A3_ENTREPOT_NON_ASSIGNE_OU_NON_VERIFIABLE");
      }
      return contexte.affectationVerifiee === true
        ? autoriser("A3_SUPERVISEUR_AFFECTATION_EXPLICITE")
        : refuser("A3_SUPERVISEUR_SANS_AFFECTATION_EXPLICITE");
    case "A4":
      if (contexte.sensibiliteRapport === "NON_SENSIBLE") return autoriser("A4_RAPPORT_NON_SENSIBLE");
      return refuser(contexte.sensibiliteRapport === "SENSIBLE" ? "A4_RAPPORT_SENSIBLE" : "A4_SENSIBILITE_INCONNUE");
    case "B1":
    case "B2":
      return refuser("NOMINATIF_MENAGES_REFUSE_SANS_COMPETENCE_APPROUVEE");
    case "B3":
      if (!chemin.startsWith("/api/notifications")) return refuser("B3_OPERATION_CENTRALE_ET_DOCUMENTS_REFUSES");
      if (!contexte.utilisateurId || contexte.proprietaireRessourceId === undefined) {
        return refuser("B3_NOTIFICATION_PROPRIETAIRE_NON_VERIFIE");
      }
      return contexte.proprietaireRessourceId === contexte.utilisateurId
        ? autoriser("B3_NOTIFICATION_PROPRE")
        : refuser("B3_NOTIFICATION_D_UN_AUTRE_COMPTE");
    case "B4":
      return refuser("B4_CONSOLIDATION_NATIONALE_REFUSEE_AU_DELEGUE");
  }
}

interface LectureAffectation {
  prepare(sql: string): { get(...parametres: unknown[]): unknown };
}

export interface ResultatAffectation {
  readonly verifiee: boolean;
  readonly motif: string;
}

/**
 * Relation d'affectation relue en base (profils_operationnels_terrain, B2.2/0030).
 * Seule relation aujourd'hui vérifiable: RESPONSABLE_STOCK ↔ entrepôt explicite.
 * SUPERVISEUR_TERRAIN, AGENT_DISTRIBUTION (dossiers/distributions) et les référentiels
 * sensibles n'ont pas de table de relation: ils restent fermés (garde-fou 8).
 */
export function verifierAffectationEntrepot(
  base: LectureAffectation,
  utilisateurId: string,
  role: RoleSIGAD,
  entrepotId: string,
): ResultatAffectation {
  if (role !== "RESPONSABLE_STOCK") return { verifiee: false, motif: "RELATION_NON_MODELISEE_POUR_CE_ROLE" };
  if (!utilisateurId || !entrepotId) return { verifiee: false, motif: "IDENTIFIANTS_ABSENTS" };
  const ligne = base.prepare(`SELECT 1 AS ok FROM profils_operationnels_terrain p
      JOIN utilisateurs u ON u.id = p.utilisateur_id
      JOIN entrepots e ON e.id = p.entrepot_id
      WHERE p.utilisateur_id = ? AND p.role_terrain = 'RESPONSABLE_STOCK' AND p.statut = 'ACTIF'
        AND u.statut = 'ACTIF' AND p.entrepot_id = ?
        AND (e.province_id IS NULL OR e.province_id = p.province_id)`)
    .get(utilisateurId, entrepotId);
  return ligne ? { verifiee: true, motif: "PROFIL_ACTIF_ENTREPOT_EXPLICITE" } : { verifiee: false, motif: "AUCUN_PROFIL_ACTIF_POUR_CET_ENTREPOT" };
}

/** Affectation terrain ↔ distribution relue en base (migration 0044), avec validité temporelle. */
export function verifierAffectationDistribution(
  base: LectureAffectation,
  utilisateurId: string,
  role: RoleSIGAD,
  distributionId: string,
  maintenant: string = new Date().toISOString().replace("T", " ").slice(0, 19),
): ResultatAffectation {
  if (role !== "AGENT_DISTRIBUTION" && role !== "SUPERVISEUR_TERRAIN") {
    return { verifiee: false, motif: "RELATION_NON_MODELISEE_POUR_CE_ROLE" };
  }
  if (!utilisateurId || !distributionId) return { verifiee: false, motif: "IDENTIFIANTS_ABSENTS" };
  const ligne = base.prepare(`SELECT 1 AS ok FROM affectations_terrain_distributions a
      JOIN utilisateurs u ON u.id = a.utilisateur_id
      JOIN profils_operationnels_terrain p ON p.utilisateur_id = a.utilisateur_id AND p.role_terrain = a.role_terrain
      JOIN distributions_provinciales d ON d.id = a.distribution_id
      WHERE a.utilisateur_id = ? AND a.role_terrain = ? AND a.distribution_id = ? AND a.statut = 'ACTIF'
        AND u.statut = 'ACTIF' AND p.statut = 'ACTIF' AND p.province_id = d.province_id
        AND (a.valide_du IS NULL OR a.valide_du <= ?) AND (a.valide_au IS NULL OR ? < a.valide_au)`)
    .get(utilisateurId, role, distributionId, maintenant, maintenant);
  return ligne ? { verifiee: true, motif: "AFFECTATION_DISTRIBUTION_ACTIVE" } : { verifiee: false, motif: "AUCUNE_AFFECTATION_ACTIVE_POUR_CETTE_DISTRIBUTION" };
}
