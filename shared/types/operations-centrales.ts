export const STATUTS_OPERATION_CENTRALE = [
  "BROUILLON",
  "SOUMISE_A_APPROBATION",
  "APPROUVEE",
  "OUVERTE",
  "EN_COURS",
  "EN_CONSOLIDATION",
  "CLOTUREE",
  "ANNULEE",
] as const;

export type StatutOperationCentrale = (typeof STATUTS_OPERATION_CENTRALE)[number];

export const TYPES_INTERVENTION = [
  "DISTRIBUTION_GRATUITE_VIVRES",
  "ASSISTANCE_DOULEUR_CATASTROPHE",
  "NFI_URGENCE",
  "MIXTE",
  "AUTRE",
] as const;

export type TypeIntervention = (typeof TYPES_INTERVENTION)[number];

export const SOURCES_VIVRES = [
  "ONASA",
  "PARTENAIRE",
  "STOCK_EXISTANT",
  "ACHAT_PUBLIC",
  "DON_EXTERNE",
  "MIXTE",
] as const;

export type SourceVivres = (typeof SOURCES_VIVRES)[number];

export const STATUTS_DOSSIER_EXECUTION = [
  "ASSIGNE",
  "EN_PREPARATION",
  "EN_DISTRIBUTION",
  "TERMINE",
  "RAPPORT_TRANSMIS",
  "VALIDE_CENTRAL",
] as const;

export type StatutDossierExecution = (typeof STATUTS_DOSSIER_EXECUTION)[number];

export const TYPES_APPROBATION = [
  "COMITE_PILOTAGE",
  "APPROBATION_COMITE_PILOTAGE",
  "VALIDATION_MINISTERIELLE",
  "AUTORISATION_OUVERTURE",
  "AUTORISATION_SPECIALISEE",
  "REFERENCE_CADRE_REGLEMENTAIRE",
] as const;

export type TypeApprobation = (typeof TYPES_APPROBATION)[number];

export const DECISIONS_APPROBATION = [
  "APPROUVE",
  "APPROUVE_AVEC_RESERVES",
  "REJETE",
] as const;

export type DecisionApprobation = (typeof DECISIONS_APPROBATION)[number];

export const CATEGORIES_DOCUMENT_OPERATION = [
  "ARRETE_MINISTERIEL",
  "DECISION_PILOTAGE",
  "PLAN_OPERATIONNEL_NATIONAL",
  "CADRE_DE_CIBLAGE",
  "BORDEREAU_CONSOLIDE",
  "RAPPORT_EVALUATION",
  "AUTRE",
] as const;

export type CategorieDocumentOperation = (typeof CATEGORIES_DOCUMENT_OPERATION)[number];

export interface ProvinceOperation {
  id: string;
  operation_id: string;
  province_id: string;
  province_nom?: string;
  province_code?: string;
  quantite_allouee_prevue?: number | null;
  nombre_menages_cibles_province?: number | null;
  instructions_specifiques?: string | null;
  cree_le: string;
}

export interface ApprobationOperation {
  id: string;
  operation_id: string;
  type_approbation: TypeApprobation;
  instance_decisionnaire: string;
  reference_acte: string;
  date_decision: string;
  signataire_nom: string;
  signataire_qualite: string;
  decision: DecisionApprobation;
  reserves_ou_conditions?: string | null;
  piece_jointe_id?: string | null;
  enregistre_par: string;
  enregistre_par_nom?: string;
  cree_le: string;
}

export interface DocumentOperation {
  id: string;
  operation_id: string;
  categorie_document: CategorieDocumentOperation;
  intitule: string;
  cle_r2: string;
  nom_fichier_original: string;
  type_mime: string;
  taille_octets: number;
  televerse_par: string;
  cree_le: string;
}

export interface DossierExecutionProvincial {
  id: string;
  operation_id: string;
  province_id: string;
  province_nom?: string;
  province_code?: string;
  reference_dossier: string;
  statut_execution: StatutDossierExecution;
  plan_operationnel_local?: string | null;
  observations_delegue?: string | null;
  date_debut_reelle?: string | null;
  date_fin_reelle?: string | null;
  total_menages_servis: number;
  total_personnes_servies: number;
  quantite_totale_distribuee: number;
  pv_piece_jointe_id?: string | null;
  nombre_distributions_provinciales?: number;
  cree_le: string;
  modifie_le: string;
}

export interface OperationCentrale {
  id: string;
  code_operation: string;
  reference_administrative?: string | null;
  intitule: string;
  description_contexte?: string | null;
  type_intervention: TypeIntervention;
  annee_campagne: string;
  institution_responsable: string;
  reference_juridique?: string | null;
  objectif_general?: string | null;
  categories_beneficiaires?: string | null;
  criteres_eligibilite?: string | null;
  sources_donnees_ciblage?: string | null;
  nombre_previsionnel_menages?: number | null;
  nombre_previsionnel_personnes?: number | null;
  date_debut_prevue?: string | null;
  date_fin_prevue?: string | null;
  date_limite_preparation_provinciale?: string | null;
  date_limite_transmission_rapports?: string | null;
  source_vivres: SourceVivres;
  articles_cibles_json?: string | null;
  notes_transport_reception?: string | null;
  statut: StatutOperationCentrale;
  motif_annulation?: string | null;
  cree_par: string;
  cree_par_nom?: string;
  cree_le: string;
  modifie_le: string;
  nombre_provinces?: number;
  total_menages_servis_consolide?: number;
  total_personnes_servies_consolide?: number;
  quantite_distribuee_consolidee?: number;
  taux_avancement?: number;
}

export interface DetailOperationCentrale extends OperationCentrale {
  provinces: ProvinceOperation[];
  dossiers: DossierExecutionProvincial[];
  approbations: ApprobationOperation[];
  documents: DocumentOperation[];
}

export interface ConsolidationNationaleOperation {
  operation_id: string;
  code_operation: string;
  intitule: string;
  statut: StatutOperationCentrale;
  nombre_provinces_ciblees: number;
  nombre_dossiers_ouverts: number;
  nombre_dossiers_termines: number;
  nombre_previsionnel_menages_national: number;
  nombre_previsionnel_personnes_national: number;
  total_menages_servis_national: number;
  total_personnes_servies_national: number;
  quantite_totale_distribuee_national: number;
  taux_avancement_global_pourcentage: number;
  provinces_detail: Array<{
    province_id: string;
    province_nom: string;
    province_code: string;
    statut_execution: StatutDossierExecution;
    total_menages_servis: number;
    total_personnes_servies: number;
    quantite_totale_distribuee: number;
    date_fin_reelle: string | null;
    pv_piece_jointe_id: string | null;
  }>;
}
