import type { RoleUtilisateur, StatutUtilisateur } from "../../shared/constantes/roles";

export type AppBindings = CloudflareBindings & {
  EMAIL_DELIVERY_ENABLED?: string;
  SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE?: string;
  SIGAD_RECUPERATION_OPERATEUR_IDENTITE?: string;
  SIGAD_RECUPERATION_OPERATEUR_CLE_PUBLIQUE?: string;
  RESEND_API_KEY?: string;
  SIGAD_EMAIL_FROM?: string;
  SIGAD_EMAIL_API_URL?: string;
  SIGAD_OTP_HMAC_SECRET?: string;
  SIGAD_EMAIL_PROVIDER?: { fetch(request: Request): Promise<Response> };
};

export interface UtilisateurSession {
  id: string;
  identifiant: string;
  nom_complet: string;
  courriel?: string | null;
  telephone?: string | null;
  role: RoleUtilisateur;
  province_id: string | null;
  doit_changer_mot_de_passe: number;
  double_facteur_actif?: number;
  statut: StatutUtilisateur;
  provinces_autorisees?: string[];
  institution?: string | null;
  fonction?: string | null;
  perimetre_consultation?: "NATIONAL" | "PROVINCIAL" | "MULTI_PROVINCIAL" | null;
  entrepot_id?: string | null;
}

export interface SessionActive {
  id: string;
  jeton_csrf: string;
  expire_le: string;
  mfa_verifiee: number;
  double_facteur_actif: number;
  activation_initiale: number;
  recuperation_id: string | null;
  utilisateur: UtilisateurSession;
}

export type EtapeDiagnosticRecuperation =
  | "CONTROLE_CSRF"
  | "CONFIGURATION_ENVIRONNEMENT"
  | "LECTURE_CORPS"
  | "VERIFICATION_PREUVE_OPERATEUR"
  | "LECTURE_COMPTE_CIBLE"
  | "GENERATION_JETON"
  | "HACHAGE_JETON"
  | "PREPARATION_D1"
  | "TRANSACTION_D1"
  | "PREPARATION_REPONSE";

export interface DiagnosticRecuperation {
  correlationId: string;
  etape: EtapeDiagnosticRecuperation;
}

export interface VariablesRequete {
  utilisateur: UtilisateurSession;
  session: SessionActive;
  diagnosticRecuperation?: DiagnosticRecuperation;
}

export type EnvironnementApplication = {
  Bindings: AppBindings;
  Variables: VariablesRequete;
};
