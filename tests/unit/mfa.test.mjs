import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  chiffrerSecretTotp,
  codeTotp,
  dechiffrerSecretTotp,
  decoderBase32,
  encoderBase32,
  genererCodesRecuperation,
  normaliserCodeRecuperation,
  uriProvisionnementTotp,
  verifierCodeTotp,
} from "../../backend/src/services/mfa.service.ts";

describe("Authentification TOTP", () => {
  const secretRfc = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("suit le vecteur RFC 6238 HMAC-SHA1 à 59 secondes", async () => {
    const resultat = await codeTotp(secretRfc, 59_000);
    assert.equal(resultat.code, "287082");
    assert.equal(resultat.compteur, 1);
    assert.equal(await verifierCodeTotp(secretRfc, "287082", 59_000), 1);
    assert.equal(await verifierCodeTotp(secretRfc, "287083", 59_000), null);
  });

  it("encode et décode le secret Base32 sans perte", () => {
    const octets = new TextEncoder().encode("SIGAD-TOTP-SECRET-32");
    assert.deepEqual(decoderBase32(encoderBase32(octets)), octets);
  });

  it("chiffre le secret AES-GCM et refuse toute altération", async () => {
    const cle = Buffer.alloc(32, 37).toString("base64url");
    const chiffre = await chiffrerSecretTotp(secretRfc, cle);
    assert.match(chiffre, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    assert.equal(await dechiffrerSecretTotp(chiffre, cle), secretRfc);
    await assert.rejects(() => dechiffrerSecretTotp(`${chiffre.slice(0, -1)}A`, cle));
    await assert.rejects(() => chiffrerSecretTotp(secretRfc, "cle-invalide"));
  });

  it("prépare une URI standard et dix codes de récupération distincts", () => {
    const uri = uriProvisionnementTotp(secretRfc, "admin.central");
    assert.match(uri, /^otpauth:\/\/totp\//u);
    assert.match(uri, /algorithm=SHA1/u);
    const codes = genererCodesRecuperation();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes.map(normaliserCodeRecuperation)).size, 10);
    assert.ok(codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){7}$/u.test(code)));
  });
});
