// Applique toutes les migrations sur une base SQLite EN MÉMOIRE (aucune base réelle) et produit un inventaire du schéma résultant.
// Usage : node docs/architecture-modernization/tools/inventaire-schema-memoire.mjs
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const racine = resolve(import.meta.dirname, "..", "..", "..");
const dossier = join(racine, "migrations");
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON;");
const echecs = [];
for (const f of readdirSync(dossier).filter((n) => n.endsWith(".sql")).sort()) {
  try { db.exec(readFileSync(join(dossier, f), "utf8")); } catch (e) { echecs.push({ migration: f, erreur: String(e.message).slice(0, 200) }); }
}
const objets = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
const tables = objets.filter((o) => o.type === "table").map((o) => o.name).sort();
const compte = (t) => db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
const lignes = Object.fromEntries(tables.filter((t) => compte(t) > 0).map((t) => [t, compte(t)]));
const ddlMenages = objets.find((o) => o.name === "menages")?.sql ?? "";
const checkValidation = /statut_validation[^,]*CHECK\s*\(([^)]*)\)/iu.exec(ddlMenages)?.[1] ?? null;

// Test comportemental : le code écrit 'REFUSE' (gestion.routes.ts) ; la base l'accepte-t-elle ?
let refuseAccepte = null;
try {
  // Ménage synthétique (base en mémoire uniquement) pour tester la contrainte.
  try {
    const p = db.prepare("SELECT p.id AS province_id, d.id AS departement_id FROM provinces p JOIN departements d ON d.province_id = p.id LIMIT 1").get();
    const cat = db.prepare("SELECT id FROM categories_population LIMIT 1").get();
    const usr = db.prepare("SELECT id FROM utilisateurs LIMIT 1").get();
    db.prepare(`INSERT INTO menages (id, code_menage, province_id, departement_id, nom_chef_menage, sexe_chef, nombre_personnes,
      categorie_population_id, date_enregistrement, statut, cree_par, statut_validation)
      VALUES ('test-menage-synth', 'MEN-TEST-0001', ?, ?, 'Test Synthetique', 'M', 3, ?, '2026-01-01', 'INACTIF', ?, 'A_VERIFIER')`)
      .run(p.province_id, p.departement_id, cat.id, usr.id);
  } catch (e) { refuseAccepte = `insertion du ménage synthétique impossible : ${String(e.message).slice(0, 160)}`; }
  const m = db.prepare("SELECT id FROM menages LIMIT 1").get();
  if (m) {
    db.exec("SAVEPOINT t");
    try { db.prepare("UPDATE menages SET statut_validation = 'REFUSE' WHERE id = ?").run(m.id); refuseAccepte = true; }
    catch (e) { refuseAccepte = `rejeté : ${String(e.message).slice(0, 120)}`; }
    db.exec("ROLLBACK TO t; RELEASE t");
  } else refuseAccepte ??= "aucun ménage dans le seed (non testable sans données)";
} catch (e) { refuseAccepte = `erreur de test : ${String(e.message).slice(0, 120)}`; }

console.log(JSON.stringify({
  migrations_en_echec: echecs,
  nombre_tables: tables.length,
  nombre_triggers: objets.filter((o) => o.type === "trigger").length,
  nombre_index: objets.filter((o) => o.type === "index").length,
  nombre_vues: objets.filter((o) => o.type === "view").length,
  tables,
  tables_non_vides_apres_migrations: lignes,
  menages_check_statut_validation: checkValidation,
  test_ecriture_statut_REFUSE_sur_menages: refuseAccepte,
  tables_sans_aucune_reference_dans_le_code: tables.filter((t) => {
    const re = new RegExp(`\\b${t}\\b`, "u");
    for (const d of ["backend", "shared", "frontend/src"]) {
      const walk = (p) => readdirSync(p, { withFileTypes: true }).some((e) => e.isDirectory() ? walk(join(p, e.name)) : /\.(ts|tsx)$/u.test(e.name) && re.test(readFileSync(join(p, e.name), "utf8")));
      if (walk(join(racine, d))) return false;
    }
    return true;
  }),
}, null, 2));
