import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { connecterDansLeNavigateur } from "./authentification";

const dossierCaptures = resolve(process.cwd(), "docs/ui-shadcn-admin", "top-navigation", "ui-preview");

test("le tableau de bord partagé respecte le périmètre provincial et le responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await connecterDansLeNavigateur(page, "sila");

  const reponseDashboardAttendue = page.waitForResponse((reponse) => new URL(reponse.url()).pathname === "/api/rapports/tableau-de-bord");
  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/\/tableau-de-bord$/u);
  const reponseDashboard = await reponseDashboardAttendue;
  expect(reponseDashboard.ok()).toBeTruthy();
  const resultat = await reponseDashboard.json() as {
    perimetre: string;
    province_id: string | null;
    provinces: Array<{ province_id: string }>;
  };
  expect(resultat.perimetre).toBe("PROVINCIAL");
  expect(resultat.province_id).toBe("prov-sila");
  expect(resultat.provinces.every((province) => province.province_id === "prov-sila")).toBeTruthy();

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Bénéficiaires", exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Administration", exact: true })).toHaveCount(0);
  await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
  await expect(page.locator(".sigad-app-brand__logo img")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Indicateurs clés" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Carte interactive des provinces du Tchad" })).toBeVisible();
  await expect(page.getByText("Mode expérimental · OCHA COD-AB v01")).toBeVisible();
  await expect(page.getByText("Limites administratives indicatives — source OCHA/HDX, homologation juridique non confirmée.", { exact: true })).toBeVisible();
  await expect(page.locator(".sigad-carte-tchad__etat-donnees")).toContainText("Valeur exacte · données D1");
  await expect(page.getByRole("heading", { name: "Validations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activités récentes" })).toBeVisible();
  await expect(page.locator(".sigad-preview__pied-donnees")).toBeVisible();
  await expect(page.getByRole("region", { name: "Filtres du tableau de bord" }).getByLabel("Province")).toHaveCount(0);

  const hauteurNavigation = await navigation.evaluate((element) => Math.round(element.getBoundingClientRect().height));
  expect(hauteurNavigation).toBeGreaterThanOrEqual(50);
  expect(hauteurNavigation).toBeLessThanOrEqual(70);

  const devtools = await page.context().newCDPSession(page);
  await devtools.send("DOM.enable");
  await devtools.send("CSS.enable");
  const selecteurPolice = ".sigad-app-brand__identity strong";
  await expect(page.locator(selecteurPolice)).toBeVisible();
  const { root } = await devtools.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await devtools.send("DOM.querySelector", { nodeId: root.nodeId, selector: selecteurPolice });
  expect(nodeId).toBeGreaterThan(0);
  const policesRendues = await devtools.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(policesRendues.fonts.length).toBeGreaterThan(0);
  const famillesRendues = [...new Set(policesRendues.fonts.map((police: { familyName: string }) => police.familyName))];
  expect(famillesRendues.some((famille) => famille.startsWith("DM Sans"))).toBe(true);
  console.info(`[Chrome DevTools] Polices réellement utilisées : ${famillesRendues.join(", ")}`);
  await devtools.detach();

  await mkdir(dossierCaptures, { recursive: true });
  await page.screenshot({ path: resolve(dossierCaptures, "apres-tableau-bord-bureau.png"), fullPage: true });

  await page.goto("/ui-preview");
  await expect(page.getByRole("region", { name: "Carte interactive des provinces du Tchad" })).toBeVisible();
  await expect(page).toHaveURL(/\/ui-preview$/u);

  const reponseFiltreeAttendue = page.waitForResponse((reponse) => {
    const url = new URL(reponse.url());
    return url.pathname === "/api/rapports/tableau-de-bord" && url.searchParams.get("date_debut") === "2026-01-01";
  });
  await page.getByLabel("Date de début").fill("2026-01-01");
  await page.getByLabel("Date de fin").fill("2026-12-31");
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  const reponseFiltree = await reponseFiltreeAttendue;
  expect(reponseFiltree.ok()).toBeTruthy();
  const tableauFiltre = await reponseFiltree.json() as { periode: { date_debut: string; date_fin: string }; province_id: string };
  expect(tableauFiltre.periode).toEqual({ date_debut: "2026-01-01", date_fin: "2026-12-31" });
  expect(tableauFiltre.province_id).toBe("prov-sila");

  const refusInterprovincial = await page.context().request.get(new URL("/api/rapports/tableau-de-bord?province_id=prov-ouaddai", page.url()).toString());
  expect(refusInterprovincial.status()).toBe(403);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("region", { name: "Tableau de bord", exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: resolve(dossierCaptures, "apres-tableau-bord-mobile-ferme.png"), fullPage: true });
  await page.getByRole("button", { name: "Ouvrir le menu principal" }).click();
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Bénéficiaires", exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "Bénéficiaires", exact: true }).click();
  await expect(navigation.getByRole("menuitem", { name: "Registre des ménages" })).toBeVisible();
  await page.screenshot({ path: resolve(dossierCaptures, "apres-tableau-bord-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Fermer le menu principal" }).click();
  await page.getByRole("button", { name: "Activer le mode clair" }).click();
  await expect(page.locator(".sigad-preview")).not.toHaveClass(/sigad-preview--sombre/);
  await page.getByRole("button", { name: "Activer le mode sombre" }).click();
  await expect(page.locator(".sigad-preview")).toHaveClass(/sigad-preview--sombre/);
});

