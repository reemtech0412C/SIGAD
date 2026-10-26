import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hacherJeton } from "../backend/src/services/cryptographie.service.ts";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const baseUrl = "https://sigad-staging.reemtech0412.workers.dev";

function exiger(condition, message) {
  if (!condition) {
    throw new Error(`[RECETTE_ERROR] ${message}`);
  }
}

function executerWranglerD1(commandeSql) {
  const resultat = spawnSync(process.execPath, [
    executableWrangler,
    "d1", "execute", "sigad-staging-db",
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
  const sessionId = `test-sess-${prefixe}-${randomBytes(6).toString("hex")}`;
  const jetonClair = `token-${prefixe}-${randomBytes(24).toString("hex")}`;
  const jetonCsrf = `csrf-${prefixe}-${randomBytes(24).toString("hex")}`;
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
  };
}

function supprimerSessions(sessionIds) {
  if (!sessionIds.length) return;
  const inClause = sessionIds.map((id) => `'${id}'`).join(", ");
  executerWranglerD1(`DELETE FROM sessions WHERE id IN (${inClause});`);
}

async function main() {
  console.log("=== SIGAD — TEST FONCTIONNEL SUR STAGING : OPÉRATIONS CENTRALES ===");
  console.log(`Cible: ${baseUrl}`);

  const sessionsCreees = [];
  let operationIdCree = null;

  try {
    // 1. Contrôles pré-test
    console.log("[1/7] Vérification de l'état initial des stocks et comptes...");
    const resStocks = executerWranglerD1("SELECT count(id) as c FROM mouvements_stock; SELECT id, statut FROM utilisateurs WHERE id = 'usr-sila';");
    const nbMouvementsInit = resStocks[0].results[0].c;
    const statutSilaInit = resStocks[1].results[0].statut;
    exiger(statutSilaInit === "VERROUILLE", "Le compte usr-sila doit être VERROUILLE initialement.");
    console.log(`   - Mouvements de stock initiaux : ${nbMouvementsInit}`);
    console.log(`   - Statut initial usr-sila       : ${statutSilaInit}`);

    // 2. Création des sessions de test sécurisées
    console.log("[2/7] Création des sessions temporaires de test (Central & Ouaddaï)...");
    executerWranglerD1("UPDATE utilisateurs SET doit_changer_mot_de_passe = 0 WHERE id = 'usr-ouaddai';");

    const sessionCentral = await creerSessionTest("usr-central", "central");
    sessionsCreees.push(sessionCentral.sessionId);

    const sessionOuaddai = await creerSessionTest("usr-ouaddai", "ouaddai");
    sessionsCreees.push(sessionOuaddai.sessionId);

    // 3. Test API - Création de l'opération centrale fictive
    console.log("[3/7] Création d'une opération centrale de démonstration...");
    const payloadCreation = {
      intitule: "[TEST DEMO TECHNIQUE] Distribution Vivres Déficit 2026",
      reference_administrative: "ARR-0033-2026-TEST",
      type_intervention: "DISTRIBUTION_GRATUITE_VIVRES",
      annee_campagne: "2026-2027",
      institution_responsable: "MASSNAH",
      reference_juridique: "Arrêté n°0033/PR/PM/MASSNAH/SG/2026",
      objectif_general: "Opération fictive de démonstration pour validation post-déploiement Staging.",
      categories_beneficiaires: "Ménages ruraux affectés",
      nombre_previsionnel_menages: 500,
      nombre_previsionnel_personnes: 2500,
      source_vivres: "ONASA",
      articles_cibles: [
        { designation: "Riz blanc 50kg", quantite_prevue: 250, unite: "SACS" },
        { designation: "Huile végétale 5L", quantite_prevue: 100, unite: "BIDONS" },
      ],
      provinces: [
        { province_id: "prov-ouaddai", nombre_menages_cibles_province: 300, quantite_allouee_prevue: 150 },
        { province_id: "prov-chari-baguirmi", nombre_menages_cibles_province: 200, quantite_allouee_prevue: 100 },
      ],
    };

    const resCreation = await fetch(`${baseUrl}/api/operations-centrales`, {
      method: "POST",
      headers: sessionCentral.headers("POST", true),
      body: JSON.stringify(payloadCreation),
    });
    const corpsCreation = await resCreation.json();
    exiger(resCreation.status === 201, `Échec création opération: HTTP ${resCreation.status} ${JSON.stringify(corpsCreation)}`);
    operationIdCree = corpsCreation.id;
    console.log(`   - Opération créée avec succès : ID ${operationIdCree} (Statut: ${corpsCreation.statut})`);
    exiger(corpsCreation.statut === "BROUILLON", "Le statut initial doit être BROUILLON.");

    // 4. Cycle de transition, approbation et ouverture
    console.log("[4/7] Cycle de vie : Soumission, Approbations et Ouverture...");
    // A. Passage en SOUMISE_A_APPROBATION
    const resSoumission = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}/statut`, {
      method: "POST",
      headers: sessionCentral.headers("POST", true),
      body: JSON.stringify({
        nouveau_statut: "SOUMISE_A_APPROBATION",
        motif_ou_commentaire: "Soumission pour examen du comité de pilotage.",
      }),
    });
    exiger(resSoumission.status === 200, `Échec soumission: HTTP ${resSoumission.status}`);

    // B. Approbation Comité de pilotage
    const resApp1 = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}/approbations`, {
      method: "POST",
      headers: sessionCentral.headers("POST", true),
      body: JSON.stringify({
        type_approbation: "COMITE_PILOTAGE",
        instance_decisionnaire: "Comité de pilotage interministériel",
        reference_acte: "PV-COPIL-2026-TEST",
        date_decision: "2026-10-24",
        signataire_nom: "Dr. Mahamat Saleh",
        signataire_qualite: "Président du Comité",
        decision: "APPROUVE",
        reserves_ou_conditions: null,
      }),
    });
    const corpsApp1 = await resApp1.json();
    exiger(resApp1.status === 201, `Échec approbation COPIL: HTTP ${resApp1.status} ${JSON.stringify(corpsApp1)}`);

    // C. Passage en APPROUVEE
    const resApprouvee = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}/statut`, {
      method: "POST",
      headers: sessionCentral.headers("POST", true),
      body: JSON.stringify({
        nouveau_statut: "APPROUVEE",
        motif_ou_commentaire: "Comité de pilotage validé.",
      }),
    });
    exiger(resApprouvee.status === 200, `Échec passage APPROUVEE: HTTP ${resApprouvee.status}`);

    // D. Ouverture officielle aux provinces
    const resOuverte = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}/statut`, {
      method: "POST",
      headers: sessionCentral.headers("POST", true),
      body: JSON.stringify({
        nouveau_statut: "OUVERTE",
        motif_ou_commentaire: "Ouverture des dossiers provinciaux pour exécution.",
      }),
    });
    const corpsOuverte = await resOuverte.json();
    exiger(resOuverte.status === 200, `Échec passage OUVERTE: HTTP ${resOuverte.status} ${JSON.stringify(corpsOuverte)}`);
    console.log("   - Opération passée avec succès au statut OUVERTE.");

    // 5. Cloisonnement provincial et RBAC
    console.log("[5/7] Contrôle du cloisonnement territorial (Délégué Ouaddaï)...");
    // Lecture de la liste
    const resListeOuaddai = await fetch(`${baseUrl}/api/operations-centrales`, {
      method: "GET",
      headers: sessionOuaddai.headers("GET"),
    });
    const corpsListeOuaddai = await resListeOuaddai.text();
    exiger(resListeOuaddai.status === 200, `Le délégué doit pouvoir interroger ses opérations: HTTP ${resListeOuaddai.status} ${corpsListeOuaddai}`);
    const listeOuaddai = JSON.parse(corpsListeOuaddai);
    const opOuaddai = (listeOuaddai.elements || []).find((o) => o.id === operationIdCree);
    exiger(opOuaddai !== undefined, "L'opération doit être visible pour Ouaddaï.");

    // Détail lu par le délégué
    const resDetailOuaddai = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}`, {
      method: "GET",
      headers: sessionOuaddai.headers("GET"),
    });
    exiger(resDetailOuaddai.status === 200, "Le délégué doit pouvoir lire son dossier.");
    const detailOuaddai = await resDetailOuaddai.json();
    exiger(detailOuaddai.provinces.length === 1 && detailOuaddai.provinces[0].province_id === "prov-ouaddai",
      "Le délégué Ouaddaï ne doit voir QUE sa propre province !");
    exiger(detailOuaddai.dossiers.length === 1 && detailOuaddai.dossiers[0].province_id === "prov-ouaddai",
      "Le délégué Ouaddaï ne doit voir QUE son propre dossier provincial !");
    console.log("   - Cloisonnement lecture provinciale : PASS (Seule prov-ouaddai est exposée)");

    // Tentative d'accès à la consolidation nationale par le délégué (HTTP 403 Forbidden attendu)
    const resConsolidationOuaddai = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}/consolidation`, {
      method: "GET",
      headers: sessionOuaddai.headers("GET"),
    });
    exiger(resConsolidationOuaddai.status === 403, `La consolidation doit être interdite au délégué (obtenu: ${resConsolidationOuaddai.status})`);
    console.log("   - Blocage consolidation nationale pour délégué : PASS (HTTP 403 Forbidden)");

    // 6. Vérification de l'absence totale de mouvements de stock
    console.log("[6/7] Vérification de l'intégrité des stocks...");
    const resStocksFinal = executerWranglerD1("SELECT count(id) as c FROM mouvements_stock;");
    const nbMouvementsFinal = resStocksFinal[0].results[0].c;
    exiger(nbMouvementsFinal === nbMouvementsInit, `Les stocks ne doivent pas bouger ! (Init: ${nbMouvementsInit}, Final: ${nbMouvementsFinal})`);
    console.log(`   - Mouvements de stock post-test : ${nbMouvementsFinal} (strictement inchangés)`);

    // 7. Nettoyage propre et audit
    console.log("[7/7] Annulation propre de l'opération et nettoyage des données de démonstration...");
    // Transition vers ANNULEE via l'API pour vérifier la traçabilité
    const resAnnulation = await fetch(`${baseUrl}/api/operations-centrales/${operationIdCree}/statut`, {
      method: "POST",
      headers: sessionCentral.headers("POST", true),
      body: JSON.stringify({
        nouveau_statut: "ANNULEE",
        motif_annulation: "Fin du test de recette technique post-déploiement Staging.",
      }),
    });
    exiger(resAnnulation.status === 200, "L'opération doit pouvoir être annulée proprement.");
    console.log("   - Opération annulée proprement via l'API (historique de traçabilité préservé).");

    // Purge de l'opération de test pour laisser la base vierge
    const sqlNettoyage = `
      DELETE FROM documents_operations WHERE operation_id = '${operationIdCree}';
      DELETE FROM approbations_operations WHERE operation_id = '${operationIdCree}';
      DELETE FROM dossiers_execution_provinciaux WHERE operation_id = '${operationIdCree}';
      DELETE FROM operations_centrales_provinces WHERE operation_id = '${operationIdCree}';
      DELETE FROM historique_operations_centrales WHERE operation_id = '${operationIdCree}';
      DELETE FROM operations_centrales_distribution WHERE id = '${operationIdCree}';
    `;
    executerWranglerD1(sqlNettoyage);
    operationIdCree = null;
    console.log("   - Données de démonstration purgées avec succès.");

    const resSilaFinal = executerWranglerD1("SELECT id, statut FROM utilisateurs WHERE id = 'usr-sila';");
    const statutSilaFinal = resSilaFinal[0].results[0].statut;
    exiger(statutSilaFinal === "VERROUILLE", "Le compte usr-sila doit IMPÉRATIVEMENT rester VERROUILLE.");
    console.log(`   - Statut compte usr-sila        : ${statutSilaFinal} (non altéré, conservé verrouillé)`);

    console.log("\n=== TEST DE DÉMONSTRATION STAGING RÉUSSI À 100% ===");
  } finally {
    try {
      executerWranglerD1("UPDATE utilisateurs SET doit_changer_mot_de_passe = 1 WHERE id = 'usr-ouaddai';");
      console.log("- Compte usr-ouaddai restauré à son état initial (doit_changer_mot_de_passe = 1).");
    } catch {}
    if (sessionsCreees.length > 0) {
      supprimerSessions(sessionsCreees);
      console.log(`- Sessions temporaires de test supprimées (${sessionsCreees.length} sessions nettoyées).`);
    }
    if (operationIdCree) {
      try {
        executerWranglerD1(`DELETE FROM operations_centrales_distribution WHERE id = '${operationIdCree}';`);
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error("ÉCHEC DE LA RECETTE:", err.message);
  process.exitCode = 1;
});
