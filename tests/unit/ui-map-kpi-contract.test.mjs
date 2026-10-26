import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { schemaFiltresIndicateursCarte } from "../../shared/validations/indicateurs-carte.ts";

function estDansPeriode(date, debut, fin) {
  return date >= debut && date <= fin;
}

function compterDistributionsRealisees(distributions, clotures, debut, fin) {
  const datesCloture = new Map(clotures.map((cloture) => [cloture.distribution_id, cloture.date_cloture]));
  const identifiants = new Set();
  for (const distribution of distributions) {
    const dateCloture = datesCloture.get(distribution.id);
    if (distribution.statut === "CLOTUREE_CENTRAL" && dateCloture && estDansPeriode(dateCloture, debut, fin)) {
      identifiants.add(distribution.id);
    }
  }
  return identifiants.size;
}

function compterDistributionsEnCours(distributions, historique) {
  const dejaCommencees = new Set(
    historique
      .filter((evenement) => evenement.nouveau_statut === "EN_EXECUTION")
      .map((evenement) => evenement.operation_id),
  );
  const etatsNonClotures = new Set(["EN_EXECUTION", "TERMINEE_PROVINCE", "RETOURNEE_POUR_CORRECTION"]);
  return new Set(
    distributions
      .filter((distribution) => dejaCommencees.has(distribution.id) && etatsNonClotures.has(distribution.statut))
      .map((distribution) => distribution.id),
  ).size;
}

function compterMenagesServis(remises, lignes, debut, fin) {
  const remisesAvecPreuve = new Set(lignes.filter((ligne) => ligne.quantite_remise > 0).map((ligne) => ligne.remise_id));
  return new Set(
    remises
      .filter((remise) => remisesAvecPreuve.has(remise.id) && estDansPeriode(remise.date_remise, debut, fin))
      .map((remise) => `${remise.province_id}:${remise.menage_id}`),
  ).size;
}

function calculerStocksDisponibles(lots, datePhoto) {
  const resultats = new Map();
  for (const lot of lots) {
    const disponible = lot.quantite_physique - lot.quantite_reservee;
    if (!lot.entrepot_actif || !lot.province_id || lot.etat_qualite !== "BON") continue;
    if (lot.date_peremption && lot.date_peremption < datePhoto) continue;
    if (disponible <= 0) continue;
    const cle = JSON.stringify([lot.province_id, lot.entrepot_id, lot.article_id, lot.unite_id]);
    resultats.set(cle, (resultats.get(cle) ?? 0) + disponible);
  }
  return resultats;
}

