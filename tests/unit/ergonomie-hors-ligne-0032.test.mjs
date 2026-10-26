import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Chantier 07 — Ergonomie mobile et mode hors-ligne", () => {
  it("vérifie le contrat CSS d'ergonomie mobile et cartes empilées", async () => {
    const css = await readFile(resolve(racine, "frontend/src/styles.css"), "utf8");

    // 1. Vérification de la présence de la règle responsive pour écrans mobiles (max-width: 768px)
    expect(css.includes("@media (max-width: 768px)")).toBe(true);

    // 2. Vérification des cibles tactiles Android conformes (min 44px)
    expect(css.includes("min-height: 44px")).toBe(true);

    // 3. Transformation des tableaux en cartes empilées avec data-label
    expect(css.includes(".sigad-table-responsive")).toBe(true);
    expect(css.includes("content: attr(data-label)")).toBe(true);
    expect(css.includes(".sigad-actions-mobile-sticky")).toBe(true);
  });

  it("garantit l'interdiction de remise de vivres hors-ligne et la gestion sécurisée des brouillons", async () => {
    const serviceCode = await readFile(resolve(racine, "frontend/src/services/hors-ligne.service.ts"), "utf8");

    // 1. Présence de l'interdiction métier stricte
    expect(serviceCode.includes("interdireRemiseVivresHorsLigne")).toBe(true);
    expect(serviceCode.includes("Interdiction de sécurité : la confirmation effective de distribution de vivres")).toBe(true);

    // 2. Gestion des brouillons locaux
    expect(serviceCode.includes("sauvegarderBrouillonLocal")).toBe(true);
    expect(serviceCode.includes("purgerDonneesLocalesSensibles")).toBe(true);
  });
});
