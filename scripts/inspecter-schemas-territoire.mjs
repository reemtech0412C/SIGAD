import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");

const cols = db.prepare("PRAGMA table_info(correspondances_fusions_territoriales)").all();
console.log(cols.map(c => c.name));


