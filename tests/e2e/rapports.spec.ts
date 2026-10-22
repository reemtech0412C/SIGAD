import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

async function lireMotDePasseCentral(): Promise<string> {
  const chemin = process.env.SIGAD_E2E_PASSWORD_FILE;
  if (!chemin) throw new Error("SIGAD_E2E_PASSWORD_FILE doit viser le secret temporaire du Worker local.");
  const motDePasse = (await readFile(chemin, "utf8")).trim();
  if (motDePasse.length < 12) throw new Error("Le mot de passe temporaire central est invalide.");
  return motDePasse;
}

async function seConnecter(page: import("@playwright/test").Page): Promise<void> {
  const motDePasse = await lireMotDePasseCentral();
  await page.goto("/");
  await expect(page.getByLabel("Identifiant")).toBeVisible();
  await page.getByLabel("Identifiant").fill("central");
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Créer un nouveau mot de passe" })).toBeVisible();
  const nouveauMotDePasse = `E2E-${randomBytes(18).toString("base64url")}Aa9`;
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(nouveauMotDePasse);
  await page.getByLabel("Confirmer le nouveau mot de passe", { exact: true }).fill(nouveauMotDePasse);
  await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await expect(page.getByRole("button", { name: "Rapports et tableaux de bord" })).toBeVisible();
  await page.getByRole("button", { name: "Rapports et tableaux de bord" }).click();
  await expect(page.getByRole("heading", { name: "Rapports et tableaux de bord" })).toBeVisible();
}

test("affiche, filtre et exporte un rapport dans le navigateur", async ({ page }) => {
  await seConnecter(page);
  await page.getByLabel("Province").selectOption("prov-sila");
  await page.getByLabel("Début de période").fill("2026-01-01");
  await page.getByLabel("Fin de période").fill("2026-12-31");
  await expect(page.getByText("Indicateurs issus des opérations, des bénéficiaires et des stocks enregistrés.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Évolution mensuelle" })).toBeVisible();
  await page.getByLabel("Type de rapport").selectOption("RAPPORT_DISTRIBUTION");
  await expect(page.getByRole("heading", { name: "Aperçu des résultats" })).toBeVisible();
  await expect(page.getByText("Référence", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Type de rapport").selectOption("RAPPORT_MENSUEL_PROVINCIAL");
  await page.getByLabel("Format d’export").selectOption("CSV");
  const telechargementAttendu = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le rapport" }).click();
  const telechargement = await telechargementAttendu;
  expect(telechargement.suggestedFilename()).toMatch(/^sigad_rapport_mensuel_provincial_.*\.csv$/u);
  const chemin = await telechargement.path();
  expect(chemin).not.toBeNull();
  const contenu = await readFile(resolve(chemin ?? ""), "utf8");
  expect(contenu).toContain("sep=;");
  expect(contenu).toContain("Référence du rapport");
  await expect(page.getByRole("status")).toContainText("ligne(s) exportée(s) en CSV");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Rapports et tableaux de bord" })).toBeVisible();
});
