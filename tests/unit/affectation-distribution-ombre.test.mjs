import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, test } from "vitest";
import { evaluerRegleCandidate, verifierAffectationDistribution } from "../../backend/src/core/authz/politique-d02-d04-ombre.ts";

const racine = resolve(import.meta.dirname, "../..");
let db;
let prov;
let autreProv;

function compte(id) {
  db.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
    VALUES (?, ?, 'Fixture', 'ADMIN_CENTRAL', NULL, 'h', 'ACTIF', 0)`).run(id, id);
}
function profil(id, user, role, province) {
  db.prepare(`INSERT INTO profils_operationnels_terrain (id, utilisateur_id, role_terrain, province_id, statut, attribue_par)
    VALUES (?, ?, ?, ?, 'ACTIF', 'chef')`).run(id, user, role, province);
}
function distribution(id, province) {
  db.prepare(`INSERT INTO distributions_provinciales (id, reference_distribution, intitule_distribution, province_id, departement_id,
    nature_aide, objectif, nombre_menages_cibles, nombre_personnes_cibles, date_prevue, entrepot_id, cree_par)
    VALUES (?, ?, 'D', ?, ?, 'vivres', 'obj', 10, 50, '2026-12-01', ?, 'chef')`).run(id, `REF-${id}`, province, departement(province), entrepot(province));
}
function departement(province) {
  return db.prepare("SELECT id FROM departements WHERE province_id = ? LIMIT 1").get(province).id;
}
function entrepot(province) {
  const id = `ent-${province}`;
  db.prepare("INSERT OR IGNORE INTO entrepots (id, code_entrepot, nom, niveau, province_id) VALUES (?, ?, 'E', 'PROVINCIAL', ?)").run(id, id, province);
  return id;
}
function affecter(id, user, role, dist, extra = {}) {
  db.prepare(`INSERT INTO affectations_terrain_distributions (id, utilisateur_id, role_terrain, distribution_id, statut, valide_du, valide_au, motif, attribue_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Mission', 'chef')`).run(id, user, role, dist, extra.statut ?? "ACTIF", extra.du ?? null, extra.au ?? null);
}

beforeAll(() => {
  db = new DatabaseSync(":memory:");
  for (const nom of readdirSync(join(racine, "migrations")).filter((n) => /^\d{4}_.*\.sql$/u.test(n)).sort()) {
    db.exec(readFileSync(join(racine, "migrations", nom), "utf8"));
  }
  db.exec("PRAGMA foreign_keys = OFF");
  [prov, autreProv] = db.prepare("SELECT id FROM provinces ORDER BY id LIMIT 2").all().map((r) => r.id);
  for (const id of ["chef", "ag", "ag-sans-profil", "sup", "ag-autre-prov"]) compte(id);
  profil("p-ag", "ag", "AGENT_DISTRIBUTION", prov);
  profil("p-sup", "sup", "SUPERVISEUR_TERRAIN", prov);
  profil("p-autre", "ag-autre-prov", "AGENT_DISTRIBUTION", autreProv);
  distribution("d1", prov);
  distribution("d2", prov);
  affecter("a1", "ag", "AGENT_DISTRIBUTION", "d1");
  affecter("a2", "sup", "SUPERVISEUR_TERRAIN", "d1");
});

const verif = (user, role, dist, maintenant) => verifierAffectationDistribution(db, user, role, dist, maintenant).verifiee;

test("affectation active: seule la distribution assignée est vérifiée", () => {
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d1"), true);
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d2"), false);
  assert.equal(verif("sup", "SUPERVISEUR_TERRAIN", "d1"), true);
  assert.equal(verif("ag", "SUPERVISEUR_TERRAIN", "d1"), false);
  assert.equal(verif("ag", "RESPONSABLE_STOCK", "d1"), false);
});

test("le schéma refuse: sans profil, autre province, auto-attribution, cible modifiée", () => {
  assert.throws(() => affecter("x1", "ag-sans-profil", "AGENT_DISTRIBUTION", "d1"), /PROFIL_OU_PROVINCE/);
  assert.throws(() => affecter("x2", "ag-autre-prov", "AGENT_DISTRIBUTION", "d1"), /PROFIL_OU_PROVINCE/);
  assert.throws(() => db.prepare(`INSERT INTO affectations_terrain_distributions (id, utilisateur_id, role_terrain, distribution_id, motif, attribue_par)
    VALUES ('x3', 'ag', 'AGENT_DISTRIBUTION', 'd2', 'm', 'ag')`).run());
  assert.throws(() => db.prepare("UPDATE affectations_terrain_distributions SET distribution_id = 'd2' WHERE id = 'a1'").run(), /CIBLE_IMMUABLE/);
  assert.throws(() => affecter("x4", "ag", "AGENT_DISTRIBUTION", "d1"), /UNIQUE/);
});

test("statut et validité temporelle", () => {
  db.prepare("UPDATE affectations_terrain_distributions SET statut = 'REVOQUE' WHERE id = 'a1'").run();
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d1"), false);
  affecter("a3", "ag", "AGENT_DISTRIBUTION", "d2", { du: "2026-01-01 00:00:00", au: "2026-06-01 00:00:00" });
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d2", "2026-03-01 00:00:00"), true);
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d2", "2026-07-01 00:00:00"), false);
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d2", "2025-12-31 00:00:00"), false);
  db.prepare("UPDATE profils_operationnels_terrain SET statut = 'SUSPENDU' WHERE id = 'p-ag'").run();
  assert.equal(verif("ag", "AGENT_DISTRIBUTION", "d2", "2026-03-01 00:00:00"), false);
});

test("règle candidate: A1 s'ouvre uniquement pour /api/distributions avec relation relue", () => {
  const ok = { affectationVerifiee: verif("sup", "SUPERVISEUR_TERRAIN", "d1") };
  assert.equal(evaluerRegleCandidate("SUPERVISEUR_TERRAIN", "GET", "/api/distributions", ok).decision, "ALLOW");
  for (const chemin of ["/api/approvisionnements", "/api/operations-centrales", "/api/approvisionnements/:id/receptions"]) {
    assert.equal(evaluerRegleCandidate("SUPERVISEUR_TERRAIN", "GET", chemin, ok).decision, "DENY", chemin);
  }
  assert.equal(evaluerRegleCandidate("AGENT_DISTRIBUTION", "GET", "/api/distributions", { affectationVerifiee: verif("ag", "AGENT_DISTRIBUTION", "d9") }).decision, "DENY");
});
