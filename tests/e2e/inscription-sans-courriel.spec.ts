import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

interface CourrielCapture {
  to: string[];
  subject: string;
}

async function lireMessagesCapture(service: string): Promise<CourrielCapture[]> {
  const reponse = await fetch(`${service}/__test/emails`);
  expect(reponse.status).toBe(200);
  return reponse.json() as Promise<CourrielCapture[]>;
}

test("inscription avec livraison e-mail désactivée sans OTP simulé", async ({ page, request }) => {
  const service = process.env.SIGAD_TEST_EMAIL_CAPTURE_URL;
  expect(service).toBeTruthy();
  const messagesAvant = await lireMessagesCapture(service ?? "");

  await page.goto("/");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByRole("heading", { name: "Créer un compte délégué" })).toBeVisible();
  await expect(page.getByText(/l’envoi d’e-mails est temporairement désactivé/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "J’ai déjà une demande et souhaite vérifier mon adresse" })).toHaveCount(0);

  const suffixe = randomBytes(10).toString("hex");
  const motDePasse = `E2E-${randomBytes(18).toString("base64url")}Aa9`;
  await page.getByLabel("Nom complet du délégué").fill("Délégué sans courrier de test");
  await page.getByLabel("Province").selectOption("prov-sila");
  await page.getByLabel("Adresse e-mail").fill(`inscription-sans-courriel-${suffixe}@example.invalid`);
  await page.getByLabel("Numéro de téléphone").fill("+235 66 10 20 30");
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await page.getByLabel("Confirmation du mot de passe").fill(motDePasse);

  const attenteReponse = page.waitForResponse((reponse) =>
    new URL(reponse.url()).pathname === "/api/inscriptions/delegues" && reponse.request().method() === "POST");
  await page.getByRole("button", { name: "Continuer" }).click();
  const reponse = await attenteReponse;
  expect(reponse.status()).toBe(202);
  await expect(page.getByRole("heading", { name: "Demande enregistrée" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "adresse e-mail reste non vérifiée" }).first())
    .toContainText("adresse e-mail reste non vérifiée");
  await expect(page.getByLabel("Code de vérification")).toHaveCount(0);
  expect(await lireMessagesCapture(service ?? "")).toEqual(messagesAvant);
  expect((await request.get("/api/auth/session")).status()).toBe(401);
});
