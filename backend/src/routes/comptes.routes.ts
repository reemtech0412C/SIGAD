import { Hono, type Context } from "hono";
import type { EnvironnementApplication, SessionActive } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import {
  schemaChangementCourriel,
  schemaChangementMotDePasse,
  schemaCreationCompteConsultation,
  schemaInscriptionDelegue,
  schemaModificationPerimetreConsultation,
  schemaPaginationComptes,
  schemaProfilPersonnel,
  schemaRenvoiCodeCourriel,
  schemaValidationNouveauCourriel,
  schemaVerificationCourriel,
  schemaDecisionCompte,
} from "../../../shared/validations/comptes";
import { hacherMotDePasse, verifierMotDePasse, genererJetonAleatoire } from "../services/cryptographie.service";
import { envoyerCourriel, envoyerCodeVerification, courrielEstConfigure } from "../services/courriel.service";
import { empreinteCodeVerification, empreinteLimite, genererCodeSixChiffres, verifierLimiteAction } from "../services/verification-courriel.service";

const routesPublics = new Hono<EnvironnementApplication>();
const routesCompte = new Hono<EnvironnementApplication>();
const routesAdministration = new Hono<EnvironnementApplication>();
const MAX_AGE_CODE_SECONDES = 5 * 60;
const MAX_AGE_ACTIVATION_MINUTES = 15;

interface InscriptionDelegueD1 {
  id: string;
  nom_complet: string;
  province_id: string;
  province: string;
  courriel: string;
  telephone: string;
  statut: string;
  courriel_verifie_le: string | null;
  conflit_delegation: number;
  cree_le: string;
  utilisateur_cree_id: string | null;
  delegue_actif_id?: string | null;
}

interface CompteConsultationD1 {
  id: string;
  utilisateur_id: string;
  identifiant: string;
  nom_complet: string;
  courriel: string | null;
  telephone: string | null;
  institution: string;
  fonction: string;
  perimetre: "NATIONAL" | "PROVINCIAL" | "MULTI_PROVINCIAL";
  statut: "INVITE" | "ACTIF" | "SUSPENDU";
  cree_le: string;
  derniere_connexion: string | null;
}

function ipRequete(c: Context<EnvironnementApplication>): string {
  return c.req.header("CF-Connecting-IP") ?? "inconnu";
}

function configurationCourriel(c: Context<EnvironnementApplication>) {
  return {
    ...(c.env.RESEND_API_KEY ? { RESEND_API_KEY: c.env.RESEND_API_KEY } : {}),
    ...(c.env.SIGAD_EMAIL_FROM ? { SIGAD_EMAIL_FROM: c.env.SIGAD_EMAIL_FROM } : {}),
    ...(c.env.SIGAD_EMAIL_API_URL ? { SIGAD_EMAIL_API_URL: c.env.SIGAD_EMAIL_API_URL } : {}),
    ...(c.env.SIGAD_EMAIL_PROVIDER ? { SIGAD_EMAIL_PROVIDER: c.env.SIGAD_EMAIL_PROVIDER } : {}),
  };
}

function livraisonCourrielActive(c: Context<EnvironnementApplication>): boolean {
  return c.env.EMAIL_DELIVERY_ENABLED === "true";
}

function courrielVerifiable(c: Context<EnvironnementApplication>): boolean {
  return livraisonCourrielActive(c) && Boolean(c.env.SIGAD_OTP_HMAC_SECRET)
    && courrielEstConfigure(configurationCourriel(c));
}

async function empreinteLimiteSansSecret(portee: string, valeur: string): Promise<string> {
  const entree = new TextEncoder().encode(`${portee}\u0000${valeur}`);
  const empreinte = new Uint8Array(await crypto.subtle.digest("SHA-256", entree));
  return Array.from(empreinte, (octet) => octet.toString(16).padStart(2, "0")).join("");
}

function echapperHtml(texte: string): string {
  return texte.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function dateSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function analyserCorps<T>(corps: unknown, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }):
  { success: true; data: T } | { success: false; message: string } {
  const resultat = schema.safeParse(corps);
  return resultat.success
    ? resultat
    : { success: false, message: resultat.error.issues[0]?.message ?? "Les données transmises sont invalides." };
}

async function lireJson(c: Context<EnvironnementApplication>): Promise<unknown | null> {
  try { return await c.req.json(); } catch { return null; }
}

function erreurSchema(c: Context<EnvironnementApplication>, message: string) {
  return c.json({ erreur: message }, 400);
}

function erreurCourrielIndisponible(c: Context<EnvironnementApplication>) {
  if (!livraisonCourrielActive(c)) {
    return c.json({ erreur: "La vérification par e-mail est désactivée; aucune vérification ni aucun envoi n’a été effectué." }, 409);
  }
  return c.json({ erreur: "Le service de vérification par e-mail est momentanément indisponible." }, 503);
}

async function verifierConfigurationOtp(secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  try {
    await empreinteLimite(secret, "controle", "configuration");
    return true;
  } catch {
    return false;
  }
}

async function limiterAction(
  c: Context<EnvironnementApplication>,
  secret: string,
  action: string,
  empreinteValeur: string,
  maximum: number,
  fenetre: number,
): Promise<boolean> {
  const empreinte = await empreinteLimite(secret, action, empreinteValeur);
  return verifierLimiteAction(c.env.DB, empreinte, maximum, fenetre);
}

async function authentificationRecente(c: Context<EnvironnementApplication>, session: SessionActive): Promise<boolean> {
  const ligne = await c.env.DB.prepare(`SELECT 1 AS valide FROM sessions
    WHERE id = ? AND utilisateur_id = ? AND revoquee = 0 AND expire_le > datetime('now')
      AND cree_le >= datetime('now', '-10 minutes') AND (? = 0 OR mfa_verifiee = 1)`)
    .bind(session.id, session.utilisateur.id, session.double_facteur_actif).first<{ valide: number }>();
  return ligne?.valide === 1;
}

