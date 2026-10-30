import { describe, expect, it } from "vitest";
import {
  adresseDansConsole, consoleDepuisAdresse, consolePourRole, retirerPrefixeConsole,
} from "../../frontend/src/consoles/consoles-config.ts";

const roles = [
  "PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION", "CONSULTATION_INSTITUTIONNELLE",
];

describe("B3.1 consoles: aiguillage par rôle", () => {
  it("chaque rôle atterrit dans une console", () => {
    expect(Object.fromEntries(roles.map((r) => [r, consolePourRole(r)]))).toEqual({
      PROPRIETAIRE: "plateforme", ADMIN_CENTRAL: "national", DELEGUE_PROVINCIAL: "provincial",
      RESPONSABLE_STOCK: "provincial", SUPERVISEUR_TERRAIN: "provincial", AGENT_DISTRIBUTION: "provincial",
      CONSULTATION_INSTITUTIONNELLE: "institution",
    });
  });

  it("les anciennes URL sont redirigées vers la console du rôle, requête conservée", () => {
    expect(adresseDansConsole("/administration/comptes", "PROPRIETAIRE")).toBe("/plateforme/administration/comptes");
    expect(adresseDansConsole("/controle?vue=audit", "ADMIN_CENTRAL")).toBe("/national/controle?vue=audit");
    expect(adresseDansConsole("/", "DELEGUE_PROVINCIAL")).toBe("/provincial");
    expect(adresseDansConsole("/ui-preview", "PROPRIETAIRE")).toBe("/ui-preview");
  });

  it("une console étrangère est remplacée par celle du rôle, jamais suivie", () => {
    expect(adresseDansConsole("/plateforme/administration/comptes", "ADMIN_CENTRAL")).toBe("/national/administration/comptes");
    expect(adresseDansConsole("/national/stocks", "AGENT_DISTRIBUTION")).toBe("/provincial/stocks");
  });

  it("idempotent, aller-retour exact avec l'adresse historique", () => {
    for (const role of roles) {
      for (const base of ["/stocks", "/territoire?vue=sites", "/mon-compte", "/rapports"]) {
        const dedans = adresseDansConsole(base, role);
        expect(adresseDansConsole(dedans, role)).toBe(dedans);
        expect(retirerPrefixeConsole(dedans)).toBe(base);
      }
    }
  });

  it("n'interprète pas comme console un segment qui n'en est pas une", () => {
    expect(consoleDepuisAdresse("/plateformes/x")).toBeNull();
    expect(consoleDepuisAdresse("/stocks/provincial")).toBeNull();
    expect(retirerPrefixeConsole("/stocks/provincial")).toBe("/stocks/provincial");
    expect(consoleDepuisAdresse("/api/auth/session")).toBeNull();
  });
});
