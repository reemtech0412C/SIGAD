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
