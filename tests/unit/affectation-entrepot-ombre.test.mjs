import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, test } from "vitest";
import { evaluerRegleCandidate, verifierAffectationEntrepot } from "../../backend/src/core/authz/politique-d02-d04-ombre.ts";

const racine = resolve(import.meta.dirname, "../..");
let db;

beforeAll(() => {
  db = new DatabaseSync(":memory:");
  for (const nom of readdirSync(join(racine, "migrations")).filter((n) => /^\d{4}_.*\.sql$/u.test(n)).sort()) {
    db.exec(readFileSync(join(racine, "migrations", nom), "utf8"));
  }
  db.exec("PRAGMA foreign_keys = OFF");
  const u = db.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
    VALUES (?, ?, 'Fixture', 'ADMIN_CENTRAL', NULL, 'h', ?, 0)`);
  u.run("resp-ok", "resp-ok", "ACTIF");
  u.run("resp-susp", "resp-susp", "SUSPENDU");
  u.run("resp-sans", "resp-sans", "ACTIF");
  u.run("sup", "sup", "ACTIF");
  const prov = db.prepare("SELECT id FROM provinces ORDER BY id LIMIT 1").get().id;
  const e = db.prepare(`INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id) VALUES (?, ?, ?, ?, ?)`);
  e.run("ent-a", "EA", "A", "PROVINCIAL", prov);
  e.run("ent-b", "EB", "B", "PROVINCIAL", prov);
  e.run("ent-nat", "EN", "N", "CENTRAL", null);
  const p = db.prepare(`INSERT INTO profils_operationnels_terrain (id, utilisateur_id, role_terrain, province_id, entrepot_id, statut, attribue_par)
    VALUES (?, ?, ?, ?, ?, ?, 'sup')`);
  p.run("p1", "resp-ok", "RESPONSABLE_STOCK", prov, "ent-a", "ACTIF");
  p.run("p2", "resp-susp", "RESPONSABLE_STOCK", prov, "ent-a", "ACTIF");
  p.run("p3", "resp-sans", "RESPONSABLE_STOCK", prov, null, "ACTIF");
  p.run("p4", "sup", "SUPERVISEUR_TERRAIN", prov, "ent-a", "ACTIF");
});

const verifier = (id, role, ent) => verifierAffectationEntrepot(db, id, role, ent).verifiee;

test("entrepôt explicite assigné: vérifié; autre entrepôt de la même province: refusé", () => {
  assert.equal(verifier("resp-ok", "RESPONSABLE_STOCK", "ent-a"), true);
  assert.equal(verifier("resp-ok", "RESPONSABLE_STOCK", "ent-b"), false);
  assert.equal(verifier("resp-ok", "RESPONSABLE_STOCK", "ent-nat"), false);
});

test("compte suspendu, profil sans entrepôt, révoqué ou rôle autre: échec fermé", () => {
  assert.equal(verifier("resp-susp", "RESPONSABLE_STOCK", "ent-a"), false);
  assert.equal(verifier("resp-sans", "RESPONSABLE_STOCK", "ent-a"), false);
  assert.equal(verifier("sup", "SUPERVISEUR_TERRAIN", "ent-a"), false);
  db.prepare("UPDATE profils_operationnels_terrain SET statut = 'REVOQUE' WHERE id = 'p1'").run();
  assert.equal(verifier("resp-ok", "RESPONSABLE_STOCK", "ent-a"), false);
  db.prepare("UPDATE profils_operationnels_terrain SET statut = 'ACTIF' WHERE id = 'p1'").run();
});

test("intégration règle candidate: lecture stock ouverte seulement avec relation relue en base", () => {
  const ok = verifierAffectationEntrepot(db, "resp-ok", "RESPONSABLE_STOCK", "ent-a");
  assert.equal(evaluerRegleCandidate("RESPONSABLE_STOCK", "GET", "/api/stocks/soldes-stock", { affectationVerifiee: ok.verifiee }).decision, "ALLOW");
  const ko = verifierAffectationEntrepot(db, "resp-ok", "RESPONSABLE_STOCK", "ent-b");
  assert.equal(evaluerRegleCandidate("RESPONSABLE_STOCK", "GET", "/api/stocks/soldes-stock", { affectationVerifiee: ko.verifiee }).decision, "DENY");
});
