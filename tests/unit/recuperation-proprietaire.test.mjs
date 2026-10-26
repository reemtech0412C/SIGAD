import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { describe, it } from "vitest";
import {
  creerJetonActivationProprietaire,
  estEnvironnementAutoriseRecuperation,
  expirationJetonActivationProprietaire,
  expirationSessionActivation,
  verifierPreuveOperateur,
} from "../../backend/src/services/recuperation-proprietaire.service.ts";

const encodeur = new TextEncoder();
const encoderBase64Url = (valeur) => Buffer.from(valeur).toString("base64url");
const operateur = "operateur-staging-test";
const motif = "Récupération locale de test autorisée.";

async function creerPaireCles() {
  return webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

async function creerPreuve(paire, options = {}) {
  const maintenant = options.maintenant ?? Math.floor(Date.now() / 1000);
  const entete = { alg: "ES256", typ: "JWT", kid: "sigad-staging-recovery-v1" };
  const charge = {
    iss: "SIGAD-RECUPERATION-PROPRIETAIRE",
    aud: "sigad-staging-owner-recovery",
    sub: options.sub ?? "usr-proprietaire",
    operateur: options.operateur ?? operateur,
    operation: options.operation ?? "EMETTRE_ACTIVATION_INITIALE",
    jti: options.jti ?? encoderBase64Url(webcrypto.getRandomValues(new Uint8Array(32))),
    motif_sha256: options.motifSha256 ?? encoderBase64Url(await webcrypto.subtle.digest("SHA-256", encodeur.encode(motif))),
    iat: options.iat ?? maintenant,
    exp: options.exp ?? maintenant + 300,
  };
  const contenu = `${encoderBase64Url(JSON.stringify(entete))}.${encoderBase64Url(JSON.stringify(charge))}`;
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    paire.privateKey,
    encodeur.encode(contenu),
  );
  return `${contenu}.${encoderBase64Url(signature)}`;
}

async function clePubliqueEncodee(cle) {
  return encoderBase64Url(JSON.stringify(await webcrypto.subtle.exportKey("jwk", cle)));
}

describe("Récupération initiale sécurisée du propriétaire", () => {
  it("accepte une preuve ES256 valide, limitée à la cible, à l’opération et au motif", async () => {
    const paire = await creerPaireCles();
    const preuve = await creerPreuve(paire);
    const resultat = await verifierPreuveOperateur(
      preuve,
      operateur,
      await clePubliqueEncodee(paire.publicKey),
      "EMETTRE_ACTIVATION_INITIALE",
      motif,
    );
    assert.equal(resultat.identite, operateur);
    assert.match(resultat.empreinteNonce, /^[A-Za-z0-9_-]{43}$/u);
    assert.ok(Number.isFinite(Date.parse(`${resultat.expireLe.replace(" ", "T")}Z`)));
  });

  it("refuse un sujet, un opérateur, une opération ou un motif différents", async () => {
    const paire = await creerPaireCles();
    const cle = await clePubliqueEncodee(paire.publicKey);
    for (const options of [
      { sub: "usr-central" },
      { operateur: "autre-operateur" },
      { operation: "REVOQUER_ACTIVATION_INITIALE" },
      { motifSha256: encoderBase64Url(await webcrypto.subtle.digest("SHA-256", encodeur.encode("autre motif"))) },
    ]) {
      const preuve = await creerPreuve(paire, options);
      await assert.rejects(() => verifierPreuveOperateur(preuve, operateur, cle, "EMETTRE_ACTIVATION_INITIALE", motif));
    }
  });

  it("refuse les preuves expirées, trop longues, futures et les signatures altérées", async () => {
    const paire = await creerPaireCles();
    const cle = await clePubliqueEncodee(paire.publicKey);
    const maintenant = Math.floor(Date.now() / 1000);
    const cas = [
      { iat: maintenant - 600, exp: maintenant - 1 },
      { iat: maintenant - 1, exp: maintenant + 301 },
      { iat: maintenant + 60, exp: maintenant + 120 },
    ];
    for (const options of cas) {
      const preuve = await creerPreuve(paire, options);
      await assert.rejects(() => verifierPreuveOperateur(preuve, operateur, cle, "EMETTRE_ACTIVATION_INITIALE", motif));
    }
    const preuve = await creerPreuve(paire);
    const parties = preuve.split(".");
    assert.equal(parties.length, 3);
    const partie = parties[1] ?? "";
    const altere = `${partie.slice(0, -1)}${partie.endsWith("A") ? "B" : "A"}`;
    await assert.rejects(() => verifierPreuveOperateur(
      `${parties[0]}.${altere}.${parties[2]}`,
      operateur,
      cle,
      "EMETTRE_ACTIVATION_INITIALE",
      motif,
    ));
    await assert.rejects(() => verifierPreuveOperateur("non-jwt", operateur, cle, "EMETTRE_ACTIVATION_INITIALE", motif));
  });

  it("refuse une clé publique non approuvée et borne l’activation et sa session à quinze minutes", async () => {
    const paireApprouvee = await creerPaireCles();
    const paireNonApprouvee = await creerPaireCles();
    const preuve = await creerPreuve(paireApprouvee);
    const cleNonApprouvee = await clePubliqueEncodee(paireNonApprouvee.publicKey);
    await assert.rejects(() => verifierPreuveOperateur(
      preuve,
      operateur,
      cleNonApprouvee,
      "EMETTRE_ACTIVATION_INITIALE",
      motif,
    ));

    const maintenant = new Date("2026-10-24T10:00:00.000Z");
    assert.equal(
      Date.parse(`${expirationJetonActivationProprietaire(maintenant).replace(" ", "T")}Z`) - maintenant.getTime(),
      15 * 60_000,
    );
    assert.equal(
      Date.parse(`${expirationSessionActivation(maintenant).replace(" ", "T")}Z`) - maintenant.getTime(),
      15 * 60_000,
    );
  });

  it("génère des codes d’activation imprévisibles et garde le garde-fou d’environnement fermé par défaut", () => {
    const premier = creerJetonActivationProprietaire();
    const second = creerJetonActivationProprietaire();
    assert.notEqual(premier, second);
    assert.match(premier, /^[A-Za-z0-9_-]{43}$/u);
    assert.equal(estEnvironnementAutoriseRecuperation("development", "true"), false);
    assert.equal(estEnvironnementAutoriseRecuperation("production", "true"), false);
    assert.equal(estEnvironnementAutoriseRecuperation("staging", undefined), false);
    assert.equal(estEnvironnementAutoriseRecuperation("staging", "false"), false);
    assert.equal(estEnvironnementAutoriseRecuperation("staging", "true"), true);
  });
});
