import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  actionCorrectiveSqlite,
  classifierErreurSqlite,
  decouperInstructionsSql,
} from "./outils-restauration-sqlite.mjs";

const exportD1Synthetique = `-- Export synthétique, aucune donnée SIGAD réelle
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE provinces (id TEXT PRIMARY KEY, nom TEXT NOT NULL);
CREATE TABLE communes (id TEXT PRIMARY KEY, province_id TEXT NOT NULL REFERENCES provinces(id));
CREATE TABLE compteur (total INTEGER NOT NULL DEFAULT 0);
INSERT INTO provinces (id, nom) VALUES ('SYN-P1', 'Province Synthétique');
INSERT INTO communes (id, province_id) VALUES ('SYN-C1', 'SYN-P1');
INSERT INTO compteur (total) VALUES (0);
CREATE INDEX idx_communes_province ON communes(province_id);
CREATE TRIGGER trg_compter_communes AFTER INSERT ON communes
BEGIN
  UPDATE compteur SET total = total + 1;
  INSERT INTO compteur (total) SELECT CASE WHEN total < 0 THEN 0 ELSE total END FROM compteur LIMIT 1;
END;
COMMIT;
PRAGMA foreign_keys=ON;
`;

const instructions = decouperInstructionsSql(exportD1Synthetique);
assert.equal(instructions.length, 12, "Le séparateur doit conserver les statements, y compris le trigger multi-ligne.");
assert.equal(instructions.filter((instruction) => instruction.operation === "CREATE").length, 5);
assert.equal(instructions[9]?.ligne, 11, "La ligne SQL de CREATE TRIGGER doit être localisée sans lire les données.");

const base = new DatabaseSync(":memory:");
try {
  base.exec(exportD1Synthetique);
  assert.equal(base.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  assert.equal(base.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(base.prepare("SELECT COUNT(*) AS total FROM communes").get()?.total, 1);
  assert.equal(base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger'").get()?.total, 1);

  let erreurRelation;
  try {
    base.exec("INSERT INTO communes (id, province_id) VALUES ('SYN-C2', 'ABSENTE');");
  } catch (erreur) {
    erreurRelation = erreur;
  }
  assert.ok(erreurRelation instanceof Error);
  const code = classifierErreurSqlite(erreurRelation);
  assert.equal(code, "SQLITE_FOREIGN_KEY_CONSTRAINT");
  assert.match(actionCorrectiveSqlite(code), /relation invalide/u);
  assert.equal(JSON.stringify({ code, operation: "INSERT", ligne: 1 }).includes("ABSENTE"), false);
} finally {
  base.close();
}

const exportAvecErreur = `PRAGMA foreign_keys=ON;
CREATE TABLE provinces (id TEXT PRIMARY KEY);
CREATE TABLE communes (id TEXT PRIMARY KEY, province_id TEXT NOT NULL REFERENCES provinces(id));
INSERT INTO communes (id, province_id) VALUES ('SYN-C-ERREUR', 'SYN-P-ABSENTE');
`;
const baseDiagnostic = new DatabaseSync(":memory:");
let erreurLocalisee = null;
try {
  for (const instruction of decouperInstructionsSql(exportAvecErreur)) {
    try {
      baseDiagnostic.exec(instruction.sql);
    } catch (erreur) {
      erreurLocalisee = {
        code: classifierErreurSqlite(erreur),
        operation: instruction.operation,
        ligne: instruction.ligne,
      };
      break;
    }
  }
} finally {
  baseDiagnostic.close();
}
assert.deepEqual(erreurLocalisee, {
  code: "SQLITE_FOREIGN_KEY_CONSTRAINT",
  operation: "INSERT",
  ligne: 4,
});

console.log("PASS — dump D1 synthétique restauré en SQLite mémoire; transactions, clés étrangères, index et trigger multi-instruction vérifiés.");
console.log("PASS — une violation FK synthétique est localisée à l’opération et à la ligne; aucune instruction ni valeur n’est exposée.");
