import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CorpsDocumentTropVolumineux,
  detecterTypeMimeDocument,
  lireFormulaireMultipartBorne,
  TAILLE_MAXIMALE_CORPS_DOCUMENT,
  typeErreurSecurise,
} from "../../backend/src/services/fichiers-securite.service.ts";

describe("Protection des téléversements documentaires", () => {
  it("reconnaît uniquement les signatures PDF, JPEG et PNG autorisées", () => {
    assert.equal(detecterTypeMimeDocument(new TextEncoder().encode("%PDF-1.7\ncontenu")), "application/pdf");
    assert.equal(detecterTypeMimeDocument(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
    assert.equal(detecterTypeMimeDocument(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(detecterTypeMimeDocument(new TextEncoder().encode("contenu.pdf")), null);
    assert.equal(detecterTypeMimeDocument(new Uint8Array()), null);
  });

  it("borne la lecture du multipart avant l’analyse du formulaire", async () => {
    const requete = new Request("https://sigad.local/api/document", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(TAILLE_MAXIMALE_CORPS_DOCUMENT + 1) },
      body: "--test--\r\n",
    });
    await assert.rejects(lireFormulaireMultipartBorne(requete), CorpsDocumentTropVolumineux);
  });

  it("n’expose pas le message d’exception dans le nom de type journalisé", () => {
    const erreur = new Error("Nom et numéro de téléphone sensibles");
    assert.equal(typeErreurSecurise(erreur), "Error");
    assert.equal(typeErreurSecurise("échec contenant des données privées"), "ErreurNonIdentifiee");
  });
});
