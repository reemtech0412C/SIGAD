import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { copyFileSync } from "node:fs";

// Copie isolée pour le banc de test
const DB_SOURCE = "tests/fixtures/pre-recette-staging-run.sqlite";
const DB_TEST = "tests/fixtures/test-execution-territoire.sqlite";
copyFileSync(DB_SOURCE, DB_TEST);

const dbSync = new DatabaseSync(DB_TEST);

// Wrapper D1
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
    },
    async batch(statements) {
      syncDb.exec("BEGIN TRANSACTION");
      try {
        const res = [];
        for (const stmt of statements) {
          res.push(await stmt.run());
        }
        syncDb.exec("COMMIT");
        return res;
      } catch (err) {
        syncDb.exec("ROLLBACK");
        throw err;
      }
    },
    async exec(sql) {
      syncDb.exec(sql);
      return { count: 0, duration: 0 };
    }
  };
}

const db = wrapD1(dbSync);

// Importer les services
const {
  obtenirTableauDeBordTerritorial,
  rechercherUnitesTerritoriales,
  ajouterUniteTerritoriale,
  modifierUniteTerritoriale,
  simulerRattachementTerritorial,
  modifierRattachementTerritorial,
  simulerFusionUnites,
  executerFusionUnites,
  archiverUniteTerritoriale,
  reactiverUniteTerritoriale,
  supprimerUniteTerritoriale,
  validerUniteTerritoriale,
  detecterDoublonsTerritoriaux,
  previsualiserImportTerritoire,
  previsualiserImportTerritoireFichier,
  exporterTerritoireCsv,
  exporterTerritoireXlsx,
  obtenirHistoriqueAuditsTerritoire,
  ErreurAdministrationTerritoriale,
} = await import("../backend/src/services/administration-territoriale.service.ts");

const {
  changerStatutOperationCentrale,
  enregistrerApprobation,
} = await import("../backend/src/services/operation-centrale.service.ts");

console.log("================================================================================");
console.log("   SIGAD — BANC D'ESSAI DES 24 TESTS : TERRITOIRE & GOUVERNANCE NATIONALE       ");
console.log("================================================================================");

const sessionProprietaire = {
  id: "usr-proprietaire",
  identifiant: "proprietaire",
  role: "PROPRIETAIRE",
  nom_complet: "Propriétaire National SIGAD",
  province_id: null,
};

const sessionAdminCentral = {
  id: "usr-central",
  identifiant: "central",
  role: "ADMIN_CENTRAL",
  nom_complet: "Administrateur Central",
  province_id: null,
};

const sessionDelegue = {
  id: "usr-batha",
  identifiant: "batha",
  role: "DELEGUE_PROVINCIAL",
  nom_complet: "Délégué Batha",
  province_id: "prov-batha",
};

let testsPasses = 0;
let testsEchoues = 0;

async function tester(nom, fn) {
  try {
    await fn();
    console.log(`[PASS] Test ${testsPasses + 1} : ${nom}`);
    testsPasses++;
  } catch (err) {
    console.error(`[FAIL] Test ${testsPasses + testsEchoues + 1} : ${nom}`);
    console.error("       Erreur:", err.message);
    testsEchoues++;
  }
}

// -----------------------------------------------------------------------------
// TEST 1 : Ajout d'un département
// -----------------------------------------------------------------------------
let depCreeId = null;
await tester("1. Ajout d'un département avec chef-lieu, source officielle et référence juridique", async () => {
  const res = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "DEPARTEMENT",
      nom: "Département Test Batha Nord",
      code: "DEP-BATHA-NORD-TEST",
      province_id: "prov-batha",
      chef_lieu: "Oum Hadjer Nord",
      source_officielle: "Ordonnance n°002/PR/2024",
      reference_juridique: "Art. 12 Décret 2026",
      statut_validation: "A_VERIFIER",
      observations: "Département candidat de test",
    },
    "127.0.0.1"
  );
  assert.ok(res.id, "ID département retourné");
  assert.equal(res.nom, "Département Test Batha Nord");
  assert.equal(res.statut_validation, "A_VERIFIER");
  depCreeId = res.id;
});

// -----------------------------------------------------------------------------
// TEST 2 : Modification d'un département
// -----------------------------------------------------------------------------
await tester("2. Modification d'un département (nom et chef-lieu) avec journalisation d'audit", async () => {
  const res = await modifierUniteTerritoriale(
    db,
    sessionProprietaire,
    "DEPARTEMENT",
    depCreeId,
    {
      nom: "Département Test Batha Septentrional",
      chef_lieu: "Oum Hadjer Centre",
      motif: "Harmonisation toponymique selon INSEED 2026",
    },
    "127.0.0.1"
  );
  assert.equal(res.id, depCreeId);

  const row = dbSync.prepare("SELECT nom, chef_lieu FROM departements WHERE id = ?").get(depCreeId);
  assert.equal(row.nom, "Département Test Batha Septentrional");
  assert.equal(row.chef_lieu, "Oum Hadjer Centre");
});

// -----------------------------------------------------------------------------
// TEST 3 : Validation d'un département A_VERIFIER vers VALIDE
// -----------------------------------------------------------------------------
await tester("3. Validation administrative formelle d'un département (A_VERIFIER -> VALIDE)", async () => {
  const res = await validerUniteTerritoriale(
    db,
    sessionProprietaire,
    "DEPARTEMENT",
    depCreeId,
    {
      statut_validation: "VALIDE",
      source_officielle: "Arrêté interministériel n°0045/MATD/2026",
      reference_juridique: "JO Tchad n°08/2026",
      motif: "Validation après audit de conformité légale",
    },
    "127.0.0.1"
  );
  assert.equal(res.statut_validation, "VALIDE");

  const row = dbSync.prepare("SELECT statut_validation FROM departements WHERE id = ?").get(depCreeId);
  assert.equal(row.statut_validation, "VALIDE");
});

