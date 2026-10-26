import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
    throw new Error(`[SIGAD_BACKUP_ERROR] ${message}`);
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
  const dossierSauvegardes = join(appData, "SIGAD", "backups", "staging");
  return dossierSauvegardes;
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
  } catch (err) {}
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
    target: "pre-0028-to-0034",
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

async function simulerMigrationsLocales(baseClair) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = OFF;");
    const instructions = decouperInstructionsSql(baseClair.toString("utf8"));
    for (const inst of instructions) {
      db.exec(inst.sql);
    }
    db.exec("PRAGMA foreign_keys = ON;");

    const migrationsAvant = db.prepare("SELECT name FROM d1_migrations ORDER BY id ASC").all().map(r => r.name);
    console.log(`[SIMULATION] Migrations déjà appliquées sur Staging : ${migrationsAvant.length}`);

    // Application séquentielle des migrations 0028 à 0034
    for (let i = 28; i <= 34; i++) {
      const pad = String(i).padStart(4, "0");
      const migrationFile = (await import("node:fs")).readdirSync(join(racineProjet, "migrations")).find(f => f.startsWith(pad));
      if (migrationFile) {
        const sql = readFileSync(join(racineProjet, "migrations", migrationFile), "utf8");
        db.exec(sql);
      }
    }

    const fkErrors = db.prepare("PRAGMA foreign_key_check").all();
    exiger(fkErrors.length === 0, `Violations de clé étrangère : ${JSON.stringify(fkErrors)}`);

    const depsCount = db.prepare("SELECT COUNT(*) as c FROM departements WHERE statut_validation = 'VALIDE' AND statut_operationnel = 'ACTIF'").get().c;
    exiger(depsCount === 112, `Attendu 112 départements activés, trouvé ${depsCount}`);

    return {
      migrationsAvantCount: migrationsAvant.length,
      derniereMigration: migrationsAvant[migrationsAvant.length - 1],
      depsActifs: depsCount,
      fkErrorsCount: fkErrors.length,
    };
  } finally {
    db.close();
  }
}

async function main() {
  console.log("=== SIGAD — SAUVEGARDE CHIFFRÉE STAGING PRE-0028 ET CONTRÔLE D'INTÉGRITÉ ===");

  verifierConfigurationWrangler();
  const dossierSauvegardes = verifierProfilWindows();
  const sid = lireSidWindows();
  verifierConnexionCloudflare();

  const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
  const runId = randomBytes(4).toString("hex");
  const dossierRun = join(dossierSauvegardes, `before-0028-${timestamp}-${runId}`);
  await mkdir(dossierRun, { recursive: true });
  restreindreAcl(dossierRun, sid, true);

  const fichierSqlTemp = join(dossierRun, `export-temp-${runId}.sql`);
  const fichierSauvegarde = join(dossierRun, "sigad-staging-db-before-0028.dpapi-aesgcm.json");

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

  console.log("[5/5] Test de restauration isolée en mémoire SQLite et simulation migrations 0028 à 0034...");
  const manifeste = await readFile(fichierSauvegarde, "utf8");
  const { clair, document } = dechiffrerExport(manifeste);
  try {
    const sim = await simulerMigrationsLocales(clair);
    console.log("\n=== RÉSULTATS DE VÉRIFICATION DE LA SAUVEGARDE STAGING ===");
    console.log(`- Fichier sauvegarde chiffrée : ${fichierSauvegarde}`);
    console.log(`- Algorithme                  : ${document.algorithm} (Clé: ${document.keyProtection})`);
    console.log(`- Empreinte SHA-256           : ${document.sha256}`);
    console.log(`- Taille déchiffrée           : ${document.bytes} octets`);
    console.log(`- Migrations existantes       : ${sim.migrationsAvantCount} (${sim.derniereMigration})`);
    console.log(`- Simulation 0028-0034 locale : SUCCÈS (0 erreur FK, 112 départements activés)`);
    console.log("=== SAUVEGARDE PRE-0028 VÉRIFIÉE ET CONFORME ===");
  } finally {
    clair.fill(0);
  }
}

main().catch((err) => {
  console.error("ÉCHEC DE LA SAUVEGARDE :", err.message);
  process.exitCode = 1;
});
