import { expect, test, type Page } from "@playwright/test";
import { connecterDansLeNavigateur, type IdentifiantE2E } from "./authentification";

const consoles: Array<{ compte: IdentifiantE2E; console: string; etrangere: string }> = [
  { compte: "proprietaire", console: "plateforme", etrangere: "national" },
  { compte: "central", console: "national", etrangere: "plateforme" },
  { compte: "sila", console: "provincial", etrangere: "national" },
];

async function activerConsolesV2(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem("sigad.consoles_v2", "1"));
}

for (const { compte, console: nomConsole, etrangere } of consoles) {
  test(`Consoles v2: ${compte} atterrit dans la console ${nomConsole}`, async ({ page }) => {
    await activerConsolesV2(page);
    await connecterDansLeNavigateur(page, compte);
    await expect(page).toHaveURL(new RegExp(`/${nomConsole}(/|$)`, "u"));
    const navigation = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(navigation).toBeVisible();

    // Une ancienne URL est redirigée vers la console du rôle.
    await page.goto("/mon-compte");
    await expect(page).toHaveURL(new RegExp(`/${nomConsole}/mon-compte$`, "u"));

    // Une console étrangère est remplacée par celle du rôle et ne donne aucun accès supplémentaire.
    await page.goto(`/${etrangere}/mon-compte`);
    await expect(page).toHaveURL(new RegExp(`/${nomConsole}/mon-compte$`, "u"));

    // Rechargement direct dans la bonne console: la session reste valide.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${nomConsole}/mon-compte$`, "u"));
    await expect(navigation).toBeVisible();
  });
}

test("Consoles v2 désactivé: les URL historiques restent sans préfixe", async ({ page }) => {
  await connecterDansLeNavigateur(page, "central");
  await page.goto("/mon-compte");
  await expect(page).toHaveURL(/\/mon-compte$/u);
  await expect(page).not.toHaveURL(/\/(plateforme|national|provincial|institution)\//u);
});

test("Consoles v2: la console Plateforme retire les modules opérationnels du propriétaire", async ({ page }) => {
  await activerConsolesV2(page);
  await connecterDansLeNavigateur(page, "proprietaire");
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Opérations & aide", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "Bénéficiaires", exact: true })).toHaveCount(0);

  for (const chemin of ["/plateforme/stocks", "/plateforme/distributions", "/plateforme/rapports", "/plateforme/operations-centrales"]) {
    await page.goto(chemin);
    await expect(page).toHaveURL(/\/plateforme\/administration\/comptes$/u);
  }
  await expect(page.locator(".sigad-console-bandeau")).toContainText("Console Plateforme");
});

test("Consoles v2: la console Plateforme expose permissions et santé, sans donnée nominative", async ({ page }) => {
  await activerConsolesV2(page);
  await connecterDansLeNavigateur(page, "proprietaire");
  await expect(page).toHaveURL(/\/plateforme(\/|$)/u);
  await page.getByRole("tab", { name: "Rôles et permissions" }).click();
  await expect(page.getByRole("heading", { name: "Rôles et permissions" })).toBeVisible();
  await expect(page.getByTestId("resume-permissions")).toContainText("Autorisé:");
  await page.getByLabel("Rôle simulé").selectOption("CONSULTATION_INSTITUTIONNELLE");
  await page.getByLabel("Filtrer les routes").fill("/api/distributions/menages");
  await expect(page.getByRole("table")).toContainText("/api/distributions/menages");

  await page.getByRole("tab", { name: "Santé technique" }).click();
  await expect(page.getByTestId("sante-technique")).toContainText("operationnel");
});

test("Consoles v2: l'écran des approbations liste les drapeaux et applique la règle du second propriétaire", async ({ page }) => {
  await activerConsolesV2(page);
  await connecterDansLeNavigateur(page, "proprietaire");
  await page.getByRole("tab", { name: "Approbations et drapeaux" }).click();
  await expect(page.getByRole("heading", { name: "Drapeaux de plateforme" })).toBeVisible();
  for (const code of ["consoles_v2", "authz_observation", "etats_compte_v2", "geo_v2_ecriture", "roles_personnalises"]) {
    await expect(page.getByText(code, { exact: true })).toBeVisible();
  }

  // Avec un seul propriétaire actif, une demande de drapeau d'autorisation échoue fermé.
  const ligne = page.getByRole("row").filter({ hasText: "authz_observation" });
  await ligne.getByRole("button", { name: "Demander l’activation" }).click();
  await expect(page.getByRole("button", { name: "Confirmer" })).toBeDisabled();
  await page.getByLabel("Motif").fill("Activation de l’observation Shadow.");
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "SECOND_PROPRIETAIRE_ABSENT" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Demandes d’approbation" })).toBeVisible();
  await expect(page.getByText("Aucune demande", { exact: true })).toBeVisible();
});

test("Consoles v2: l'administration centrale lit la performance des délégations, le délégué en est exclu", async ({ page }) => {
  await activerConsolesV2(page);
  await connecterDansLeNavigateur(page, "central");
  await page.goto("/national/performance-delegations");
  await expect(page).toHaveURL(/\/national\/performance-delegations$/u);
  await expect(page.getByRole("heading", { name: "Performance des délégations" })).toBeVisible();
  await expect(page.getByTestId("performance-national")).toBeVisible();
  await expect(page.getByText("n/d est", { exact: false }).or(page.getByText("n/d", { exact: false })).first()).toBeVisible();
});

test("Consoles v2: le délégué provincial est redirigé hors de la performance des délégations", async ({ page }) => {
  await activerConsolesV2(page);
  await connecterDansLeNavigateur(page, "sila");
  await page.goto("/provincial/performance-delegations");
  await expect(page.getByRole("heading", { name: "Performance des délégations" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/performance-delegations/u);
});
