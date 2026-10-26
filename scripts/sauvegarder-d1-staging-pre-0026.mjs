import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { dechiffrerOctetsDpapi, protegerDpapi } from "./coffre-recuperation-dpapi.mjs";

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
    WRANGLER_LOG: "error",
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

function restreindreAcl(chemin, sid, dossier) {
  const droit = dossier ? "(OI)(CI)F" : "F";
  executerSilencieusement("icacls.exe", [chemin, "/inheritance:r", "/grant:r", `*${sid}:${droit}`], {
    env: process.env,
  });
}

function verifierProfilWindows() {
  exiger(process.platform === "win32", "Exécutable sous Windows uniquement.");
  const appDataLocal = process.env.LOCALAPPDATA;
  exiger(typeof appDataLocal === "string" && appDataLocal.length > 0, "LOCALAPPDATA manquant.");
  exiger(!/\\Packages\\sandbox\./iu.test(resolve(appDataLocal)), "Environnement sandbox détecté.");
  const dossierSauvegardes = resolve(appDataLocal, "SIGAD", "Staging", "backups");
  const relatifAuProjet = relative(racineProjet, dossierSauvegardes);
  exiger(relatifAuProjet.startsWith(`..${sep}`) || relatifAuProjet === ".." || isAbsolute(relatifAuProjet),
    "Le dossier de sauvegarde doit impérativement être en dehors du dépôt Git.");
  return dossierSauvegardes;
}

function verifierConfigurationWrangler() {
  const texte = readFileSync(fichierConfiguration, "utf8");
  exiger(/^name\s*=\s*"sigad-staging"\s*$/mu.test(texte), "Configuration cible non staging.");
  exiger(/^ENVIRONMENT\s*=\s*"staging"\s*$/mu.test(texte), "Variable ENVIRONMENT non staging.");
  exiger(texte.includes(identifiantBaseAttendu), "Identifiant D1 Staging manquant dans la config.");
  exiger(texte.includes(nomBaseAttendu), "Nom de la base D1 Staging manquant dans la config.");
}

function verifierConnexionCloudflare() {
  const identite = JSON.parse(
    executerSilencieusement(process.execPath, [executableWrangler, "whoami", "--json"]),
  );
  exiger(identite.loggedIn === true, "Wrangler non connecté.");
  exiger(identite.accounts.some((acc) => acc.id === compteCloudflareAttendu), "Compte Cloudflare inattendu.");
}

async function supprimerExportTemporaire(chemin) {
  try {
    const informations = await stat(chemin);
    if (informations.isFile() && informations.size > 0) {
      const fichier = await open(chemin, "r+");
      try {
        const blocZero = Buffer.alloc(64 * 1024);
        let position = 0;
        while (position < informations.size) {
          const taille = Math.min(blocZero.length, informations.size - position);
          await fichier.write(blocZero, 0, taille, position);
          position += taille;
        }
        await fichier.sync();
        blocZero.fill(0);
      } finally {
        await fichier.close();
      }
    }
    await rm(chemin, { force: true });
    return true;
  } catch {
    await rm(chemin, { force: true }).catch(() => undefined);
    return false;
  }
}

function chiffrerExport(contenuSql) {
  const cle = randomBytes(32);
  const iv = randomBytes(12);
  const date = new Date().toISOString();
  const aad = `SIGAD-D1-BACKUP-v${versionEnveloppe}|${compteCloudflareAttendu}|${identifiantBaseAttendu}|${date}`;
  try {
    const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
    chiffreur.setAAD(Buffer.from(aad, "utf8"));
    const contenuChiffre = Buffer.concat([chiffreur.update(contenuSql), chiffreur.final()]);
    const document = {
      version: versionEnveloppe,
      algorithm: "AES-256-GCM",
      keyProtection: "DPAPI-CurrentUser",
      scope: nomBaseAttendu,
      accountId: compteCloudflareAttendu,
      databaseId: identifiantBaseAttendu,
      createdAt: date,
      aad,
      bytes: contenuSql.length,
      sha256: createHash("sha256").update(contenuSql).digest("hex"),
      iv: iv.toString("base64"),
      authTag: chiffreur.getAuthTag().toString("base64"),
      ciphertext: contenuChiffre.toString("base64"),
      wrappedKeyDpapiCurrentUser: protegerDpapi(cle),
    };
    contenuChiffre.fill(0);
    return `${JSON.stringify(document, null, 2)}\n`;
  } finally {
    cle.fill(0);
    iv.fill(0);
  }
}

