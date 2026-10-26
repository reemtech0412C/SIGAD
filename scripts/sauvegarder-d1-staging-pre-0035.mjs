import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { dechiffrerOctetsDpapi, protegerDpapi } from "./coffre-recuperation-dpapi.mjs";
import { decouperInstructionsSql } from "./outils-restauration-sqlite.mjs";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const compteCloudflareAttendu = "a2c898e7e1fda02365b7d8a49809f7e9";
const nomBaseAttendu = "sigad-staging-db";
const identifiantBaseAttendu = "a54e1ea9-c49a-4729-ad06-a40ceb421127";
const versionEnveloppe = 2;

function exiger(condition, message) {
  if (!condition) {
    throw new Error(`[SIGAD_BACKUP_0035_ERROR] ${message}`);
  }
}

function environnementWrangler() {
  return {
    ...process.env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_SANITIZE: "true",
    NO_COLOR: "1",
  };
}

function executerSilencieusement(executable, argumentsCommande, options = {}) {
  const resultat = spawnSync(executable, argumentsCommande, {
    cwd: options.cwd ?? racineProjet,
    env: options.env ?? environnementWrangler(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (resultat.error) {
    throw new Error(`Échec sous-processus: ${resultat.error.message}`);
  }
  if (resultat.status !== 0) {
    const detail = `${resultat.stdout ?? ""}\n${resultat.stderr ?? ""}`.trim();
    throw new Error(`Sous-processus sorti avec code ${resultat.status}: ${detail}`);
  }
  return resultat.stdout;
}

function lireSidWindows() {
  const sortie = executerSilencieusement("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
  ], { env: process.env }).trim();
  exiger(/^S-1-[0-9-]+$/u.test(sortie), "SID Windows non reconnu.");
  return sortie;
}

function verifierProfilWindows() {
  const appData = process.env.LOCALAPPDATA;
  exiger(Boolean(appData), "LOCALAPPDATA non défini.");
  return join(appData, "SIGAD", "backups", "staging");
}

function verifierConfigurationWrangler() {
  const contenu = readFileSync(fichierConfiguration, "utf8");
  exiger(contenu.includes(`database_name = "${nomBaseAttendu}"`), "database_name inattendu.");
  exiger(contenu.includes(`database_id = "${identifiantBaseAttendu}"`), "database_id inattendu.");
}

function verifierConnexionCloudflare() {
  const sortie = executerSilencieusement(process.execPath, [
    executableWrangler, "whoami", "--config", fichierConfiguration,
  ]);
  exiger(sortie.includes(compteCloudflareAttendu), "Session Cloudflare non authentifiée sur le compte attendu.");
}

function restreindreAcl(cheminCible, sid, estDossier) {
  const icaclsArgs = [
    cheminCible,
    "/inheritance:r",
    "/grant:r", `*${sid}:${estDossier ? "(OI)(CI)F" : "F"}`,
  ];
  executerSilencieusement("icacls.exe", icaclsArgs, { env: process.env });
}

async function supprimerExportTemporaire(cheminSql) {
  try {
    const handle = await open(cheminSql, "r+");
    const info = await handle.stat();
    if (info.size > 0) {
      const zeros = Buffer.alloc(Math.min(info.size, 1024 * 1024), 0);
      let ecrit = 0;
      while (ecrit < info.size) {
        const reste = info.size - ecrit;
        const longueur = Math.min(reste, zeros.length);
        await handle.write(zeros, 0, longueur, ecrit);
        ecrit += longueur;
      }
      await handle.sync();
    }
    await handle.close();
  } catch {}
  await rm(cheminSql, { force: true });
  return true;
}

function chiffrerExport(tamponClair) {
  const cleAes = randomBytes(32);
  const iv = randomBytes(12);
  const cleChiffree = protegerDpapi(cleAes, "ENTROPIE_SIGAD_STAGING_BACKUP_V2");

  const cipher = createCipheriv("aes-256-gcm", cleAes, iv);
  const chiffre = Buffer.concat([cipher.update(tamponClair), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const sha256Clair = createHash("sha256").update(tamponClair).digest("hex");
  cleAes.fill(0);

  return JSON.stringify({
    version: versionEnveloppe,
    algorithm: "AES-256-GCM",
    keyProtection: "Windows-DPAPI-CurrentUser",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    encryptedKey: cleChiffree.toString("base64"),
    sha256: sha256Clair,
    bytes: tamponClair.length,
    ciphertext: chiffre.toString("base64"),
    createdAt: new Date().toISOString(),
    databaseId: identifiantBaseAttendu,
    databaseName: nomBaseAttendu,
    target: "pre-0035",
  }, null, 2);
}

function dechiffrerExport(contenuJson) {
  const document = JSON.parse(contenuJson);
  exiger(document.version === versionEnveloppe, "Version enveloppe non supportée.");
  exiger(document.algorithm === "AES-256-GCM", "Algorithme non supporté.");

  const cleAes = dechiffrerOctetsDpapi(document.encryptedKey);
  const iv = Buffer.from(document.iv, "base64");
  const authTag = Buffer.from(document.authTag, "base64");
  const ciphertext = Buffer.from(document.ciphertext, "base64");

  const decipher = createDecipheriv("aes-256-gcm", cleAes, iv);
  decipher.setAuthTag(authTag);
  const clair = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  cleAes.fill(0);

  const shaCalcule = createHash("sha256").update(clair).digest("hex");
  exiger(shaCalcule === document.sha256, "Altération détectée : condensat SHA-256 invalide.");
  return { clair, document };
}

async function simulerMigration0035SurCopieIsolee(baseClair) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = OFF;");
    const instructions = decouperInstructionsSql(baseClair.toString("utf8"));
    for (const inst of instructions) {
      db.exec(inst.sql);
    }
    db.exec("PRAGMA foreign_keys = ON;");

    const migrationsAvant = db.prepare("SELECT name FROM d1_migrations ORDER BY id ASC").all().map(r => r.name);
    exiger(migrationsAvant.length === 34, `Attendu 34 migrations avant 0035, trouvé ${migrationsAvant.length}`);
    exiger(
      migrationsAvant[migrationsAvant.length - 1] === "0034_finalisation_administration_territoriale.sql",
      `Dernière migration inattendue : ${migrationsAvant[migrationsAvant.length - 1]}`,
    );

    const avant = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM provinces) AS provinces,
        (SELECT COUNT(*) FROM departements) AS departements,
        (SELECT COUNT(*) FROM communes) AS communes,
        (SELECT COUNT(*) FROM localites) AS localites,
        (SELECT COUNT(*) FROM arrondissements) AS arrondissements,
        (SELECT COUNT(*) FROM quartiers) AS quartiers,
        (SELECT COUNT(*) FROM operations_centrales_distribution) AS operations_centrales,
        (SELECT COUNT(*) FROM menages) AS menages,
        (SELECT COUNT(*) FROM distributions_provinciales) AS distributions
    `).get();

    exiger(avant.provinces === 23, `Provinces avant 0035 : ${avant.provinces}`);
    exiger(avant.departements === 112, `Départements avant 0035 : ${avant.departements}`);
    exiger(avant.communes === 500, `Communes avant 0035 : ${avant.communes}`);

    // Application de la migration 0035 sur la copie isolée
    const sql0035 = readFileSync(
      join(racineProjet, "migrations", "0035_refonte_territoriale_dynamique_sans_communes.sql"),
      "utf8",
    );
    db.exec(sql0035);

    const integrity = db.prepare("PRAGMA integrity_check").all();
    exiger(integrity.length === 1 && integrity[0].integrity_check === "ok", `Intégrité SQLite KO : ${JSON.stringify(integrity)}`);

    const fkErrors = db.prepare("PRAGMA foreign_key_check").all();
    exiger(fkErrors.length === 0, `Violations de clé étrangère après 0035 : ${JSON.stringify(fkErrors)}`);

    const apres = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM provinces WHERE actif = 1) AS provinces,
        (SELECT COUNT(*) FROM departements WHERE actif = 1 AND statut_validation = 'VALIDE' AND statut_operationnel = 'ACTIF') AS departements_actifs,
        (SELECT COUNT(*) FROM communes) AS communes,
        (SELECT COUNT(*) FROM rattachements_territoriaux) AS rattachements_territoriaux,
        (SELECT COUNT(*) FROM localites) AS localites,
        (SELECT COUNT(*) FROM arrondissements) AS arrondissements,
        (SELECT COUNT(*) FROM quartiers) AS quartiers,
        (SELECT COUNT(*) FROM operations_centrales_distribution) AS operations_centrales,
        (SELECT COUNT(*) FROM menages) AS menages,
        (SELECT COUNT(*) FROM distributions_provinciales) AS distributions
    `).get();

    exiger(apres.provinces === 23, `Provinces après 0035 : ${apres.provinces}`);
    exiger(apres.departements_actifs === 112, `Départements actifs après 0035 : ${apres.departements_actifs}`);
    exiger(apres.communes === 0, `Communes après 0035 : ${apres.communes}`);
    exiger(apres.rattachements_territoriaux === 0, `Rattachements après 0035 : ${apres.rattachements_territoriaux}`);
    exiger(apres.localites === avant.localites, `Localités altérées : ${apres.localites} vs ${avant.localites}`);
    exiger(apres.arrondissements === avant.arrondissements, `Arrondissements altérés : ${apres.arrondissements} vs ${avant.arrondissements}`);
    exiger(apres.quartiers === avant.quartiers, `Quartiers altérés : ${apres.quartiers} vs ${avant.quartiers}`);
    exiger(apres.operations_centrales === avant.operations_centrales, `Opérations centrales altérées`);
    exiger(apres.menages === avant.menages, `Ménages altérés`);
    exiger(apres.distributions === avant.distributions, `Distributions altérées`);

    return {
      migrationsAvantCount: migrationsAvant.length,
      derniereMigration: migrationsAvant[migrationsAvant.length - 1],
      avant,
      apres,
      integrityCheck: integrity[0].integrity_check,
      fkErrorsCount: fkErrors.length,
    };
  } finally {
    db.close();
  }
}

