import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");
const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='quartiers'").all();
for (const t of triggers) {
  console.log("TRIGGER:", t.name);
  console.log(t.sql);
}
const rowLoc = db.prepare("SELECT id, nom, province_id FROM localites WHERE id = 'loc-ndjamena-ville'").get();
console.log("loc-ndjamena-ville:", rowLoc);
const arr = db.prepare("SELECT id, nom, localite_id FROM arrondissements WHERE id = 'arr-ndj-1'").get();
console.log("arr-ndj-1:", arr);
db.close();
