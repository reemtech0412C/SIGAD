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
    headers(method = "GET") {
      return {
        Cookie: `sigad_session=${encodeURIComponent(jetonClair)}; sigad_csrf=${encodeURIComponent(jetonCsrf)}`,
      };
    },
    async nettoyer() {
      executerWranglerD1(`DELETE FROM sessions WHERE id = '${sessionId}';`);
    },
  };
}

async function main() {
  console.log("=========================================================================");
  console.log("=== SIGAD — VÉRIFICATION FINALE INCIDENT RECHERCHE TERRITORIALE 500 ===");
  console.log("=========================================================================");
  console.log(`Cible Worker : ${STAGING_URL}`);

  const sessionProprio = await creerSessionTest("usr-proprietaire", "proprio-recette");
  const sessionDelegue = await creerSessionTest("usr-batha", "delegue-recette");

  let echecs = 0;
  let reussites = 0;

  async function testerEndpoint(nom, path, options = {}) {
    const { session = sessionProprio, expectedStatus = 200, valider = null } = options;
    try {
      const res = await fetch(`${STAGING_URL}${path}`, {
        headers: session.headers("GET"),
      });
      if (res.status !== expectedStatus) {
        console.error(`❌ ${nom} : statut attendu ${expectedStatus}, reçu ${res.status}`);
        echecs++;
        return;
      }
      const data = await res.json().catch(() => null);
      if (valider && !valider(data)) {
        console.error(`❌ ${nom} : validation des données échouée`, data);
        echecs++;
        return;
      }
      console.log(`✅ ${nom} (${res.status} OK)`);
      reussites++;
    } catch (err) {
      console.error(`❌ ${nom} : Exception réseau`, err);
      echecs++;
    }
  }

  try {
    console.log("\n--- Phase 1 : Reproduction et validation des 4 requêtes en incident ---");
    await testerEndpoint(
      "REQ-01: Recherche globale par défaut (?limite=50)",
      "/api/proprietaire/territoire/recherche?limite=50",
      { valider: (d) => d && Array.isArray(d.elements) && d.elements.length === 50 && d.total >= 112 }
    );

    await testerEndpoint(
      "REQ-02: Recherche Unicode Arabe (?recherche=%D8%B3&limite=50)",
      "/api/proprietaire/territoire/recherche?recherche=%D8%B3&limite=50",
      { valider: (d) => d && Array.isArray(d.elements) && typeof d.total === "number" }
    );

    await testerEndpoint(
      "REQ-03: Recherche textuelle courte (?recherche=k&limite=50)",
      "/api/proprietaire/territoire/recherche?recherche=k&limite=50",
      { valider: (d) => d && Array.isArray(d.elements) && d.total > 0 && d.elements.length > 0 }
    );

    await testerEndpoint(
      "REQ-04: Recherche textuelle partielle (?recherche=ker&limite=50)",
      "/api/proprietaire/territoire/recherche?recherche=ker&limite=50",
      { valider: (d) => d && Array.isArray(d.elements) && d.total === 2 && d.elements.some(e => e.nom.toLowerCase().includes("ker")) }
    );

    console.log("\n--- Phase 2 : 10 tests de non-régression ---");
    await testerEndpoint(
      "NR-01: Recherche vide par défaut (?limite=20)",
      "/api/proprietaire/territoire/recherche?limite=20",
      { valider: (d) => d && d.elements.length === 20 }
    );

    await testerEndpoint(
      "NR-02: Recherche textuelle française (?recherche=ndjamena&limite=10)",
      "/api/proprietaire/territoire/recherche?recherche=ndjamena&limite=10",
      { valider: (d) => d && d.total > 0 && d.elements.some(e => e.nom.toLowerCase().includes("ndjamena")) }
    );

    await testerEndpoint(
      "NR-03: Filtre par province (?province_id=prov-ndjamena)",
      "/api/proprietaire/territoire/recherche?province_id=prov-ndjamena&limite=50",
      { valider: (d) => d && d.total > 0 && d.elements.every(e => e.province_id === "prov-ndjamena") }
    );

    await testerEndpoint(
      "NR-04: Filtre par type DEPARTEMENT (?type=DEPARTEMENT)",
      "/api/proprietaire/territoire/recherche?type=DEPARTEMENT&limite=150",
      { valider: (d) => d && d.total === 112 && d.elements.every(e => e.type === "DEPARTEMENT") }
    );

    await testerEndpoint(
      "NR-05: Filtre par type COMMUNE (?type=COMMUNE)",
      "/api/proprietaire/territoire/recherche?type=COMMUNE&limite=50",
      { valider: (d) => d && d.total === 500 && d.elements.every(e => e.type === "COMMUNE") }
    );

    await testerEndpoint(
      "NR-06: Pagination décalage (?limite=10&decalage=10)",
      "/api/proprietaire/territoire/recherche?limite=10&decalage=10",
      { valider: (d) => d && d.elements.length === 10 }
    );

    await testerEndpoint(
      "NR-07: Recherche infructueuse 0 résultat (?recherche=XYZ99INEXISTANT)",
      "/api/proprietaire/territoire/recherche?recherche=XYZ99INEXISTANT&limite=50",
      { valider: (d) => d && d.total === 0 && d.elements.length === 0 }
    );

    await testerEndpoint(
      "NR-08: Filtre combiné type et recherche (?type=DEPARTEMENT&recherche=barh)",
      "/api/proprietaire/territoire/recherche?type=DEPARTEMENT&recherche=barh&limite=10",
      { valider: (d) => d && d.total > 0 && d.elements.every(e => e.type === "DEPARTEMENT") }
    );

    await testerEndpoint(
      "NR-09: Tableau de bord territorial en ligne (/api/proprietaire/territoire/tableau-de-bord)",
      "/api/proprietaire/territoire/tableau-de-bord",
      { valider: (d) => d && d.departements === 112 && d.provinces === 23 }
    );

    await testerEndpoint(
      "NR-10: RBAC strict - Délégué Provincial refusé sur l'administration propriétaire",
      "/api/proprietaire/territoire/recherche?limite=50",
      { session: sessionDelegue, expectedStatus: 403 }
    );

    console.log("\n--- Phase 3 : Contrôles d'intégrité de la base de données D1 ---");
    const checkDepartements = executerWranglerD1("SELECT count(*) as total, sum(case when statut_validation='VALIDE' then 1 else 0 end) as valides, sum(case when actif=1 then 1 else 0 end) as actifs FROM departements;");
    const statsDep = checkDepartements[0].results[0];
    console.log(`Départements D1: Total = ${statsDep.total}, Valides = ${statsDep.valides}, Actifs = ${statsDep.actifs}`);
    if (statsDep.total !== 112 || statsDep.valides !== 112 || statsDep.actifs !== 112) {
      throw new Error(`Incohérence départements : ${JSON.stringify(statsDep)}`);
    }
    console.log("✅ 112 départements intacts, valides et actifs sur Staging D1");

    const checkMigrations = executerWranglerD1("SELECT count(*) as total, max(name) as derniere FROM d1_migrations;");
    const statsMig = checkMigrations[0].results[0];
    console.log(`Migrations D1: Total = ${statsMig.total}, Dernière = ${statsMig.derniere}`);
    if (statsMig.total !== 34) {
      throw new Error(`Incohérence migrations : attendu 34, trouvé ${statsMig.total}`);
    }
    console.log("✅ 34 migrations intactes sur Staging D1");

    const checkComptes = executerWranglerD1("SELECT count(*) as total FROM utilisateurs;");
    const statsComptes = checkComptes[0].results[0];
    console.log(`Comptes utilisateurs D1: Total = ${statsComptes.total}`);
    if (statsComptes.total !== 25) {
      throw new Error(`Incohérence comptes : attendu 25, trouvé ${statsComptes.total}`);
    }
    console.log("✅ 25 comptes utilisateurs intacts sur Staging D1");

    const checkOperation = executerWranglerD1("SELECT id, code_operation, statut, intitule FROM operations_centrales_distribution LIMIT 1;");
    const op = checkOperation[0].results[0];
    console.log(`Opération centrale D1: ${op.code_operation} - Statut = ${op.statut}`);
    console.log("✅ Opération centrale nationale intacte sur Staging D1");

    console.log("\n=========================================================================");
    console.log(`BILAN DE LA RECETTE EN LIGNE : ${reussites} succès, ${echecs} échecs.`);
    console.log("=========================================================================");
    if (echecs > 0) throw new Error(`${echecs} tests en échec !`);

  } finally {
    await sessionProprio.nettoyer();
    await sessionDelegue.nettoyer();
  }
}

main().catch(err => {
  console.error("ÉCHEC FATAL DE LA RECETTE :", err);
  process.exit(1);
});