async function creerVerificationCourriel(
  c: Context<EnvironnementApplication>,
  entree: { inscriptionId?: string; utilisateurId?: string; type: "INSCRIPTION_DELEGUE" | "MODIFICATION_PROFIL"; courriel: string },
): Promise<{ id: string; code: string }> {
  const secret = c.env.SIGAD_OTP_HMAC_SECRET;
  if (!secret) throw new Error("SECRET_OTP_NON_CONFIGURE");
  const id = crypto.randomUUID();
  const code = genererCodeSixChiffres();
  const cible = entree.inscriptionId ?? `${entree.utilisateurId}:${entree.courriel}`;
  const empreinte = await empreinteCodeVerification(secret, entree.type, cible, code);
  const expiration = dateSqlite(new Date(Date.now() + MAX_AGE_CODE_SECONDES * 1000));
  const commandes = [
    c.env.DB.prepare(`UPDATE verifications_courriel SET consomme_le = datetime('now')
      WHERE ${entree.inscriptionId ? "inscription_id = ?" : "utilisateur_id = ? AND type_verification = ?"}
        AND consomme_le IS NULL`)
      .bind(...(entree.inscriptionId ? [entree.inscriptionId] : [entree.utilisateurId ?? "", entree.type])),
    c.env.DB.prepare(`INSERT INTO verifications_courriel
      (id, inscription_id, utilisateur_id, type_verification, courriel_cible, empreinte_code, expire_le)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, entree.inscriptionId ?? null, entree.utilisateurId ?? null, entree.type, entree.courriel, empreinte, expiration),
  ];
  await c.env.DB.batch(commandes);
  return { id, code };
}

async function envoyerInvitation(
  c: Context<EnvironnementApplication>,
  destinataire: string,
  identifiant: string,
  code: string,
  role: "DELEGUE_PROVINCIAL" | "CONSULTATION_INSTITUTIONNELLE",
): Promise<void> {
  const intro = role === "DELEGUE_PROVINCIAL"
    ? "Votre demande d’accès à SIGAD a été approuvée par l’administration centrale."
    : "Vous avez été invité à consulter les informations SIGAD selon le périmètre autorisé.";
  const texte = `${intro}\n\nIdentifiant : ${identifiant}\nCode d’activation : ${code}\n\nCe code à usage unique expire dans quinze minutes. Après connexion, choisissez un nouveau mot de passe et configurez l’authentification multifacteur si elle est demandée.`;
  const html = `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#172b4d"><h1>SIGAD</h1><p>${echapperHtml(intro)}</p><p>Identifiant : <strong>${echapperHtml(identifiant)}</strong></p><p>Code d’activation : <strong>${echapperHtml(code)}</strong></p><p>Ce code à usage unique expire dans quinze minutes. Après connexion, choisissez un nouveau mot de passe et configurez l’authentification multifacteur si elle est demandée.</p></main>`;
  await envoyerCourriel(configurationCourriel(c), {
    destinataire,
    sujet: "Activation de votre compte SIGAD",
    texte,
    contenuHtml: html,
    identifiantEnvoi: crypto.randomUUID(),
  });
}

routesPublics.get("/provinces", async (c) => {
  const provinces = await c.env.DB.prepare("SELECT id, nom FROM provinces ORDER BY nom COLLATE NOCASE, id")
    .all<{ id: string; nom: string }>();
  return c.json({
    elements: provinces.results,
    livraison_courriel_active: livraisonCourrielActive(c),
    verification_courriel_active: courrielVerifiable(c),
  });
});

routesPublics.post("/", async (c) => {
  const secret = c.env.SIGAD_OTP_HMAC_SECRET;
  const emailActif = livraisonCourrielActive(c);
  if (emailActif && (!secret || !courrielEstConfigure(configurationCourriel(c)) || !(await verifierConfigurationOtp(secret)))) {
    return erreurCourrielIndisponible(c);
  }
  const corps = await lireJson(c);
  const resultat = analyserCorps(corps, schemaInscriptionDelegue);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = crypto.randomUUID();
  const courriel = resultat.data.courriel.toLocaleLowerCase("fr-FR");
  const empreinteIp = emailActif && secret
    ? await empreinteLimite(secret, "INSCRIPTION_IP", ipRequete(c))
    : await empreinteLimiteSansSecret("INSCRIPTION_IP", ipRequete(c));
  if (!(await verifierLimiteAction(c.env.DB, empreinteIp, 5, 900))) {
    return c.json({ erreur: "Trop de demandes ont été reçues. Réessayez plus tard." }, 429);
  }
  if (emailActif && secret) {
    const empreinteCourriel = await empreinteLimite(secret, "INSCRIPTION_COURRIEL", courriel);
    if (!(await verifierLimiteAction(c.env.DB, empreinteCourriel, 3, 3600))) {
      return c.json({ message: "Si l’adresse peut être utilisée, les instructions de vérification seront envoyées.", verification_requise: true }, 202);
    }
  }
  const province = await c.env.DB.prepare("SELECT id FROM provinces WHERE id = ?")
    .bind(resultat.data.province_id).first<{ id: string }>();
  if (!province) return erreurSchema(c, "La province sélectionnée est invalide.");

  const existe = await c.env.DB.prepare(`SELECT 1 AS present FROM utilisateurs WHERE lower(trim(courriel)) = ?
      UNION ALL SELECT 1 FROM inscriptions_delegues WHERE lower(trim(courriel)) = ?
        AND statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION') LIMIT 1`)
    .bind(courriel, courriel).first<{ present: number }>();
  if (existe) return c.json({ message: "Si l’adresse peut être utilisée, les instructions de vérification seront envoyées.", reference: id }, 202);

  const hash = await hacherMotDePasse(resultat.data.mot_de_passe);
  const code = emailActif ? genererCodeSixChiffres() : null;
  const empreinteCode = emailActif && secret && code
    ? await empreinteCodeVerification(secret, "INSCRIPTION_DELEGUE", id, code)
    : null;
  const expiration = emailActif ? dateSqlite(new Date(Date.now() + MAX_AGE_CODE_SECONDES * 1000)) : null;
  const statutInitial = emailActif ? "EMAIL_NON_VERIFIE" : "EN_ATTENTE_APPROBATION";
  const commandes = [
    c.env.DB.prepare(`INSERT INTO inscriptions_delegues
      (id, nom_complet, province_id, courriel, telephone, mot_de_passe_hash, statut, conflit_delegation)
      SELECT ?, ?, ?, ?, ?, ?, ?, EXISTS(SELECT 1 FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL' AND province_id = ? AND statut = 'ACTIF')`)
      .bind(id, resultat.data.nom_complet, province.id, courriel, resultat.data.telephone, hash, statutInitial, province.id),
    c.env.DB.prepare("INSERT INTO journaux_inscriptions (id, inscription_id, action) VALUES (?, ?, 'INSCRIPTION_RECUE')")
      .bind(crypto.randomUUID(), id),
  ];
  if (emailActif && empreinteCode && expiration) {
    commandes.splice(1, 0, c.env.DB.prepare(`INSERT INTO verifications_courriel
      (id, inscription_id, type_verification, courriel_cible, empreinte_code, expire_le)
      SELECT ?, ?, 'INSCRIPTION_DELEGUE', ?, ?, ? WHERE EXISTS (SELECT 1 FROM inscriptions_delegues WHERE id = ?)`)
      .bind(crypto.randomUUID(), id, courriel, empreinteCode, expiration, id));
  }
  try {
    await c.env.DB.batch(commandes);
  } catch {
    return c.json({ message: "Si la demande est admissible, l’administration centrale procédera à son examen.", verification_requise: emailActif }, 202);
  }
  if (!emailActif) {
    return c.json({
      message: "Votre demande est en attente de validation administrative. L’adresse e-mail reste non vérifiée et aucun accès aux données n’est accordé avant approbation.",
      verification_requise: false,
    }, 202);
  }
  try {
    await envoyerCodeVerification(configurationCourriel(c), {
      destinataire: courriel,
      code: code ?? "",
      identifiantEnvoi: `sigad-inscription-${id}`,
      sujet: "Vérification de votre adresse e-mail — SIGAD",
      introduction: "Pour poursuivre votre demande de création de compte délégué provincial, saisissez le code ci-dessous.",
    });
    await c.env.DB.batch([c.env.DB.prepare("INSERT INTO journaux_inscriptions (id, inscription_id, action) VALUES (?, ?, 'CODE_ENVOYE')")
      .bind(crypto.randomUUID(), id)]);
  } catch {
    await c.env.DB.batch([c.env.DB.prepare("UPDATE verifications_courriel SET consomme_le = datetime('now') WHERE inscription_id = ? AND consomme_le IS NULL")
      .bind(id)]);
  }
  return c.json({
    message: "Si l’adresse peut être utilisée, les instructions de vérification seront envoyées.",
    reference: id,
    verification_requise: true,
  }, 202);
});

routesPublics.post("/verifier-courriel", async (c) => {
  const secret = c.env.SIGAD_OTP_HMAC_SECRET;
  if (!courrielVerifiable(c) || !secret || !(await verifierConfigurationOtp(secret))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaVerificationCourriel);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  if (!(await limiterAction(c, secret, "VERIFICATION_IP", ipRequete(c), 12, 900))) {
    return c.json({ erreur: "Trop de tentatives ont été effectuées. Réessayez plus tard." }, 429);
  }
  const inscriptionId = resultat.data.inscription_id ?? (await c.env.DB.prepare(`SELECT id FROM inscriptions_delegues
      WHERE lower(trim(courriel)) = ? AND statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION')
        AND courriel_verifie_le IS NULL ORDER BY cree_le DESC LIMIT 1`)
    .bind(resultat.data.courriel?.toLocaleLowerCase("fr-FR") ?? "")
    .first<{ id: string }>())?.id;
  if (!inscriptionId) return c.json({ erreur: "Le code est invalide, expiré ou déjà utilisé." }, 400);
  const empreinte = await empreinteCodeVerification(secret, "INSCRIPTION_DELEGUE", inscriptionId, resultat.data.code);
  const verification = await c.env.DB.prepare(`SELECT v.id FROM verifications_courriel v
      INNER JOIN inscriptions_delegues i ON i.id = v.inscription_id
      WHERE v.inscription_id = ? AND v.type_verification = 'INSCRIPTION_DELEGUE'
        AND v.empreinte_code = ? AND v.consomme_le IS NULL AND v.expire_le > datetime('now')
        AND v.tentatives < 5 AND i.statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION')
        AND i.courriel_verifie_le IS NULL`)
    .bind(inscriptionId, empreinte).first<{ id: string }>();
  if (!verification) {
    await c.env.DB.batch([c.env.DB.prepare(`UPDATE verifications_courriel SET tentatives = tentatives + 1,
      consomme_le = CASE WHEN tentatives + 1 >= 5 THEN datetime('now') ELSE consomme_le END
      WHERE inscription_id = ? AND consomme_le IS NULL AND tentatives < 5`)
      .bind(inscriptionId)]);
    return c.json({ erreur: "Le code est invalide, expiré ou déjà utilisé." }, 400);
  }
  const commandes = [
    c.env.DB.prepare(`UPDATE inscriptions_delegues SET statut = 'EN_ATTENTE_APPROBATION',
      courriel_verifie_le = datetime('now'), modifie_le = datetime('now')
      WHERE id = ? AND statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION')
        AND courriel_verifie_le IS NULL AND EXISTS (
        SELECT 1 FROM verifications_courriel WHERE id = ? AND consomme_le IS NULL AND expire_le > datetime('now')
          AND empreinte_code = ? AND tentatives < 5)`)
      .bind(inscriptionId, verification.id, empreinte),
    c.env.DB.prepare(`UPDATE verifications_courriel SET consomme_le = datetime('now')
      WHERE id = ? AND consomme_le IS NULL AND EXISTS (
        SELECT 1 FROM inscriptions_delegues WHERE id = ? AND statut = 'EN_ATTENTE_APPROBATION')`)
      .bind(verification.id, inscriptionId),
    c.env.DB.prepare(`INSERT INTO journaux_inscriptions (id, inscription_id, action)
      SELECT ?, ?, 'EMAIL_VERIFIE' WHERE EXISTS (SELECT 1 FROM inscriptions_delegues WHERE id = ? AND statut = 'EN_ATTENTE_APPROBATION')`)
      .bind(crypto.randomUUID(), inscriptionId, inscriptionId),
  ];
  const execution = await c.env.DB.batch(commandes);
  if (execution[0]?.meta.changes !== 1 || execution[1]?.meta.changes !== 1 || execution[2]?.meta.changes !== 1) {
    return c.json({ erreur: "Le code est invalide, expiré ou déjà utilisé." }, 409);
  }
  return c.json({ message: "Votre adresse e-mail est vérifiée. Votre demande attend l’approbation de l’administration centrale." });
});

routesPublics.post("/renvoyer-code", async (c) => {
  const secret = c.env.SIGAD_OTP_HMAC_SECRET;
  if (!courrielVerifiable(c) || !secret || !(await verifierConfigurationOtp(secret))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaRenvoiCodeCourriel);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  if (!(await limiterAction(c, secret, "RENVOI_IP", ipRequete(c), 5, 900))) {
    return c.json({ message: "Si une demande admissible existe, un nouveau code sera envoyé." }, 202);
  }
  const email = resultat.data.courriel.toLocaleLowerCase("fr-FR");
  const demande = await c.env.DB.prepare(`SELECT id FROM inscriptions_delegues WHERE lower(trim(courriel)) = ?
    AND statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION') AND courriel_verifie_le IS NULL
    ORDER BY cree_le DESC LIMIT 1`).bind(email).first<{ id: string }>();
  if (demande) {
    try {
      const code = genererCodeSixChiffres();
      const empreinte = await empreinteCodeVerification(secret, "INSCRIPTION_DELEGUE", demande.id, code);
      const expiration = dateSqlite(new Date(Date.now() + MAX_AGE_CODE_SECONDES * 1000));
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE verifications_courriel SET consomme_le = datetime('now') WHERE inscription_id = ? AND consomme_le IS NULL").bind(demande.id),
        c.env.DB.prepare(`INSERT INTO verifications_courriel (id, inscription_id, type_verification, courriel_cible, empreinte_code, expire_le)
          SELECT ?, id, 'INSCRIPTION_DELEGUE', courriel, ?, ? FROM inscriptions_delegues
          WHERE id = ? AND statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION') AND courriel_verifie_le IS NULL`)
          .bind(crypto.randomUUID(), empreinte, expiration, demande.id),
      ]);
      await envoyerCodeVerification(configurationCourriel(c), {
        destinataire: email, code, identifiantEnvoi: `sigad-inscription-renvoi-${crypto.randomUUID()}`,
        sujet: "Nouveau code de vérification — SIGAD", introduction: "Voici votre nouveau code de vérification.",
      });
    } catch {
      return erreurCourrielIndisponible(c);
    }
  }
  return c.json({ message: "Si une demande admissible existe, un nouveau code sera envoyé." }, 202);
});

