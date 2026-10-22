import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { DELAI_SESSION_HEURES, DUREE_VERROUILLAGE_MINUTES, SEUIL_TENTATIVES_ECHOUEES } from "../../../shared/constantes/roles";
import { schemaChangementMotDePasseInitial, schemaConnexion } from "../../../shared/validations/authentification";
import { authMiddleware, cookieSession as lireJetonSession } from "../middlewares/auth.middleware";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { csrfPreAuthMiddleware, csrfSessionMiddleware, definirCookieCsrf, effacerCookieCsrf } from "../middlewares/csrf.middleware";
import { genererJetonAleatoire, hacherJeton, hacherMotDePasse, verifierMotDePasse } from "../services/cryptographie.service";
import {
  chiffrerSecretTotp,
  creerCodeOperation,
  dechiffrerSecretTotp,
  genererCodesRecuperation,
  genererSecretTotp,
  normaliserCodeRecuperation,
  uriProvisionnementTotp,
  verifierCodeTotp,
} from "../services/mfa.service";

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
  double_facteur_secret: string | null;
  double_facteur_actif: number;
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

function cookieDefiMfa(jeton: string, environnement: string): string {
  const securise = environnement === "production" ? "; Secure" : "";
  return `sigad_mfa_challenge=${encodeURIComponent(jeton)}; Path=/api/auth/mfa; HttpOnly; SameSite=Strict; Max-Age=300${securise}`;
}

function effacerCookieDefiMfa(environnement: string): string {
  const securise = environnement === "production" ? "; Secure" : "";
  return `sigad_mfa_challenge=; Path=/api/auth/mfa; HttpOnly; SameSite=Strict; Max-Age=0${securise}`;
}

function lireCookie(requete: Request, nom: string): string | null {
  const valeur = requete.headers.get("Cookie");
  if (!valeur) return null;
  for (const element of valeur.split(";")) {
    const separateur = element.indexOf("=");
    if (separateur > 0 && element.slice(0, separateur).trim() === nom) {
      return decodeURIComponent(element.slice(separateur + 1).trim());
    }
  }
  return null;
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
            doit_changer_mot_de_passe, statut, verrouille_jusqua,
            double_facteur_secret, double_facteur_actif
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
  const authentificationMfaObligatoire = utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL";
  if (authentificationMfaObligatoire && utilisateur.double_facteur_actif === 1) {
    if (!utilisateur.double_facteur_secret || !c.env.CLE_CHIFFREMENT_MFA) {
      return c.json({ erreur: "La vérification multifacteur n’est pas disponible pour ce compte." }, 503);
    }
    const jetonDefi = genererJetonAleatoire();
    const expirationDefi = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, "");
    const idDefi = crypto.randomUUID();
    const instructionDefi = c.env.DB.prepare(
      `INSERT INTO defis_mfa (id, utilisateur_id, jeton_hash, expire_le) VALUES (?, ?, ?, ?)`,
    ).bind(idDefi, utilisateur.id, await hacherJeton(jetonDefi), expirationDefi);
    const journalDefi = creerInstructionAudit(c.env.DB, {
      utilisateur: {
        id: utilisateur.id,
        identifiant: utilisateur.identifiant,
        nom_complet: utilisateur.nom_complet,
        role: utilisateur.role,
        province_id: utilisateur.province_id,
        doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe,
        statut: utilisateur.statut,
      },
      action: "DEFI_MFA_CREE",
      entiteType: "AUTHENTIFICATION_MFA",
      entiteId: idDefi,
      adresseIp: adresseIp(c.req.raw),
    });
    await c.env.DB.batch([instructionDefi, journalDefi]);
    c.header("Set-Cookie", cookieDefiMfa(jetonDefi, c.env.ENVIRONMENT));
    c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
    return c.json({ mfa_requis: true, expire_dans_secondes: 300 });
  }
  const idSession = crypto.randomUUID();
  const expireLe = new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000).toISOString();
  const expireLeBaseDonnees = expireLe.replace("T", " ").replace(/\.\d{3}Z$/u, "");

  const ouvertureSession = c.env.DB.prepare(
    `INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, adresse_ip, agent_utilisateur, expire_le, mfa_verifiee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(idSession, utilisateur.id, empreinteJeton, jetonCsrf, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null,
    expireLeBaseDonnees, authentificationMfaObligatoire ? 0 : 1);
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
      double_facteur_actif: utilisateur.double_facteur_actif === 1,
      mfa_setup_requis: authentificationMfaObligatoire && utilisateur.double_facteur_actif !== 1,
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
      double_facteur_actif: utilisateur.double_facteur_actif === 1,
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

routesAuth.get("/mfa/statut", authMiddleware, (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role === "DELEGUE_PROVINCIAL") return c.json({ requis: false, actif: false });
  return c.json({
    requis: true,
    actif: c.get("session").double_facteur_actif === 1,
    session_verifiee: c.get("session").mfa_verifiee === 1,
  });
});

routesAuth.post("/mfa/initialiser", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (!c.env.CLE_CHIFFREMENT_MFA) return c.json({ erreur: "La configuration de sécurité MFA est indisponible." }, 503);
  if (session.utilisateur.role === "DELEGUE_PROVINCIAL" || session.double_facteur_actif === 1 || session.mfa_verifiee === 1) {
    return c.json({ erreur: "La configuration MFA n’est pas disponible pour cette session." }, 409);
  }
  const secret = genererSecretTotp();
  let secretChiffre: string;
  try {
    secretChiffre = await chiffrerSecretTotp(secret, c.env.CLE_CHIFFREMENT_MFA);
  } catch {
    return c.json({ erreur: "La configuration de chiffrement MFA est invalide." }, 503);
  }
  const miseAJour = c.env.DB.prepare(
    `UPDATE utilisateurs SET double_facteur_secret_temporaire = ?, modifie_le = datetime('now')
     WHERE id = ? AND role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL') AND double_facteur_actif = 0`,
  ).bind(secretChiffre, session.utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur,
    action: "INITIALISATION_MFA",
    entiteType: "AUTHENTIFICATION_MFA",
    entiteId: session.utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
  });
  const resultats = await c.env.DB.batch([miseAJour, audit]);
  if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "La configuration MFA a déjà été activée ou modifiée." }, 409);
  return c.json({
    secret_totp: secret,
    uri_provisionnement: uriProvisionnementTotp(secret, session.utilisateur.identifiant),
    algorithme: "SHA1",
    chiffres: 6,
    periode_secondes: 30,
  });
});

