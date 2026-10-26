import { describe, expect, it } from "vitest";
import {
  ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE,
  ROLES_PROPOSITION_MODIFICATION_TERRITORIALE,
} from "../../shared/constantes/roles.ts";

describe("Permissions territoriales", () => {
  it("sépare le droit de proposer une correction de la création directe d’une unité", () => {
    expect(ROLES_PROPOSITION_MODIFICATION_TERRITORIALE).toEqual([
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
    ]);
    expect(ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE).toEqual([
      "PROPRIETAIRE",
      "ADMIN_CENTRAL",
      "DELEGUE_PROVINCIAL",
      "RESPONSABLE_STOCK",
      "SUPERVISEUR_TERRAIN",
      "AGENT_DISTRIBUTION",
    ]);
    expect(ROLES_PROPOSITION_MODIFICATION_TERRITORIALE).not.toContain("CONSULTATION_INSTITUTIONNELLE");
    expect(ROLES_PROPOSITION_MODIFICATION_TERRITORIALE).not.toContain("RESPONSABLE_STOCK");
    expect(ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE).not.toContain("CONSULTATION_INSTITUTIONNELLE");
  });
});