async function main() {
  console.log("=== SIGAD — SAUVEGARDE CHIFFRÉE STAGING PRE-0035 ET SIMULATION ISOLÉE ===");

  verifierConfigurationWrangler();
  const dossierSauvegardes = verifierProfilWindows();
  const sid = lireSidWindows();
  verifierConnexionCloudflare();

  const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
  const runId = randomBytes(4).toString("hex");
  const dossierRun = join(dossierSauvegardes, `before-0035-${timestamp}-${runId}`);
  await mkdir(dossierRun, { recursive: true });
  restreindreAcl(dossierRun, sid, true);

  const fichierSqlTemp = join(dossierRun, `export-temp-${runId}.sql`);
  const fichierSauvegarde = join(dossierRun, "sigad-staging-db-before-0035.dpapi-aesgcm.json");

  console.log(`[1/5] Dossier sécurisé créé : ${dossierRun}`);
  console.log(`[2/5] Exportation en lecture seule depuis Cloudflare D1 (${nomBaseAttendu})...`);

  let contenuSql = null;
  try {
    executerSilencieusement(process.execPath, [
      executableWrangler,
      "d1", "export", nomBaseAttendu,
      "--remote",
      "--config", fichierConfiguration,
      "--output", fichierSqlTemp,
      "--skip-confirmation",
    ]);

    const statSql = await stat(fichierSqlTemp);
    exiger(statSql.size > 0, "Export SQL vide.");
    contenuSql = await readFile(fichierSqlTemp);

    console.log(`[3/5] Chiffrement de l'export (${statSql.size} octets) avec AES-256-GCM + DPAPI CurrentUser...`);
    const jsonChiffre = chiffrerExport(contenuSql);
    await writeFile(fichierSauvegarde, jsonChiffre, { encoding: "utf8", mode: 0o600 });
    restreindreAcl(fichierSauvegarde, sid, false);
  } finally {
    if (contenuSql) contenuSql.fill(0);
    console.log("[4/5] Écrasement à zéro et suppression définitive du fichier SQL temporaire...");
    await supprimerExportTemporaire(fichierSqlTemp);
  }

  console.log("[5/5] Test de restauration isolée en mémoire SQLite et simulation migration 0035...");
  const manifeste = await readFile(fichierSauvegarde, "utf8");
  const { clair, document } = dechiffrerExport(manifeste);
  try {
    const sim = await simulerMigration0035SurCopieIsolee(clair);
    console.log("\n=== RÉSULTATS DE VÉRIFICATION DE LA SAUVEGARDE ET DE LA SIMULATION 0035 ===");
    console.log(`- Fichier sauvegarde chiffrée : ${fichierSauvegarde}`);
    console.log(`- Algorithme                  : ${document.algorithm} (Clé: ${document.keyProtection})`);
    console.log(`- Empreinte SHA-256           : ${document.sha256}`);
    console.log(`- Taille déchiffrée           : ${document.bytes} octets`);
    console.log(`- Migrations existantes       : ${sim.migrationsAvantCount} (${sim.derniereMigration})`);
    console.log(`- Intégrité SQLite post-0035  : ${sim.integrityCheck} (0 erreur FK)`);
    console.log(`- Comptes avant 0035          : ${JSON.stringify(sim.avant)}`);
    console.log(`- Comptes après 0035          : ${JSON.stringify(sim.apres)}`);
    console.log("=== SAUVEGARDE PRE-0035 ET SIMULATION ISOLÉE VÉRIFIÉES ET CONFORMES ===");
  } finally {
    clair.fill(0);
  }
}

main().catch((err) => {
  console.error("ÉCHEC DE LA SAUVEGARDE / SIMULATION 0035 :", err.message);
  process.exitCode = 1;
});
