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

import { construireNavigationParRole, ENTREES_CONSOLE_PLATEFORME } from "../../frontend/src/components/administration/navigation-config.ts";
import { moduleAutoriseConsolePlateforme } from "../../frontend/src/consoles/consoles-config.ts";

describe("B3.2 console Plateforme: retrait d'interface des modules opérationnels", () => {
  const entrees = (role, options) => construireNavigationParRole(role, options).flatMap((g) => g.sousMenus);

  it("le propriétaire ne garde que les entrées de plateforme", () => {
    const ids = entrees("PROPRIETAIRE", { consolePlateforme: true }).map((e) => e.id);
    expect(ids.every((id) => ENTREES_CONSOLE_PLATEFORME.includes(id))).toBe(true);
    expect(ids).toContain("admin-comptes");
    const modules = new Set(entrees("PROPRIETAIRE", { consolePlateforme: true }).map((e) => e.module));
    for (const interdit of ["operations", "approvisionnements", "stocks", "distributions", "rapports", "beneficiaires"]) {
      expect(modules.has(interdit), interdit).toBe(false);
    }
  });

  it("sans console Plateforme la navigation reste inchangée, pour tous les rôles", () => {
    for (const role of roles) {
      expect(entrees(role).map((e) => e.id)).toEqual(entrees(role, { consolePlateforme: false }).map((e) => e.id));
    }
    expect(entrees("PROPRIETAIRE").some((e) => e.module === "stocks")).toBe(true);
  });

  it("les autres rôles ne sont pas affectés par l'option", () => {
    for (const role of roles.filter((r) => r !== "PROPRIETAIRE")) {
      expect(entrees(role, { consolePlateforme: true }).map((e) => e.id)).toEqual(entrees(role).map((e) => e.id));
    }
  });

  it("chaque entrée conservée appartient à un module autorisé par la console", () => {
    for (const e of entrees("PROPRIETAIRE", { consolePlateforme: true })) {
      const vue = new URLSearchParams(e.chemin.split("?")[1] ?? "").get("vue");
      expect(moduleAutoriseConsolePlateforme(e.module, vue), e.id).toBe(true);
    }
  });

  it("garde de module: opérations refusées, audit et comptes permis", () => {
    for (const m of ["operations", "stocks", "distributions", "approvisionnements", "rapports", "beneficiaires"]) {
      expect(moduleAutoriseConsolePlateforme(m, null)).toBe(false);
    }
    expect(moduleAutoriseConsolePlateforme("controle", "observations")).toBe(false);
    expect(moduleAutoriseConsolePlateforme("controle", null)).toBe(false);
    expect(moduleAutoriseConsolePlateforme("controle", "audit")).toBe(true);
    expect(moduleAutoriseConsolePlateforme("comptes", null)).toBe(true);
  });
});