// -----------------------------------------------------------------------------
// TEST 4 : Ajout d'une sous-préfecture
// -----------------------------------------------------------------------------
let spCreeId = null;
await tester("4. Ajout d'une sous-préfecture rattachée au département créé", async () => {
  const res = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "SOUS_PREFECTURE",
      nom: "Sous-Préfecture de Test",
      province_id: "prov-batha",
      departement_id: depCreeId,
      source_officielle: "Ordonnance 2024",
    },
    "127.0.0.1"
  );
  assert.ok(res.id);
  spCreeId = res.id;
});

// -----------------------------------------------------------------------------
// TEST 5 : Ajout d'une ville avec mode de découpage urbain
// -----------------------------------------------------------------------------
let villeCreeId = null;
await tester("5. Ajout d'une ville avec mode de découpage urbain SANS_ARRONDISSEMENT", async () => {
  const res = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLE",
      nom: "Ville Nouvelle de Test",
      province_id: "prov-batha",
      departement_id: depCreeId,
      mode_decoupage_urbain: "SANS_ARRONDISSEMENT",
      source_officielle: "Décret 2026",
      statut_validation: "VALIDE",
    },
    "127.0.0.1"
  );
  assert.ok(res.id);
  villeCreeId = res.id;
});

// -----------------------------------------------------------------------------
// TEST 6 : Ajout d'un quartier à N'Djaména rattaché à un des 10 arrondissements
// -----------------------------------------------------------------------------
let quartierNdjId = null;
await tester("6. Ajout d'un quartier à N'Djaména rattaché au 1er Arrondissement communal", async () => {
  const res = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "QUARTIER",
      nom: "Quartier Test Farcha Nord",
      province_id: "prov-ndjamena",
      localite_id: "loc-ndjamena-ville",
      arrondissement_id: "arr-ndj-1",
      possede_carres: true,
      source_officielle: "Arrêté Mairie N'Djamena 2026",
      statut_validation: "VALIDE",
    },
    "127.0.0.1"
  );
  assert.ok(res.id);
  quartierNdjId = res.id;

  const row = dbSync.prepare("SELECT nom, arrondissement_id FROM quartiers WHERE id = ?").get(quartierNdjId);
  assert.equal(row.nom, "Quartier Test Farcha Nord");
  assert.equal(row.arrondissement_id, "arr-ndj-1");
});

// -----------------------------------------------------------------------------
// TEST 7 : Ajout d'un village
// -----------------------------------------------------------------------------
let villageId1 = null;
await tester("7. Ajout d'un village rural rattaché à la sous-préfecture", async () => {
  const res = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLAGE",
      nom: "Village Test Am-Djoum",
      province_id: "prov-batha",
      departement_id: depCreeId,
      sous_prefecture_id: spCreeId,
      source_officielle: "Recensement 2026",
      statut_validation: "VALIDE",
    },
    "127.0.0.1"
  );
  assert.ok(res.id);
  villageId1 = res.id;
});

// -----------------------------------------------------------------------------
// TEST 8 : Ajout d'un ferrick nomade
// -----------------------------------------------------------------------------
let ferrickId = null;
await tester("8. Ajout d'un campement / ferrick pastoral nomade", async () => {
  const res = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "FERRICK",
      nom: "Ferrick Test Al-Bakar",
      province_id: "prov-batha",
      departement_id: depCreeId,
      source_officielle: "Enquête pastorale 2026",
      statut_validation: "A_VERIFIER",
    },
    "127.0.0.1"
  );
  assert.ok(res.id);
  ferrickId = res.id;
});

// -----------------------------------------------------------------------------
// TEST 9 : Déplacement / réaffectation d'un village au sein de la même province
// -----------------------------------------------------------------------------
let autreDepBatha = null;
await tester("9. Réaffectation d'un village vers un autre département de la même province (avec impact)", async () => {
  // Trouver un autre département dans Batha
  autreDepBatha = dbSync.prepare("SELECT id, nom FROM departements WHERE province_id = 'prov-batha' AND id != ? LIMIT 1").get(depCreeId);
  assert.ok(autreDepBatha, "Autre département Batha trouvé");

  const sim = await simulerRattachementTerritorial(db, "VILLAGE", villageId1, autreDepBatha.id);
  assert.equal(sim.autorise, true, "Simulation autorisée car même province");

  const modif = await modifierRattachementTerritorial(
    db,
    sessionProprietaire,
    "VILLAGE",
    villageId1,
    {
      nouveau_departement_id: autreDepBatha.id,
      justificatif: "Décret de rattachement 2026",
      motif: "Rattachement administratif corrigé",
    },
    "127.0.0.1"
  );
  assert.equal(modif.id, villageId1);

  const locApres = dbSync.prepare("SELECT departement_id FROM localites WHERE id = ?").get(villageId1);
  assert.equal(locApres.departement_id, autreDepBatha.id);
});

// -----------------------------------------------------------------------------
// TEST 10 : Refus strict d'un déplacement interprovincial
// -----------------------------------------------------------------------------
await tester("10. Refus strict (HTTP 409) de déplacement d'un village vers une autre province", async () => {
  // Département dans le Kanem
  const depKanem = dbSync.prepare("SELECT id FROM departements WHERE province_id = 'prov-kanem' LIMIT 1").get();
  assert.ok(depKanem);

  const sim = await simulerRattachementTerritorial(db, "VILLAGE", villageId1, depKanem.id);
  assert.equal(sim.autorise, false, "Simulation doit interdire le déplacement interprovincial");
  assert.match(sim.message_avertissement, /interprovincial/i);

  await assert.rejects(
    async () => {
      await modifierRattachementTerritorial(
        db,
        sessionProprietaire,
        "VILLAGE",
        villageId1,
        {
          nouveau_departement_id: depKanem.id,
          justificatif: "Tentative illégale",
          motif: "Test interprovincial",
        },
        "127.0.0.1"
      );
    },
    /interdit|autorisé/i
  );
});

