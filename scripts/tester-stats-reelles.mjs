import { DatabaseSync } from "node:sqlite";
import { obtenirTableauDeBordTerritorial } from "../backend/src/services/administration-territoriale.service.ts";

const dbSync = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");

function wrapD1(syncDb) {
  return {
    prepare(query) {
      return {
        _query: query,
        _args: [],
        bind(...args) {
          const bound = Object.create(this);
          bound._args = args.map(a => a === undefined ? null : a);
          return bound;
        },
        async all() {
          const stmt = syncDb.prepare(query);
          const results = stmt.all(...this._args);
          return { results: results ?? [], success: true };
        },
        async first(col) {
          const stmt = syncDb.prepare(query);
          const row = stmt.get(...this._args);
          if (!row) return null;
          if (col && typeof col === "string") return row[col];
          return row;
        },
        async run() {
          const stmt = syncDb.prepare(query);
          const info = stmt.run(...this._args);
          return { success: true, meta: { changes: Number(info.changes) } };
        }
      };
    }
  };
}

const stats = await obtenirTableauDeBordTerritorial(wrapD1(dbSync));
console.log("Stats réelles issues de obtenirTableauDeBordTerritorial :");
console.log(JSON.stringify(stats, null, 2));
