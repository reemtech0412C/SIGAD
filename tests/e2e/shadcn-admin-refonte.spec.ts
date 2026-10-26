import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { connecterDansLeNavigateur, deconnecterDansLeNavigateur } from "./authentification";

const dossierCaptures = resolve(process.cwd(), "docs/ui-shadcn-admin", "top-navigation");

const RESOLUTIONS_OBLIGATOIRES = [
  { nom: "desktop-1440x900", width: 1440, height: 900 },
  { nom: "desktop-1280x800", width: 1280, height: 800 },
  { nom: "tablet-768x1024", width: 768, height: 1024 },
  { nom: "mobile-390x844", width: 390, height: 844 },
  { nom: "mobile-small-360x800", width: 360, height: 800 },
] as const;

test.describe("SIGAD — Navigation supérieure & Panneaux latéraux", () => {
  test("1. Navigation supérieure, raccourcis clavier, fil d’Ariane et filtrage RBAC", async ({
    page,
  }) => {
    await mkdir(dossierCaptures, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Connexion Administration centrale
    await connecterDansLeNavigateur(page, "central");

    const navigation = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(navigation).toBeVisible();
    await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);

    for (const libelleGroupe of ["Tableau de bord", "Opérations & aide", "Bénéficiaires", "Territoire", "Suivi & contrôle", "Administration"]) {
      await expect(navigation.getByRole("button", { name: libelleGroupe, exact: true })).toBeVisible();
    }

    // Le menu s’ouvre au clavier et Échap rend le focus au déclencheur.
    const boutonGroupeTerritoire = navigation.getByRole("button", { name: "Territoire", exact: true });
    await boutonGroupeTerritoire.focus();
    await page.keyboard.press("ArrowDown");
    const menuTerritoire = navigation.getByRole("menu", { name: "Territoire" });
    const lienLocalites = menuTerritoire.getByRole("menuitem", { name: "Villes, quartiers et localités" });
    await expect(menuTerritoire.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menuTerritoire.getByRole("menuitem", { name: "Provinces et départements" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(lienLocalites).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(boutonGroupeTerritoire).toBeFocused();

    await boutonGroupeTerritoire.click();
    await expect(lienLocalites).toBeVisible();
    await lienLocalites.click();

    await expect(page).toHaveURL(/\/territoire\?vue=recherche$/u);
    await expect(page.locator(".sigad-territoire-meta")).toContainText("23 provinces");
    await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);
    await expect(navigation.getByRole("button", { name: "Territoire", exact: true })).toHaveAttribute("aria-current", "page");

    // Rafraîchissement navigateur : conservation de l'état actif et de la page
    await page.reload();
    await expect(page).toHaveURL(/\/territoire\?vue=recherche$/u);
    await navigation.getByRole("button", { name: "Territoire", exact: true }).click();
    await expect(navigation.getByRole("menuitem", { name: "Villes, quartiers et localités" })).toHaveAttribute("aria-current", "page");

    await page.screenshot({
      path: resolve(dossierCaptures, "navigation-superieure-1440x900.png"),
      fullPage: true,
    });

    // Déconnexion et connexion Délégué provincial (Sila) pour vérifier le filtrage RBAC
    await deconnecterDansLeNavigateur(page);
    await connecterDansLeNavigateur(page, "sila");

    await expect(navigation.getByRole("button", { name: "Administration", exact: true })).toHaveCount(0);
    await expect(navigation.getByRole("button", { name: "Territoire", exact: true })).toBeVisible();
    await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
  });

  test("1.b Navigation propriétaire et accès aux modules sensibles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await connecterDansLeNavigateur(page, "proprietaire");

    const navigation = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(navigation).toBeVisible();
    await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
    await expect(navigation.getByRole("button", { name: "Administration du système", exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Navigation administration propriétaire" }))
      .toBeVisible();
    await expect(page.getByRole("tab", { name: /Gestion des données de test/u })).toBeVisible();
  });

  test("2. Panneaux latéraux animés (SIGADFormPanel), garde de modifications non enregistrées et création territoriale dynamique", async ({
    page,
  }) => {
    await mkdir(dossierCaptures, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await connecterDansLeNavigateur(page, "central");
    await page.goto("/gestion/beneficiaires?vue=menages");
    await expect(page.getByRole("heading", { name: "Registre des ménages" })).toBeVisible();

    // Saisir un nom de chef de ménage dans le formulaire parent pour vérifier qu'il est préservé
    const champChefMenage = page.locator("#nom-chef-menage");
    await champChefMenage.fill("Amina Mahamat Test Panneau");

    // Sélectionner une province et un département dans SelecteurLocalisationDynamique
    const selectProvince = page.locator("#territoire-Province");
    await selectProvince.selectOption("prov-sila");

    const selectDepartement = page.locator("#territoire-Departement");
    await expect(selectDepartement).toBeEnabled();
    await selectDepartement.selectOption({ index: 1 });

    // Cliquer sur "+ Ajouter" pour le département (disponible pour ADMIN_CENTRAL)
    const boutonAjouterDep = page
      .locator(".champ-territorial:has(#territoire-Departement)")
      .getByRole("button", { name: "+ Ajouter" });
    await expect(boutonAjouterDep).toBeVisible();
    await boutonAjouterDep.click();

    // Vérifier que le panneau latéral SIGADFormPanel s'ouvre à droite (et non une modale centrale)
    const panneauLateral = page.locator('[role="dialog"][data-panel-type="side-panel"]');
    await expect(panneauLateral).toBeVisible();
    await expect(page.locator(".sigad-modal-backdrop")).toHaveCount(0);
    await expect(panneauLateral).toContainText("Ajouter : Département");

    // Capture du panneau latéral ouvert sur Desktop
    await page.screenshot({
      path: resolve(dossierCaptures, "side-panel-ajout-territoire-1440x900.png"),
      fullPage: false,
    });

    // Tester la protection contre la perte de saisie non enregistrée
    const champNomUnite = panneauLateral.locator("#modal-ajout-nom");
    await champNomUnite.fill("Département Test Brouillon");

    // Tenter de fermer par Échap -> la barre d'alerte de modifications non enregistrées doit s'afficher
    await page.keyboard.press("Escape");
    const gardeNonEnregistre = panneauLateral.locator(".sigad-side-panel__unsaved-guard");
    await expect(gardeNonEnregistre).toBeVisible();
    await expect(gardeNonEnregistre).toContainText("Des modifications non enregistrées seront perdues");

    // Cliquer sur "Continuer la saisie" -> le panneau reste ouvert avec la valeur saisie
    await gardeNonEnregistre.getByRole("button", { name: "Continuer la saisie" }).click();
    await expect(gardeNonEnregistre).toHaveCount(0);
    await expect(champNomUnite).toHaveValue("Département Test Brouillon");

    // Fermer en confirmant l'abandon
    await panneauLateral.getByRole("button", { name: "Fermer le panneau latéral" }).click();
    await expect(gardeNonEnregistre).toBeVisible();
    await gardeNonEnregistre.getByRole("button", { name: "Abandonner les modifications" }).click();
    await expect(panneauLateral).toHaveCount(0);

    // Choisir le milieu Urbain et ajouter une ville dynamiquement via le panneau latéral
    await page.locator("#territoire-milieu").selectOption("URBAIN");
    const boutonAjouterVille = page
      .locator(".champ-territorial:has(#territoire-Ville)")
      .getByRole("button", { name: "+ Ajouter" });
    await boutonAjouterVille.click();

    await expect(panneauLateral).toBeVisible();
    await expect(panneauLateral).toContainText("Ajouter : Ville");
    const nomVilleCreee = `Ville E2E ${Date.now()}`;
    await panneauLateral.locator("#modal-ajout-nom").fill(nomVilleCreee);
    await panneauLateral.getByRole("button", { name: "Enregistrer et sélectionner" }).click();

    // Le panneau se ferme et la ville est immédiatement sélectionnée
    await expect(panneauLateral).toHaveCount(0);
    await expect(page.locator(".selecteur-localisation")).toContainText(nomVilleCreee);

    // Le formulaire parent a intégralement conservé sa saisie
    await expect(champChefMenage).toHaveValue("Amina Mahamat Test Panneau");

    // Tester le panneau latéral "Proposer une modification territoriale" avec ADMIN_CENTRAL
    const boutonProposerModif = page.getByRole("button", {
      name: "Proposer une modification territoriale",
    });
    await expect(boutonProposerModif).toBeEnabled();
    await boutonProposerModif.click();

    await expect(panneauLateral).toBeVisible();
    await expect(panneauLateral).toContainText("Proposer une modification territoriale");
    await page.screenshot({
      path: resolve(dossierCaptures, "side-panel-correction-territoriale-1440x900.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await expect(panneauLateral).toHaveCount(0);

    // N'Djaména conserve son rattachement urbain particulier sans département.
    await selectProvince.selectOption("prov-ndjamena");
    await expect(page.locator("#territoire-Departement")).toHaveCount(0);
    const arrondissementNdjamena = page.locator("#territoire-Arrondissement");
    await expect(arrondissementNdjamena).toBeEnabled();
    await expect(arrondissementNdjamena.locator('option[value="arr-ndj-1"]')).toBeAttached();
    await arrondissementNdjamena.selectOption("arr-ndj-1");
    const quartierNdjamena = page.locator("#territoire-Quartier");
    await expect(quartierNdjamena).toBeEnabled();
    await expect(quartierNdjamena.locator('option[value="qrt-ndj-1-farcha"]')).toBeAttached();
    await quartierNdjamena.selectOption("qrt-ndj-1-farcha");
    await expect(quartierNdjamena).toHaveValue("qrt-ndj-1-farcha");
  });

  test("3. Vérification responsive et captures d'écran aux 5 résolutions obligatoires (1440x900, 1280x800, 768x1024, 390x844, 360x800)", async ({
    page,
  }) => {
    await mkdir(dossierCaptures, { recursive: true });
    await connecterDansLeNavigateur(page, "central");

    for (const res of RESOLUTIONS_OBLIGATOIRES) {
      await page.setViewportSize({ width: res.width, height: res.height });
      await page.goto("/territoire?vue=dashboard");
      await expect(page.locator(".sigad-territoire-meta")).toContainText("23 provinces");
      await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);

      // Vérifier l'absence de débordement horizontal
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(res.width);

      // Sur tablette et mobile (<= 960px), ouvrir et capturer le menu déroulant sous l’en-tête.
      if (res.width <= 960) {
        const boutonMenu = page.getByRole("button", { name: "Ouvrir le menu principal" });
        await expect(boutonMenu).toBeVisible();
        await boutonMenu.click();
        await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
        await expect(page.locator("aside.sigad-sidebar, .sigad-sidebar-mobile-backdrop, .sigad-preview__barre-laterale")).toHaveCount(0);
        await expect(page.locator("body")).toHaveJSProperty("scrollWidth", res.width);
        await page.screenshot({
          path: resolve(dossierCaptures, `navigation-mobile-ouverte-${res.nom}.png`),
          fullPage: false,
        });
        await page.getByRole("button", { name: "Fermer le menu principal" }).click();
      }

      await page.screenshot({
        path: resolve(dossierCaptures, `territoire-${res.nom}.png`),
        fullPage: true,
      });
    }
  });
});
