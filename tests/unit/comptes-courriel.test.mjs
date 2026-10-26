import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  courrielEstConfigure,
  envoyerCodeVerification,
  envoyerCourriel,
} from "../../backend/src/services/courriel.service.ts";
import {
  empreinteCodeVerification,
  empreinteLimite,
  genererCodeSixChiffres,
} from "../../backend/src/services/verification-courriel.service.ts";

const secretTest = Buffer.from("sigad-test-secret-that-is-at-least-thirty-two-bytes").toString("base64url");

describe("vérification par e-mail des comptes", () => {
  it("génère des codes strictement numériques à six chiffres", () => {
    for (let iteration = 0; iteration < 250; iteration += 1) {
      assert.match(genererCodeSixChiffres(), /^\d{6}$/u);
    }
  });

  it("lie l’empreinte HMAC au type, à la demande et au code", async () => {
    const empreinte = await empreinteCodeVerification(secretTest, "INSCRIPTION_DELEGUE", "demande-1", "001234");
    assert.match(empreinte, /^[A-Za-z0-9_-]{43}$/u);
    assert.notEqual(empreinte, "001234");
    assert.equal(empreinte, await empreinteCodeVerification(secretTest, "INSCRIPTION_DELEGUE", "demande-1", "001234"));
    assert.notEqual(empreinte, await empreinteCodeVerification(secretTest, "INSCRIPTION_DELEGUE", "demande-2", "001234"));
    assert.notEqual(empreinte, await empreinteCodeVerification(secretTest, "MODIFICATION_PROFIL", "demande-1", "001234"));
    assert.notEqual(await empreinteLimite(secretTest, "INSCRIPTION_IP", "127.0.0.1"),
      await empreinteLimite(secretTest, "INSCRIPTION_COURRIEL", "127.0.0.1"));
  });

  it("refuse une clé HMAC trop courte ou mal formée", async () => {
    await assert.rejects(empreinteCodeVerification("AQ", "type", "cible", "123456"), /SECRET_OTP/u);
    await assert.rejects(empreinteLimite("%%%", "type", "valeur"), /SECRET_OTP/u);
  });

  it("ne considère le service prêt que si la clé et l’adresse d’expédition existent", () => {
    assert.equal(courrielEstConfigure({}), false);
    assert.equal(courrielEstConfigure({ RESEND_API_KEY: "clé-test" }), false);
    assert.equal(courrielEstConfigure({ SIGAD_EMAIL_FROM: "sigad@example.invalid" }), false);
    assert.equal(courrielEstConfigure({ RESEND_API_KEY: " clé-test ", SIGAD_EMAIL_FROM: " sigad@example.invalid " }), true);
  });

  it("transmet le code au prestataire sans l’écrire ailleurs et échappe le HTML", async () => {
    let requeteCapturee;
    const emetteur = async (requete) => {
      requeteCapturee = {
        url: requete.url,
        autorisation: requete.headers.get("Authorization"),
        cleIdempotence: requete.headers.get("Idempotency-Key"),
        corps: await requete.json(),
      };
      return new Response('{"id":"local-test"}', { status: 200, headers: { "content-type": "application/json" } });
    };
    await envoyerCodeVerification({ RESEND_API_KEY: "cle-fictive", SIGAD_EMAIL_FROM: "test@example.invalid" }, {
      destinataire: "delegue@example.com",
      code: "012345",
      identifiantEnvoi: "cle-idempotence-test",
      sujet: "Vérification",
      introduction: "<script>contenu inerte</script>",
    }, emetteur);
    assert.equal(requeteCapturee.url, "https://api.resend.com/emails");
    assert.equal(requeteCapturee.autorisation, "Bearer cle-fictive");
    assert.equal(requeteCapturee.cleIdempotence, "cle-idempotence-test");
    assert.match(requeteCapturee.corps.text, /012345/u);
    assert.equal(requeteCapturee.corps.html.includes("<script>"), false);
    assert.match(requeteCapturee.corps.html, /&lt;script&gt;/u);
  });

  it("refuse une URL de prestataire de test qui ne cible pas loopback HTTP", async () => {
    await assert.rejects(envoyerCourriel({
      RESEND_API_KEY: "cle-fictive",
      SIGAD_EMAIL_FROM: "test@example.invalid",
      SIGAD_EMAIL_API_URL: "https://evil.example/emails",
    }, {
      destinataire: "delegue@example.com", sujet: "Test", texte: "Test", contenuHtml: "Test", identifiantEnvoi: "test",
    }), /DESTINATION_COURRIEL_TEST_NON_AUTORISEE/u);
  });
});
