import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { connecterDansLeNavigateur, ouvrirModule } from "./authentification";

const dossierCaptures = resolve(process.cwd(), "docs/ui-map-1.6");

interface ValeurCarteE2E {
  valeur: number | null;
  etat: string;
}

interface ProvinceCarteE2E {
  province_id: string;
  distributions_realisees: ValeurCarteE2E;
  distributions_en_cours: ValeurCarteE2E;
  menages_servis: ValeurCarteE2E;
  stocks_disponibles: { valeur: number | null; unite_code: string | null; unite_libelle: string | null; etat: string };
}

interface ReponseCarteE2E {
  perimetre: string;
  provinces: ProvinceCarteE2E[];
}

function provinceDansReponse(reponse: ReponseCarteE2E, provinceId: string): ProvinceCarteE2E {
  const province = reponse.provinces.find((element) => element.province_id === provinceId);
  if (!province) throw new Error(`La réponse de la carte ne contient pas ${provinceId}.`);
  return province;
}

async function cliquerSurUneSurfaceVisible(page: Page, province: Locator): Promise<void> {
  await province.scrollIntoViewIfNeeded();
  const point = await province.evaluate((element) => {
    const chemin = element as SVGGeometryElement;
    const boite = chemin.getBBox();
    const matrice = chemin.getScreenCTM();
    const svg = chemin.ownerSVGElement;
    if (!matrice || !svg) return null;
    for (let ligne = 1; ligne < 20; ligne += 1) {
      for (let colonne = 1; colonne < 20; colonne += 1) {
        const pointSvg = svg.createSVGPoint();
        pointSvg.x = boite.x + (boite.width * colonne) / 20;
        pointSvg.y = boite.y + (boite.height * ligne) / 20;
        if (!chemin.isPointInFill(pointSvg)) continue;
        const pointEcran = pointSvg.matrixTransform(matrice);
        if (pointEcran.x < 0 || pointEcran.y < 0 || pointEcran.x >= window.innerWidth || pointEcran.y >= window.innerHeight) continue;
        if (document.elementFromPoint(pointEcran.x, pointEcran.y) !== chemin) continue;
        return { x: pointEcran.x, y: pointEcran.y };
      }
    }
    return null;
  });
  if (!point) throw new Error("Aucun point cliquable visible n’a été trouvé dans la province ciblée.");
  await page.mouse.click(point.x, point.y);
}

test("la carte locale respecte le périmètre provincial et expose les 23 limites de référence", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir(dossierCaptures, { recursive: true });

  const geojson = await request.get("/data/tchad-admin1-ocha-v01.geojson");
  expect(geojson.status()).toBe(200);
  const donnees = await geojson.json() as { type: string; features: Array<{ properties: Record<string, unknown> & { adm1_pcode: string } }> };
  expect(donnees.type).toBe("FeatureCollection");
  expect(donnees.features).toHaveLength(23);
  expect(donnees.features.every((feature) => !Object.keys(feature.properties).some((cle) => /menage|beneficiaire|distribution|stock|indicateur/iu.test(cle)))).toBeTruthy();

  await connecterDansLeNavigateur(page, "sila");
  const indicateursAttendus = page.waitForResponse((reponse) => new URL(reponse.url()).pathname === "/api/rapports/indicateurs-carte");
  await ouvrirModule(page, "Tableau de bord");
  const reponseIndicateurs = await indicateursAttendus;
  expect(reponseIndicateurs.status()).toBe(200);
  const donneesIndicateurs: unknown = await reponseIndicateurs.json();
  expect(donneesIndicateurs).toMatchObject({ mode_donnees: "SYNTHETIQUES", perimetre: "PROVINCIAL" });
  expect(JSON.stringify(donneesIndicateurs)).not.toContain("menage_id");
  await expect(page).toHaveURL(/\/tableau-de-bord$/u);
  const carte = page.getByRole("region", { name: "Carte interactive des provinces du Tchad" });
  await expect(carte).toBeVisible();
  await expect(carte.getByRole("group", { name: "Carte des 23 provinces du Tchad" })).toBeVisible();
  const provinces = carte.locator('path[role="button"]');
  await expect(provinces).toHaveCount(23);
  const sila = carte.locator('path[aria-label^="Sila, code TCD21"]');
  const ouaddai = carte.locator('path[aria-label^="Ouaddaï, code TCD14"]');
  await expect(sila).toHaveAttribute("aria-pressed", "true");
  await expect(ouaddai).toHaveAttribute("aria-disabled", "true");
  await expect(ouaddai).toHaveAttribute("tabindex", "-1");
  await ouaddai.dispatchEvent("click");
  await expect(ouaddai).toHaveAttribute("aria-pressed", "false");
  await expect(carte.getByText("Jeu de données synthétiques de validation")).toBeVisible();
  await expect(carte).toContainText("Données indisponibles");
  await expect(carte).toContainText("Valeur exacte · données D1");
  await expect(carte).toContainText("Limites administratives indicatives — source OCHA/HDX, homologation juridique non confirmée.");
  await expect(carte).toContainText("Sila");
  const largeurDebordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largeurDebordement).toBeLessThanOrEqual(1);
  await page.screenshot({ path: resolve(dossierCaptures, "carte-sila-bureau.png"), fullPage: true });

  const modeClair = page.getByRole("button", { name: "Activer le mode clair" });
  await modeClair.click();
  await expect(carte.locator("svg")).toBeVisible();
  await page.screenshot({ path: resolve(dossierCaptures, "carte-sila-bureau-clair.png"), fullPage: true });
});