routesCompte.get("/", async (c) => {
  const utilisateur = c.get("utilisateur");
  const ligne = await c.env.DB.prepare(`SELECT u.id, u.identifiant, u.nom_complet, u.courriel, u.telephone,
      u.role, u.province_id, p.nom AS province, u.statut, u.courriel_verifie_le, u.doit_changer_mot_de_passe,
      u.double_facteur_actif, u.cree_le, cc.institution, cc.fonction
    FROM utilisateurs u LEFT JOIN provinces p ON p.id = u.province_id
    LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id WHERE u.id = ?`)
    .bind(utilisateur.id).first<Record<string, unknown>>();
  if (!ligne) return c.json({ erreur: "Le compte est introuvable." }, 404);
  return c.json({ compte: { ...ligne, role: utilisateur.role, province_id: utilisateur.province_id,
    statut: utilisateur.statut, institution: utilisateur.institution ?? ligne.institution,
    fonction: utilisateur.fonction ?? ligne.fonction, perimetre_consultation: utilisateur.perimetre_consultation ?? null,
    provinces_autorisees: utilisateur.provinces_autorisees ?? [],
    modification_courriel_disponible: courrielVerifiable(c) } });
});

routesCompte.patch("/", async (c) => {
  const session = c.get("session");
  const resultat = analyserCorps(await lireJson(c), schemaProfilPersonnel);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const update = c.env.DB.prepare(`UPDATE utilisateurs SET nom_complet = ?, telephone = ?, modifie_le = datetime('now')
    WHERE id = ? AND statut = 'ACTIF'`)
    .bind(resultat.data.nom_complet, resultat.data.telephone, session.utilisateur.id);
  const audit = creerInstructionAudit(c.env.DB, {
    utilisateur: session.utilisateur, action: "MODIFICATION_PROFIL_PERSONNEL", entiteType: "UTILISATEUR",
    entiteId: session.utilisateur.id, adresseIp: ipRequete(c),
  });
  const resultats = await c.env.DB.batch([update, audit]);
  if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Le profil ne peut pas être modifié dans l’état actuel du compte." }, 409);
  return c.json({ message: "Votre profil a été mis à jour." });
});

routesCompte.post("/mot-de-passe", async (c) => {
  const session = c.get("session");
  const resultat = analyserCorps(await lireJson(c), schemaChangementMotDePasse);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  if (session.double_facteur_actif === 1 && session.mfa_verifiee !== 1) return c.json({ erreur: "Une vérification MFA récente est requise." }, 403);
  const ligne = await c.env.DB.prepare("SELECT mot_de_passe_hash FROM utilisateurs WHERE id = ? AND statut = 'ACTIF'")
    .bind(session.utilisateur.id).first<{ mot_de_passe_hash: string }>();
  if (!ligne || !(await verifierMotDePasse(resultat.data.mot_de_passe_actuel, ligne.mot_de_passe_hash))) {
    return c.json({ erreur: "Le mot de passe actuel est incorrect." }, 401);
  }
  const hash = await hacherMotDePasse(resultat.data.nouveau_mot_de_passe);
  const commandes = [
    c.env.DB.prepare("UPDATE utilisateurs SET mot_de_passe_hash = ?, modifie_le = datetime('now') WHERE id = ? AND mot_de_passe_hash = ? AND statut = 'ACTIF'")
      .bind(hash, session.utilisateur.id, ligne.mot_de_passe_hash),
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND id <> ? AND revoquee = 0")
      .bind(session.utilisateur.id, session.id),
    creerInstructionAudit(c.env.DB, { utilisateur: session.utilisateur, action: "CHANGEMENT_MOT_DE_PASSE", entiteType: "UTILISATEUR", entiteId: session.utilisateur.id, adresseIp: ipRequete(c) }),
  ];
  const resultats = await c.env.DB.batch(commandes);
  if (resultats[0]?.meta.changes !== 1) return c.json({ erreur: "Le mot de passe a changé simultanément. Reconnectez-vous." }, 409);
  return c.json({ message: "Votre mot de passe a été modifié. Les autres sessions ont été révoquées." });
});

routesCompte.get("/sessions", async (c) => {
  const session = c.get("session");
  const page = await c.env.DB.prepare(`SELECT id, agent_utilisateur, cree_le, expire_le,
      CASE WHEN id = ? THEN 1 ELSE 0 END AS session_courante
    FROM sessions WHERE utilisateur_id = ? AND revoquee = 0 AND expire_le > datetime('now')
    ORDER BY cree_le DESC, id LIMIT 50`)
    .bind(session.id, session.utilisateur.id).all<{ id: string; agent_utilisateur: string | null; cree_le: string; expire_le: string; session_courante: number }>();
  return c.json({ elements: page.results });
});

