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
            s.activation_initiale, s.recuperation_id,
            u.id AS utilisateur_id_joint, u.identifiant, u.nom_complet, u.role,
            u.province_id, u.courriel, u.telephone, u.doit_changer_mot_de_passe, u.double_facteur_actif, u.statut,
            cc.institution, cc.fonction, cc.perimetre AS perimetre_consultation,
            (SELECT json_group_array(p.province_id) FROM perimetres_provinciaux_consultation p
              WHERE p.compte_consultation_id = cc.id) AS provinces_autorisees_json,
            CASE
              WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
              WHEN pot.id IS NOT NULL THEN pot.role_terrain
              ELSE u.role
            END AS role_effectif,
            CASE
              WHEN cc.statut = 'SUSPENDU' THEN 'SUSPENDU'
              WHEN pot.statut = 'SUSPENDU' THEN 'SUSPENDU'
              WHEN pot.statut = 'REVOQUE' THEN 'SUSPENDU'
              ELSE u.statut
            END AS statut_effectif,
            CASE WHEN pot.id IS NOT NULL THEN pot.province_id ELSE u.province_id END AS province_id_effectif,
            pot.entrepot_id AS entrepot_id_effectif
     FROM sessions AS s
     INNER JOIN utilisateurs AS u ON u.id = s.utilisateur_id
     LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
     LEFT JOIN profils_operationnels_terrain pot ON pot.utilisateur_id = u.id AND pot.statut = 'ACTIF'
     WHERE s.jeton_hash = ? AND s.revoquee = 0 AND s.expire_le > datetime('now')`,
  )
    .bind(empreinte)
    .first<{
      id: string;
      jeton_csrf: string;
      expire_le: string;
      mfa_verifiee: number;
      activation_initiale: number;
      recuperation_id: string | null;
      utilisateur_id: string;
      utilisateur_id_joint: string;
      identifiant: string;
      nom_complet: string;
      role_effectif: UtilisateurSession["role"];
      province_id: string | null;
      province_id_effectif: string | null;
      entrepot_id_effectif: string | null;
      courriel: string | null;
      telephone: string | null;
      doit_changer_mot_de_passe: number;
      double_facteur_actif: number;
      statut_effectif: UtilisateurSession["statut"];
      institution: string | null;
      fonction: string | null;
      perimetre_consultation: UtilisateurSession["perimetre_consultation"];
      provinces_autorisees_json: string | null;
    }>();

  if (!ligne || ligne.statut_effectif !== "ACTIF") {
    return c.json({ erreur: "Votre session est invalide. Veuillez vous reconnecter." }, 401);
  }

  const utilisateur: UtilisateurSession = {
    id: ligne.utilisateur_id_joint,
    identifiant: ligne.identifiant,
    nom_complet: ligne.nom_complet,
    role: ligne.role_effectif,
    province_id: ligne.province_id_effectif ?? ligne.province_id,
    courriel: ligne.courriel,
    telephone: ligne.telephone,
    doit_changer_mot_de_passe: ligne.doit_changer_mot_de_passe,
    double_facteur_actif: ligne.double_facteur_actif,
    statut: ligne.statut_effectif,
    ...(ligne.entrepot_id_effectif ? { entrepot_id: ligne.entrepot_id_effectif } : {}),
    ...(ligne.provinces_autorisees_json ? { provinces_autorisees: JSON.parse(ligne.provinces_autorisees_json) as string[] } : {}),
    ...(ligne.institution !== null ? { institution: ligne.institution } : {}),
    ...(ligne.fonction !== null ? { fonction: ligne.fonction } : {}),
    ...(ligne.perimetre_consultation ? { perimetre_consultation: ligne.perimetre_consultation } : {}),
  };
  const session: SessionActive = {
    id: ligne.id,
    jeton_csrf: ligne.jeton_csrf,
    expire_le: ligne.expire_le,
    mfa_verifiee: ligne.mfa_verifiee,
    double_facteur_actif: ligne.double_facteur_actif,
    activation_initiale: ligne.activation_initiale,
    recuperation_id: ligne.recuperation_id,
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
  const administrateurAvecMfaObligatoire = utilisateur.role === "PROPRIETAIRE"
    || utilisateur.role === "ADMIN_CENTRAL" || utilisateur.role === "CONSULTATION_INSTITUTIONNELLE";
  if (administrateurAvecMfaObligatoire && (ligne.double_facteur_actif !== 1 || ligne.mfa_verifiee !== 1) && !cheminMfaAutorisePendantConfiguration) {
    return c.json({ erreur: "L’authentification multifacteur doit être configurée ou vérifiée avant cet accès.", mfa_requis: true }, 403);
  }

  const cheminsAutorisesActivationInitiale = new Set([
    "/api/auth/session",
    "/api/auth/deconnexion",
    "/api/auth/changer-mot-de-passe-initial",
    "/api/auth/mfa/statut",
    "/api/auth/mfa/initialiser",
    "/api/auth/mfa/confirmer",
  ]);
  if (ligne.activation_initiale === 1 && !cheminsAutorisesActivationInitiale.has(c.req.path)) {
    return c.json({ erreur: "La session est limitée à l’activation initiale du compte.", activation_requise: true }, 403);
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
