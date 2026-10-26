import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { normaliserNomCommune } from "../../frontend/src/utils/recherche-territoire.ts";

describe("Recherche des communes", () => {
  it("ignore la casse et les accents français", () => {
    assert.equal(normaliserNomCommune("Guéra"), normaliserNomCommune("GUERA"));
    assert.equal(normaliserNomCommune("Tandjilé"), normaliserNomCommune("tandjile"));
  });

  it("normalise les apostrophes et les traits d’union pour les noms composés", () => {
    assert.equal(normaliserNomCommune("N’Djaména"), "ndjamena");
    assert.equal(normaliserNomCommune("Barh-El-Gazel"), "barh el gazel");
  });

  it("ramène les espaces répétés à un séparateur unique", () => {
    assert.equal(normaliserNomCommune("  Mayo   Kebbi—Est  "), "mayo kebbi est");
  });
});
