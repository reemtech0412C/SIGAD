import type { UtilisateurSession } from "../bindings.ts";
import type { FiltresRapport, FiltresRapportPagine, TypeRapport } from "../../../shared/validations/rapports.ts";

export class ErreurRapport extends Error {
  constructor(message: string, readonly statutHttp: number = 400) {
    super(message);
    this.name = "ErreurRapport";
  }
}

export type ValeurRapport = string | number | null;
export type LigneRapport = Record<string, ValeurRapport>;
type ValeurSql = string | number | null;

export interface ColonneRapport {
  cle: string;
  libelle: string;
}

export interface DefinitionRapport {
  type: TypeRapport;
  intitule: string;
  description: string;
  colonnes: ColonneRapport[];
  donneesSensibles: boolean;
  identifiantOperationRequis: boolean;
}

export interface ResultatApercuRapport {
  definition: DefinitionRapport;
  elements: LigneRapport[];
  limite: number;
  decalage: number;
  suite_disponible: boolean;
  lignes_lues: number;
  duree_requetes_ms: number;
}

export interface ResultatExportRapport {
  definition: DefinitionRapport;
  elements: LigneRapport[];
  lignes_totales_estimees: number;
  export_tronque: boolean;
  contexte: { province_id: string | null; province_nom: string | null; perimetre: "NATIONAL" | "PROVINCIAL" };
  filtres: FiltresRapport;
  lignes_lues: number;
  duree_requetes_ms: number;
}

export interface IndicateursRapport {
  approvisionnements: number;
  distributions: number;
  menages_cibles_uniques: number;
  menages_servis_uniques: number;
  menages_partiellement_servis_uniques: number;
  occurrences_beneficiaires: number;
  personnes_enregistrees_menages_cibles: number;
  personnes_assistees_menages_uniques: number;
  personnes_assistees_cumulees: number;
  quantite_expediee: number;
  quantite_receptionnee: number;
  quantite_distribuee: number;
  stock_disponible_comptable: number;
  operations_cloturees: number;
  operations_en_attente: number;
  ecarts_non_resolus: number;
}

export interface PointMensuelRapport {
  mois: string;
  distributions: number;
  menages_uniques: number;
  occurrences_beneficiaires: number;
  personnes_assistees_cumulees: number;
}

export interface LigneProvinceRapport {
  province_id: string;
  province: string;
  distributions: number;
  menages_uniques: number;
  menages_servis: number;
  menages_partiels: number;
  personnes_assistees: number;
}

export interface TableauDeBordRapports {
  perimetre: "NATIONAL" | "PROVINCIAL";
  province_id: string | null;
  periode: { date_debut: string | null; date_fin: string | null };
  indicateurs: IndicateursRapport;
  evolution_mensuelle: PointMensuelRapport[];
  provinces: LigneProvinceRapport[];
  ressources_d1: { lignes_lues: number; duree_requetes_ms: number };
}

const MAX_EXPORT = 10_000;

