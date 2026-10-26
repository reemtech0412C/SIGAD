import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("tests/fixtures/test-execution-territoire.sqlite");

const checks = [
  {
    name: "M1 Ndjamena",
    sql: `INSERT INTO menages (id, code_menage, province_id, localite_id, arrondissement_id, quartier_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
          VALUES ('m1-test', 'MEN-NDJ-001', 'prov-ndjamena', 'loc-ndjamena-ville', 'arr-ndj-1', 'qrt-ndj-1-farcha', 'cat-pop-autochtone', 'Ménage N''Djamena', 'F', 6, 'VULN_URBAIN', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))`
  },
  {
    name: "M2 Ville Ati",
    sql: `INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
          VALUES ('m2-test', 'MEN-VILLE-001', 'prov-batha', 'dep-batha-batha-ouest', 'loc-ati-ville', 'cat-pop-autochtone', 'Ménage Ville Batha', 'M', 4, 'VULN_VILLE', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))`
  }
];

for (const c of checks) {
  try {
    db.prepare(c.sql).run();
    console.log("[OK]", c.name);
  } catch (err) {
    console.log("[FAIL]", c.name, err.message);
  }
}
db.close();
