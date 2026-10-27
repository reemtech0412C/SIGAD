import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { evaluerPolitiqueObservee, verifierCouverturePolitiques } from "../../backend/src/core/authz/registre.ts";
import { CATALOGUE_POLITIQUES_API } from "../../shared/permissions/catalogue.ts";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dossierSnapshots = resolve(racine, "tests/integration/__snapshots__/caracterisation-roles");
const roles = [
  "PROPRIETAIRE",
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
  "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN",
  "AGENT_DISTRIBUTION",
  "CONSULTATION_INSTITUTIONNELLE",
];

function cle(methode, chemin) {
  return `${methode} ${chemin}`;
}

function decisionCaractérisée(politique, role) {
  if (["PUBLIC", "PREAUTH"].includes(politique.accessMode)) return "PUBLIC_OR_PREAUTH";
  return politique.rolesAutorises.includes(role) ? "DECLARE_ALLOW" : "DECLARE_DENY";
}

test("catalogue: routes uniques, portée explicite et échec fermé sans politique", () => {
  assert.equal(CATALOGUE_POLITIQUES_API.length, 229);
  assert.equal(new Set(CATALOGUE_POLITIQUES_API.map(({ methode, chemin }) => cle(methode, chemin))).size, 229);
  for (const politique of CATALOGUE_POLITIQUES_API) {
    assert.match(politique.permission, /^API:(GET|POST|PUT|PATCH|DELETE):\/api\//u);
    assert.ok(politique.portee.trim(), `${politique.methode} ${politique.chemin} doit déclarer sa portée.`);
    assert.ok(politique.rolesAutorises.every((role) => roles.includes(role)));
    if (politique.rolesAutorises.includes("DELEGUE_PROVINCIAL")) {
      assert.match(politique.portee, /session|province|national|aucune|sans données|technique/iu,
        `${politique.methode} ${politique.chemin} doit expliciter la source provinciale ou l’absence de données métier.`);
    }
  }

  const routeExistante = CATALOGUE_POLITIQUES_API[0];
  verifierCouverturePolitiques([routeExistante], [routeExistante]);
  assert.throws(() => verifierCouverturePolitiques([
    routeExistante,
    { methode: "GET", chemin: "/api/test-sans-politique" },
  ], [routeExistante]), /routes sans politique/u);
  assert.equal(evaluerPolitiqueObservee("GET", "/api/test-sans-politique", { authentifie: true, role: "PROPRIETAIRE" }), "POLITIQUE_ABSENTE");
  assert.equal(evaluerPolitiqueObservee("GET", "/api/test-sans-politique", { authentifie: true, role: "PROPRIETAIRE" }) === "AUTORISE", false);
});

test("contrôles de frontière: route protégée refuse l'anonyme et le délégué reste borné à sa portée", () => {
  for (const politique of CATALOGUE_POLITIQUES_API) {
    const anonyme = evaluerPolitiqueObservee(politique.methode, politique.chemin, { authentifie: false });
    assert.equal(anonyme === "AUTORISE", politique.accessMode === "PUBLIC",
      `${politique.methode} ${politique.chemin}: frontière d’authentification inattendue.`);
    if (politique.rolesAutorises.includes("DELEGUE_PROVINCIAL") && politique.accessMode === "ROLE") {
      assert.equal(evaluerPolitiqueObservee(politique.methode, politique.chemin, {
        authentifie: true, role: "DELEGUE_PROVINCIAL",
      }), "AUTORISE");
    }
  }

  const exportRapport = CATALOGUE_POLITIQUES_API.find((politique) =>
    politique.methode === "POST" && politique.chemin === "/api/rapports/:type/export",
  );
  assert.ok(exportRapport);
  assert.deepEqual(exportRapport.rolesConditionnels, [{
    role: "CONSULTATION_INSTITUTIONNELLE", condition: "RAPPORT_NON_SENSIBLE",
  }]);
  assert.equal(evaluerPolitiqueObservee(exportRapport.methode, exportRapport.chemin, {
    authentifie: true, role: "CONSULTATION_INSTITUTIONNELLE",
  }), "REFUSE");
  assert.equal(evaluerPolitiqueObservee(exportRapport.methode, exportRapport.chemin, {
    authentifie: true, role: "CONSULTATION_INSTITUTIONNELLE", conditions: ["RAPPORT_NON_SENSIBLE"],
  }), "AUTORISE");
});

test("baseline B1.1: les décisions caractérisées des 7×216 cas restent identiques", () => {
  const fichiers = readdirSync(dossierSnapshots).filter((nom) => nom.endsWith(".json")).sort();
  assert.deepEqual(fichiers.map((nom) => nom.slice(0, -5)), [...roles].sort());
  let total = 0;
  const totaux = { DECLARE_ALLOW: 0, DECLARE_DENY: 0, PUBLIC_OR_PREAUTH: 0 };
  for (const role of roles) {
    const lignes = JSON.parse(readFileSync(resolve(dossierSnapshots, `${role}.json`), "utf8"));
    assert.equal(lignes.length, 216, `Snapshot ${role} incomplet.`);
    for (const ligne of lignes) {
      const politique = CATALOGUE_POLITIQUES_API.find((entree) => cle(entree.methode, entree.chemin) === cle(ligne.methode, ligne.chemin));
      assert.ok(politique, `Politique absente pour ${ligne.methode} ${ligne.chemin}.`);
      assert.equal(ligne.attendu, decisionCaractérisée(politique, role),
        `Décision de baseline modifiée: ${role} ${ligne.methode} ${ligne.chemin}.`);
      assert.notEqual(ligne.attendu, "MATRIX_UNSPECIFIED", "La baseline B1.1 contenait une politique non classée.");
      totaux[ligne.attendu] += 1;
      total += 1;
    }
  }
  assert.equal(total, 1512);
  assert.deepEqual(totaux, { DECLARE_ALLOW: 451, DECLARE_DENY: 991, PUBLIC_OR_PREAUTH: 70 });
});
