import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  connecterDansLeNavigateur,
  deconnecterDansLeNavigateur,
  ouvrirModule,
} from "./authentification";

interface ExpeditionE2E {
  id: string;
  reference_bordereau: string;
  entrepot_recepteur_id: string;
  quantite_expediee: number;
}

async function lireExpeditionE2E(): Promise<ExpeditionE2E> {
  const chemin = process.env.SIGAD_E2E_EXPEDITION_FILE;
  if (!chemin) throw new Error("Le scénario de réception doit utiliser le fichier temporaire d’expédition locale.");
  return JSON.parse(await readFile(chemin, "utf8")) as ExpeditionE2E;
}

test("parcours navigateur de réception, distribution, contrôle et notification sur D1 locale", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await connecterDansLeNavigateur(page, "sila");

  const suffixe = randomBytes(4).toString("hex");
  const chefComplet = `Ménage E2E complet ${suffixe}`;
  const chefPartiel = `Ménage E2E partiel ${suffixe}`;
  const date = new Date().toISOString().slice(0, 10);
  await expect(page.getByRole("heading", { name: "Partenaires, ménages et listes" })).toBeVisible();

  await page.getByLabel("Département *").selectOption("dep-test-sila");
  await page.getByLabel("Nature du lieu").selectOption("VILLAGE");
  await page.getByLabel("Village").selectOption("loc-test-village");
  await page.getByLabel("Nom du chef de ménage *").fill(chefComplet);
  await page.getByLabel("Nombre de personnes *").fill("4");
  await page.getByLabel("Catégorie de population *").selectOption({ index: 1 });
  await page.getByLabel("Date d’enregistrement *").fill(date);
  await page.getByRole("button", { name: "Enregistrer le ménage" }).click();
  await expect(page.getByText("Le ménage a été enregistré. Tout rapprochement potentiel reste soumis à une vérification humaine.", { exact: true })).toBeVisible();

  await page.getByLabel("Département *").selectOption("dep-test-sila");
  await page.getByLabel("Nature du lieu").selectOption("VILLAGE");
  await page.getByLabel("Village").selectOption("loc-test-village");
  await page.getByLabel("Nom du chef de ménage *").fill(chefPartiel);
  await page.getByLabel("Nombre de personnes *").fill("3");
  await page.getByLabel("Catégorie de population *").selectOption({ index: 1 });
  await page.getByLabel("Date d’enregistrement *").fill(date);
  await page.getByRole("button", { name: "Enregistrer le ménage" }).click();
  await expect(page.getByText("Le ménage a été enregistré. Tout rapprochement potentiel reste soumis à une vérification humaine.", { exact: true })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("button", { name: "Approvisionnements" }).click();
  await expect(page.getByRole("heading", { name: "Approvisionnements centraux" })).toBeVisible();
  await page.getByRole("button", { name: "Réception provinciale" }).click();
  const expedition = await lireExpeditionE2E();
  const ligneExpedition = page.getByRole("row").filter({ hasText: expedition.reference_bordereau });
  await expect(ligneExpedition).toBeVisible();
  await ligneExpedition.getByRole("button", { name: "Ouvrir" }).click();
  await expect(page.getByText(`Bordereau ${expedition.reference_bordereau}`, { exact: false })).toBeVisible();
  await page.getByLabel("Entrepôt récepteur").selectOption(expedition.entrepot_recepteur_id);
  await page.getByLabel("Date de réception").fill(date);
  await page.getByLabel("Numéro du procès-verbal").fill(`PV-E2E-${suffixe}`);
  const formulaireReception = page.getByLabel("Procès-verbal signé");
  await formulaireReception.setInputFiles({ name: "pv-invalide.pdf", mimeType: "application/pdf", buffer: Buffer.from("document falsifié", "utf8") });
  const ligneArticleReception = page.getByRole("row").filter({ hasText: "Kit d’hygiène synthétique Phase 5" });
  await expect(ligneArticleReception).toBeVisible();
  const quantitesReception = page.locator(".tableau-reception tbody input[type='number']");
  await expect(quantitesReception).toHaveCount(3);
  await quantitesReception.nth(0).fill(String(expedition.quantite_expediee));
  await quantitesReception.nth(1).fill("1");
  await quantitesReception.nth(2).fill("1");
  await page.getByRole("button", { name: "Confirmer la réception" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await formulaireReception.setInputFiles({
    name: "pv-reception-e2e.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nProcès-verbal local de réception SIGAD\n%%EOF\n", "utf8"),
  });
  await page.getByRole("button", { name: "Confirmer la réception" }).click();
  await expect(page.getByRole("status")).toContainText("Le procès-verbal et la réception ont été enregistrés");

  await navigation.getByRole("button", { name: "Distributions provinciales" }).click();
  await expect(page.getByRole("heading", { name: "Distributions provinciales" })).toBeVisible();
  await page.getByRole("button", { name: "Nouvelle distribution" }).click();
  const intitule = `Distribution E2E ${suffixe}`;
  await page.getByLabel("Intitulé de la distribution").fill(intitule);
  await page.getByLabel("Date prévue").fill(date);
  await page.getByLabel("Nature de l’aide").selectOption("ALIMENTAIRE");

  const entrepot = page.getByLabel("Entrepôt provincial");
  await expect(entrepot.locator("option").filter({ hasText: "Entrepôt synthétique Sila Phase 6" })).toHaveCount(1);
  const entrepotPhaseSix = await entrepot.locator("option").evaluateAll((options) => {
    const option = options.find((element) => (element as HTMLOptionElement).textContent?.includes("Entrepôt synthétique Sila Phase 6"));
    return option ? (option as HTMLOptionElement).value : "";
  });
  if (!entrepotPhaseSix) throw new Error("Le dépôt de test local de Sila n’est pas disponible.");
  await entrepot.selectOption(entrepotPhaseSix);
  await page.getByLabel("Objectif").fill("Tester la réservation FEFO et les remises depuis le parcours navigateur local.");
  await page.getByLabel("Localité ou site humanitaire").selectOption("localite:loc-test-village");
  await page.getByRole("button", { name: "Ajouter la zone" }).click();

  const article = page.getByLabel("Article", { exact: true });
  const articleRiz = await article.locator("option").evaluateAll((options) => {
    const option = options.find((element) => (element as HTMLOptionElement).textContent?.includes("Riz synthétique Phase 6"));
    return option ? (option as HTMLOptionElement).value : "";
  });
  if (!articleRiz) throw new Error("Aucun article riz de test local n’est disponible.");
  await article.selectOption(articleRiz);
  await page.getByLabel("Source en stock").selectOption("STOCK_EXISTANT");
  await page.getByLabel("Ration par ménage").fill("0.1");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();

  const rechercheMenages = page.getByLabel("Recherche", { exact: true });
  for (const nomChef of [chefComplet, chefPartiel]) {
    await rechercheMenages.fill(nomChef);
    const ligneMenage = page.getByRole("row").filter({ hasText: nomChef });
    await expect(ligneMenage).toBeVisible();
    await ligneMenage.getByRole("checkbox").check();
  }

  const creationAttendue = page.waitForResponse((reponse) =>
    reponse.url().endsWith("/api/distributions") && reponse.request().method() === "POST");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  const reponseCreation = await creationAttendue;
  expect(reponseCreation.status()).toBe(201);
  const distribution = await reponseCreation.json() as { id: string };
  await expect(page.getByRole("heading", { name: intitule })).toBeVisible();
  await page.getByRole("button", { name: "Lancer la préparation" }).click();
  await page.getByRole("button", { name: "Valider et réserver le stock" }).click();
  await expect(page.getByRole("button", { name: "Démarrer l’exécution" })).toBeVisible();
  await page.getByRole("button", { name: "Démarrer l’exécution" }).click();

  const ligneComplete = page.getByRole("row").filter({ hasText: chefComplet });
  await ligneComplete.getByRole("button", { name: "Saisir une remise" }).click();
  await page.getByLabel("Identité du récepteur").fill("Récepteur de test complet");
  await page.getByRole("button", { name: "Enregistrer la remise" }).click();
  await expect(ligneComplete).toContainText("Servi");

  const lignePartielle = page.getByRole("row").filter({ hasText: chefPartiel });
  const chargementAllocationsPartielles = page.waitForResponse((reponse) =>
    new URL(reponse.url()).pathname.startsWith(`/api/distributions/${distribution.id}/menages/`) &&
    new URL(reponse.url()).pathname.endsWith("/allocations") && reponse.request().method() === "GET");
  await lignePartielle.getByRole("button", { name: "Saisir une remise" }).click();
  await chargementAllocationsPartielles;
  await expect(page.locator('input[aria-label^="Quantité remise pour "]')).toHaveValue("0.1");
  await page.getByLabel("Statut").selectOption("PARTIELLEMENT_SERVI");
  await expect(page.getByLabel("Statut")).toHaveValue("PARTIELLEMENT_SERVI");
  await page.locator('input[aria-label^="Quantité remise pour "]').fill("0.05");
  await expect(page.locator('input[aria-label^="Quantité remise pour "]')).toHaveValue("0.05");
  await page.getByLabel("Identité du récepteur").fill("Récepteur de test partiel");
  await page.getByRole("button", { name: "Enregistrer la remise" }).click();
  await expect(lignePartielle).toContainText("Partiellement servi");
  await lignePartielle.getByRole("button", { name: "Saisir une remise" }).click();
  await page.getByLabel("Identité du récepteur").fill("Récepteur de test après complément");
  await page.getByRole("button", { name: "Enregistrer la remise" }).click();
  await expect(lignePartielle).toContainText("Servi");

  await page.getByLabel("Procès-verbal de distribution en PDF").setInputFiles({
    name: "pv-distribution-e2e.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nProcès-verbal de distribution locale\n%%EOF\n", "utf8"),
  });
  await page.getByRole("button", { name: "Archiver le procès-verbal" }).click();
  await expect(page.getByRole("status")).toContainText("Le procès-verbal a été archivé");
  await page.getByLabel("Observations de fin").fill("Distribution vérifiée pendant le parcours navigateur local.");
  await page.getByRole("button", { name: "Déclarer la distribution terminée" }).click();
  await expect(page.getByText("Terminée par la province")).toBeVisible();

  await deconnecterDansLeNavigateur(page);
  await connecterDansLeNavigateur(page, "central");
  await ouvrirModule(page, "Distributions provinciales");
  await page.getByLabel("Recherche", { exact: true }).fill(intitule);
  const ligneDistribution = page.getByRole("row").filter({ hasText: intitule });
  await expect(ligneDistribution).toBeVisible();
  await ligneDistribution.getByRole("button", { name: "Ouvrir" }).click();
  await page.getByLabel("Motif du retour").fill("Compléter la trace d’observation avant clôture.");
  await page.locator("fieldset.choix-roles").getByLabel("Observations").check();
  await page.getByRole("button", { name: "Retourner pour correction" }).click();
  await expect(page.getByRole("status")).toContainText("La distribution a été retournée à la province");

  await deconnecterDansLeNavigateur(page);
  await connecterDansLeNavigateur(page, "sila");
  await ouvrirModule(page, "Distributions provinciales");
  await page.getByLabel("Recherche", { exact: true }).fill(intitule);
  await page.getByRole("row").filter({ hasText: intitule }).getByRole("button", { name: "Ouvrir" }).click();
  await page.getByLabel("Observations", { exact: true }).fill("Les observations ont été complétées et rapprochées du procès-verbal.");
  await page.getByLabel("Réponse du délégué").fill("La correction demandée est terminée et justifiée.");
  const reponseCorrection = page.waitForResponse((reponse) =>
    new URL(reponse.url()).pathname.endsWith(`/api/distributions/${distribution.id}/corrections`) && reponse.request().method() === "POST");
  await page.getByRole("button", { name: "Soumettre la correction au contrôle central" }).click();
  expect((await reponseCorrection).status()).toBe(200);
  await expect(page.getByText("Correction soumise au contrôle central", { exact: true })).toBeVisible();

  await deconnecterDansLeNavigateur(page);
  await connecterDansLeNavigateur(page, "central");
  await ouvrirModule(page, "Distributions provinciales");
  await page.getByLabel("Recherche", { exact: true }).fill(intitule);
  await page.getByRole("row").filter({ hasText: intitule }).getByRole("button", { name: "Ouvrir" }).click();
  await page.getByRole("button", { name: "Valider la correction soumise" }).click();
  await expect(page.getByRole("button", { name: "Clôturer et libérer les reliquats" })).toBeVisible();
  await page.getByLabel("Observations finales").fill("Bilan central examiné pendant le parcours navigateur local.");
  await page.getByRole("button", { name: "Clôturer et libérer les reliquats" }).click();
  await expect(page.getByRole("heading", { name: "Clôture centrale enregistrée" })).toBeVisible();

  const observation = `Observation E2E ${suffixe}`;
  await ouvrirModule(page, "Contrôle central");
  await page.getByRole("tab", { name: "Observations" }).click();
  await page.getByLabel("Identifiant de l’opération").fill(distribution.id);
  await page.getByLabel("Observation", { exact: true }).fill(observation);
  await page.getByRole("button", { name: "Enregistrer et notifier" }).click();
  await expect(page.getByText(observation, { exact: true })).toBeVisible();

  await deconnecterDansLeNavigateur(page);
  await connecterDansLeNavigateur(page, "sila");
  await ouvrirModule(page, "Contrôle et notifications");
  await expect(page.getByText(observation, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Notifications" }).click();
  await expect(page.getByText(/notification\(s\) non lue\(s\)/u)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
});
