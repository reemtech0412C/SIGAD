import type { Page } from "@playwright/test";

export async function choisirLocaliteRuraleSila(page: Page): Promise<void> {
  await page.getByLabel("Département *").selectOption("dep-test-sila");
  await page.getByLabel("Milieu de résidence *").selectOption("RURAL");
  await page.getByLabel("Sous-préfecture (facultatif)").selectOption("sp-test-sila");
  await page.getByLabel("Type d’implantation rurale *").selectOption("VILLAGE");
  await page.getByLabel("Village").selectOption("loc-test-village");
}