// -----------------------------------------------------------------------------
// TEST 11 : Fusion de 2 villages doublons avec préservation des distributions
// -----------------------------------------------------------------------------
let villageDoublonId = null;
await tester("11. Fusion de 2 villages doublons : transfert ménages, table correspondance, préservation historique", async () => {
  // Créer un 2e village doublon dans Batha
  const vDoublon = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLAGE",
      nom: "Village Am-Djoum Ancien Doublon",
      province_id: "prov-batha",
      departement_id: autreDepBatha.id,
      source_officielle: "Ancien fichier 2025",
      statut_validation: "VALIDE",
    },
    "127.0.0.1"
  );
  villageDoublonId = vDoublon.id;

  // Créer un ménage fictif lié au village doublon
  const menageId = crypto.randomUUID();
  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
    VALUES (?, 'MEN-TEST-DOUBLON', 'prov-batha', ?, ?, 'cat-pop-autochtone', 'Chef Test Doublon', 'M', 5, 'VULN_TEST', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))
  `).run(menageId, autreDepBatha.id, villageDoublonId);

  // Simuler la fusion
  const sim = await simulerFusionUnites(db, "VILLAGE", villageId1, villageDoublonId);
  assert.equal(sim.fusion_autorisee, true);
  assert.equal(sim.menages_concernes, 1);

  // Exécuter la fusion
  const exec = await executerFusionUnites(
    db,
    sessionProprietaire,
    "VILLAGE",
    villageId1,
    villageDoublonId,
    "Doublon toponymique Am-Djoum identifié lors de l'audit",
    "Procès-verbal de réconciliation territoriale",
    "127.0.0.1"
  );
  assert.ok(exec.correspondance_id);

  // Vérifier le transfert du ménage vers villageId1
  const menageApres = dbSync.prepare("SELECT localite_id FROM menages WHERE id = ?").get(menageId);
  assert.equal(menageApres.localite_id, villageId1, "Le ménage a été rattaché à l'unité principale");

  // Vérifier l'archivage du doublon (statut REJETE conforme au schéma localites)
  const doublonApres = dbSync.prepare("SELECT statut_validation FROM localites WHERE id = ?").get(villageDoublonId);
  assert.equal(doublonApres.statut_validation, "REJETE", "Le doublon est archivé/rejeté");

  // Vérifier l'enregistrement dans correspondances_fusions_territoriales
  const corr = dbSync.prepare("SELECT nouveau_id FROM correspondances_fusions_territoriales WHERE ancien_id = ?").get(villageDoublonId);
  assert.equal(corr.nouveau_id, villageId1);
});

// -----------------------------------------------------------------------------
// TEST 12 : Refus de fusion pour entités de provinces distinctes
// -----------------------------------------------------------------------------
await tester("12. Refus de fusion de deux entités de provinces distinctes", async () => {
  // Créer un village dans Kanem
  const depKanem = dbSync.prepare("SELECT id FROM departements WHERE province_id = 'prov-kanem' LIMIT 1").get();
  const vKanem = await ajouterUniteTerritoriale(
    db, sessionProprietaire,
    { type: "VILLAGE", nom: "Village Kanem Test", province_id: "prov-kanem", departement_id: depKanem.id, source_officielle: "Test" },
    "127.0.0.1"
  );

  const sim = await simulerFusionUnites(db, "VILLAGE", villageId1, vKanem.id);
  assert.equal(sim.fusion_autorisee, false);
  assert.match(sim.message_blocage, /provinces différentes/i);

  await assert.rejects(
    async () => {
      await executerFusionUnites(
        db,
        sessionProprietaire,
        "VILLAGE",
        villageId1,
        vKanem.id,
        "Tentative interdite",
        "Justificatif invalide",
        "127.0.0.1"
      );
    },
    /interdite|provinces différentes/i
  );
});

// -----------------------------------------------------------------------------
// TEST 13 : Archivage d'une unité territoriale
// -----------------------------------------------------------------------------
await tester("13. Archivage d'une unité territoriale avec motif et vérification du statut", async () => {
  const res = await archiverUniteTerritoriale(
    db,
    sessionProprietaire,
    "FERRICK",
    ferrickId,
    "Campement nomade déplacé vers une autre zone",
    "127.0.0.1"
  );
  assert.equal(res.id, ferrickId);

  const row = dbSync.prepare("SELECT statut_validation FROM localites WHERE id = ?").get(ferrickId);
  assert.equal(row.statut_validation, "REJETE");
});

// -----------------------------------------------------------------------------
// TEST 14 : Suppression physique d'une unité SANS dépendance
// -----------------------------------------------------------------------------
await tester("14. Suppression physique réussie d'une unité territoriale sans aucune dépendance", async () => {
  // Créer un village isolé temporaire sans ménage ni distribution
  const vIsole = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLAGE",
      nom: "Village Test Isole Sans Dependance",
      province_id: "prov-batha",
      departement_id: depCreeId,
      source_officielle: "Test temporaire",
    },
    "127.0.0.1"
  );

  const resSuppr = await supprimerUniteTerritoriale(
    db,
    sessionProprietaire,
    "VILLAGE",
    vIsole.id,
    "Nettoyage de test unitaire",
    "127.0.0.1"
  );
  assert.equal(resSuppr.id, vIsole.id);

  const row = dbSync.prepare("SELECT 1 FROM localites WHERE id = ?").get(vIsole.id);
  assert.equal(row, undefined, "L'unité doit être supprimée de la base");
});

// -----------------------------------------------------------------------------
// TEST 15 : Refus strict de suppression physique si dépendances
// -----------------------------------------------------------------------------
await tester("15. Refus strict (HTTP 409) de suppression physique d'une unité possédant des ménages", async () => {
  // villageId1 possède le ménage réaffecté du test 11 !
  await assert.rejects(
    async () => {
      await supprimerUniteTerritoriale(
        db,
        sessionProprietaire,
        "VILLAGE",
        villageId1,
        "Tentative de suppression de village avec ménages",
        "127.0.0.1"
      );
    },
    /dépendances actives|Suppression physique refusée/i
  );
});

// -----------------------------------------------------------------------------
// TEST 16 : Importation par lot CSV : prévisualisation
// -----------------------------------------------------------------------------
await tester("16. Importation par lot CSV : prévisualisation et détection des lignes valides", async () => {
  const csv = `type,nom,province_id,departement_id,chef_lieu,source
