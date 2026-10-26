import { expect, test } from "@playwright/test";
import {
  connecterDansLeNavigateur,
  deconnecterDansLeNavigateur,
  ouvrirElementNavigation,
} from "./authentification";

test.describe("Opérations centrales de distribution — Validation fonctionnelle Chrome (Arrêté 0033/2026)", () => {
  test("Parcours complet : Création centrale, sélection provinces, approbations, ouverture atomique et vue délégué Sila", async ({ page }) => {
    test.setTimeout(180_000);

    // 1. Connexion en tant qu'administrateur central dans Google Chrome
    await connecterDansLeNavigateur(page, "central");

    // 2. Accès au module Opérations centrales
    await ouvrirElementNavigation(page, "Opérations & aide", "Opérations centrales");
    await expect(page).toHaveURL(/\/operations-centrales$/u);
    await expect(page.getByRole("button", { name: "Nouvelle opération centrale" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);

    // 3. Ouverture du formulaire de création
    await page.getByRole("button", { name: "Nouvelle opération centrale" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle opération centrale de distribution" })).toBeVisible();

    // 4. Renseignement de l'identification et du contexte inspiré de l'Arrêté 0033/2026
    const titreOperation = "Opération E2E Déficit Pluviométrique 2026-2027 (Arrêté 0033)";
    await page.locator("#opc-intitule").fill(titreOperation);
    await page.locator("#opc-ref-admin").fill("MASSNAH/SG/2026-0033");
    await page.locator("#opc-campagne").fill("2026-2027");
    await page.locator("#opc-institution").fill("MASSNAH / Comité de pilotage");
    await page.locator("#opc-ref-juridique").fill("Arrêté n°0033/PR/PM/MASSNAH/SG/2026 du 7 octobre 2026");
    await page.locator("#opc-description").fill("Assistance gratuite d'urgence dans les provinces déficitaires de l'Est.");

    // Ciblage
    await page.locator("#opc-objectif").fill("Distribuer des vivres d'urgence à 15 000 ménages vulnérables.");
    await page.locator("#opc-categories").fill("Ménages sans réserve vivrière et sinistrés.");
    await page.locator("#opc-criteres").fill("Score de vulnérabilité SIGAD élevé et résidence prouvée.");
    await page.locator("#opc-prev-menages").fill("15000");
    await page.locator("#opc-prev-personnes").fill("90000");

    // Sélection des 3 provinces cibles : Sila, Ouaddaï, Wadi Fira
    // Vérifier que la grille des 23 provinces est présente
    const grilleProvinces = page.locator(".grille-selection-provinces");
    await expect(grilleProvinces).toBeVisible();

    // Cocher Sila
    const caseSila = grilleProvinces.getByLabel(/Sila/i);
    await caseSila.check();

    // Cocher Ouaddaï
    const caseOuaddai = grilleProvinces.getByLabel(/Ouaddaï/i);
    await caseOuaddai.check();

    // Cocher Wadi Fira
    const caseWadiFira = grilleProvinces.getByLabel(/Wadi-Fira|Wadi Fira/i);
    await caseWadiFira.check();

    // Vérifier le compteur de provinces sélectionnées
    await expect(page.getByText("3 / 23 provinces sélectionnées.")).toBeVisible();

    // Source des vivres
    await page.locator("#opc-source").selectOption("ONASA");

    // Soumission du formulaire
    await page.getByRole("button", { name: "Enregistrer le brouillon de l'opération" }).click();

    // 5. Arrivée sur la fiche détaillée de l'opération
    await expect(page.getByRole("heading", { name: titreOperation })).toBeVisible();
    await expect(page.getByText("Brouillon")).toBeVisible();

    // 6. Enregistrement d'un acte officiel de gouvernance (Comité de pilotage)
    await page.getByRole("tab", { name: /Gouvernance & Approbations/i }).click();
    await expect(page.getByRole("heading", { name: "Enregistrer une approbation officielle" })).toBeVisible();

    await page.locator("#app-type").selectOption("COMITE_PILOTAGE");
    await page.locator("#app-inst").fill("Comité de pilotage de l'Arrêté n°0033/2026");
    await page.locator("#app-ref").fill("PV-COPIL-2026-001");
    await page.locator("#app-date").fill("2026-10-15");
    await page.locator("#app-nom").fill("Dr. Mahamat Nour");
    await page.locator("#app-qual").fill("Président du Comité de Pilotage");
    await page.locator("#app-dec").selectOption("APPROUVE");
    await page.getByRole("button", { name: "Enregistrer l'acte officiel" }).click();

    // Vérifier l'apparition de l'acte dans la table
    await expect(page.getByRole("cell", { name: "PV-COPIL-2026-001" })).toBeVisible();

    // 7. Avancement du cycle de vie
    // Étape A : Soumettre à approbation
    await page.getByRole("button", { name: "Soumettre à approbation" }).click();
    await expect(page.getByText("Soumise à approbation", { exact: true }).first()).toBeVisible();

    // Étape B : Déclarer approuvée
    await page.getByRole("button", { name: /Déclarer approuvée/i }).click();
    await expect(page.getByText("Approuvée (prête pour ouverture)", { exact: true })).toBeVisible();

    // Étape C : Ouvrir l'opération aux provinces (génération atomique des 3 dossiers)
    await page.getByRole("button", { name: /Ouvrir l'opération aux provinces/i }).click();
    await expect(page.getByText("Ouverte aux provinces", { exact: true }).first()).toBeVisible();

    // 8. Vérification de la création atomique des dossiers d'exécution provinciaux
    await page.getByRole("tab", { name: /Provinces & Dossiers/i }).click();
    await expect(page.getByRole("cell", { name: /Sila/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Ouaddaï/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Wadi-Fira|Wadi Fira/i })).toBeVisible();

    // 9. Déconnexion du compte central
    await deconnecterDansLeNavigateur(page);

    // 10. Connexion en tant que délégué provincial de Sila
    await connecterDansLeNavigateur(page, "sila");

    // 11. Accès au module Opérations centrales par le délégué
    await ouvrirElementNavigation(page, "Opérations & aide", "Opérations centrales");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator(".sigad-admin__zone-contenu h1")).toHaveCount(0);

    // Vérifier que l'opération ouverte est visible
    const ligneOperation = page.getByRole("row").filter({ hasText: titreOperation });
    await expect(ligneOperation).toBeVisible();
    await ligneOperation.getByRole("button", { name: "Détails" }).click();

    // 12. Vérification du cloisonnement territorial : le délégué de Sila ne voit QUE son dossier
    await expect(page.getByRole("heading", { name: titreOperation })).toBeVisible();
    await page.getByRole("tab", { name: /Provinces & Dossiers/i }).click();
    await expect(page.getByRole("cell", { name: /Sila/i })).toBeVisible();
    // Les dossiers d'Ouaddaï et Wadi Fira ne doivent pas apparaître pour Sila
    await expect(page.getByRole("cell", { name: /Ouaddaï/i })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: /Wadi-Fira|Wadi Fira/i })).toHaveCount(0);

    // 13. Vérification de l'intégration dans le formulaire de distribution provinciale
    await ouvrirElementNavigation(page, "Opérations & aide", "Distributions provinciales");
    await expect(page.getByLabel("Recherche")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    await page.getByRole("button", { name: "Nouvelle distribution" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle distribution provinciale" })).toBeVisible();

    // Vérifier la présence du sélecteur optionnel de rattachement
    const selecteurRattachement = page.locator("#distribution-operation-centrale");
    await expect(selecteurRattachement).toBeVisible();
    await expect(selecteurRattachement.locator("option")).toContainText([/Aucun/i]);
  });
});
