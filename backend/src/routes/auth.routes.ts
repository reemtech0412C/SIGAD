import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { DELAI_SESSION_HEURES, DUREE_VERROUILLAGE_MINUTES, SEUIL_TENTATIVES_ECHOUEES } from "../../../shared/constantes/roles";
import { schemaChangementMotDePasseInitial, schemaConnexion } from "../../../shared/validations/authentification";
import { authMiddleware, cookieSession as lireJetonSession } from "../middlewares/auth.middleware";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { csrfPreAuthMiddleware, csrfSessionMiddleware, definirCookieCsrf, effacerCookieCsrf } from "../middlewares/csrf.middleware";
import { genererJetonAleatoire, hacherJeton, hacherMotDePasse, verifierMotDePasse } from "../services/cryptographie.service";

interface LigneConnexion {
  id: string;
  identifiant: string;
  nom_complet: string;
  role: "PROPRIETAIRE" | "ADMIN_CENTRAL" | "DELEGUE_PROVINCIAL";
  province_id: string | null;
  mot_de_passe_hash: string;
  doit_changer_mot_de_passe: number;
  statut: "ACTIF" | "SUSPENDU" | "VERROUILLE";
  verrouille_jusqua: string | null;
}

const routesAuth = new Hono<EnvironnementApplication>();

function cookieSession(jeton: string, environnement: string): string {
  const securise = environnement === "production" ? "; Secure" : "";
  const dureeSecondes = DELAI_SESSION_HEURES * 60 * 60;
  return `sigad_session=${encodeURIComponent(jeton)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${dureeSecondes}${securise}`;
}

function effacerCookieSession(environnement: string): string {
  const securise = environnement === "production" ? "; Secure" : "";
  return `sigad_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securise}`;
}

function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

async function enregistrerEchecConnexion(
  c: Context<EnvironnementApplication>,
  utilisateur: LigneConnexion | null,
  identifiant: string,
  motif: string,
): Promise<void> {
  const evenement = c.env.DB.prepare(
    `INSERT INTO evenements_connexion
     (id, identifiant_tente, utilisateur_id, succes, motif_echec, adresse_ip, agent_utilisateur)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    identifiant,
    utilisateur?.id ?? null,
    motif,
    adresseIp(c.req.raw),
    c.req.header("User-Agent") ?? null,
  );

  if (!utilisateur || utilisateur.statut === "SUSPENDU") {
    await c.env.DB.batch([evenement]);
    return;
  }

  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs
     SET tentatives_echouees = tentatives_echouees + 1,
         statut = CASE WHEN tentatives_echouees + 1 >= ? THEN 'VERROUILLE' ELSE statut END,
         verrouille_jusqua = CASE
           WHEN tentatives_echouees + 1 >= ? THEN datetime('now', '+' || ? || ' minutes')
           ELSE verrouille_jusqua
         END,
         modifie_le = datetime('now')
     WHERE id = ? AND statut IN ('ACTIF', 'VERROUILLE')
       AND (verrouille_jusqua IS NULL OR verrouille_jusqua <= datetime('now'))`,
  ).bind(SEUIL_TENTATIVES_ECHOUEES, SEUIL_TENTATIVES_ECHOUEES, DUREE_VERROUILLAGE_MINUTES, utilisateur.id);
  await c.env.DB.batch([miseAJour, evenement]);
}

routesAuth.get("/csrf", (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const existant = cookie
    .split(";")
    .map((element) => element.trim())
    .find((element) => element.startsWith("sigad_csrf="))
    ?.slice("sigad_csrf=".length);
  const jeton = existant ? decodeURIComponent(existant) : genererJetonAleatoire();
  c.header("Set-Cookie", definirCookieCsrf(jeton, c.env.ENVIRONMENT));
  return c.json({ jeton_csrf: jeton });
});