routesCompte.post("/sessions/revoquer-autres", async (c) => {
  const session = c.get("session");
  const resultat = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND id <> ? AND revoquee = 0")
      .bind(session.utilisateur.id, session.id),
    creerInstructionAudit(c.env.DB, { utilisateur: session.utilisateur, action: "REVOCATION_AUTRES_SESSIONS", entiteType: "UTILISATEUR", entiteId: session.utilisateur.id, adresseIp: ipRequete(c) }),
  ]);
  return c.json({ message: "Les autres sessions ont été révoquées.", sessions_revoquees: resultat[0]?.meta.changes ?? 0 });
});

routesCompte.post("/courriel", async (c) => {
  const session = c.get("session");
  const secret = c.env.SIGAD_OTP_HMAC_SECRET;
  if (!courrielVerifiable(c) || !secret || !(await verifierConfigurationOtp(secret))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaChangementCourriel);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  if (!(await authentificationRecente(c, session))) return c.json({ erreur: "Une authentification récente est requise. Reconnectez-vous puis réessayez." }, 403);
  const ligne = await c.env.DB.prepare("SELECT mot_de_passe_hash, courriel, courriel_verifie_le FROM utilisateurs WHERE id = ? AND statut = 'ACTIF'")
    .bind(session.utilisateur.id).first<{ mot_de_passe_hash: string; courriel: string | null; courriel_verifie_le: string | null }>();
  if (!ligne || !(await verifierMotDePasse(resultat.data.mot_de_passe_actuel, ligne.mot_de_passe_hash))) {
    return c.json({ erreur: "Le mot de passe actuel est incorrect." }, 401);
  }
  const nouvelEmail = resultat.data.nouveau_courriel.toLocaleLowerCase("fr-FR");
  if (nouvelEmail === ligne.courriel?.toLocaleLowerCase("fr-FR") && ligne.courriel_verifie_le) {
    return c.json({ erreur: "Cette adresse est déjà vérifiée pour votre compte." }, 409);
  }
  if (!(await limiterAction(c, secret, "CHANGEMENT_COURRIEL", session.utilisateur.id, 3, 3600))) return c.json({ erreur: "Trop de demandes de changement d’adresse." }, 429);
  const occupé = await c.env.DB.prepare("SELECT 1 AS present FROM utilisateurs WHERE lower(trim(courriel)) = ? AND id <> ?")
    .bind(nouvelEmail, session.utilisateur.id).first<{ present: number }>();
  if (occupé) return c.json({ message: "Si l’adresse peut être utilisée, un code de vérification lui sera envoyé." }, 202);
  const verification = await creerVerificationCourriel(c, { utilisateurId: session.utilisateur.id, type: "MODIFICATION_PROFIL", courriel: nouvelEmail });
  try {
    await envoyerCodeVerification(configurationCourriel(c), {
      destinataire: nouvelEmail, code: verification.code, identifiantEnvoi: `sigad-courriel-${verification.id}`,
      sujet: "Vérification de votre nouvelle adresse — SIGAD", introduction: "Saisissez ce code pour confirmer votre nouvelle adresse e-mail.",
    });
  } catch {
    await c.env.DB.batch([c.env.DB.prepare("UPDATE verifications_courriel SET consomme_le = datetime('now') WHERE id = ? AND consomme_le IS NULL").bind(verification.id)]);
    return erreurCourrielIndisponible(c);
  }
  return c.json({ message: "Un code de vérification a été envoyé à la nouvelle adresse." }, 202);
});

routesCompte.post("/courriel/verifier", async (c) => {
  const session = c.get("session");
  const secret = c.env.SIGAD_OTP_HMAC_SECRET;
  if (!courrielVerifiable(c) || !secret || !(await verifierConfigurationOtp(secret))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaValidationNouveauCourriel);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  if (!(await authentificationRecente(c, session))) return c.json({ erreur: "Une authentification récente est requise. Reconnectez-vous puis réessayez." }, 403);
  const verification = await c.env.DB.prepare(`SELECT id, courriel_cible, expire_le FROM verifications_courriel
    WHERE utilisateur_id = ? AND type_verification = 'MODIFICATION_PROFIL' AND consomme_le IS NULL
      AND expire_le > datetime('now') AND tentatives < 5 ORDER BY cree_le DESC LIMIT 1`)
    .bind(session.utilisateur.id).first<{ id: string; courriel_cible: string; expire_le: string }>();
  if (!verification) return c.json({ erreur: "Le code est invalide, expiré ou déjà utilisé." }, 400);
  const empreinte = await empreinteCodeVerification(secret, "MODIFICATION_PROFIL", `${session.utilisateur.id}:${verification.courriel_cible}`, resultat.data.code);
  const confirme = await c.env.DB.prepare(`SELECT id FROM verifications_courriel WHERE id = ? AND empreinte_code = ?
    AND consomme_le IS NULL AND expire_le > datetime('now') AND tentatives < 5`)
    .bind(verification.id, empreinte).first<{ id: string }>();
  if (!confirme) {
    await c.env.DB.batch([c.env.DB.prepare(`UPDATE verifications_courriel SET tentatives = tentatives + 1,
      consomme_le = CASE WHEN tentatives + 1 >= 5 THEN datetime('now') ELSE consomme_le END WHERE id = ? AND tentatives < 5 AND consomme_le IS NULL`)
      .bind(verification.id)]);
    return c.json({ erreur: "Le code est invalide, expiré ou déjà utilisé." }, 400);
  }
  const ancienneAdresse = await c.env.DB.prepare("SELECT courriel FROM utilisateurs WHERE id = ?")
    .bind(session.utilisateur.id).first<{ courriel: string | null }>();
  if (ancienneAdresse?.courriel && ancienneAdresse.courriel.toLocaleLowerCase("fr-FR") !== verification.courriel_cible.toLocaleLowerCase("fr-FR")
    && courrielEstConfigure(configurationCourriel(c))) {
    const message = `Une demande de modification de l’adresse e-mail de votre compte SIGAD a été confirmée. Si vous n’êtes pas à l’origine de cette opération, contactez immédiatement l’administration.`;
    try {
      await envoyerCourriel(configurationCourriel(c), {
        destinataire: ancienneAdresse.courriel, sujet: "Modification de l’adresse e-mail SIGAD",
        texte: message, contenuHtml: `<p>${echapperHtml(message)}</p>`, identifiantEnvoi: `sigad-alerte-courriel-${verification.id}`,
      });
    } catch {
      return c.json({ erreur: "L’ancienne adresse n’a pas pu être avertie. L’adresse n’a pas été modifiée; réessayez plus tard." }, 503);
    }
  }
  const commandes = [
    c.env.DB.prepare(`UPDATE utilisateurs SET courriel = ?, courriel_verifie_le = datetime('now'), modifie_le = datetime('now')
      WHERE id = ? AND statut = 'ACTIF' AND EXISTS (SELECT 1 FROM verifications_courriel WHERE id = ?
        AND empreinte_code = ? AND consomme_le IS NULL AND expire_le > datetime('now') AND tentatives < 5)`)
      .bind(verification.courriel_cible, session.utilisateur.id, verification.id, empreinte),
    c.env.DB.prepare(`UPDATE verifications_courriel SET consomme_le = datetime('now') WHERE id = ? AND consomme_le IS NULL
      AND EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND courriel = ?)`)
      .bind(verification.id, session.utilisateur.id, verification.courriel_cible),
    creerInstructionAudit(c.env.DB, { utilisateur: session.utilisateur, action: "MODIFICATION_COURRIEL_VERIFIEE", entiteType: "UTILISATEUR", entiteId: session.utilisateur.id, adresseIp: ipRequete(c) }),
  ];
  try {
    const resultats = await c.env.DB.batch(commandes);
    if (resultats[0]?.meta.changes !== 1 || resultats[1]?.meta.changes !== 1) return c.json({ erreur: "Le code a expiré ou l’adresse est déjà utilisée." }, 409);
  } catch {
    return c.json({ erreur: "Le code a expiré ou l’adresse est déjà utilisée." }, 409);
  }
  return c.json({ message: "Votre adresse e-mail a été vérifiée et mise à jour." });
});

function exigerAdministration(c: Context<EnvironnementApplication>): boolean {
  return c.get("utilisateur").role === "ADMIN_CENTRAL";
}

