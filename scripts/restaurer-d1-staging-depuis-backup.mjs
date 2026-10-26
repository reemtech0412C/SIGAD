import { createDecipheriv, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { open, readFile, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dechiffrerOctetsDpapi } from "./coffre-recuperation-dpapi.mjs";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");

function exiger(condition, message) {
  if (!condition) {
    throw new Error(`[RESTAURATION_ERROR] ${message}`);
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
  const args = process.argv.slice(2);
  let baseCible = "sigad-staging-db";
  const targetIdx = args.indexOf("--target");
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    baseCible = args[targetIdx + 1];
  }

  console.log(`=== SIGAD — PROCÉDURE DE RESTAURATION D1 DISTANTE (${baseCible}) ===`);

  const appData = process.env.LOCALAPPDATA;
  const dossierBackups = join(appData, "SIGAD", "backups", "staging");
  const runs = readdirSync(dossierBackups).filter(d => d.startsWith("before-0028")).sort();
  exiger(runs.length > 0, "Aucune sauvegarde before-0028 disponible pour restauration.");
  const dernierRun = runs[runs.length - 1];
  const fichierSauvegarde = join(dossierBackups, dernierRun, "sigad-staging-db-before-0028.dpapi-aesgcm.json");
  console.log(`[1/4] Fichier sauvegarde : ${fichierSauvegarde}`);

  const jsonDoc = JSON.parse(await readFile(fichierSauvegarde, "utf8"));
  console.log(`[2/4] Déchiffrement AES-256-GCM + DPAPI (${jsonDoc.bytes} octets)...`);
  const cleAes = dechiffrerOctetsDpapi(jsonDoc.encryptedKey);
  const decipher = createDecipheriv("aes-256-gcm", cleAes, Buffer.from(jsonDoc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(jsonDoc.authTag, "base64"));
  const sqlClair = Buffer.concat([decipher.update(Buffer.from(jsonDoc.ciphertext, "base64")), decipher.final()]);
  cleAes.fill(0);

  const shaCalcule = createHash("sha256").update(sqlClair).digest("hex");
  exiger(shaCalcule === jsonDoc.sha256, "Altération détectée : condensat SHA-256 invalide.");
  console.log(`- Condensat SHA-256 vérifié : ${shaCalcule}`);

  const fichierTemp = join(dossierBackups, dernierRun, "restore-d1-temp.sql");
  let sqlAExecuter = sqlClair.toString("utf8");
  if (!sqlAExecuter.startsWith("PRAGMA foreign_keys = OFF;")) {
    sqlAExecuter = "PRAGMA foreign_keys = OFF;\n" + sqlAExecuter + "\nPRAGMA foreign_keys = ON;\n";
  }
  await writeFile(fichierTemp, sqlAExecuter, "utf8");
  sqlClair.fill(0);

  try {
    console.log(`[3/4] Exécution de la restauration sur ${baseCible}...`);
    executer(process.execPath, [
      executableWrangler, "d1", "execute", baseCible,
      "--remote",
      "--config", fichierConfiguration,
      "--file", fichierTemp,
      "-y",
    ]);
    console.log("- Base D1 restaurée avec succès.");
  } finally {
    console.log("[4/4] Nettoyage sécurisé du fichier temporaire...");
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

  // Contrôles post-restauration
  const sortieFk = executer(process.execPath, [
    executableWrangler, "d1", "execute", baseCible,
    "--remote",
    "--config", fichierConfiguration,
    "--command", "PRAGMA foreign_key_check;",
    "--json",
  ]);
  const fkErrors = JSON.parse(sortieFk)[0].results;
  exiger(fkErrors.length === 0, `Violations FK après restauration : ${JSON.stringify(fkErrors)}`);

  console.log(`=== RESTAURATION D1 TERMINÉE AVEC SUCCÈS SUR ${baseCible} (0 violation FK) ===`);
}

main().catch((err) => {
  console.error("ÉCHEC DE LA RESTAURATION D1 :", err.message);
  process.exitCode = 1;
});
