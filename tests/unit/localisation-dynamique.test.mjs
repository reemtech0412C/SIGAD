import { describe, expect, it } from "vitest";
import { calculerChampsLocalisationAffiches } from "../../shared/utils/localisation-dynamique.ts";

describe("champs dynamiques du sélecteur territorial", () => {
  it("masque arrondissement, quartier et carré pour un village", () => {
    expect(calculerChampsLocalisationAffiches("VILLAGE", "AUCUN", false, false)).toEqual({
      arrondissement: false,
      quartier: false,
      carre: false,
    });
  });

  it("affiche directement le quartier d’une ville sans arrondissement", () => {
    expect(calculerChampsLocalisationAffiches("VILLE", "SANS_ARRONDISSEMENT", false, false)).toEqual({
      arrondissement: false,
      quartier: true,
      carre: false,
    });
    expect(calculerChampsLocalisationAffiches("VILLE", "SANS_ARRONDISSEMENT", false, true).carre).toBe(true);
  });

  it("demande d’abord un arrondissement pour une ville découpée", () => {
    expect(calculerChampsLocalisationAffiches("VILLE", "AVEC_ARRONDISSEMENTS", false, true)).toEqual({
      arrondissement: true,
      quartier: false,
      carre: false,
    });
    expect(calculerChampsLocalisationAffiches("VILLE", "AVEC_ARRONDISSEMENTS", true, false)).toEqual({
      arrondissement: true,
      quartier: true,
      carre: false,
    });
    expect(calculerChampsLocalisationAffiches("VILLE", "AVEC_ARRONDISSEMENTS", true, true).carre).toBe(true);
  });

  it("conserve le site humanitaire comme nature distincte du découpage administratif", () => {
    expect(calculerChampsLocalisationAffiches("SITE_HUMANITAIRE", "AVEC_ARRONDISSEMENTS", true, true)).toEqual({
      arrondissement: false,
      quartier: false,
      carre: false,
    });
  });
});
