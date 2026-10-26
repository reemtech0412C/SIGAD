import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");
const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='localites'").all();
for (const t of triggers) {
  console.log("TRIGGER:", t.name);
  console.log(t.sql);
  console.log("-----------------------------------------");
}
db.close();
