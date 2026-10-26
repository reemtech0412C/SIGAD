export type NatureDonnees = "REEL" | "TEST" | "INDETERMINE";

export type StatutEligibiliteSuppression =
  | "ELIGIBLE"
  | "PROTEGE_REEL"
  | "NON_CONFIRME"
  | "BLOQUE_MOUVEMENTS_STOCK"
  | "BLOQUE_DISTRIBUTIONS_VALIDEES";

export interface SyntheseDependancesOperation {
  nb_provinces: number;
  nb_dossiers: number;
  nb_approbations: number;
  nb_documents: number;
  nb_distributions: number;
  nb_distributions_validees: number;
  nb_remises_effectuees: number;
  nb_mouvements_stock: number;
  nb_reservations_stock: number;
  provinces_noms: string[];
  documents_r2: Array<{
    id: string;
    nom_fichier_original: string;
    cle_r2: string;
    taille_octets: number;
  }>;
}

export interface RegleSecuriteVerification {
  code: string;
  intitule: string;
  satisfaite: boolean;
  detail: string;
}

export interface RapportEligibiliteOperation {
  operation_id: string;
  code_operation: string;
  intitule: string;
  statut: string;
  nature_donnees: NatureDonnees;
  statut_eligibilite: StatutEligibiliteSuppression;
  eligible: boolean;
  motif_refus: string | null;
  regles: RegleSecuriteVerification[];
  dependances: SyntheseDependancesOperation;
}

export interface ResumeOperationDonneesTest {
  id: string;
  code_operation: string;
  intitule: string;
  statut: string;
  nature_donnees: NatureDonnees;
  statut_eligibilite: StatutEligibiliteSuppression;
  eligible_suppression: boolean;
  nb_provinces: number;
  nb_dossiers: number;
  nb_distributions: number;
  nb_documents: number;
  nb_mouvements_stock: number;
  cree_le: string;
}

export interface ResultatSuppressionOperationTest {
  succes: boolean;
  code_operation: string;
  intitule: string;
  perimetre_supprime: {
    documents_operations: number;
    approbations_operations: number;
    dossiers_execution_provinciaux: number;
    operations_centrales_provinces: number;
    historique_operations_centrales: number;
    distributions_provinciales: number;
    operations_centrales_distribution: number;
    fichiers_r2: number;
  };
  fichiers_r2_supprimes: string[];
  fichiers_r2_echecs?: Array<{ cle: string; erreur: string }>;
  audit_id: string;
  horodatage: string;
}

export interface EntreeAuditSuppressionTest {
  id: string;
  utilisateur_id: string;
  utilisateur_identifiant: string;
  utilisateur_nom: string;
  adresse_ip: string | null;
  entite_type: string;
  entite_id: string;
  code_entite: string;
  intitule_entite: string;
  perimetre_supprime: Record<string, number>;
  documents_r2_supprimes: string[];
  motif: string;
  statut_resultat: "SUCCES" | "ECHEC_PARTIEL" | "BLOQUE";
  horodatage: string;
}

export type StatutReconciliationR2 = "EN_ATTENTE" | "EN_COURS" | "PURGEE" | "ECHOUEE_DEFINITIVE";

export interface EntreeFileReconciliationR2 {
  id: string;
  cle_r2: string;
  entite_id: string;
  code_entite: string;
  audit_id: string | null;
  statut: StatutReconciliationR2;
  tentatives: number;
  derniere_tentative: string | null;
  prochaine_tentative: string;
  dernier_message_erreur: string | null;
  cree_le: string;
  purgee_le: string | null;
}

export interface ResultatTraitementReconciliationR2 {
  total_traites: number;
  succes: number;
  echecs: number;
  restants: number;
}
