import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Chantier 02 — Mise en service opérationnelle des stocks", () => {
  function creerBaseMigree(avecDemoStocks = false) {
    const db = new DatabaseSync(":memory:");
    const dir = resolve(process.cwd(), "migrations");
    const sqlFiles = readdirSync(dir)
      .filter((f) => /^\d{4}_.*\.sql$/u.test(f))
      .sort((a, b) => a.localeCompare(b));

    for (const f of sqlFiles) {
      db.exec(readFileSync(resolve(dir, f), "utf8"));
    }
    if (avecDemoStocks) {
      const fixture = resolve(process.cwd(), "tests/fixtures/demonstration-stocks.sql");
      db.exec(readFileSync(fixture, "utf8"));
    }
    return db;
  }

  it("vérifie le catalogue d'articles et conditionnements de référence dans la migration 0029", () => {
    const db = creerBaseMigree(false);
    const nbArticles = db.prepare("SELECT COUNT(*) AS total FROM articles WHERE actif = 1").get().total;
    expect(nbArticles).toBe(6);

    const sorgho = db.prepare("SELECT designation, perissable FROM articles WHERE code_article = 'ALIM-SORG-50KG'").get();
    expect(sorgho.designation).toContain("Sorgho blanc");
    expect(sorgho.perissable).toBe(1);

    const huile = db.prepare("SELECT designation, perissable FROM articles WHERE code_article = 'ALIM-HUIL-05L'").get();
    expect(huile.designation).toContain("Huile végétale");
    expect(huile.perissable).toBe(1);

    const nbCond = db.prepare("SELECT COUNT(*) AS total FROM conditionnements").get().total;
    expect(nbCond).toBe(6);

    // Contrôle strict d'intégrité : la migration opérationnelle 0029 ne doit contenir AUCUN entrepôt ni lot fictif
    const nbEntrepots = db.prepare("SELECT COUNT(*) AS total FROM entrepots").get().total;
    expect(nbEntrepots).toBe(0);

    const nbLots = db.prepare("SELECT COUNT(*) AS total FROM lots_stock").get().total;
    expect(nbLots).toBe(0);

    db.close();
  });

  it("vérifie le réseau d'entrepôts central et provinciaux de démonstration dans le banc de test", () => {
    const db = creerBaseMigree(true);
    const entrepotCentral = db.prepare("SELECT niveau, province_id FROM entrepots WHERE code_entrepot = 'ENT-CEN-NDJ'").get();
    expect(entrepotCentral.niveau).toBe("CENTRAL");
    expect(entrepotCentral.province_id).toBeNull();

    const entrepotsProvinciaux = db.prepare("SELECT COUNT(*) AS total FROM entrepots WHERE niveau = 'PROVINCIAL'").get().total;
    expect(entrepotsProvinciaux).toBe(22);

    const nbLots = db.prepare("SELECT COUNT(*) AS total FROM lots_stock").get().total;
    expect(nbLots).toBe(12);

    db.close();
  });

  it("vérifie la règle FEFO et le calcul automatique des soldes sur les stocks de démonstration", () => {
    const db = creerBaseMigree(true);
    const lotsSorghoCentral = db.prepare(`
      SELECT numero_lot, date_peremption, quantite_physique, quantite_reservee, (quantite_physique - quantite_reservee) AS quantite_disponible
      FROM lots_stock
      WHERE article_id = 'art-sorgho-50kg' AND entrepot_id = 'ent-central-ndjamena'
      ORDER BY date_peremption ASC
    `).all();

    expect(lotsSorghoCentral.length).toBe(2);
    expect(lotsSorghoCentral[0].numero_lot).toBe("LOT-SORG-2026-001");
    expect(lotsSorghoCentral[0].date_peremption).toBe("2027-03-31");
    expect(lotsSorghoCentral[0].quantite_disponible).toBe(5000);

    expect(lotsSorghoCentral[1].numero_lot).toBe("LOT-SORG-2026-002");
    expect(lotsSorghoCentral[1].date_peremption).toBe("2027-10-31");

    const soldeDispo = db.prepare(`
      SELECT SUM(quantite_physique - quantite_reservee) AS total
      FROM lots_stock
      WHERE article_id = 'art-sorgho-50kg' AND entrepot_id = 'ent-central-ndjamena'
    `).get().total;
    expect(soldeDispo).toBe(10000);

    db.close();
  });

  it("interdit les stocks négatifs et réservations supérieures au disponible", () => {
    const db = creerBaseMigree(true);
    let echecReservation = false;
    try {
      db.prepare("UPDATE lots_stock SET quantite_reservee = 6000 WHERE id = 'lot-sorg-cen-01'").run();
    } catch {
      echecReservation = true;
    }
    expect(echecReservation).toBe(true);

    let echecStockNegatif = false;
    try {
      db.prepare("UPDATE lots_stock SET quantite_physique = -10 WHERE id = 'lot-sorg-cen-01'").run();
    } catch {
      echecStockNegatif = true;
    }
    expect(echecStockNegatif).toBe(true);

    db.close();
  });
});
