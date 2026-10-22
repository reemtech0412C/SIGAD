import type { MiddlewareHandler } from "hono";
import type { EnvironnementApplication, SessionActive, UtilisateurSession } from "../bindings";
import { hacherJeton } from "../services/cryptographie.service";

const NOM_COOKIE_SESSION = "sigad_session";

function lireCookie(requete: Request, nom: string): string | null {
  const cookies = requete.headers.get("Cookie");
  if (!cookies) return null;

  for (const element of cookies.split(";")) {
    const separateur = element.indexOf("=");
    if (separateur < 0) continue;
    if (element.slice(0, separateur).trim() === nom) return decodeURIComponent(element.slice(separateur + 1).trim());
  }
  return null;
}

export const authMiddleware: MiddlewareHandler<EnvironnementApplication> = async (c, suivant) => {
  const jeton = lireCookie(c.req.raw, NOM_COOKIE_SESSION);
  if (!jeton) return c.json({ erreur: "Votre session a expiré. Veuillez vous reconnecter." }, 401);

  const empreinte = await hacherJeton(jeton);
  const ligne = await c.env.DB.prepare(
    `SELECT s.id, s.jeton_csrf, s.expire_le, s.utilisateur_id, s.mfa_verifiee,
            u.id AS utilisateur_id_joint, u.identifiant, u.nom_complet, u.role,
            u.province_id, u.doit_changer_mot_de_passe, u.double_facteur_actif, u.statut
     FROM sessions AS s
     INNER JOIN utilisateurs AS u ON u.id = s.utilisateur_id
     WHERE s.jeton_hash = ? AND s.revoquee = 0 AND s.expire_le > datetime('now')`,
  )
    .bind(empreinte)
    .first<{
      id: string;
      jeton_csrf: string;
      expire_le: string;
      mfa_verifiee: number;
      utilisateur_id: string;
      utilisateur_id_joint: string;
      identifiant: string;
      nom_complet: string;
      role: UtilisateurSession["role"];
      province_id: string | null;
      doit_changer_mot_de_passe: number;
      double_facteur_actif: number;
      statut: UtilisateurSession["statut"];
    }>();

  if (!ligne || ligne.statut !== "ACTIF") {
    return c.json({ erreur: "Votre session est invalide. Veuillez vous reconnecter." }, 401);
  }

  const utilisateur: UtilisateurSession = {
    id: ligne.utilisateur_id_joint,
    identifiant: ligne.identifiant,
    nom_complet: ligne.nom_complet,
    role: ligne.role,
    province_id: ligne.province_id,
    doit_changer_mot_de_passe: ligne.doit_changer_mot_de_passe,
    double_facteur_actif: ligne.double_facteur_actif,
    statut: ligne.statut,
  };
  const session: SessionActive = {
    id: ligne.id,
    jeton_csrf: ligne.jeton_csrf,
    expire_le: ligne.expire_le,
    mfa_verifiee: ligne.mfa_verifiee,
    double_facteur_actif: ligne.double_facteur_actif,
    utilisateur,
  };

  c.set("utilisateur", utilisateur);
  c.set("session", session);

  const cheminMfaAutorisePendantConfiguration =
    c.req.path === "/api/auth/session" ||
    c.req.path === "/api/auth/deconnexion" ||
    c.req.path === "/api/auth/changer-mot-de-passe-initial" ||
    c.req.path === "/api/auth/mfa/statut" ||
    c.req.path === "/api/auth/mfa/initialiser" ||
    c.req.path === "/api/auth/mfa/confirmer";
  const administrateurAvecMfaObligatoire = utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL";
  if (administrateurAvecMfaObligatoire && (ligne.double_facteur_actif !== 1 || ligne.mfa_verifiee !== 1) && !cheminMfaAutorisePendantConfiguration) {
    return c.json({ erreur: "L’authentification multifacteur doit être configurée ou vérifiée avant cet accès.", mfa_requis: true }, 403);
  }

  const cheminAutorisePendantChangement =
    c.req.path === "/api/auth/changer-mot-de-passe-initial" ||
    c.req.path === "/api/auth/session" ||
    c.req.path === "/api/auth/deconnexion";
  if (utilisateur.doit_changer_mot_de_passe === 1 && !cheminAutorisePendantChangement) {
    return c.json({ erreur: "Veuillez modifier votre mot de passe initial avant de poursuivre." }, 403);
  }

  await suivant();
  return;
};

export function cookieSession(requete: Request): string | null {
  return lireCookie(requete, NOM_COOKIE_SESSION);
}
