import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");

console.log("historique_decoupages:", db.prepare("PRAGMA table_info(historique_decoupages)").all().map(c => c.name));
console.log("journaux_audit:", db.prepare("PRAGMA table_info(journaux_audit)").all().map(c => c.name));

db.close();
