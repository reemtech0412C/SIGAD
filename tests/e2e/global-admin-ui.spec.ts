import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { connecterDansLeNavigateur, ouvrirElementNavigation } from "./authentification";

const dossierCaptures = resolve(process.cwd(), "docs/ui-shadcn-admin", "top-navigation", "global-admin-ui");
const graissesDMsans = [400, 500, 600, 700] as const;

const modulesProvinciaux = [
  { id: "beneficiaires", groupe: "Bénéficiaires", nom: "Registre des ménages", chemin: "/gestion/beneficiaires?vue=menages" },
  { id: "stocks", groupe: "Opérations & aide", nom: "Articles et stocks", chemin: "/stocks" },
  { id: "approvisionnements", groupe: "Opérations & aide", nom: "Approvisionnements", chemin: "/approvisionnements" },
  { id: "distributions", groupe: "Opérations & aide", nom: "Distributions provinciales", chemin: "/distributions" },
  { id: "controle", groupe: "Suivi & contrôle", nom: "Contrôles et audits", chemin: "/controle?vue=observations" },
  { id: "rapports", groupe: "Suivi & contrôle", nom: "Rapports et exports", chemin: "/rapports" },
] as const;

async function ouvrirModuleDepuisNavigation(page: Page, module: (typeof modulesProvinciaux)[number]): Promise<void> {
  await ouvrirElementNavigation(page, module.groupe, module.nom);
  await expect(page).toHaveURL(new RegExp(`${module.chemin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "u"));
  await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: module.groupe, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".sigad-app-brand__identity strong")).toHaveText("Système Intégré de Gestion et de Distribution des Aides");
}

async function verifierComposantsFonctionnels(page: Page, id: (typeof modulesProvinciaux)[number]["id"]): Promise<void> {
  if (id === "beneficiaires") {
    await expect(page.getByRole("navigation", { name: "Modules de gestion" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Registre des ménages" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer le ménage" })).toBeVisible();
  } else if (id === "stocks") {
    await expect(page.getByRole("navigation", { name: "Modules de stock" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "État physique, réservé et disponible" })).toBeVisible();
    await expect(page.getByLabel("Recherche")).toBeVisible();
  } else if (id === "approvisionnements") {
    await expect(page.getByRole("navigation", { name: "Fonctions des approvisionnements" })).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Fonctions des approvisionnements" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Réception provinciale" })).toBeVisible();
  } else if (id === "distributions") {
    await expect(page.getByRole("button", { name: "Nouvelle distribution" })).toBeVisible();
    await expect(page.getByLabel("Recherche")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  } else if (id === "controle") {
    await expect(page.getByRole("tablist", { name: "Modules de contrôle" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Observations" })).toHaveAttribute("aria-selected", "true");
  } else {
    await expect(page.getByLabel("Filtres des rapports")).toBeVisible();
    await expect(page.getByRole("button", { name: "Exporter le rapport" })).toBeVisible();
  }
}

async function verifierDMsansDansChrome(page: Page, reponsesPolice: Map<string, { statut: number; typeContenu: string | undefined }>): Promise<void> {
  const chargement = await page.evaluate(async (graisses) => {
    const essais = graisses.map((graisse) => document.fonts.load(`${graisse} 16px "DM Sans"`, "SIGAD Tchad 012345"));
    essais.push(document.fonts.load('italic 400 16px "DM Sans"', "SIGAD Tchad"));
    const fontes = await Promise.all(essais);
    await document.fonts.ready;
    return {
      etats: fontes.map((faces) => faces.map((face) => ({ famille: face.family, statut: face.status }))),
    };
  }, [...graissesDMsans]);

  expect(chargement.etats.flat().length).toBeGreaterThanOrEqual(graissesDMsans.length + 1);
  expect(chargement.etats.flat().every((face) => face.famille === "DM Sans" && face.statut === "loaded")).toBe(true);

  const session = await page.context().newCDPSession(page);
  const titre = page.locator(".sigad-app-brand__identity strong");
  const poidsInitial = await titre.evaluate((element) => element.style.fontWeight);
  try {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: ".sigad-app-brand__identity strong",
    });
    expect(nodeId).toBeGreaterThan(0);
    for (const graisse of graissesDMsans) {
      await titre.evaluate((element, poids) => {
        element.style.fontWeight = String(poids);
      }, graisse);
      expect(await titre.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(String(graisse));
      const plateformes = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(
        plateformes.fonts.some((font: { familyName: string; glyphCount: number }) => font.familyName.startsWith("DM Sans") && font.glyphCount > 0),
        `Chrome n’a pas rendu le titre avec DM Sans à la graisse ${graisse}: ${JSON.stringify(plateformes.fonts)}`,
      ).toBe(true);
    }
  } finally {
    await titre.evaluate((element, poids) => {
      if (poids) element.style.fontWeight = poids;
      else element.style.removeProperty("font-weight");
    }, poidsInitial);
    await session.detach();
  }

  const fichiersAttendus = [
    "/fonts/dm-sans/DMSans[opsz,wght].ttf",
    "/fonts/dm-sans/DMSans-Italic[opsz,wght].ttf",
  ];
  for (const chemin of fichiersAttendus) {
    const reponse = reponsesPolice.get(chemin);
    expect(reponse?.statut).toBe(200);
    expect(reponse?.typeContenu).toMatch(/^font\//u);
  }
}

test("les six modules réels utilisent le même AppShell et conservent leurs fonctions à 1440 et 390 px", async ({ page }) => {
  await mkdir(dossierCaptures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const reponsesPolice = new Map<string, { statut: number; typeContenu: string | undefined }>();
  page.on("response", (reponse) => {
    const chemin = decodeURIComponent(new URL(reponse.url()).pathname);
    if (chemin.startsWith("/fonts/dm-sans/")) {
      reponsesPolice.set(chemin, { statut: reponse.status(), typeContenu: reponse.headers()["content-type"] });
    }
  });
  await connecterDansLeNavigateur(page, "sila");
  await verifierDMsansDansChrome(page, reponsesPolice);
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });

  for (const module of modulesProvinciaux) {
    await ouvrirModuleDepuisNavigation(page, module);
    await expect(page.locator(".sigad-preview__entete-institutionnelle")).toBeVisible();
    await expect(page.locator(".sigad-top-navigation")).toBeVisible();
    await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
    const logo = page.locator(".sigad-app-brand__logo img");
    await expect(logo).toBeVisible();
    await logo.evaluate((image: HTMLImageElement) => image.decode());
    if (module.id === "beneficiaires") {
      await page.getByRole("button", { name: "Activer le mode clair" }).click();
      await expect(page.locator(".sigad-admin")).not.toHaveClass(/sigad-admin--sombre/u);
      await page.getByRole("button", { name: "Activer le mode sombre" }).click();
      await expect(page.locator(".sigad-admin")).toHaveClass(/sigad-admin--sombre/u);
    }
    const premierSelecteur = page.locator(".sigad-admin .contenu-tableau select").first();
    if (await premierSelecteur.count()) {
      const fondSelecteur = await premierSelecteur.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(fondSelecteur).not.toBe("rgb(255, 255, 255)");
    }
    if (module.id === "rapports") {
      const couleurTitre = await page.getByRole("heading", { name: "Évolution mensuelle" }).evaluate((element) => getComputedStyle(element).color);
      const fondEnTete = await page.locator(".module-rapports th").first().evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(couleurTitre).not.toBe("rgb(22, 51, 79)");
      expect(fondEnTete).not.toBe("rgb(243, 246, 249)");
    }
    await verifierComposantsFonctionnels(page, module.id);
    const indicateursChargement: Record<string, string> = {
      beneficiaires: "Chargement des données…",
      stocks: "Chargement des données…",
      distributions: "Chargement des distributions…",
      controle: "Chargement des données de contrôle…",
      rapports: "Chargement des indicateurs et des résultats…",
    };
    const messageChargement = indicateursChargement[module.id];
    if (messageChargement) {
      await expect(page.getByText(messageChargement, { exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: resolve(dossierCaptures, `${module.id}-desktop.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const module of modulesProvinciaux) {
    await page.goto(module.chemin);
    await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await expect(page.locator(".sigad-top-navigation")).toBeHidden();
    await page.getByRole("button", { name: "Ouvrir le menu principal" }).click();
    const boutonGroupe = navigation.getByRole("button", { name: module.groupe, exact: true });
    await expect(boutonGroupe).toBeVisible();
    await boutonGroupe.click();
    await expect(navigation.getByRole("menuitem", { name: module.nom, exact: true })).toBeVisible();
    await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
    await page.getByRole("button", { name: "Fermer le menu principal" }).click();
    await expect(navigation).toBeHidden();
    await page.screenshot({ path: resolve(dossierCaptures, `${module.id}-mobile.png`), fullPage: true });
  }
});