routesAdministration.get("/delegues", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const filtres = analyserCorps(Object.fromEntries(new URL(c.req.url).searchParams.entries()), schemaPaginationComptes);
  if (!filtres.success) return erreurSchema(c, filtres.message);
  const conditions = filtres.data.statut ? "WHERE i.statut = ?" : "";
  const valeurs: Array<string | number> = filtres.data.statut ? [filtres.data.statut, filtres.data.limite, filtres.data.decalage] : [filtres.data.limite, filtres.data.decalage];
  const [liste, total] = await Promise.all([
    c.env.DB.prepare(`SELECT i.id, i.nom_complet, i.province_id, p.nom AS province, i.courriel, i.telephone,
      i.statut, i.courriel_verifie_le, i.conflit_delegation, i.cree_le, i.utilisateur_cree_id,
      (SELECT u.id FROM utilisateurs u WHERE u.role = 'DELEGUE_PROVINCIAL' AND u.province_id = i.province_id AND u.statut = 'ACTIF' LIMIT 1) AS delegue_actif_id
      FROM inscriptions_delegues i INNER JOIN provinces p ON p.id = i.province_id ${conditions}
      ORDER BY i.cree_le DESC, i.id LIMIT ? OFFSET ?`).bind(...valeurs).all<InscriptionDelegueD1>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM inscriptions_delegues i ${conditions}`)
      .bind(...(filtres.data.statut ? [filtres.data.statut] : [])).first<{ total: number }>(),
  ]);
  return c.json({ elements: liste.results, total: total?.total ?? 0, limite: filtres.data.limite, decalage: filtres.data.decalage });
});

routesAdministration.get("/delegues/comptes", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const filtres = analyserCorps(Object.fromEntries(new URL(c.req.url).searchParams.entries()), schemaPaginationComptes);
  if (!filtres.success) return erreurSchema(c, filtres.message);
  const [liste, total] = await Promise.all([
    c.env.DB.prepare(`SELECT u.id, u.identifiant, u.nom_complet, u.courriel, u.courriel_verifie_le, u.telephone, u.province_id,
      p.nom AS province, u.statut, u.derniere_connexion, u.cree_le
      FROM utilisateurs u INNER JOIN provinces p ON p.id = u.province_id
      WHERE u.role = 'DELEGUE_PROVINCIAL' ORDER BY u.cree_le DESC, u.id LIMIT ? OFFSET ?`)
      .bind(filtres.data.limite, filtres.data.decalage).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL'")
      .first<{ total: number }>(),
  ]);
  return c.json({ elements: liste.results, total: total?.total ?? 0, limite: filtres.data.limite, decalage: filtres.data.decalage });
});

async function approuverInscription(c: Context<EnvironnementApplication>, inscriptionId: string, remplacementId: string | null) {
  const acteur = c.get("utilisateur");
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  if (resultat.data.verification_identite_administrative !== true) {
    return c.json({ erreur: "Confirmez que l’identité du demandeur a été vérifiée par une procédure administrative indépendante de l’e-mail." }, 400);
  }
  const emailActif = livraisonCourrielActive(c);
  if (emailActif && (!courrielEstConfigure(configurationCourriel(c)) || !c.env.SIGAD_OTP_HMAC_SECRET)) {
    return erreurCourrielIndisponible(c);
  }
  const inscription = await c.env.DB.prepare(`SELECT i.id, i.nom_complet, i.province_id, i.courriel, i.telephone,
      i.mot_de_passe_hash, i.statut, i.courriel_verifie_le, i.conflit_delegation
    FROM inscriptions_delegues i WHERE i.id = ?`).bind(inscriptionId)
    .first<InscriptionDelegueD1 & { mot_de_passe_hash: string }>();
  if (!inscription || inscription.statut !== "EN_ATTENTE_APPROBATION" || (emailActif && !inscription.courriel_verifie_le)) {
    return c.json({ erreur: "La demande est introuvable ou n’est pas admissible à une décision." }, 409);
  }
  const delegueActif = await c.env.DB.prepare(`SELECT id FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL'
    AND province_id = ? AND statut = 'ACTIF' LIMIT 1`).bind(inscription.province_id).first<{ id: string }>();
  if (delegueActif && !remplacementId) {
    return c.json({ erreur: "Un délégué actif existe déjà pour cette province. Utilisez la procédure documentée de remplacement." }, 409);
  }
  if (delegueActif && remplacementId !== delegueActif.id) {
    return c.json({ erreur: "Le remplacement doit viser le délégué actif de cette province." }, 409);
  }
  if (!delegueActif && remplacementId) return c.json({ erreur: "Aucun délégué actif ne peut être remplacé dans cette province." }, 409);
  const nouvelUtilisateurId = crypto.randomUUID();
  const identifiant = `delegue-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const codeActivation = emailActif ? genererJetonAleatoire(24) : null;
  const hashActivation = codeActivation ? await hacherMotDePasse(codeActivation) : null;
  const expiration = emailActif ? dateSqlite(new Date(Date.now() + MAX_AGE_ACTIVATION_MINUTES * 60 * 1000)) : null;
  const insertion = emailActif
    ? c.env.DB.prepare(`INSERT INTO utilisateurs
        (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, code_activation_hash,
         code_activation_expire_le, doit_changer_mot_de_passe, statut, courriel, telephone, courriel_verifie_le)
      SELECT ?, ?, ?, 'DELEGUE_PROVINCIAL', ?, ?, ?, ?, 1, 'ACTIF', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM inscriptions_delegues WHERE id = ? AND statut = 'EN_ATTENTE_APPROBATION'
        AND courriel_verifie_le IS NOT NULL AND utilisateur_cree_id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL'
          AND province_id = ? AND statut = 'ACTIF')`)
      .bind(nouvelUtilisateurId, identifiant, inscription.nom_complet, inscription.province_id, hashActivation ?? "",
        hashActivation ?? "", expiration ?? "", inscription.courriel, inscription.telephone, inscription.courriel_verifie_le,
        inscriptionId, inscription.province_id)
    : c.env.DB.prepare(`INSERT INTO utilisateurs
        (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, code_activation_hash,
         code_activation_expire_le, doit_changer_mot_de_passe, statut, courriel, telephone, courriel_verifie_le)
      SELECT ?, ?, ?, 'DELEGUE_PROVINCIAL', ?, ?, NULL, NULL, 0, 'ACTIF', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM inscriptions_delegues WHERE id = ? AND statut = 'EN_ATTENTE_APPROBATION'
        AND utilisateur_cree_id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL'
          AND province_id = ? AND statut = 'ACTIF')`)
      .bind(nouvelUtilisateurId, identifiant, inscription.nom_complet, inscription.province_id,
        inscription.mot_de_passe_hash, inscription.courriel, inscription.telephone, inscription.courriel_verifie_le,
        inscriptionId, inscription.province_id);
  const commandes: D1PreparedStatement[] = [];
  if (remplacementId) {
    commandes.push(c.env.DB.prepare(`UPDATE utilisateurs SET statut = 'SUSPENDU', modifie_le = datetime('now')
      WHERE id = ? AND role = 'DELEGUE_PROVINCIAL' AND province_id = ? AND statut = 'ACTIF'`)
      .bind(remplacementId, inscription.province_id));
    commandes.push(c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0")
      .bind(remplacementId));
  }
  commandes.push(insertion);
  commandes.push(c.env.DB.prepare(`UPDATE inscriptions_delegues SET statut = 'APPROUVEE', decide_par = ?, decide_le = datetime('now'),
    motif_decision = ?, utilisateur_cree_id = ?, modifie_le = datetime('now') WHERE id = ? AND statut = 'EN_ATTENTE_APPROBATION'
    AND utilisateur_cree_id IS NULL AND EXISTS (SELECT 1 FROM utilisateurs WHERE id = ? AND role = 'DELEGUE_PROVINCIAL')`)
    .bind(acteur.id, resultat.data.motif, nouvelUtilisateurId, inscriptionId, nouvelUtilisateurId));
  commandes.push(c.env.DB.prepare(`INSERT INTO decisions_comptes (id, acteur_id, inscription_id, utilisateur_cible_id, action, motif, details_json)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM utilisateurs WHERE id = ?)`)
    .bind(crypto.randomUUID(), acteur.id, inscriptionId, nouvelUtilisateurId,
      remplacementId ? "REMPLACEMENT_DELEGUE" : "APPROBATION_DELEGUE", resultat.data.motif,
      JSON.stringify({ ancien_delegue_id: remplacementId, verification_identite_administrative: true,
        verification_courriel: inscription.courriel_verifie_le ? "VERIFIEE" : "NON_VERIFIEE",
        acces_apres_decision: emailActif ? "CODE_ACTIVATION" : "MOT_DE_PASSE_INSCRIPTION" }), nouvelUtilisateurId));
  commandes.push(creerInstructionAudit(c.env.DB, { utilisateur: acteur,
    action: remplacementId ? "REMPLACEMENT_DELEGUE_PROVINCIAL" : "APPROBATION_DELEGUE_PROVINCIAL",
    entiteType: "INSCRIPTION_DELEGUE", entiteId: inscriptionId, adresseIp: ipRequete(c),
    donneesApres: JSON.stringify({ province_id: inscription.province_id, utilisateur_id: nouvelUtilisateurId, ancien_delegue_id: remplacementId }),
  }));
  commandes.push(c.env.DB.prepare(`INSERT INTO journaux_inscriptions (id, inscription_id, action)
    VALUES (?, ?, 'DECISION_ADMINISTRATIVE')`).bind(crypto.randomUUID(), inscriptionId));
  try {
    const executions = await c.env.DB.batch(commandes);
    const decalage = remplacementId ? 2 : 0;
    if (remplacementId && executions[0]?.meta.changes !== 1) return c.json({ erreur: "Le délégué actuel a changé. Actualisez la liste et réessayez." }, 409);
    if (executions[decalage]?.meta.changes !== 1 || executions[decalage + 1]?.meta.changes !== 1) {
      return c.json({ erreur: "La demande ou la province a changé. Aucune nouvelle délégation n’a été accordée." }, 409);
    }
  } catch {
    return c.json({ erreur: "Une délégation active existe déjà ou la décision n’a pas pu être enregistrée." }, 409);
  }
  if (emailActif && codeActivation) {
    try {
      await envoyerInvitation(c, inscription.courriel, identifiant, codeActivation, "DELEGUE_PROVINCIAL");
    } catch {
      return c.json({ message: "La demande est approuvée, mais l’invitation n’a pas pu être remise. Réémettez une invitation depuis la fiche du compte.", identifiant }, 202);
    }
    return c.json({ message: "La demande a été approuvée après vérification administrative. Une invitation d’activation a été envoyée.", identifiant }, 201);
  }
  return c.json({ message: "La demande a été approuvée après vérification administrative indépendante. Le délégué peut se connecter avec le mot de passe choisi lors de l’inscription.", identifiant }, 201);
}

routesAdministration.post("/delegues/:id/approuver", (c) => approuverInscription(c, c.req.param("id"), null));
routesAdministration.post("/delegues/:id/remplacer/:utilisateurId", (c) => approuverInscription(c, c.req.param("id"), c.req.param("utilisateurId")));

routesAdministration.post("/delegues/:id/refuser", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("id");
  const acteur = c.get("utilisateur");
  const commandes = [
    c.env.DB.prepare(`UPDATE inscriptions_delegues SET statut = 'REFUSEE', decide_par = ?, decide_le = datetime('now'),
      motif_decision = ?, modifie_le = datetime('now') WHERE id = ? AND statut = 'EN_ATTENTE_APPROBATION'`)
      .bind(acteur.id, resultat.data.motif, id),
    c.env.DB.prepare(`UPDATE verifications_courriel SET consomme_le = datetime('now') WHERE inscription_id = ? AND consomme_le IS NULL`)
      .bind(id),
    c.env.DB.prepare(`INSERT INTO decisions_comptes (id, acteur_id, inscription_id, action, motif)
      SELECT ?, ?, ?, 'REFUS_DELEGUE', ? WHERE EXISTS (SELECT 1 FROM inscriptions_delegues WHERE id = ? AND statut = 'REFUSEE' AND decide_par = ?)`)
      .bind(crypto.randomUUID(), acteur.id, id, resultat.data.motif, id, acteur.id),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "REFUS_DEMANDE_DELEGATION", entiteType: "INSCRIPTION_DELEGUE", entiteId: id, adresseIp: ipRequete(c) }),
  ];
  const executions = await c.env.DB.batch(commandes);
  if (executions[0]?.meta.changes !== 1) return c.json({ erreur: "La demande n’est pas en attente de décision." }, 409);
  return c.json({ message: "La demande a été refusée." });
});

