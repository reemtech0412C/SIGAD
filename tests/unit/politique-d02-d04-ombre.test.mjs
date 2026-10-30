import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import {
  ECARTS_B11, REFERENTIELS_PUBLICS, REFERENTIELS_SENSIBLES, compterCouples, evaluerRegleCandidate,
} from "../../backend/src/core/authz/politique-d02-d04-ombre.ts";
import { CATALOGUE_POLITIQUES_API } from "../../shared/permissions/catalogue.ts";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dossier = resolve(racine, "tests/integration/__snapshots__/caracterisation-roles");

function statutLegacy(role, methode, chemin) {
  const lignes = JSON.parse(readFileSync(resolve(dossier, `${role}.json`), "utf8"));
  return lignes.find((l) => l.methode === methode && l.chemin === chemin)?.statut;
}

const couples = ECARTS_B11.flatMap((e) => e.roles.map((role) => ({ ...e, role })));

test("registre D-02/D-04: 80 couples, routes du catalogue, aucun doublon", () => {
  assert.equal(compterCouples(), 80);
  assert.equal(couples.length, 80);
  assert.equal(new Set(couples.map((c) => `${c.role} ${c.methode} ${c.chemin}`)).size, 80);
  const parProfil = Object.fromEntries(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]
    .map((p) => [p, couples.filter((c) => c.profil === p).length]));
  assert.deepEqual(parProfil, { A1: 21, A2: 24, A3: 20, A4: 5, B1: 1, B2: 1, B3: 7, B4: 1 });
  for (const c of couples) {
    assert.ok(CATALOGUE_POLITIQUES_API.some((p) => p.methode === c.methode && p.chemin === c.chemin),
      `${c.methode} ${c.chemin} absent du catalogue`);
  }
});

test("comparaison Legacy observé: A* = 200 et B* = 403 dans les snapshots B1.1", () => {
  for (const c of couples) {
    const attendu = c.profil.startsWith("A") ? 200 : 403;
    assert.equal(statutLegacy(c.role, c.methode, c.chemin), attendu, `${c.role} ${c.methode} ${c.chemin}`);
  }
});

test("sans relation d'affectation vérifiable: échec fermé pour A1, A3 et référentiels sensibles", () => {
  for (const c of couples.filter((x) => x.profil === "A1" || x.profil === "A3")) {
    assert.equal(evaluerRegleCandidate(c.role, c.methode, c.chemin, {}).decision, "DENY", `${c.role} ${c.chemin}`);
  }
  for (const chemin of REFERENTIELS_SENSIBLES) {
    assert.equal(evaluerRegleCandidate("AGENT_DISTRIBUTION", "GET", chemin, {}).decision, "DENY");
  }
});

test("avec affectation vérifiée côté serveur: seules les lectures assignées s'ouvrent", () => {
  const ctx = { affectationVerifiee: true };
  assert.equal(evaluerRegleCandidate("RESPONSABLE_STOCK", "GET", "/api/stocks/entrepots", ctx).decision, "ALLOW");
  assert.equal(evaluerRegleCandidate("AGENT_DISTRIBUTION", "GET", "/api/distributions", ctx).decision, "ALLOW");
  // Une affectation ne rouvre ni les ménages ni la consolidation.
  assert.equal(evaluerRegleCandidate("ADMIN_CENTRAL", "GET", "/api/distributions/menages", ctx).decision, "DENY");
  assert.equal(evaluerRegleCandidate("DELEGUE_PROVINCIAL", "GET", "/api/operations-centrales/:id/consolidation", ctx).decision, "DENY");
  // Une affectation d'un rôle ne vaut pas pour un rôle hors registre.
  assert.equal(evaluerRegleCandidate("AGENT_DISTRIBUTION", "GET", "/api/stocks/entrepots", ctx).decision, "DENY");
});

test("référentiels publics: lecture seule sans affectation, sans écriture", () => {
  for (const chemin of REFERENTIELS_PUBLICS) {
    for (const role of ["AGENT_DISTRIBUTION", "RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN"]) {
      assert.equal(evaluerRegleCandidate(role, "GET", chemin, {}).decision, "ALLOW");
      assert.equal(evaluerRegleCandidate(role, "POST", chemin, {}).decision, "DENY");
    }
  }
});

test("PII: propriétaire et administration centrale refusés; consultation limitée au non sensible", () => {
  assert.equal(evaluerRegleCandidate("PROPRIETAIRE", "GET", "/api/distributions/menages").decision, "DENY");
  assert.equal(evaluerRegleCandidate("ADMIN_CENTRAL", "GET", "/api/distributions/menages").decision, "DENY");
  const rapport = (sensibiliteRapport) =>
    evaluerRegleCandidate("CONSULTATION_INSTITUTIONNELLE", "GET", "/api/rapports/:type/apercu", { sensibiliteRapport }).decision;
  assert.equal(rapport("NON_SENSIBLE"), "ALLOW");
  assert.equal(rapport("SENSIBLE"), "DENY");
  assert.equal(rapport(undefined), "DENY");
});

test("consultation: notifications propres seulement; opérations centrales et documents refusés", () => {
  const role = "CONSULTATION_INSTITUTIONNELLE";
  const moi = { utilisateurId: "u1", proprietaireRessourceId: "u1" };
  assert.equal(evaluerRegleCandidate(role, "POST", "/api/notifications/:id/lecture", moi).decision, "ALLOW");
  assert.equal(evaluerRegleCandidate(role, "POST", "/api/notifications/:id/lecture", { utilisateurId: "u1", proprietaireRessourceId: "u2" }).decision, "DENY");
  assert.equal(evaluerRegleCandidate(role, "POST", "/api/notifications/:id/lecture", { utilisateurId: "u1" }).decision, "DENY");
  assert.equal(evaluerRegleCandidate(role, "POST", "/api/notifications/:id/lecture", { utilisateurId: "u1", proprietaireRessourceId: null }).decision, "DENY");
  for (const chemin of ["/api/operations-centrales", "/api/operations-centrales/:id", "/api/operations-centrales/:id/consolidation", "/api/operations-centrales/:id/documents/:docId"]) {
    assert.equal(evaluerRegleCandidate(role, "GET", chemin, { ...moi, affectationVerifiee: true }).decision, "DENY");
  }
});

test("hors registre: échec fermé, et D-12 non modélisé", () => {
  assert.equal(evaluerRegleCandidate("ADMIN_CENTRAL", "POST", "/api/operations-centrales/:id/decision", { affectationVerifiee: true }).decision, "DENY");
});

test("rapport de comparaison: effets de la cible sur les 80 couples sans contexte", () => {
  const sans = couples.map((c) => evaluerRegleCandidate(c.role, c.methode, c.chemin, c.profil === "A4"
    ? { sensibiliteRapport: "NON_SENSIBLE" } : c.chemin.startsWith("/api/notifications")
      ? { utilisateurId: "u", proprietaireRessourceId: "u" } : {}).decision);
  const autorises = sans.filter((d) => d === "ALLOW").length;
  // 18 référentiels publics + 5 rapports non sensibles + 3 notifications propres
  assert.equal(autorises, 26);
  assert.equal(sans.length - autorises, 54);
});