test("l’administration centrale peut sélectionner une province sur la carte", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir(dossierCaptures, { recursive: true });
  await connecterDansLeNavigateur(page, "central");
  const indicateursAttendus = page.waitForResponse((reponse) => new URL(reponse.url()).pathname === "/api/rapports/indicateurs-carte");
  await ouvrirModule(page, "Tableau de bord");
  const reponseInitiale = await indicateursAttendus;
  expect(reponseInitiale.status()).toBe(200);
  const donneesInitiales = await reponseInitiale.json() as ReponseCarteE2E;
  expect(donneesInitiales).toMatchObject({ mode_donnees: "SYNTHETIQUES", perimetre: "NATIONAL" });
  expect(JSON.stringify(donneesInitiales)).not.toContain("identite_recepteur");
  const carte = page.getByRole("region", { name: "Carte interactive des provinces du Tchad" });
  await expect(carte).toBeVisible();
  const details = carte.locator("aside");
  const selecteurProvince = carte.getByLabel("Province sélectionnée sur la carte");
  await selecteurProvince.selectOption("prov-sila");
  await page.mouse.move(1, 1);
  const initialSila = provinceDansReponse(donneesInitiales, "prov-sila");
  expect(initialSila.distributions_realisees.valeur).toBe(1);
  await expect(details).toContainText("Distributions réalisées");
  await expect(details).toContainText("1");

  const couleurRealisees = await carte.locator('path[aria-label^="Sila, code TCD21"]').getAttribute("style");
  const changementPeriode = page.waitForResponse((reponse) => {
    const url = new URL(reponse.url());
    return url.pathname === "/api/rapports/indicateurs-carte" && url.searchParams.get("date_debut") === "2020-01-01"
      && url.searchParams.get("date_fin") === "2020-01-31";
  });
  await carte.getByLabel("Début de période de la carte").fill("2020-01-01");
  await carte.getByLabel("Fin de période de la carte").fill("2020-01-31");
  const reponsePeriode = await changementPeriode;
  expect(reponsePeriode.status()).toBe(200);
  const donneesPeriode = await reponsePeriode.json() as ReponseCarteE2E;
  expect(provinceDansReponse(donneesPeriode, "prov-sila").distributions_realisees.valeur).toBe(0);
  await expect(details).toContainText("0");

  const periodeCourante = page.waitForResponse((reponse) => {
    const url = new URL(reponse.url());
    return url.pathname === "/api/rapports/indicateurs-carte" && url.searchParams.get("date_debut") === "2026-10-01"
      && url.searchParams.get("date_fin") === "2026-10-31";
  });
  await carte.getByLabel("Début de période de la carte").fill("2026-10-01");
  await carte.getByLabel("Fin de période de la carte").fill("2026-10-31");
  const reponsePeriodeCourante = await periodeCourante;
  expect(reponsePeriodeCourante.status()).toBe(200);
  const donneesPeriodeCourante = await reponsePeriodeCourante.json() as ReponseCarteE2E;

  const changementEnCours = page.waitForResponse((reponse) => new URL(reponse.url()).pathname === "/api/rapports/indicateurs-carte");
  await carte.getByLabel("Indicateur cartographique").selectOption("distributions_en_cours");
  const reponseEnCours = await changementEnCours;
  expect(reponseEnCours.status()).toBe(200);
  const donneesEnCours = await reponseEnCours.json() as ReponseCarteE2E;
  expect(provinceDansReponse(donneesEnCours, "prov-sila").distributions_en_cours.valeur).toBe(0);
  await expect(details).toContainText("Distributions en cours");
  await expect(details).toContainText("0");
  await expect(carte).toContainText("la période ne s’applique pas aux opérations en cours");

  const changementMenages = page.waitForResponse((reponse) => new URL(reponse.url()).pathname === "/api/rapports/indicateurs-carte");
  await carte.getByLabel("Indicateur cartographique").selectOption("menages_servis");
  const reponseMenages = await changementMenages;
  expect(reponseMenages.status()).toBe(200);
  const donneesMenages = await reponseMenages.json() as ReponseCarteE2E;
  expect(provinceDansReponse(donneesMenages, "prov-sila").menages_servis.valeur).toBe(2);
  await expect(details).toContainText("Ménages servis");
  await expect(details).toContainText("2");

  const changementStock = page.waitForResponse((reponse) => new URL(reponse.url()).pathname === "/api/rapports/indicateurs-carte");
  await carte.getByLabel("Indicateur cartographique").selectOption("stocks_disponibles");
  const reponseStockInitiale = await changementStock;
  expect(reponseStockInitiale.status()).toBe(200);
  await expect(details).toContainText("Sélectionnez un article pour afficher un stock dans son unité de mesure.");
  const ouaddai = carte.locator('path[aria-label^="Ouaddaï, code TCD14"]');
  await expect(ouaddai).toHaveAttribute("aria-disabled", "false");
  const selecteurArticle = carte.getByLabel("Article pour le stock");
  await expect(selecteurArticle).toBeEnabled();
  await carte.getByLabel("Rechercher un article").fill("Riz synthétique Phase 6");
  await expect.poll(async () => selecteurArticle.locator("option").filter({ hasText: "Riz synthétique Phase 6" }).count()).toBe(1);
  const articleOption = selecteurArticle.locator("option").filter({ hasText: "Riz synthétique Phase 6" });
  const articleId = await articleOption.getAttribute("value");
  expect(articleId).toBeTruthy();
  const couleurAvantStock = await carte.locator('path[aria-label^="Sila, code TCD21"]').getAttribute("style");
  const reponseStockAttendue = page.waitForResponse((reponse) => {
    const url = new URL(reponse.url());
    return url.pathname === "/api/rapports/indicateurs-carte" && url.searchParams.get("article_id") === articleId;
  });
  await selecteurArticle.selectOption(articleId ?? "");
  const reponseStock = await reponseStockAttendue;
  expect(reponseStock.status()).toBe(200);
  const donneesStock = await reponseStock.json() as ReponseCarteE2E;
  const stockSila = provinceDansReponse(donneesStock, "prov-sila").stocks_disponibles;
  expect(stockSila.etat).toBe("DISPONIBLE");
  expect(stockSila.valeur).not.toBeNull();
  expect(stockSila.unite_code).toBe("KG");
  expect(stockSila.unite_libelle).toBe("Kilogramme");
  const stockSilaFormate = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(stockSila.valeur ?? 0);
  await selecteurProvince.selectOption("prov-sila");
  await page.mouse.move(1, 1);
  await expect(details).toContainText("Stocks disponibles");
  await expect(details).toContainText(`${stockSilaFormate} ${stockSila.unite_libelle}`);
  await expect(details).toContainText("Riz synthétique Phase 6");
  const couleurApresStock = await carte.locator('path[aria-label^="Sila, code TCD21"]').getAttribute("style");
  expect(couleurApresStock).not.toBe(couleurAvantStock);
  expect(couleurAvantStock).not.toBe(couleurRealisees);
  expect(donneesPeriodeCourante.perimetre).toBe("NATIONAL");
  await cliquerSurUneSurfaceVisible(page, ouaddai);
  await expect(selecteurProvince).toHaveValue("prov-ouaddai");
  const stockOuaddai = provinceDansReponse(donneesStock, "prov-ouaddai").stocks_disponibles;
  expect(stockOuaddai.etat).toBe("DISPONIBLE");
  expect(stockOuaddai.valeur).not.toBeNull();
  const stockOuaddaiFormate = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(stockOuaddai.valeur ?? 0);
  await expect(details).toContainText(`${stockOuaddaiFormate} ${stockOuaddai.unite_libelle}`);
  await selecteurProvince.selectOption("prov-sila");
  await page.mouse.move(1, 1);
  await expect(details).toContainText(`${stockSilaFormate} ${stockSila.unite_libelle}`);
  const largeurBureau = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largeurBureau).toBeLessThanOrEqual(1);
  const largeurDebordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largeurDebordement).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(dossierCaptures, "carte-centrale-mobile-synthetique.png"), fullPage: true });
});
