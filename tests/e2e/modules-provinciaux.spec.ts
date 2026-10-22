import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

async function lireMotDePasseSila(): Promise<string> {
  const chemin = process.env.SIGAD_E2E_SILA_PASSWORD_FILE;
  if (!chemin) throw new Error("SIGAD_E2E_SILA_PASSWORD_FILE doit viser le secret temporaire du Worker local.");
  const motDePasse = (await readFile(chemin, "utf8")).trim();
  if (motDePasse.length < 12) throw new Error("Le mot de passe temporaire Sila est invalide.");
  return motDePasse;
}

test("parcours du délégué, création et import d’un ménage dans le navigateur", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Identifiant").fill("sila");
  await page.getByLabel("Mot de passe").fill(await lireMotDePasseSila());
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Créer un nouveau mot de passe" })).toBeVisible();
  const nouveauMotDePasse = `E2E-${randomBytes(18).toString("base64url")}Aa9`;
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(nouveauMotDePasse);
  await page.getByLabel("Confirmer le nouveau mot de passe", { exact: true }).fill(nouveauMotDePasse);
  await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("button", { name: "Gestion des bénéficiaires" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Administration des comptes" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Partenaires, ménages et listes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enregistrer un ménage" })).toBeVisible();

  await page.getByLabel("Département *").selectOption("dep-test-sila");
  await page.getByLabel("Nature du lieu").selectOption("VILLAGE");
  await page.getByLabel("Village").selectOption("loc-test-village");
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

  await navigation.getByRole("button", { name: "Articles et stocks" }).click();
  await expect(page.getByRole("heading", { name: "Articles et stocks" })).toBeVisible();
  await navigation.getByRole("button", { name: "Distributions provinciales" }).click();
  await expect(page.getByRole("heading", { name: "Distributions provinciales" })).toBeVisible();
  await navigation.getByRole("button", { name: "Contrôle et notifications" }).click();
  await expect(page.getByRole("heading", { name: "Contrôle provincial" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(navigation).toBeVisible();
});
