import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");

console.log("================================================================================");
console.log("   AUDIT TECHNIQUE ET CONTRADICTOIRE DES DONNÉES TERRITORIALES RÉELLES (D1)     ");
console.log("================================================================================");

const categories = [
  { nom: "Provinces", table: "provinces" },
  { nom: "Départements", table: "departements" },
  { nom: "Sous-préfectures", table: "sous_prefectures" },
  { nom: "Communes", table: "communes" },
  { nom: "Cantons", table: "cantons" },
  { nom: "Villes", table: "localites", filtreType: "type_localite = 'VILLE'" },
  { nom: "Arrondissements", table: "arrondissements" },
  { nom: "Quartiers", table: "quartiers" },
  { nom: "Carrés", table: "carres", filtreType: "type_subdivision = 'CARRE' OR type_subdivision IS NULL" },
  { nom: "Blocs", table: "carres", filtreType: "type_subdivision = 'BLOC'" },
  { nom: "Secteurs (humanitaires)", table: "carres", filtreType: "type_subdivision = 'SECTEUR'" },
  { nom: "Villages", table: "localites", filtreType: "type_localite = 'VILLAGE'" },
  { nom: "Ferricks", table: "localites", filtreType: "type_localite IN ('FERRICK', 'CAMPEMENT')" },
  { nom: "Sites humanitaires", table: "sites_humanitaires" },
];

const resultats = [];

for (const cat of categories) {
  try {
    let sqlTotal = `SELECT COUNT(*) as c FROM ${cat.table}`;
    if (cat.filtreType) sqlTotal += ` WHERE ${cat.filtreType}`;
    const total = db.prepare(sqlTotal).get().c;

    // Colonnes
    const cols = db.prepare(`PRAGMA table_info(${cat.table})`).all().map(c => c.name);

    // Actifs
    let sqlActifs = "";
    if (cols.includes("actif")) {
      sqlActifs = `SELECT COUNT(*) as c FROM ${cat.table} WHERE actif = 1`;
    } else if (cols.includes("statut_operationnel")) {
      sqlActifs = `SELECT COUNT(*) as c FROM ${cat.table} WHERE statut_operationnel = 'ACTIF' AND (actif = 1 OR actif IS NULL)`;
    } else if (cols.includes("statut_validation")) {
      sqlActifs = `SELECT COUNT(*) as c FROM ${cat.table} WHERE statut_validation = 'VALIDE'`;
    } else {
      sqlActifs = `SELECT COUNT(*) as c FROM ${cat.table} WHERE 1=1`;
    }
    if (cat.filtreType) {
      sqlActifs += (sqlActifs.includes("WHERE") ? " AND " : " WHERE ") + cat.filtreType;
    }
    const actifs = db.prepare(sqlActifs).get().c;

    // Sources distinctes
    let sources = "Aucune source documentée";
    if (cols.includes("source_officielle")) {
      const srcRows = db.prepare(`SELECT DISTINCT source_officielle FROM ${cat.table} WHERE source_officielle IS NOT NULL AND source_officielle != '' ${cat.filtreType ? "AND " + cat.filtreType : ""}`).all();
      if (srcRows.length > 0) sources = srcRows.map(r => r.source_officielle).join(" | ");
    } else if (cols.includes("source_documentation")) {
      const srcRows = db.prepare(`SELECT DISTINCT source_documentation FROM ${cat.table} WHERE source_documentation IS NOT NULL AND source_documentation != '' ${cat.filtreType ? "AND " + cat.filtreType : ""}`).all();
      if (srcRows.length > 0) sources = srcRows.map(r => r.source_documentation).join(" | ");
    }

    // Démo / Test
    let sqlDemo = `SELECT COUNT(*) as c FROM ${cat.table} WHERE 1=0`;
    if (cols.includes("code")) {
      sqlDemo = `SELECT COUNT(*) as c FROM ${cat.table} WHERE (code LIKE '%TEST%' OR code LIKE '%DEMO%')`;
    }
    if (cat.filtreType && cols.includes("code")) {
      sqlDemo += ` AND (${cat.filtreType})`;
    }
    const demo = db.prepare(sqlDemo).get().c;

    // Provenant d'import
    let provenantImport = 0;
    if (cols.includes("source_officielle")) {
      provenantImport = db.prepare(`SELECT COUNT(*) as c FROM ${cat.table} WHERE source_officielle IS NOT NULL AND source_officielle != '' ${cat.filtreType ? "AND " + cat.filtreType : ""}`).get().c;
    } else if (cols.includes("source_documentation")) {
      provenantImport = db.prepare(`SELECT COUNT(*) as c FROM ${cat.table} WHERE source_documentation IS NOT NULL AND source_documentation != '' ${cat.filtreType ? "AND " + cat.filtreType : ""}`).get().c;
    }

    // Sélectionnable dans les formulaires ordinaires
    // Règle: actif = 1 AND statut != ARCHIVE AND pour communes, non sélectionnable car en attente de décret
    let selectionnables = 0;
    if (cat.nom === "Communes") {
      selectionnables = 0; // Explicitement désactivées en migration 0028 pour éviter doublons
    } else if (cat.nom === "Départements") {
      selectionnables = db.prepare(`SELECT COUNT(*) as c FROM departements WHERE statut_operationnel = 'ACTIF' AND actif = 1`).get().c;
    } else if (cat.nom === "Provinces") {
      selectionnables = db.prepare(`SELECT COUNT(*) as c FROM provinces WHERE actif = 1`).get().c;
    } else if (cat.table === "localites") {
      selectionnables = db.prepare(`SELECT COUNT(*) as c FROM localites WHERE statut_validation = 'VALIDE' AND ${cat.filtreType}`).get().c;
    } else if (cat.table === "arrondissements") {
      selectionnables = db.prepare(`SELECT COUNT(*) as c FROM arrondissements WHERE statut_validation = 'VALIDE'`).get().c;
    } else if (cat.table === "quartiers") {
      selectionnables = db.prepare(`SELECT COUNT(*) as c FROM quartiers WHERE statut_validation = 'VALIDE'`).get().c;
    } else {
      selectionnables = actifs;
    }

    resultats.push({
      Categorie: cat.nom,
      Table: cat.table,
      TotalReel: total,
      Actifs: actifs,
      Import: provenantImport,
      Demo: demo,
      Selectionnables: selectionnables,
      Sources: sources.length > 60 ? sources.substring(0, 57) + "..." : sources
    });
  } catch (err) {
    resultats.push({
      Categorie: cat.nom,
      Table: cat.table,
      TotalReel: "ERREUR",
      Actifs: "ERREUR",
      Import: "ERREUR",
      Demo: "ERREUR",
      Selectionnables: "ERREUR",
      Sources: err.message
    });
  }
}

console.table(resultats);

console.log("\n--- DÉTAIL DES DÉPARTEMENTS ---");
const deps = db.prepare(`
  SELECT 
    certification_juridique,
    statut_operationnel,
    statut_validation,
    COUNT(*) as total
  FROM departements
  GROUP BY certification_juridique, statut_operationnel, statut_validation
`).all();
console.table(deps);

console.log("\n--- DÉTAIL DES LOCALITÉS ENREGISTRÉES ---");
const locs = db.prepare(`
  SELECT id, nom, type_localite, mode_decoupage_urbain, source_documentation, statut_validation
  FROM localites
`).all();
console.table(locs);