VILLAGE,Am-Sidir,prov-batha,${depCreeId},,Recensement certifié 2026
VILLAGE,Karkour,prov-batha,${depCreeId},,Recensement certifié 2026`;

  const prev = await previsualiserImportTerritoire(db, csv);
  assert.equal(prev.lignes_valides.length, 2);
  assert.equal(prev.erreurs.length, 0);
  assert.equal(prev.lignes_nouvelles, 2);
});

// -----------------------------------------------------------------------------
// TEST 17 : Rejet à l'import de lignes ayant des provinces ou départements inexistants
// -----------------------------------------------------------------------------
await tester("17. Rejet à l'import des lignes avec rattachement parent inexistant", async () => {
  const csvInvalide = `type,nom,province_id,departement_id,chef_lieu,source
VILLAGE,Village Fantome,prov-inconnue-xyz,dep-inconnu,,Source bidon
VILLAGE,Nom Trop Court,prov-batha,,,""`;

  const prev = await previsualiserImportTerritoire(db, csvInvalide);
  assert.equal(prev.lignes_valides.length, 0);
  assert.ok(prev.erreurs.length >= 2);
});

// -----------------------------------------------------------------------------
// TEST 18 : Détection des doublons toponymiques
// -----------------------------------------------------------------------------
await tester("18. Détection automatique des doublons toponymiques au sein d'une province", async () => {
  // Créer deux localités avec le même nom dans Batha
  const d1 = await ajouterUniteTerritoriale(
    db, sessionProprietaire,
    { type: "VILLAGE", nom: "DoublonExactTest", province_id: "prov-batha", departement_id: depCreeId, source_officielle: "Test" },
    "127.0.0.1"
  );
  const d2 = await ajouterUniteTerritoriale(
    db, sessionProprietaire,
    { type: "VILLAGE", nom: "doublonexacttest", province_id: "prov-batha", departement_id: "dep-batha-batha-ouest", source_officielle: "Test" },
    "127.0.0.1"
  );

  const doublons = await detecterDoublonsTerritoriaux(db, "VILLAGE", "prov-batha");
  assert.ok(doublons.length > 0);
  const trouve = doublons.some(d => (d.id1 === d1.id && d.id2 === d2.id) || (d.id1 === d2.id && d.id2 === d1.id));
  assert.ok(trouve, "Le doublon toponymique a été identifié");
});

// -----------------------------------------------------------------------------
// TEST 19 : Exportation CSV certifiée UTF-8
// -----------------------------------------------------------------------------
await tester("19. Exportation CSV du référentiel territorial avec fil d'ariane et validation", async () => {
  const csv = await exporterTerritoireCsv(db, "DEPARTEMENT", "prov-batha");
  assert.ok(csv.startsWith("id,type,nom,code"));
  assert.ok(csv.includes("Département Test Batha Septentrional"));
});

// -----------------------------------------------------------------------------
// TEST 20 : Vérification des entrées complètes dans audits_territoire
// -----------------------------------------------------------------------------
await tester("20. Vérification que chaque mutation a généré un audit immuable complet", async () => {
  const audits = await obtenirHistoriqueAuditsTerritoire(db, 50, 0);
  assert.ok(audits.total >= 8);
  const actions = audits.elements.map(a => a.action);
  assert.ok(actions.includes("CREATION"));
  assert.ok(actions.includes("MODIFICATION"));
  assert.ok(actions.includes("VALIDATION"));
  assert.ok(actions.includes("MODIFICATION_RATTACHEMENT"));
  assert.ok(actions.includes("FUSION"));
  assert.ok(actions.includes("ARCHIVAGE"));
  assert.ok(actions.includes("SUPPRESSION"));
});

// -----------------------------------------------------------------------------
// TEST 21 : Refus HTTP 403 pour rôle non PROPRIETAIRE
// -----------------------------------------------------------------------------
await tester("21. Refus strict d'accès (HTTP 403) aux mutations pour rôle non PROPRIETAIRE", async () => {
  await assert.rejects(
    async () => {
      await ajouterUniteTerritoriale(
        db,
        sessionDelegue,
        { type: "VILLAGE", nom: "Village Non Autorisé", province_id: "prov-batha", departement_id: depCreeId, source_officielle: "Test" },
        "127.0.0.1"
      );
    },
    /Action réservée au rôle PROPRIETAIRE/i
  );
  await assert.rejects(
    async () => {
      await archiverUniteTerritoriale(
        db,
        sessionAdminCentral,
        "VILLAGE",
        villageId1,
        "Archivage non autorisé",
        "127.0.0.1"
      );
    },
    /Action réservée au rôle PROPRIETAIRE/i
  );
});

// -----------------------------------------------------------------------------
// TEST 22 : Tableau de bord reflétant les comptes réels
// -----------------------------------------------------------------------------
await tester("22. Tableau de bord territorial avec agrégats réels", async () => {
  const tb = await obtenirTableauDeBordTerritorial(db);
  assert.equal(tb.provinces, 23, "23 provinces");
  assert.ok(tb.departements >= 112, "Départements >= 112");
  assert.ok(tb.validees > 0, "Unités validées dénombrées");
  assert.ok(tb.en_attente >= 0, "Unités en attente dénombrées");
});

// -----------------------------------------------------------------------------
// TEST 23 : Ciblage de ménages dans les 4 contextes territoriaux
// -----------------------------------------------------------------------------
await tester("23. Inscription et ciblage de ménages dans les 4 milieux territoriaux", async () => {
  // 1. N'Djamena Quartier (régime urbain spécial sans département)
  const m1 = crypto.randomUUID();
  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, localite_id, arrondissement_id, quartier_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
    VALUES (?, 'MEN-NDJ-2026-001', 'prov-ndjamena', 'loc-ndjamena-ville', 'arr-ndj-1', ?, 'cat-pop-autochtone', 'Ménage N''Djamena', 'F', 6, 'VULN_URBAIN', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))
  `).run(m1, quartierNdjId);

  // 2. Ville ordinaire
  const m2 = crypto.randomUUID();
  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
    VALUES (?, 'MEN-VILLE-2026-001', 'prov-batha', ?, ?, 'cat-pop-autochtone', 'Ménage Ville Batha', 'M', 4, 'VULN_VILLE', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))
  `).run(m2, depCreeId, villeCreeId);

  // 3. Village rural
  const m3 = crypto.randomUUID();
  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
    VALUES (?, 'MEN-VILL-2026-001', 'prov-batha', ?, ?, 'cat-pop-autochtone', 'Ménage Village Am-Djoum', 'M', 8, 'VULN_RURAL', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))
  `).run(m3, autreDepBatha.id, villageId1);

  // 4. Ferrick nomade (valider d'abord le statut pour le trigger de conformité)
  const fValide = await ajouterUniteTerritoriale(
    db, sessionProprietaire,
    { type: "FERRICK", nom: "Ferrick Pastoral Valide", province_id: "prov-batha", departement_id: depCreeId, source_officielle: "Enquête 2026", statut_validation: "VALIDE" },
    "127.0.0.1"
  );
  const m4 = crypto.randomUUID();
  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, categorie_population_id, nom_chef_menage, sexe_chef, nombre_personnes, criteres_vulnerabilite, statut, statut_validation, date_enregistrement, cree_par, cree_le)
    VALUES (?, 'MEN-FERR-2026-001', 'prov-batha', ?, ?, 'cat-pop-autochtone', 'Ménage Ferrick Nomade', 'M', 7, 'VULN_NOMADE', 'ACTIF', 'VALIDE', date('now'), 'usr-proprietaire', datetime('now'))
  `).run(m4, depCreeId, fValide.id);

  const totalMenagesBatha = dbSync.prepare("SELECT count(*) as c FROM menages WHERE province_id = 'prov-batha'").get();
  assert.ok(totalMenagesBatha.c >= 3);
});

// -----------------------------------------------------------------------------
// TEST 24 : Gouvernance des opérations centrales (distinction cadre général vs approbation opérationnelle, anti-recyclage)
// -----------------------------------------------------------------------------
await tester("24. Contrôle gouvernance : rejet Arrêté 0033 seul, anti-recyclage d'acte, approbation dédiée", async () => {
  // Créer une opération centrale de test
  const opId1 = crypto.randomUUID();
  const opId2 = crypto.randomUUID();
  dbSync.prepare(`
    INSERT INTO operations_centrales_distribution (
      id, code_operation, intitule, type_intervention, annee_campagne, statut, cree_par
    ) VALUES 
      (?, 'OPC-2026-GOV1', 'Opération Test Gouvernance 1', 'DISTRIBUTION_GRATUITE_VIVRES', '2026', 'SOUMISE_A_APPROBATION', 'usr-central'),
      (?, 'OPC-2026-GOV2', 'Opération Test Gouvernance 2', 'DISTRIBUTION_GRATUITE_VIVRES', '2026', 'SOUMISE_A_APPROBATION', 'usr-central')
  `).run(opId1, opId2);

  // Attacher une province ciblée à opId1
  dbSync.prepare("INSERT INTO operations_centrales_provinces (id, operation_id, province_id) VALUES (?, ?, 'prov-batha')").run(crypto.randomUUID(), opId1);

  // Cas 24.A : Enregistrer uniquement la référence cadre réglementaire (Arrêté 0033)
  await enregistrerApprobation(
    db,
    sessionAdminCentral,
    opId1,
    {
      type_approbation: "REFERENCE_CADRE_REGLEMENTAIRE",
      instance_decisionnaire: "MASSNAH",
      reference_acte: "Arrêté n°0033/PR/PM/MASSNAH/SG/2026",
      date_decision: "2026-10-07",
      signataire_nom: "Ministre de l'Action Sociale",
      signataire_qualite: "Ministre",
      decision: "APPROUVE",
    },
    "idemp-cadre-reglementaire-001",
    "127.0.0.1"
  );

  // Tentative de passer au statut APPROUVEE avec SEULEMENT le cadre général : DOIT ÉCHOUER (HTTP 400) !
  await assert.rejects(
    async () => {
      await changerStatutOperationCentrale(
        db,
        sessionAdminCentral,
        opId1,
        {
          nouveau_statut: "APPROUVEE",
          motif_ou_commentaire: "Tentative d'approbation sans décision opérationnelle",
        },
        "idemp-tentative-approbation-rejetee",
        "127.0.0.1"
      );
    },
    /Arrêté 0033.*ne constitue pas une décision d'approbation opérationnelle|Comité de pilotage/i
  );

  // Cas 24.B : Enregistrer une vraie décision opérationnelle pour opId1
  await enregistrerApprobation(
    db,
    sessionAdminCentral,
    opId1,
    {
      type_approbation: "APPROBATION_COMITE_PILOTAGE",
      instance_decisionnaire: "Comité National de Pilotage",
      reference_acte: "DEC-PILOTAGE-2026-001",
      date_decision: "2026-10-15",
      signataire_nom: "Président du Comité de Pilotage",
      signataire_qualite: "Président",
      decision: "APPROUVE",
    },
    "idemp-decision-pilotage-001",
    "127.0.0.1"
  );

  // Transition vers APPROUVEE : DOIT RÉUSSIR !
  const transitionReussie = await changerStatutOperationCentrale(
    db,
    sessionAdminCentral,
    opId1,
    {
      nouveau_statut: "APPROUVEE",
      motif_ou_commentaire: "Approbation formelle par le Comité de pilotage",
    },
    "idemp-transition-approuvee-valide",
    "127.0.0.1"
  );
  assert.ok(transitionReussie);
  const opVerif = dbSync.prepare("SELECT statut FROM operations_centrales_distribution WHERE id = ?").get(opId1);
  assert.equal(opVerif.statut, "APPROUVEE");

  // Cas 24.C : Anti-recyclage d'acte. Tentative d'utiliser le même numéro d'acte "DEC-PILOTAGE-2026-001" sur opId2 : DOIT ÉCHOUER (HTTP 409) !
  await assert.rejects(
    async () => {
      await enregistrerApprobation(
        db,
        sessionAdminCentral,
        opId2,
        {
          type_approbation: "APPROBATION_COMITE_PILOTAGE",
          instance_decisionnaire: "Comité de Pilotage",
          reference_acte: "DEC-PILOTAGE-2026-001",
          date_decision: "2026-10-16",
          signataire_nom: "Président",
          signataire_qualite: "Président",
          decision: "APPROUVE",
        },
        "idemp-acte-recycle-invalide",
        "127.0.0.1"
      );
    },
    /a déjà été enregistrée pour l'opération OPC-2026-GOV1/i
  );
});

// -----------------------------------------------------------------------------
// TEST 25 : Activation opérationnelle des 112 départements (Décision Propriétaire)
// -----------------------------------------------------------------------------
await tester("25. Activation opérationnelle des 112 départements (80 certifiés / 32 candidats)", async () => {
  const stats = await obtenirTableauDeBordTerritorial(db);
  // Doit comptabiliser les 112 départements de base + celui créé au test 1
  assert.ok(stats.departements >= 112, "Au moins 112 départements");
  assert.ok(stats.departements_actifs >= 112, "Au moins 112 départements actifs");
  assert.ok(stats.departements_certifies >= 80, "Au moins 80 départements certifiés officiels");
  assert.ok(stats.departements_non_certifies >= 32, "Au moins 32 départements candidats opérationnels");

  // Vérifier qu'aucun département initial n'est bloqué ou inactif
  const depsInactifs = dbSync.prepare("SELECT count(*) as c FROM departements WHERE statut_operationnel != 'ACTIF' OR statut_validation != 'VALIDE'").get();
  assert.equal(depsInactifs.c, 0, "0 département inactif ou non valide");

  // Vérifier l'échantillon candidat Barh El Gazel Kléta
  const kleta = dbSync.prepare("SELECT nom, statut_operationnel, certification_juridique, active_par_proprietaire FROM departements WHERE id = 'dep-barh-el-gazel-kleta'").get();
  assert.ok(kleta, "Kléta trouvé");
  assert.equal(kleta.statut_operationnel, "ACTIF");
  assert.equal(kleta.certification_juridique, "NON_CERTIFIE");
  assert.equal(kleta.active_par_proprietaire, 1);
});

// -----------------------------------------------------------------------------
// TEST 26 : Réactivation d'une unité archivée
// -----------------------------------------------------------------------------
await tester("26. Réactivation administrative d'une unité archivée et audit associé", async () => {
  // ferrickId a été archivé au test 13
  const reactiv = await reactiverUniteTerritoriale(
    db,
    sessionProprietaire,
    "FERRICK",
    ferrickId,
    "Retour des éleveurs nomades sur le site de campement",
    "127.0.0.1"
  );
  assert.equal(reactiv.id, ferrickId);
  assert.equal(reactiv.statut_validation, "VALIDE");

  const row = dbSync.prepare("SELECT statut_validation FROM localites WHERE id = ?").get(ferrickId);
  assert.equal(row.statut_validation, "VALIDE", "L'unité est revenue au statut VALIDE");

  // Vérifier la présence de l'audit REACTIVATION
  const auditReactiv = dbSync.prepare("SELECT action, motif FROM audits_territoire WHERE entite_id = ? AND action = 'REACTIVATION'").get(ferrickId);
  assert.ok(auditReactiv, "Entrée d'audit REACTIVATION trouvée");
  assert.equal(auditReactiv.action, "REACTIVATION");
});

// -----------------------------------------------------------------------------
// TEST 27 : Modification et renommage d'unités de différents types
// -----------------------------------------------------------------------------
await tester("27. Renommage et modification d'unités territoriales (Quartier, Arrondissement)", async () => {
  // Renommer le quartier N'Djamena créé au test 6
  const modifQuartier = await modifierUniteTerritoriale(
    db,
    sessionProprietaire,
    "QUARTIER",
    quartierNdjId,
    {
      nom: "Quartier Test Farcha Nord Renommé",
      source_officielle: "Arrêté municipal modificatif 2026",
      motif: "Rectification toponymique officielle",
    },
    "127.0.0.1"
  );
  assert.equal(modifQuartier.id, quartierNdjId);

  const qRow = dbSync.prepare("SELECT nom FROM quartiers WHERE id = ?").get(quartierNdjId);
  assert.equal(qRow.nom, "Quartier Test Farcha Nord Renommé");

  // Renommer une sous-préfecture
  const modifSp = await modifierUniteTerritoriale(
    db,
    sessionProprietaire,
    "SOUS_PREFECTURE",
    spCreeId,
    {
      nom: "Sous-Préfecture Centrale de Test",
      code: "SP-TEST-CENTRE",
      motif: "Précision administrative du code et du nom",
    },
    "127.0.0.1"
  );
  assert.equal(modifSp.id, spCreeId);

  const spRow = dbSync.prepare("SELECT nom, code FROM sous_prefectures WHERE id = ?").get(spCreeId);
  assert.equal(spRow.nom, "Sous-Préfecture Centrale de Test");
  assert.equal(spRow.code, "SP-TEST-CENTRE");
});

// -----------------------------------------------------------------------------
// TEST 28 : Création et modification sans référence juridique ni source obligatoire
// -----------------------------------------------------------------------------
let villageSansDecretId;
await tester("28. Création et modification opérationnelle sans référence juridique ni source obligatoire", async () => {
  const cree = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLAGE",
      nom: "Village Opérationnel Sans Décret",
      province_id: "prov-batha",
      departement_id: "dep-batha-batha-ouest",
    },
    "127.0.0.1"
  );
  assert.ok(cree.id);
  villageSansDecretId = cree.id;
  assert.equal(cree.nom, "Village Opérationnel Sans Décret");
  assert.equal(cree.statut_validation, "VALIDE");

  const rowInitial = dbSync.prepare("SELECT nom, source_documentation FROM localites WHERE id = ?").get(villageSansDecretId);
  assert.equal(rowInitial.source_documentation, "Saisie administrative propriétaire");

  // Modification sans référence juridique ni source obligatoire
  const modif = await modifierUniteTerritoriale(
    db,
    sessionProprietaire,
    "VILLAGE",
    villageSansDecretId,
    {
      nom: "Village Opérationnel Sans Décret Modifié",
      motif: "Mise à jour rapide du toponyme sans formalisme juridique",
    },
    "127.0.0.1"
  );
  assert.equal(modif.nom, "Village Opérationnel Sans Décret Modifié");

  const row = dbSync.prepare("SELECT nom, source_documentation FROM localites WHERE id = ?").get(villageSansDecretId);
  assert.equal(row.nom, "Village Opérationnel Sans Décret Modifié");
});

// -----------------------------------------------------------------------------
// TEST 29 : Subdivisions fines BLOC et SECTEUR sans aucune présence de Hara
// -----------------------------------------------------------------------------
let blocId;
let secteurId;
await tester("29. Création et consultation des subdivisions BLOC et SECTEUR (sans Hara)", async () => {
  // Création d'un Bloc
  const bloc = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "BLOC",
      nom: "Bloc Urbain 12 Farcha",
      quartier_id: quartierNdjId,
      code: "BLC-12",
    },
    "127.0.0.1"
  );
  assert.ok(bloc.id);
  blocId = bloc.id;
  assert.equal(bloc.type, "BLOC");

  // Création d'un Secteur
  const secteur = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "SECTEUR",
      nom: "Secteur Humanitaire Nord",
      quartier_id: quartierNdjId,
      code: "SEC-NORD",
    },
    "127.0.0.1"
  );
  assert.ok(secteur.id);
  secteurId = secteur.id;
  assert.equal(secteur.type, "SECTEUR");

  // Vérification de la persistance dans `carres` avec le type de subdivision correct
  const rowBloc = dbSync.prepare("SELECT type_subdivision, code_ou_nom FROM carres WHERE id = ?").get(blocId);
  assert.equal(rowBloc.type_subdivision, "BLOC");
  assert.equal(rowBloc.code_ou_nom, "Bloc Urbain 12 Farcha");

  const rowSec = dbSync.prepare("SELECT type_subdivision, code_ou_nom FROM carres WHERE id = ?").get(secteurId);
  assert.equal(rowSec.type_subdivision, "SECTEUR");
  assert.equal(rowSec.code_ou_nom, "Secteur Humanitaire Nord");

  // Recherche par type
  const resBloc = await rechercherUnitesTerritoriales(db, { type: "BLOC", limite: 10 });
  assert.ok(resBloc.elements.some((el) => el.id === blocId));

  const resSec = await rechercherUnitesTerritoriales(db, { type: "SECTEUR", limite: 10 });
  assert.ok(resSec.elements.some((el) => el.id === secteurId));

  // Vérifier qu'aucune table ne contient d'unité dénommée ou typée "Hara"
  const checkHara = dbSync.prepare("SELECT count(*) as c FROM carres WHERE code_ou_nom LIKE '%Hara%' OR type_subdivision LIKE '%HARA%'").get();
  assert.equal(checkHara.c, 0, "Aucun enregistrement Hara dans carres");
});

// -----------------------------------------------------------------------------
// TEST 30 : Simulation approfondie et exécution sécurisée d'une fusion
// -----------------------------------------------------------------------------
await tester("30. Simulation de fusion avec détection de doublons de ménages et audit de fil d'Ariane", async () => {
  // Créer deux villages dans le même département
  const v1 = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLAGE",
      nom: "Village Test Fusion Source",
      province_id: "prov-batha",
      departement_id: "dep-batha-batha-ouest",
    },
    "127.0.0.1"
  );
  const v2 = await ajouterUniteTerritoriale(
    db,
    sessionProprietaire,
    {
      type: "VILLAGE",
      nom: "Village Test Fusion Cible",
      province_id: "prov-batha",
      departement_id: "dep-batha-batha-ouest",
    },
    "127.0.0.1"
  );

  // Insérer des ménages tests avec un chef de famille homonyme
  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id, date_enregistrement, statut, cree_par, cree_le)
    VALUES ('men-fus-1', 'MEN-FUS-1', 'prov-batha', 'dep-batha-batha-ouest', ?, 'Hassan Mahamat', 'M', 6, 'cat-pop-autochtone', '2026-10-25', 'ACTIF', 'usr-proprietaire', datetime('now'))
  `).run(v1.id);

  dbSync.prepare(`
    INSERT INTO menages (id, code_menage, province_id, departement_id, localite_id, nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id, date_enregistrement, statut, cree_par, cree_le)
    VALUES ('men-fus-2', 'MEN-FUS-2', 'prov-batha', 'dep-batha-batha-ouest', ?, 'Hassan Mahamat', 'M', 4, 'cat-pop-autochtone', '2026-10-25', 'ACTIF', 'usr-proprietaire', datetime('now'))
  `).run(v2.id);

  // Simuler la fusion
  const sim = await simulerFusionUnites(
    db,
    "VILLAGE",
    v2.id,
    v1.id,
    "Fusion de deux sections d'un même village",
    "Rapport territorial 2026"
  );

  assert.equal(sim.fusion_autorisee, true);
  assert.ok(sim.rattachement_source, "Fil d'Ariane source renseigné");
  assert.ok(sim.rattachement_cible, "Fil d'Ariane cible renseigné");
  assert.equal(sim.menages_concernes, 1);
  assert.ok(sim.avertissements?.some((a) => a.includes("même nom de chef de ménage")), "Détection du doublon toponymique de ménage 'Hassan Mahamat'");

  // Exécuter la fusion
  const exec = await executerFusionUnites(
    db,
    sessionProprietaire,
    "VILLAGE",
    v2.id,
    v1.id,
    "Fusion confirmée après contrôle contradictoire",
    "Rapport de fusion vérifié",
    "127.0.0.1"
  );
  assert.equal(exec.principale_id, v2.id);
  assert.equal(exec.doublon_id, v1.id);

  // Vérifier la correspondance de fusion
  const corr = dbSync.prepare("SELECT * FROM correspondances_fusions_territoriales WHERE ancien_id = ?").get(v1.id);
  assert.ok(corr);
  assert.equal(corr.nouveau_id, v2.id);
});

