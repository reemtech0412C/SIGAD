import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { calculerPerformanceDelegations } from "../../backend/src/services/performance-delegations.service.ts";

const aujourdhui = new Date("2026-11-01T12:00:00Z");
const ligne = (extra) => ({
  provinceId: "prov-a", provinceNom: "Alpha", statut: "EN_EXECUTION", datePrevue: "2026-10-20",
  dateDeclarationFin: null, menagesAssignes: 0, menagesServis: 0, menagesPartiels: 0, ...extra,
});

describe("B3.3 performance des délégations: calcul sur jeu synthétique", () => {
  const jeu = [
    ligne({ statut: "CLOTUREE_CENTRAL", datePrevue: "2026-10-01", dateDeclarationFin: "2026-10-03", menagesAssignes: 100, menagesServis: 80, menagesPartiels: 10 }),
    ligne({ statut: "TERMINEE_PROVINCE", datePrevue: "2026-10-10", dateDeclarationFin: "2026-10-08", menagesAssignes: 50, menagesServis: 50 }),
    ligne({ statut: "EN_EXECUTION", datePrevue: "2026-10-20", menagesAssignes: 50, menagesServis: 10 }), // en retard
    ligne({ statut: "EN_PREPARATION", datePrevue: "2026-12-01" }), // pas en retard
    ligne({ statut: "BROUILLON", datePrevue: "2026-01-01", menagesAssignes: 999, menagesServis: 999 }), // exclu
    ligne({ provinceId: "prov-b", provinceNom: "Beta", statut: "TERMINEE_PROVINCE", datePrevue: "2026-10-05", dateDeclarationFin: "2026-10-05", menagesAssignes: 20, menagesServis: 20 }),
    ligne({ provinceId: "prov-c", provinceNom: "Gamma", statut: "RETOURNEE_POUR_CORRECTION", datePrevue: "2026-09-01" }), // en retard, non terminée
  ];
  const { parProvince, national } = calculerPerformanceDelegations(jeu, aujourdhui);
  const parId = Object.fromEntries(parProvince.map((p) => [p.provinceId, p]));

  test("province Alpha: avancement, couverture, retard et ponctualité (brouillon exclu)", () => {
    const a = parId["prov-a"];
    assert.equal(a.distributions, 4);
    assert.equal(a.distributionsTerminees, 2);
    assert.equal(a.avancementDistributions, 0.5);
    assert.deepEqual([a.menagesAssignes, a.menagesServis, a.menagesPartiels], [200, 140, 10]);
    assert.equal(a.couvertureService, 0.7);
    assert.equal(a.distributionsEnRetard, 1);
    assert.equal(a.tauxRetard, 0.25);
    // écarts: +2 jours et -2 jours ⇒ médiane 0
    assert.equal(a.ponctualiteMedianeJours, 0);
  });

  test("cas limites: dénominateur nul donne null, jamais 0 %", () => {
    const c = parId["prov-c"];
    assert.equal(c.avancementDistributions, 0);
    assert.equal(c.couvertureService, null);
    assert.equal(c.ponctualiteMedianeJours, null);
    assert.equal(c.distributionsEnRetard, 1);
    const vide = calculerPerformanceDelegations([], aujourdhui);
    assert.equal(vide.parProvince.length, 0);
    assert.equal(vide.national.avancementDistributions, null);
    assert.equal(vide.national.couvertureService, null);
  });

  test("ligne nationale = somme des provinces, comparaison triée par avancement puis nom", () => {
    assert.equal(national.provinceId, null);
    assert.equal(national.distributions, parProvince.reduce((t, p) => t + p.distributions, 0));
    assert.equal(national.menagesAssignes, 220);
    assert.equal(national.menagesServis, 160);
    assert.deepEqual(parProvince.map((p) => p.provinceId), ["prov-b", "prov-a", "prov-c"]);
  });

  test("médiane paire et date avec heure acceptées; sortie sans identifiant de ménage ni de compte", () => {
    const m = calculerPerformanceDelegations([
      ligne({ statut: "TERMINEE_PROVINCE", datePrevue: "2026-10-01", dateDeclarationFin: "2026-10-02 08:30:00" }),
      ligne({ statut: "TERMINEE_PROVINCE", datePrevue: "2026-10-01", dateDeclarationFin: "2026-10-06" }),
    ], aujourdhui);
    assert.equal(m.parProvince[0].ponctualiteMedianeJours, 3);
    const cles = Object.keys(m.national);
    for (const interdit of ["menageId", "compteId", "utilisateurId", "distributionId"]) assert.ok(!cles.includes(interdit));
  });
});

import { construireNavigationParRole } from "../../frontend/src/components/administration/navigation-config.ts";
import { formaterEcartJours, formaterPourcentage } from "../../frontend/src/consoles/performance-format.ts";

describe("B3.3 écran: formats et visibilité", () => {
  test("n/d n'est jamais présenté comme 0 %", () => {
    assert.equal(formaterPourcentage(null), "n/d");
    assert.equal(formaterPourcentage(0), "0,0 %");
    assert.equal(formaterPourcentage(0.7), "70,0 %");
    assert.equal(formaterEcartJours(null), "n/d");
    assert.equal(formaterEcartJours(0), "à l’heure");
    assert.match(formaterEcartJours(2.5), /retard/u);
    assert.match(formaterEcartJours(-1), /avance/u);
  });

  test("l'entrée de navigation est réservée à l'administration centrale", () => {
    const roles = ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION", "CONSULTATION_INSTITUTIONNELLE"];
    for (const role of roles) {
      const present = construireNavigationParRole(role).flatMap((g) => g.sousMenus).some((e) => e.id === "ctrl-performance");
      assert.equal(present, role === "ADMIN_CENTRAL", role);
    }
  });
});
