import { expect, test } from "@playwright/test";
import { connecterDansLeNavigateur, deconnecterDansLeNavigateur } from "./authentification";

test.skip(
  process.env.SIGAD_PHASE114_ACTIVATION !== "1",
  "Parcours historique du référentiel communes (Phase 11.4), retiré par la migration 0035; le parcours courant utilise les localités dynamiques et est couvert par shadcn-admin-refonte, modules-provinciaux et z-parcours-operationnel.",
);

test("affiche uniquement les communes de la province et bloque l’enregistrement sans rattachement vérifié", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await connecterDansLeNavigateur(page, "sila");
  await expect(page.getByRole("heading", { name: "Enregistrer un ménage" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const boutonMenuMobile = page.getByRole("button", { name: "Ouvrir le menu principal" });
  await expect(boutonMenuMobile).toBeVisible();
  await boutonMenuMobile.click();
  await expect(page.getByRole("button", { name: "Fermer le menu principal" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();

  const communesSila = await page.evaluate(async () => {
    const response = await fetch("/api/territoire/communes?province_id=prov-sila&limite=40&decalage=0");
    return {
      status: response.status,
      payload: await response.json() as { elements?: { id: string; province_id: string }[]; total?: number },
    };
  });
  expect(communesSila.status).toBe(200);
  expect(communesSila.payload.elements?.filter((commune) => commune.id.startsWith("commune-lo015-"))).toHaveLength(19);
  expect(communesSila.payload.elements?.every((commune) => commune.province_id === "prov-sila")).toBe(true);

  const communesOuaddai = await page.evaluate(async () => {
    const response = await fetch("/api/territoire/communes?province_id=prov-ouaddai&limite=40&decalage=0");
    return { status: response.status, body: await response.text() };
  });
  expect([403, 404]).toContain(communesOuaddai.status);
  expect(communesOuaddai.body).not.toContain("elements");
  expect(communesOuaddai.body).not.toContain("Ouaddaï");

  await page.setViewportSize({ width: 1440, height: 1000 });
  const choixDepartement = page.getByLabel("Département *");
  if (await choixDepartement.isEnabled()) await choixDepartement.selectOption("dep-test-sila");
  const rechercheCommune = page.getByLabel("Rechercher une commune");
  await expect(rechercheCommune).toBeEnabled();
  await rechercheCommune.fill("BIYERE");
  const choixCommune = page.getByLabel("Commune", { exact: true });
  await expect(choixCommune).toBeEnabled();
  await expect(choixCommune.locator("option")).toHaveCount(2);
  await expect(choixCommune.locator("option").nth(1)).toContainText("Biyeré");
  await choixCommune.focus();
  await choixCommune.press("ArrowDown");
  await choixCommune.press("Enter");
  await expect(choixCommune).toHaveValue("commune-lo015-407");
  await expect(page.getByText("Commune sélectionnée : Biyeré")).toBeVisible();
  await rechercheCommune.fill("commune introuvable");
  await expect(page.getByRole("status").filter({ hasText: "Aucune autre commune ne correspond" })).toBeVisible();
  await expect(choixCommune).toHaveValue("commune-lo015-407");
  await rechercheCommune.fill("biyere");
  await expect(page.getByRole("note")).toContainText("Aucun lien avec un département ou une sous-préfecture n’est présumé");
  const natureLieu = page.getByLabel("Nature du lieu");
  if (await natureLieu.isEnabled()) {
    await natureLieu.selectOption("VILLAGE");
    await expect(page.getByLabel("Village")).toBeDisabled();
  } else {
    await expect(natureLieu).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Enregistrer le ménage" })).toBeDisabled();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "Enregistrer un ménage" })).toBeVisible();
});

test("un compte central autorisé recherche une commune dans une autre province", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await connecterDansLeNavigateur(page, "central");
  await page.goto("/gestion/beneficiaires");
  await expect(page.getByRole("heading", { name: "Enregistrer un ménage" })).toBeVisible();

  const province = page.getByLabel("Province *");
  await expect(province).toBeEnabled();
  await province.selectOption("prov-ouaddai");
  const rechercheCommune = page.getByLabel("Rechercher une commune");
  await expect(rechercheCommune).toBeEnabled();
  await rechercheCommune.fill("TELEGUEYE");

  const choixCommune = page.getByLabel("Commune", { exact: true });
  await expect(choixCommune.locator("option")).toHaveCount(2);
  const valeurCommune = await choixCommune.locator("option").nth(1).getAttribute("value");
  expect(valeurCommune).toBeTruthy();
  await expect(choixCommune.locator("option").nth(1)).toContainText("Télégueye");
  await choixCommune.focus();
  await choixCommune.press("ArrowDown");
  await choixCommune.press("Enter");
  await expect(choixCommune).toHaveValue(valeurCommune ?? "");

  const listeOuaddai = await page.evaluate(async () => {
    const response = await fetch("/api/territoire/communes?province_id=prov-ouaddai&limite=100&decalage=0");
    return {
      status: response.status,
      payload: await response.json() as { elements?: { id: string; province_id: string }[]; total?: number },
    };
  });
  expect(listeOuaddai.status).toBe(200);
  expect(listeOuaddai.payload.elements?.filter((commune) => commune.id.startsWith("commune-lo015-"))).toHaveLength(20);
  expect(listeOuaddai.payload.elements?.every((commune) => commune.province_id === "prov-ouaddai")).toBe(true);
  await deconnecterDansLeNavigateur(page);
});
