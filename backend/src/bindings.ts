import type { RoleUtilisateur, StatutUtilisateur } from "../../shared/constantes/roles";

export type AppBindings = CloudflareBindings;

export interface UtilisateurSession {
  id: string;
  identifiant: string;
  nom_complet: string;
  role: RoleUtilisateur;
  province_id: string | null;
  doit_changer_mot_de_passe: number;
  statut: StatutUtilisateur;
}

export interface SessionActive {
  id: string;
  jeton_csrf: string;
  expire_le: string;
  utilisateur: UtilisateurSession;
}

export interface VariablesRequete {
  utilisateur: UtilisateurSession;
  session: SessionActive;
}

export type EnvironnementApplication = {
  Bindings: AppBindings;
  Variables: VariablesRequete;
};
