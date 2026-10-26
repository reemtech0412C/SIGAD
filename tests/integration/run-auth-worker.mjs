import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { webcrypto } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const executableWrangler = resolve(racine, "node_modules/wrangler/bin/wrangler.js");
const racineVerification = process.env.SIGAD_VERIFY_TEMP_ROOT ? resolve(process.env.SIGAD_VERIFY_TEMP_ROOT) : null;
const fichierConfigurationWrangler = process.env.SIGAD_WRANGLER_CONFIG ? resolve(process.env.SIGAD_WRANGLER_CONFIG) : null;
const persistanceParente = resolve(process.env.SIGAD_TEST_STATE_ROOT ?? join(racine, ".wrangler", "sigad-tests-state"));
const temporaireParente = resolve(process.env.SIGAD_TEST_TEMP_ROOT ?? tmpdir());
const motifsVariablesSensibles = /CLOUDFLARE|(^|_)CF_|API[_-]?KEY|ACCESS[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|DATABASE_URL|SIGAD_EMAIL_API_URL|(^|_)PROD(uction)?(_|$)|(^|_)STAGING(_|$)|^(HTTP|HTTPS|ALL)_PROXY$/iu;
const environnementLocal = Object.fromEntries(
  Object.entries(process.env).filter(([nom]) => !motifsVariablesSensibles.test(nom)),
);
environnementLocal.WRANGLER_SEND_METRICS = "false";
environnementLocal.DO_NOT_TRACK = "1";
let dossierTemporaire;
let dossierPersistance;
let processusWorker;
let processusCourriel;
const cleMfaLocale = randomBytes(32).toString("base64url");
const paireOperateurLocale = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const clePubliqueOperateurLocale = Buffer.from(JSON.stringify(await webcrypto.subtle.exportKey("jwk", paireOperateurLocale.publicKey))).toString("base64url");
const clePriveeOperateurLocale = JSON.stringify(await webcrypto.subtle.exportKey("jwk", paireOperateurLocale.privateKey));
const identiteOperateurLocale = "operateur-local-test";

function executerNode(argumentsNode, environnement = environnementLocal) {
  const resultat = spawnSync(process.execPath, argumentsNode, {
    cwd: racine,
    env: environnement,
    stdio: "inherit",
    windowsHide: true,
  });
  if (resultat.error) throw resultat.error;
  if (resultat.status !== 0) throw new Error(`La commande Node s’est terminée avec le code ${resultat.status ?? "inconnu"}.`);
}

if (!racineVerification || !fichierConfigurationWrangler) {
  throw new Error("Le Worker d’intégration exige la configuration locale temporaire créée par npm run verify.");
}
if (!racineVerification.startsWith(`${resolve(tmpdir())}${sep}`) || !racineVerification.slice(resolve(tmpdir()).length + 1).startsWith("sigad-verify-")) {
  throw new Error("La racine de vérification doit être un dossier temporaire SIGAD créé par le pipeline.");
}
for (const chemin of [fichierConfigurationWrangler, temporaireParente, persistanceParente]) {
  if (!chemin.startsWith(`${racineVerification}${sep}`) && chemin !== racineVerification) {
    throw new Error("La configuration et les états Wrangler doivent rester dans la racine temporaire de vérification.");
  }
}
const configurationWranglerLocale = await readFile(fichierConfigurationWrangler, "utf8");
if (
  !/name\s*=\s*"sigad-verify-local"/u.test(configurationWranglerLocale) ||
  !/database_name\s*=\s*"sigad-verify-local"/u.test(configurationWranglerLocale) ||
  !/database_id\s*=\s*"00000000-0000-4000-8000-000000000001"/u.test(configurationWranglerLocale) ||
  !/service\s*=\s*"sigad-email-mock"/u.test(configurationWranglerLocale) ||
  /^\s*(?:account_id|zone_id|routes|remote)\s*=/imu.test(configurationWranglerLocale)
) {
  throw new Error("La configuration Wrangler ne respecte pas les garde-fous locaux du pipeline.");
}

async function choisirPortLibre() {
  const serveur = createServer();
  await new Promise((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(0, "127.0.0.1", resoudre);
  });
  const adresse = serveur.address();
  if (!adresse || typeof adresse === "string") throw new Error("Impossible de réserver un port local pour le Worker.");
  await new Promise((resoudre, rejeter) => serveur.close((erreur) => erreur ? rejeter(erreur) : resoudre()));
  return adresse.port;
}

async function attendreWorker(adresse, enfant, cheminSante = "/api/sante") {
  const limite = Date.now() + 90_000;
  let erreurRecente;
  while (Date.now() < limite) {
    if (enfant.exitCode !== null) throw new Error(`Wrangler s’est arrêté avant que le Worker soit prêt (code ${enfant.exitCode}).`);
    try {
      const reponse = await fetch(`${adresse}${cheminSante}`, { signal: AbortSignal.timeout(5_000) });
      if (reponse.status === 200) return;
      erreurRecente = new Error(`Le contrôle de santé a renvoyé HTTP ${reponse.status}.`);
    } catch (erreur) {
      erreurRecente = erreur;
    }
    await new Promise((resoudre) => setTimeout(resoudre, 500));
  }
  throw new Error(`Le Worker local n’a pas démarré à temps: ${erreurRecente instanceof Error ? erreurRecente.message : "aucune réponse"}.`);
}

async function arreterProcessus(enfant) {
  if (!enfant || enfant.exitCode !== null) return;
  async function attendreFermeture(delai) {
    if (enfant.exitCode !== null) return;
    await new Promise((resoudre) => {
      const fermer = () => {
        clearTimeout(minuteur);
        resoudre();
      };
      const minuteur = setTimeout(() => {
        enfant.off("close", fermer);
        resoudre();
      }, delai);
      enfant.once("close", fermer);
    });
  }
  enfant.kill("SIGINT");
  await attendreFermeture(8_000);
  if (enfant.exitCode === null) {
    enfant.kill();
    await attendreFermeture(5_000);
  }
}

async function preparerCommunesPourE2E(dossierD1) {
  if (process.env.SIGAD_PHASE114_ACTIVATION !== "1") return;
  const racineTemporaire = resolve(dossierPersistance);
  const cheminD1 = resolve(dossierD1);
  assert.ok(cheminD1.startsWith(`${racineTemporaire}${sep}`), "Le jeu de communes doit rester dans la D1 temporaire créée pour Playwright.");
  const fichiers = await readdir(cheminD1);
  const fichierBase = fichiers.find((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  if (!fichierBase) throw new Error("La base D1 temporaire du parcours territorial est introuvable.");
  const base = new DatabaseSync(join(cheminD1, fichierBase));
  try {
    const avant = base.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN statut_validation = 'VALIDE' AND actif = 1 THEN 1 ELSE 0 END) AS actives FROM communes",
    ).get();
    if (avant.total !== 500 || avant.actives !== 0) {
      throw new Error("Le jeu territorial Playwright doit commencer avec 500 communes en relecture, sans commune active.");
    }
    const resultat = base.prepare(
      "UPDATE communes SET statut_validation = 'VALIDE', actif = 1 WHERE province_id IN ('prov-sila', 'prov-ouaddai') AND statut_validation = 'PROPOSE'",
    ).run();
    if (resultat.changes !== 39) throw new Error(`Le jeu de test devait activer 39 communes de Sila et Ouaddaï, ${resultat.changes} modifiées.`);
    const comptes = base.prepare(
      "SELECT province_id, COUNT(*) AS total FROM communes WHERE statut_validation = 'VALIDE' AND actif = 1 GROUP BY province_id ORDER BY province_id",
    ).all();
    assert.deepEqual(comptes.map((ligne) => ({ province_id: ligne.province_id, total: ligne.total })), [
      { province_id: "prov-ouaddai", total: 20 },
      { province_id: "prov-sila", total: 19 },
    ], "Seules les communes nécessaires au parcours de recherche isolé sont activées dans la D1 temporaire.");
    console.log("PASS — Jeu Playwright isolé : 19 communes de Sila et 20 d’Ouaddaï activées uniquement dans la D1 temporaire.");
  } finally {
    base.close();
  }
}

try {
  await Promise.all([mkdir(temporaireParente, { recursive: true }), mkdir(persistanceParente, { recursive: true })]);
  dossierTemporaire = await mkdtemp(join(temporaireParente, "sigad-acceptation-worker-"));
  const racineTemporaireVerifiee = resolve(dossierTemporaire);
  assert.ok(
    racineTemporaireVerifiee.startsWith(`${temporaireParente}${sep}`) &&
    racineTemporaireVerifiee.slice(temporaireParente.length + 1).startsWith("sigad-acceptation-worker-"),
    "Le répertoire de test doit être un dossier temporaire SIGAD créé par ce script.",
  );
  dossierPersistance = await mkdtemp(join(persistanceParente, "sigad-acceptation-worker-state-"));
  const racinePersistanceVerifiee = resolve(dossierPersistance);
  assert.ok(
    racinePersistanceVerifiee.startsWith(`${persistanceParente}${sep}`) &&
    racinePersistanceVerifiee.slice(persistanceParente.length + 1).startsWith("sigad-acceptation-worker-state-"),
    "L’état D1 doit rester sous le répertoire temporaire explicitement sélectionné pour cette exécution.",
  );
  const fichierCodes = join(dossierTemporaire, "codes-activation.json");
  const fichierSeed = join(dossierTemporaire, "seed-initial.sql");
  const migrationInitiale = await readFile(join(racine, "migrations/0008_seed_initial_data.sql"));
  const dossierD1 = join(dossierPersistance, "v3", "d1", "miniflare-D1DatabaseObject");
  const dossierConfigurationWrangler = join(dossierTemporaire, "appdata");
  await mkdir(join(dossierConfigurationWrangler, "local"), { recursive: true });
  const environnementWrangler = {
    ...environnementLocal,
    APPDATA: dossierConfigurationWrangler,
    LOCALAPPDATA: join(dossierConfigurationWrangler, "local"),
    TEMP: dossierTemporaire,
    TMP: dossierTemporaire,
    XDG_CONFIG_HOME: join(dossierConfigurationWrangler, "xdg"),
  };
  executerNode([
    resolve(racine, "scripts/generer-seed-initial.mjs"),
    "--mode=development",
    `--fichier-codes=${fichierCodes}`,
    `--fichier-seed=${fichierSeed}`,
  ]);
  assert.deepEqual(
    await readFile(join(racine, "migrations/0008_seed_initial_data.sql")),
    migrationInitiale,
    "La génération des secrets de test ne doit modifier aucune migration appliquée.",
  );
  executerNode([
    executableWrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--config",
    fichierConfigurationWrangler,
    "--local",
    "--persist-to",
    dossierPersistance,
  ], environnementWrangler);
  executerNode([
    executableWrangler,
    "d1",
    "execute",
    "DB",
    "--config",
    fichierConfigurationWrangler,
    "--local",
    "--persist-to",
    dossierPersistance,
    "--file",
    fichierSeed,
  ], environnementWrangler);

  const environnementTest = {
    ...environnementWrangler,
    SIGAD_CODES_FILE: fichierCodes,
    SIGAD_D1_STATE_DIR: dossierD1,
    SIGAD_MFA_TEST_KEY: cleMfaLocale,
    SIGAD_TEST_OPERATOR_PRIVATE_JWK: clePriveeOperateurLocale,
    SIGAD_RECUPERATION_OPERATEUR_IDENTITE: identiteOperateurLocale,
    SIGAD_RECUPERATION_OPERATEUR_CLE_PUBLIQUE: clePubliqueOperateurLocale,
    ...(process.env.SIGAD_RUN_PLAYWRIGHT === "1"
      ? {
        SIGAD_E2E_PASSWORD_FILE: join(dossierTemporaire, "mot-de-passe-central-e2e.txt"),
        SIGAD_E2E_SILA_PASSWORD_FILE: join(dossierTemporaire, "mot-de-passe-sila-e2e.txt"),
        SIGAD_E2E_PROPRIETAIRE_PASSWORD_FILE: join(dossierTemporaire, "mot-de-passe-proprietaire-e2e.txt"),
        SIGAD_E2E_EXPEDITION_FILE: join(dossierTemporaire, "expedition-e2e.json"),
      }
      : {}),
  };
  executerNode([
    "--experimental-sqlite",
    resolve(racine, "scripts/verifier-schema-local.mjs"),
    "--d1-local",
  ], environnementTest);
  await preparerCommunesPourE2E(dossierD1);

  const portCourriel = await choisirPortLibre();
  const adresseCourriel = `http://127.0.0.1:${portCourriel}`;
  const persistanceCourriel = join(dossierPersistance, "email-provider");
  const dossierConfigurationCourriel = join(dossierTemporaire, "email-provider");
  const configurationCourriel = join(dossierConfigurationCourriel, "wrangler.toml");
  await Promise.all([
    mkdir(persistanceCourriel, { recursive: true }),
    mkdir(dossierConfigurationCourriel, { recursive: true }),
  ]);
  await Promise.all([
    copyFile(join(racine, "tests/fixtures/email-provider/wrangler.toml"), configurationCourriel),
    copyFile(join(racine, "tests/fixtures/email-provider/worker.mjs"), join(dossierConfigurationCourriel, "worker.mjs")),
  ]);
  processusCourriel = spawn(process.execPath, [
    executableWrangler,
    "dev",
    "--config",
    configurationCourriel,
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(portCourriel),
    "--show-interactive-dev-session=false",
    "--persist-to",
    persistanceCourriel,
  ], {
    cwd: racine,
    env: environnementWrangler,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  processusCourriel.stdout.on("data", (donnees) => process.stdout.write(donnees));
  processusCourriel.stderr.on("data", (donnees) => process.stderr.write(donnees));
  await attendreWorker(adresseCourriel, processusCourriel, "/health");

  const port = await choisirPortLibre();
  const adresse = `http://127.0.0.1:${port}`;
  const livraisonCourrielActive = process.env.SIGAD_EMAIL_DELIVERY_ENABLED === "false" ? "false" : "true";
  const argumentsWorker = [
    executableWrangler,
    "dev",
    "--config",
    fichierConfigurationWrangler,
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--var",
    "ENVIRONMENT:staging",
    "--var",
    `EMAIL_DELIVERY_ENABLED:${livraisonCourrielActive}`,
    "--var",
    "SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE:true",
    "--var",
    `SIGAD_RECUPERATION_OPERATEUR_IDENTITE:${identiteOperateurLocale}`,
    "--var",
    `SIGAD_RECUPERATION_OPERATEUR_CLE_PUBLIQUE:${clePubliqueOperateurLocale}`,
    "--var",
    `CLE_CHIFFREMENT_MFA:${cleMfaLocale}`,
    "--show-interactive-dev-session=false",
    "--persist-to",
    dossierPersistance,
  ];
  if (livraisonCourrielActive === "true") {
    argumentsWorker.splice(argumentsWorker.length - 3, 0,
      "--var", "RESEND_API_KEY:cle-test-locale-sigad",
      "--var", "SIGAD_EMAIL_FROM:test@sigad.invalid",
      "--var", `SIGAD_OTP_HMAC_SECRET:${randomBytes(32).toString("base64url")}`);
  }
  processusWorker = spawn(process.execPath, argumentsWorker, {
    cwd: racine,
    env: environnementWrangler,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  processusWorker.stdout.on("data", (donnees) => process.stdout.write(donnees));
  processusWorker.stderr.on("data", (donnees) => process.stderr.write(donnees));
  await attendreWorker(adresse, processusWorker);

  const tousLesTests = [
    "auth-worker.test.mjs",
    "comptes-sans-courriel-worker.test.mjs",
    "reprise-verification-courriel-worker.test.mjs",
    "recovery-proprietaire-worker.test.mjs",
    "securite-matrice-worker.test.mjs",
    "stocks-worker.test.mjs",
    "approvisionnements-worker.test.mjs",
    "distributions-worker.test.mjs",
    "rapports-worker.test.mjs",
    "operations-centrales-worker.test.mjs",
    "donnees-test-worker.test.mjs",
  ];
  const testsSelectionnes = process.env.SIGAD_INTEGRATION_TESTS
    ? process.env.SIGAD_INTEGRATION_TESTS.split(",").map((nom) => nom.trim()).filter(Boolean)
    : tousLesTests;
  if (testsSelectionnes.some((nom) => !tousLesTests.includes(nom))) {
    throw new Error("La sélection de tests d’intégration contient un nom inconnu.");
  }
  for (const fichierTest of testsSelectionnes) {
    executerNode([
      "--experimental-strip-types",
      "--experimental-sqlite",
      "--test",
      "--test-concurrency=1",
      resolve(racine, "tests/integration", fichierTest),
    ], {
      ...environnementTest,
      SIGAD_LOCAL_API_URL: adresse,
      SIGAD_D1_STATE_DIR: dossierD1,
      SIGAD_TEST_EMAIL_CAPTURE_URL: adresseCourriel,
    });
  }
  if (process.env.SIGAD_RUN_PLAYWRIGHT === "1") {
    const optionsPlaywright = [];
    if (process.env.SIGAD_PLAYWRIGHT_GREP) {
      optionsPlaywright.push("--grep", process.env.SIGAD_PLAYWRIGHT_GREP);
    }
    if (process.env.SIGAD_PLAYWRIGHT_GREP_INVERT) {
      optionsPlaywright.push("--grep-invert", process.env.SIGAD_PLAYWRIGHT_GREP_INVERT);
    }
    executerNode([
      "--experimental-sqlite",
      resolve(racine, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config=playwright.config.ts",
      ...optionsPlaywright,
    ], {
      ...environnementTest,
      LOCALAPPDATA: process.env.LOCALAPPDATA ?? environnementTest.LOCALAPPDATA,
      APPDATA: process.env.APPDATA ?? environnementTest.APPDATA,
      USERPROFILE: process.env.USERPROFILE ?? environnementTest.USERPROFILE,
      SIGAD_LOCAL_API_URL: adresse,
      SIGAD_D1_STATE_DIR: dossierD1,
      SIGAD_TEST_EMAIL_CAPTURE_URL: adresseCourriel,
    });
  }
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : "Échec inconnu de l’acceptation locale.");
  process.exitCode = 1;
} finally {
  await arreterProcessus(processusWorker);
  await arreterProcessus(processusCourriel);
  if (dossierTemporaire) {
    const chemin = resolve(dossierTemporaire);
    if (!isAbsolute(chemin) || !chemin.startsWith(`${temporaireParente}${sep}`) || !chemin.slice(temporaireParente.length + 1).startsWith("sigad-acceptation-worker-")) {
      throw new Error("Le répertoire temporaire sort du périmètre autorisé de nettoyage.");
    }
    await Promise.all([
      "codes-activation.json",
      "mot-de-passe-central-e2e.txt",
      "mot-de-passe-sila-e2e.txt",
      "mot-de-passe-proprietaire-e2e.txt",
    ].map((nom) => rm(join(chemin, nom), { force: true, maxRetries: 8, retryDelay: 250 })));
    await rm(chemin, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  if (dossierPersistance) {
    const chemin = resolve(dossierPersistance);
    if (!isAbsolute(chemin) || !chemin.startsWith(`${persistanceParente}${sep}`) || !chemin.slice(persistanceParente.length + 1).startsWith("sigad-acceptation-worker-state-")) {
      throw new Error("L’état temporaire D1 sort du périmètre autorisé de nettoyage.");
    }
    await rm(chemin, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}
