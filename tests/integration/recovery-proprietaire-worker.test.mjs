import assert from "node:assert/strict";
import { randomBytes, webcrypto } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { test } from "node:test";
import { codeMfaInutilise, configurerMfaTest } from "./mfa-test-helper.mjs";

const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const dossierD1 = process.env.SIGAD_D1_STATE_DIR;
const identiteOperateur = process.env.SIGAD_RECUPERATION_OPERATEUR_IDENTITE;
const clePubliqueBase64Url = process.env.SIGAD_RECUPERATION_OPERATEUR_CLE_PUBLIQUE;
const clePriveeJson = process.env.SIGAD_TEST_OPERATOR_PRIVATE_JWK;
const motifStandard = "Récupération exceptionnelle autorisée pour recette locale.";
const encodeur = new TextEncoder();

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.preuve) entetes.set("X-SIGAD-Preuve-Operateur", options.preuve);
    if (this.cookies.size > 0) {
      entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    }
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
    });
    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      if (!paire) continue;
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (valeur === "" || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    let donnees = null;
    try {
      donnees = await reponse.json();
    } catch {
      donnees = null;
    }
    return { reponse, donnees };
  }

  async initialiserCsrf() {
    const resultat = await this.requete("/api/auth/csrf");
    assert.equal(resultat.reponse.status, 200);
    const jeton = resultat.donnees && Reflect.get(resultat.donnees, "jeton_csrf");
    assert.equal(typeof jeton, "string");
    this.jetonCsrf = jeton;
  }
}

function ouvrirD1() {
  if (!dossierD1) throw new Error("Le dossier D1 temporaire de test n’est pas configuré.");
  const fichiers = readdirSync(dossierD1).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  for (const nom of fichiers) {
    const base = new DatabaseSync(join(dossierD1, nom));
    if (base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get()) return base;
    base.close();
  }
  throw new Error("La D1 isolée de test est introuvable.");
}

function base64url(valeur) {
  return Buffer.from(valeur).toString("base64url");
}

function verifierIdentifiantCorrelation(reponse) {
  const identifiant = reponse.headers.get("X-Correlation-ID");
  assert.match(identifiant ?? "", /^[0-9a-f-]{36}$/u, "Chaque requête d’émission reçoit un identifiant de corrélation non sensible.");
  return identifiant;
}

function verifierRequestId(reponse) {
  const identifiant = reponse.headers.get("X-Request-ID");
  assert.match(identifiant ?? "", /^[0-9a-f-]{36}$/u, "Chaque requête possède un request_id journalisable.");
  return identifiant;
}

async function creerPreuve(operation, motif = motifStandard) {
  if (!clePriveeJson) throw new Error("La clé de signature éphémère des tests n’est pas configurée.");
  const clePrivee = await webcrypto.subtle.importKey(
    "jwk",
    JSON.parse(clePriveeJson),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = { alg: "ES256", typ: "JWT", kid: "sigad-staging-recovery-v1" };
  const charge = {
    iss: "SIGAD-RECUPERATION-PROPRIETAIRE",
    aud: "sigad-staging-owner-recovery",
    sub: "usr-proprietaire",
    operateur: identiteOperateur,
    operation,
    jti: base64url(randomBytes(32)),
    motif_sha256: base64url(await webcrypto.subtle.digest("SHA-256", encodeur.encode(motif.trim()))),
    iat: maintenant,
    exp: maintenant + 300,
  };
  const contenu = `${base64url(JSON.stringify(entete))}.${base64url(JSON.stringify(charge))}`;
  const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clePrivee, encodeur.encode(contenu));
  return `${contenu}.${base64url(signature)}`;
}

async function demanderEmission(motif = motifStandard, preuve = undefined) {
  const client = new ClientLocal();
  await client.initialiserCsrf();
  const resultat = await client.requete("/api/auth/recuperation-proprietaire", {
    methode: "POST",
    corps: { motif },
    ...(preuve === undefined ? { preuve: await creerPreuve("EMETTRE_ACTIVATION_INITIALE", motif) } : { preuve }),
  });
  return { client, ...resultat };
}

