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

export interface CantonTerritorial {
  id: string;
  sous_prefecture_id: string;
  nom: string;
}

export interface LocaliteTerritoriale {
  id: string;
  province_id: string;
  departement_id: string;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  canton_id: string | null;
  nom: string;
  type_localite: TypeLocalite;
  mode_decoupage_urbain: "AUCUN" | "SANS_ARRONDISSEMENT" | "AVEC_ARRONDISSEMENTS";
}

export interface ArrondissementTerritorial {
  id: string;
  localite_id: string;
  commune_id: string | null;
  code: string | null;
  nom: string;
}

export interface QuartierTerritorial {
  id: string;
  localite_id: string;
  arrondissement_id: string | null;
  nom: string;
  possede_carres: number;
}

export interface CarreTerritorial {
  id: string;
  quartier_id: string;
  code_ou_nom: string;
}

export interface SiteHumanitaireTerritorial {
  id: string;
  province_id: string;
  departement_id: string;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  localite_proche_id: string | null;
  code_site: string | null;
  nom: string;
  categorie_site: CategorieSiteHumanitaire;
}

export interface ElementSelectionLocalisation {
  nature: "LOCALITE" | "SITE_HUMANITAIRE";
  province_id: string;
  departement_id: string;
  sous_prefecture_id: string | null;
  commune_id: string | null;
  localite_id: string | null;
  arrondissement_id: string | null;
  quartier_id: string | null;
  carre_id: string | null;
  site_humanitaire_id: string | null;
}

export interface PageTerritoriale<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}