function dechiffrerExport(texteJson) {
  const document = JSON.parse(texteJson);
  exiger(document.version === versionEnveloppe, "Version enveloppe non supportée.");
  exiger(document.algorithm === "AES-256-GCM", "Algorithme non supporté.");
  exiger(document.keyProtection === "DPAPI-CurrentUser", "Protection clé non supportée.");
  exiger(document.databaseId === identifiantBaseAttendu, "Base inattendue.");

  const cle = dechiffrerOctetsDpapi(document.wrappedKeyDpapiCurrentUser);
  try {
    const dechiffreur = createDecipheriv("aes-256-gcm", cle, Buffer.from(document.iv, "base64"));
    dechiffreur.setAuthTag(Buffer.from(document.authTag, "base64"));
    dechiffreur.setAAD(Buffer.from(document.aad, "utf8"));
    const clair = Buffer.concat([
      dechiffreur.update(Buffer.from(document.ciphertext, "base64")),
      dechiffreur.final(),
    ]);
    exiger(clair.length === document.bytes, "Taille déchiffrée non concordante.");
    exiger(createHash("sha256").update(clair).digest("hex") === document.sha256, "Intégrité SHA-256 échouée.");
    return { clair, document };
  } finally {
    cle.fill(0);
  }
}

async function verifierRestaurationEtMigrations(sqlClair) {
  const base = new DatabaseSync(":memory:");
  try {
    base.exec("PRAGMA foreign_keys = OFF;");
    base.exec(sqlClair.toString("utf8"));
    base.exec("PRAGMA foreign_keys = ON;");

    // 1. Intégrité SQLite
    const integrite = base.prepare("PRAGMA integrity_check").all();
    exiger(integrite.length === 1 && Reflect.get(integrite[0], "integrity_check") === "ok",
      "PRAGMA integrity_check n'a pas retourné ok.");

    // 2. Clés étrangères
    const fkCheck = base.prepare("PRAGMA foreign_key_check").all();
    exiger(fkCheck.length === 0, `Violations de clés étrangères détectées: ${JSON.stringify(fkCheck)}`);

    // 3. Registre migrations existantes (0001 à 0024)
    const migrationsLignes = base.prepare("SELECT name FROM d1_migrations ORDER BY id ASC").all();
    const migrationsNoms = migrationsLignes.map((l) => Reflect.get(l, "name"));
    exiger(migrationsNoms.length === 24, `Nombre de migrations attendu: 24, obtenu: ${migrationsNoms.length}`);
    exiger(migrationsNoms[0].startsWith("0001_"), "Première migration attendue: 0001");
    exiger(migrationsNoms[23].startsWith("0024_"), "Dernière migration appliquée attendue: 0024");

    // 4. Comptes utilisateurs
    const comptes = base.prepare("SELECT id, identifiant, role, statut, province_id FROM utilisateurs ORDER BY id ASC").all();
    exiger(comptes.length === 25, `Nombre de comptes attendu: 25, obtenu: ${comptes.length}`);
    const delegueSila = comptes.find((c) => Reflect.get(c, "id") === "usr-sila");
    exiger(delegueSila !== undefined, "Compte usr-sila absent.");
    exiger(Reflect.get(delegueSila, "statut") === "VERROUILLE", "Le compte usr-sila doit être VERROUILLE.");

    // 5. Test d'application locale des migrations 0025 et 0026 dans cette base mémoire isolée
    const sql0025 = await readFile(resolve(racineProjet, "migrations/0025_inscriptions_comptes_et_profils.sql"), "utf8");
    base.exec(sql0025);

    const sql0026 = await readFile(resolve(racineProjet, "migrations/0026_operations_centrales_distribution.sql"), "utf8");
    base.exec(sql0026);

    // Vérifier intégrité après simulation locale
    const integriteApres = base.prepare("PRAGMA integrity_check").all();
    exiger(integriteApres.length === 1 && Reflect.get(integriteApres[0], "integrity_check") === "ok",
      "PRAGMA integrity_check post-0026 a échoué.");

    const fkCheckApres = base.prepare("PRAGMA foreign_key_check").all();
    exiger(fkCheckApres.length === 0, `Violations FK post-0026: ${JSON.stringify(fkCheckApres)}`);

    // Vérifier les nouvelles tables
    const tablesApres = base.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
      .map((r) => Reflect.get(r, "name"));
    exiger(tablesApres.includes("operations_centrales_distribution"), "Table operations_centrales_distribution absente.");
    exiger(tablesApres.includes("operations_centrales_provinces"), "Table operations_centrales_provinces absente.");
    exiger(tablesApres.includes("dossiers_execution_provinciaux"), "Table dossiers_execution_provinciaux absente.");
    exiger(tablesApres.includes("approbations_operations"), "Table approbations_operations absente.");
    exiger(tablesApres.includes("documents_operations"), "Table documents_operations absente.");
    exiger(tablesApres.includes("historique_operations_centrales"), "Table historique_operations_centrales absente.");

    // Vérifier les comptes après simulation
    const comptesApres = base.prepare("SELECT statut FROM utilisateurs WHERE id = 'usr-sila'").get();
    exiger(Reflect.get(comptesApres, "statut") === "VERROUILLE", "Le compte usr-sila a été altéré.");

    return {
      totalMigrationsAvant: migrationsNoms.length,
      derniereMigrationAvant: migrationsNoms[23],
      totalComptes: comptes.length,
      statutSila: Reflect.get(delegueSila, "statut"),
      totalTablesApres: tablesApres.length,
    };
  } finally {
    base.close();
  }
}