// -----------------------------------------------------------------------------
// TEST 31 : Exportation XLSX binaire et réimportation par décompression OpenXML
// -----------------------------------------------------------------------------
await tester("31. Exportation binaire XLSX et prévisualisation d'un classeur Excel", async () => {
  const xlsxBuffer = await exporterTerritoireXlsx(db, "DEPARTEMENT");
  assert.ok(xlsxBuffer instanceof Uint8Array, "Retourne un Uint8Array");
  assert.ok(xlsxBuffer.length > 500, "Taille supérieure à 500 octets");
  // Signature PK\x03\x04 (ZIP standard pour OpenXML .xlsx)
  assert.equal(xlsxBuffer[0], 0x50);
  assert.equal(xlsxBuffer[1], 0x4B);
  assert.equal(xlsxBuffer[2], 0x03);
  assert.equal(xlsxBuffer[3], 0x04);

  // Prévisualisation du buffer Excel
  const preview = await previsualiserImportTerritoireFichier(db, xlsxBuffer, "export_departements.xlsx");
  assert.ok(preview.lignes_valides.length >= 112, "Contient au moins 112 départements valides extraits du fichier Excel");
});

// -----------------------------------------------------------------------------
// TEST 32 : Filtrage multi-critères du journal d'audit territorial
// -----------------------------------------------------------------------------
await tester("32. Consultation filtrée de l'audit territorial (par type et action)", async () => {
  const auditsBloc = await obtenirHistoriqueAuditsTerritoire(db, {
    type: "BLOC",
    action: "CREATION",
    limite: 10,
  });
  assert.ok(auditsBloc.elements.length >= 1, "Audit de création de bloc trouvé");
  for (const aud of auditsBloc.elements) {
    assert.equal(aud.entite_type, "BLOC");
    assert.equal(aud.action, "CREATION");
  }
});