async function changerStatutDelegue(c: Context<EnvironnementApplication>, statut: "ACTIF" | "SUSPENDU") {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("utilisateurId");
  if (!id) return c.json({ erreur: "Le compte délégué est introuvable." }, 404);
  const acteur = c.get("utilisateur");
  const cible = await c.env.DB.prepare("SELECT id, province_id, statut FROM utilisateurs WHERE id = ? AND role = 'DELEGUE_PROVINCIAL'")
    .bind(id).first<{ id: string; province_id: string; statut: string }>();
  if (!cible) return c.json({ erreur: "Le compte délégué est introuvable." }, 404);
  const action = statut === "SUSPENDU" ? "SUSPENSION_DELEGUE" : "REACTIVATION_DELEGUE";
  const commandes = [
    c.env.DB.prepare(`UPDATE utilisateurs SET statut = ?, tentatives_echouees = 0, verrouille_jusqua = NULL,
      modifie_le = datetime('now') WHERE id = ? AND role = 'DELEGUE_PROVINCIAL'`)
      .bind(statut, id),
    ...(statut === "SUSPENDU" ? [c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(id)] : []),
    c.env.DB.prepare(`INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif, details_json)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), acteur.id, id, action, resultat.data.motif, JSON.stringify({ province_id: cible.province_id, ancien_statut: cible.statut, nouveau_statut: statut })),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action, entiteType: "UTILISATEUR", entiteId: id, adresseIp: ipRequete(c),
      donneesAvant: JSON.stringify({ statut: cible.statut }), donneesApres: JSON.stringify({ statut }) }),
  ];
  try { await c.env.DB.batch(commandes); }
  catch { return c.json({ erreur: "La réactivation est impossible tant qu’un autre délégué actif occupe cette province." }, 409); }
  return c.json({ message: statut === "SUSPENDU" ? "Le compte a été suspendu et ses sessions révoquées." : "Le compte a été réactivé." });
}

routesAdministration.post("/delegues/:utilisateurId/suspendre", (c) => changerStatutDelegue(c, "SUSPENDU"));
routesAdministration.post("/delegues/:utilisateurId/reactiver", (c) => changerStatutDelegue(c, "ACTIF"));

routesAdministration.post("/delegues/:utilisateurId/revoquer-sessions", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("utilisateurId");
  if (!id) return c.json({ erreur: "Le compte délégué est introuvable." }, 404);
  const acteur = c.get("utilisateur");
  const cible = await c.env.DB.prepare("SELECT id FROM utilisateurs WHERE id = ? AND role = 'DELEGUE_PROVINCIAL'")
    .bind(id).first<{ id: string }>();
  if (!cible) return c.json({ erreur: "Le compte délégué est introuvable." }, 404);
  const commandes = [
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(id),
    c.env.DB.prepare("INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif) VALUES (?, ?, ?, 'REVOCATION_SESSIONS_DELEGUE', ?)")
      .bind(crypto.randomUUID(), acteur.id, id, resultat.data.motif),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "REVOCATION_SESSIONS_DELEGUE", entiteType: "UTILISATEUR", entiteId: id, adresseIp: ipRequete(c) }),
  ];
  const resultatBatch = await c.env.DB.batch(commandes);
  return c.json({ message: "Les sessions du délégué ont été révoquées.", sessions_revoquees: resultatBatch[0]?.meta.changes ?? 0 });
});

routesAdministration.post("/delegues/:utilisateurId/renvoyer-invitation", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  if (!livraisonCourrielActive(c)) return c.json({ erreur: "La réémission d’une invitation par e-mail est désactivée. Le compte approuvé utilise le mot de passe choisi lors de l’inscription." }, 409);
  if (!courrielEstConfigure(configurationCourriel(c))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("utilisateurId");
  if (!id) return c.json({ erreur: "Le compte délégué est introuvable." }, 404);
  const compte = await c.env.DB.prepare(`SELECT id, identifiant, nom_complet, courriel, province_id, statut
    FROM utilisateurs WHERE id = ? AND role = 'DELEGUE_PROVINCIAL'`)
    .bind(id).first<{ id: string; identifiant: string; nom_complet: string; courriel: string | null; province_id: string; statut: string }>();
  if (!compte || !compte.courriel || compte.statut !== "ACTIF") return c.json({ erreur: "Le compte n’est pas admissible à une invitation." }, 409);
  const code = genererJetonAleatoire(24);
  const hash = await hacherMotDePasse(code);
  const expiration = dateSqlite(new Date(Date.now() + MAX_AGE_ACTIVATION_MINUTES * 60 * 1000));
  const acteur = c.get("utilisateur");
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE utilisateurs SET code_activation_hash = ?, mot_de_passe_hash = ?, code_activation_expire_le = ?,
      code_activation_recuperation_id = NULL, doit_changer_mot_de_passe = 1, modifie_le = datetime('now')
      WHERE id = ? AND role = 'DELEGUE_PROVINCIAL' AND statut = 'ACTIF'`)
      .bind(hash, hash, expiration, id),
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(id),
    c.env.DB.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = ? AND consomme = 0").bind(id),
    c.env.DB.prepare("INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif) VALUES (?, ?, ?, 'REEMISSION_INVITATION_DELEGUE', ?)")
      .bind(crypto.randomUUID(), acteur.id, id, resultat.data.motif),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "REEMISSION_INVITATION_DELEGUE", entiteType: "UTILISATEUR", entiteId: id, adresseIp: ipRequete(c) }),
  ]);
  try { await envoyerInvitation(c, compte.courriel, compte.identifiant, code, "DELEGUE_PROVINCIAL"); }
  catch { return c.json({ erreur: "L’invitation n’a pas pu être remise. Le code précédent est révoqué." }, 503); }
  return c.json({ message: "Une nouvelle invitation temporaire a été envoyée." });
});

