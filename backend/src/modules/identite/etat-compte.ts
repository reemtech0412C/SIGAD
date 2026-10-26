import type { RoleUtilisateur } from "../../../../shared/constantes/roles";

export type EtatCompte = "INVITE" | "EN_ATTENTE_APPROBATION" | "REFUSE" | "ACTIF" | "SUSPENDU"
  | "VERROUILLE" | "EXPIRE" | "REVOQUE" | "ARCHIVE";
export type RoleActeurCompte = RoleUtilisateur | "CONSULTATION_INSTITUTIONNELLE";
export type RoleCibleCompte = RoleActeurCompte;
export type ErreurTransitionCompte = "TRANSITION_INTERDITE" | "ROLE_INTERDIT" | "MOTIF_REQUIS"
  | "AUTO_MODIFICATION_INTERDITE" | "DERNIER_PROPRIETAIRE";

const transitions: Readonly<Record<EtatCompte, readonly EtatCompte[]>> = {
  INVITE: ["ACTIF", "EXPIRE", "REVOQUE"],
  EN_ATTENTE_APPROBATION: ["INVITE", "REFUSE", "EXPIRE"],
  REFUSE: ["ARCHIVE"],
  ACTIF: ["SUSPENDU", "VERROUILLE", "REVOQUE"],
  SUSPENDU: ["ACTIF", "REVOQUE"],
  VERROUILLE: ["ACTIF", "SUSPENDU", "REVOQUE"],
  EXPIRE: ["INVITE", "ARCHIVE"],
  REVOQUE: ["ARCHIVE"],
  ARCHIVE: [],
};

export interface DemandeTransitionCompte {
  ancienEtat: EtatCompte;
  nouvelEtat: EtatCompte;
  roleActeur: RoleActeurCompte;
  roleCible: RoleCibleCompte;
  motif?: string | null;
  memeCompte?: boolean;
  autreProprietaireActif?: boolean;
}

export function verifierTransitionCompte(demande: DemandeTransitionCompte): ErreurTransitionCompte | null {
  const { ancienEtat, nouvelEtat, roleActeur, roleCible } = demande;
  if (!transitions[ancienEtat].includes(nouvelEtat)) return "TRANSITION_INTERDITE";
  if (demande.memeCompte && nouvelEtat !== "ACTIF") return "AUTO_MODIFICATION_INTERDITE";
  if ((nouvelEtat === "SUSPENDU" || nouvelEtat === "REVOQUE") && (demande.motif?.trim().length ?? 0) < 10) {
    return "MOTIF_REQUIS";
  }
  if (roleCible === "PROPRIETAIRE" && ancienEtat === "ACTIF" && nouvelEtat !== "ACTIF"
    && !demande.autreProprietaireActif) return "DERNIER_PROPRIETAIRE";
  if (roleActeur === "PROPRIETAIRE") return null;
  if (roleActeur === "ADMIN_CENTRAL" && roleCible !== "PROPRIETAIRE"
    && (roleCible === "ADMIN_CENTRAL" || roleCible === "DELEGUE_PROVINCIAL" || roleCible === "CONSULTATION_INSTITUTIONNELLE")
    && ["ACTIF", "SUSPENDU"].includes(ancienEtat) && ["ACTIF", "SUSPENDU"].includes(nouvelEtat)) return null;
  return "ROLE_INTERDIT";
}
