import type { CategorieSiteHumanitaire, TypeLocalite } from "../validations/territoire";

export interface ProvinceTerritoriale {
  id: string;
  code: string;
  nom: string;
  chef_lieu: string;
  statut_particulier: number;
}

export interface DepartementTerritorial {
  id: string;
  province_id: string;
  code: string;
  nom: string;
  chef_lieu: string | null;
  statut_validation?: string;
  statut_operationnel?: string;
  certification_juridique?: string;
  active_par_proprietaire?: number;
  source_officielle?: string | null;
}

export interface SousPrefectureTerritoriale {
  id: string;
  departement_id: string;
  code: string;
  nom: string;
}

export interface CommuneTerritoriale {
  id: string;
  province_id: string;
  code: string;
  nom: string;
  type_commune: "URBAINE" | "RURALE";
}

export interface RattachementTerritorial {
  id: string;
  commune_id: string;
  departement_id: string | null;
  sous_prefecture_id: string | null;
  source_juridique: string;
  date_debut_validite: string;
  date_fin_validite: string | null;
  est_principal: number;
}

export type ProvenanceUniteTerritoriale = "SOCLE_INITIAL" | "AJOUT_DYNAMIQUE";
export type MilieuResidenceTerritorial = "URBAIN" | "RURAL";

export interface CantonTerritorial {
  id: string;
  departement_id?: string | null;
  sous_prefecture_id: string | null;
  nom: string;
  provenance?: ProvenanceUniteTerritoriale;
}

export interface LocaliteTerritoriale {
  id: string;
  province_id: string;
  departement_id: string | null;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  canton_id: string | null;
  nom: string;
  type_localite: TypeLocalite;
  mode_decoupage_urbain: "AUCUN" | "SANS_ARRONDISSEMENT" | "AVEC_ARRONDISSEMENTS";
  provenance?: ProvenanceUniteTerritoriale;
}

export interface ArrondissementTerritorial {
  id: string;
  localite_id: string;
  commune_id: string | null;
  code: string | null;
  nom: string;
  provenance?: ProvenanceUniteTerritoriale;
}

export interface QuartierTerritorial {
  id: string;
  localite_id: string;
  arrondissement_id: string | null;
  nom: string;
  possede_carres: number;
  provenance?: ProvenanceUniteTerritoriale;
}

export interface CarreTerritorial {
  id: string;
  quartier_id: string;
  code_ou_nom: string;
  provenance?: ProvenanceUniteTerritoriale;
}

export interface SiteHumanitaireTerritorial {
  id: string;
  province_id: string;
  departement_id: string | null;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  localite_proche_id: string | null;
  code_site: string | null;
  nom: string;
  categorie_site: CategorieSiteHumanitaire;
  provenance?: ProvenanceUniteTerritoriale;
}

export interface ElementSelectionLocalisation {
  nature: "LOCALITE" | "SITE_HUMANITAIRE";
  milieu?: MilieuResidenceTerritorial | null;
  province_id: string;
  departement_id: string | null;
  milieu_residence?: MilieuResidenceTerritorial | null;
  milieu_intervention?: "URBAIN" | "RURAL_SEDENTAIRE" | "NOMADE_PASTORAL" | "SITE_HUMANITAIRE";
  sous_prefecture_id: string | null;
  canton_id?: string | null;
  commune_id: string | null;
  localite_id: string | null;
  arrondissement_id: string | null;
  quartier_id: string | null;
  carre_id: string | null;
  site_humanitaire_id: string | null;
}

export type TypeUniteTerritoriale =
  | "PROVINCE"
  | "DEPARTEMENT"
  | "SOUS_PREFECTURE"
  | "COMMUNE"
  | "CANTON"
  | "VILLE"
  | "VILLAGE"
  | "HAMEAU"
  | "FERRICK"
  | "CAMPEMENT"
  | "ARRONDISSEMENT"
  | "QUARTIER"
  | "CARRE"
  | "BLOC"
  | "SECTEUR"
  | "SITE_HUMANITAIRE";

export interface ReponseAjoutDynamiqueTerritoire {
  id: string;
  type: TypeUniteTerritoriale;
  nom: string;
  code?: string | null;
  statut_validation: "VALIDE";
  provenance: ProvenanceUniteTerritoriale;
  doublon_existant: boolean;
  message: string;
  unite: Record<string, unknown>;
}

export interface TableauDeBordTerritorial {
  provinces: number;
  departements: number;
  departements_actifs: number;
  departements_certifies: number;
  departements_non_certifies: number;
  sous_prefectures: number;
  communes: number;
  villes: number;
  arrondissements: number;
  quartiers: number;
  carres: number;
  cantons: number;
  villages: number;
  ferricks: number;
  sites_humanitaires: number;
  validees: number;
  en_attente: number;
  archivees: number;
  anomalies_et_doublons: number;
}

export interface ResultatRechercheTerritoire {
  id: string;
  type: TypeUniteTerritoriale;
  nom: string;
  code?: string | null;
  province_id: string;
  province_nom: string;
  departement_id?: string | null;
  departement_nom?: string | null;
  sous_prefecture_id?: string | null;
  sous_prefecture_nom?: string | null;
  statut_validation: string;
  source_officielle?: string | null;
  chef_lieu?: string | null;
  fil_ariane: string;
}

export interface SimulationFusionTerritoire {
  unite_source_id: string;
  unite_cible_id: string;
  nom_source: string;
  nom_cible: string;
  rattachement_source?: string;
  rattachement_cible?: string;
  code_source?: string | null;
  code_cible?: string | null;
  menages_concernes: number;
  beneficiaires_concernes: number;
  distributions_concernees: number;
  operations_concernees: number;
  stocks_ou_entrepots_concernes: number;
  sous_unites_concernees: number;
  menages_doublons_potentiels?: number | string[] | undefined;
  distributions_historiques_preservees?: number | undefined;
  conflits_identifies: string[];
  avertissements?: string[] | undefined;
  fusion_autorisee: boolean;
  message_blocage?: string | null | undefined;
}

export interface SimulationRattachementTerritoire {
  unite_id: string;
  nom_unite: string;
  type_unite: TypeUniteTerritoriale;
  ancien_rattachement: string;
  nouveau_rattachement: string;
  menages_impactes: number;
  operations_impactees: number;
  distributions_historiques_preservees: number;
  autorise: boolean;
  message_avertissement?: string | null | undefined;
}

export interface PrevisualisationImportTerritoire {
  lignes_nouvelles: number;
  lignes_existantes: number;
  doublons_detectes: number;
  rattachements_inconnus: number;
  incompatibilites: number;
  sources_insuffisantes: number;
  erreurs: Array<{ ligne: number; message: string }>;
  lignes_valides: Array<{
    type: TypeUniteTerritoriale;
    nom: string;
    code?: string;
    province_id: string;
    departement_id?: string;
    chef_lieu?: string;
    source: string;
  }>;
}

export interface PageTerritoriale<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}