routesAdministration.get("/decisions", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(Object.fromEntries(new URL(c.req.url).searchParams.entries()), schemaPaginationComptes);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const [liste, total] = await Promise.all([
    c.env.DB.prepare(`SELECT d.id, d.action, d.motif, d.details_json, d.cree_le, d.acteur_id,
      u.nom_complet AS acteur, d.inscription_id, d.utilisateur_cible_id
      FROM decisions_comptes d INNER JOIN utilisateurs u ON u.id = d.acteur_id
      ORDER BY d.cree_le DESC, d.id LIMIT ? OFFSET ?`)
      .bind(resultat.data.limite, resultat.data.decalage).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM decisions_comptes").first<{ total: number }>(),
  ]);
  return c.json({ elements: liste.results, total: total?.total ?? 0, limite: resultat.data.limite, decalage: resultat.data.decalage });
});

routesAdministration.post("/consultation", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const emailActif = livraisonCourrielActive(c);
  if (emailActif && !courrielEstConfigure(configurationCourriel(c))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaCreationCompteConsultation);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const valeur = resultat.data;
  if (valeur.perimetre !== "NATIONAL") {
    const placeholders = valeur.provinces.map(() => "?").join(",");
    const existantes = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM provinces WHERE id IN (${placeholders})`)
      .bind(...valeur.provinces).first<{ total: number }>();
    if (existantes?.total !== valeur.provinces.length) return erreurSchema(c, "Une province sélectionnée n’existe pas.");
  }
  const id = crypto.randomUUID();
  const utilisateurId = crypto.randomUUID();
  const identifiant = `consultation-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const activation = genererJetonAleatoire(24);
  const hash = await hacherMotDePasse(activation);
  const expiration = dateSqlite(new Date(Date.now() + MAX_AGE_ACTIVATION_MINUTES * 60 * 1000));
  const acteur = c.get("utilisateur");
  const commandes: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash,
      code_activation_hash, code_activation_expire_le, doit_changer_mot_de_passe, statut, courriel, telephone)
      VALUES (?, ?, ?, 'ADMIN_CENTRAL', NULL, ?, ?, ?, 1, 'ACTIF', ?, ?)`)
      .bind(utilisateurId, identifiant, valeur.nom_complet, hash, hash, expiration, valeur.courriel, valeur.telephone ?? null),
    c.env.DB.prepare(`INSERT INTO comptes_consultation (id, utilisateur_id, institution, fonction, perimetre, statut, cree_par)
      VALUES (?, ?, ?, ?, ?, 'INVITE', ?)`)
      .bind(id, utilisateurId, valeur.institution, valeur.fonction, valeur.perimetre, acteur.id),
    ...valeur.provinces.map((provinceId) => c.env.DB.prepare(`INSERT INTO perimetres_provinciaux_consultation (compte_consultation_id, province_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM comptes_consultation WHERE id = ? AND perimetre IN ('PROVINCIAL', 'MULTI_PROVINCIAL'))`)
      .bind(id, provinceId, id)),
    c.env.DB.prepare(`INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif, details_json)
      VALUES (?, ?, ?, 'CREATION_COMPTE_CONSULTATION', ?, ?)`)
      .bind(crypto.randomUUID(), acteur.id, utilisateurId, valeur.motif, JSON.stringify({ perimetre: valeur.perimetre, provinces: valeur.provinces })),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "CREATION_COMPTE_CONSULTATION", entiteType: "COMPTE_CONSULTATION", entiteId: id, adresseIp: ipRequete(c),
      donneesApres: JSON.stringify({ utilisateur_id: utilisateurId, perimetre: valeur.perimetre, nombre_provinces: valeur.provinces.length }) }),
  ];
  try { await c.env.DB.batch(commandes); }
  catch { return c.json({ erreur: "L’adresse e-mail existe déjà ou la configuration du compte est incohérente." }, 409); }
  if (emailActif) {
    try { await envoyerInvitation(c, valeur.courriel, identifiant, activation, "CONSULTATION_INSTITUTIONNELLE"); }
    catch { return c.json({ message: "Le compte est préparé, mais l’invitation n’a pas pu être remise. Vérifiez la configuration du service d’e-mail.", identifiant }, 202); }
    return c.json({ message: "L’invitation de consultation a été envoyée. Le responsable définira son mot de passe et configurera le MFA.", identifiant }, 201);
  }
  return c.json({
    message: "Le compte de consultation est préparé. Transmettez ce code d’activation à son destinataire par un canal privé. Il expire dans quinze minutes et impose le choix d’un nouveau mot de passe.",
    identifiant,
    code_activation: activation,
    expire_dans_secondes: MAX_AGE_ACTIVATION_MINUTES * 60,
  }, 201);
});

routesAdministration.get("/consultation", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(Object.fromEntries(new URL(c.req.url).searchParams.entries()), schemaPaginationComptes);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const [liste, total] = await Promise.all([
    c.env.DB.prepare(`SELECT cc.id, cc.utilisateur_id, u.identifiant, u.nom_complet, u.courriel, u.courriel_verifie_le, u.telephone,
      cc.institution, cc.fonction, cc.perimetre, cc.statut, cc.cree_le, u.derniere_connexion
      FROM comptes_consultation cc INNER JOIN utilisateurs u ON u.id = cc.utilisateur_id
      ORDER BY cc.cree_le DESC, cc.id LIMIT ? OFFSET ?`).bind(resultat.data.limite, resultat.data.decalage).all<CompteConsultationD1>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM comptes_consultation").first<{ total: number }>(),
  ]);
  const ids = liste.results.map((ligne) => ligne.id);
  const provinces = ids.length ? await c.env.DB.prepare(`SELECT p.compte_consultation_id, p.province_id, v.nom AS province
      FROM perimetres_provinciaux_consultation p INNER JOIN provinces v ON v.id = p.province_id
      WHERE p.compte_consultation_id IN (${ids.map(() => "?").join(",")}) ORDER BY v.nom COLLATE NOCASE`)
      .bind(...ids).all<{ compte_consultation_id: string; province_id: string; province: string }>() : { results: [] };
  const parCompte = new Map<string, Array<{ province_id: string; province: string }>>();
  for (const ligne of provinces.results) {
    const groupes = parCompte.get(ligne.compte_consultation_id) ?? [];
    groupes.push({ province_id: ligne.province_id, province: ligne.province });
    parCompte.set(ligne.compte_consultation_id, groupes);
  }
  return c.json({ elements: liste.results.map((ligne) => ({ ...ligne, provinces: parCompte.get(ligne.id) ?? [] })),
    total: total?.total ?? 0, limite: resultat.data.limite, decalage: resultat.data.decalage });
});

routesAdministration.patch("/consultation/:id/perimetre", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaModificationPerimetreConsultation);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("id");
  if (!id) return c.json({ erreur: "Le compte de consultation est introuvable." }, 404);
  const acteur = c.get("utilisateur");
  if (resultat.data.perimetre !== "NATIONAL") {
    const existantes = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM provinces WHERE id IN (${resultat.data.provinces.map(() => "?").join(",")})`)
      .bind(...resultat.data.provinces).first<{ total: number }>();
    if (existantes?.total !== resultat.data.provinces.length) return erreurSchema(c, "Une province sélectionnée n’existe pas.");
  }
  const compte = await c.env.DB.prepare("SELECT id, perimetre, statut FROM comptes_consultation WHERE id = ?")
    .bind(id).first<{ id: string; perimetre: string; statut: string }>();
  if (!compte) return c.json({ erreur: "Le compte de consultation est introuvable." }, 404);
  const commandes = [
    c.env.DB.prepare("DELETE FROM perimetres_provinciaux_consultation WHERE compte_consultation_id = ?").bind(id),
    c.env.DB.prepare("UPDATE comptes_consultation SET perimetre = ?, modifie_le = datetime('now') WHERE id = ?")
      .bind(resultat.data.perimetre, id),
    ...resultat.data.provinces.map((provinceId) => c.env.DB.prepare("INSERT INTO perimetres_provinciaux_consultation (compte_consultation_id, province_id) VALUES (?, ?)")
      .bind(id, provinceId)),
    c.env.DB.prepare(`INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif, details_json)
      SELECT ?, ?, utilisateur_id, 'MODIFICATION_PERIMETRE_CONSULTATION', ?, ? FROM comptes_consultation WHERE id = ?`)
      .bind(crypto.randomUUID(), acteur.id, resultat.data.motif, JSON.stringify({ ancien_perimetre: compte.perimetre, nouveau_perimetre: resultat.data.perimetre, provinces: resultat.data.provinces }), id),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "MODIFICATION_PERIMETRE_CONSULTATION", entiteType: "COMPTE_CONSULTATION", entiteId: id, adresseIp: ipRequete(c),
      donneesAvant: JSON.stringify({ perimetre: compte.perimetre }), donneesApres: JSON.stringify({ perimetre: resultat.data.perimetre, provinces: resultat.data.provinces }) }),
  ];
  try { await c.env.DB.batch(commandes); }
  catch { return c.json({ erreur: "Le nouveau périmètre n’est pas cohérent." }, 409); }
  return c.json({ message: "Le périmètre de consultation a été mis à jour." });
});

