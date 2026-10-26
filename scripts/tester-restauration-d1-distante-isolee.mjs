import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dechiffrerOctetsDpapi } from "./coffre-recuperation-dpapi.mjs";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const baseRecuperationIsolee = "sigad-recuperation-test";

function exiger(condition, message) {
  if (!condition) {
    throw new Error(`[RESTAURATION_TEST_ERROR] ${message}`);
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

function executer(executable, argumentsCommande) {
  const resultat = spawnSync(executable, argumentsCommande, {
    cwd: racineProjet,
    env: environnementWrangler(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (resultat.error) throw resultat.error;
  if (resultat.status !== 0) {
    throw new Error(`Code ${resultat.status}: ${resultat.stdout ?? ""}\n${resultat.stderr ?? ""}`);
  }
  return resultat.stdout;
}

async function main() {
  console.log("=== SIGAD — TEST DE RESTAURATION SUR BASE D1 DISTANTE ISOLÉE ===");
  console.log(`Base de destination : ${baseRecuperationIsolee} (Cloudflare D1 distante)`);

  // 1. Trouver la dernière sauvegarde chiffrée
  const appData = process.env.LOCALAPPDATA;
  const dossierBackups = join(appData, "SIGAD", "backups", "staging");
  const runs = readdirSync(dossierBackups).filter(d => d.startsWith("before-0028")).sort();
  exiger(runs.length > 0, "Aucune sauvegarde before-0028 trouvée.");
  const dernierRun = runs[runs.length - 1];
  const fichierSauvegarde = join(dossierBackups, dernierRun, "sigad-staging-db-before-0028.dpapi-aesgcm.json");
  console.log(`[1/5] Sauvegarde chiffrée source : ${fichierSauvegarde}`);

  // 2. Déchiffrer en mémoire et vérifier l'intégrité SHA-256
  const jsonDoc = JSON.parse(await readFile(fichierSauvegarde, "utf8"));
  console.log(`[2/5] Déchiffrement AES-256-GCM + DPAPI (${jsonDoc.bytes} octets)...`);
  const cleAes = dechiffrerOctetsDpapi(jsonDoc.encryptedKey);
  const decipher = createDecipheriv("aes-256-gcm", cleAes, Buffer.from(jsonDoc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(jsonDoc.authTag, "base64"));
  const sqlClair = Buffer.concat([decipher.update(Buffer.from(jsonDoc.ciphertext, "base64")), decipher.final()]);
  cleAes.fill(0);

  const shaCalcule = createHash("sha256").update(sqlClair).digest("hex");
  exiger(shaCalcule === jsonDoc.sha256, "Condensat SHA-256 invalide.");
  console.log(`- Empreinte SHA-256 intègre : ${shaCalcule}`);

  // 3. Écrire le fichier SQL temporaire avec PRAGMA foreign_keys = OFF en préambule
  const fichierTemp = join(dossierBackups, dernierRun, "restore-temp.sql");
  let sqlAExecuter = sqlClair.toString("utf8");
  if (!sqlAExecuter.startsWith("PRAGMA foreign_keys = OFF;")) {
    sqlAExecuter = "PRAGMA foreign_keys = OFF;\n" + sqlAExecuter + "\nPRAGMA foreign_keys = ON;\n";
  }
  await writeFile(fichierTemp, sqlAExecuter, "utf8");
  sqlClair.fill(0);

  try {
    console.log(`[3/5] Restauration dans Cloudflare D1 distante (${baseRecuperationIsolee})...`);
    const sortieRestauration = executer(process.execPath, [
      executableWrangler, "d1", "execute", baseRecuperationIsolee,
      "--remote",
      "--config", fichierConfiguration,
      "--file", fichierTemp,
      "-y",
    ]);
    console.log("- Fichier SQL exécuté avec succès sur Cloudflare D1.");
  } finally {
    console.log("[4/5] Écrasement à zéro et suppression du fichier temporaire...");
    try {
      const h = await open(fichierTemp, "r+");
      const st = await h.stat();
      if (st.size > 0) {
        await h.write(Buffer.alloc(st.size, 0), 0, st.size, 0);
        await h.sync();
      }
      await h.close();
    } catch (e) {}
    await rm(fichierTemp, { force: true });
  }

  // 4. Contrôles contradictoires sur la base D1 distante restaurée
  console.log(`[5/5] Vérification contradictoire des données sur ${baseRecuperationIsolee}...`);

  const sortieMigrations = executer(process.execPath, [
    executableWrangler, "d1", "execute", baseRecuperationIsolee,
    "--remote",
    "--config", fichierConfiguration,
    "--command", "SELECT COUNT(*) as c FROM d1_migrations;",
    "--json",
  ]);
  const jsonMigrations = JSON.parse(sortieMigrations);
  const totalMigrations = jsonMigrations[0].results[0].c;

  const sortieCounts = executer(process.execPath, [
    executableWrangler, "d1", "execute", baseRecuperationIsolee,
    "--remote",
    "--config", fichierConfiguration,
    "--command", "SELECT 'provinces' as t, COUNT(*) as c FROM provinces UNION ALL SELECT 'communes', COUNT(*) FROM communes UNION ALL SELECT 'utilisateurs', COUNT(*) FROM utilisateurs UNION ALL SELECT 'departements', COUNT(*) FROM departements;",
    "--json",
  ]);
  const jsonCounts = JSON.parse(sortieCounts);
  const rows = jsonCounts[0].results;

  const sortieFk = executer(process.execPath, [
    executableWrangler, "d1", "execute", baseRecuperationIsolee,
    "--remote",
    "--config", fichierConfiguration,
    "--command", "PRAGMA foreign_key_check;",
    "--json",
  ]);
  const jsonFk = JSON.parse(sortieFk);
  const fkErrors = jsonFk[0].results;

  console.log("\n=== RÉSULTATS DU CONTRÔLE SUR LA BASE D1 DISTANTE RESTAURÉE ===");
  console.log(`- Base test Cloudflare D1     : ${baseRecuperationIsolee}`);
  console.log(`- Total migrations restaurées : ${totalMigrations} (Attendu: 27)`);
  for (const r of rows) {
    console.log(`- Table ${r.t.padEnd(20)}: ${r.c}`);
  }
  console.log(`- Violations clés étrangères  : ${fkErrors.length} (Attendu: 0)`);
  exiger(totalMigrations === 27, `Attendu 27 migrations, obtenu ${totalMigrations}`);
  exiger(fkErrors.length === 0, `Violations de clé étrangère détectées : ${JSON.stringify(fkErrors)}`);

  console.log("\n>>> PREUVE ÉTABLIE : LA SAUVEGARDE EST RESTAURABLE SUR CLOUDFLARE D1 <<<");
}

main().catch((err) => {
  console.error("ÉCHEC DU TEST DE RESTAURATION D1 :", err.message);
  process.exitCode = 1;
});