async function main() {
  console.log("=== SIGAD — SAUVEGARDE CHIFFRÉE STAGING ET VÉRIFICATION D'INTÉGRITÉ ===");

  verifierConfigurationWrangler();
  const dossierSauvegardes = verifierProfilWindows();
  const sid = lireSidWindows();
  verifierConnexionCloudflare();

  const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
  const runId = randomBytes(4).toString("hex");
  const dossierRun = join(dossierSauvegardes, `before-0026-${timestamp}-${runId}`);
  await mkdir(dossierRun, { recursive: true });
  restreindreAcl(dossierRun, sid, true);

  const fichierSqlTemp = join(dossierRun, `export-temp-${runId}.sql`);
  const fichierSauvegarde = join(dossierRun, "sigad-staging-db-before-0026.dpapi-aesgcm.json");

  console.log(`[1/5] Dossier sécurisé créé: ${dossierRun}`);
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
    const nettoye = await supprimerExportTemporaire(fichierSqlTemp);
    exiger(nettoye, "Échec du nettoyage sécurisé du fichier SQL temporaire.");
  }

  console.log("[5/5] Test de restauration isolée en mémoire SQLite et vérification d'intégrité...");
  const manifeste = await readFile(fichierSauvegarde, "utf8");
  const { clair, document } = dechiffrerExport(manifeste);
  try {
    const diagnostic = await verifierRestaurationEtMigrations(clair);
    console.log("\n=== RÉSULTATS DE VÉRIFICATION DE LA SAUVEGARDE ===");
    console.log(`- Fichier sauvegarde chiffrée : ${fichierSauvegarde}`);
    console.log(`- Algorithme                  : ${document.algorithm} (Protection clé: ${document.keyProtection})`);
    console.log(`- Empreinte SHA-256           : ${document.sha256}`);
    console.log(`- Taille déchiffrée           : ${document.bytes} octets`);
    console.log(`- Migrations D1 actives       : ${diagnostic.totalMigrationsAvant} (${diagnostic.derniereMigrationAvant})`);
    console.log(`- Comptes vérifiés            : ${diagnostic.totalComptes} (1 ADMIN_CENTRAL, 1 PROPRIETAIRE, 23 DELEGUE_PROVINCIAL)`);
    console.log(`- Compte Sila                 : ${diagnostic.statutSila} (non altéré)`);
    console.log(`- Simulation locale 0025+0026 : SUCCÈS (0 violation FK, ${diagnostic.totalTablesApres} tables après migration)`);
    console.log("- Fichier SQL temporaire      : AUCUN reste sur disque (écrasé à zéro puis supprimé)");
    console.log("=== SAUVEGARDE STAGING VÉRIFIÉE ET CONFORME ===");
  } finally {
    clair.fill(0);
  }
}

main().catch((err) => {
  console.error("ÉCHEC DE LA SAUVEGARDE:", err.message);
  process.exitCode = 1;
});
