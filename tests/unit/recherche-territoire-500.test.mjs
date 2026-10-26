import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync } from "node:fs";

const DB_SOURCE = "tests/fixtures/pre-recette-staging-run.sqlite";
const DB_TEST = "tests/fixtures/test-recherche-500.sqlite";
copyFileSync(DB_SOURCE, DB_TEST);

const dbSync = new DatabaseSync(DB_TEST);

function wrapD1(syncDb) {
  return {
    prepare(query) {
      return {
        _query: query,
        _args: [],
        bind(...args) {
          const bound = Object.create(this);
          bound._args = args.map(a => a === undefined ? null : a);
          return bound;
        },
        async all() {
          const stmt = syncDb.prepare(query);
          const results = stmt.all(...this._args);
          return { results: results ?? [], success: true };
        },
        async first(col) {
          const stmt = syncDb.prepare(query);
          const row = stmt.get(...this._args);
          if (!row) return null;
          if (col && typeof col === "string") return row[col];
          return row;
        },
        async run() {
          const stmt = syncDb.prepare(query);
          const info = stmt.run(...this._args);
          return { success: true, meta: { changes: Number(info.changes) } };
        }
      };
    }
  };
}

const db = wrapD1(dbSync);
const { rechercherUnitesTerritoriales } = await import("../../backend/src/services/administration-territoriale.service.ts");

describe("SIGAD — Correction HTTP 500 Recherche Territoriale", () => {
  // Les 4 requêtes en échec lors de l'incident
  it("TC-01: Recherche globale par défaut (?limite=50) sans critère textuel", async () => {
    const res = await rechercherUnitesTerritoriales(db, { limite: 50 });
    expect(res.total).toBeGreaterThanOrEqual(112);
    expect(res.elements.length).toBe(50);
    expect(res.elements[0]).toHaveProperty("id");
    expect(res.elements[0]).toHaveProperty("nom");
    expect(res.elements[0]).toHaveProperty("type");
    expect(res.elements[0]).toHaveProperty("fil_ariane");
  });

  it("TC-02: Recherche Unicode Arabe (?recherche=س&limite=50)", async () => {
    const res = await rechercherUnitesTerritoriales(db, { recherche: "س", limite: 50 });
    expect(res).toHaveProperty("elements");
    expect(res).toHaveProperty("total");
    expect(Array.isArray(res.elements)).toBe(true);
  });

  it("TC-03: Recherche textuelle courte (?recherche=k&limite=50)", async () => {
    const res = await rechercherUnitesTerritoriales(db, { recherche: "k", limite: 50 });
    expect(res.total).toBeGreaterThan(0);
    expect(res.elements.length).toBeGreaterThan(0);
    const tousContiennentK = res.elements.every(e => 
      e.nom.toLowerCase().includes("k") || 
      (e.code && e.code.toLowerCase().includes("k")) ||
      (e.chef_lieu && e.chef_lieu.toLowerCase().includes("k"))
    );
    expect(tousContiennentK).toBe(true);
  });

  it("TC-04: Recherche textuelle partielle (?recherche=ker&limite=50)", async () => {
    const res = await rechercherUnitesTerritoriales(db, { recherche: "ker", limite: 50 });
    expect(res.total).toBeGreaterThan(0);
    expect(res.elements.some(e => e.nom.toLowerCase().includes("ker"))).toBe(true);
  });

  // 10 cas de non-régression
  it("TC-05: Recherche vide sans filtre retourne les unités du pays", async () => {
    const res = await rechercherUnitesTerritoriales(db, { limite: 20 });
    expect(res.total).toBeGreaterThanOrEqual(112);
    expect(res.elements.length).toBe(20);
  });

  it("TC-06: Recherche en français avec casse mixte", async () => {
    const res = await rechercherUnitesTerritoriales(db, { recherche: "NdJamEna", limite: 10 });
    expect(res.total).toBeGreaterThan(0);
    expect(res.elements.some(e => e.nom.toLowerCase().includes("ndjamena"))).toBe(true);
  });

  it("TC-07: Filtre par province (?province_id=prov-ndjamena)", async () => {
    const res = await rechercherUnitesTerritoriales(db, { province_id: "prov-ndjamena", limite: 50 });
    expect(res.total).toBeGreaterThan(0);
    const toutesDansNdjamena = res.elements.every(e => e.province_id === "prov-ndjamena");
    expect(toutesDansNdjamena).toBe(true);
  });

  it("TC-08: Filtre par type DEPARTEMENT (?type=DEPARTEMENT)", async () => {
    const res = await rechercherUnitesTerritoriales(db, { type: "DEPARTEMENT", limite: 150 });
    expect(res.total).toBe(112);
    expect(res.elements.length).toBe(112);
    expect(res.elements.every(e => e.type === "DEPARTEMENT")).toBe(true);
  });

  it("TC-09: Filtre par type COMMUNE (?type=COMMUNE)", async () => {
    const res = await rechercherUnitesTerritoriales(db, { type: "COMMUNE", limite: 50 });
    expect(res.total).toBe(500);
    expect(res.elements.length).toBe(50);
    expect(res.elements.every(e => e.type === "COMMUNE")).toBe(true);
  });

  it("TC-10: Pagination limite et décalage", async () => {
    const page1 = await rechercherUnitesTerritoriales(db, { limite: 5, decalage: 0 });
    const page2 = await rechercherUnitesTerritoriales(db, { limite: 5, decalage: 5 });
    expect(page1.elements.length).toBe(5);
    expect(page2.elements.length).toBe(5);
    expect(page1.elements[0].id).not.toBe(page2.elements[0].id);
  });

  it("TC-11: Recherche sans aucun résultat correspondant", async () => {
    const res = await rechercherUnitesTerritoriales(db, { recherche: "XYZ_ENTITE_INEXISTANTE_999", limite: 50 });
    expect(res.total).toBe(0);
    expect(res.elements).toEqual([]);
  });

  it("TC-12: Filtre combiné type et recherche", async () => {
    const res = await rechercherUnitesTerritoriales(db, { type: "DEPARTEMENT", recherche: "barh", limite: 10 });
    expect(res.total).toBeGreaterThan(0);
    expect(res.elements.every(e => 
      e.type === "DEPARTEMENT" && (
        e.nom.toLowerCase().includes("barh") ||
        (e.chef_lieu && e.chef_lieu.toLowerCase().includes("barh")) ||
        (e.code && e.code.toLowerCase().includes("barh"))
      )
    )).toBe(true);
  });

  it("TC-13: Préservation de toutes les catégories territoriales dans les résultats sans type", async () => {
    const res = await rechercherUnitesTerritoriales(db, { limite: 500 });
    const typesTrouves = new Set(res.elements.map(e => e.type));
    expect(typesTrouves.has("PROVINCE")).toBe(true);
    expect(typesTrouves.has("DEPARTEMENT")).toBe(true);
    expect(typesTrouves.has("COMMUNE")).toBe(true);
    expect(typesTrouves.has("ARRONDISSEMENT")).toBe(true);
    expect(typesTrouves.has("QUARTIER")).toBe(true);
  });

  it("TC-14: Fil d'Ariane cohérent sur chaque résultat", async () => {
    const res = await rechercherUnitesTerritoriales(db, { limite: 20 });
    for (const el of res.elements) {
      expect(typeof el.fil_ariane).toBe("string");
      expect(el.fil_ariane.length).toBeGreaterThan(0);
      expect(el.fil_ariane).toContain("Province");
    }
  });
});