routesAuth.post("/mfa/confirmer", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (!c.env.CLE_CHIFFREMENT_MFA || session.utilisateur.role === "DELEGUE_PROVINCIAL" || session.double_facteur_actif === 1) {
    return c.json({ erreur: "La confirmation MFA n’est pas disponible pour cette session." }, 409);
  }
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const code = typeof corps === "object" && corps !== null && "code" in corps && typeof Reflect.get(corps, "code") === "string"
    ? Reflect.get(corps, "code") as string
    : "";
  const secretLigne = await c.env.DB.prepare(
    "SELECT double_facteur_secret_temporaire FROM utilisateurs WHERE id = ? AND double_facteur_actif = 0",
  ).bind(session.utilisateur.id).first<{ double_facteur_secret_temporaire: string | null }>();
  if (!secretLigne?.double_facteur_secret_temporaire) return c.json({ erreur: "Initialisez d’abord le dispositif MFA." }, 409);
  let secret: string;
  try {
    secret = await dechiffrerSecretTotp(secretLigne.double_facteur_secret_temporaire, c.env.CLE_CHIFFREMENT_MFA);
  } catch {
    return c.json({ erreur: "Le secret temporaire MFA ne peut pas être vérifié." }, 503);
  }
  const compteur = await verifierCodeTotp(secret, code);
  if (compteur === null) return c.json({ erreur: "Le code de vérification est invalide ou expiré." }, 400);

  const codesRecuperation = genererCodesRecuperation();
  const empreintes = await Promise.all(codesRecuperation.map((codeRecuperation) => hacherJeton(normaliserCodeRecuperation(codeRecuperation))));
  const identifiantOperation = creerCodeOperation();
  const utiliserCompteur = c.env.DB.prepare(
    "INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)",
  ).bind(session.utilisateur.id, compteur, identifiantOperation);
  const activer = c.env.DB.prepare(
    `UPDATE utilisateurs SET double_facteur_secret = double_facteur_secret_temporaire,
       double_facteur_secret_temporaire = NULL, double_facteur_actif = 1, modifie_le = datetime('now')
     WHERE id = ? AND double_facteur_actif = 0 AND double_facteur_secret_temporaire = ?`,
  ).bind(session.utilisateur.id, secretLigne.double_facteur_secret_temporaire);
  const validerSession = c.env.DB.prepare(
    `UPDATE sessions SET mfa_verifiee = 1
     WHERE id = ? AND utilisateur_id = ? AND mfa_verifiee = 0
       AND EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND double_facteur_actif = 1
         AND double_facteur_secret = ?)`,
  ).bind(session.id, session.utilisateur.id, session.utilisateur.id, secretLigne.double_facteur_secret_temporaire);
  const insererRecuperation = c.env.DB.prepare(
    `INSERT INTO codes_recuperation_mfa (empreinte_code, utilisateur_id)
     SELECT json_extract(value, '$.empreinte'), ? FROM json_each(?)
     WHERE EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND double_facteur_actif = 1)
       AND NOT EXISTS (SELECT 1 FROM codes_recuperation_mfa WHERE utilisateur_id = ?)`
  ).bind(session.utilisateur.id, JSON.stringify(empreintes.map((empreinte) => ({ empreinte }))), session.utilisateur.id, session.utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur,
    action: "ACTIVATION_MFA",
    entiteType: "AUTHENTIFICATION_MFA",
    entiteId: session.utilisateur.id,
    adresseIp: adresseIp(c.req.raw),
    donneesApres: JSON.stringify({ actif: true, nombre_codes_recuperation: codesRecuperation.length }),
  });
  const resultats = await c.env.DB.batch([utiliserCompteur, activer, validerSession, insererRecuperation, audit]);
  if (resultats[1]?.meta.changes !== 1 || resultats[2]?.meta.changes !== 1) {
    return c.json({ erreur: "La configuration MFA a déjà été confirmée dans cette session." }, 409);
  }
  return c.json({ actif: true, codes_recuperation: codesRecuperation });
});

