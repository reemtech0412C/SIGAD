import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const executableWrangler = resolve(racine, "node_modules/wrangler/bin/wrangler.js");
const persistanceParente = resolve(tmpdir());
let dossierTemporaire;
let dossierPersistance;
let processusWorker;
let contenuSeedInitial;

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
  processusWorker.kill("SIGINT");
  await Promise.race([
    new Promise((resoudre) => processusWorker.once("close", resoudre)),
    new Promise((resoudre) => setTimeout(resoudre, 8_000)),
  ]);
  if (processusWorker.exitCode === null) processusWorker.kill();
}

try {
  dossierTemporaire = await mkdtemp(join(persistanceParente, "sigad-acceptation-worker-"));
  const racineTemporaireVerifiee = resolve(dossierTemporaire);
  assert.ok(
    racineTemporaireVerifiee.startsWith(`${persistanceParente}${sep}`) &&
    racineTemporaireVerifiee.slice(persistanceParente.length + 1).startsWith("sigad-acceptation-worker-"),
    "Le répertoire de test doit être un dossier temporaire SIGAD créé par ce script.",
  );
  dossierPersistance = await mkdtemp(join(racine, ".wrangler", "sigad-acceptation-worker-state-"));
  const racinePersistanceVerifiee = resolve(dossierPersistance);
  assert.ok(
    racinePersistanceVerifiee.startsWith(`${resolve(racine, ".wrangler")}${sep}`) &&
    racinePersistanceVerifiee.slice(resolve(racine, ".wrangler").length + 1).startsWith("sigad-acceptation-worker-state-"),
    "L’état D1 de test doit être créé sous le répertoire Wrangler local du projet.",
  );
  const fichierCodes = join(dossierTemporaire, "codes-activation.json");
  const dossierD1 = join(dossierPersistance, "v3", "d1", "miniflare-D1DatabaseObject");
  contenuSeedInitial = await readFile(join(racine, "migrations/0008_seed_initial_data.sql"));

  executerNode([
    resolve(racine, "scripts/generer-seed-initial.mjs"),
    "--mode=development",
    `--fichier-codes=${fichierCodes}`,
  ]);
  executerNode([
    executableWrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    dossierPersistance,
  ]);

  const environnementTest = {
    ...process.env,
    SIGAD_CODES_FILE: fichierCodes,
    SIGAD_D1_STATE_DIR: dossierD1,
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
    "--show-interactive-dev-session=false",
    "--persist-to",
    dossierPersistance,
  ], {
    cwd: racine,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  processusWorker.stdout.on("data", (donnees) => process.stdout.write(donnees));
  processusWorker.stderr.on("data", (donnees) => process.stderr.write(donnees));
  await attendreWorker(adresse, processusWorker);

  for (const fichierTest of [
    "auth-worker.test.mjs",
    "stocks-worker.test.mjs",
    "approvisionnements-worker.test.mjs",
  ]) {
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
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : "Échec inconnu de l’acceptation locale.");
  process.exitCode = 1;
} finally {
  await arreterWorker();
  if (contenuSeedInitial) await writeFile(join(racine, "migrations/0008_seed_initial_data.sql"), contenuSeedInitial);
  if (dossierTemporaire) {
    const chemin = resolve(dossierTemporaire);
    if (!isAbsolute(chemin) || !chemin.startsWith(`${persistanceParente}${sep}`) || !chemin.slice(persistanceParente.length + 1).startsWith("sigad-acceptation-worker-")) {
      throw new Error("Le répertoire temporaire sort du périmètre autorisé de nettoyage.");
    }
    await rm(chemin, { recursive: true, force: true });
  }
  if (dossierPersistance) {
    const chemin = resolve(dossierPersistance);
    const racineWrangler = resolve(racine, ".wrangler");
    if (!isAbsolute(chemin) || !chemin.startsWith(`${racineWrangler}${sep}`) || !chemin.slice(racineWrangler.length + 1).startsWith("sigad-acceptation-worker-state-")) {
      throw new Error("L’état temporaire D1 sort du périmètre autorisé de nettoyage.");
    }
    await rm(chemin, { recursive: true, force: true });
  }
}
