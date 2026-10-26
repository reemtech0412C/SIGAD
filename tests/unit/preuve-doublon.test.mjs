import { describe, expect, it } from "vitest";
import {
  calculerPreuveImportMenage,
  contientPreuveNouvelle,
  creerSignatairePreuve,
  empreinteReferencePreuve,
  fusionnerEmpreintes,
  lireEmpreintesPreuve,
} from "../../backend/src/services/preuve-doublon.service.ts";

const secret = "cle-locale-de-test-aleatoire-ne-pas-reutiliser-32-caracteres";

describe("preuves HMAC des revues de doublons", () => {
  it("normalise la référence sans persister son contenu", async () => {
    const signer = await creerSignatairePreuve(secret);
    const premiere = await empreinteReferencePreuve(signer, " Référence Dossier 2026 ");
    const normalisee = await empreinteReferencePreuve(signer, "référence dossier 2026");
    expect(premiere).toBe(normalisee);
    expect(premiere).toMatch(/^[0-9a-f]{64}$/u);
    expect(premiere).not.toContain("dossier");
  });

  it("sépare les preuves de téléphone et d’identité locale et détecte une preuve additionnelle", async () => {
    const signer = await creerSignatairePreuve(secret);
    const telephone = await calculerPreuveImportMenage({
      signer, provinceId: "prov-sila", telephone: "23566001000", nomChef: "Amina", localiteId: "loc-1",
      telephoneIdentique: true, nomLocaliteIdentiques: false,
    });
    const telephoneEtIdentite = await calculerPreuveImportMenage({
      signer, provinceId: "prov-sila", telephone: "23566001000", nomChef: "Amina", localiteId: "loc-1",
      telephoneIdentique: true, nomLocaliteIdentiques: true,
    });
    expect(telephone.empreintes).toHaveLength(1);
    expect(telephoneEtIdentite.empreintes).toHaveLength(2);
    expect(contientPreuveNouvelle(telephoneEtIdentite.empreintes, telephone.empreintes)).toBe(true);
    expect(contientPreuveNouvelle(telephone.empreintes, telephoneEtIdentite.empreintes)).toBe(false);
    expect(telephoneEtIdentite.comparaison).not.toHaveProperty("nom_chef_menage");
    expect(telephoneEtIdentite.comparaison).not.toHaveProperty("telephone");
  });

  it("refuse d’inférer une preuve nouvelle depuis un historique sans empreintes", () => {
    expect(lireEmpreintesPreuve(null)).toBeNull();
    expect(lireEmpreintesPreuve("not-json")).toBeNull();
    expect(contientPreuveNouvelle(["a".repeat(64)], null)).toBe(false);
    expect(fusionnerEmpreintes(["b".repeat(64)], null, ["b".repeat(64), "a".repeat(64)]))
      .toEqual(["a".repeat(64), "b".repeat(64)]);
  });
});
