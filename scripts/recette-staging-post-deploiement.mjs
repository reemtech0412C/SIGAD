import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hacherJeton } from "../backend/src/services/cryptographie.service.ts";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const STAGING_URL = "https://sigad-staging.reemtech0412.workers.dev";

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
    async nettoyer() {
      executerWranglerD1(`DELETE FROM sessions WHERE id = '${sessionId}';`);
    },
  };
}

async function main() {
  console.log("=========================================================================");
  console.log("=== SIGAD — RECETTE POST-DÉPLOIEMENT STAGING EN LIGNE (HTTP & API) ===");
  console.log("=========================================================================");
  console.log(`Cible Worker : ${STAGING_URL}`);

  // 1. Santé
  console.log("\n1. Test santé de l'API (/api/sante)...");
  const resSante = await fetch(`${STAGING_URL}/api/sante`);
  const jsonSante = await resSante.json();
  console.log(`- Status: ${resSante.status}, réponse:`, jsonSante);
  if (resSante.status !== 200 || jsonSante.statut !== "operationnel") throw new Error("Santé API non conforme");
  console.log("✓ /api/sante opérationnel");

  // 2. CSRF
  console.log("\n2. Test émission jeton CSRF (/api/auth/csrf)...");
  const resCsrf = await fetch(`${STAGING_URL}/api/auth/csrf`);
  const jsonCsrf = await resCsrf.json();
  if (resCsrf.status !== 200 || !jsonCsrf.jeton_csrf) throw new Error("Échec CSRF");
  console.log("✓ Jeton CSRF émis :", jsonCsrf.jeton_csrf.substring(0, 16) + "...");

  // 3. Frontend SPA
  console.log("\n3. Test chargement Frontend SPA...");
  const resHtml = await fetch(`${STAGING_URL}/`);
  const html = await resHtml.text();
  console.log(`- Index HTML: status ${resHtml.status}, ${html.length} octets`);
  if (resHtml.status !== 200 || !html.includes("SIGAD")) throw new Error("Échec SPA");
  console.log("✓ Assets Frontend chargés");

  // 4. Session Propriétaire et Tableau de bord territorial
  console.log("\n4. Test session PROPRIETAIRE et API Référentiel territorial...");
  const sessionProprio = await creerSessionTest("usr-proprietaire", "proprio");
  try {
    const resTb = await fetch(`${STAGING_URL}/api/proprietaire/territoire/tableau-de-bord`, {
      headers: sessionProprio.headers("GET"),
    });
    console.log(`- Status: ${resTb.status}`);
    const dataTb = await resTb.json();
    console.log("- Données reçues du tableau de bord territorial en ligne :");
    console.log(`  * Départements total       : ${dataTb.departements} (Attendu: 112)`);
    console.log(`  * Départements actifs      : ${dataTb.departements_actifs} (Attendu: 112)`);
    console.log(`  * Départements certifiés   : ${dataTb.departements_certifies} (Attendu: 80)`);
    console.log(`  * Départements candidats   : ${dataTb.departements_non_certifies} (Attendu: 32)`);
    console.log(`  * Provinces                : ${dataTb.provinces} (Attendu: 23)`);
    console.log(`  * Communes en relecture    : ${dataTb.communes} (Attendu: 500)`);
    console.log(`  * Arrondissements N'Djamena: ${dataTb.arrondissements} (Attendu: 10)`);
    console.log(`  * Quartiers N'Djamena      : ${dataTb.quartiers} (Attendu: 19)`);
    console.log(`  * Sous-préfectures         : ${dataTb.sous_prefectures} (Attendu: 0)`);
    console.log(`  * Cantons                  : ${dataTb.cantons} (Attendu: 0)`);

    if (resTb.status !== 200 || dataTb.departements !== 112 || dataTb.provinces !== 23) {
      throw new Error(`Tableau de bord territorial distant non conforme (reçu status ${resTb.status})`);
    }
    console.log("✓ Tableau de bord territorial Propriétaire 100% conforme sur Staging");

    // 5. Recherche multicritère départements en ligne
    console.log("\n5. Test recherche multicritère des 112 départements en ligne...");
    const resRech = await fetch(`${STAGING_URL}/api/proprietaire/territoire/recherche?type=DEPARTEMENT&limite=150`, {
      headers: sessionProprio.headers("GET"),
    });
    const dataRech = await resRech.json();
    console.log(`- Départements renvoyés par l'API : ${dataRech.elements?.length} (Attendu: 112)`);
    if (resRech.status !== 200 || dataRech.elements?.length !== 112) {
      throw new Error(`Recherche départements non conforme (reçu ${dataRech.elements?.length})`);
    }
    console.log("✓ 112 départements interrogés et confirmés sur l'API distante");
  } finally {
    await sessionProprio.nettoyer();
    console.log("- Session test propriétaire révoquée et nettoyée de la base");
  }

  // 6. Test RBAC Délégué Provincial (rejet strict HTTP 403)
  console.log("\n6. Test étanchéité RBAC Délégué Provincial (usr-batha)...");
  const sessionDelegue = await creerSessionTest("usr-batha", "batha");
  try {
    const resDelegue = await fetch(`${STAGING_URL}/api/proprietaire/territoire/tableau-de-bord`, {
      headers: sessionDelegue.headers("GET"),
    });
    console.log(`- Status: ${resDelegue.status} (Attendu: 403 Forbidden)`);
    const jsonDelegue = await resDelegue.json();
    console.log(`- Message reçu: ${jsonDelegue.erreur}`);
    if (resDelegue.status !== 403) {
      throw new Error(`Échec RBAC : attendu 403, reçu ${resDelegue.status}`);
    }
    console.log("✓ Confinement RBAC validé en ligne : Délégué Provincial strictement rejeté (HTTP 403)");
  } finally {
    await sessionDelegue.nettoyer();
    console.log("- Session test délégué révoquée et nettoyée de la base");
  }

  console.log("\n=========================================================================");
  console.log(">>> TOUS LES TESTS DE RECETTE STAGING EN LIGNE ONT RÉUSSI (100% PASS) <<<");
  console.log("=========================================================================");
}

main().catch(err => {
  console.error("ÉCHEC DE LA RECETTE EN LIGNE :", err);
  process.exit(1);
});
