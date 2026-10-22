import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const executableWrangler = resolve(racine, "node_modules/wrangler/bin/wrangler.js");
const persistanceParente = resolve(process.env.SIGAD_TEST_STATE_ROOT ?? join(racine, ".wrangler", "sigad-tests-state"));
const temporaireParente = resolve(process.env.SIGAD_TEST_TEMP_ROOT ?? tmpdir());
let dossierTemporaire;
let dossierPersistance;
let processusWorker;
const cleMfaLocale = randomBytes(32).toString("base64url");

function executerNode(argumentsNode, environnement = process.env) {
  const resultat = spawnSync(process.execPath, argumentsNode, {
    cwd: racine,
    env: environnement,
    stdio: "inherit",
    windowsHide: true,
  });
  if (resultat.error) throw resultat.error;
  if (resultat.status !== 0) throw new Error(`La commande Node s’est terminée avec le code ${resultat.status ?? "inconnu"}.`);
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

async function attendreWorker(adresse, enfant) {
  const limite = Date.now() + 45_000;
  let erreurRecente;
  while (Date.now() < limite) {
    if (enfant.exitCode !== null) throw new Error(`Wrangler s’est arrêté avant que le Worker soit prêt (code ${enfant.exitCode}).`);
    try {
      const reponse = await fetch(`${adresse}/api/sante`, { signal: AbortSignal.timeout(1_000) });
      if (reponse.status === 200) return;
      erreurRecente = new Error(`Le contrôle de santé a renvoyé HTTP ${reponse.status}.`);
    } catch (erreur) {
      erreurRecente = erreur;
    }
    await new Promise((resoudre) => setTimeout(resoudre, 250));
  }
  throw new Error(`Le Worker local n’a pas démarré à temps: ${erreurRecente instanceof Error ? erreurRecente.message : "aucune réponse"}.`);
}

async function arreterWorker() {
  if (!processusWorker || processusWorker.exitCode !== null) return;
  async function attendreFermeture(delai) {
    const enfant = processusWorker;
    if (!enfant || enfant.exitCode !== null) return;
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
  processusWorker.kill("SIGINT");
  await attendreFermeture(8_000);
  if (processusWorker.exitCode === null) {
    processusWorker.kill();
    await attendreFermeture(5_000);
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
    ...process.env,
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
    "--local",
    "--persist-to",
    dossierPersistance,
  ], environnementWrangler);
  executerNode([
    executableWrangler,
    "d1",
    "execute",
    "DB",
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
    ...(process.env.SIGAD_RUN_PLAYWRIGHT === "1"
      ? {
        SIGAD_E2E_PASSWORD_FILE: join(dossierTemporaire, "mot-de-passe-central-e2e.txt"),
        SIGAD_E2E_SILA_PASSWORD_FILE: join(dossierTemporaire, "mot-de-passe-sila-e2e.txt"),
        SIGAD_E2E_EXPEDITION_FILE: join(dossierTemporaire, "expedition-e2e.json"),
      }
      : {}),
  };
  executerNode([
    "--experimental-sqlite",
    resolve(racine, "scripts/verifier-schema-local.mjs"),
    "--d1-local",
  ], environnementTest);

  const port = await choisirPortLibre();
  const adresse = `http://127.0.0.1:${port}`;
  processusWorker = spawn(process.execPath, [
    executableWrangler,
    "dev",
    "--config",
    "wrangler.toml",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--var",
    "ENVIRONMENT:development",
    "--var",
    `CLE_CHIFFREMENT_MFA:${cleMfaLocale}`,
    "--show-interactive-dev-session=false",
    "--persist-to",
    dossierPersistance,
  ], {
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
    "securite-matrice-worker.test.mjs",
    "stocks-worker.test.mjs",
    "approvisionnements-worker.test.mjs",
    "distributions-worker.test.mjs",
    "rapports-worker.test.mjs",
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
    });
  }
  if (process.env.SIGAD_RUN_PLAYWRIGHT === "1") {
    const optionsPlaywright = process.env.SIGAD_PLAYWRIGHT_GREP
      ? ["--grep", process.env.SIGAD_PLAYWRIGHT_GREP]
      : [];
    executerNode([
      "--experimental-sqlite",
      resolve(racine, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config=playwright.config.ts",
      ...optionsPlaywright,
    ], {
      ...environnementTest,
      SIGAD_LOCAL_API_URL: adresse,
      SIGAD_D1_STATE_DIR: dossierD1,
    });
  }
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : "Échec inconnu de l’acceptation locale.");
  process.exitCode = 1;
} finally {
  await arreterWorker();
  if (dossierTemporaire) {
    const chemin = resolve(dossierTemporaire);
    if (!isAbsolute(chemin) || !chemin.startsWith(`${temporaireParente}${sep}`) || !chemin.slice(temporaireParente.length + 1).startsWith("sigad-acceptation-worker-")) {
      throw new Error("Le répertoire temporaire sort du périmètre autorisé de nettoyage.");
    }
    await Promise.all([
      "codes-activation.json",
      "mot-de-passe-central-e2e.txt",
      "mot-de-passe-sila-e2e.txt",
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
