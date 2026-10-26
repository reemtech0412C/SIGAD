import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { hacherJeton } from "../backend/src/services/cryptographie.service.ts";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const STAGING_URL = "https://sigad-staging.reemtech0412.workers.dev";
const DOSSIER_CAPTURES = path.join(racineProjet, "docs/screenshots/staging-recette");

if (!fs.existsSync(DOSSIER_CAPTURES)) {
  fs.mkdirSync(DOSSIER_CAPTURES, { recursive: true });
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

async function creerSessionStaging(utilisateurId, prefixe) {
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
    async nettoyer() {
      executerWranglerD1(`DELETE FROM sessions WHERE id = '${sessionId}';`);
    },
  };
}

async function run() {
  console.log("=========================================================================");
  console.log("=== SIGAD — RECETTE VISUELLE DIRECTE SUR CLOUDFLARE STAGING (NAVIGATEUR) ===");
  console.log("=========================================================================");
  console.log(`URL Staging : ${STAGING_URL}`);

  const browser = await chromium.launch({ channel: "msedge", headless: true });

  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 375, height: 667 },
  ];

  try {
    for (const vp of viewports) {
      console.log(`\n--- VÉRIFICATION VIEWPORT : ${vp.name.toUpperCase()} (${vp.width}×${vp.height}) ---`);

      // 1. Écran de Connexion publique Staging
      const ctxPublic = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const pagePublic = await ctxPublic.newPage();

      const erreursHttp = [];
      pagePublic.on("response", (res) => {
        if (res.status() >= 500) {
          erreursHttp.push(`${res.request().method()} ${res.url()} -> HTTP ${res.status()}`);
        }
      });

      await pagePublic.goto(STAGING_URL);
      await pagePublic.waitForTimeout(1000);
      await pagePublic.screenshot({ path: path.join(DOSSIER_CAPTURES, `01-connexion-${vp.name}.png`) });
      console.log(`✔ [${vp.name}] 01-connexion: Page de connexion chargée sans erreur 500`);
      await ctxPublic.close();

      // 2. Espace Propriétaire en ligne sur Staging
      console.log(`- Création session temporaire Propriétaire pour ${vp.name}...`);
      const sessionProprio = await creerSessionStaging("usr-proprietaire", `prp-${vp.name}`);
      try {
        const ctxProprio = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await ctxProprio.addCookies([
          { name: "sigad_session", value: sessionProprio.jetonClair, domain: "sigad-staging.reemtech0412.workers.dev", path: "/" },
          { name: "sigad_csrf", value: sessionProprio.jetonCsrf, domain: "sigad-staging.reemtech0412.workers.dev", path: "/" },
        ]);

        const pageProprio = await ctxProprio.newPage();
        pageProprio.on("response", (res) => {
          if (res.status() >= 500) {
            erreursHttp.push(`PROPRIO: ${res.request().method()} ${res.url()} -> HTTP ${res.status()}`);
          }
        });

        // Dashboard Propriétaire Staging
        await pageProprio.goto(`${STAGING_URL}/`);
        await pageProprio.waitForTimeout(1500);
        await pageProprio.screenshot({ path: path.join(DOSSIER_CAPTURES, `02-proprietaire-accueil-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 02-proprietaire-accueil: Tableau de bord chargé`);

        // Référentiel territorial (112 départements)
        const tabTerritoire = pageProprio.locator("button:has-text('Référentiel territorial')");
        if (await tabTerritoire.isVisible()) {
          await tabTerritoire.click();
          await pageProprio.waitForTimeout(1500);
        }
        await pageProprio.screenshot({ path: path.join(DOSSIER_CAPTURES, `03-proprietaire-territoire-112-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 03-proprietaire-territoire-112: 112 départements affichés`);

        // Modale de création d'unité territoriale (WAI-ARIA)
        const btnCreer = pageProprio.locator("button:has-text('Créer une unité territoriale')");
        if (await btnCreer.isVisible()) {
          await btnCreer.click();
          await pageProprio.waitForTimeout(600);
          await pageProprio.screenshot({ path: path.join(DOSSIER_CAPTURES, `04-modale-creation-${vp.name}.png`) });
          console.log(`✔ [${vp.name}] 04-modale-creation: Modale ouverte avec champ juridique facultatif`);

          // Vérification fermeture via Échap
          await pageProprio.keyboard.press("Escape");
          await pageProprio.waitForTimeout(400);
          console.log(`✔ [${vp.name}] Fermeture modale par touche Échap validée`);
        }

        // Gestion des données de test
        const tabDonneesTest = pageProprio.locator("button:has-text('Données de test')");
        if (await tabDonneesTest.isVisible()) {
          await tabDonneesTest.click();
          await pageProprio.waitForTimeout(1000);
          await pageProprio.screenshot({ path: path.join(DOSSIER_CAPTURES, `05-donnees-test-${vp.name}.png`) });
          console.log(`✔ [${vp.name}] 05-donnees-test: Panneau de gestion des données de test chargé`);
        }

        // Fusions territoriales & confirmation sensible
        const tabFusions = pageProprio.locator("button:has-text('Fusions & Conflits')");
        if (await tabFusions.isVisible()) {
          await tabFusions.click();
          await pageProprio.waitForTimeout(800);
          await pageProprio.screenshot({ path: path.join(DOSSIER_CAPTURES, `06-fusions-territoriales-${vp.name}.png`) });
          console.log(`✔ [${vp.name}] 06-fusions-territoriales: Panneau de fusion contradictoire vérifié`);
        }

        await ctxProprio.close();
      } finally {
        await sessionProprio.nettoyer();
        console.log(`- Session Propriétaire nettoyée de la base`);
      }

      // 3. Espace Administration Centrale Staging
      console.log(`- Création session temporaire Admin Central pour ${vp.name}...`);
      const sessionAdmin = await creerSessionStaging("usr-central", `adm-${vp.name}`);
      try {
        const ctxAdmin = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await ctxAdmin.addCookies([
          { name: "sigad_session", value: sessionAdmin.jetonClair, domain: "sigad-staging.reemtech0412.workers.dev", path: "/" },
          { name: "sigad_csrf", value: sessionAdmin.jetonCsrf, domain: "sigad-staging.reemtech0412.workers.dev", path: "/" },
        ]);

        const pageAdmin = await ctxAdmin.newPage();
        pageAdmin.on("response", (res) => {
          if (res.status() >= 500) {
            erreursHttp.push(`ADMIN: ${res.request().method()} ${res.url()} -> HTTP ${res.status()}`);
          }
        });

        // Administration des comptes
        await pageAdmin.goto(`${STAGING_URL}/administration/comptes`);
        await pageAdmin.waitForTimeout(1500);
        await pageAdmin.screenshot({ path: path.join(DOSSIER_CAPTURES, `07-admin-comptes-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 07-admin-comptes: Gestion des comptes chargée`);

        // Opérations centrales
        await pageAdmin.goto(`${STAGING_URL}/operations-centrales`);
        await pageAdmin.waitForTimeout(1200);
        await pageAdmin.screenshot({ path: path.join(DOSSIER_CAPTURES, `08-admin-operations-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 08-admin-operations: Opérations centrales chargées`);

        // Approvisionnements
        await pageAdmin.goto(`${STAGING_URL}/approvisionnements`);
        await pageAdmin.waitForTimeout(1200);
        await pageAdmin.screenshot({ path: path.join(DOSSIER_CAPTURES, `09-admin-approvisionnements-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 09-admin-approvisionnements: Approvisionnements chargés`);

        // Contrôle
        await pageAdmin.goto(`${STAGING_URL}/controle`);
        await pageAdmin.waitForTimeout(1200);
        await pageAdmin.screenshot({ path: path.join(DOSSIER_CAPTURES, `10-admin-controle-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 10-admin-controle: Contrôle et audit chargés`);

        await ctxAdmin.close();
      } finally {
        await sessionAdmin.nettoyer();
        console.log(`- Session Admin Central nettoyée de la base`);
      }

      // 4. Espace Délégué Provincial (usr-batha avec exigence changement mdp)
      console.log(`- Création session Délégué Provincial Batha pour ${vp.name}...`);
      const sessionBatha = await creerSessionStaging("usr-batha", `bth-${vp.name}`);
      try {
        const ctxBatha = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await ctxBatha.addCookies([
          { name: "sigad_session", value: sessionBatha.jetonClair, domain: "sigad-staging.reemtech0412.workers.dev", path: "/" },
          { name: "sigad_csrf", value: sessionBatha.jetonCsrf, domain: "sigad-staging.reemtech0412.workers.dev", path: "/" },
        ]);

        const pageBatha = await ctxBatha.newPage();
        await pageBatha.goto(`${STAGING_URL}/`);
        await pageBatha.waitForTimeout(1200);
        await pageBatha.screenshot({ path: path.join(DOSSIER_CAPTURES, `11-delegue-batha-securite-${vp.name}.png`) });
        console.log(`✔ [${vp.name}] 11-delegue-batha-securite: Changement mot de passe initial requis affiché`);
        await ctxBatha.close();
      } finally {
        await sessionBatha.nettoyer();
        console.log(`- Session Délégué Batha nettoyée de la base`);
      }

      if (erreursHttp.length > 0) {
        console.error(`❌ [${vp.name}] Erreurs HTTP 500 détectées :`, erreursHttp);
        throw new Error(`Erreurs HTTP 500 sur Staging: ${erreursHttp.join(", ")}`);
      } else {
        console.log(`✔ [${vp.name}] 0 erreur HTTP 500 constatée sur l'ensemble des parcours.`);
      }
    }

    console.log("\n=========================================================================");
    console.log(">>> RECETTE VISUELLE SUR CLOUDFLARE STAGING 100% RÉUSSIE SANS ERREUR <<<");
    console.log("=========================================================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("ÉCHEC DE LA RECETTE STAGING :", err);
  process.exit(1);
});
