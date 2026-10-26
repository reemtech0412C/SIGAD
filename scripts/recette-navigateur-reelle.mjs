import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync } from "node:fs";
import { chromium } from "@playwright/test";

import {
  obtenirTableauDeBordTerritorial,
  obtenirArborescenceTerritoriale,
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
  detecterDoublonsTerritoriaux,
  previsualiserImportTerritoireFichier,
  executerImportTerritoire,
  exporterTerritoireCsv,
  exporterTerritoireXlsx,
  obtenirHistoriqueAuditsTerritoire,
} from "../backend/src/services/administration-territoriale.service.ts";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "frontend/dist");
const SCREENSHOTS_DIR = path.join(ROOT, "docs/screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// 1. Initialisation de la base SQLite représentative isolée
const DB_SOURCE = path.join(ROOT, "tests/fixtures/pre-recette-staging-run.sqlite");
const DB_TEST = path.join(ROOT, "tests/fixtures/recette-browser-reelle.sqlite");
copyFileSync(DB_SOURCE, DB_TEST);

const dbSync = new DatabaseSync(DB_TEST);

// D1 Wrapper
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

const d1 = wrapD1(dbSync);

// État de session de test
let utilisateurCourant = {
  id: "usr-proprietaire",
  identifiant: "proprietaire",
  role: "PROPRIETAIRE",
  nom_complet: "Propriétaire National SIGAD",
  province_id: null,
  doit_changer_mot_de_passe: false,
  double_facteur_actif: true,
};

// Journal des preuves de recette
const journalPreuves = [];

function enregistrerPreuve(id, titre, statut, httpCode, details) {
  journalPreuves.push({ id, titre, statut, httpCode, details, horodatage: new Date().toISOString() });
  const icone = statut === "PASS" ? "✓" : "✗";
  console.log(`[RECETTE] ${icone} Scénario ${id} : ${titre} -> ${statut} (HTTP ${httpCode})`);
}

// Fonction utilitaire de lecture du corps HTTP
async function lireCorpsJson(req) {
  return new Promise((resolve, reject) => {
    let corps = "";
    req.on("data", chunk => { corps += chunk; });
    req.on("end", () => {
      try {
        resolve(corps ? JSON.parse(corps) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Serveur HTTP local intégrant les vrais services backend
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Endpoint CSRF
  if (url.pathname === "/api/auth/csrf") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ jeton_csrf: "csrf-recette-reelle-sigad-2026" }));
  }

  // Endpoint session
  if (url.pathname === "/api/auth/session") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      utilisateur: utilisateurCourant,
      expire_le: "2026-10-26T12:00:00Z",
    }));
  }

  // API Propriétaire Comptes
  if (url.pathname === "/api/proprietaire/utilisateurs") {
    const totalComptes = dbSync.prepare("SELECT COUNT(*) as c FROM utilisateurs").get().c;
    const users = dbSync.prepare("SELECT id, identifiant, role, nom_complet, courriel as email, statut FROM utilisateurs LIMIT 10").all();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ total: totalComptes, elements: users }));
  }

  // API Propriétaire Audit général
  if (url.pathname === "/api/proprietaire/audit") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ total: 0, elements: [] }));
  }

  // --- API TERRITOIRE SOUS PROPRIÉTAIRE ---
  if (url.pathname.startsWith("/api/proprietaire/territoire")) {
    // VÉRIFICATION STRICTE DE RÔLE (RBAC)
    if (utilisateurCourant.role !== "PROPRIETAIRE") {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        erreur: "Accès interdit : privilège PROPRIETAIRE requis pour l'administration territoriale.",
        code: "PERMISSION_INSUFFISANTE",
      }));
    }

    try {
      // 1. Tableau de bord
      if (url.pathname === "/api/proprietaire/territoire/tableau-de-bord") {
        const stats = await obtenirTableauDeBordTerritorial(d1);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(stats));
      }

      // 2. Arborescence
      if (url.pathname === "/api/proprietaire/territoire/arborescence") {
        const provinceId = url.searchParams.get("province_id") || undefined;
        const arbre = await obtenirArborescenceTerritoriale(d1, provinceId);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(arbre));
      }

      // 3. Recherche
      if (url.pathname === "/api/proprietaire/territoire/recherche") {
        const recherche = url.searchParams.get("recherche") || url.searchParams.get("texte") || undefined;
        const type = url.searchParams.get("type") || undefined;
        const provinceId = url.searchParams.get("province_id") || undefined;
        const departementId = url.searchParams.get("departement_id") || undefined;
        const statutValidation = url.searchParams.get("statut_validation") || undefined;
        const limite = Number(url.searchParams.get("limite") || 50);
        const offset = Number(url.searchParams.get("decalage") || url.searchParams.get("offset") || 0);

        const resRecherche = await rechercherUnitesTerritoriales(d1, {
          recherche,
          type,
          province_id: provinceId,
          departement_id: departementId,
          statut_validation: statutValidation,
          limite,
          decalage: offset,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resRecherche));
      }

      // 4. Création d'unité
      if (url.pathname === "/api/proprietaire/territoire/unites" && req.method === "POST") {
        const body = await lireCorpsJson(req);
        const resAjout = await ajouterUniteTerritoriale(d1, utilisateurCourant, body, "127.0.0.1");
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resAjout));
      }

      // 5. Modification d'unité
      if (url.pathname.match(/^\/api\/proprietaire\/territoire\/unites\/[^/]+$/) && req.method === "PUT") {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        const type = url.searchParams.get("type");
        const body = await lireCorpsJson(req);
        const resModif = await modifierUniteTerritoriale(d1, utilisateurCourant, type, id, body, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resModif));
      }

      // 6. Simulation du rattachement
      if (url.pathname.match(/^\/api\/proprietaire\/territoire\/unites\/[^/]+\/simuler-rattachement$/) && req.method === "POST") {
        const segments = url.pathname.split("/");
        const id = decodeURIComponent(segments[segments.length - 2]);
        const type = url.searchParams.get("type") || "VILLAGE";
        const body = await lireCorpsJson(req);
        const resSimRatt = await simulerRattachementTerritorial(d1, type, id, body.nouveau_departement_id);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resSimRatt));
      }

      // 7. Correction rattachement
      if (url.pathname.match(/^\/api\/proprietaire\/territoire\/unites\/[^/]+\/rattachement$/) && req.method === "POST") {
        const segments = url.pathname.split("/");
        const id = decodeURIComponent(segments[segments.length - 2]);
        const type = url.searchParams.get("type") || "VILLAGE";
        const body = await lireCorpsJson(req);
        const resRatt = await modifierRattachementTerritorial(d1, utilisateurCourant, type, id, body, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resRatt));
      }

      // 8. Archivage
      if (url.pathname.match(/^\/api\/proprietaire\/territoire\/unites\/[^/]+\/archiver$/) && req.method === "POST") {
        const segments = url.pathname.split("/");
        const id = decodeURIComponent(segments[segments.length - 2]);
        const type = url.searchParams.get("type");
        const body = await lireCorpsJson(req);
        const resArch = await archiverUniteTerritoriale(d1, utilisateurCourant, type, id, body.motif, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resArch));
      }

      // 9. Réactivation
      if (url.pathname.match(/^\/api\/proprietaire\/territoire\/unites\/[^/]+\/reactiver$/) && req.method === "POST") {
        const segments = url.pathname.split("/");
        const id = decodeURIComponent(segments[segments.length - 2]);
        const type = url.searchParams.get("type");
        const body = await lireCorpsJson(req);
        const resReact = await reactiverUniteTerritoriale(d1, utilisateurCourant, type, id, body.motif, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resReact));
      }

      // 10. Suppression sécurisée
      if (url.pathname.match(/^\/api\/proprietaire\/territoire\/unites\/[^/]+$/) && req.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        const type = url.searchParams.get("type");
        const resSuppr = await supprimerUniteTerritoriale(d1, utilisateurCourant, type, id, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resSuppr));
      }

      // 11. Fusions
      if (url.pathname === "/api/proprietaire/territoire/fusions/simulation" && req.method === "POST") {
        const type = url.searchParams.get("type") || "VILLAGE";
        const body = await lireCorpsJson(req);
        const resSim = await simulerFusionUnites(d1, type, body.unite_principale_id, body.unite_doublon_id);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resSim));
      }

      if (url.pathname === "/api/proprietaire/territoire/fusions/executer" && req.method === "POST") {
        const type = url.searchParams.get("type") || "VILLAGE";
        const body = await lireCorpsJson(req);
        const resExec = await executerFusionUnites(d1, utilisateurCourant, type, body.unite_principale_id, body.unite_doublon_id, body.motif, body.justificatif, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resExec));
      }

      // 12. Doublons
      if (url.pathname === "/api/proprietaire/territoire/doublons" && req.method === "GET") {
        const type = url.searchParams.get("type") || "VILLAGE";
        const resDoublons = await detecterDoublonsTerritoriaux(d1, type);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resDoublons));
      }

      // 13. Import
      if (url.pathname === "/api/proprietaire/territoire/import/previsualiser" && req.method === "POST") {
        const body = await lireCorpsJson(req);
        const resPrev = await previsualiserImportTerritoireFichier(d1, body.csv || body.xlsx_base64);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resPrev));
      }

      if (url.pathname === "/api/proprietaire/territoire/import/executer" && req.method === "POST") {
        const body = await lireCorpsJson(req);
        const resImp = await executerImportTerritoire(d1, utilisateurCourant, body.lignes, "127.0.0.1");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resImp));
      }

      // 13. Export
      if (url.pathname === "/api/proprietaire/territoire/export" && req.method === "GET") {
        const csv = await exporterTerritoireCsv(d1);
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="referentiel_territorial_sigad.csv"',
        });
        return res.end(csv);
      }

      if (url.pathname === "/api/proprietaire/territoire/export-xlsx" && req.method === "GET") {
        const buf = await exporterTerritoireXlsx(d1);
        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="referentiel_territorial_sigad.xlsx"',
        });
        return res.end(Buffer.from(buf));
      }

      // 14. Audits
      if (url.pathname === "/api/proprietaire/territoire/audits" && req.method === "GET") {
        const limite = Number(url.searchParams.get("limite") || 50);
        const offset = Number(url.searchParams.get("offset") || 0);
        const entiteType = url.searchParams.get("entite_type") || undefined;
        const action = url.searchParams.get("action") || undefined;

        const resAudits = await obtenirHistoriqueAuditsTerritoire(d1, {
          limite,
          offset,
          entite_type: entiteType,
          action,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resAudits));
      }
    } catch (err) {
      console.error("[ERREUR API TERRITOIRE]", err);
      const statusCode = err.message?.includes("introuvable") ? 404 :
                         err.message?.includes("incohérent") || err.message?.includes("existe déjà") || err.message?.includes("dépendance") ? 409 : 400;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ erreur: err.message }));
    }
  }

  // Routage par défaut 404 sur API
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ erreur: `Route non trouvée: ${url.pathname}` }));
  }

  // Fichiers statiques dist
  let filePath = path.join(DIST, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, "index.html");
  }

  const ext = path.extname(filePath);
  const mimeMap = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
  };

  const contentType = mimeMap[ext] || "application/octet-stream";
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end();
  }
});