test("les menus, notifications et déconnexion restent accessibles par clavier et au délégué", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await connecterDansLeNavigateur(page, "sila");
  await page.goto("/tableau-de-bord");

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  for (const groupe of ["Bénéficiaires", "Opérations & aide", "Suivi & contrôle"]) {
    await expect(navigation.getByRole("button", { name: groupe, exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole("button", { name: "Administration", exact: true })).toHaveCount(0);

  const controle = navigation.getByRole("button", { name: "Suivi & contrôle", exact: true });
  await controle.click();
  const menuControle = navigation.getByRole("menu", { name: "Suivi & contrôle" });
  await expect(menuControle.getByRole("menuitem")).toHaveCount(5);
  const premierElement = menuControle.getByRole("menuitem").first();
  await premierElement.focus();
  await premierElement.press("ArrowDown");
  await expect(menuControle.getByRole("menuitem").nth(1)).toBeFocused();
  await menuControle.getByRole("menuitem", { name: "Notifications" }).click();
  await expect(page).toHaveURL(/\/controle\?vue=notifications$/u);
  await expect(page.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "true");

  await page.locator(".sigad-preview__profil-declencheur").click();
  await page.getByRole("menu", { name: "Mon compte" }).getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page.getByLabel("Identifiant")).toBeVisible();
});

test("l’administration centrale voit les modules autorisés et conserve le MFA", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await connecterDansLeNavigateur(page, "central");
  await page.goto("/ui-preview");

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("button", { name: "Bénéficiaires", exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Administration", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configurer l’authentification à deux facteurs" })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Bénéficiaires", exact: true }).click();
  await navigation.getByRole("menuitem", { name: "Registre des ménages" }).click();
  await expect(page.getByRole("heading", { name: "Registre des ménages" })).toBeVisible();
});

test("affiche les états vides et erreur lorsque les indicateurs ne sont pas disponibles", async ({ page }) => {
  await connecterDansLeNavigateur(page, "sila");
  await page.route("**/api/rapports/tableau-de-bord**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        perimetre: "PROVINCIAL",
        province_id: "prov-sila",
        periode: { date_debut: null, date_fin: null },
        indicateurs: {
          approvisionnements: 0, distributions: 0, menages_cibles_uniques: 0,
          menages_servis_uniques: 0, menages_partiellement_servis_uniques: 0,
          personnes_assistees_menages_uniques: 0, quantite_distribuee: 0,
          stock_disponible_comptable: 0, operations_cloturees: 0,
          operations_en_attente: 0, ecarts_non_resolus: 0,
        },
        evolution_mensuelle: [],
        ressources_d1: { lignes_lues: 0, duree_requetes_ms: 0 },
      }),
    });
  });
  await page.goto("/ui-preview");
  await expect(page.getByText("Aucune distribution sur la période")).toBeVisible();
  await expect(page.getByText("Indicateur indisponible")).toBeVisible();

  let terminerReponse: (() => void) | undefined;
  const enAttente = new Promise<void>((resolvePromise) => { terminerReponse = resolvePromise; });
  await page.route("**/api/rapports/tableau-de-bord**", async (route) => {
    await enAttente;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ erreur: "Service temporairement indisponible." }) });
  });
  await page.reload();
  await expect(page.locator(".sigad-preview__squelette--nombre").first()).toBeVisible();
  if (terminerReponse) terminerReponse();
  await expect(page.getByRole("alert")).toContainText("Service temporairement indisponible.");
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
});
