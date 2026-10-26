import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("tests/fixtures/pre-recette-staging-run.sqlite");

console.log("=== COMPTAGE RÉEL DES DONNÉES TERRITORIALES ===");

const tablesTerritoriales = [
  "provinces",
  "departements",
  "sous_prefectures",
  "communes",
  "cantons",
  "villes",
  "arrondissements",
  "quartiers",
  "carres",
  "localites"
];

for (const nomTable of tablesTerritoriales) {
  try {
    const total = db.prepare(`SELECT COUNT(*) as c FROM ${nomTable}`).get().c;
    const colonnes = db.prepare(`PRAGMA table_info(${nomTable})`).all().map(c => c.name);
    
    let clauseActif = "1=1";
    if (colonnes.includes("statut")) {
      clauseActif = "statut = 'ACTIF'";
    } else if (colonnes.includes("statut_operationnel")) {
      clauseActif = "statut_operationnel = 'ACTIF'";
    } else if (colonnes.includes("statut_validation")) {
      clauseActif = "statut_validation = 'VALIDE'";
    } else if (colonnes.includes("actif")) {
      clauseActif = "actif = 1";
    }

    const actifs = db.prepare(`SELECT COUNT(*) as c FROM ${nomTable} WHERE ${clauseActif}`).get().c;

    let importes = 0;
    if (colonnes.includes("source_officielle")) {
      importes = db.prepare(`SELECT COUNT(*) as c FROM ${nomTable} WHERE source_officielle IS NOT NULL AND source_officielle != ''`).get().c;
    } else if (colonnes.includes("source_import")) {
      importes = db.prepare(`SELECT COUNT(*) as c FROM ${nomTable} WHERE source_import IS NOT NULL`).get().c;
    }

    let demo = 0;
    if (colonnes.includes("is_demo")) {
      demo = db.prepare(`SELECT COUNT(*) as c FROM ${nomTable} WHERE is_demo = 1`).get().c;
    } else if (colonnes.includes("code")) {
      demo = db.prepare(`SELECT COUNT(*) as c FROM ${nomTable} WHERE code LIKE '%TEST%' OR code LIKE '%DEMO%'`).get().c;
    }

    console.log(`Table ${nomTable.padEnd(18)} : Total=${String(total).padStart(5)} | Actifs=${String(actifs).padStart(5)} | Importés/Séchés=${String(importes).padStart(5)} | Démo=${demo}`);
  } catch (err) {
    console.error(`Erreur sur table ${nomTable}:`, err.message);
  }
}

console.log("\n=== DÉTAIL TABLE LOCALITÉS PAR TYPE ET STATUT ===");
try {
  const localitesStats = db.prepare(`
    SELECT 
      type, 
      COUNT(*) as total,
      SUM(CASE WHEN statut = 'ACTIF' THEN 1 ELSE 0 END) as actifs,
      SUM(CASE WHEN statut != 'ACTIF' THEN 1 ELSE 0 END) as inactifs,
      SUM(CASE WHEN source_officielle IS NOT NULL THEN 1 ELSE 0 END) as avec_source
    FROM localites
    GROUP BY type
  `).all();
  console.table(localitesStats);
} catch (err) {
  console.error("Erreur localitesStats:", err.message);
}

console.log("\n=== DÉTAIL TABLE CARRES PAR TYPE_SUBDIVISION ===");
try {
  const carresStats = db.prepare(`
    SELECT 
      type_subdivision, 
      COUNT(*) as total,
      SUM(CASE WHEN actif = 1 THEN 1 ELSE 0 END) as actifs
    FROM carres
    GROUP BY type_subdivision
  `).all();
  console.table(carresStats);
} catch (err) {
  console.error("Erreur carresStats:", err.message);
}

console.log("\n=== DÉTAIL TABLE DEPARTEMENTS ===");
try {
  const depStats = db.prepare(`
    SELECT 
      statut_operationnel,
      statut_validation,
      statut_juridique,
      COUNT(*) as total
    FROM departements
    GROUP BY statut_operationnel, statut_validation, statut_juridique
  `).all();
  console.table(depStats);
} catch (err) {
  console.error("Erreur depStats:", err.message);
}

console.log("\n=== DÉTAIL DES SOURCES DES DONNÉES EN BASE ===");
try {
  const sourcesLocalites = db.prepare(`
    SELECT DISTINCT source_officielle, COUNT(*) as c 
    FROM localites 
    GROUP BY source_officielle
  `).all();
  console.table(sourcesLocalites);
} catch (err) {
  console.error("Erreur sourcesLocalites:", err.message);
}

console.log("\n=== RECHERCHE DANS MENAGES ET VRAIES LOCALISATIONS ASSOCIÉES ===");
try {
  const totalMenages = db.prepare("SELECT COUNT(*) as c FROM menages").get().c;
  console.log("Total ménages en base :", totalMenages);
} catch (err) {
  console.log("Erreur menages:", err.message);
}
