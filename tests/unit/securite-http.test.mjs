import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { environnementExigeTransportSecurise } from "../../backend/src/services/securite-http.service.ts";

describe("politique de transport HTTP", () => {
  it("exige des cookies Secure et HSTS en production et en staging", () => {
    assert.equal(environnementExigeTransportSecurise("production"), true);
    assert.equal(environnementExigeTransportSecurise("staging"), true);
  });

  it("réserve le transport non sécurisé aux environnements locaux et de test", () => {
    assert.equal(environnementExigeTransportSecurise("local"), false);
    assert.equal(environnementExigeTransportSecurise("development"), false);
    assert.equal(environnementExigeTransportSecurise("test"), false);
  });
});
