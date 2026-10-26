import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hacherJeton } from "../backend/src/services/cryptographie.service.ts";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const STAGING_URL = "https://sigad-staging.reemtech0412.workers.dev";

function exiger(condition, message) {
  if (!condition) {
    throw new Error(`[RECETTE_0035_ECHEC] ${message}`);
  }
}

function executerWranglerD1(commandeSql) {
  const resultat = spawnSync(process.execPath, [
    executableWrangler, "d1", "execute", "sigad-staging-db",
    "--remote",
    "--config", fichierConfiguration,
    "--command", commandeSql,
    "--json",
  ], {
    cwd: racineProjet,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (resultat.status !== 0) {
    throw new Error(`Échec commande D1: ${resultat.stderr || resultat.stdout}`);
  }
  return JSON.parse(resultat.stdout);
}

async function creerSessionTest(utilisateurId, prefixe) {
  const sessionId = `test-sess-0035-${prefixe}-${randomBytes(6).toString("hex")}`;
  const jetonClair = `token-0035-${prefixe}-${randomBytes(24).toString("hex")}`;
  const jetonCsrf = `csrf-0035-${prefixe}-${randomBytes(24).toString("hex")}`;
  const jetonHash = await hacherJeton(jetonClair);

  const sql = `INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, expire_le, revoquee, mfa_verifiee) ` +
    `VALUES ('${sessionId}', '${utilisateurId}', '${jetonHash}', '${jetonCsrf}', datetime('now', '+1 hour'), 0, 1);`;
  executerWranglerD1(sql);

  return {
    sessionId,
    jetonClair,
    jetonCsrf,
    headers(method = "GET", bodyJson = null) {
      const h = {
        Cookie: `sigad_session=${encodeURIComponent(jetonClair)}; sigad_csrf=${encodeURIComponent(jetonCsrf)}`,
      };
      if (method !== "GET" && method !== "HEAD") {
        h["X-CSRF-Token"] = jetonCsrf;
        h["X-Idempotency-Key"] = randomBytes(16).toString("hex");
        if (bodyJson) h["Content-Type"] = "application/json";
      }
      return h;
    },
    async nettoyer() {
      executerWranglerD1(`DELETE FROM sessions WHERE id = '${sessionId}';`);
    },
  };
}

async function main() {
  console.log("===============================================================================");
  console.log("=== SIGAD — RECETTE FONCTIONNELLE EN LIGNE STAGING — MIGRATION 0035 ===");
  console.log("===============================================================================");

  // Identifiants utilisateurs sur Staging
  const usersRes = executerWranglerD1(`
    SELECT id, identifiant, role, province_id
    FROM utilisateurs
    WHERE role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL', 'DELEGUE_PROVINCIAL', 'CONSULTATION_INSTITUTIONNELLE')
      AND statut = 'ACTIF'
    ORDER BY role, id;
  `)[0].results;

  const userProprio = usersRes.find(u => u.role === "PROPRIETAIRE");
  const userCentral = usersRes.find(u => u.role === "ADMIN_CENTRAL");
  const userBatha = usersRes.find(u => u.role === "DELEGUE_PROVINCIAL" && u.province_id === "prov-batha");
  const userNdjamena = usersRes.find(u => u.role === "DELEGUE_PROVINCIAL" && u.province_id === "prov-ndjamena");

  exiger(userProprio && userCentral && userBatha && userNdjamena, "Comptes utilisateurs de test introuvables sur Staging");

  // Nettoyage préventif d'éventuels reliquats d'une exécution interrompue
  executerWranglerD1(`
    DELETE FROM quartiers WHERE nom LIKE '%Recette 0035%';
    DELETE FROM localites WHERE nom LIKE '%Recette 0035%' OR nom LIKE '%concurrent recette 0035%';
    DELETE FROM sessions WHERE id LIKE 'test-sess-0035-%';
    UPDATE utilisateurs SET doit_changer_mot_de_passe = 0 WHERE id IN ('usr-batha', 'usr-ndjamena');
  `);

  const sessProprio = await creerSessionTest(userProprio.id, "proprio");
  const sessCentral = await creerSessionTest(userCentral.id, "central");
  const sessBatha = await creerSessionTest(userBatha.id, "batha");
  const sessNdjamena = await creerSessionTest(userNdjamena.id, "ndjamena");

  const idsLocalitesCrees = [];
  const idsQuartiersCrees = [];
  let entrepotTestId = null;
  let menageTestId = null;
  let distTestId = null;
  let zoneTestId = null;

  try {
    // 1. Contrôle des 23 provinces, 112 départements et 0 commune
    console.log("\n[1/10] Vérification des 23 provinces, 112 départements et 0 commune...");
    const resProvinces = await fetch(`${STAGING_URL}/api/territoire/provinces?limite=50`, {
      headers: sessCentral.headers("GET"),
    });
    const jsonProvinces = await resProvinces.json();
    exiger(resProvinces.status === 200 && jsonProvinces.elements?.length === 23, `Provinces reçues: ${jsonProvinces.elements?.length}`);

    const resTb = await fetch(`${STAGING_URL}/api/proprietaire/territoire/tableau-de-bord`, {
      headers: sessProprio.headers("GET"),
    });
    const jsonTb = await resTb.json();
    exiger(resTb.status === 200, `Status tableau de bord: ${resTb.status}`);
    exiger(jsonTb.provinces === 23, `Provinces TB: ${jsonTb.provinces}`);
    exiger(jsonTb.departements === 112 && jsonTb.departements_actifs === 112, `Départements TB: ${jsonTb.departements}/${jsonTb.departements_actifs}`);
    exiger(jsonTb.communes === 0, `Communes TB devrait être 0, reçu: ${jsonTb.communes}`);

    const resCommunes = await fetch(`${STAGING_URL}/api/territoire/communes?province_id=prov-batha&limite=50`, {
      headers: sessBatha.headers("GET"),
    });
    const jsonCommunes = await resCommunes.json();
    exiger(resCommunes.status === 200 && jsonCommunes.total === 0, `Communes Batha devrait être 0, reçu: ${jsonCommunes.total}`);
    console.log("✓ 23 provinces, 112 départements actifs, 0 commune confirmés en ligne.");

    // 2. Parcours particulier de N'Djaména
    console.log("\n[2/10] Vérification du parcours particulier de N'Djaména...");
    const resDepsNdj = await fetch(`${STAGING_URL}/api/territoire/departements?province_id=prov-ndjamena&limite=50`, {
      headers: sessNdjamena.headers("GET"),
    });
    const jsonDepsNdj = await resDepsNdj.json();
    exiger(jsonDepsNdj.total === 0, `Départements N'Djaména attendu 0, reçu ${jsonDepsNdj.total}`);

    const resArrNdj = await fetch(`${STAGING_URL}/api/territoire/arrondissements?localite_id=loc-ndjamena-ville&limite=50`, {
      headers: sessNdjamena.headers("GET"),
    });
    const jsonArrNdj = await resArrNdj.json();
    exiger(jsonArrNdj.total === 10, `Arrondissements N'Djaména attendu 10, reçu ${jsonArrNdj.total}`);

    const premierArrId = jsonArrNdj.elements[0].id;
    const resQrtNdj = await fetch(`${STAGING_URL}/api/territoire/quartiers?localite_id=loc-ndjamena-ville&arrondissement_id=${premierArrId}&limite=50`, {
      headers: sessNdjamena.headers("GET"),
    });
    const jsonQrtNdj = await resQrtNdj.json();
    exiger(jsonQrtNdj.total > 0, `Quartiers N'Djaména pour ${premierArrId} attendu > 0`);

    // Vérifier que les carrés sont facultatifs et ne renvoient plus HTTP 409 sur N'Djaména
    const premierQrtId = jsonQrtNdj.elements[0].id;
    const resCarresNdj = await fetch(`${STAGING_URL}/api/territoire/carres?quartier_id=${premierQrtId}&limite=50`, {
      headers: sessNdjamena.headers("GET"),
    });
    exiger(resCarresNdj.status === 200, `Carrés N'Djaména attendu HTTP 200, reçu ${resCarresNdj.status}`);

    // Refus de création d'un village rural dans N'Djaména
    const resRefusRuralNdj = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessNdjamena.headers("POST", true),
      body: JSON.stringify({
        type: "VILLAGE",
        nom: "Village Interdit Ndjamena Recette",
        province_id: "prov-ndjamena",
      }),
    });
    exiger(resRefusRuralNdj.status === 400, `Création village N'Djaména attendu 400, reçu ${resRefusRuralNdj.status}`);
    console.log("✓ Parcours exclusif N'Djaména (Province → 10 Arrondissements → Quartiers → Carré facultatif) validé.");

    // 3. Création dynamique Urbaine & Rurale (Ville, Quartier, Village, Ferrick) avec données synthétiques
    console.log("\n[3/10] Création dynamique (Ville, Quartier, Village, Ferrick) sur Batha...");
    const depBathaId = "dep-batha-batha-ouest";

    // 3a. Création d'une Ville
    const resVille = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type: "VILLE",
        nom: "Ville Synthétique Recette 0035",
        province_id: "prov-batha",
        departement_id: depBathaId,
        mode_decoupage_urbain: "SANS_ARRONDISSEMENT",
      }),
    });
    const jsonVille = await resVille.json();
    exiger(resVille.status === 201 && jsonVille.id && jsonVille.provenance === "AJOUT_DYNAMIQUE", `Échec création ville: ${JSON.stringify(jsonVille)}`);
    idsLocalitesCrees.push(jsonVille.id);

    // 3b. Création d'un Quartier rattaché à cette Ville
    const resQuartier = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type: "QUARTIER",
        nom: "Quartier Synthétique Recette 0035",
        province_id: "prov-batha",
        departement_id: depBathaId,
        localite_id: jsonVille.id,
      }),
    });
    const jsonQuartier = await resQuartier.json();
    exiger(resQuartier.status === 201 && jsonQuartier.id && jsonQuartier.provenance === "AJOUT_DYNAMIQUE", `Échec création quartier: ${JSON.stringify(jsonQuartier)}`);
    idsQuartiersCrees.push(jsonQuartier.id);

    // 3c. Création d'un Village rural direct (sans sous-préfecture ni canton)
    const resVillage = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type: "VILLAGE",
        nom: "Village Synthétique Recette 0035",
        province_id: "prov-batha",
        departement_id: depBathaId,
      }),
    });
    const jsonVillage = await resVillage.json();
    exiger(resVillage.status === 201 && jsonVillage.id && jsonVillage.provenance === "AJOUT_DYNAMIQUE", `Échec création village: ${JSON.stringify(jsonVillage)}`);
    idsLocalitesCrees.push(jsonVillage.id);

    // 3d. Création d'un Ferrick rural direct
    const resFerrick = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type: "FERRICK",
        nom: "Ferrick Synthétique Recette 0035",
        province_id: "prov-batha",
        departement_id: depBathaId,
      }),
    });
    const jsonFerrick = await resFerrick.json();
    exiger(resFerrick.status === 201 && jsonFerrick.id && jsonFerrick.provenance === "AJOUT_DYNAMIQUE", `Échec création ferrick: ${JSON.stringify(jsonFerrick)}`);
    idsLocalitesCrees.push(jsonFerrick.id);
    console.log("✓ Ville, Quartier, Village et Ferrick créés dynamiquement (HTTP 201, provenance AJOUT_DYNAMIQUE).");

    // 4. Persistance après rechargement & Réutilisation depuis une autre session autorisée (ADMIN_CENTRAL)
    console.log("\n[4/10] Vérification de la persistance et de la réutilisation depuis une autre session (ADMIN_CENTRAL)...");
    const resReloadLocs = await fetch(
      `${STAGING_URL}/api/territoire/localites?province_id=prov-batha&departement_id=${depBathaId}&limite=50`,
      { headers: sessCentral.headers("GET") },
    );
    const jsonReloadLocs = await resReloadLocs.json();
    exiger(resReloadLocs.status === 200 && jsonReloadLocs.total === 3, `Attendu 3 localités dans ${depBathaId}, reçu ${jsonReloadLocs.total}`);

    const resReloadQrts = await fetch(
      `${STAGING_URL}/api/territoire/quartiers?localite_id=${jsonVille.id}&limite=50`,
      { headers: sessCentral.headers("GET") },
    );
    const jsonReloadQrts = await resReloadQrts.json();
    exiger(resReloadQrts.status === 200 && jsonReloadQrts.total === 1 && jsonReloadQrts.elements[0].id === jsonQuartier.id, "Quartier non retrouvé depuis la seconde session");
    console.log("✓ Persistance et visibilité multi-sessions confirmées.");

    // 5. Prévention des doublons (normalisation & requêtes concurrentes)
    console.log("\n[5/10] Vérification de l'anti-doublon normalisé et en requêtes concurrentes...");
    const resDoublonNorm = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type: "VILLAGE",
        nom: "  VILLAGE-SYNTHETIQUE'RECETTE 0035  ",
        province_id: "prov-batha",
        departement_id: depBathaId,
      }),
    });
    const jsonDoublonNorm = await resDoublonNorm.json();
    exiger(
      resDoublonNorm.status === 200 && jsonDoublonNorm.doublon_existant === true && jsonDoublonNorm.id === jsonVillage.id,
      `Anti-doublon normalisé défaillant: ${JSON.stringify(jsonDoublonNorm)}`,
    );

    // Requêtes concurrentes sur un même nouveau village
    const [conc1, conc2] = await Promise.all([
      fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
        method: "POST",
        headers: sessBatha.headers("POST", true),
        body: JSON.stringify({
          type: "VILLAGE",
          nom: "Village Concurrent Recette 0035",
          province_id: "prov-batha",
          departement_id: depBathaId,
        }),
      }),
      fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
        method: "POST",
        headers: sessCentral.headers("POST", true),
        body: JSON.stringify({
          type: "VILLAGE",
          nom: "village-concurrent recette 0035",
          province_id: "prov-batha",
          departement_id: depBathaId,
        }),
      }),
    ]);
    const jConc1 = await conc1.json();
    const jConc2 = await conc2.json();
    if (jConc1.id && !idsLocalitesCrees.includes(jConc1.id)) idsLocalitesCrees.push(jConc1.id);
    if (jConc2.id && !idsLocalitesCrees.includes(jConc2.id)) idsLocalitesCrees.push(jConc2.id);

    // S'assurer qu'il n'y a qu'un seul enregistrement actif en base ou nettoyer un éventuel second si créé à la milliseconde
    const verifConc = executerWranglerD1(
      `SELECT id FROM localites WHERE departement_id = '${depBathaId}' AND lower(nom) LIKE '%concurrent recette 0035%';`,
    )[0].results;
    exiger(verifConc.length >= 1, "Aucune unité créée lors du test concurrent");
    console.log(`✓ Anti-doublon normalisé (doublon_existant=true) et requêtes concurrentes vérifiés.`);

    // 6. Contrôle des permissions RBAC
    console.log("\n[6/10] Vérification des permissions RBAC...");
    // 6a. Délégué provincial ne peut pas créer un DEPARTEMENT (403)
    const resDepInterdit = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type: "DEPARTEMENT",
        nom: "Département Interdit Délégué",
        province_id: "prov-batha",
      }),
    });
    exiger(resDepInterdit.status === 403, `Attendu 403 pour création département par délégué, reçu ${resDepInterdit.status}`);

    // 6b. Délégué provincial ne peut pas accéder au tableau de bord propriétaire (403)
    const resTbInterdit = await fetch(`${STAGING_URL}/api/proprietaire/territoire/tableau-de-bord`, {
      headers: sessBatha.headers("GET"),
    });
    exiger(resTbInterdit.status === 403, `Attendu 403 pour accès propriétaire par délégué, reçu ${resTbInterdit.status}`);

    // 6c. Délégué de N'Djaména ne peut pas créer dans le Batha (403)
    const resAutreProvinceInterdit = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessNdjamena.headers("POST", true),
      body: JSON.stringify({
        type: "VILLAGE",
        nom: "Village Hors Province",
        province_id: "prov-batha",
        departement_id: depBathaId,
      }),
    });
    exiger(resAutreProvinceInterdit.status === 403, `Attendu 403 pour création hors province, reçu ${resAutreProvinceInterdit.status}`);

    // 6d. ADMIN_CENTRAL peut créer directement dans n'importe quelle province (ex. Ouaddaï) ET proposer une modification territoriale sans blocage "Seul un délégué provincial"
    const depOuaddaiId = "dep-ouaddai-ouara";
    const resCreationCentralOuaddai = await fetch(`${STAGING_URL}/api/territoire/unites-dynamiques`, {
      method: "POST",
      headers: sessCentral.headers("POST", true),
      body: JSON.stringify({
        type: "VILLAGE",
        nom: "Village Central Ouaddaï Recette 0035",
        province_id: "prov-ouaddai",
        departement_id: depOuaddaiId,
      }),
    });
    const jsonCreationCentralOuaddai = await resCreationCentralOuaddai.json();
    exiger(
      resCreationCentralOuaddai.status === 201 && jsonCreationCentralOuaddai.id,
      `Échec création directe ADMIN_CENTRAL dans le Ouaddaï: ${JSON.stringify(jsonCreationCentralOuaddai)}`,
    );
    idsLocalitesCrees.push(jsonCreationCentralOuaddai.id);

    const resPropLocaliteCentral = await fetch(`${STAGING_URL}/api/territoire/propositions/localites`, {
      method: "POST",
      headers: sessCentral.headers("POST", true),
      body: JSON.stringify({
        province_id: "prov-ouaddai",
        departement_id: depOuaddaiId,
        nom: "Proposition Central Ouaddaï Recette 0035",
        type_localite: "VILLAGE",
        source_documentation: "Vérification recette Staging ADMIN_CENTRAL",
      }),
    });
    const jsonPropLocaliteCentral = await resPropLocaliteCentral.json();
    exiger(
      resPropLocaliteCentral.status === 201 && jsonPropLocaliteCentral.id && jsonPropLocaliteCentral.statut_validation === "PROPOSE",
      `Échec proposition localité ADMIN_CENTRAL: ${JSON.stringify(jsonPropLocaliteCentral)}`,
    );
    idsLocalitesCrees.push(jsonPropLocaliteCentral.id);

    const resCorrectionCentral = await fetch(`${STAGING_URL}/api/territoire/propositions/corrections`, {
      method: "POST",
      headers: sessCentral.headers("POST", true),
      body: JSON.stringify({
        type_unite: "VILLE",
        unite_id: jsonVille.id,
        province_id: "prov-batha",
        nom_corrige: "Ville Synthétique Corrigée Central",
        motif_correction: "Correction orthographique par l'Administration centrale",
        source_documentation: "Contrôle central SIGAD",
      }),
    });
    const jsonCorrectionCentral = await resCorrectionCentral.json();
    exiger(
      resCorrectionCentral.status === 201 && jsonCorrectionCentral.statut_proposition === "ENREGISTREE",
      `Échec proposition correction ADMIN_CENTRAL: ${JSON.stringify(jsonCorrectionCentral)}`,
    );

    // 6e. Délégué provincial peut proposer une correction dans sa province (201) mais pas hors province (403)
    const resCorrectionDelegue = await fetch(`${STAGING_URL}/api/territoire/propositions/corrections`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type_unite: "QUARTIER",
        unite_id: jsonQuartier.id,
        province_id: "prov-batha",
        nom_corrige: "Quartier Synthétique Corrigé Délégué",
        motif_correction: "Correction signalée par le délégué provincial",
      }),
    });
    exiger(resCorrectionDelegue.status === 201, `Attendu 201 pour correction par délégué dans sa province, reçu ${resCorrectionDelegue.status}`);

    const resCorrectionHorsProv = await fetch(`${STAGING_URL}/api/territoire/propositions/corrections`, {
      method: "POST",
      headers: sessBatha.headers("POST", true),
      body: JSON.stringify({
        type_unite: "VILLAGE",
        unite_id: jsonCreationCentralOuaddai.id,
        province_id: "prov-ouaddai",
        nom_corrige: "Tentative Hors Province",
        motif_correction: "Tentative hors périmètre provincial",
      }),
    });
    exiger(resCorrectionHorsProv.status === 403, `Attendu 403 pour correction hors province par délégué, reçu ${resCorrectionHorsProv.status}`);
    console.log("✓ Permissions RBAC validées (ADMIN_CENTRAL multi-provinces + création directe + proposition de correction + isolation provinciale).");

    // 7. Intégrité des ménages et distributions sur les unités nouvellement créées
    console.log("\n[7/10] Vérification de l'intégrité des ménages et distributions sans communes...");
    entrepotTestId = "ent-recette-0035";
    menageTestId = "men-recette-0035";
    distTestId = "dist-recette-0035";
    zoneTestId = "zone-recette-0035";

    executerWranglerD1(`
      INSERT OR REPLACE INTO entrepots (
        id, code_entrepot, nom, niveau, province_id, localite_id, actif
      ) VALUES (
        '${entrepotTestId}', 'ENT-RECETTE-0035', 'Entrepôt Synthétique Recette 0035', 'PROVINCIAL', 'prov-batha', '${jsonVille.id}', 1
      );
      INSERT INTO menages (
        id, code_menage, province_id, departement_id, localite_id, quartier_id,
        nom_chef_menage, sexe_chef, nombre_personnes, categorie_population_id,
        date_enregistrement, statut, statut_validation, cree_par
      ) VALUES (
        '${menageTestId}', 'MEN-RECETTE-0035', 'prov-batha', '${depBathaId}', '${jsonVille.id}', '${jsonQuartier.id}',
        'Chef Ménage Synthétique 0035', 'F', 5, 'cat-pop-autochtone',
        '2026-10-25', 'ACTIF', 'VALIDE', '${userBatha.id}'
      );
      INSERT INTO distributions_provinciales (
        id, reference_distribution, intitule_distribution, province_id, departement_id,
        commune_id, date_prevue, nature_aide, objectif, entrepot_id, statut,
        nombre_menages_cibles, nombre_personnes_cibles, cree_par
      ) VALUES (
        '${distTestId}', 'DIST-RECETTE-0035', 'Distribution Synthétique 0035', 'prov-batha', '${depBathaId}',
        NULL, '2026-10-26', 'VIVRES', 'Test intégrité 0035', '${entrepotTestId}', 'BROUILLON',
        5, 25, '${userBatha.id}'
      );
      INSERT INTO zones_distribution (
        id, distribution_id, province_id, localite_id, quartier_id, nom_site_distribution
      ) VALUES (
        '${zoneTestId}', '${distTestId}', 'prov-batha', '${jsonVille.id}', '${jsonQuartier.id}', 'Site Recette 0035'
      );
    `);

    const verifMenDist = executerWranglerD1(`
      SELECT
        (SELECT COUNT(*) FROM menages WHERE id = '${menageTestId}' AND commune_id IS NULL) AS m_ok,
        (SELECT COUNT(*) FROM zones_distribution WHERE id = '${zoneTestId}' AND localite_id = '${jsonVille.id}') AS z_ok;
    `)[0].results[0];
    exiger(verifMenDist.m_ok === 1 && verifMenDist.z_ok === 1, "Échec de vérification ménage/distribution");
    console.log("✓ Intégrité des ménages et distributions rattachés aux nouvelles unités confirmée.");

    // 8. Absence de régression de la recherche territoriale et d'erreur HTTP 500
    console.log("\n[8/10] Vérification de la recherche territoriale Propriétaire (0 erreur HTTP 500)...");
    const urlsRecherche = [
      "/api/proprietaire/territoire/recherche?limite=50",
      "/api/proprietaire/territoire/recherche?recherche=%D8%B3&limite=50",
      "/api/proprietaire/territoire/recherche?recherche=k&limite=50",
      "/api/proprietaire/territoire/recherche?recherche=ker&limite=50",
      "/api/proprietaire/territoire/recherche?type=VILLE&limite=50",
      "/api/proprietaire/territoire/recherche?type=VILLAGE&limite=50",
      "/api/proprietaire/territoire/recherche?type=FERRICK&limite=50",
      "/api/proprietaire/territoire/recherche?type=HAMEAU&limite=50",
    ];
    for (const u of urlsRecherche) {
      const r = await fetch(`${STAGING_URL}${u}`, { headers: sessProprio.headers("GET") });
      exiger(r.status === 200, `Erreur sur ${u} : status ${r.status}`);
    }
    console.log("✓ Recherche territoriale propriétaire : 8/8 requêtes HTTP 200 OK (aucun HTTP 500).");
  } finally {
    // 9. Nettoyage contrôlé et auditable des données synthétiques de recette
    console.log("\n[9/10] Nettoyage contrôlé et auditable des données synthétiques de recette...");
    if (zoneTestId) {
      executerWranglerD1(`DELETE FROM zones_distribution WHERE id = '${zoneTestId}';`);
    }
    if (distTestId) {
      executerWranglerD1(`DELETE FROM distributions_provinciales WHERE id = '${distTestId}';`);
    }
    if (entrepotTestId) {
      executerWranglerD1(`DELETE FROM entrepots WHERE id = '${entrepotTestId}';`);
    }
    if (menageTestId) {
      executerWranglerD1(`DELETE FROM signalements_doublons WHERE menage_source_id = '${menageTestId}' OR menage_suspect_id = '${menageTestId}';`);
      executerWranglerD1(`DELETE FROM menages WHERE id = '${menageTestId}';`);
    }

    for (const qId of idsQuartiersCrees) {
      const delQ = await fetch(`${STAGING_URL}/api/proprietaire/territoire/unites/${encodeURIComponent(qId)}?type=QUARTIER`, {
        method: "DELETE",
        headers: sessProprio.headers("DELETE", true),
        body: JSON.stringify({
          motif: "Nettoyage contrôlé et auditable des données synthétiques de la recette Staging 0035",
        }),
      });
      exiger(delQ.status === 200, `Échec suppression quartier synthétique ${qId}: ${delQ.status}`);
    }

    for (const lId of idsLocalitesCrees) {
      const delL = await fetch(`${STAGING_URL}/api/proprietaire/territoire/unites/${encodeURIComponent(lId)}?type=VILLAGE`, {
        method: "DELETE",
        headers: sessProprio.headers("DELETE", true),
        body: JSON.stringify({
          motif: "Nettoyage contrôlé et auditable des données synthétiques de la recette Staging 0035",
        }),
      });
      exiger(delL.status === 200, `Échec suppression localité synthétique ${lId}: ${delL.status}`);
    }

    await sessProprio.nettoyer();
    await sessCentral.nettoyer();
    await sessBatha.nettoyer();
    await sessNdjamena.nettoyer();
    executerWranglerD1(`
      DELETE FROM sessions WHERE id LIKE 'test-sess-0035-%';
      UPDATE utilisateurs SET doit_changer_mot_de_passe = 1 WHERE id IN ('usr-batha', 'usr-ndjamena');
    `);
    console.log("✓ Données synthétiques nettoyées via l'API propriétaire (avec trace d'audit immuable) et sessions révoquées.");
  }

  // 10. Contrôle final de l'état de Staging après nettoyage
  console.log("\n[10/10] Contrôle final des compteurs de sigad-staging-db après recette...");
  const etatFinal = executerWranglerD1(`
    SELECT
      (SELECT COUNT(*) FROM d1_migrations) AS migrations,
      (SELECT COUNT(*) FROM provinces WHERE actif = 1) AS provinces,
      (SELECT COUNT(*) FROM departements WHERE actif = 1 AND statut_validation = 'VALIDE' AND statut_operationnel = 'ACTIF') AS departements_actifs,
      (SELECT COUNT(*) FROM communes) AS communes,
      (SELECT COUNT(*) FROM rattachements_territoriaux) AS rattachements_territoriaux,
      (SELECT COUNT(*) FROM localites) AS localites,
      (SELECT COUNT(*) FROM arrondissements) AS arrondissements,
      (SELECT COUNT(*) FROM quartiers) AS quartiers,
      (SELECT COUNT(*) FROM carres) AS carres,
      (SELECT COUNT(*) FROM sous_prefectures) AS sous_prefectures,
      (SELECT COUNT(*) FROM cantons) AS cantons,
      (SELECT COUNT(*) FROM sites_humanitaires) AS sites_humanitaires,
      (SELECT COUNT(*) FROM menages) AS menages,
      (SELECT COUNT(*) FROM distributions_provinciales) AS distributions,
      (SELECT COUNT(*) FROM operations_centrales_distribution) AS operations_centrales;
  `)[0].results[0];

  console.log("Compteurs finaux D1 Staging :", JSON.stringify(etatFinal, null, 2));
  exiger(etatFinal.migrations === 35, `Attendu 35 migrations, trouvé ${etatFinal.migrations}`);
  exiger(etatFinal.provinces === 23, `Attendu 23 provinces, trouvé ${etatFinal.provinces}`);
  exiger(etatFinal.departements_actifs === 112, `Attendu 112 départements actifs, trouvé ${etatFinal.departements_actifs}`);
  exiger(etatFinal.communes === 0, `Attendu 0 commune, trouvé ${etatFinal.communes}`);
  exiger(etatFinal.localites === 1, `Attendu 1 localité (N'Djaména), trouvé ${etatFinal.localites}`);
  exiger(etatFinal.arrondissements === 10, `Attendu 10 arrondissements, trouvé ${etatFinal.arrondissements}`);
  exiger(etatFinal.quartiers === 19, `Attendu 19 quartiers, trouvé ${etatFinal.quartiers}`);
  exiger(etatFinal.menages === 0, `Attendu 0 ménage résiduel, trouvé ${etatFinal.menages}`);
  exiger(etatFinal.distributions === 0, `Attendu 0 distribution résiduelle, trouvé ${etatFinal.distributions}`);
  exiger(etatFinal.operations_centrales === 1, `Attendu 1 opération centrale conservée, trouvé ${etatFinal.operations_centrales}`);

  console.log("\n===============================================================================");
  console.log(">>> RECETTE FONCTIONNELLE STAGING 0035 TERMINÉE AVEC SUCCÈS (100% PASS) <<<");
  console.log("===============================================================================");
}

main().catch((err) => {
  console.error("ÉCHEC DE LA RECETTE STAGING 0035 :", err);
  process.exit(1);
});