describe("Contrats synthétiques des KPI UI-MAP 1.4", () => {
  it("ne compte comme réalisée qu’une distribution clôturée dans la période de clôture", () => {
    const distributions = [
      { id: "cloturee-dans-periode", statut: "CLOTUREE_CENTRAL" },
      { id: "cloturee-hors-periode", statut: "CLOTUREE_CENTRAL" },
      { id: "brouillon", statut: "BROUILLON" },
      { id: "en-execution", statut: "EN_EXECUTION" },
    ];
    const clotures = [
      { distribution_id: "cloturee-dans-periode", date_cloture: "2026-10-23" },
      { distribution_id: "cloturee-hors-periode", date_cloture: "2026-09-30" },
    ];
    assert.equal(compterDistributionsRealisees(distributions, clotures, "2026-10-01", "2026-10-31"), 1);
  });

  it("ne compte en cours que les opérations ayant atteint l’exécution et non clôturées", () => {
    const distributions = [
      { id: "execution", statut: "EN_EXECUTION" },
      { id: "fin-province", statut: "TERMINEE_PROVINCE" },
      { id: "retour-correction", statut: "RETOURNEE_POUR_CORRECTION" },
      { id: "brouillon", statut: "BROUILLON" },
      { id: "validee-sans-demarrage", statut: "VALIDEE_PROVINCE" },
      { id: "cloturee", statut: "CLOTUREE_CENTRAL" },
    ];
    const historique = [
      { operation_id: "execution", nouveau_statut: "EN_EXECUTION" },
      { operation_id: "fin-province", nouveau_statut: "EN_EXECUTION" },
      { operation_id: "retour-correction", nouveau_statut: "EN_EXECUTION" },
      { operation_id: "cloturee", nouveau_statut: "EN_EXECUTION" },
    ];
    assert.equal(compterDistributionsEnCours(distributions, historique), 3);
  });

  it("compte une fois chaque ménage avec au moins une ligne de remise positive, y compris partielle", () => {
    const remises = [
      { id: "r-a1", province_id: "prov-sila", menage_id: "menage-a", date_remise: "2026-10-03" },
      { id: "r-a2", province_id: "prov-sila", menage_id: "menage-a", date_remise: "2026-10-20" },
      { id: "r-b", province_id: "prov-sila", menage_id: "menage-b", date_remise: "2026-10-15" },
      { id: "r-sans-ligne", province_id: "prov-sila", menage_id: "menage-c", date_remise: "2026-10-15" },
      { id: "r-hors-periode", province_id: "prov-sila", menage_id: "menage-d", date_remise: "2026-11-01" },
    ];
    const lignes = [
      { remise_id: "r-a1", quantite_remise: 1 },
      { remise_id: "r-a1", quantite_remise: 2 },
      { remise_id: "r-a2", quantite_remise: 1 },
      { remise_id: "r-b", quantite_remise: 0.25 },
      { remise_id: "r-hors-periode", quantite_remise: 1 },
    ];
    assert.equal(compterMenagesServis(remises, lignes, "2026-10-01", "2026-10-31"), 2);
  });

  it("déduit les réservations et sépare les stocks par province, entrepôt, article et unité", () => {
    const lots = [
      { province_id: "prov-sila", entrepot_id: "wh-sila-1", entrepot_actif: true, article_id: "riz", unite_id: "kg", etat_qualite: "BON", date_peremption: "2026-10-23", quantite_physique: 20, quantite_reservee: 5 },
      { province_id: "prov-sila", entrepot_id: "wh-sila-1", entrepot_actif: true, article_id: "riz", unite_id: "kg", etat_qualite: "BON", date_peremption: "2026-10-22", quantite_physique: 50, quantite_reservee: 0 },
      { province_id: "prov-sila", entrepot_id: "wh-sila-1", entrepot_actif: true, article_id: "huile", unite_id: "litre", etat_qualite: "BON", date_peremption: null, quantite_physique: 8, quantite_reservee: 2 },
      { province_id: "prov-sila", entrepot_id: "wh-sila-2", entrepot_actif: true, article_id: "riz", unite_id: "kg", etat_qualite: "BON", date_peremption: null, quantite_physique: 7, quantite_reservee: 0 },
      { province_id: "prov-ouaddai", entrepot_id: "wh-ouaddai-1", entrepot_actif: true, article_id: "riz", unite_id: "kg", etat_qualite: "BON", date_peremption: null, quantite_physique: 13, quantite_reservee: 3 },
      { province_id: "prov-sila", entrepot_id: "wh-sila-1", entrepot_actif: true, article_id: "riz", unite_id: "kg", etat_qualite: "ENDOMMAGE", date_peremption: null, quantite_physique: 30, quantite_reservee: 0 },
      { province_id: "prov-sila", entrepot_id: "wh-sila-inactif", entrepot_actif: false, article_id: "riz", unite_id: "kg", etat_qualite: "BON", date_peremption: null, quantite_physique: 40, quantite_reservee: 0 },
      { province_id: null, entrepot_id: "wh-central", entrepot_actif: true, article_id: "riz", unite_id: "kg", etat_qualite: "BON", date_peremption: null, quantite_physique: 100, quantite_reservee: 0 },
    ];
    const resultats = calculerStocksDisponibles(lots, "2026-10-23");
    assert.equal(resultats.size, 4);
    assert.equal(resultats.get(JSON.stringify(["prov-sila", "wh-sila-1", "riz", "kg"])), 15);
    assert.equal(resultats.get(JSON.stringify(["prov-sila", "wh-sila-1", "huile", "litre"])), 6);
    assert.equal(resultats.get(JSON.stringify(["prov-sila", "wh-sila-2", "riz", "kg"])), 7);
    assert.equal(resultats.get(JSON.stringify(["prov-ouaddai", "wh-ouaddai-1", "riz", "kg"])), 10);
  });
});

describe("Contrat HTTP UI-MAP 1.5", () => {
  it("accepte les filtres français valides sans élargir la surface du contrat", () => {
    const resultat = schemaFiltresIndicateursCarte.safeParse({
      province_id: "prov-sila",
      date_debut: "2026-10-01",
      date_fin: "2026-10-31",
      article_id: "article-riz",
    });
    assert.equal(resultat.success, true);
  });

  it("refuse les dates calendaires invalides, les périodes inversées et les paramètres inconnus", () => {
    assert.equal(schemaFiltresIndicateursCarte.safeParse({ date_debut: "2026-02-30" }).success, false);
    assert.equal(schemaFiltresIndicateursCarte.safeParse({ date_debut: "2026-10-31", date_fin: "2026-10-01" }).success, false);
    assert.equal(schemaFiltresIndicateursCarte.safeParse({ province_id: "prov-sila", statut: "CLOTUREE" }).success, false);
  });
});
