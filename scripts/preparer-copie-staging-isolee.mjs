import { createDecipheriv, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { dechiffrerOctetsDpapi } from "./coffre-recuperation-dpapi.mjs";

async function main() {
  const backupPath = resolve(
    process.env.LOCALAPPDATA,
    "SIGAD/Staging/backups/before-0027-20261025T023100Z-472a6732/sigad-staging-db-before-0027.dpapi-aesgcm.json"
  );
  console.log(`Lecture du fichier de sauvegarde chiffré: ${backupPath}`);
  const raw = await readFile(backupPath, "utf8");
  const doc = JSON.parse(raw);
  console.log(`Métadonnées: Algorithme=${doc.algorithm}, Base=${doc.databaseId}, Octets=${doc.bytes}`);

  const key = dechiffrerOctetsDpapi(doc.wrappedKeyDpapiCurrentUser);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(doc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(doc.authTag, "base64"));
  decipher.setAAD(Buffer.from(doc.aad, "utf8"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(doc.ciphertext, "base64")), decipher.final()]);
  console.log(`Déchiffrement réussi: ${decrypted.length} octets`);
  
  const hash = createHash("sha256").update(decrypted).digest("hex");
  if (hash !== doc.sha256) {
    throw new Error(`Empreinte SHA-256 non concordante: ${hash} !== ${doc.sha256}`);
  }
  console.log(`Intégrité SHA-256 vérifiée avec succès: ${hash}`);

  // Test de restauration dans une base SQLite
  const dbPath = resolve(process.cwd(), "tests/fixtures/pre-recette-staging-base.sqlite");
  console.log(`Création de la base SQLite isolée: ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(decrypted.toString("utf8"));
  db.exec("PRAGMA foreign_keys = ON;");

  const tables = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").get();
  console.log(`Nombre de tables restaurées: ${tables.c}`);

  const migrations = db.prepare("SELECT name FROM d1_migrations ORDER BY id").all();
  console.log(`Migrations enregistrées (${migrations.length}):`, migrations.map(m => m.name));

  const users = db.prepare("SELECT count(*) as c FROM utilisateurs").get();
  console.log(`Nombre de comptes utilisateurs: ${users.c}`);

  const opc = db.prepare("SELECT code_operation, statut, nature_donnees FROM operations_centrales_distribution WHERE code_operation = 'OPC-2026-B839B0'").get();
  console.log("OPC-2026-B839B0:", opc);

  const fkCheck = db.prepare("PRAGMA foreign_key_check").all();
  console.log(`Vérification FK: ${fkCheck.length} violation(s)`);

  const integrityCheck = db.prepare("PRAGMA integrity_check").all();
  console.log(`Vérification intégrité:`, integrityCheck);

  db.close();
}

main().catch((err) => {
  console.error("Erreur:", err);
  process.exit(1);
});