routesAuth.post("/mfa/verifier", csrfPreAuthMiddleware, async (c) => {
  const jetonDefi = lireCookie(c.req.raw, "sigad_mfa_challenge");
  if (!jetonDefi) return c.json({ erreur: "Le défi MFA a expiré. Recommencez la connexion." }, 401);
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const code = typeof corps === "object" && corps !== null && "code" in corps && typeof Reflect.get(corps, "code") === "string"
    ? (Reflect.get(corps, "code") as string).trim()
    : "";
  const defi = await c.env.DB.prepare(
    `SELECT d.id, d.utilisateur_id, d.tentatives, u.identifiant, u.nom_complet, u.role, u.province_id,
            u.doit_changer_mot_de_passe, u.double_facteur_secret, u.double_facteur_actif, u.statut
     FROM defis_mfa d INNER JOIN utilisateurs u ON u.id = d.utilisateur_id
     WHERE d.jeton_hash = ? AND d.expire_le > datetime('now') AND d.consomme = 0
       AND d.tentatives < 5 AND u.statut = 'ACTIF' AND u.double_facteur_actif = 1`,
  ).bind(await hacherJeton(jetonDefi)).first<{
    id: string; utilisateur_id: string; tentatives: number; identifiant: string; nom_complet: string;
    role: "PROPRIETAIRE" | "ADMIN_CENTRAL"; province_id: string | null; doit_changer_mot_de_passe: number;
    double_facteur_secret: string | null; double_facteur_actif: number; statut: "ACTIF";
  }>();
  if (!defi || !defi.double_facteur_secret || !c.env.CLE_CHIFFREMENT_MFA) {
    return c.json({ erreur: "Le défi MFA est invalide, expiré ou déjà utilisé." }, 401);
  }
  const jetonCsrf = c.req.header("X-CSRF-Token");
  if (!jetonCsrf) return c.json({ erreur: "La vérification de sécurité a échoué." }, 403);

  let secret: string;
  try {
    secret = await dechiffrerSecretTotp(defi.double_facteur_secret, c.env.CLE_CHIFFREMENT_MFA);
  } catch {
    return c.json({ erreur: "Le dispositif MFA associé au compte est indisponible." }, 503);
  }
  const compteurTotp = await verifierCodeTotp(secret, code);
  const operationId = crypto.randomUUID();
  const idSession = crypto.randomUUID();
  const jetonSession = genererJetonAleatoire();
  const empreinteSession = await hacherJeton(jetonSession);
  const expiration = new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, "");
  const authentification = compteurTotp === null
    ? await hacherJeton(normaliserCodeRecuperation(code))
    : null;

  try {
    const instructions: D1PreparedStatement[] = [];
    if (compteurTotp !== null) {
      instructions.push(c.env.DB.prepare(
        "DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = ? AND compteur < ?",
      ).bind(defi.utilisateur_id, compteurTotp - 1));
      instructions.push(c.env.DB.prepare(
        "INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)",
      ).bind(defi.utilisateur_id, compteurTotp, operationId));
    } else {
      instructions.push(c.env.DB.prepare(
        `UPDATE codes_recuperation_mfa SET utilise_le = datetime('now'), operation_id = ?
         WHERE utilisateur_id = ? AND empreinte_code = ? AND utilise_le IS NULL`,
      ).bind(operationId, defi.utilisateur_id, authentification));
    }
    instructions.push(c.env.DB.prepare(
      `INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, adresse_ip, agent_utilisateur, expire_le, mfa_verifiee)
       SELECT ?, d.utilisateur_id, ?, ?, ?, ?, ?, 1 FROM defis_mfa d
       WHERE d.id = ? AND d.consomme = 0 AND d.expire_le > datetime('now') AND d.tentatives < 5
         AND EXISTS (SELECT 1 FROM utilisateurs u WHERE u.id = d.utilisateur_id AND u.statut = 'ACTIF' AND u.double_facteur_actif = 1)
         AND EXISTS (SELECT 1 FROM ${compteurTotp === null ? "codes_recuperation_mfa" : "compteurs_totp_utilises"} c
           WHERE c.utilisateur_id = d.utilisateur_id AND c.operation_id = ?)`
    ).bind(idSession, empreinteSession, jetonCsrf, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null, expiration, defi.id, operationId));
    instructions.push(c.env.DB.prepare(
      "UPDATE defis_mfa SET consomme = 1 WHERE id = ? AND consomme = 0 AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)",
    ).bind(defi.id, idSession));
    instructions.push(c.env.DB.prepare(
      `UPDATE utilisateurs SET tentatives_echouees = 0, verrouille_jusqua = NULL, derniere_connexion = datetime('now'), modifie_le = datetime('now')
       WHERE id = ? AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)`,
    ).bind(defi.utilisateur_id, idSession));
    instructions.push(c.env.DB.prepare(
      `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, adresse_ip, agent_utilisateur)
       SELECT ?, ?, ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?)`,
    ).bind(crypto.randomUUID(), defi.identifiant, defi.utilisateur_id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null, idSession));
    instructions.push(c.env.DB.prepare(
      `INSERT INTO journaux_audit (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, adresse_ip)
       SELECT ?, ?, ?, ?, 'CONNEXION_MFA_REUSSIE', 'AUTHENTIFICATION_MFA', ?, ?
       WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?)`
    ).bind(crypto.randomUUID(), defi.utilisateur_id, defi.role, defi.province_id, defi.id, adresseIp(c.req.raw), idSession));
    const resultats = await c.env.DB.batch(instructions);
    const indexSession = compteurTotp === null ? 1 : 2;
    if (resultats[indexSession]?.meta.changes !== 1) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE defis_mfa SET tentatives = tentatives + 1 WHERE id = ? AND consomme = 0 AND tentatives < 5").bind(defi.id),
        c.env.DB.prepare(
          `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, motif_echec, adresse_ip, agent_utilisateur)
           VALUES (?, ?, ?, 0, 'MFA_INVALIDE_OU_REUTILISE', ?, ?)`
        ).bind(crypto.randomUUID(), defi.identifiant, defi.utilisateur_id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null),
      ]);
      return c.json({ erreur: "Le code MFA est invalide, expiré ou déjà utilisé." }, 401);
    }
  } catch {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE defis_mfa SET tentatives = tentatives + 1 WHERE id = ? AND consomme = 0 AND tentatives < 5").bind(defi.id),
      c.env.DB.prepare(
        `INSERT INTO evenements_connexion (id, identifiant_tente, utilisateur_id, succes, motif_echec, adresse_ip, agent_utilisateur)
         VALUES (?, ?, ?, 0, 'MFA_INVALIDE_OU_REUTILISE', ?, ?)`
      ).bind(crypto.randomUUID(), defi.identifiant, defi.utilisateur_id, adresseIp(c.req.raw), c.req.header("User-Agent") ?? null),
    ]);
    return c.json({ erreur: "Le code MFA est invalide, expiré ou déjà utilisé." }, 401);
  }

  const expireLe = new Date(Date.now() + DELAI_SESSION_HEURES * 60 * 60 * 1000).toISOString();
  c.header("Set-Cookie", cookieSession(jetonSession, c.env.ENVIRONMENT));
  c.header("Set-Cookie", definirCookieCsrf(jetonCsrf, c.env.ENVIRONMENT), { append: true });
  c.header("Set-Cookie", effacerCookieDefiMfa(c.env.ENVIRONMENT), { append: true });
  return c.json({
    utilisateur: {
      id: defi.utilisateur_id,
      identifiant: defi.identifiant,
      nom_complet: defi.nom_complet,
      role: defi.role,
      province_id: defi.province_id,
      doit_changer_mot_de_passe: defi.doit_changer_mot_de_passe === 1,
      double_facteur_actif: true,
    },
    expire_le: expireLe,
  });
});

