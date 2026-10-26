import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { connecterDansLeNavigateur, ouvrirModule } from "./authentification";

async function seConnecter(page: import("@playwright/test").Page): Promise<void> {
  await connecterDansLeNavigateur(page, "central");
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Suivi & contrôle", exact: true })).toBeVisible();
  await ouvrirModule(page, "Rapports et tableaux de bord");
  await expect(page.locator(".module-rapports")).toBeVisible();
}

test("affiche, filtre et exporte un rapport dans le navigateur", async ({ page }) => {
  await seConnecter(page);
  await page.getByLabel("Province").selectOption("prov-sila");
  await page.getByLabel("Début de période").fill("2026-01-01");
  await page.getByLabel("Fin de période").fill("2026-12-31");
  await expect(page.getByLabel("Filtres des rapports")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Évolution mensuelle" })).toBeVisible();
  await page.getByLabel("Type de rapport").selectOption("RAPPORT_DISTRIBUTION");
  await expect(page.getByRole("heading", { name: "Aperçu des résultats" })).toBeVisible();
  await expect(page.getByText("Référence", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Type de rapport").selectOption("RAPPORT_MENSUEL_PROVINCIAL");
  await page.getByLabel("Format d’export").selectOption("CSV");
  const reponseExportAttendue = page.waitForResponse((reponse) =>
    new URL(reponse.url()).pathname === "/api/rapports/RAPPORT_MENSUEL_PROVINCIAL/export"
      && reponse.request().method() === "POST");
  const telechargementAttendu = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le rapport" }).click();
  const reponseExport = await reponseExportAttendue;
  const telechargement = await telechargementAttendu;
  expect(telechargement.suggestedFilename()).toMatch(/^sigad_rapport_mensuel_provincial_.*\.csv$/u);
  expect(reponseExport.status()).toBe(200);
  expect(reponseExport.headers()["content-disposition"]).toMatch(/attachment; filename=/u);
  expect(reponseExport.headers()["content-type"]).toMatch(/text\/csv/u);
  expect(reponseExport.request().headers()["content-type"]).toMatch(/application\/x-www-form-urlencoded/u);
  await expect(page.getByRole("status")).toContainText("demande d’export CSV a été transmise");
  const dossierTelechargements = resolve(process.cwd(), "test-results", "exports");
  await mkdir(dossierTelechargements, { recursive: true });
  const chemin = resolve(dossierTelechargements, telechargement.suggestedFilename());
  await telechargement.saveAs(chemin);
  expect(await telechargement.failure()).toBeNull();
  const octets = await readFile(chemin);
  expect(octets.byteLength).toBeGreaterThan(0);
  const contenu = octets.toString("utf8");
  expect(contenu.startsWith("\uFEFFsep=;\r\n")).toBe(true);
  expect(contenu).toContain("Référence du rapport");
  expect(contenu).toContain('"Province";"Mois"');
  expect(contenu).toContain("Sila");
  expect(contenu).not.toContain("Ouaddaï");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".module-rapports")).toBeVisible();
});