async function connexionActivation(client, codeActivation, options = {}) {
  await client.initialiserCsrf();
  return client.requete("/api/auth/connexion", {
    methode: "POST",
    corps: { identifiant: "proprietaire", mot_de_passe: codeActivation },
    ...options,
  });
}

test("Récupération propriétaire limitée, atomique, à usage unique et révocable sur Wrangler/D1 locaux", async () => {
  assert.ok(clePubliqueBase64Url && clePriveeJson && identiteOperateur);
  assert.equal(typeof await webcrypto.subtle.importKey(
    "jwk",
    JSON.parse(clePriveeJson),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  ), "object");

  const base = ouvrirD1();
  try {
    base.exec("PRAGMA foreign_keys = ON;");
    base.prepare(
      `UPDATE utilisateurs SET double_facteur_secret = NULL, double_facteur_secret_temporaire = 'synthetic-sealed-mfa-state',
         double_facteur_actif = 0, code_activation_hash = mot_de_passe_hash, code_activation_expire_le = NULL,
         code_activation_recuperation_id = NULL, doit_changer_mot_de_passe = 1, statut = 'ACTIF',
         tentatives_echouees = 0, verrouille_jusqua = NULL
       WHERE id = 'usr-proprietaire' AND identifiant = 'proprietaire' AND role = 'PROPRIETAIRE'`,
    ).run();
    base.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = 'usr-proprietaire'").run();
    base.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = 'usr-proprietaire'").run();
    base.prepare("DELETE FROM codes_recuperation_mfa WHERE utilisateur_id = 'usr-proprietaire'").run();
    base.prepare("DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = 'usr-proprietaire'").run();
    base.prepare(
      `INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, expire_le)
       VALUES ('session-recuperation-synthetique', 'usr-proprietaire', ?, 'csrf-test', datetime('now', '+1 hour'))`,
    ).run(base64url(randomBytes(32)));
  } finally {
    base.close();
  }

  const nonAuthentifie = new ClientLocal();
  await nonAuthentifie.initialiserCsrf();
  assert.equal((await nonAuthentifie.requete("/api/proprietaire/utilisateurs")).reponse.status, 401);

  const avant = ouvrirD1();
  const etatActivationAvant = avant.prepare(
    `SELECT code_activation_hash, code_activation_expire_le, code_activation_recuperation_id,
            mot_de_passe_hash, doit_changer_mot_de_passe, double_facteur_actif,
            double_facteur_secret_temporaire
     FROM utilisateurs WHERE id = 'usr-proprietaire'`,
  ).get();
  const preuveAvant = avant.prepare("SELECT COUNT(*) AS n FROM preuves_operateur_recuperation").get().n;
  const recuperationsAvant = avant.prepare("SELECT COUNT(*) AS n FROM recuperations_acces_proprietaire").get().n;
  const sessionsActivesAvant = avant.prepare(
    "SELECT COUNT(*) AS n FROM sessions WHERE utilisateur_id = 'usr-proprietaire' AND revoquee = 0",
  ).get().n;
  avant.close();

  const clientSansCsrf = new ClientLocal();
  await clientSansCsrf.initialiserCsrf();
  const refusCsrf = await clientSansCsrf.requete("/api/auth/recuperation-proprietaire", {
    methode: "POST", corps: { motif: motifStandard }, csrf: false, preuve: await creerPreuve("EMETTRE_ACTIVATION_INITIALE"),
  });
  assert.equal(refusCsrf.reponse.status, 403, "La récupération exige CSRF pré-authentification.");
  assert.ok(verifierIdentifiantCorrelation(refusCsrf.reponse));

  const preuveInvalide = await creerPreuve("EMETTRE_ACTIVATION_INITIALE");
  const morceaux = preuveInvalide.split(".");
  const partieSignature = morceaux[2] ?? "";
  const signatureAlteree = `${partieSignature.slice(0, -1)}${partieSignature.endsWith("A") ? "B" : "A"}`;
  const clientPreuveInvalide = new ClientLocal();
  await clientPreuveInvalide.initialiserCsrf();
  const refusSignature = await clientPreuveInvalide.requete("/api/auth/recuperation-proprietaire", {
    methode: "POST", corps: { motif: motifStandard }, preuve: `${morceaux[0]}.${morceaux[1]}.${signatureAlteree}`,
  });
  assert.equal(refusSignature.reponse.status, 401, "Une signature opérateur altérée est refusée.");
  assert.ok(verifierIdentifiantCorrelation(refusSignature.reponse));

  const rollback = ouvrirD1();
  const auditsRecuperationAvant = rollback.prepare(
    "SELECT COUNT(*) AS n FROM evenements_audit WHERE source_table = 'preuves_operateur_recuperation'",
  ).get().n;
  rollback.exec(
    `CREATE TRIGGER test_refus_audit_recuperation BEFORE INSERT ON evenements_audit
     WHEN NEW.action = 'EMETTRE_ACTIVATION_INITIALE'
     BEGIN SELECT RAISE(ABORT, 'TEST_AUDIT_RECUPERATION'); END`,
  );
  rollback.close();
  const refusEcritureAudit = await demanderEmission();
  assert.equal(refusEcritureAudit.reponse.status, 409, "Un échec d’écriture de l’audit bloque la récupération et ne délivre aucun code.");
  assert.ok(verifierIdentifiantCorrelation(refusEcritureAudit.reponse));
  const controleRollback = ouvrirD1();
  try {
    controleRollback.exec("DROP TRIGGER test_refus_audit_recuperation");
    assert.equal(controleRollback.prepare("SELECT COUNT(*) AS n FROM preuves_operateur_recuperation").get().n, preuveAvant,
      "L’échec tardif ne conserve aucune preuve ni opération partielle.");
    assert.equal(controleRollback.prepare(
      "SELECT COUNT(*) AS n FROM evenements_audit WHERE source_table = 'preuves_operateur_recuperation'",
    ).get().n, auditsRecuperationAvant, "Aucun audit partiel ne subsiste après l’échec de la transaction.");
    assert.equal(controleRollback.prepare("SELECT COUNT(*) AS n FROM recuperations_acces_proprietaire").get().n, recuperationsAvant,
      "L’échec tardif n’ajoute aucun dossier de récupération.");
    assert.deepEqual(controleRollback.prepare(
      `SELECT code_activation_hash, code_activation_expire_le, code_activation_recuperation_id,
              mot_de_passe_hash, doit_changer_mot_de_passe, double_facteur_actif,
              double_facteur_secret_temporaire
       FROM utilisateurs WHERE id = 'usr-proprietaire'`,
    ).get(), etatActivationAvant, "L’échec ne modifie aucun état d’activation, de mot de passe ou MFA du propriétaire.");
    assert.equal(controleRollback.prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE utilisateur_id = 'usr-proprietaire' AND revoquee = 0",
    ).get().n, sessionsActivesAvant, "L’échec ne révoque aucune session existante.");
  } finally {
    controleRollback.close();
  }

  const preuvesConcurrentes = await Promise.all([
    creerPreuve("EMETTRE_ACTIVATION_INITIALE"),
    creerPreuve("EMETTRE_ACTIVATION_INITIALE"),
  ]);
  const emissions = await Promise.all([
    demanderEmission(motifStandard, preuvesConcurrentes[0]),
    demanderEmission(motifStandard, preuvesConcurrentes[1]),
  ]);
  const statutsEmission = emissions.map((resultat) => resultat.reponse.status).sort((a, b) => a - b);
  assert.deepEqual(statutsEmission, [201, 409], "Une même preuve opérateur concurrente n’est acceptée qu’une fois.");
  emissions.forEach((resultat) => verifierIdentifiantCorrelation(resultat.reponse));
  const emissionGagnante = emissions.find((resultat) => resultat.reponse.status === 201);
  assert.ok(emissionGagnante);
  const indexEmissionGagnante = emissions.indexOf(emissionGagnante);
  const preuveEmissionGagnante = preuvesConcurrentes[indexEmissionGagnante];
  assert.ok(preuveEmissionGagnante);
  const codeRevoque = Reflect.get(emissionGagnante.donnees, "code_activation");
  assert.equal(typeof codeRevoque, "string");
  const requestIdEmission = verifierRequestId(emissionGagnante.reponse);
  const dossierEmission = ouvrirD1();
  try {
    const auditEmission = dossierEmission.prepare(`SELECT acteur_id, acteur_identite, acteur_role, action,
        cible_type, cible_id, request_id, motif, apres
      FROM evenements_audit WHERE request_id = ? AND source_table = 'preuves_operateur_recuperation'`)
      .get(requestIdEmission);
    assert.ok(auditEmission, "L’émission acceptée doit produire un événement d’audit unifié.");
    assert.equal(auditEmission.acteur_id, null);
    assert.equal(auditEmission.acteur_role, "OPERATEUR_EXTERNE");
    assert.equal(auditEmission.action, "EMETTRE_ACTIVATION_INITIALE");
    assert.equal(auditEmission.cible_type, "UTILISATEUR");
    assert.equal(auditEmission.cible_id, "usr-proprietaire");
    assert.equal(auditEmission.request_id, requestIdEmission);
    assert.equal(auditEmission.motif, motifStandard);
    assert.equal(JSON.stringify(auditEmission).includes(codeRevoque), false,
      "Le code d’activation retourné n’est jamais présent dans l’audit.");
    assert.equal(dossierEmission.prepare(
      "SELECT COUNT(*) AS total FROM recuperations_acces_proprietaire WHERE terminee_le IS NULL AND revoquee_le IS NULL",
    ).get().total, 1, "Une seule récupération propriétaire reste ouverte après deux émissions concurrentes avec des preuves distinctes.");
    const instantane = dossierEmission.prepare(
      `SELECT empreinte_activation_precedente, expiration_activation_precedente,
              empreinte_mot_de_passe_precedente, secret_mfa_temporaire_precedent,
              changement_mot_de_passe_precedent, mfa_actif_precedent,
              emission_confirmee_le
       FROM recuperations_acces_proprietaire WHERE utilisateur_id = 'usr-proprietaire'
       AND terminee_le IS NULL AND revoquee_le IS NULL`,
    ).get();
    assert.equal(instantane.empreinte_activation_precedente, etatActivationAvant.code_activation_hash);
    assert.equal(instantane.expiration_activation_precedente, etatActivationAvant.code_activation_expire_le);
    assert.equal(instantane.empreinte_mot_de_passe_precedente, etatActivationAvant.mot_de_passe_hash);
    assert.equal(instantane.secret_mfa_temporaire_precedent, etatActivationAvant.double_facteur_secret_temporaire);
    assert.equal(instantane.changement_mot_de_passe_precedent, etatActivationAvant.doit_changer_mot_de_passe);
    assert.equal(instantane.mfa_actif_precedent, etatActivationAvant.double_facteur_actif);
    assert.ok(instantane.emission_confirmee_le);
  } finally {
    dossierEmission.close();
  }
  const emissionSupplementaire = await demanderEmission("Refus du remplacement d’une récupération ouverte.");
  assert.equal(emissionSupplementaire.reponse.status, 409, "Une récupération ouverte n’est jamais remplacée par une nouvelle émission.");
  const rejeuPreuve = await demanderEmission(motifStandard, preuveEmissionGagnante);
  assert.equal(rejeuPreuve.reponse.status, 409, "Une preuve opérateur consommée ne peut pas être rejouée.");

  const clientRevocation = new ClientLocal();
  await clientRevocation.initialiserCsrf();
  const resultatRevocation = await clientRevocation.requete("/api/auth/recuperation-proprietaire/revoquer", {
    methode: "POST", corps: { motif: "Révocation locale avant toute activation." },
    preuve: await creerPreuve("REVOQUER_ACTIVATION_INITIALE", "Révocation locale avant toute activation."),
  });
  assert.equal(resultatRevocation.reponse.status, 200);
  const requestIdRevocation = verifierRequestId(resultatRevocation.reponse);
  const verificationRestauration = ouvrirD1();
  try {
    const auditRevocation = verificationRestauration.prepare(`SELECT acteur_role, action, request_id, cible_id
      FROM evenements_audit WHERE request_id = ? AND source_table = 'preuves_operateur_recuperation'`)
      .get(requestIdRevocation);
    assert.ok(auditRevocation, "La révocation acceptée doit produire un événement d’audit unifié.");
    assert.equal(auditRevocation.acteur_role, "OPERATEUR_EXTERNE");
    assert.equal(auditRevocation.action, "REVOQUER_ACTIVATION_INITIALE");
    assert.equal(auditRevocation.request_id, requestIdRevocation);
    assert.equal(auditRevocation.cible_id, "usr-proprietaire");
    const etatApresRevocation = verificationRestauration.prepare(
      `SELECT code_activation_hash, code_activation_expire_le, code_activation_recuperation_id,
              mot_de_passe_hash, doit_changer_mot_de_passe, double_facteur_actif,
              double_facteur_secret_temporaire
       FROM utilisateurs WHERE id = 'usr-proprietaire'`,
    ).get();
    assert.deepEqual(etatApresRevocation, etatActivationAvant,
      "La révocation restaure l’état initial de l’activation, du mot de passe et du MFA sans réactiver de session.");
    const cloture = verificationRestauration.prepare(
      `SELECT revoquee_le, revocation_confirmee_le, empreinte_activation_precedente,
              empreinte_mot_de_passe_precedente, secret_mfa_temporaire_precedent
       FROM recuperations_acces_proprietaire WHERE revoquee_le IS NOT NULL ORDER BY cree_le DESC LIMIT 1`,
    ).get();
    assert.ok(cloture.revoquee_le && cloture.revocation_confirmee_le);
    assert.equal(cloture.empreinte_activation_precedente, null, "Les empreintes de sauvegarde sont purgées après restauration confirmée.");
    assert.equal(cloture.empreinte_mot_de_passe_precedente, null);
    assert.equal(cloture.secret_mfa_temporaire_precedent, null);
  } finally {
    verificationRestauration.close();
  }
  const tentativeCodeRevoque = await connexionActivation(new ClientLocal(), codeRevoque);
  assert.equal(tentativeCodeRevoque.reponse.status, 401, "Un code révoqué est inutilisable.");

  const expirationHistorique = ouvrirD1();
  expirationHistorique.prepare(
    `UPDATE utilisateurs SET code_activation_expire_le = datetime('now', '-1 second')
     WHERE id = 'usr-proprietaire' AND code_activation_recuperation_id IS NULL`,
  ).run();
  expirationHistorique.close();
  const emissionExpiration = await demanderEmission("Expiration d’activation testée localement.");
  assert.equal(emissionExpiration.reponse.status, 201);
  const codeExpire = Reflect.get(emissionExpiration.donnees, "code_activation");
  const expiration = ouvrirD1();
  expiration.prepare(
    "UPDATE utilisateurs SET code_activation_expire_le = datetime('now', '-1 second') WHERE id = 'usr-proprietaire'",
  ).run();
  expiration.close();
  const tentativeExpiree = await connexionActivation(new ClientLocal(), codeExpire);
  assert.equal(tentativeExpiree.reponse.status, 401, "Un code arrivé à expiration est refusé.");
  const restaurationExpiration = new ClientLocal();
  await restaurationExpiration.initialiserCsrf();
  const expirationRevoquee = await restaurationExpiration.requete("/api/auth/recuperation-proprietaire/revoquer", {
    methode: "POST",
    corps: { motif: "Ne pas réactiver une activation historique expirée." },
    preuve: await creerPreuve("REVOQUER_ACTIVATION_INITIALE", "Ne pas réactiver une activation historique expirée."),
  });
  assert.equal(expirationRevoquee.reponse.status, 200);
  const controleExpirationRestauree = ouvrirD1();
  try {
    const etatExpire = controleExpirationRestauree.prepare(
      `SELECT code_activation_hash, code_activation_expire_le, doit_changer_mot_de_passe,
              code_activation_recuperation_id
       FROM utilisateurs WHERE id = 'usr-proprietaire'`,
    ).get();
    assert.equal(etatExpire.code_activation_hash, null, "La révocation n’active pas l’ancienne empreinte déjà expirée.");
    assert.equal(etatExpire.code_activation_expire_le, null);
    assert.equal(etatExpire.doit_changer_mot_de_passe, 1);
    assert.equal(etatExpire.code_activation_recuperation_id, null);
    controleExpirationRestauree.prepare(
      `UPDATE utilisateurs SET code_activation_hash = mot_de_passe_hash,
         code_activation_expire_le = NULL, code_activation_recuperation_id = NULL
       WHERE id = 'usr-proprietaire' AND statut = 'ACTIF' AND role = 'PROPRIETAIRE'`,
    ).run();
  } finally {
    controleExpirationRestauree.close();
  }

  const emissionActivation = await demanderEmission("Activation concurrente et accès limité testés localement.");
  assert.equal(emissionActivation.reponse.status, 201);
  const codeConcurrent = Reflect.get(emissionActivation.donnees, "code_activation");
  const clientsConnexion = [new ClientLocal(), new ClientLocal()];
  await Promise.all(clientsConnexion.map((client) => client.initialiserCsrf()));
  const tentativesConnexion = await Promise.all(clientsConnexion.map((client) => connexionActivation(client, codeConcurrent)));
  assert.deepEqual(tentativesConnexion.map((resultat) => resultat.reponse.status).sort((a, b) => a - b), [200, 401],
    "Deux connexions concurrentes ne consomment le code d’activation qu’une fois.");
  const clientActivation = clientsConnexion[tentativesConnexion.findIndex((resultat) => resultat.reponse.status === 200)];
  const resultatConnexion = tentativesConnexion.find((resultat) => resultat.reponse.status === 200);
  assert.ok(clientActivation && resultatConnexion);
  const cookieSession = resultatConnexion.reponse.headers.getSetCookie().find((cookie) => cookie.startsWith("sigad_session="));
  assert.match(cookieSession ?? "", /Max-Age=900/u, "Le cookie d’activation expire après quinze minutes.");
  const refusMetier = await clientActivation.requete("/api/proprietaire/utilisateurs");
  assert.equal(refusMetier.reponse.status, 403, "La session d’activation ne donne aucun accès métier ou administratif.");
  const sessionActivation = await clientActivation.requete("/api/auth/session");
  assert.equal(sessionActivation.reponse.status, 200);

  const revocationSansPreuve = await clientActivation.requete("/api/auth/recuperation-proprietaire/revoquer", {
    methode: "POST",
    corps: { motif: "Révocation locale de session limitée." },
  });
  assert.equal(revocationSansPreuve.reponse.status, 401,
    "La révocation opérateur est une opération pré-authentifiée; une session limitée ne l’autorise pas à elle seule.");
  const preuveRevocationSession = await creerPreuve("REVOQUER_ACTIVATION_INITIALE", "Révocation locale de session limitée.");
  const canalRevocation = new ClientLocal();
  await canalRevocation.initialiserCsrf();
  const resultatRevocationSession = await canalRevocation.requete("/api/auth/recuperation-proprietaire/revoquer", {
    methode: "POST", corps: { motif: "Révocation locale de session limitée." }, preuve: preuveRevocationSession,
  });
  assert.equal(resultatRevocationSession.reponse.status, 200);
  assert.equal((await clientActivation.requete("/api/auth/session")).reponse.status, 401,
    "La révocation de récupération invalide immédiatement la session d’activation associée.");

  const emissionFinale = await demanderEmission("Activation complète avec changement de mot de passe et MFA.");
  assert.equal(emissionFinale.reponse.status, 201);
  assert.ok(verifierIdentifiantCorrelation(emissionFinale.reponse));
  const codeFinal = Reflect.get(emissionFinale.donnees, "code_activation");
  const clientFinal = new ClientLocal();
  const connexionFinale = await connexionActivation(clientFinal, codeFinal);
  assert.equal(connexionFinale.reponse.status, 200);
  assert.equal(Reflect.get(Reflect.get(connexionFinale.donnees, "utilisateur"), "activation_initiale"), true);
  assert.equal(Reflect.get(Reflect.get(connexionFinale.donnees, "utilisateur"), "mfa_setup_requis"), true);
  assert.equal((await clientFinal.requete("/api/proprietaire/utilisateurs")).reponse.status, 403);

  const motDePasse = `Sigad-${randomBytes(20).toString("base64url")}Aa9`;
  const changement = await clientFinal.requete("/api/auth/changer-mot-de-passe-initial", {
    methode: "POST", corps: { nouveau_mot_de_passe: motDePasse },
  });
  assert.equal(changement.reponse.status, 200);
  assert.equal((await clientFinal.requete("/api/proprietaire/utilisateurs")).reponse.status, 403,
    "Le changement du mot de passe seul ne déverrouille aucune fonction administrative.");

  const initialisation = await clientFinal.requete("/api/auth/mfa/initialiser", { methode: "POST" });
  assert.equal(initialisation.reponse.status, 200);
  const secretTotp = Reflect.get(initialisation.donnees, "secret_totp");
  assert.equal(typeof secretTotp, "string");
  const confirmationInvalide = await clientFinal.requete("/api/auth/mfa/confirmer", {
    methode: "POST", corps: { code: "000000" },
  });
  assert.equal(confirmationInvalide.reponse.status, 400, "Un code MFA invalide ne termine pas l’activation.");
  const codesRecuperation = await configurerMfaTest(clientFinal, "proprietaire");
  assert.equal(codesRecuperation.length, 10);
  const accesApresMfa = await clientFinal.requete("/api/proprietaire/utilisateurs?limite=1&decalage=0");
  assert.equal(accesApresMfa.reponse.status, 200, "Les fonctions ne deviennent accessibles qu’après le changement de mot de passe et MFA.");

  const verificationFinale = ouvrirD1();
  try {
    const utilisateurFinal = verificationFinale.prepare(
      `SELECT doit_changer_mot_de_passe, double_facteur_actif, code_activation_hash,
              code_activation_expire_le, code_activation_recuperation_id
       FROM utilisateurs WHERE id = 'usr-proprietaire'`,
    ).get();
    assert.equal(utilisateurFinal.doit_changer_mot_de_passe, 0);
    assert.equal(utilisateurFinal.double_facteur_actif, 1);
    assert.equal(utilisateurFinal.code_activation_hash, null);
    assert.equal(utilisateurFinal.code_activation_expire_le, null);
    assert.equal(utilisateurFinal.code_activation_recuperation_id, null);
    const dossier = verificationFinale.prepare(
      `SELECT r.terminee_le, r.mot_de_passe_change_le, r.revoquee_le, p.operation, p.acteur_identite
       FROM recuperations_acces_proprietaire r
       JOIN preuves_operateur_recuperation p ON p.id = r.preuve_emission_id
       WHERE r.utilisateur_id = 'usr-proprietaire' AND r.terminee_le IS NOT NULL ORDER BY r.cree_le DESC LIMIT 1`,
    ).get();
    assert.ok(dossier.terminee_le && dossier.mot_de_passe_change_le);
    assert.equal(dossier.revoquee_le, null);
    assert.equal(dossier.operation, "EMETTRE_ACTIVATION_INITIALE");
    assert.equal(dossier.acteur_identite, identiteOperateur);
    const journal = verificationFinale.prepare(
      "SELECT nonce_hash, motif, operation FROM preuves_operateur_recuperation ORDER BY cree_le",
    ).all();
    for (const ligne of journal) {
      assert.equal(JSON.stringify(ligne).includes(codeFinal), false, "Le code d’activation n’est jamais conservé dans le journal opérateur.");
    }
    const sessionsActives = verificationFinale.prepare(
      "SELECT COUNT(*) AS total FROM sessions WHERE utilisateur_id = 'usr-proprietaire' AND revoquee = 0",
    ).get().total;
    assert.equal(sessionsActives, 1, "La procédure laisse une seule session administrative active après MFA.");
    assert.equal(verificationFinale.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    verificationFinale.close();
  }

  const nouveauJeuActivationMfa = ouvrirD1();
  nouveauJeuActivationMfa.prepare(
    `UPDATE utilisateurs SET doit_changer_mot_de_passe = 1,
       code_activation_hash = mot_de_passe_hash, code_activation_expire_le = NULL,
       code_activation_recuperation_id = NULL
     WHERE id = 'usr-proprietaire' AND role = 'PROPRIETAIRE' AND statut = 'ACTIF'`,
  ).run();
  nouveauJeuActivationMfa.close();

  const emissionMfaDejaActif = await demanderEmission("MFA existant exigé pendant une récupération locale.");
  assert.equal(emissionMfaDejaActif.reponse.status, 201);
  const codeMfaDejaActif = Reflect.get(emissionMfaDejaActif.donnees, "code_activation");
  const clientAvecDefi = new ClientLocal();
  const connexionAvecDefi = await connexionActivation(clientAvecDefi, codeMfaDejaActif);
  assert.equal(connexionAvecDefi.reponse.status, 200);
  assert.equal(Reflect.get(connexionAvecDefi.donnees, "mfa_requis"), true,
    "Une récupération ne contourne pas le MFA déjà activé.");
  assert.equal(clientAvecDefi.cookies.has("sigad_session"), false,
    "Aucune session n’est créée avant la vérification du facteur déjà enrôlé.");
  assert.equal((await clientAvecDefi.requete("/api/proprietaire/utilisateurs")).reponse.status, 401);
  const codeTotp = await codeMfaInutilise("proprietaire");
  const verificationMfa = await clientAvecDefi.requete("/api/auth/mfa/verifier", {
    methode: "POST", corps: { code: codeTotp },
  });
  assert.equal(verificationMfa.reponse.status, 200);
  assert.equal((await clientAvecDefi.requete("/api/proprietaire/utilisateurs")).reponse.status, 403,
    "Le MFA vérifié n’annule pas l’obligation de nouveau mot de passe.");
  const dernierMotDePasse = `Sigad-${randomBytes(20).toString("base64url")}Bb8`;
  const dernierChangement = await clientAvecDefi.requete("/api/auth/changer-mot-de-passe-initial", {
    methode: "POST", corps: { nouveau_mot_de_passe: dernierMotDePasse },
  });
  assert.equal(dernierChangement.reponse.status, 200);
  assert.equal((await clientAvecDefi.requete("/api/proprietaire/utilisateurs?limite=1&decalage=0")).reponse.status, 200,
    "L’accès complet est accordé seulement après MFA et changement du mot de passe.");
  const finMfa = ouvrirD1();
  try {
    const terminees = finMfa.prepare(
      `SELECT COUNT(*) AS total FROM recuperations_acces_proprietaire r
       JOIN utilisateurs u ON u.id = r.utilisateur_id
       WHERE u.identifiant = 'proprietaire' AND r.terminee_le IS NOT NULL`,
    ).get().total;
    assert.equal(terminees, 2, "Une MFA déjà enrôlée finalise aussi la récupération après changement du mot de passe.");
  } finally {
    finMfa.close();
  }
});
