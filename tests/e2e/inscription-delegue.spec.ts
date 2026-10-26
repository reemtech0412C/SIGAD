import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

interface CourrielTestLocal {
  to: string[];
  text: string;
  subject: string;
}

async function attendreCodeCourriel(adresse: string): Promise<string> {
  const service = process.env.SIGAD_TEST_EMAIL_CAPTURE_URL;
  if (!service) throw new Error("Le prestataire de courrier local est absent du parcours Playwright.");
  const echeance = Date.now() + 8_000;
  while (Date.now() < echeance) {
    const reponse = await fetch(`${service}/__test/emails`);
    if (reponse.ok) {
      const courriels = await reponse.json() as CourrielTestLocal[];
      const courriel = courriels.find((element) => element.to.includes(adresse)
        && element.subject.includes("Vérification de votre adresse e-mail"));
      const code = courriel?.text.match(/code de vérification SIGAD est\s*:\s*(\d{6})/iu)?.[1];
      if (code) return code;
    }
    await new Promise((resoudre) => setTimeout(resoudre, 150));
  }
  throw new Error("Le message de vérification du compte n’a pas été remis au prestataire local.");
}

test("inscription d’un délégué et vérification de l’adresse sans ouvrir de session", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.locator("html").getAttribute("lang")).toBe("fr");
  expect(await page.locator("html").getAttribute("dir")).toBe("ltr");
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toContain("DM Sans");
  await expect(page.getByRole("img", { name: "SIGAD" })).toBeVisible();
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByRole("heading", { name: "Créer un compte délégué" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("inscription-delegue-fr.png"), fullPage: true });

  const suffixe = randomBytes(10).toString("hex");
  const courriel = `inscription-${suffixe}@example.invalid`;
  const motDePasse = `E2E-${randomBytes(18).toString("base64url")}Aa9`;
  await page.getByLabel("Nom complet du délégué").fill("Délégué de test navigateur");
  await page.getByLabel("Province").selectOption("prov-sila");
  await page.getByLabel("Adresse e-mail").fill(courriel);
  await page.getByLabel("Numéro de téléphone").fill("+235 66 10 20 30");
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await page.getByLabel("Confirmation du mot de passe").fill(motDePasse);

  const reponseInscriptionAttendue = page.waitForResponse((reponse) =>
    new URL(reponse.url()).pathname === "/api/inscriptions/delegues" && reponse.request().method() === "POST");
  await page.getByRole("button", { name: "Continuer" }).click();
  const reponseInscription = await reponseInscriptionAttendue;
  expect(reponseInscription.status()).toBe(202);
  await expect(page.getByRole("heading", { name: "Vérifier votre adresse e-mail" })).toBeVisible();

  const code = await attendreCodeCourriel(courriel);
  await page.getByLabel("Code de vérification").fill(code);
  const reponseVerificationAttendue = page.waitForResponse((reponse) =>
    new URL(reponse.url()).pathname === "/api/inscriptions/delegues/verifier-courriel");
  await page.getByRole("button", { name: "Vérifier l’adresse" }).click();
  const reponseVerification = await reponseVerificationAttendue;
  expect(reponseVerification.status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "attend l’approbation de l’administration centrale" }).first())
    .toContainText("attend l’approbation de l’administration centrale");

  const session = await request.get("/api/auth/session");
  expect(session.status()).toBe(401);
});
