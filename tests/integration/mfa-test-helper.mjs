import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { codeTotp, dechiffrerSecretTotp } from "../../backend/src/services/mfa.service.ts";

function ouvrirBaseLocale() {
  const dossier = process.env.SIGAD_D1_STATE_DIR;
  if (!dossier) throw new Error("Le chemin de la base D1 locale de test est absent.");
  for (const nom of readdirSync(dossier).filter((entree) => entree.endsWith(".sqlite") && entree !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossier, nom));
    const sigad = base.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get();
    if (sigad) return base;
    base.close();
  }
  throw new Error("La base D1 locale SIGAD est introuvable pour le contrôle MFA.");
}

async function secretCompte(identifiant) {
  const cle = process.env.SIGAD_MFA_TEST_KEY;
  if (!cle) throw new Error("La clé MFA temporaire de test n’est pas configurée.");
  const base = ouvrirBaseLocale();
  try {
    const ligne = base.prepare("SELECT double_facteur_secret FROM utilisateurs WHERE identifiant = ? AND double_facteur_actif = 1")
      .get(identifiant);
    const chiffre = ligne && Reflect.get(ligne, "double_facteur_secret");
    if (typeof chiffre !== "string") throw new Error(`Le compte ${identifiant} n’a pas de secret MFA chiffré.`);
    return dechiffrerSecretTotp(chiffre, cle);
  } finally {
    base.close();
  }
}

export async function codeMfaInutilise(identifiant) {
  const secret = await secretCompte(identifiant);
  const base = ouvrirBaseLocale();
  let compteurUtilise;
  try {
    const ligne = base.prepare("SELECT MAX(compteur) AS compteur FROM compteurs_totp_utilises WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE identifiant = ?)")
      .get(identifiant);
    compteurUtilise = ligne && typeof Reflect.get(ligne, "compteur") === "number" ? Reflect.get(ligne, "compteur") : null;
  } finally {
    base.close();
  }
  let compteur = Math.floor(Date.now() / 30_000);
  if (compteurUtilise !== null && compteur <= compteurUtilise) compteur = compteurUtilise + 1;
  const limiteAttente = Date.now() + 31_000;
  while (compteur > Math.floor(Date.now() / 30_000) + 1 && Date.now() < limiteAttente) {
    await new Promise((resoudre) => setTimeout(resoudre, 250));
  }
  if (compteur > Math.floor(Date.now() / 30_000) + 1) throw new Error("Aucun compteur TOTP inutilisé n’est disponible dans la fenêtre de vérification.");
  return (await codeTotp(secret, compteur * 30_000)).code;
}

export async function configurerMfaTest(client, identifiant) {
  const statut = await client.requete("/api/auth/mfa/statut");
  if (statut.reponse.status === 200 && statut.donnees?.actif === true) return [];
  const initialisation = await client.requete("/api/auth/mfa/initialiser", { methode: "POST" });
  assert.equal(initialisation.reponse.status, 200, `Le compte ${identifiant} doit pouvoir initialiser MFA.`);
  const secret = initialisation.donnees?.secret_totp;
  assert.equal(typeof secret, "string");
  const code = (await codeTotp(secret)).code;
  const confirmation = await client.requete("/api/auth/mfa/confirmer", { methode: "POST", corps: { code } });
  assert.equal(confirmation.reponse.status, 200, `Le compte ${identifiant} doit confirmer MFA.`);
  assert.equal(confirmation.donnees?.codes_recuperation?.length, 10);
  return confirmation.donnees.codes_recuperation;
}

export async function terminerConnexionMfaTest(client, identifiant, resultat) {
  if (resultat.donnees?.mfa_requis !== true) return resultat;
  const code = await codeMfaInutilise(identifiant);
  const verification = await client.requete("/api/auth/mfa/verifier", { methode: "POST", corps: { code } });
  assert.equal(verification.reponse.status, 200, `Le défi MFA de ${identifiant} doit être validé.`);
  return verification;
}

export async function initialiserMfaSiNecessaire(client, identifiant, utilisateur) {
  const doubleFacteurActif = utilisateur && Reflect.get(utilisateur, "double_facteur_actif");
  const changementRequis = utilisateur && Reflect.get(utilisateur, "doit_changer_mot_de_passe");
  if (doubleFacteurActif === false && changementRequis === false && ["central", "proprietaire"].includes(identifiant)) {
    await configurerMfaTest(client, identifiant);
  }
}
