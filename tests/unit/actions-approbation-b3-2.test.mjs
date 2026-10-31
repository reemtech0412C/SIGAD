import { describe, expect, it } from "vitest";
import { actionsDisponibles, codeTotpValide, libelleChangement, motifValide } from "../../frontend/src/consoles/actions-approbation.ts";

describe("B3.2 écran des approbations: actions proposées", () => {
  const moi = "p1";
  const autre = "p2";

  it("le demandeur ne peut qu'annuler une demande en attente, jamais l'approuver ni la refuser", () => {
    expect(actionsDisponibles({ statut: "EN_ATTENTE", demandeur_id: moi }, moi)).toEqual(["annuler"]);
  });

  it("un autre propriétaire peut approuver ou refuser une demande en attente", () => {
    expect(actionsDisponibles({ statut: "EN_ATTENTE", demandeur_id: autre }, moi)).toEqual(["approuver", "refuser"]);
  });

  it("seul le demandeur exécute une demande approuvée", () => {
    expect(actionsDisponibles({ statut: "APPROUVEE", demandeur_id: moi }, moi)).toEqual(["executer"]);
    expect(actionsDisponibles({ statut: "APPROUVEE", demandeur_id: autre }, moi)).toEqual([]);
  });

  it("aucune action sur un état terminal", () => {
    for (const statut of ["REFUSEE", "EXPIREE", "EXECUTEE", "ANNULEE"]) {
      expect(actionsDisponibles({ statut, demandeur_id: moi }, moi)).toEqual([]);
      expect(actionsDisponibles({ statut, demandeur_id: autre }, moi)).toEqual([]);
    }
  });

  it("validation locale du motif et du code MFA, et libellé du changement", () => {
    expect(motifValide("court")).toBe(false);
    expect(motifValide("   dix caractères  ")).toBe(true);
    expect(motifValide("x".repeat(501))).toBe(false);
    expect(codeTotpValide("123456")).toBe(true);
    for (const mauvais of ["12345", "1234567", "12345a", ""]) expect(codeTotpValide(mauvais)).toBe(false);
    expect(libelleChangement({ cible_id: "authz_observation", parametres: { actif: true } })).toContain("activer");
    expect(libelleChangement({ cible_id: "authz_observation", parametres: { actif: false } })).toContain("désactiver");
  });
});