const definitions: Record<TypeRapport, DefinitionRapport> = {
  RAPPORT_MENSUEL_PROVINCIAL: {
    type: "RAPPORT_MENSUEL_PROVINCIAL", intitule: "Rapport mensuel provincial",
    description: "Synthèse mensuelle des distributions, ménages uniques et personnes assistées.",
    colonnes: [
      { cle: "province", libelle: "Province" }, { cle: "mois", libelle: "Mois" },
      { cle: "distributions", libelle: "Distributions" }, { cle: "menages_cibles_uniques", libelle: "Ménages ciblés uniques" },
      { cle: "menages_servis_uniques", libelle: "Ménages servis uniques" }, { cle: "menages_partiels_uniques", libelle: "Ménages partiellement servis" },
      { cle: "occurrences_beneficiaires", libelle: "Bénéfices (occurrences)" },
      { cle: "personnes_enregistrees", libelle: "Personnes enregistrées, ménages ciblés" },
      { cle: "personnes_assistees_cumulees", libelle: "Personnes assistées cumulées" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_NATIONAL_CONSOLIDE: {
    type: "RAPPORT_NATIONAL_CONSOLIDE", intitule: "Rapport national consolidé",
    description: "Indicateurs opérationnels consolidés par province, sans multiplication par article.",
    colonnes: [
      { cle: "province", libelle: "Province" }, { cle: "approvisionnements", libelle: "Approvisionnements" },
      { cle: "distributions", libelle: "Distributions" }, { cle: "menages_cibles_uniques", libelle: "Ménages ciblés uniques" },
      { cle: "menages_servis_uniques", libelle: "Ménages servis uniques" }, { cle: "menages_partiels_uniques", libelle: "Ménages partiellement servis" },
      { cle: "occurrences_beneficiaires", libelle: "Bénéfices (occurrences)" },
      { cle: "personnes_enregistrees", libelle: "Personnes enregistrées, ménages ciblés" },
      { cle: "personnes_assistees_cumulees", libelle: "Personnes assistées cumulées" },
      { cle: "quantite_expediee", libelle: "Quantité expédiée" }, { cle: "quantite_receptionnee", libelle: "Quantité réceptionnée" },
      { cle: "quantite_distribuee", libelle: "Quantité distribuée" }, { cle: "stock_disponible", libelle: "Stock disponible comptable" },
      { cle: "operations_cloturees", libelle: "Opérations clôturées" }, { cle: "operations_en_attente", libelle: "Opérations en attente" },
      { cle: "ecarts_non_resolus", libelle: "Écarts non résolus" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_APPROVISIONNEMENTS_CENTRAUX: {
    type: "RAPPORT_APPROVISIONNEMENTS_CENTRAUX", intitule: "Rapport des approvisionnements centraux",
    description: "Opérations centrales, allocations par province et volumes alloués, expédiés et réceptionnés.",
    colonnes: [
      { cle: "reference", libelle: "Référence" }, { cle: "intitule", libelle: "Intitulé" },
      { cle: "date_creation", libelle: "Date de création" }, { cle: "partenaire", libelle: "Partenaire" },
      { cle: "nature_aide", libelle: "Nature de l’aide" }, { cle: "statut", libelle: "Statut" },
      { cle: "province", libelle: "Province destinataire" }, { cle: "quantite_allouee", libelle: "Quantité allouée" },
      { cle: "quantite_expediee", libelle: "Quantité expédiée" }, { cle: "quantite_receptionnee", libelle: "Quantité réceptionnée" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_EXPEDITIONS: {
    type: "RAPPORT_EXPEDITIONS", intitule: "Rapport des expéditions",
    description: "Expéditions par destination, origine, transporteur et quantités réellement expédiées.",
    colonnes: [
      { cle: "reference", libelle: "Référence d’expédition" }, { cle: "reference_approvisionnement", libelle: "Approvisionnement" },
      { cle: "province", libelle: "Province destinataire" }, { cle: "date_expedition", libelle: "Date d’expédition" },
      { cle: "origine", libelle: "Origine" }, { cle: "transporteur", libelle: "Transporteur" },
      { cle: "statut", libelle: "Statut" }, { cle: "lignes", libelle: "Lignes de produits" },
      { cle: "quantite_expediee", libelle: "Quantité expédiée" }, { cle: "quantite_receptionnee", libelle: "Quantité réceptionnée" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_RECEPTIONS_PROVINCIALES: {
    type: "RAPPORT_RECEPTIONS_PROVINCIALES", intitule: "Rapport des réceptions provinciales",
    description: "Quantités physiques, acceptées, endommagées et manquantes par réception.",
    colonnes: [
      { cle: "reference", libelle: "Référence de réception" }, { cle: "expedition", libelle: "Expédition" },
      { cle: "province", libelle: "Province" }, { cle: "entrepot", libelle: "Entrepôt récepteur" },
      { cle: "date_reception", libelle: "Date de réception" }, { cle: "numero_pv", libelle: "Procès-verbal" },
      { cle: "statut_rapprochement", libelle: "Rapprochement" }, { cle: "quantite_recue", libelle: "Quantité reçue" },
      { cle: "quantite_acceptee", libelle: "Quantité acceptée" }, { cle: "quantite_endommagee", libelle: "Quantité endommagée" },
      { cle: "quantite_manquante", libelle: "Quantité manquante" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  ETAT_STOCKS: {
    type: "ETAT_STOCKS", intitule: "État des stocks",
    description: "Soldes comptables rapprochés des lots physiques et du stock disponible par qualité.",
    colonnes: [
      { cle: "province", libelle: "Province" }, { cle: "entrepot", libelle: "Entrepôt" },
      { cle: "article", libelle: "Article" }, { cle: "categorie", libelle: "Catégorie d’aide" },
      { cle: "quantite_physique_solde", libelle: "Quantité physique du solde" },
      { cle: "quantite_physique_lots", libelle: "Quantité physique des lots" }, { cle: "ecart_physique", libelle: "Écart physique" },
      { cle: "quantite_reservee_solde", libelle: "Quantité réservée du solde" },
      { cle: "quantite_reservee_lots", libelle: "Quantité réservée des lots" }, { cle: "ecart_reserve", libelle: "Écart de réservation" },
      { cle: "quantite_disponible_comptable", libelle: "Quantité disponible comptable" },
      { cle: "quantite_disponible_qualite", libelle: "Quantité disponible de qualité conforme" },
      { cle: "quantite_lots_partenaire", libelle: "Quantité issue du partenaire filtré" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_MOUVEMENTS_STOCK: {
    type: "RAPPORT_MOUVEMENTS_STOCK", intitule: "Rapport des mouvements de stock",
    description: "Journal immuable des mouvements avec soldes avant et après opération.",
    colonnes: [
      { cle: "reference", libelle: "Référence" }, { cle: "date_mouvement", libelle: "Date" },
      { cle: "province", libelle: "Province" }, { cle: "entrepot", libelle: "Entrepôt" },
      { cle: "article", libelle: "Article" }, { cle: "numero_lot", libelle: "Lot" },
      { cle: "type_mouvement", libelle: "Type de mouvement" }, { cle: "sens", libelle: "Sens" },
      { cle: "quantite", libelle: "Quantité" }, { cle: "solde_avant", libelle: "Solde avant" },
      { cle: "solde_apres", libelle: "Solde après" }, { cle: "document_source", libelle: "Document source" },
      { cle: "motif", libelle: "Motif" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_DISTRIBUTION: {
    type: "RAPPORT_DISTRIBUTION", intitule: "Rapport de distribution",
    description: "Bilan par distribution, ménages uniques, occurrences et quantités distribuées.",
    colonnes: [
      { cle: "reference", libelle: "Référence" }, { cle: "intitule", libelle: "Intitulé" },
      { cle: "province", libelle: "Province" }, { cle: "date_prevue", libelle: "Date prévue" },
      { cle: "nature_aide", libelle: "Nature de l’aide" }, { cle: "partenaires", libelle: "Partenaires" },
      { cle: "statut", libelle: "Statut" }, { cle: "menages_cibles_uniques", libelle: "Ménages ciblés uniques" },
      { cle: "menages_servis_uniques", libelle: "Ménages servis uniques" }, { cle: "menages_partiels_uniques", libelle: "Ménages partiellement servis" },
      { cle: "occurrences_beneficiaires", libelle: "Bénéfices (occurrences)" },
      { cle: "personnes_assistees_cumulees", libelle: "Personnes assistées cumulées" },
      { cle: "quantite_distribuee", libelle: "Quantité distribuée" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  LISTE_BENEFICIAIRES: {
    type: "LISTE_BENEFICIAIRES", intitule: "Liste des bénéficiaires",
    description: "Ménages actifs ciblés, sans coordonnées personnelles non nécessaires.",
    colonnes: [
      { cle: "code_menage", libelle: "Code du ménage" }, { cle: "province", libelle: "Province" },
      { cle: "nom_chef_menage", libelle: "Chef de ménage" }, { cle: "sexe_chef", libelle: "Sexe du chef" },
      { cle: "nombre_personnes", libelle: "Personnes enregistrées" }, { cle: "categorie_population", libelle: "Catégorie de population" },
      { cle: "localite", libelle: "Localité validée" }, { cle: "statut_service", libelle: "Statut de service" },
      { cle: "date_service", libelle: "Date de service" },
    ], donneesSensibles: true, identifiantOperationRequis: false,
  },
  LISTE_EMARGEMENT: {
    type: "LISTE_EMARGEMENT", intitule: "Liste d’émargement",
    description: "Remises et quantités par ménage, pour une distribution déterminée.",
    colonnes: [
      { cle: "reference_remise", libelle: "Référence de remise" }, { cle: "date_remise", libelle: "Date de remise" },
      { cle: "code_menage", libelle: "Code du ménage" }, { cle: "province", libelle: "Province" },
      { cle: "identite_recepteur", libelle: "Identité du récepteur" }, { cle: "emargement_reference", libelle: "Référence d’émargement" },
      { cle: "articles_remis", libelle: "Articles et quantités remis" }, { cle: "agent", libelle: "Agent distributeur" },
    ], donneesSensibles: true, identifiantOperationRequis: true,
  },
  PROCES_VERBAL_DISTRIBUTION: {
    type: "PROCES_VERBAL_DISTRIBUTION", intitule: "Procès-verbal de distribution",
    description: "Synthèse figée de clôture, avec répartition des ménages et bilan des articles.",
    colonnes: [
      { cle: "reference", libelle: "Référence de distribution" }, { cle: "intitule", libelle: "Intitulé" },
      { cle: "province", libelle: "Province" }, { cle: "date_cloture", libelle: "Date de clôture" },
      { cle: "cloture_par", libelle: "Clôture enregistrée par" }, { cle: "menages_cibles", libelle: "Ménages ciblés" },
      { cle: "menages_servis", libelle: "Ménages servis" }, { cle: "menages_partiels", libelle: "Ménages partiels" },
      { cle: "menages_absents", libelle: "Ménages absents" }, { cle: "menages_non_servis", libelle: "Ménages non servis" },
      { cle: "bilan_articles", libelle: "Bilan des articles" }, { cle: "observations_finales", libelle: "Observations finales" },
    ], donneesSensibles: false, identifiantOperationRequis: true,
  },
  RAPPORT_ECARTS: {
    type: "RAPPORT_ECARTS", intitule: "Rapport des écarts",
    description: "Différences entre quantités expédiées, reçues physiquement, acceptées, endommagées et manquantes.",
    colonnes: [
      { cle: "reference_reception", libelle: "Réception" }, { cle: "expedition", libelle: "Expédition" },
      { cle: "province", libelle: "Province" }, { cle: "date_reception", libelle: "Date de réception" },
      { cle: "article", libelle: "Article" }, { cle: "quantite_expediee", libelle: "Quantité expédiée" },
      { cle: "quantite_recue", libelle: "Quantité reçue" }, { cle: "quantite_acceptee", libelle: "Quantité acceptée" },
      { cle: "quantite_endommagee", libelle: "Quantité endommagée" }, { cle: "quantite_manquante", libelle: "Quantité manquante" },
      { cle: "statut_rapprochement", libelle: "Rapprochement" }, { cle: "justification", libelle: "Justification" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_CLOTURE: {
    type: "RAPPORT_CLOTURE", intitule: "Rapport de clôture",
    description: "Décisions de clôture centrale et indicateurs finaux figés.",
    colonnes: [
      { cle: "reference", libelle: "Référence" }, { cle: "intitule", libelle: "Intitulé" },
      { cle: "province", libelle: "Province" }, { cle: "date_cloture", libelle: "Date de clôture" },
      { cle: "cloture_par", libelle: "Clôturée par" }, { cle: "menages_cibles", libelle: "Ménages ciblés" },
      { cle: "menages_servis", libelle: "Ménages servis" }, { cle: "menages_partiels", libelle: "Ménages partiels" },
      { cle: "menages_absents", libelle: "Ménages absents" }, { cle: "menages_non_servis", libelle: "Ménages non servis" },
      { cle: "observations_finales", libelle: "Observations finales" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_PARTENAIRE: {
    type: "RAPPORT_PARTENAIRE", intitule: "Rapport par partenaire",
    description: "Approvisionnements, distributions et volumes associés à chaque partenaire.",
    colonnes: [
      { cle: "partenaire", libelle: "Partenaire" }, { cle: "type_organisation", libelle: "Type d’organisation" },
      { cle: "approvisionnements", libelle: "Approvisionnements centraux" }, { cle: "distributions", libelle: "Distributions" },
      { cle: "expeditions", libelle: "Expéditions" }, { cle: "quantite_expediee", libelle: "Quantité expédiée" },
      { cle: "quantite_receptionnee", libelle: "Quantité réceptionnée" }, { cle: "quantite_distribuee", libelle: "Quantité distribuée" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
  RAPPORT_COUVERTURE_GEOGRAPHIQUE: {
    type: "RAPPORT_COUVERTURE_GEOGRAPHIQUE", intitule: "Rapport de couverture géographique",
    description: "Ménages et opérations par province et localité validée; les rattachements non validés sont masqués.",
    colonnes: [
      { cle: "province", libelle: "Province" }, { cle: "localite", libelle: "Localité validée" },
      { cle: "distributions", libelle: "Distributions" }, { cle: "menages_cibles_uniques", libelle: "Ménages ciblés uniques" },
      { cle: "menages_servis_uniques", libelle: "Ménages servis uniques" }, { cle: "menages_partiels_uniques", libelle: "Ménages partiellement servis" },
      { cle: "occurrences_beneficiaires", libelle: "Bénéfices (occurrences)" },
    ], donneesSensibles: false, identifiantOperationRequis: false,
  },
};

export function lireDefinitionRapport(type: TypeRapport): DefinitionRapport {
  return definitions[type];
}

function verifierFiltresApplicables(type: TypeRapport, filtres: FiltresRapport): void {
  const filtresLocalite = new Set<TypeRapport>([
    "RAPPORT_MENSUEL_PROVINCIAL", "RAPPORT_NATIONAL_CONSOLIDE", "RAPPORT_DISTRIBUTION",
    "LISTE_BENEFICIAIRES", "LISTE_EMARGEMENT", "PROCES_VERBAL_DISTRIBUTION",
    "RAPPORT_CLOTURE", "RAPPORT_COUVERTURE_GEOGRAPHIQUE",
  ]);
  if (filtres.localite_id && !filtresLocalite.has(type)) {
    throw new ErreurRapport("Le filtre de localité ne s’applique pas à ce type de rapport.", 400);
  }
  if (type === "ETAT_STOCKS" && (filtres.date_debut || filtres.date_fin || filtres.statut)) {
    throw new ErreurRapport("L’état des stocks est une photographie courante; les filtres de période et de statut ne s’appliquent pas.", 400);
  }
  if (type === "RAPPORT_PARTENAIRE" && filtres.localite_id) {
    throw new ErreurRapport("Le rapport par partenaire ne prend pas en charge le filtre de localité.", 400);
  }
  if ((type === "LISTE_EMARGEMENT" || type === "PROCES_VERBAL_DISTRIBUTION") && filtres.statut) {
    throw new ErreurRapport("Le statut est déterminé par la distribution sélectionnée pour ce document.", 400);
  }
}

export function appliquerPerimetreUtilisateur(
  utilisateur: UtilisateurSession,
  filtres: FiltresRapport,
): FiltresRapport {
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id) throw new ErreurRapport("Le compte provincial n’a pas de province active.", 403);
    if (filtres.province_id && filtres.province_id !== utilisateur.province_id) {
      throw new ErreurRapport("Vous ne pouvez consulter que les données de votre province.", 403);
    }
    return { ...filtres, province_id: utilisateur.province_id };
  }
  return filtres;
}

function ajouterPeriode(
  conditions: string[], valeurs: ValeurSql[], colonne: string,
  dateDebut?: string, dateFin?: string,
): void {
  if (dateDebut) { conditions.push(`${colonne} >= ?`); valeurs.push(dateDebut); }
  if (dateFin) { conditions.push(`${colonne} < date(?, '+1 day')`); valeurs.push(dateFin); }
}

function ajouterFiltresDistribution(filtres: FiltresRapport, alias = "d") {
  const conditions = ["1 = 1"];
  const valeurs: ValeurSql[] = [];
  if (filtres.province_id) { conditions.push(`${alias}.province_id = ?`); valeurs.push(filtres.province_id); }
  ajouterPeriode(conditions, valeurs, `${alias}.date_prevue`, filtres.date_debut, filtres.date_fin);
  if (filtres.partenaire_id) {
    conditions.push(`(${alias}.bailleur_fonds_id = ? OR ${alias}.partenaire_execution_id = ?)`);
    valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
  }
  if (filtres.nature_aide) { conditions.push(`${alias}.nature_aide = ?`); valeurs.push(filtres.nature_aide); }
  if (filtres.statut) { conditions.push(`${alias}.statut = ?`); valeurs.push(filtres.statut); }
  if (filtres.distribution_id) { conditions.push(`${alias}.id = ?`); valeurs.push(filtres.distribution_id); }
  if (filtres.localite_id) {
    conditions.push(`EXISTS (SELECT 1 FROM zones_distribution zf WHERE zf.distribution_id = ${alias}.id
      AND zf.province_id = ${alias}.province_id AND zf.localite_id = ?)`);
    valeurs.push(filtres.localite_id);
  }
  return { sql: conditions.join(" AND "), valeurs };
}

function ajouterFiltresApprovisionnement(filtres: FiltresRapport, alias = "a") {
  const conditions = ["1 = 1"];
  const valeurs: ValeurSql[] = [];
  ajouterPeriode(conditions, valeurs, `${alias}.date_creation`, filtres.date_debut, filtres.date_fin);
  if (filtres.province_id) {
    conditions.push(`EXISTS (SELECT 1 FROM destinations_approvisionnement daf
      WHERE daf.approvisionnement_id = ${alias}.id AND daf.province_id = ?)`);
    valeurs.push(filtres.province_id);
  }
  if (filtres.partenaire_id) { conditions.push(`${alias}.partenaire_id = ?`); valeurs.push(filtres.partenaire_id); }
  if (filtres.nature_aide) { conditions.push(`${alias}.nature_aide = ?`); valeurs.push(filtres.nature_aide); }
  if (filtres.statut) { conditions.push(`${alias}.statut = ?`); valeurs.push(filtres.statut); }
  return { sql: conditions.join(" AND "), valeurs };
}

function ajouterFiltresExpedition(filtres: FiltresRapport, alias = "e", approAlias = "a") {
  const conditions = ["1 = 1"];
  const valeurs: ValeurSql[] = [];
  ajouterPeriode(conditions, valeurs, `${alias}.date_expedition`, filtres.date_debut, filtres.date_fin);
  if (filtres.province_id) { conditions.push(`${alias}.province_destinataire_id = ?`); valeurs.push(filtres.province_id); }
  if (filtres.partenaire_id) {
    conditions.push(`(${approAlias}.partenaire_id = ? OR ${alias}.transporteur_partenaire_id = ?)`);
    valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
  }
  if (filtres.nature_aide) { conditions.push(`${approAlias}.nature_aide = ?`); valeurs.push(filtres.nature_aide); }
  if (filtres.statut) { conditions.push(`${alias}.statut_expedition = ?`); valeurs.push(filtres.statut); }
  return { sql: conditions.join(" AND "), valeurs };
}

function ajouterFiltresReception(filtres: FiltresRapport, alias = "rp", approAlias = "a") {
  const conditions = ["1 = 1"];
  const valeurs: ValeurSql[] = [];
  ajouterPeriode(conditions, valeurs, `${alias}.date_reception`, filtres.date_debut, filtres.date_fin);
  if (filtres.province_id) { conditions.push(`${alias}.province_id = ?`); valeurs.push(filtres.province_id); }
  if (filtres.partenaire_id) { conditions.push(`${approAlias}.partenaire_id = ?`); valeurs.push(filtres.partenaire_id); }
  if (filtres.nature_aide) { conditions.push(`${approAlias}.nature_aide = ?`); valeurs.push(filtres.nature_aide); }
  if (filtres.statut) { conditions.push(`${alias}.statut_rapprochement = ?`); valeurs.push(filtres.statut); }
  return { sql: conditions.join(" AND "), valeurs };
}

function ajouterFiltresMouvement(filtres: FiltresRapport, alias = "m") {
  const conditions = ["1 = 1"];
  const valeurs: ValeurSql[] = [];
  ajouterPeriode(conditions, valeurs, `${alias}.cree_le`, filtres.date_debut, filtres.date_fin);
  if (filtres.province_id) { conditions.push(`${alias}.province_id = ?`); valeurs.push(filtres.province_id); }
  if (filtres.partenaire_id) {
    conditions.push(`EXISTS (SELECT 1 FROM lots_stock lpf WHERE lpf.id = ${alias}.lot_stock_id AND lpf.partenaire_bailleur_id = ?)`);
    valeurs.push(filtres.partenaire_id);
  }
  if (filtres.nature_aide) {
    conditions.push(`EXISTS (SELECT 1 FROM articles af INNER JOIN categories_aide caf ON caf.id = af.categorie_id
      WHERE af.id = ${alias}.article_id AND (caf.code = ? OR caf.libelle = ?))`);
    valeurs.push(filtres.nature_aide, filtres.nature_aide);
  }
  if (filtres.statut) { conditions.push(`${alias}.type_mouvement = ?`); valeurs.push(filtres.statut); }
  return { sql: conditions.join(" AND "), valeurs };
}

function construireSqlRapport(type: TypeRapport, filtres: FiltresRapport): { sql: string; valeurs: ValeurSql[]; ordre: string } {
  verifierFiltresApplicables(type, filtres);
  const d = ajouterFiltresDistribution(filtres);
  const a = ajouterFiltresApprovisionnement(filtres);
  const e = ajouterFiltresExpedition(filtres);
  const rp = ajouterFiltresReception(filtres);
  const m = ajouterFiltresMouvement(filtres);
  switch (type) {
    case "RAPPORT_MENSUEL_PROVINCIAL":
      return {
        sql: `WITH ds AS (
            SELECT d.id, d.province_id, d.date_prevue FROM distributions_provinciales d WHERE ${d.sql}
          ), mo AS (
            SELECT ds.id AS distribution_id, ds.province_id, strftime('%Y-%m', ds.date_prevue) AS mois,
              md.menage_id, md.statut_service, mh.nombre_personnes
            FROM ds LEFT JOIN menages_distribution md ON md.distribution_id = ds.id AND md.province_id = ds.province_id
            LEFT JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
          ), menages_mois AS (
            SELECT province_id, mois, menage_id, MAX(nombre_personnes) AS personnes,
              MAX(CASE WHEN statut_service = 'SERVI' THEN 1 ELSE 0 END) AS servi,
              MAX(CASE WHEN statut_service = 'PARTIELLEMENT_SERVI' THEN 1 ELSE 0 END) AS partiel
            FROM mo WHERE menage_id IS NOT NULL GROUP BY province_id, mois, menage_id
          ), operations AS (
            SELECT province_id, mois, COUNT(DISTINCT distribution_id) AS distributions,
              COUNT(DISTINCT menage_id) AS menages_cibles_uniques,
              SUM(CASE WHEN statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN 1 ELSE 0 END) AS occurrences_beneficiaires,
              SUM(CASE WHEN statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN COALESCE(nombre_personnes, 0) ELSE 0 END) AS personnes_assistees_cumulees
            FROM mo GROUP BY province_id, mois
          )
          SELECT p.nom AS province, o.mois, o.distributions, o.menages_cibles_uniques,
            SUM(CASE WHEN mm.servi = 1 THEN 1 ELSE 0 END) AS menages_servis_uniques,
            SUM(CASE WHEN mm.servi = 0 AND mm.partiel = 1 THEN 1 ELSE 0 END) AS menages_partiels_uniques,
            o.occurrences_beneficiaires, COALESCE(SUM(mm.personnes), 0) AS personnes_enregistrees,
            o.personnes_assistees_cumulees
          FROM operations o INNER JOIN provinces p ON p.id = o.province_id
          LEFT JOIN menages_mois mm ON mm.province_id = o.province_id AND mm.mois = o.mois
          GROUP BY p.id, p.nom, o.mois, o.distributions, o.menages_cibles_uniques,
            o.occurrences_beneficiaires, o.personnes_assistees_cumulees
          ORDER BY o.mois DESC, province COLLATE NOCASE`,
        valeurs: d.valeurs, ordre: "mois DESC, province COLLATE NOCASE",
      };
    case "RAPPORT_NATIONAL_CONSOLIDE":
      return {
        sql: `WITH ds AS (
            SELECT d.id, d.province_id, d.statut FROM distributions_provinciales d WHERE ${d.sql}
          ), ms AS (
            SELECT md.distribution_id, md.menage_id, md.statut_service, mh.nombre_personnes, md.province_id
            FROM menages_distribution md INNER JOIN ds ON ds.id = md.distribution_id
            INNER JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
          ), mu AS (
            SELECT province_id, menage_id, MAX(nombre_personnes) AS personnes,
              MAX(CASE WHEN statut_service = 'SERVI' THEN 1 ELSE 0 END) AS servi,
              MAX(CASE WHEN statut_service = 'PARTIELLEMENT_SERVI' THEN 1 ELSE 0 END) AS partiel
            FROM ms GROUP BY province_id, menage_id
          ), husum AS (
            SELECT province_id, COUNT(*) AS menages_cibles,
              SUM(CASE WHEN servi = 1 THEN 1 ELSE 0 END) AS menages_servis,
              SUM(CASE WHEN servi = 0 AND partiel = 1 THEN 1 ELSE 0 END) AS menages_partiels,
              SUM(personnes) AS personnes_enregistrees
            FROM mu GROUP BY province_id
          ), dsum AS (
            SELECT ds.province_id, COUNT(DISTINCT ds.id) AS distributions,
              SUM(CASE WHEN ms.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN 1 ELSE 0 END) AS occurrences,
              SUM(CASE WHEN ms.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN ms.nombre_personnes ELSE 0 END) AS personnes_assistees
            FROM ds LEFT JOIN ms ON ms.distribution_id = ds.id GROUP BY ds.province_id
          ), asum AS (
            SELECT dp.province_id, COUNT(DISTINCT a.id) AS approvisionnements
            FROM approvisionnements_centraux a INNER JOIN destinations_approvisionnement dp ON dp.approvisionnement_id = a.id
            WHERE ${a.sql} AND (? IS NULL OR dp.province_id = ?) GROUP BY dp.province_id
          ), esum AS (
            SELECT e.province_destinataire_id AS province_id,
              SUM(le.quantite_expediee) AS quantite_expediee,
              SUM(COALESCE(lr.quantite_acceptee, 0)) AS quantite_receptionnee
            FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
            INNER JOIN lignes_expedition le ON le.expedition_id = e.id
            LEFT JOIN (SELECT ligne_expedition_id, SUM(quantite_acceptee) AS quantite_acceptee
              FROM lignes_reception_provinciale GROUP BY ligne_expedition_id) lr ON lr.ligne_expedition_id = le.id
            WHERE ${e.sql} GROUP BY e.province_destinataire_id
          ), qsum AS (
            SELECT r.province_id, SUM(lr.quantite_remise) AS quantite_distribuee
            FROM remises_distribution r INNER JOIN lignes_remise lr ON lr.remise_id = r.id
            INNER JOIN distributions_provinciales d ON d.id = r.distribution_id
            WHERE ${d.sql} GROUP BY r.province_id
          ), ssum AS (
            SELECT s.province_id, SUM(CASE WHEN ? IS NULL THEN s.quantite_disponible ELSE COALESCE((
              SELECT SUM(lp.quantite_physique - lp.quantite_reservee) FROM lots_stock lp
              WHERE lp.entrepot_id = s.entrepot_id AND lp.article_id = s.article_id AND lp.partenaire_bailleur_id = ?
            ), 0) END) AS stock_disponible
            FROM soldes_stock s INNER JOIN entrepots w ON w.id = s.entrepot_id
            INNER JOIN articles ar ON ar.id = s.article_id INNER JOIN categories_aide ca ON ca.id = ar.categorie_id
            WHERE (? IS NULL OR s.province_id = ?)
              AND (? IS NULL OR ca.code = ? OR ca.libelle = ?)
            GROUP BY s.province_id
          ), csum AS (
            SELECT d.province_id,
              SUM(CASE WHEN d.statut = 'CLOTUREE_CENTRAL' THEN 1 ELSE 0 END) AS distributions_cloturees,
              SUM(CASE WHEN d.statut <> 'CLOTUREE_CENTRAL' THEN 1 ELSE 0 END) AS distributions_attente
            FROM distributions_provinciales d WHERE ${d.sql} GROUP BY d.province_id
          ), osum AS (
            SELECT dp.province_id,
              SUM(CASE WHEN a.statut = 'CLOTUREE' THEN 1 ELSE 0 END) AS appro_clotures,
              SUM(CASE WHEN a.statut <> 'CLOTUREE' THEN 1 ELSE 0 END) AS appro_attente
            FROM approvisionnements_centraux a INNER JOIN destinations_approvisionnement dp ON dp.approvisionnement_id = a.id
            WHERE ${a.sql} AND (? IS NULL OR dp.province_id = ?) GROUP BY dp.province_id
          ), xsum AS (
            SELECT rp.province_id, COUNT(*) AS ecarts
            FROM receptions_provinciales rp INNER JOIN expeditions e ON e.id = rp.expedition_id
            INNER JOIN approvisionnements_centraux a ON a.id = rp.approvisionnement_id
            WHERE ${rp.sql} AND rp.statut_rapprochement = 'ECART_OUVERT' GROUP BY rp.province_id
          )
          SELECT p.nom AS province,
            COALESCE(MAX(asum.approvisionnements), 0) AS approvisionnements,
            COALESCE(MAX(dsum.distributions), 0) AS distributions,
            COALESCE(MAX(husum.menages_cibles), 0) AS menages_cibles_uniques,
            COALESCE(MAX(husum.menages_servis), 0) AS menages_servis_uniques,
            COALESCE(MAX(husum.menages_partiels), 0) AS menages_partiels_uniques,
            COALESCE(MAX(dsum.occurrences), 0) AS occurrences_beneficiaires,
            COALESCE(MAX(husum.personnes_enregistrees), 0) AS personnes_enregistrees,
            COALESCE(MAX(dsum.personnes_assistees), 0) AS personnes_assistees_cumulees,
            COALESCE(MAX(esum.quantite_expediee), 0) AS quantite_expediee,
            COALESCE(MAX(esum.quantite_receptionnee), 0) AS quantite_receptionnee,
            COALESCE(MAX(qsum.quantite_distribuee), 0) AS quantite_distribuee,
            COALESCE(MAX(ssum.stock_disponible), 0) AS stock_disponible,
            COALESCE(MAX(csum.distributions_cloturees), 0) + COALESCE(MAX(osum.appro_clotures), 0) AS operations_cloturees,
            COALESCE(MAX(csum.distributions_attente), 0) + COALESCE(MAX(osum.appro_attente), 0) AS operations_en_attente,
            COALESCE(MAX(xsum.ecarts), 0) AS ecarts_non_resolus
          FROM provinces p
          LEFT JOIN dsum ON dsum.province_id = p.id LEFT JOIN husum ON husum.province_id = p.id
          LEFT JOIN asum ON asum.province_id = p.id
          LEFT JOIN esum ON esum.province_id = p.id LEFT JOIN qsum ON qsum.province_id = p.id
          LEFT JOIN ssum ON ssum.province_id = p.id LEFT JOIN csum ON csum.province_id = p.id
          LEFT JOIN osum ON osum.province_id = p.id LEFT JOIN xsum ON xsum.province_id = p.id
          WHERE (? IS NULL OR p.id = ?) GROUP BY p.id, p.nom ORDER BY p.nom COLLATE NOCASE`,
        valeurs: [
          ...d.valeurs, ...a.valeurs, filtres.province_id ?? null, filtres.province_id ?? null,
          ...e.valeurs, ...d.valeurs,
          filtres.partenaire_id ?? null, filtres.partenaire_id ?? null,
          filtres.province_id ?? null, filtres.province_id ?? null,
          filtres.nature_aide ?? null, filtres.nature_aide ?? null, filtres.nature_aide ?? null,
          ...d.valeurs, ...a.valeurs, filtres.province_id ?? null, filtres.province_id ?? null,
          ...rp.valeurs,
          filtres.province_id ?? null, filtres.province_id ?? null,
        ], ordre: "province COLLATE NOCASE",
      };
    case "RAPPORT_APPROVISIONNEMENTS_CENTRAUX":
      return {
        sql: `SELECT a.id, a.reference, a.intitule_operation AS intitule, a.date_creation,
          COALESCE(p.nom, 'Non renseigné') AS partenaire, a.nature_aide, a.statut,
          pdest.nom AS province,
          COALESCE((SELECT SUM(aa.quantite_allouee) FROM articles_approvisionnement aa WHERE aa.destination_id = dp.id), 0) AS quantite_allouee,
          COALESCE((SELECT SUM(le.quantite_expediee) FROM expeditions e2 INNER JOIN lignes_expedition le ON le.expedition_id = e2.id WHERE e2.destination_id = dp.id), 0) AS quantite_expediee,
          COALESCE((SELECT SUM(aa.quantite_receptionnee_acceptee) FROM articles_approvisionnement aa WHERE aa.destination_id = dp.id), 0) AS quantite_receptionnee
          FROM approvisionnements_centraux a LEFT JOIN partenaires p ON p.id = a.partenaire_id
          INNER JOIN destinations_approvisionnement dp ON dp.approvisionnement_id = a.id
          INNER JOIN provinces pdest ON pdest.id = dp.province_id
          WHERE ${a.sql} AND (? IS NULL OR dp.province_id = ?) ORDER BY a.date_creation DESC, dp.province_id, a.id DESC`,
        valeurs: [...a.valeurs, filtres.province_id ?? null, filtres.province_id ?? null], ordre: "date_creation DESC, province, id DESC",
      };
    case "RAPPORT_EXPEDITIONS":
      return {
        sql: `SELECT e.id, e.reference_expedition AS reference, a.reference AS reference_approvisionnement,
          p.nom AS province, e.date_expedition, e.origine_expedition AS origine,
          COALESCE(tp.nom, 'Non renseigné') AS transporteur, e.statut_expedition AS statut,
          (SELECT COUNT(*) FROM lignes_expedition le WHERE le.expedition_id = e.id) AS lignes,
          COALESCE((SELECT SUM(le.quantite_expediee) FROM lignes_expedition le WHERE le.expedition_id = e.id), 0) AS quantite_expediee,
          COALESCE((SELECT SUM(lr.quantite_acceptee) FROM lignes_reception_provinciale lr
            INNER JOIN lignes_expedition le ON le.id = lr.ligne_expedition_id WHERE le.expedition_id = e.id), 0) AS quantite_receptionnee
          FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
          INNER JOIN provinces p ON p.id = e.province_destinataire_id LEFT JOIN partenaires tp ON tp.id = e.transporteur_partenaire_id
          WHERE ${e.sql} ORDER BY e.date_expedition DESC, e.id DESC`,
        valeurs: e.valeurs, ordre: "date_expedition DESC, id DESC",
      };
    case "RAPPORT_RECEPTIONS_PROVINCIALES":
      return {
        sql: `WITH lignes AS (
            SELECT lr.reception_provinciale_id,
              SUM(lr.quantite_recue_physique) AS quantite_recue,
              SUM(lr.quantite_acceptee) AS quantite_acceptee,
              SUM(lr.quantite_endommagee) AS quantite_endommagee,
              SUM(lr.quantite_manquante) AS quantite_manquante
            FROM lignes_reception_provinciale lr GROUP BY lr.reception_provinciale_id
          )
          SELECT rp.id, rp.reference_reception_prov AS reference, e.reference_expedition AS expedition,
            p.nom AS province, w.nom AS entrepot, rp.date_reception, rp.numero_pv_reception AS numero_pv,
            rp.statut_rapprochement, COALESCE(l.quantite_recue, 0) AS quantite_recue,
            COALESCE(l.quantite_acceptee, 0) AS quantite_acceptee,
            COALESCE(l.quantite_endommagee, 0) AS quantite_endommagee, COALESCE(l.quantite_manquante, 0) AS quantite_manquante
          FROM receptions_provinciales rp INNER JOIN expeditions e ON e.id = rp.expedition_id
          INNER JOIN approvisionnements_centraux a ON a.id = rp.approvisionnement_id
          INNER JOIN provinces p ON p.id = rp.province_id INNER JOIN entrepots w ON w.id = rp.entrepot_recepteur_id
          LEFT JOIN lignes l ON l.reception_provinciale_id = rp.id
          WHERE ${rp.sql} ORDER BY rp.date_reception DESC, rp.id DESC`,
        valeurs: rp.valeurs, ordre: "date_reception DESC, id DESC",
      };
    case "ETAT_STOCKS":
      return {
        sql: `WITH lots AS (
            SELECT l.entrepot_id, l.article_id,
              SUM(l.quantite_physique) AS physique, SUM(l.quantite_reservee) AS reservee,
              SUM(CASE WHEN l.etat_qualite = 'BON' AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
                THEN l.quantite_physique - l.quantite_reservee ELSE 0 END) AS disponible_qualite,
              SUM(CASE WHEN ? IS NULL OR l.partenaire_bailleur_id = ? THEN l.quantite_physique - l.quantite_reservee ELSE 0 END) AS partenaire
            FROM lots_stock l GROUP BY l.entrepot_id, l.article_id
          )
          SELECT p.nom AS province, w.nom AS entrepot, ar.designation AS article, ca.libelle AS categorie,
            s.quantite_physique AS quantite_physique_solde, COALESCE(l.physique, 0) AS quantite_physique_lots,
            s.quantite_physique - COALESCE(l.physique, 0) AS ecart_physique,
            s.quantite_reservee AS quantite_reservee_solde, COALESCE(l.reservee, 0) AS quantite_reservee_lots,
            s.quantite_reservee - COALESCE(l.reservee, 0) AS ecart_reserve,
            s.quantite_disponible AS quantite_disponible_comptable, COALESCE(l.disponible_qualite, 0) AS quantite_disponible_qualite,
            COALESCE(l.partenaire, 0) AS quantite_lots_partenaire, s.entrepot_id, s.article_id
          FROM soldes_stock s INNER JOIN entrepots w ON w.id = s.entrepot_id
          INNER JOIN articles ar ON ar.id = s.article_id INNER JOIN categories_aide ca ON ca.id = ar.categorie_id
          LEFT JOIN provinces p ON p.id = s.province_id LEFT JOIN lots l ON l.entrepot_id = s.entrepot_id AND l.article_id = s.article_id
          WHERE (? IS NULL OR s.province_id = ?) AND (? IS NULL OR ca.code = ? OR ca.libelle = ?)
            AND (? IS NULL OR EXISTS (SELECT 1 FROM lots_stock lf WHERE lf.entrepot_id = s.entrepot_id
              AND lf.article_id = s.article_id AND lf.partenaire_bailleur_id = ?))
          ORDER BY p.nom, w.nom COLLATE NOCASE, ar.designation COLLATE NOCASE`,
        valeurs: [filtres.partenaire_id ?? null, filtres.partenaire_id ?? null,
          filtres.province_id ?? null, filtres.province_id ?? null,
          filtres.nature_aide ?? null, filtres.nature_aide ?? null, filtres.nature_aide ?? null,
          filtres.partenaire_id ?? null, filtres.partenaire_id ?? null],
        ordre: "province, entrepot COLLATE NOCASE, article COLLATE NOCASE",
      };
    case "RAPPORT_MOUVEMENTS_STOCK":
      return {
        sql: `SELECT m.id, m.reference_mouvement AS reference, m.cree_le AS date_mouvement,
          p.nom AS province, w.nom AS entrepot, ar.designation AS article, l.numero_lot,
          m.type_mouvement, m.sens, m.quantite, m.solde_physique_avant AS solde_avant,
          m.solde_physique_apres AS solde_apres, m.document_source_type || ' / ' || m.document_source_id AS document_source, m.motif
          FROM mouvements_stock m INNER JOIN articles ar ON ar.id = m.article_id
          INNER JOIN entrepots w ON w.id = m.entrepot_id LEFT JOIN provinces p ON p.id = m.province_id
          LEFT JOIN lots_stock l ON l.id = m.lot_stock_id WHERE ${m.sql}
          ORDER BY m.cree_le DESC, m.id DESC`,
        valeurs: m.valeurs, ordre: "date_mouvement DESC, id DESC",
      };
    case "RAPPORT_DISTRIBUTION":
      return {
        sql: `SELECT d.id, d.reference_distribution AS reference, d.intitule_distribution AS intitule,
          p.nom AS province, d.date_prevue, d.nature_aide,
          trim(COALESCE(pb.nom, '') || CASE WHEN pb.nom IS NOT NULL AND pe.nom IS NOT NULL THEN ' / ' ELSE '' END || COALESCE(pe.nom, '')) AS partenaires,
          d.statut, COUNT(DISTINCT md.menage_id) AS menages_cibles_uniques,
          COUNT(DISTINCT CASE WHEN md.statut_service = 'SERVI' THEN md.menage_id END) AS menages_servis_uniques,
          COUNT(DISTINCT CASE WHEN md.statut_service = 'PARTIELLEMENT_SERVI' THEN md.menage_id END) AS menages_partiels_uniques,
          SUM(CASE WHEN md.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN 1 ELSE 0 END) AS occurrences_beneficiaires,
          SUM(CASE WHEN md.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN COALESCE(mh.nombre_personnes, 0) ELSE 0 END) AS personnes_assistees_cumulees,
          COALESCE((SELECT SUM(lr.quantite_remise) FROM remises_distribution rd INNER JOIN lignes_remise lr ON lr.remise_id = rd.id WHERE rd.distribution_id = d.id), 0) AS quantite_distribuee
          FROM distributions_provinciales d INNER JOIN provinces p ON p.id = d.province_id
          LEFT JOIN partenaires pb ON pb.id = d.bailleur_fonds_id LEFT JOIN partenaires pe ON pe.id = d.partenaire_execution_id
          LEFT JOIN menages_distribution md ON md.distribution_id = d.id AND md.province_id = d.province_id
          LEFT JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
          WHERE ${d.sql} GROUP BY d.id, p.nom, pb.nom, pe.nom ORDER BY d.date_prevue DESC, d.id DESC`,
        valeurs: d.valeurs, ordre: "date_prevue DESC, id DESC",
      };
    case "LISTE_BENEFICIAIRES": {
      if (!filtres.distribution_id && (filtres.statut || filtres.nature_aide || filtres.partenaire_id)) {
        throw new ErreurRapport("Le statut, la nature d’aide ou le partenaire nécessitent une distribution sélectionnée.", 400);
      }
      const conditions = ["mh.statut = 'ACTIF'"];
      const valeurs: (string | number)[] = filtres.distribution_id ? [filtres.distribution_id] : [];
      if (filtres.province_id) { conditions.push("mh.province_id = ?"); valeurs.push(filtres.province_id); }
      if (filtres.distribution_id) ajouterPeriode(conditions, valeurs, "md.date_service", filtres.date_debut, filtres.date_fin);
      else ajouterPeriode(conditions, valeurs, "mh.date_enregistrement", filtres.date_debut, filtres.date_fin);
      if (filtres.statut) { conditions.push("md.statut_service = ?"); valeurs.push(filtres.statut); }
      if (filtres.localite_id) {
        conditions.push(`EXISTS (SELECT 1 FROM localites lf WHERE lf.id = mh.localite_id
          AND lf.province_id = mh.province_id AND lf.statut_validation = 'VALIDE' AND lf.id = ?)`);
        valeurs.push(filtres.localite_id);
      }
      if (filtres.nature_aide) { conditions.push("d.nature_aide = ?"); valeurs.push(filtres.nature_aide); }
      if (filtres.partenaire_id) {
        conditions.push("(d.bailleur_fonds_id = ? OR d.partenaire_execution_id = ?)");
        valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
      }
      const jointureDistribution = filtres.distribution_id
        ? `INNER JOIN menages_distribution md ON md.menage_id = mh.id AND md.province_id = mh.province_id AND md.distribution_id = ?
           INNER JOIN distributions_provinciales d ON d.id = md.distribution_id AND d.province_id = md.province_id`
        : "";
      return {
        sql: `SELECT mh.code_menage, p.nom AS province, mh.nom_chef_menage, mh.sexe_chef,
          mh.nombre_personnes, cp.libelle AS categorie_population,
          CASE WHEN loc.statut_validation = 'VALIDE' THEN loc.nom ELSE NULL END AS localite,
          ${filtres.distribution_id ? "md.statut_service, md.date_service" : "NULL AS statut_service, NULL AS date_service"}
          FROM menages mh INNER JOIN provinces p ON p.id = mh.province_id
          INNER JOIN categories_population cp ON cp.id = mh.categorie_population_id
          LEFT JOIN localites loc ON loc.id = mh.localite_id AND loc.province_id = mh.province_id
          ${jointureDistribution}
          WHERE ${conditions.join(" AND ")} ORDER BY mh.code_menage`,
        valeurs,
        ordre: "code_menage",
      };
    }
    case "LISTE_EMARGEMENT":
      if (!filtres.distribution_id) throw new ErreurRapport("Une distribution doit être sélectionnée pour la liste d’émargement.", 400);
      {
      const conditions = ["r.distribution_id = ?"];
      const valeurs: ValeurSql[] = [filtres.distribution_id];
      if (filtres.province_id) { conditions.push("r.province_id = ?"); valeurs.push(filtres.province_id); }
      ajouterPeriode(conditions, valeurs, "r.date_remise", filtres.date_debut, filtres.date_fin);
      if (filtres.nature_aide) { conditions.push("d.nature_aide = ?"); valeurs.push(filtres.nature_aide); }
      if (filtres.partenaire_id) {
        conditions.push("(d.bailleur_fonds_id = ? OR d.partenaire_execution_id = ?)");
        valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
      }
      if (filtres.localite_id) { conditions.push("mh.localite_id = ?"); valeurs.push(filtres.localite_id); }
      return {
        sql: `SELECT r.reference_remise, r.date_remise, mh.code_menage, p.nom AS province,
          r.identite_recepteur, COALESCE(r.emargement_reference, 'Non renseignée') AS emargement_reference,
          COALESCE((SELECT GROUP_CONCAT(ar.designation || ' : ' || CAST(lr.quantite_remise AS TEXT), ' ; ')
            FROM lignes_remise lr INNER JOIN articles ar ON ar.id = lr.article_id WHERE lr.remise_id = r.id), 'Aucun article') AS articles_remis,
          u.nom_complet AS agent
          FROM remises_distribution r INNER JOIN menages mh ON mh.id = r.menage_id AND mh.province_id = r.province_id
          INNER JOIN provinces p ON p.id = r.province_id INNER JOIN utilisateurs u ON u.id = r.agent_distributeur_id
          INNER JOIN distributions_provinciales d ON d.id = r.distribution_id AND d.province_id = r.province_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY r.date_remise, r.reference_remise`,
        valeurs,
        ordre: "date_remise, reference_remise",
      };
      }
    case "PROCES_VERBAL_DISTRIBUTION":
      if (!filtres.distribution_id) throw new ErreurRapport("Une distribution clôturée doit être sélectionnée pour produire son procès-verbal.", 400);
      return {
        sql: `SELECT d.reference_distribution AS reference, d.intitule_distribution AS intitule, p.nom AS province,
          c.date_cloture, u.nom_complet AS cloture_par, c.total_menages_cibles AS menages_cibles,
          c.total_menages_servis AS menages_servis, c.total_menages_partiels AS menages_partiels,
          c.total_menages_absents AS menages_absents, c.total_menages_non_servis AS menages_non_servis,
          c.bilan_articles_json AS bilan_articles, COALESCE(c.observations_finales, '') AS observations_finales
          FROM clotures_distribution c INNER JOIN distributions_provinciales d ON d.id = c.distribution_id
          INNER JOIN provinces p ON p.id = c.province_id INNER JOIN utilisateurs u ON u.id = c.cloture_par
          WHERE c.distribution_id = ? AND (? IS NULL OR c.province_id = ?)`,
        valeurs: [filtres.distribution_id, filtres.province_id ?? null, filtres.province_id ?? null],
        ordre: "date_cloture DESC",
      };
    case "RAPPORT_ECARTS":
      return {
        sql: `SELECT rp.reference_reception_prov AS reference_reception, e.reference_expedition AS expedition,
          p.nom AS province, rp.date_reception, ar.designation AS article,
          lr.quantite_expediee, lr.quantite_recue_physique AS quantite_recue,
          lr.quantite_acceptee, lr.quantite_endommagee, lr.quantite_manquante,
          rp.statut_rapprochement, COALESCE(lr.justification_ecart, '') AS justification
          FROM lignes_reception_provinciale lr INNER JOIN receptions_provinciales rp ON rp.id = lr.reception_provinciale_id
          INNER JOIN expeditions e ON e.id = rp.expedition_id INNER JOIN approvisionnements_centraux a ON a.id = rp.approvisionnement_id
          INNER JOIN provinces p ON p.id = rp.province_id INNER JOIN articles ar ON ar.id = lr.article_id
          WHERE ${rp.sql} AND (lr.quantite_endommagee > 0 OR lr.quantite_manquante > 0 OR lr.quantite_recue_physique <> lr.quantite_expediee)
          ORDER BY rp.date_reception DESC, rp.id DESC, lr.id`,
        valeurs: rp.valeurs, ordre: "date_reception DESC, reference_reception, article",
      };
    case "RAPPORT_CLOTURE":
      {
      const conditions = ["1 = 1"];
      const valeurs: ValeurSql[] = [];
      if (filtres.province_id) { conditions.push("c.province_id = ?"); valeurs.push(filtres.province_id); }
      ajouterPeriode(conditions, valeurs, "c.date_cloture", filtres.date_debut, filtres.date_fin);
      if (filtres.distribution_id) { conditions.push("d.id = ?"); valeurs.push(filtres.distribution_id); }
      if (filtres.partenaire_id) {
        conditions.push("(d.bailleur_fonds_id = ? OR d.partenaire_execution_id = ?)");
        valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
      }
      if (filtres.nature_aide) { conditions.push("d.nature_aide = ?"); valeurs.push(filtres.nature_aide); }
      if (filtres.statut) { conditions.push("d.statut = ?"); valeurs.push(filtres.statut); }
      if (filtres.localite_id) {
        conditions.push("EXISTS (SELECT 1 FROM zones_distribution z WHERE z.distribution_id = d.id AND z.localite_id = ? AND z.province_id = d.province_id)");
        valeurs.push(filtres.localite_id);
      }
      return {
        sql: `SELECT c.id, d.reference_distribution AS reference, d.intitule_distribution AS intitule,
          p.nom AS province, c.date_cloture, u.nom_complet AS cloture_par,
          c.total_menages_cibles AS menages_cibles, c.total_menages_servis AS menages_servis,
          c.total_menages_partiels AS menages_partiels, c.total_menages_absents AS menages_absents,
          c.total_menages_non_servis AS menages_non_servis, COALESCE(c.observations_finales, '') AS observations_finales
          FROM clotures_distribution c INNER JOIN distributions_provinciales d ON d.id = c.distribution_id
          INNER JOIN provinces p ON p.id = c.province_id INNER JOIN utilisateurs u ON u.id = c.cloture_par
          WHERE ${conditions.join(" AND ")}
          ORDER BY c.date_cloture DESC, c.id DESC`,
        valeurs,
        ordre: "date_cloture DESC, id DESC",
      };
      }
    case "RAPPORT_PARTENAIRE":
      return {
        sql: `SELECT p.nom AS partenaire, p.type_organisation,
          (SELECT COUNT(DISTINCT a.id) FROM approvisionnements_centraux a WHERE a.partenaire_id = p.id
            AND (? IS NULL OR a.date_creation >= ?) AND (? IS NULL OR a.date_creation < date(?, '+1 day'))
            AND (? IS NULL OR a.statut = ?) AND (? IS NULL OR EXISTS (SELECT 1 FROM destinations_approvisionnement dp WHERE dp.approvisionnement_id = a.id AND dp.province_id = ?))
            AND (? IS NULL OR a.nature_aide = ?)) AS approvisionnements,
          (SELECT COUNT(DISTINCT d.id) FROM distributions_provinciales d WHERE (d.bailleur_fonds_id = p.id OR d.partenaire_execution_id = p.id)
            AND (? IS NULL OR d.date_prevue >= ?) AND (? IS NULL OR d.date_prevue < date(?, '+1 day'))
            AND (? IS NULL OR d.statut = ?) AND (? IS NULL OR d.province_id = ?) AND (? IS NULL OR d.nature_aide = ?)) AS distributions,
          (SELECT COUNT(DISTINCT e.id) FROM expeditions e LEFT JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
            WHERE (e.transporteur_partenaire_id = p.id OR a.partenaire_id = p.id)
              AND (? IS NULL OR e.date_expedition >= ?) AND (? IS NULL OR e.date_expedition < date(?, '+1 day'))
              AND (? IS NULL OR e.statut_expedition = ?) AND (? IS NULL OR e.province_destinataire_id = ?) AND (? IS NULL OR a.nature_aide = ?)) AS expeditions,
          COALESCE((SELECT SUM(le.quantite_expediee) FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
            INNER JOIN lignes_expedition le ON le.expedition_id = e.id WHERE (e.transporteur_partenaire_id = p.id OR a.partenaire_id = p.id)
              AND (? IS NULL OR e.date_expedition >= ?) AND (? IS NULL OR e.date_expedition < date(?, '+1 day'))
              AND (? IS NULL OR e.statut_expedition = ?) AND (? IS NULL OR e.province_destinataire_id = ?) AND (? IS NULL OR a.nature_aide = ?)), 0) AS quantite_expediee,
          COALESCE((SELECT SUM(lr.quantite_acceptee) FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id
            INNER JOIN lignes_expedition le ON le.expedition_id = e.id INNER JOIN lignes_reception_provinciale lr ON lr.ligne_expedition_id = le.id
            WHERE (e.transporteur_partenaire_id = p.id OR a.partenaire_id = p.id)
              AND (? IS NULL OR e.date_expedition >= ?) AND (? IS NULL OR e.date_expedition < date(?, '+1 day'))
              AND (? IS NULL OR e.statut_expedition = ?) AND (? IS NULL OR e.province_destinataire_id = ?) AND (? IS NULL OR a.nature_aide = ?)), 0) AS quantite_receptionnee,
          COALESCE((SELECT SUM(lr.quantite_remise) FROM distributions_provinciales d INNER JOIN remises_distribution rd ON rd.distribution_id = d.id
            INNER JOIN lignes_remise lr ON lr.remise_id = rd.id WHERE (d.bailleur_fonds_id = p.id OR d.partenaire_execution_id = p.id)
              AND (? IS NULL OR d.date_prevue >= ?) AND (? IS NULL OR d.date_prevue < date(?, '+1 day'))
              AND (? IS NULL OR d.statut = ?) AND (? IS NULL OR d.province_id = ?) AND (? IS NULL OR d.nature_aide = ?)), 0) AS quantite_distribuee
          FROM partenaires p WHERE p.statut_validation = 'VALIDE' AND (? IS NULL OR p.id = ?)
          ORDER BY p.nom COLLATE NOCASE`,
        valeurs: [
          ...Array.from({ length: 6 }, () => [
            filtres.date_debut ?? null, filtres.date_debut ?? null,
            filtres.date_fin ?? null, filtres.date_fin ?? null,
            filtres.statut ?? null, filtres.statut ?? null,
            filtres.province_id ?? null, filtres.province_id ?? null,
            filtres.nature_aide ?? null, filtres.nature_aide ?? null,
          ]).flat(),
          filtres.partenaire_id ?? null, filtres.partenaire_id ?? null,
        ], ordre: "partenaire COLLATE NOCASE",
      };
    case "RAPPORT_COUVERTURE_GEOGRAPHIQUE":
      return {
        sql: `SELECT p.nom AS province, COALESCE(loc.nom, 'Localité non renseignée ou non validée') AS localite,
          COUNT(DISTINCT d.id) AS distributions, COUNT(DISTINCT md.menage_id) AS menages_cibles_uniques,
          COUNT(DISTINCT CASE WHEN md.statut_service = 'SERVI' THEN md.menage_id END) AS menages_servis_uniques,
          COUNT(DISTINCT CASE WHEN md.statut_service = 'PARTIELLEMENT_SERVI' THEN md.menage_id END) AS menages_partiels_uniques,
          SUM(CASE WHEN md.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN 1 ELSE 0 END) AS occurrences_beneficiaires
          FROM distributions_provinciales d INNER JOIN provinces p ON p.id = d.province_id
          LEFT JOIN menages_distribution md ON md.distribution_id = d.id AND md.province_id = d.province_id
          LEFT JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
          LEFT JOIN localites loc ON loc.id = mh.localite_id AND loc.province_id = mh.province_id AND loc.statut_validation = 'VALIDE'
          WHERE ${d.sql} GROUP BY p.id, p.nom, loc.id, loc.nom ORDER BY p.nom COLLATE NOCASE, localite COLLATE NOCASE`,
        valeurs: d.valeurs, ordre: "province COLLATE NOCASE, localite COLLATE NOCASE",
      };
  }
}

function compterLignes(resultats: D1Result<unknown>[]): { lignes_lues: number; duree_requetes_ms: number } {
  return resultats.reduce((somme, resultat) => ({
    lignes_lues: somme.lignes_lues + (resultat.meta.rows_read ?? 0),
    duree_requetes_ms: somme.duree_requetes_ms + (resultat.meta.duration ?? 0),
  }), { lignes_lues: 0, duree_requetes_ms: 0 });
}

function normaliserLigne(ligne: Record<string, unknown>): LigneRapport {
  return Object.fromEntries(Object.entries(ligne).map(([cle, valeur]) => [
    cle,
    typeof valeur === "string" || typeof valeur === "number" || valeur === null ? valeur : String(valeur),
  ]));
}

export async function lireApercuRapport(
  db: D1Database,
  type: TypeRapport,
  utilisateur: UtilisateurSession,
  filtresSaisis: FiltresRapportPagine,
): Promise<ResultatApercuRapport> {
  const filtres = appliquerPerimetreUtilisateur(utilisateur, filtresSaisis);
  const definition = lireDefinitionRapport(type);
  if (definition.identifiantOperationRequis && !filtres.distribution_id) {
    throw new ErreurRapport("Sélectionnez une distribution avant d’afficher ce rapport.", 400);
  }
  const requete = construireSqlRapport(type, filtres);
  const resultat = await db.prepare(
    `SELECT * FROM (${requete.sql}) AS lignes_rapport ORDER BY ${requete.ordre} LIMIT ? OFFSET ?`,
  ).bind(...requete.valeurs, filtresSaisis.limite + 1, filtresSaisis.decalage).all<Record<string, unknown>>();
  const suiteDisponible = resultat.results.length > filtresSaisis.limite;
  return {
    definition,
    elements: resultat.results.slice(0, filtresSaisis.limite).map((ligne) => {
      const colonnes: Record<string, unknown> = {};
      for (const colonne of definition.colonnes) colonnes[colonne.cle] = ligne[colonne.cle] ?? null;
      return normaliserLigne(colonnes);
    }),
    limite: filtresSaisis.limite,
    decalage: filtresSaisis.decalage,
    suite_disponible: suiteDisponible,
    lignes_lues: resultat.meta.rows_read ?? 0,
    duree_requetes_ms: resultat.meta.duration ?? 0,
  };
}

function nombre(ligne: Record<string, unknown>, cle: string): number {
  const valeur = ligne[cle];
  return typeof valeur === "number" ? valeur : Number(valeur ?? 0);
}

function texte(ligne: Record<string, unknown>, cle: string): string | null {
  const valeur = ligne[cle];
  return typeof valeur === "string" ? valeur : null;
}

export async function lireTableauDeBordRapports(
  db: D1Database,
  utilisateur: UtilisateurSession,
  filtresSaisis: FiltresRapport,
): Promise<TableauDeBordRapports> {
  const filtres = appliquerPerimetreUtilisateur(utilisateur, filtresSaisis);
  const d = ajouterFiltresDistribution(filtres);
  const a = ajouterFiltresApprovisionnement(filtres);
  const e = ajouterFiltresExpedition(filtres);
  const rp = ajouterFiltresReception(filtres);
  const requetes = [
    db.prepare(`WITH ds AS (
        SELECT d.id, d.province_id, d.statut FROM distributions_provinciales d WHERE ${d.sql}
      ), mo AS (
        SELECT md.distribution_id, md.menage_id, md.statut_service, mh.nombre_personnes
        FROM menages_distribution md INNER JOIN ds ON ds.id = md.distribution_id
        INNER JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
      ), mu AS (
        SELECT menage_id, MAX(nombre_personnes) AS personnes,
          MAX(CASE WHEN statut_service = 'SERVI' THEN 1 ELSE 0 END) AS servi,
          MAX(CASE WHEN statut_service = 'PARTIELLEMENT_SERVI' THEN 1 ELSE 0 END) AS partiel
        FROM mo GROUP BY menage_id
      ), aps AS (SELECT a.id, a.statut FROM approvisionnements_centraux a WHERE ${a.sql}),
      exs AS (SELECT e.id FROM expeditions e INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id WHERE ${e.sql}),
      rps AS (SELECT rp.id, rp.statut_rapprochement FROM receptions_provinciales rp
        INNER JOIN expeditions e ON e.id = rp.expedition_id INNER JOIN approvisionnements_centraux a ON a.id = rp.approvisionnement_id WHERE ${rp.sql})
      SELECT
        (SELECT COUNT(*) FROM aps) AS approvisionnements,
        (SELECT COUNT(*) FROM ds) AS distributions,
        (SELECT COUNT(DISTINCT menage_id) FROM mo) AS menages_cibles_uniques,
        (SELECT COUNT(*) FROM mu WHERE servi = 1) AS menages_servis_uniques,
        (SELECT COUNT(*) FROM mu WHERE servi = 0 AND partiel = 1) AS menages_partiellement_servis_uniques,
        (SELECT COUNT(*) FROM mo WHERE statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI')) AS occurrences_beneficiaires,
        (SELECT COALESCE(SUM(personnes), 0) FROM mu) AS personnes_enregistrees_menages_cibles,
        (SELECT COALESCE(SUM(personnes), 0) FROM mu WHERE servi = 1 OR partiel = 1) AS personnes_assistees_menages_uniques,
        (SELECT COALESCE(SUM(nombre_personnes), 0) FROM mo WHERE statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI')) AS personnes_assistees_cumulees,
        (SELECT COALESCE(SUM(le.quantite_expediee), 0) FROM lignes_expedition le INNER JOIN expeditions e ON e.id = le.expedition_id
          INNER JOIN approvisionnements_centraux a ON a.id = e.approvisionnement_id WHERE e.id IN (SELECT id FROM exs)) AS quantite_expediee,
        (SELECT COALESCE(SUM(lr.quantite_acceptee), 0) FROM lignes_reception_provinciale lr
          INNER JOIN receptions_provinciales rp ON rp.id = lr.reception_provinciale_id WHERE rp.id IN (SELECT id FROM rps)) AS quantite_receptionnee,
        (SELECT COALESCE(SUM(lr.quantite_remise), 0) FROM remises_distribution rd INNER JOIN lignes_remise lr ON lr.remise_id = rd.id
          WHERE rd.distribution_id IN (SELECT id FROM ds)) AS quantite_distribuee,
        (SELECT COALESCE(SUM(COALESCE((
            SELECT SUM(lp.quantite_physique - lp.quantite_reservee) FROM lots_stock lp
            WHERE lp.entrepot_id = s.entrepot_id AND lp.article_id = s.article_id
              AND lp.etat_qualite = 'BON' AND (lp.date_peremption IS NULL OR lp.date_peremption >= date('now'))
              AND (? IS NULL OR lp.partenaire_bailleur_id = ?)
          ), 0)), 0) FROM soldes_stock s INNER JOIN entrepots w ON w.id = s.entrepot_id
          INNER JOIN articles ar ON ar.id = s.article_id INNER JOIN categories_aide ca ON ca.id = ar.categorie_id
          WHERE (? IS NULL OR s.province_id = ?) AND (? IS NULL OR ca.code = ? OR ca.libelle = ?)) AS stock_disponible_comptable,
        (SELECT COUNT(*) FROM ds WHERE statut = 'CLOTUREE_CENTRAL') + (SELECT COUNT(*) FROM aps WHERE statut = 'CLOTUREE') AS operations_cloturees,
        (SELECT COUNT(*) FROM ds WHERE statut <> 'CLOTUREE_CENTRAL') + (SELECT COUNT(*) FROM aps WHERE statut <> 'CLOTUREE') AS operations_en_attente,
        (SELECT COUNT(*) FROM rps WHERE statut_rapprochement = 'ECART_OUVERT') AS ecarts_non_resolus`)
      .bind(...d.valeurs, ...a.valeurs, ...e.valeurs, ...rp.valeurs,
        filtres.partenaire_id ?? null, filtres.partenaire_id ?? null,
        filtres.province_id ?? null, filtres.province_id ?? null,
        filtres.nature_aide ?? null, filtres.nature_aide ?? null, filtres.nature_aide ?? null,
      ),
    db.prepare(`SELECT strftime('%Y-%m', d.date_prevue) AS mois,
        COUNT(DISTINCT d.id) AS distributions, COUNT(DISTINCT md.menage_id) AS menages_uniques,
        SUM(CASE WHEN md.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN 1 ELSE 0 END) AS occurrences_beneficiaires,
        SUM(CASE WHEN md.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN COALESCE(mh.nombre_personnes, 0) ELSE 0 END) AS personnes_assistees_cumulees
      FROM distributions_provinciales d LEFT JOIN menages_distribution md ON md.distribution_id = d.id AND md.province_id = d.province_id
      LEFT JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
      WHERE ${d.sql} GROUP BY strftime('%Y-%m', d.date_prevue) ORDER BY mois DESC LIMIT 12`).bind(...d.valeurs),
    db.prepare(`WITH ds AS (
        SELECT d.id, d.province_id FROM distributions_provinciales d WHERE ${d.sql}
      ), mo AS (
        SELECT ds.id AS distribution_id, ds.province_id, md.menage_id, md.statut_service, mh.nombre_personnes
        FROM ds LEFT JOIN menages_distribution md ON md.distribution_id = ds.id AND md.province_id = ds.province_id
        LEFT JOIN menages mh ON mh.id = md.menage_id AND mh.province_id = md.province_id
      ), operations AS (
        SELECT province_id, COUNT(DISTINCT distribution_id) AS distributions,
          COUNT(DISTINCT menage_id) AS menages_uniques,
          SUM(CASE WHEN statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI') THEN COALESCE(nombre_personnes, 0) ELSE 0 END) AS personnes_assistees_cumulees
        FROM mo GROUP BY province_id
      ), menages_uniques AS (
        SELECT province_id, menage_id, MAX(nombre_personnes) AS personnes,
          MAX(CASE WHEN statut_service = 'SERVI' THEN 1 ELSE 0 END) AS servi,
          MAX(CASE WHEN statut_service = 'PARTIELLEMENT_SERVI' THEN 1 ELSE 0 END) AS partiel
        FROM mo WHERE menage_id IS NOT NULL GROUP BY province_id, menage_id
      ), menages_agreges AS (
        SELECT province_id, COUNT(*) AS menages_uniques,
          SUM(CASE WHEN servi = 1 THEN 1 ELSE 0 END) AS menages_servis,
          SUM(CASE WHEN servi = 0 AND partiel = 1 THEN 1 ELSE 0 END) AS menages_partiels,
          SUM(CASE WHEN servi = 1 OR partiel = 1 THEN personnes ELSE 0 END) AS personnes_assistees
        FROM menages_uniques GROUP BY province_id
      )
      SELECT p.id AS province_id, p.nom AS province,
        COALESCE(o.distributions, 0) AS distributions, COALESCE(ma.menages_uniques, 0) AS menages_uniques,
        COALESCE(ma.menages_servis, 0) AS menages_servis, COALESCE(ma.menages_partiels, 0) AS menages_partiels,
        COALESCE(ma.personnes_assistees, 0) AS personnes_assistees
      FROM provinces p LEFT JOIN operations o ON o.province_id = p.id
      LEFT JOIN menages_agreges ma ON ma.province_id = p.id
      WHERE (? IS NULL OR p.id = ?) ORDER BY distributions DESC, menages_uniques DESC, p.nom COLLATE NOCASE LIMIT 100`)
      .bind(...d.valeurs, filtres.province_id ?? null, filtres.province_id ?? null),
  ];
  const resultats = await db.batch<Record<string, unknown>>(requetes);
  const meta = compterLignes(resultats);
  const valeurs = resultats[0]?.results[0] ?? {};
  const indicateurs: IndicateursRapport = {
    approvisionnements: nombre(valeurs, "approvisionnements"),
    distributions: nombre(valeurs, "distributions"),
    menages_cibles_uniques: nombre(valeurs, "menages_cibles_uniques"),
    menages_servis_uniques: nombre(valeurs, "menages_servis_uniques"),
    menages_partiellement_servis_uniques: nombre(valeurs, "menages_partiellement_servis_uniques"),
    occurrences_beneficiaires: nombre(valeurs, "occurrences_beneficiaires"),
    personnes_enregistrees_menages_cibles: nombre(valeurs, "personnes_enregistrees_menages_cibles"),
    personnes_assistees_menages_uniques: nombre(valeurs, "personnes_assistees_menages_uniques"),
    personnes_assistees_cumulees: nombre(valeurs, "personnes_assistees_cumulees"),
    quantite_expediee: nombre(valeurs, "quantite_expediee"),
    quantite_receptionnee: nombre(valeurs, "quantite_receptionnee"),
    quantite_distribuee: nombre(valeurs, "quantite_distribuee"),
    stock_disponible_comptable: nombre(valeurs, "stock_disponible_comptable"),
    operations_cloturees: nombre(valeurs, "operations_cloturees"),
    operations_en_attente: nombre(valeurs, "operations_en_attente"),
    ecarts_non_resolus: nombre(valeurs, "ecarts_non_resolus"),
  };
  const evolutionMensuelle = (resultats[1]?.results ?? []).map((ligne) => ({
    mois: texte(ligne, "mois") ?? "",
    distributions: nombre(ligne, "distributions"),
    menages_uniques: nombre(ligne, "menages_uniques"),
    occurrences_beneficiaires: nombre(ligne, "occurrences_beneficiaires"),
    personnes_assistees_cumulees: nombre(ligne, "personnes_assistees_cumulees"),
  }));
  const provinces = (resultats[2]?.results ?? []).map((ligne) => ({
    province_id: texte(ligne, "province_id") ?? "",
    province: texte(ligne, "province") ?? "",
    distributions: nombre(ligne, "distributions"),
    menages_uniques: nombre(ligne, "menages_uniques"),
    menages_servis: nombre(ligne, "menages_servis"),
    menages_partiels: nombre(ligne, "menages_partiels"),
    personnes_assistees: nombre(ligne, "personnes_assistees"),
  }));
  return {
    perimetre: utilisateur.role === "DELEGUE_PROVINCIAL" || filtres.province_id ? "PROVINCIAL" : "NATIONAL",
    province_id: filtres.province_id ?? null,
    periode: { date_debut: filtres.date_debut ?? null, date_fin: filtres.date_fin ?? null },
    indicateurs, evolution_mensuelle: evolutionMensuelle, provinces, ressources_d1: meta,
  };
}

export async function obtenirContexteRapport(
  db: D1Database,
  utilisateur: UtilisateurSession,
  filtres: FiltresRapport,
): Promise<ResultatExportRapport["contexte"]> {
  const provinceId = filtres.province_id ?? (utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null);
  if (!provinceId) return { province_id: null, province_nom: null, perimetre: "NATIONAL" };
  const province = await db.prepare("SELECT nom FROM provinces WHERE id = ? AND actif = 1")
    .bind(provinceId).first<{ nom: string }>();
  if (!province) throw new ErreurRapport("La province demandée n’est pas disponible dans le référentiel actif.", 404);
  return { province_id: provinceId, province_nom: province.nom, perimetre: "PROVINCIAL" };
}

export async function preparerExportRapport(
  db: D1Database,
  type: TypeRapport,
  utilisateur: UtilisateurSession,
  filtresSaisis: FiltresRapport,
): Promise<ResultatExportRapport> {
  const filtres = appliquerPerimetreUtilisateur(utilisateur, filtresSaisis);
  const definition = lireDefinitionRapport(type);
  if (definition.identifiantOperationRequis && !filtres.distribution_id) {
    throw new ErreurRapport("Sélectionnez une distribution avant de produire ce rapport.", 400);
  }
  const requete = construireSqlRapport(type, filtres);
  const resultat = await db.prepare(
    `SELECT * FROM (${requete.sql}) AS lignes_rapport ORDER BY ${requete.ordre} LIMIT ? OFFSET 0`,
  ).bind(...requete.valeurs, MAX_EXPORT + 1).all<Record<string, unknown>>();
  const tronque = resultat.results.length > MAX_EXPORT;
  const elements = resultat.results.slice(0, MAX_EXPORT).map((ligne) => {
    const colonnes: Record<string, unknown> = {};
    for (const colonne of definition.colonnes) colonnes[colonne.cle] = ligne[colonne.cle] ?? null;
    return normaliserLigne(colonnes);
  });
  const contexte = await obtenirContexteRapport(db, utilisateur, filtres);
  return {
    definition, elements, lignes_totales_estimees: tronque ? MAX_EXPORT + 1 : elements.length,
    export_tronque: tronque, contexte, filtres, lignes_lues: resultat.meta.rows_read ?? 0,
    duree_requetes_ms: resultat.meta.duration ?? 0,
  };
}

export async function listerFiltresRapports(db: D1Database, utilisateur: UtilisateurSession) {
  const provinceSession = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !provinceSession) {
    throw new ErreurRapport("Le compte provincial n’a pas de province active.", 403);
  }
  const [provinces, partenaires, natures, localites, distributions] = await Promise.all([
    utilisateur.role === "DELEGUE_PROVINCIAL"
      ? db.prepare("SELECT id, nom FROM provinces WHERE id = ? AND actif = 1 ORDER BY nom LIMIT 23").bind(provinceSession).all<{ id: string; nom: string }>()
      : db.prepare("SELECT id, nom FROM provinces WHERE actif = 1 ORDER BY nom LIMIT 23").all<{ id: string; nom: string }>(),
    db.prepare(`SELECT id, nom FROM partenaires WHERE statut_validation = 'VALIDE' ORDER BY nom COLLATE NOCASE, id LIMIT 100`)
      .all<{ id: string; nom: string }>(),
    db.prepare(`SELECT nature_aide AS valeur FROM (
        SELECT d.nature_aide FROM distributions_provinciales d WHERE (? IS NULL OR d.province_id = ?)
        UNION SELECT a.nature_aide FROM approvisionnements_centraux a
          WHERE (? IS NULL OR EXISTS (SELECT 1 FROM destinations_approvisionnement dp
            WHERE dp.approvisionnement_id = a.id AND dp.province_id = ?))
      ) ORDER BY valeur COLLATE NOCASE LIMIT 100`)
      .bind(provinceSession, provinceSession, provinceSession, provinceSession).all<{ valeur: string }>(),
    db.prepare(`SELECT id, nom FROM localites WHERE statut_validation = 'VALIDE'
        AND (? IS NULL OR province_id = ?) ORDER BY nom COLLATE NOCASE, id LIMIT 100`)
      .bind(provinceSession, provinceSession)
      .all<{ id: string; nom: string }>(),
    utilisateur.role === "DELEGUE_PROVINCIAL"
      ? db.prepare(`SELECT id, reference_distribution AS reference, intitule_distribution AS intitule, date_prevue
          FROM distributions_provinciales WHERE province_id = ? ORDER BY date_prevue DESC, id DESC LIMIT 100`)
        .bind(provinceSession).all<{ id: string; reference: string; intitule: string; date_prevue: string }>()
      : db.prepare(`SELECT id, reference_distribution AS reference, intitule_distribution AS intitule, date_prevue
          FROM distributions_provinciales ORDER BY date_prevue DESC, id DESC LIMIT 100`)
        .all<{ id: string; reference: string; intitule: string; date_prevue: string }>(),
  ]);
  return {
    provinces: provinces.results,
    partenaires: partenaires.results,
    natures_aide: natures.results.map((ligne) => ligne.valeur),
    localites: localites.results,
    distributions: distributions.results,
    statuts: ["BROUILLON", "VALIDEE", "EN_EXPEDITION", "PARTIELLEMENT_RECEPTIONNEE", "RECEPTIONNEE", "EN_RAPPROCHEMENT", "CLOTUREE", "EN_PREPARATION", "VALIDEE_PROVINCE", "EN_EXECUTION", "TERMINEE_PROVINCE", "CLOTUREE_CENTRAL", "EN_ROUTE", "RECEPTIONNEE_AVEC_ECART", "ECART_OUVERT"],
  };
}

export async function listeRapportsGeneres(
  db: D1Database,
  utilisateur: UtilisateurSession,
  options: { limite: number; decalage: number; type_rapport?: TypeRapport },
) {
  const conditions = ["1 = 1"];
  const valeurs: ValeurSql[] = [];
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id) throw new ErreurRapport("Le compte provincial n’a pas de province active.", 403);
    conditions.push("province_id = ?"); valeurs.push(utilisateur.province_id);
  }
  if (options.type_rapport) { conditions.push("type_rapport = ?"); valeurs.push(options.type_rapport); }
  const resultat = await db.prepare(`SELECT id, type_rapport, intitule, perimetre, province_id, filtres_appliques_json,
      format_export, (cle_r2_archive IS NOT NULL) AS archive_disponible, genere_par, cree_le
    FROM rapports_generes WHERE ${conditions.join(" AND ")} ORDER BY cree_le DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...valeurs, options.limite + 1, options.decalage).all<Record<string, unknown>>();
  const suite = resultat.results.length > options.limite;
  return { elements: resultat.results.slice(0, options.limite), limite: options.limite,
    decalage: options.decalage, suite_disponible: suite, lignes_lues: resultat.meta.rows_read ?? 0,
    duree_requete_ms: resultat.meta.duration ?? 0 };
}

export async function lireRapportArchive(
  db: D1Database,
  utilisateur: UtilisateurSession,
  rapportId: string,
) {
  const scopeProvince = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !scopeProvince) throw new ErreurRapport("Le compte provincial n’a pas de province active.", 403);
  const rapport = await db.prepare(`SELECT id, type_rapport, intitule, perimetre, province_id, filtres_appliques_json,
      format_export, cle_r2_archive, genere_par, cree_le
    FROM rapports_generes WHERE id = ? AND cle_r2_archive IS NOT NULL
      AND (? IS NULL OR province_id = ?)`)
    .bind(rapportId, scopeProvince, scopeProvince).first<Record<string, unknown>>();
  if (!rapport) throw new ErreurRapport("Le rapport archivé est introuvable dans votre périmètre.", 404);
  return rapport;
}

export async function verifierReferencesArchives(
  db: D1Database,
  cles: string[],
): Promise<Set<string>> {
  if (cles.length === 0) return new Set();
  const placeholders = cles.map(() => "?").join(", ");
  const resultat = await db.prepare(`SELECT cle_r2_archive FROM rapports_generes WHERE cle_r2_archive IN (${placeholders})`)
    .bind(...cles).all<{ cle_r2_archive: string }>();
  return new Set(resultat.results.map((ligne) => ligne.cle_r2_archive));
}
