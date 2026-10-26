import { afterAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";

const dbSync = new DatabaseSync(":memory:");
dbSync.exec(`
  CREATE TABLE provinces (id TEXT PRIMARY KEY, nom TEXT NOT NULL, code TEXT, actif INTEGER NOT NULL, chef_lieu TEXT);
  CREATE TABLE departements (id TEXT PRIMARY KEY, nom TEXT NOT NULL, code TEXT, province_id TEXT NOT NULL, statut_validation TEXT, source_officielle TEXT, chef_lieu TEXT);
  CREATE TABLE sous_prefectures (id TEXT PRIMARY KEY, nom TEXT NOT NULL, code TEXT, departement_id TEXT NOT NULL);
  CREATE TABLE communes (id TEXT PRIMARY KEY, nom TEXT NOT NULL, code TEXT, province_id TEXT NOT NULL, statut_validation TEXT, source_officielle TEXT);
  CREATE TABLE cantons (id TEXT PRIMARY KEY, nom TEXT NOT NULL, departement_id TEXT, sous_prefecture_id TEXT, statut_validation TEXT);
  CREATE TABLE localites (id TEXT PRIMARY KEY, nom TEXT NOT NULL, type_localite TEXT, province_id TEXT NOT NULL, departement_id TEXT, sous_prefecture_id TEXT, statut_validation TEXT, source_documentation TEXT);
  CREATE TABLE arrondissements (id TEXT PRIMARY KEY, nom TEXT NOT NULL, code TEXT, localite_id TEXT NOT NULL, statut_validation TEXT);
  CREATE TABLE quartiers (id TEXT PRIMARY KEY, nom TEXT NOT NULL, localite_id TEXT NOT NULL, arrondissement_id TEXT, statut_validation TEXT);
  CREATE TABLE carres (id TEXT PRIMARY KEY, type_subdivision TEXT, code_ou_nom TEXT, quartier_id TEXT, statut_validation TEXT);
  CREATE TABLE sites_humanitaires (id TEXT PRIMARY KEY, nom TEXT NOT NULL, code_site TEXT, province_id TEXT NOT NULL, departement_id TEXT, sous_prefecture_id TEXT, statut_validation TEXT);
`);

const insererProvince = dbSync.prepare("INSERT INTO provinces (id, nom, code, actif, chef_lieu) VALUES (?, ?, ?, ?, ?)");
insererProvince.run("prov-ndjamena", "A Ndjamena K", "KPROV-NDJ", 1, "Ndjamena");
insererProvince.run("prov-sila", "Z Sila", "KPROV-SI", 1, "Goz Beida");

const insererDepartement = dbSync.prepare(`
  INSERT INTO departements (id, nom, code, province_id, statut_validation, source_officielle, chef_lieu)
  VALUES (?, ?, ?, ?, 'VALIDE', 'Fixture de recherche synthétique', ?)
`);
for (let index = 1; index <= 112; index += 1) {
  const numero = String(index).padStart(3, "0");
  const nom = index === 1 ? "Barh Ker 001" : `Departement Kero ${numero}`;
  insererDepartement.run(`dep-test-${numero}`, nom, `KDEP-${numero}`, "prov-ndjamena", `Kero ${numero}`);
}

const insererCommune = dbSync.prepare(`
  INSERT INTO communes (id, nom, code, province_id, statut_validation, source_officielle)
  VALUES (?, ?, ?, 'prov-ndjamena', 'PROPOSE', 'Fixture de recherche synthétique')
`);
for (let index = 1; index <= 500; index += 1) {
  const numero = String(index).padStart(3, "0");
  insererCommune.run(`com-test-${numero}`, `Commune Ker ${numero}`, `KCOM-${numero}`);
}

dbSync.exec(`
  INSERT INTO sous_prefectures (id, nom, code, departement_id) VALUES ('sp-test-1', 'A Sous-prefecture K', 'KSP-1', 'dep-test-001');
  INSERT INTO localites (id, nom, type_localite, province_id, departement_id, sous_prefecture_id, statut_validation, source_documentation)
    VALUES ('loc-test-1', 'A Localite K', 'VILLE', 'prov-ndjamena', 'dep-test-001', 'sp-test-1', 'VALIDE', 'Fixture synthétique');
  INSERT INTO arrondissements (id, nom, code, localite_id, statut_validation)
    VALUES ('arr-test-1', 'A Arrondissement K', 'KARR-1', 'loc-test-1', 'VALIDE');
  INSERT INTO quartiers (id, nom, localite_id, arrondissement_id, statut_validation)
    VALUES ('qrt-test-1', 'A Quartier K', 'loc-test-1', 'arr-test-1', 'VALIDE');
  INSERT INTO carres (id, type_subdivision, code_ou_nom, quartier_id, statut_validation)
    VALUES ('car-test-1', 'CARRE', 'KCAR-1', 'qrt-test-1', 'VALIDE');
  INSERT INTO cantons (id, nom, departement_id, sous_prefecture_id, statut_validation)
    VALUES ('can-test-1', 'A Canton K', 'dep-test-001', 'sp-test-1', 'VALIDE');
  INSERT INTO sites_humanitaires (id, nom, code_site, province_id, departement_id, sous_prefecture_id, statut_validation)
    VALUES ('site-test-1', 'A Site K', 'KSITE-1', 'prov-ndjamena', 'dep-test-001', 'sp-test-1', 'VALIDE');
`);

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

afterAll(() => dbSync.close());

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
