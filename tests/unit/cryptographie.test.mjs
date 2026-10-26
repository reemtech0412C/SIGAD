import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  comparerSecrets,
  genererJetonAleatoire,
  hacherJeton,
  hacherMotDePasse,
  verifierMotDePasse,
} from "../../backend/src/services/cryptographie.service.ts";

describe("Service cryptographique SIGAD", () => {
  it("produit des empreintes PBKDF2 distinctes et vérifie le bon mot de passe", async () => {
    const empreinteA = await hacherMotDePasse("Mot-de-passe-Tchad-2026!");
    const empreinteB = await hacherMotDePasse("Mot-de-passe-Tchad-2026!");

    assert.notEqual(empreinteA, empreinteB);
    assert.match(empreinteA, /^pbkdf2-sha256\$100000\$/u);
    assert.equal(await verifierMotDePasse("Mot-de-passe-Tchad-2026!", empreinteA), true);
    assert.equal(await verifierMotDePasse("Mot-de-passe-incorrect", empreinteA), false);
  });

  it("rejette les empreintes mal formées et les paramètres PBKDF2 hors limites", async () => {
    assert.equal(await verifierMotDePasse("secret", "empreinte-invalide"), false);
    assert.equal(await verifierMotDePasse("secret", "pbkdf2-sha256$99999$YWJj$YWJj"), false);
    assert.equal(await verifierMotDePasse("secret", "pbkdf2-sha256$100001$YWJj$YWJj"), false);
    assert.equal(await verifierMotDePasse("secret", "pbkdf2-sha256$310000$YWJj$YWJj"), false);
  });

  it("génère des jetons aléatoires URL-safe de longueur attendue", () => {
    const jeton = genererJetonAleatoire();

    assert.match(jeton, /^[A-Za-z0-9_-]{43}$/u);
    assert.notEqual(jeton, genererJetonAleatoire());
  });

  it("empreinte les jetons de manière stable sans exposer le jeton brut", async () => {
    const jeton = genererJetonAleatoire();
    const empreinte = await hacherJeton(jeton);

    assert.equal(await hacherJeton(jeton), empreinte);
    assert.notEqual(empreinte, jeton);
  });

  it("compare les secrets sans confondre des valeurs différentes", async () => {
    assert.equal(await comparerSecrets("valeur-identique", "valeur-identique"), true);
    assert.equal(await comparerSecrets("valeur-initiale", "valeur-modifiée"), false);
  });
});
