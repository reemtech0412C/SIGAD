import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");
const triggersMenages = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='menages'").all();
for (const t of triggersMenages) {
  console.log("TRIGGER MENAGES:", t.name);
  console.log(t.sql);
}
const localiteCols = db.prepare("PRAGMA table_info(localites)").all();
console.log("LOCALITES COLS:", localiteCols.map(c => c.name));
const localiteSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='localites'").get();
console.log("LOCALITES SQL:", localiteSql.sql);
db.close();
