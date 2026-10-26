import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { test } from "node:test";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";

const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const dossierD1 = process.env.SIGAD_D1_STATE_DIR;

function ouvrirD1Locale() {
  if (!dossierD1) throw new Error("Le chemin de la D1 locale isolée est requis.");
  const candidats = readdirSync(dossierD1).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  for (const candidat of candidats) {
    const base = new DatabaseSync(join(dossierD1, candidat));
    if (base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inscriptions_delegues'").get()) return base;
    base.close();
  }
  throw new Error("La base D1 locale isolée est introuvable.");
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
    });
    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      const separateur = paire?.indexOf("=") ?? -1;
      if (separateur < 1 || !paire) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (!valeur || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    const texte = await reponse.text();
    let donnees = null;
    try { donnees = JSON.parse(texte); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async initialiserCsrf() {
    const resultat = await this.requete("/api/auth/csrf");
    assert.equal(resultat.reponse.status, 200);
    this.jetonCsrf = resultat.donnees.jeton_csrf;
  }
}

async function dernierCourrielPour(courriel) {
  const adresse = process.env.SIGAD_TEST_EMAIL_CAPTURE_URL;
  if (!adresse) throw new Error("Le service local de capture des e-mails de test est absent.");
  const reponse = await fetch(new URL("/__test/emails", adresse));
  assert.equal(reponse.status, 200);
  const messages = await reponse.json();
  assert.equal(Array.isArray(messages), true);
  return messages.reverse().find((message) => Array.isArray(message.to) && message.to.includes(courriel)) ?? null;
}

test("Une demande non vérifiée en mode sans e-mail peut reprendre l’OTP après activation du service", async (t) => {
  if (process.env.SIGAD_EMAIL_DELIVERY_ENABLED === "false") {
    t.skip("La reprise OTP nécessite le mode e-mail activé avec le fournisseur local de test.");
    return;
  }

  const courriel = `reprise-otp-${randomBytes(12).toString("hex")}@example.com`;
  const inscriptionId = crypto.randomUUID();
  const hashMotDePasse = await hacherMotDePasse(`Sigad-${randomBytes(18).toString("base64url")}Aa9`);
  const base = ouvrirD1Locale();
  try {
    base.prepare(`INSERT INTO inscriptions_delegues
      (id, nom_complet, province_id, courriel, telephone, mot_de_passe_hash, statut, courriel_verifie_le)
      VALUES (?, 'Demande en attente sans e-mail', 'prov-sila', ?, '+235 66 00 11 22', ?, 'EN_ATTENTE_APPROBATION', NULL)`)
      .run(inscriptionId, courriel, hashMotDePasse);
  } finally {
    base.close();
  }

  const client = new ClientLocal();
  await client.initialiserCsrf();
  const renvoi = await client.requete("/api/inscriptions/delegues/renvoyer-code", {
    methode: "POST", corps: { courriel },
  });
  assert.equal(renvoi.reponse.status, 202, "Le renvoi est disponible après activation réelle du mode e-mail.");
  const message = await dernierCourrielPour(courriel);
  assert.ok(message && typeof message.text === "string", "Le fournisseur local doit avoir reçu le message de vérification.");
  const code = message.text.match(/code de vérification SIGAD est\s*:\s*(\d{6})/iu)?.[1];
  assert.ok(code, "Le message de test contient un OTP à six chiffres.");

  const verification = await client.requete("/api/inscriptions/delegues/verifier-courriel", {
    methode: "POST", corps: { courriel, code },
  });
  assert.equal(verification.reponse.status, 200, "L’adresse peut être vérifiée sans modifier l’approbation administrative en attente.");

  const apres = ouvrirD1Locale();
  try {
    const demande = apres.prepare("SELECT statut, courriel_verifie_le, utilisateur_cree_id FROM inscriptions_delegues WHERE id = ?")
      .get(inscriptionId);
    assert.equal(demande.statut, "EN_ATTENTE_APPROBATION");
    assert.ok(demande.courriel_verifie_le);
    assert.equal(demande.utilisateur_cree_id, null, "La vérification d’e-mail seule ne crée pas de compte utilisateur.");
    assert.equal(apres.prepare(`SELECT COUNT(*) AS total FROM verifications_courriel
      WHERE inscription_id = ? AND consomme_le IS NULL`).get(inscriptionId).total, 0, "L’OTP est à usage unique.");
    assert.equal(apres.prepare(`SELECT COUNT(*) AS total FROM journaux_inscriptions
      WHERE inscription_id = ? AND action = 'EMAIL_VERIFIE'`).get(inscriptionId).total, 1);
  } finally {
    apres.close();
  }
});
