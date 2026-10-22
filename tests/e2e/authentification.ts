import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { codeMfaInutilise } from "../integration/mfa-test-helper.mjs";

export type IdentifiantE2E = "central" | "sila";

function cheminMotDePasse(identifiant: IdentifiantE2E): string {
  const chemin = identifiant === "central" ? process.env.SIGAD_E2E_PASSWORD_FILE : process.env.SIGAD_E2E_SILA_PASSWORD_FILE;
  if (!chemin) throw new Error(`Le fichier temporaire de mot de passe du compte ${identifiant} est requis.`);
  return chemin;
}

async function lireMotDePasse(identifiant: IdentifiantE2E): Promise<string> {
  const motDePasse = (await readFile(cheminMotDePasse(identifiant), "utf8")).trim();
  if (motDePasse.length < 12) throw new Error(`Le mot de passe temporaire du compte ${identifiant} est invalide.`);
  return motDePasse;
}

export async function enregistrerMotDePasseE2E(identifiant: IdentifiantE2E, motDePasse: string): Promise<void> {
  await writeFile(cheminMotDePasse(identifiant), `${motDePasse}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function connecterDansLeNavigateur(page: Page, identifiant: IdentifiantE2E): Promise<void> {
  await page.goto("/");
  await expect(page.getByLabel("Identifiant")).toBeVisible();
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill(await lireMotDePasse(identifiant));
  await page.getByRole("button", { name: "Se connecter" }).click();

  const champMfa = page.getByLabel("Code d’authentification ou code de récupération");
  if (identifiant === "central") await expect(champMfa).toBeVisible();
  if (await champMfa.isVisible()) {
    if (identifiant !== "central") throw new Error("Le défi MFA est inattendu pour un compte provincial.");
    await champMfa.fill(await codeMfaInutilise("central"));
    const verificationAttendue = page.waitForResponse((reponse) =>
      new URL(reponse.url()).pathname === "/api/auth/mfa/verifier");
    await page.getByRole("button", { name: "Vérifier le code" }).click();
    const verification = await verificationAttendue;
    if (!verification.ok()) throw new Error(`Le défi MFA central a été refusé (HTTP ${verification.status()}).`);
  }

  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  const titreChangement = page.getByRole("heading", { name: "Créer un nouveau mot de passe" });
  const titreConfigurationMfa = page.getByRole("heading", { name: "Configurer l’authentification à deux facteurs" });
  await expect(titreChangement.or(titreConfigurationMfa).or(navigation)).toBeVisible();
  if (await titreChangement.isVisible()) {
    const nouveauMotDePasse = `E2E-${randomBytes(18).toString("base64url")}Aa9`;
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(nouveauMotDePasse);
    await page.getByLabel("Confirmer le nouveau mot de passe", { exact: true }).fill(nouveauMotDePasse);
    await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
    await enregistrerMotDePasseE2E(identifiant, nouveauMotDePasse);
  }

  if (identifiant === "central") await expect(titreConfigurationMfa.or(navigation)).toBeVisible();
  if (await titreConfigurationMfa.isVisible()) {
    const secret = await page.locator(".secret-mfa code").textContent();
    if (!secret) throw new Error("Le secret d’enrôlement TOTP n’est pas affiché.");
    const { codeTotp } = await import("../../backend/src/services/mfa.service.ts");
    await page.getByLabel("Code de vérification").fill((await codeTotp(secret)).code);
    await page.getByRole("button", { name: "Activer l’authentification à deux facteurs" }).click();
    await expect(page.getByRole("heading", { name: "Codes de récupération" })).toBeVisible();
    await page.getByRole("button", { name: "J’ai enregistré mes codes" }).click();
  }

  await expect(navigation).toBeVisible();
}

export async function ouvrirModule(page: Page, nom: string): Promise<void> {
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await navigation.getByRole("button", { name: nom }).click();
}

export async function deconnecterDansLeNavigateur(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByLabel("Identifiant")).toBeVisible();
}
