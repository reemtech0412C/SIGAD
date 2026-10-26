import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { verifierTransitionCompte } from "../../backend/src/modules/identite/etat-compte.ts";

const demande = (overrides = {}) => ({
  ancienEtat: "ACTIF",
  nouvelEtat: "SUSPENDU",
  roleActeur: "PROPRIETAIRE",
  roleCible: "DELEGUE_PROVINCIAL",
  motif: "Suspension justifiée pour test.",
  ...overrides,
});

describe("machine de transitions des comptes B2.5", () => {
  it("autorise les transitions administratives existantes motivées", () => {
    assert.equal(verifierTransitionCompte(demande()), null);
    assert.equal(verifierTransitionCompte(demande({ roleActeur: "ADMIN_CENTRAL" })), null);
    assert.equal(verifierTransitionCompte(demande({ ancienEtat: "SUSPENDU", nouvelEtat: "ACTIF" })), null);
  });

  it("refuse les transitions terminales inverses et les pouvoirs non autorisés", () => {
    assert.equal(verifierTransitionCompte(demande({ ancienEtat: "REVOQUE", nouvelEtat: "ACTIF" })), "TRANSITION_INTERDITE");
    assert.equal(verifierTransitionCompte(demande({ roleActeur: "DELEGUE_PROVINCIAL" })), "ROLE_INTERDIT");
    assert.equal(verifierTransitionCompte(demande({ memeCompte: true })), "AUTO_MODIFICATION_INTERDITE");
  });

  it("exige un motif et protège le dernier propriétaire actif", () => {
    assert.equal(verifierTransitionCompte(demande({ motif: "" })), "MOTIF_REQUIS");
    assert.equal(verifierTransitionCompte(demande({ roleCible: "PROPRIETAIRE", autreProprietaireActif: false })), "DERNIER_PROPRIETAIRE");
    assert.equal(verifierTransitionCompte(demande({ roleCible: "PROPRIETAIRE", autreProprietaireActif: true })), null);
  });
});