routesAuth.post("/connexion", csrfPreAuthMiddleware, async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const resultat = schemaConnexion.safeParse(corps);
  if (!resultat.success) {
    return c.json({ erreur: resultat.error.issues[0]?.message ?? "Les informations de connexion sont invalides." }, 400);
  }

  const { identifiant, mot_de_passe } = resultat.data;
  const utilisateur = await c.env.DB.prepare(
    `SELECT id, identifiant, nom_complet, role, province_id, mot_de_passe_hash,
            doit_changer_mot_de_passe, statut, verrouille_jusqua
     FROM utilisateurs WHERE identifiant = ?`,
  )
    .bind(identifiant)
    .first<LigneConnexion>();

  const verrouActif = utilisateur?.statut === "VERROUILLE" && (
    utilisateur.verrouille_jusqua === null ||
    Date.parse(`${utilisateur.verrouille_jusqua.replace(" ", "T")}Z`) > Date.now()
  );
  const motDePasseValide = utilisateur ? await verifierMotDePasse(mot_de_passe, utilisateur.mot_de_passe_hash) : false;
  if (!utilisateur || utilisateur.statut === "SUSPENDU" || verrouActif || !motDePasseValide) {
    const motif = !utilisateur ? "IDENTIFIANT_INCONNU" : verrouActif ? "COMPTE_VERROUILLE" : utilisateur.statut === "SUSPENDU" ? "COMPTE_SUSPENDU" : "MOT_DE_PASSE_INVALIDE";
    await enregistrerEchecConnexion(c, utilisateur, identifiant, motif);
    return c.json({ erreur: "Identifiant ou mot de passe incorrect, ou compte temporairement indisponible." }, 401);
  }

  const jetonSession = genererJetonAleatoire();
  const empreinteJeton = await hacherJeton(jetonSession);
  const jetonCsrf = c.req.header("X-CSRF-Token");
  if (!jetonCsrf) return c.json({ erreur: "La vérification de sécurité a échoué." }, 403);
  const idSession = crypto.randomUUID();
  const expireLe = new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000).toISOString();
  const expireLeBaseDonnees = expireLe.replace("T", " ").replace(/\.\d{3}Z$/u, "");

  const ouvertureSession = c.env.DB.prepare(
    `INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, adresse_ip, agent_utilisateur, expire_le)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(idSession, utilisateur.id, empreinteJeton, jetonCsrf, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null, expireLeBaseDonnees);
  const reinitialisationTentatives = c.env.DB.prepare(
    `UPDATE utilisateurs SET tentatives_echouees = 0, verrouille_jusqua = NULL, statut = 'ACTIF',
       derniere_connexion = datetime('now'), modifie_le = datetime('now') WHERE id = ?`,
  ).bind(utilisateur.id);
  const evenement = c.env.DB.prepare(
    `INSERT INTO evenements_connexion
     (id, identifiant_tente, utilisateur_id, succes, adresse_ip, agent_utilisateur)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).bind(crypto.randomUUID(), identifiant, utilisateur.id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null);
  const journal = creerInstructionAudit(c.env.DB, {
    utilisateur: {
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nom_complet: utilisateur.nom_complet,
      role: utilisateur.role,
      province_id: utilisateur.province_id,
      doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe,
      statut: "ACTIF",
    },
    action: "CONNEXION_REUSSIE",
    entiteType: "UTILISATEUR",
    entiteId: utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
  });
  await c.env.DB.batch([ouvertureSession, reinitialisationTentatives, evenement, journal]);

  c.header("Set-Cookie", cookieSession(jetonSession, c.env.ENVIRONMENT), { append: true });
  c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
  return c.json({
    utilisateur: {
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nom_complet: utilisateur.nom_complet,
      role: utilisateur.role,
      province_id: utilisateur.province_id,
      doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe === 1,
    },
    expire_le: expireLe,
  });
});

routesAuth.get("/session", authMiddleware, (c) => {
  const { utilisateur } = c.get("session");
  return c.json({
    utilisateur: {
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nom_complet: utilisateur.nom_complet,
      role: utilisateur.role,
      province_id: utilisateur.province_id,
      doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe === 1,
    },
    expire_le: c.get("session").expire_le,
  });
});

routesAuth.post("/changer-mot-de-passe-initial", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (session.utilisateur.doit_changer_mot_de_passe !== 1) {
    return c.json({ erreur: "Aucun changement initial de mot de passe n’est requis." }, 409);
  }

  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const resultat = schemaChangementMotDePasseInitial.safeParse(corps);
  if (!resultat.success) {
    return c.json({ erreur: resultat.error.issues[0]?.message ?? "Le nouveau mot de passe est invalide." }, 400);
  }

  const empreinte = await hacherMotDePasse(resultat.data.nouveau_mot_de_passe);
  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = NULL,
       doit_changer_mot_de_passe = 0, tentatives_echouees = 0, verrouille_jusqua = NULL,
       modifie_le = datetime('now') WHERE id = ? AND doit_changer_mot_de_passe = 1`,
  ).bind(empreinte, session.utilisateur.id);
  const reponseAudit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur,
    action: "CHANGEMENT_MOT_DE_PASSE_INITIAL",
    entiteType: "UTILISATEUR",
    entiteId: session.utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ doit_changer_mot_de_passe: false }),
  });
  const invalidationAutresSessions = c.env.DB.prepare(
    `UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND id <> ? AND revoquee = 0`,
  ).bind(session.utilisateur.id, session.id);
  await c.env.DB.batch([miseAJour, invalidationAutresSessions, reponseAudit]);
  return c.json({ message: "Votre mot de passe a été modifié avec succès." });
});

routesAuth.post("/deconnexion", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  const jeton = lireJetonSession(c.req.raw);
  if (jeton) {
    const empreinte = await hacherJeton(jeton);
    const revoquer = c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE id = ? AND jeton_hash = ?").bind(session.id, empreinte);
    const audit = creerInstructionAudit(c.env.DB, {
      utilisateur: session.utilisateur,
      action: "DECONNEXION",
      entiteType: "SESSION",
      entiteId: session.id,
      adresseIp: adresseIp(c.req.raw),
    });
    await c.env.DB.batch([revoquer, audit]);
  }
  c.header("Set-Cookie", effacerCookieSession(c.env.ENVIRONMENT));
  c.header("Set-Cookie", effacerCookieCsrf(c.env.ENVIRONMENT), { append: true });
  return c.json({ message: "Votre session est terminée." });
});

export { routesAuth };
