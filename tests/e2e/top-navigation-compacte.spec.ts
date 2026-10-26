import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { connecterDansLeNavigateur } from "./authentification";

const dossierCaptures = resolve(process.cwd(), "docs/screenshots/optimisation-interface");
const resolutions = [
  { nom: "desktop-1440x900", width: 1440, height: 900 },
  { nom: "desktop-1280x800", width: 1280, height: 800 },
  { nom: "tablet-768x1024", width: 768, height: 1024 },
  { nom: "mobile-390x844", width: 390, height: 844 },
  { nom: "mobile-360x800", width: 360, height: 800 },
] as const;

const pages = [
  { id: "tableau-de-bord", chemin: "/tableau-de-bord", groupe: "Tableau de bord", entree: "Vue d’ensemble", preuve: "Indicateurs clés" },
  { id: "operations-centrales", chemin: "/operations-centrales", groupe: "Opérations & aide", entree: "Opérations centrales", preuve: "Nouvelle opération centrale" },
  { id: "gestion-des-comptes", chemin: "/administration/comptes", groupe: "Administration", entree: "Gestion des comptes", preuve: "Demandes d’inscription" },
  { id: "referentiel-territorial", chemin: "/territoire?vue=dashboard", groupe: "Territoire", entree: "Vue d’ensemble territoriale", preuve: "23 provinces · 112 départements" },
  { id: "beneficiaires", chemin: "/gestion/beneficiaires?vue=menages", groupe: "Bénéficiaires", entree: "Registre des ménages", preuve: "Enregistrer un ménage" },
] as const;

test("identité, navigation exclusive, contenu compact, CSP et captures responsive des pages principales", async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(dossierCaptures, { recursive: true });
  const policesExternes: string[] = [];
  const erreursCsp: string[] = [];
  page.on("request", (requete) => {
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/u.test(requete.url())) policesExternes.push(requete.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Content-Security-Policy|blocked by CSP/u.test(message.text())) {
      erreursCsp.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await connecterDansLeNavigateur(page, "central");

  for (const resolution of resolutions) {
    await page.setViewportSize({ width: resolution.width, height: resolution.height });
    for (const cible of pages) {
      await page.goto(cible.chemin);
      const shell = page.locator(".sigad-admin");
      await expect(shell).toBeVisible();
      await expect(shell.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);
      await expect(page.locator(".sigad-app-brand__identity strong")).toHaveText(
        "Système Intégré de Gestion et de Distribution des Aides",
      );
      await expect(page.locator(".sigad-app-brand")).not.toContainText("SIGAD TCHAD");
      await expect(page.locator(".sigad-app-brand")).not.toContainText("Gouvernance & Aides");
      await expect(page.locator(".sigad-app-breadcrumb")).toHaveCount(0);

      const logo = page.locator(".sigad-app-brand__logo img");
      await expect(logo).toBeVisible();
      const dimensionsLogo = await logo.evaluate((image: HTMLImageElement) => {
        const boite = image.getBoundingClientRect();
        return { src: new URL(image.src).pathname, hauteur: boite.height, largeur: boite.width, ratioNaturel: image.naturalWidth / image.naturalHeight };
      });
      expect(dimensionsLogo.src).toBe("/images/sigad-logo.png");
      expect(dimensionsLogo.largeur / dimensionsLogo.hauteur).toBeCloseTo(dimensionsLogo.ratioNaturel, 1);
      if (resolution.width <= 600) expect(dimensionsLogo.hauteur).toBeGreaterThanOrEqual(40);
      if (resolution.width > 960) expect(dimensionsLogo.hauteur).toBeGreaterThanOrEqual(48);

      const contenu = page.getByText(cible.preuve, { exact: false }).first();
      await expect(contenu).toBeVisible();
      const largeurDefilable = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
      expect(largeurDefilable).toBeLessThanOrEqual(resolution.width);

      const navigation = page.getByRole("navigation", { name: "Navigation principale" });
      const boutonMobile = page.getByRole("button", { name: "Ouvrir le menu principal" });
      if (resolution.width > 960) {
        await expect(navigation).toBeVisible();
      } else {
        await expect(boutonMobile).toBeVisible();
        await expect(navigation).toBeHidden();
        await boutonMobile.click();
        await expect(navigation).toBeVisible();
        const mastheadBas = await page.locator(".sigad-app-masthead").evaluate((element) => element.getBoundingClientRect().bottom);
        const navigationHaut = await navigation.evaluate((element) => element.getBoundingClientRect().top);
        expect(navigationHaut).toBeGreaterThanOrEqual(mastheadBas - 1);
      }

      await navigation.getByRole("button", { name: cible.groupe, exact: true }).click();
      await expect(navigation.getByRole("menuitem", { name: cible.entree })).toBeVisible();
      await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
      await expect(page.locator(".sigad-side-panel")).toHaveCount(0);

      if (resolution.width <= 960) {
        await page.getByRole("button", { name: "Fermer le menu principal" }).click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.screenshot({
        path: resolve(dossierCaptures, `${cible.id}-${resolution.nom}.png`),
        fullPage: false,
      });
    }
  }

  const dmSansCharge = await page.evaluate(async () => {
    await document.fonts.load('400 16px "DM Sans"', "SIGAD 012345");
    return document.fonts.check('400 16px "DM Sans"');
  });
  expect(dmSansCharge).toBe(true);
  expect(policesExternes).toEqual([]);
  expect(erreursCsp).toEqual([]);
});