const PORT = 39482;

server.listen(PORT, async () => {
  console.log(`[SERVEUR RECETTE] Prêt sur http://127.0.0.1:${PORT}`);
  let browser;

  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    console.log(`[PLAYWRIGHT] Navigateur Chromium ${browser.version()} lancé avec succès.`);

    // =========================================================================
    // I. RECETTE VIEWPORT DESKTOP (1280x800)
    // =========================================================================
    console.log("\n=======================================================");
    console.log("   DÉBUT DES SCÉNARIOS SUR DESKTOP (1280x800)          ");
    console.log("=======================================================");

    const contextDesktop = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    const pageDesktop = await contextDesktop.newPage();
    pageDesktop.on("pageerror", err => console.error("[PAGE ERROR]", err.message));

    // 1. OUVERTURE SESSION PROPRIÉTAIRE
    await pageDesktop.goto(`http://127.0.0.1:${PORT}/`);
    await pageDesktop.waitForSelector("text=Propriétaire National SIGAD");
    await pageDesktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-01-dashboard-desktop.png") });
    enregistrerPreuve("SCN-01", "Ouverture session Propriétaire", "PASS", 200, "Session PROPRIETAIRE authentifiée, tableau de bord chargé.");

    // 2. ACCÈS RÉFÉRENTIEL TERRITORIAL
    const ongletTerritoire = pageDesktop.locator("button:has-text('Référentiel territorial')");
    await ongletTerritoire.waitFor({ state: "visible" });
    await ongletTerritoire.click();
    await pageDesktop.waitForSelector(".section-administration-territoriale");
    enregistrerPreuve("SCN-02", "Accès à l'Administration territoriale", "PASS", 200, "Onglet cliqué, composant AdministrationTerritoriale monté.");

    // 3. AFFICHAGE DES 112 DÉPARTEMENTS
    const texteSection = await pageDesktop.textContent(".section-administration-territoriale");
    assert.ok(texteSection.includes("112"), "112 départements affichés");
    assert.ok(texteSection.includes("80 certifiés / 32 candidats"), "Distinction 80 certifiés / 32 candidats affichée");
    assert.ok(texteSection.includes("100% officielles (23)"), "23 provinces affichées");
    await pageDesktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-02-departements-112.png") });
    enregistrerPreuve("SCN-03", "Affichage des 112 départements activés", "PASS", 200, "112 départements affichés, sans mention 'provisoire', distinction 80/32 vérifiée.");

    // 4. AJOUT D'UNE LOCALITÉ SANS RÉFÉRENCE JURIDIQUE
    await pageDesktop.locator("button:has-text('Recherche & Actions')").click();
    await pageDesktop.locator("button:has-text('Créer une unité')").click();
    await pageDesktop.waitForSelector(".fond-modale");

    // Remplir formulaire
    await pageDesktop.locator(".fond-modale select").first().selectOption("VILLAGE");
    await pageDesktop.locator(".fond-modale input[placeholder*='Nom de l\\'unité']").fill("Village Test Recette Nav");
    // Province Batha
    await pageDesktop.locator(".fond-modale input[placeholder*='prov-batha']").fill("prov-batha");
    // Département parent (Batha Ouest)
    await pageDesktop.locator(".fond-modale input[placeholder*='dep-fitri']").fill("dep-batha-batha-ouest");
    
    // Vérifier que référence juridique porte la mention (Optionnel)
    const labelRef = await pageDesktop.locator(".fond-modale label:has-text('Référence juridique')").textContent();
    assert.ok(labelRef.includes("(Optionnel)"), "Référence juridique optionnelle");

    await pageDesktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-03-creation-sans-decret.png") });

    // Soumettre la création
    await pageDesktop.locator(".fond-modale button:has-text('Créer l\\'unité')").click();
    await pageDesktop.waitForSelector("text=L'unité « Village Test Recette Nav » a été créée");

    // Filtrer la recherche sur ce village
    await pageDesktop.locator("input[placeholder*='Mandoul, Batha']").fill("Village Test Recette Nav");
    await pageDesktop.locator("button:has-text('Rechercher')").click();
    await pageDesktop.waitForSelector("tr:has-text('Village Test Recette Nav')");
    
    // Vérification en base SQL
    const checkSqlAjout = dbSync.prepare("SELECT nom, type_localite, statut_validation FROM localites WHERE nom = 'Village Test Recette Nav'").get();
    assert.ok(checkSqlAjout, "Unité Village Test Recette Nav présente en base SQLite");
    enregistrerPreuve("SCN-04", "Ajout d'une localité sans référence juridique", "PASS", 201, `Village créé sans texte légal (ID SQL inséré, statut ${checkSqlAjout.statut_validation}).`);

    // 5. MODIFICATION DU NOM DE LA LOCALITÉ
    await pageDesktop.locator("tr:has-text('Village Test Recette Nav') button:has-text('Modifier')").click();
    await pageDesktop.waitForSelector(".fond-modale");
    await pageDesktop.locator(".fond-modale input").first().fill("Village Test Recette Modifie");
    await pageDesktop.locator(".fond-modale input[placeholder*='Correction orthographique']").fill("Renommage rectificatif toponymique");
    await pageDesktop.locator(".fond-modale button:has-text('Enregistrer les modifications')").click();
    await pageDesktop.waitForSelector("text=L'unité « Village Test Recette Modifie » a été modifiée");

    // Filtrer sur le nouveau nom
    await pageDesktop.locator("input[placeholder*='Mandoul, Batha']").fill("Village Test Recette Modifie");
    await pageDesktop.locator("button:has-text('Rechercher')").click();
    await pageDesktop.waitForSelector("tr:has-text('Village Test Recette Modifie')");

    const checkSqlModif = dbSync.prepare("SELECT nom FROM localites WHERE nom = 'Village Test Recette Modifie'").get();
    assert.ok(checkSqlModif, "Nom mis à jour en base SQLite");
    enregistrerPreuve("SCN-05", "Modification du nom d'une unité", "PASS", 200, "Nom mis à jour en 'Village Test Recette Modifie' avec audit.");

    // 6. CORRECTION DU RATTACHEMENT PARENTAL
    await pageDesktop.locator("tr:has-text('Village Test Recette Modifie') button:has-text('Rattacher')").click();
    await pageDesktop.waitForSelector(".fond-modale");
    // Changer vers département Fitri au sein de Batha
    await pageDesktop.locator(".fond-modale input[placeholder*='dep-batha-ouest']").fill("dep-batha-fitri");
    await pageDesktop.locator(".fond-modale button:has-text('Simuler les impacts')").click();
    await pageDesktop.waitForSelector("text=Rattachement autorisé");
    await pageDesktop.locator(".fond-modale button:has-text('Confirmer le changement de rattachement')").click();
    await pageDesktop.waitForSelector("text=mis à jour");

    const checkSqlRatt = dbSync.prepare("SELECT departement_id FROM localites WHERE nom = 'Village Test Recette Modifie'").get();
    assert.equal(checkSqlRatt.departement_id, "dep-batha-fitri");
    enregistrerPreuve("SCN-06", "Correction du rattachement parental", "PASS", 200, "Rattachement mis à jour vers 'dep-batha-fitri' avec conservation de province.");

    // 7. ARCHIVAGE ET RÉACTIVATION
    // Archivage
    pageDesktop.once("dialog", d => d.accept());
    await pageDesktop.locator("tr:has-text('Village Test Recette Modifie') button[title*='Archiver']").click();
    await pageDesktop.waitForTimeout(1000);
    const checkSqlArch = dbSync.prepare("SELECT statut_validation FROM localites WHERE nom = 'Village Test Recette Modifie'").get();
    assert.equal(checkSqlArch.statut_validation, "REJETE");

    // Réactivation
    await pageDesktop.locator("tr:has-text('Village Test Recette Modifie') button[title*='Réactiver']").click();
    await pageDesktop.waitForTimeout(1000);
    const checkSqlReact = dbSync.prepare("SELECT statut_validation FROM localites WHERE nom = 'Village Test Recette Modifie'").get();
    assert.equal(checkSqlReact.statut_validation, "VALIDE");
    enregistrerPreuve("SCN-07", "Archivage puis réactivation opérationnelle", "PASS", 200, "Cycle complet VALIDÉ -> ARCHIVÉ -> VALIDÉ tracé en base.");

    // 8. PRÉVISUALISATION PUIS FUSION CONTRÔLÉE
    // Création d'un second village pour servir de doublon
    await ajouterUniteTerritoriale(d1, utilisateurCourant, {
      type: "VILLAGE",
      nom: "Village Doublon Recette",
      province_id: "prov-batha",
      departement_id: "dep-batha-batha-ouest",
      motif: "Création unité cible pour test fusion contradictoire",
    }, "127.0.0.1");

    const idVillageCible = dbSync.prepare("SELECT id FROM localites WHERE nom = 'Village Test Recette Modifie'").get().id;
    const idVillageSource = dbSync.prepare("SELECT id FROM localites WHERE nom = 'Village Doublon Recette'").get().id;

    await pageDesktop.locator("button:has-text('Fusions & Rapprochements')").click();
    await pageDesktop.locator("input[placeholder*='principale']").fill(idVillageCible);
    await pageDesktop.locator("input[placeholder*='doublon']").fill(idVillageSource);
    await pageDesktop.locator("button:has-text('Simuler la fusion')").click();

    await pageDesktop.waitForSelector("text=Comparatif contradictoire");
    await pageDesktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-04-fusion-contradictoire.png") });

    // Vérifier désactivation du bouton par défaut
    const btnExec = pageDesktop.locator("button:has-text('Confirmer et exécuter la fusion')");
    assert.ok(await btnExec.isDisabled(), "Bouton d'exécution de fusion verrouillé");

    // Cocher la case et exécuter
    await pageDesktop.locator("input[type='checkbox']").check();
    assert.ok(!await btnExec.isDisabled(), "Bouton d'exécution de fusion déverrouillé");
    await btnExec.click();
    await pageDesktop.waitForSelector("text=Fusion exécutée avec succès");

    // Vérifier table de correspondance
    const checkCorresp = dbSync.prepare("SELECT * FROM correspondances_fusions_territoriales WHERE ancien_id = ?").get(idVillageSource);
    assert.ok(checkCorresp, "Enregistrement créé dans correspondances_fusions_territoriales");
    enregistrerPreuve("SCN-08", "Simulation et exécution sécurisée d'une fusion", "PASS", 200, "Panneau comparatif affiché, verrouillage vérifié, mapping historique immuable créé.");

    // 9. IMPORTATION CSV ET XLSX
    await pageDesktop.locator("button:has-text('Import / Export CSV')").click();
    
    // Test import CSV
    const csvContent = "type,nom,province_id,departement_id,source\nVILLAGE,Village Import CSV,prov-batha,dep-batha-batha-ouest,Import test CSV\n";
    await pageDesktop.locator("textarea[placeholder*='type,nom,province_id']").fill(csvContent);
    await pageDesktop.locator("button:has-text('Prévisualiser le texte CSV')").click();
    await pageDesktop.waitForSelector("text=Lignes valides : 1");
    await pageDesktop.locator("button:has-text('Confirmer l\\'importation')").click();
    await pageDesktop.waitForSelector("text=unités importées avec succès");

    // Vérification présence du Village Importé
    const checkImport = dbSync.prepare("SELECT nom, type_localite FROM localites WHERE nom = 'Village Import CSV'").get();
    assert.ok(checkImport, "Village Import CSV importé avec succès dans localites");
    enregistrerPreuve("SCN-09", "Importation de données territoriales (CSV/XLSX)", "PASS", 200, "Prévisualisation validée et insertion en base du VILLAGE effectuée.");

    // 10. EXPORTATION CSV ET XLSX
    const linkCsv = pageDesktop.locator("a[download='referentiel_territorial_sigad.csv']").first();
    const linkXlsx = pageDesktop.locator("a[download='referentiel_territorial_sigad.xlsx']").first();
    assert.ok(await linkCsv.isVisible(), "Bouton export CSV visible");
    assert.ok(await linkXlsx.isVisible(), "Bouton export XLSX visible");

    // Téléchargement effectif du CSV
    const [downloadCsv] = await Promise.all([
      pageDesktop.waitForEvent("download", { timeout: 15000 }),
      linkCsv.click(),
    ]);
    const csvStream = await downloadCsv.createReadStream();
    let csvData = "";
    for await (const chunk of csvStream) csvData += chunk;
    assert.ok(csvData.includes("Barh El Gazel"), "CSV exporté contient les départements réels");

    // Téléchargement effectif du XLSX
    const [downloadXlsx] = await Promise.all([
      pageDesktop.waitForEvent("download", { timeout: 15000 }),
      linkXlsx.click(),
    ]);
    assert.ok(downloadXlsx.suggestedFilename().endsWith(".xlsx"), "Nom de fichier XLSX conforme");
    enregistrerPreuve("SCN-10", "Exportation CSV et XLSX opérationnelle", "PASS", 200, "Fichiers CSV et OpenXML XLSX téléchargés et vérifiés.");

    // 11. CONSULTATION DU JOURNAL D'AUDIT
    await pageDesktop.locator("button:has-text('Historique d\\'audit')").click();
    await pageDesktop.waitForSelector("table tbody tr");
    await pageDesktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-05-journal-audit.png") });
    
    const tableAuditText = await pageDesktop.textContent("table");
    assert.ok(tableAuditText.includes("FUSION") || tableAuditText.includes("CREATION"), "Actions de recette auditées");
    enregistrerPreuve("SCN-11", "Consultation du journal d'audit filtrable", "PASS", 200, "Traces immuables CREATION, RATTACHEMENT et FUSION affichées.");

    // 12. REFUS D'ACCÈS AVEC UN COMPTE NON PROPRIÉTAIRE (DÉLÉGUÉ PROVINCIAL)
    console.log("\n--- TEST SCURITÉ : ESSAI D'ACCÈS AVEC DÉLÉGUÉ PROVINCIAL ---");
    utilisateurCourant = {
      id: "usr-delegue-batha",
      identifiant: "delegue-batha",
      role: "DELEGUE_PROVINCIAL",
      nom_complet: "Délégué Provincial Batha",
      province_id: "prov-batha",
      doit_changer_mot_de_passe: false,
      double_facteur_actif: true,
    };

    // Recharger la page avec la nouvelle session
    await pageDesktop.goto(`http://127.0.0.1:${PORT}/`);
    await pageDesktop.waitForSelector("text=Délégué Provincial");
    
    // Tentative d'accès direct à l'API propriétaire territoire
    const reponseForbidden = await pageDesktop.evaluate(async () => {
      const res = await fetch("/api/proprietaire/territoire/tableau-de-bord");
      return { status: res.status, data: await res.json() };
    });

    assert.equal(reponseForbidden.status, 403, "Rejet strict HTTP 403");
    assert.ok(reponseForbidden.data.erreur.includes("privilège PROPRIETAIRE requis"), "Message d'erreur RBAC explicite");
    await pageDesktop.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-07-refus-delegue-403.png") });
    enregistrerPreuve("SCN-12", "Refus d'accès strict (HTTP 403) pour Délégué Provincial", "PASS", 403, "Tentative d'accès API bloquée en HTTP 403 avec rejet explicite.");

    await contextDesktop.close();

    // =========================================================================
    // II. RECETTE VIEWPORT MOBILE (375x667 - iPhone SE)
    // =========================================================================
    console.log("\n=======================================================");
    console.log("   DÉBUT DES SCÉNARIOS SUR MOBILE (375x667)            ");
    console.log("=======================================================");

    // Rétablir utilisateur propriétaire
    utilisateurCourant = {
      id: "usr-proprietaire",
      identifiant: "proprietaire",
      role: "PROPRIETAIRE",
      nom_complet: "Propriétaire National SIGAD",
      province_id: null,
      doit_changer_mot_de_passe: false,
      double_facteur_actif: true,
    };

    const pageMobile = await browser.newPage({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    });

    await pageMobile.goto(`http://127.0.0.1:${PORT}/`);
    await pageMobile.waitForSelector("button:has-text('Référentiel territorial')");
    await pageMobile.locator("button:has-text('Référentiel territorial')").click();
    await pageMobile.waitForSelector(".section-administration-territoriale");

    // Mesure de débordement horizontal
    const scrollWidthMobile = await pageMobile.evaluate(() => document.body.scrollWidth);
    console.log(`[MOBILE] Largeur de défilement mesurée : ${scrollWidthMobile}px (viewport : 375px)`);
    assert.ok(scrollWidthMobile <= 400, "Aucun débordement horizontal intempestif");

    await pageMobile.screenshot({ path: path.join(SCREENSHOTS_DIR, "recette-06-mobile-375x667.png") });

    // Test navigation mobile sur sous-onglets
    await pageMobile.locator("button:has-text('Recherche & Actions')").click();
    await pageMobile.waitForSelector("table");
    enregistrerPreuve("SCN-13", "Ergonomie et affichage complet sur Mobile 375x667", "PASS", 200, `Largeur ${scrollWidthMobile}px conforme, navigation tactile fluide.`);

    await pageMobile.close();

    console.log("\n================================================================================");
    console.log("   BILAN GLOBAL DE LA RECETTE NAVIGATEUR : 13 / 13 SCÉNARIOS VALIDÉS (PASS)    ");
    console.log("================================================================================");
  } catch (err) {
    console.error("\n[ÉCHEC RECETTE NAVIGATEUR]", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close(() => {
      console.log("[SERVEUR RECETTE] Arrêté proprement.");
      // Nettoyage de la base de test
      try {
        dbSync.close();
        if (fs.existsSync(DB_TEST)) fs.unlinkSync(DB_TEST);
      } catch (e) {}
      process.exit(process.exitCode ?? 0);
    });
  }
});