routesAdministration.post("/consultation/:id/suspendre", (c) => changerStatutConsultation(c, "SUSPENDU"));
routesAdministration.post("/consultation/:id/reactiver", (c) => changerStatutConsultation(c, "ACTIF"));

routesAdministration.post("/consultation/:id/revoquer-sessions", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("id");
  const acteur = c.get("utilisateur");
  const compte = await c.env.DB.prepare("SELECT utilisateur_id FROM comptes_consultation WHERE id = ?")
    .bind(id).first<{ utilisateur_id: string }>();
  if (!compte) return c.json({ erreur: "Le compte de consultation est introuvable." }, 404);
  const executions = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(compte.utilisateur_id),
    c.env.DB.prepare(`INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif)
      VALUES (?, ?, ?, 'REVOCATION_SESSIONS_CONSULTATION', ?)`)
      .bind(crypto.randomUUID(), acteur.id, compte.utilisateur_id, resultat.data.motif),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "REVOCATION_SESSIONS_CONSULTATION", entiteType: "COMPTE_CONSULTATION", entiteId: id, adresseIp: ipRequete(c) }),
  ]);
  return c.json({ message: "Les sessions du compte consultatif ont été révoquées.", sessions_revoquees: executions[0]?.meta.changes ?? 0 });
});

routesAdministration.post("/consultation/:id/renvoyer-invitation", async (c) => {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const emailActif = livraisonCourrielActive(c);
  if (emailActif && !courrielEstConfigure(configurationCourriel(c))) return erreurCourrielIndisponible(c);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("id");
  if (!id) return c.json({ erreur: "Le compte de consultation est introuvable." }, 404);
  const compte = await c.env.DB.prepare(`SELECT cc.id, cc.statut, u.id AS utilisateur_id, u.identifiant, u.courriel
    FROM comptes_consultation cc INNER JOIN utilisateurs u ON u.id = cc.utilisateur_id WHERE cc.id = ?`)
    .bind(id).first<{ id: string; statut: string; utilisateur_id: string; identifiant: string; courriel: string | null }>();
  if (!compte || !compte.courriel || compte.statut === "SUSPENDU") return c.json({ erreur: "Le compte n’est pas admissible à une nouvelle invitation." }, 409);
  const code = genererJetonAleatoire(24);
  const hash = await hacherMotDePasse(code);
  const expiration = dateSqlite(new Date(Date.now() + MAX_AGE_ACTIVATION_MINUTES * 60 * 1000));
  const acteur = c.get("utilisateur");
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE utilisateurs SET code_activation_hash = ?, mot_de_passe_hash = ?,
      code_activation_expire_le = ?, code_activation_recuperation_id = NULL, doit_changer_mot_de_passe = 1,
      modifie_le = datetime('now') WHERE id = ? AND statut = 'ACTIF'`)
      .bind(hash, hash, expiration, compte.utilisateur_id),
    c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(compte.utilisateur_id),
    c.env.DB.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = ? AND consomme = 0").bind(compte.utilisateur_id),
    c.env.DB.prepare("INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif) VALUES (?, ?, ?, 'REEMISSION_INVITATION_CONSULTATION', ?)")
      .bind(crypto.randomUUID(), acteur.id, compte.utilisateur_id, resultat.data.motif),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action: "REEMISSION_INVITATION_CONSULTATION", entiteType: "COMPTE_CONSULTATION", entiteId: id, adresseIp: ipRequete(c) }),
  ]);
  if (emailActif) {
    try { await envoyerInvitation(c, compte.courriel ?? "", compte.identifiant, code, "CONSULTATION_INSTITUTIONNELLE"); }
    catch { return c.json({ erreur: "L’invitation n’a pas pu être remise. Le code précédent est révoqué." }, 503); }
    return c.json({ message: "Une nouvelle invitation temporaire a été envoyée." });
  }
  return c.json({
    message: "Un nouveau code temporaire a été généré. Transmettez-le par un canal privé; l’ancien code est révoqué.",
    code_activation: code,
    expire_dans_secondes: MAX_AGE_ACTIVATION_MINUTES * 60,
  });
});

async function changerStatutConsultation(c: Context<EnvironnementApplication>, statut: "ACTIF" | "SUSPENDU") {
  if (!exigerAdministration(c)) return c.json({ erreur: "Accès refusé." }, 403);
  const resultat = analyserCorps(await lireJson(c), schemaDecisionCompte);
  if (!resultat.success) return erreurSchema(c, resultat.message);
  const id = c.req.param("id");
  if (!id) return c.json({ erreur: "Le compte de consultation est introuvable." }, 404);
  const acteur = c.get("utilisateur");
  const compte = await c.env.DB.prepare("SELECT id, utilisateur_id, statut FROM comptes_consultation WHERE id = ?")
    .bind(id).first<{ id: string; utilisateur_id: string; statut: string }>();
  if (!compte) return c.json({ erreur: "Le compte de consultation est introuvable." }, 404);
  const action = statut === "SUSPENDU" ? "SUSPENSION_COMPTE_CONSULTATION" : "REACTIVATION_COMPTE_CONSULTATION";
  const commandes: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE comptes_consultation SET statut = ?, modifie_le = datetime('now') WHERE id = ?")
      .bind(statut, id),
    ...(statut === "SUSPENDU" ? [c.env.DB.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ? AND revoquee = 0").bind(compte.utilisateur_id)] : []),
    c.env.DB.prepare("INSERT INTO decisions_comptes (id, acteur_id, utilisateur_cible_id, action, motif) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), acteur.id, compte.utilisateur_id, action, resultat.data.motif),
    creerInstructionAudit(c.env.DB, { utilisateur: acteur, action, entiteType: "COMPTE_CONSULTATION", entiteId: id, adresseIp: ipRequete(c),
      donneesAvant: JSON.stringify({ statut: compte.statut }), donneesApres: JSON.stringify({ statut }) }),
  ];
  await c.env.DB.batch(commandes);
  return c.json({ message: statut === "SUSPENDU" ? "Le compte a été suspendu et ses sessions révoquées." : "Le compte a été réactivé." });
}

export { routesPublics as routesInscriptionsDelegues, routesCompte as routesMonCompte, routesAdministration as routesAdministrationComptes };
