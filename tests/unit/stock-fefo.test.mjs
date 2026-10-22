import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { allouerLotsFefo, ErreurStock } from "../../backend/src/services/stock.service.ts";

function lot(id, options = {}) {
  return {
    id,
    numero_lot: id,
    entrepot_id: "entrepot-sila",
    province_id: "prov-sila",
    article_id: "article-riz",
    source_type: "APPROVISIONNEMENT_DIRECT",
    source_reference_id: "reception-test",
    partenaire_bailleur_id: null,
    date_peremption: options.date_peremption ?? null,
    etat_qualite: options.etat_qualite ?? "BON",
    quantite_physique: options.quantite_physique ?? 10,
    quantite_reservee: options.quantite_reservee ?? 0,
  };
}

describe("Allocation de stock FEFO", () => {
  it("retient les lots sains non périmés dans l’ordre de péremption", () => {
    const allocations = allouerLotsFefo([
      lot("lot-sans-date"),
      lot("lot-fefo-second", { date_peremption: "2027-04-30" }),
      lot("lot-perime", { date_peremption: "2026-01-01" }),
      lot("lot-endommage", { date_peremption: "2026-11-01", etat_qualite: "ENDOMMAGE" }),
      lot("lot-fefo-premier", { date_peremption: "2026-11-15", quantite_physique: 4 }),
    ], 9, "2026-10-22");

    assert.deepEqual(allocations.map((allocation) => [allocation.lot.id, allocation.quantite]), [
      ["lot-fefo-premier", 4],
      ["lot-fefo-second", 5],
    ]);
  });

  it("n’autorise pas une réservation supérieure au stock distribuable", () => {
    assert.throws(
      () => allouerLotsFefo([
        lot("lot-disponible", { quantite_physique: 5, quantite_reservee: 2 }),
        lot("lot-quarantaine", { etat_qualite: "QUARANTAINE" }),
      ], 4, "2026-10-22"),
      (erreur) => erreur instanceof ErreurStock && erreur.statutHttp === 409,
    );
  });

  it("place les lots sans date de péremption après les lots datés", () => {
    const allocations = allouerLotsFefo([
      lot("lot-sans-date"),
      lot("lot-date", { date_peremption: "2027-01-01" }),
    ], 12, "2026-10-22");
    assert.deepEqual(allocations.map((allocation) => allocation.lot.id), ["lot-date", "lot-sans-date"]);
  });
});
