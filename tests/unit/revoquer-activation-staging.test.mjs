import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { describe, it } from "vitest";
import { creerPreuveRevoquer, lireMotif, soumettreRequeteRevocation } from "../../scripts/revoquer-activation-proprietaire-staging.mjs";

const encoder = new TextEncoder();
const motif = "Annuler une activation staging inutilisée.";

describe("Outil opérateur de révocation Staging", () => {
  it("signe une preuve ES256 limitée à la révocation du propriétaire et à cinq minutes", async () => {
    const paire = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const clePrivee = await webcrypto.subtle.exportKey("jwk", paire.privateKey);
    const clePublique = await webcrypto.subtle.exportKey("jwk", paire.publicKey);
    const maintenant = 1_800_000_000_000;
    const preuve = await creerPreuveRevoquer(motif, clePrivee, "yami\\yami", maintenant);
    const parties = preuve.split(".");
    assert.equal(parties.length, 3);
    const charge = JSON.parse(Buffer.from(parties[1] ?? "", "base64url").toString("utf8"));
    assert.equal(charge.iss, "SIGAD-RECUPERATION-PROPRIETAIRE");
    assert.equal(charge.aud, "sigad-staging-owner-recovery");
    assert.equal(charge.sub, "usr-proprietaire");
    assert.equal(charge.operation, "REVOQUER_ACTIVATION_INITIALE");
    assert.equal(charge.exp - charge.iat, 300);
    assert.match(charge.jti, /^[A-Za-z0-9_-]{43}$/u);
    const cle = await webcrypto.subtle.importKey("jwk", clePublique, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valide = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cle,
      Buffer.from(parties[2] ?? "", "base64url"),
      encoder.encode(`${parties[0]}.${parties[1]}`),
    );
    assert.equal(valide, true);
  });

  it("n’accepte que la commande explicite et un motif borné", () => {
    assert.equal(lireMotif(["node", "script", "--executer-staging", `--motif=${motif}`]), motif);
    assert.throws(() => lireMotif(["node", "script", "--executer-staging", "--motif=court"]));
    assert.throws(() => lireMotif(["node", "script", "--executer-production", `--motif=${motif}`]));
  });

  it("envoie la preuve uniquement à la route de révocation Staging avec CSRF et ne journalise pas sa réponse", async () => {
    const appels = [];
    const jetonCsrf = "x".repeat(43);
    const transport = async (url, options = {}) => {
      appels.push({ url: String(url), options });
      if (String(url).endsWith("/api/sante")) return new Response("ok", { status: 200 });
      if (String(url).endsWith("/api/auth/csrf")) {
        return new Response(JSON.stringify({ jeton_csrf: jetonCsrf }), {
          status: 200,
          headers: { "Set-Cookie": `sigad_csrf=${jetonCsrf}; Secure; SameSite=Lax` },
        });
      }
      return new Response(JSON.stringify({ revoquee: true }), { status: 200 });
    };
    await soumettreRequeteRevocation(motif, "preuve-synthétique", transport);
    assert.equal(appels.length, 3);
    const dernier = appels[2];
    assert.equal(dernier.url, "https://sigad-staging.reemtech0412.workers.dev/api/auth/recuperation-proprietaire/revoquer");
    assert.equal(dernier.options.method, "POST");
    assert.equal(dernier.options.headers["X-CSRF-Token"], jetonCsrf);
    assert.equal(dernier.options.headers["X-SIGAD-Preuve-Operateur"], "preuve-synthétique");
    assert.deepEqual(JSON.parse(dernier.options.body), { motif });
    assert.equal(dernier.options.body.includes("code_activation"), false);
  });

  it("refuse sans exposer le corps une réponse Staging en échec", async () => {
    const transport = async (url) => {
      if (String(url).endsWith("/api/sante")) return new Response("ok", { status: 200 });
      if (String(url).endsWith("/api/auth/csrf")) {
        return new Response(JSON.stringify({ jeton_csrf: "z".repeat(43) }), {
          status: 200,
          headers: { "Set-Cookie": `sigad_csrf=${"z".repeat(43)}; Secure; SameSite=Lax` },
        });
      }
      return new Response("SENSITIVE_BODY_SHOULD_NOT_ESCAPE", { status: 409 });
    };
    await assert.rejects(
      () => soumettreRequeteRevocation(motif, "preuve-synthétique", transport),
      (erreur) => erreur instanceof Error
        && erreur.message.includes("HTTP 409")
        && !erreur.message.includes("SENSITIVE_BODY_SHOULD_NOT_ESCAPE"),
    );
  });
});
