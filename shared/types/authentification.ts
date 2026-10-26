import type { RoleUtilisateur, StatutUtilisateur } from "../constantes/roles";

export interface UtilisateurAuthentifie {
  id: string;
  identifiant: string;
  nom_complet: string;
  role: RoleUtilisateur;
  province_id: string | null;
  doit_changer_mot_de_passe: boolean;
  double_facteur_actif: boolean;
  courriel?: string | null;
  telephone?: string | null;
  statut?: StatutUtilisateur;
  institution?: string | null;
  fonction?: string | null;
  perimetre_consultation?: "NATIONAL" | "PROVINCIAL" | "MULTI_PROVINCIAL" | null;
  provinces_autorisees?: string[];
}

export interface UtilisateurAdmin {
  id: string;
  identifiant: string;
  nom_complet: string;
  role: RoleUtilisateur;
  province_id: string | null;
  statut: StatutUtilisateur;
  tentatives_echouees: number;
  derniere_connexion: string | null;
  cree_le: string;
}

export interface EntreeJournalAudit {
  id: string;
  utilisateur_id: string;
  role_utilisateur: RoleUtilisateur;
  province_id: string | null;
  action: string;
  entite_type: string;
  entite_id: string;
  cree_le: string;
}

export interface ReponsePagination<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}
