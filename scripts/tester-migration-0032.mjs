import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");

const sql0032 = readFileSync("migrations/0032_administration_territoriale_proprietaire.sql", "utf8");
db.exec(sql0032);

const integrity = db.prepare("PRAGMA integrity_check").all();
console.log("Integrity check:", integrity);

const fk = db.prepare("PRAGMA foreign_key_check").all();
console.log("FK check:", fk);

const statuts = db.prepare("SELECT statut_validation, count(*) as c FROM departements GROUP BY statut_validation").all();
console.log("Statuts departements:", statuts);

const corr = db.prepare("SELECT count(*) as c FROM correspondances_fusions_territoriales").get();
console.log("Correspondances fusions table count:", corr);

const audits = db.prepare("SELECT count(*) as c FROM audits_territoire").get();
console.log("Audits territoire table count:", audits);

const cols = db.prepare("PRAGMA table_info(departements)").all().map(c => c.name);
console.log("Colonnes departements:", cols);

db.close();
