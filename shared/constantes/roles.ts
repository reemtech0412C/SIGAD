export const ROLES_UTILISATEUR = [
  "PROPRIETAIRE",
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
] as const;

export type RoleUtilisateur = (typeof ROLES_UTILISATEUR)[number];

export const STATUTS_UTILISATEUR = ["ACTIF", "SUSPENDU", "VERROUILLE"] as const;

export type StatutUtilisateur = (typeof STATUTS_UTILISATEUR)[number];

export const DELAI_SESSION_HEURES = 8;
export const SEUIL_TENTATIVES_ECHOUEES = 5;
export const DUREE_VERROUILLAGE_MINUTES = 15;