test("les liens affichés correspondent au rôle central et les routes interdites sont redirigées", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await connecterDansLeNavigateur(page, "central");
  await page.goto("/ui-preview");
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });

  for (const module of modulesProvinciaux) {
    await expect(navigation.getByRole("button", { name: module.groupe, exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole("button", { name: "Administration", exact: true })).toBeVisible();
  await page.goto("/administration/comptes");
  await expect(page).toHaveURL(/\/administration\/comptes$/u);
  const ongletsComptes = page.getByRole("tablist", { name: "Gestion des comptes" });
  await expect(ongletsComptes).toBeVisible();
  for (const indicateur of ["Demandes d’inscription", "Délégués provinciaux", "Comptes de consultation", "Historique des décisions"]) {
    await expect(ongletsComptes.getByRole("tab", { name: new RegExp(indicateur, "u") })).toBeVisible();
  }
});

test("les formulaires et filtres des six modules restent utilisables aux cinq largeurs de référence", async ({ page }) => {
  await connecterDansLeNavigateur(page, "sila");

  for (const module of modulesProvinciaux) {
    await page.goto(module.chemin);
    await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);

    for (const largeur of [1920, 1440, 1280, 768, 390] as const) {
      await page.setViewportSize({ width: largeur, height: largeur === 390 ? 844 : 960 });
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", largeur);
      await expect(page.locator(".sigad-admin .contenu-tableau")).toBeVisible();

      if (largeur > 960) {
        await expect(page.locator(".sigad-top-navigation")).toBeVisible();
      } else {
        await expect(page.locator(".sigad-top-navigation")).toBeHidden();
        await expect(page.getByRole("button", { name: "Ouvrir le menu principal" })).toBeVisible();
        await page.getByRole("button", { name: "Ouvrir le menu principal" }).click();
        await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Fermer le menu principal" })).toHaveAttribute("aria-expanded", "true");
        await page.getByRole("button", { name: "Fermer le menu principal" }).click();
      }

      const filtres = page.locator(".sigad-admin .sigad-filter-bar");
      if (module.id === "beneficiaires" || module.id === "stocks" || module.id === "approvisionnements" || module.id === "distributions" || module.id === "controle" || module.id === "rapports") {
        await expect(filtres.first()).toBeVisible();
        const largeurFiltres = await filtres.first().evaluate((element) => Math.round(element.getBoundingClientRect().width));
        expect(largeurFiltres).toBeGreaterThan(0);
        expect(largeurFiltres).toBeLessThanOrEqual(largeur);
      }
    }

    if (module.id === "approvisionnements") {
      const statut = page.getByRole("combobox", { name: "Statut des expéditions" });
      const reponseFiltrage = page.waitForResponse((reponse) => {
        const url = new URL(reponse.url());
        return url.pathname === "/api/provincial/expeditions" && url.searchParams.get("statut") === "EN_ROUTE" && reponse.status() === 200;
      });
      await statut.selectOption("EN_ROUTE");
      await reponseFiltrage;
      await expect(page.locator(".module-approvisionnements tbody tr").first()).toContainText("EN_ROUTE");
      await statut.selectOption("");
    }
  }

  await page.goto("/controle?vue=observations");
  const controle = page.getByRole("region", { name: "Filtres du contrôle" });
  await expect(controle.getByLabel("Type d’opération")).toHaveCount(0);
  await controle.getByRole("button", { name: "Plus de filtres" }).focus();
  await page.keyboard.press("Enter");
  await expect(controle.getByLabel("Type d’opération")).toBeVisible();

  await page.goto("/rapports");
  const rapports = page.getByRole("region", { name: "Filtres des rapports" });
  await expect(rapports.getByLabel("Nature d’aide")).toHaveCount(0);
  await rapports.getByRole("button", { name: "Plus de filtres" }).click();
  await expect(rapports.getByLabel("Nature d’aide")).toBeVisible();
});
