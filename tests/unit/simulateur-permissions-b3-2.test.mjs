import { describe, expect, it } from "vitest";
import { CATALOGUE_POLITIQUES_API } from "../../shared/permissions/catalogue.ts";
import { decisionDeclaree, rechercherPolitiques, resumerParRole } from "../../frontend/src/consoles/simulateur-permissions.ts";

const roles = [
  "PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION", "CONSULTATION_INSTITUTIONNELLE",
];

describe("B3.2 simulateur de permissions (lecture du catalogue)", () => {
  it("le résumé couvre exactement les 229 routes pour chaque rôle", () => {
    for (const role of roles) {
      const total = Object.values(resumerParRole(role)).reduce((a, b) => a + b, 0);
      expect(total, role).toBe(229);
    }
  });

  it("décision déclarée cohérente avec le catalogue", () => {
    const stock = CATALOGUE_POLITIQUES_API.find((p) => p.chemin === "/api/stocks/entrepots" && p.methode === "GET");
    expect(stock).toBeDefined();
    for (const role of roles) {
      const attendu = stock.rolesAutorises.includes(role) ? "AUTORISE" : "REFUSE";
      expect(decisionDeclaree(stock, role)).toBe(attendu);
    }
    const menages = CATALOGUE_POLITIQUES_API.find((p) => p.chemin === "/api/distributions/menages" && p.methode === "GET");
    expect(decisionDeclaree(menages, "AGENT_DISTRIBUTION")).not.toBe("PUBLIC");
  });

  it("recherche par méthode et chemin, sans effet de bord", () => {
    expect(rechercherPolitiques("").length).toBe(229);
    expect(rechercherPolitiques("GET /api/stocks").every((p) => p.methode === "GET" && p.chemin.startsWith("/api/stocks"))).toBe(true);
    expect(rechercherPolitiques("zzz-inexistant")).toEqual([]);
  });
});
