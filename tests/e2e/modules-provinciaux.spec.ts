import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { connecterDansLeNavigateur, ouvrirElementNavigation } from "./authentification";
import { choisirLocaliteRuraleSila } from "./localisation";

test("parcours du délégué, création et import d’un ménage dans le navigateur", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connecterDansLeNavigateur(page, "sila");

  await page.setViewportSize({ width: 1440, height: 1000 });
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("button", { name: "Bénéficiaires", exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Administration", exact: true })).toHaveCount(0);
  await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Modules de gestion des bénéficiaires" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enregistrer un ménage" })).toBeVisible();

  await choisirLocaliteRuraleSila(page);
  await page.getByLabel("Nom du chef de ménage *").fill(`Ménage navigateur ${randomBytes(4).toString("hex")}`);
  await page.getByLabel("Nombre de personnes *").fill("4");
  await page.getByLabel("Catégorie de population *").selectOption({ index: 1 });
  await page.getByLabel("Date d’enregistrement *").fill("2026-10-22");
  await page.getByRole("button", { name: "Enregistrer le ménage" }).click();
  await expect(page.getByText(
    "Le ménage a été enregistré. Tout rapprochement potentiel reste soumis à une vérification humaine.",
    { exact: true },
  )).toBeVisible();

  const csv = [
    "departement_id,sous_prefecture_id,commune_id,localite_id,nom_chef_menage,sexe_chef,nombre_personnes,telephone,categorie_population_code,date_enregistrement",
    `dep-test-sila,sp-test-sila,com-test-sila,loc-test-village,Ménage importé navigateur ${randomBytes(4).toString("hex")},F,3,+235 66 00 29,AUTOCHTONE,2026-10-22`,
  ].join("\n");
  await page.getByLabel("Fichier CSV ou Excel").setInputFiles({
    name: "menages-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByRole("button", { name: "Importer le fichier" }).click();
  await expect(page.getByText(/1 ménage\(s\) importé\(s\)/u)).toBeVisible();

  await ouvrirElementNavigation(page, "Opérations & aide", "Articles et stocks");
  await expect(page.getByText("Périmètre provincial", { exact: true })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Modules de stock" })).toBeVisible();
  await ouvrirElementNavigation(page, "Opérations & aide", "Distributions provinciales");
  await expect(page.getByLabel("Recherche")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await ouvrirElementNavigation(page, "Suivi & contrôle", "Contrôles et audits");
  await expect(page.getByRole("tablist", { name: "Modules de contrôle" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Observations" })).toHaveAttribute("aria-selected", "true");
  await expect(navigation).toBeVisible();
});