// -----------------------------------------------------------------------------
// TEST 33 : Herméticité des autorisations (rejet HTTP 403 pour Délégué Provincial)
// -----------------------------------------------------------------------------
await tester("33. Rejet strict HTTP 403 pour un utilisateur non propriétaire (Délégué Provincial)", async () => {
  const sessionDelegue = {
    id: "usr-delegue-ouaddai",
    identifiant: "delegue_ouaddai",
    role: "DELEGUE_PROVINCIAL",
    nom_complet: "Délégué Provincial Ouaddaï",
    province_id: "prov-ouaddai",
  };

  // Tentative d'ajout
  await assert.rejects(
    async () => {
      await ajouterUniteTerritoriale(
        db,
        sessionDelegue,
        {
          type: "VILLAGE",
          nom: "Village Illégal Délégué",
          province_id: "prov-ouaddai",
          departement_id: "dep-ouaddai-nord",
        },
        "127.0.0.1"
      );
    },
    (err) => {
      assert.ok(err instanceof ErreurAdministrationTerritoriale);
      assert.equal(err.statutHttp, 403);
      return true;
    }
  );

  // Tentative de suppression
  await assert.rejects(
    async () => {
      await supprimerUniteTerritoriale(db, sessionDelegue, "VILLAGE", villageSansDecretId, "127.0.0.1");
    },
    (err) => {
      assert.ok(err instanceof ErreurAdministrationTerritoriale);
      assert.equal(err.statutHttp, 403);
      return true;
    }
  );

  // Tentative de fusion
  await assert.rejects(
    async () => {
      await executerFusionUnites(
        db,
        sessionDelegue,
        "VILLAGE",
        "v-cible",
        "v-source",
        "Motif",
        "Justif",
        "127.0.0.1"
      );
    },
    (err) => {
      assert.ok(err instanceof ErreurAdministrationTerritoriale);
      assert.equal(err.statutHttp, 403);
      return true;
    }
  );
});

console.log("================================================================================");
console.log(`RÉSULTAT GLOBAL : ${testsPasses} / ${testsPasses + testsEchoues} tests passés.`);
if (testsEchoues > 0) {
  console.error(`ÉCHEC : ${testsEchoues} tests ont échoué.`);
  process.exit(1);
} else {
  console.log("SUCCÈS INTÉGRAL : Tous les 33 tests de référence, gouvernance et administration territoriale ont réussi !");
}

dbSync.close();