routesAuth.post("/mfa/reinitialiser/:utilisateurId", authMiddleware, csrfSessionMiddleware, async (c) => {
  const session = c.get("session");
  if (session.utilisateur.role !== "PROPRIETAIRE" || session.mfa_verifiee !== 1 || !c.env.CLE_CHIFFREMENT_MFA) {
    return c.json({ erreur: "Seul le propriétaire authentifié par MFA peut réinitialiser un autre compte." }, 403);
  }
  const cible = c.req.param("utilisateurId");
  if (cible === session.utilisateur.id) return c.json({ erreur: "La réinitialisation du compte propriétaire exige une procédure de récupération hors bande." }, 409);
  let corps: unknown;
  try { corps = await c.req.json(); } catch { return c.json({ erreur: "Le corps de la requête est invalide." }, 400); }
  const code = typeof corps === "object" && corps !== null && "code" in corps && typeof Reflect.get(corps, "code") === "string"
    ? Reflect.get(corps, "code") as string : "";
  const proprietaire = await c.env.DB.prepare("SELECT double_facteur_secret FROM utilisateurs WHERE id = ? AND role = 'PROPRIETAIRE' AND double_facteur_actif = 1")
    .bind(session.utilisateur.id).first<{ double_facteur_secret: string | null }>();
  if (!proprietaire?.double_facteur_secret) return c.json({ erreur: "Le dispositif MFA du propriétaire est indisponible." }, 503);
  const secret = await dechiffrerSecretTotp(proprietaire.double_facteur_secret, c.env.CLE_CHIFFREMENT_MFA);
  const compteur = await verifierCodeTotp(secret, code);
  if (compteur === null) return c.json({ erreur: "Le code MFA du propriétaire est invalide ou expiré." }, 401);
  const idOperation = crypto.randomUUID();
  const cibleExistante = await c.env.DB.prepare("SELECT id FROM utilisateurs WHERE id = ? AND role = 'ADMIN_CENTRAL'").bind(cible).first<{ id: string }>();
  if (!cibleExistante) return c.json({ erreur: "Le compte central demandé est introuvable." }, 404);
  const resultats = await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)").bind(session.utilisateur.id, compteur, idOperation),
    c.env.DB.prepare(
      `UPDATE utilisateurs SET double_facteur_secret = NULL, double_facteur_secret_temporaire = NULL,
       double_facteur_actif = 0, modifie_le = datetime('now') WHERE id = ? AND role = 'ADMIN_CENTRAL'`,
    ).bind(cible),
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(cible),
    c.env.DB.prepare("DELETE FROM codes_recuperation_mfa WHERE utilisateur_id = ?").bind(cible),
    c.env.DB.prepare("DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = ?").bind(cible),
    c.env.DB.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = ? AND consomme = 0").bind(cible),
    c.env.DB.prepare(
      `INSERT INTO journaux_audit (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, adresse_ip, donnees_apres)
       VALUES (?, ?, 'PROPRIETAIRE', NULL, 'REINITIALISATION_MFA', 'UTILISATEUR', ?, ?, ?)`
    ).bind(crypto.randomUUID(), session.utilisateur.id, cible, adresseIp(c.req.raw), JSON.stringify({ double_facteur_actif: false })),
  ]);
  if (resultats[1]?.meta.changes !== 1) return c.json({ erreur: "Le compte a changé pendant la réinitialisation." }, 409);
  return c.json({ message: "Le dispositif MFA du compte central a été réinitialisé. La prochaine connexion exigera une nouvelle configuration." });
});

export { routesAuth };
