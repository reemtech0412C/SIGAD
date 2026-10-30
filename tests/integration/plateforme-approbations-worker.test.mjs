import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { codeMfaInutilise, configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const BASE = "/api/proprietaire/plateforme";

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  for (const fichier of readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossierEtat, fichier));
    base.exec("PRAGMA foreign_keys = ON");
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'demandes_approbation'").get().total === 1) {
      return base;
    }
    base.close();
  }
  throw new Error("La base D1 locale de la console Plateforme est introuvable.");
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
    });
    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      const separateur = paire?.indexOf("=") ?? -1;
      if (!paire || separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (!valeur || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    let donnees = null;
    try { donnees = await reponse.json(); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async connexion(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    let connexion = await this.requete("/api/auth/connexion", { methode: "POST", corps: { identifiant, mot_de_passe: motDePasse } });
    assert.equal(connexion.reponse.status, 200, `La connexion de ${identifiant} doit réussir.`);
    connexion = await terminerConnexionMfaTest(this, identifiant, connexion);
    if (connexion.donnees?.utilisateur?.doit_changer_mot_de_passe) {
      const nouveau = `Test-${randomBytes(18).toString("base64url")}Aa9!`;
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", { methode: "POST", corps: { nouveau_mot_de_passe: nouveau } });
      assert.equal(changement.reponse.status, 200);
    }
    await configurerMfaTest(this, identifiant);
    return connexion;
  }
}

async function preparerProprietaire(base, identifiant, id) {
  const motDePasse = `Test-${randomBytes(18).toString("base64url")}Aa9!`;
  const empreinte = await hacherMotDePasse(motDePasse);
  if (id) {
    base.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
      VALUES (?, ?, 'Propriétaire synthétique B3.2', 'PROPRIETAIRE', NULL, ?, 'ACTIF', 0)`).run(id, identifiant, empreinte);
  } else {
    base.prepare(`UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?, code_activation_expire_le = datetime('now', '+24 hours'),
      doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL WHERE identifiant = ?`)
      .run(empreinte, empreinte, identifiant);
  }
  const client = new ClientLocal();
  await client.connexion(identifiant, motDePasse);
  return client;
}

test("Console Plateforme: cycle complet de demande, approbation, exécution et audit d'un drapeau à double contrôle", async () => {
  const base = ouvrirD1Locale();
  const identifiantB = `proprietaire-b32-${randomBytes(4).toString("hex")}`;
  try {
    const a = await preparerProprietaire(base, "proprietaire");
    const proprietaireA = base.prepare("SELECT id FROM utilisateurs WHERE identifiant = 'proprietaire'").get().id;

    // Un seul propriétaire actif: toute demande de classe A échoue fermé.
    const seul = await a.requete(`${BASE}/approbations`, { methode: "POST", corps: { drapeau_code: "authz_observation", actif: true, motif: "Activation de l’observation Shadow." } });
    assert.equal(seul.reponse.status, 409);
    assert.match(seul.donnees.erreur, /SECOND_PROPRIETAIRE_ABSENT/u);

    const b = await preparerProprietaire(base, identifiantB, randomBytes(16).toString("hex"));
    const proprietaireB = base.prepare("SELECT id FROM utilisateurs WHERE identifiant = ?").get(identifiantB).id;

    const catalogue = await a.requete(`${BASE}/drapeaux`);
    assert.equal(catalogue.reponse.status, 200);
    assert.equal(catalogue.donnees.donnees.length, 5);
    assert.ok(catalogue.donnees.donnees.every((drapeau) => drapeau.actif === false));

    // Le drapeau de présentation se bascule directement, le drapeau d'autorisation exige une approbation.
    const direct = await a.requete(`${BASE}/drapeaux/consoles_v2`, { methode: "PUT", corps: { actif: true, motif: "Test de la console Plateforme." } });
    assert.equal(direct.reponse.status, 200);
    const refuseDirect = await a.requete(`${BASE}/drapeaux/authz_observation`, { methode: "PUT", corps: { actif: true, motif: "Contournement de l’approbation." } });
    assert.equal(refuseDirect.reponse.status, 409);

    const creation = await a.requete(`${BASE}/approbations`, { methode: "POST", corps: { drapeau_code: "authz_observation", actif: true, motif: "Activation de l’observation Shadow." } });
    assert.equal(creation.reponse.status, 201);
    const demandeId = creation.donnees.id;
    assert.equal(creation.donnees.statut, "EN_ATTENTE");
    const doublon = await a.requete(`${BASE}/approbations`, { methode: "POST", corps: { drapeau_code: "authz_observation", actif: true, motif: "Activation de l’observation Shadow." } });
    assert.equal(doublon.reponse.status, 409);

    // Séparation des tâches: le demandeur ne peut ni approuver ni refuser sa propre demande, ni exécuter avant approbation.
    const autoApprobation = await a.requete(`${BASE}/approbations/${demandeId}/approuver`, { methode: "POST", corps: { code_totp: await codeMfaInutilise("proprietaire") } });
    assert.equal(autoApprobation.reponse.status, 409);
    assert.match(autoApprobation.donnees.erreur, /AUTO_APPROBATION_INTERDITE/u);
    const autoRefus = await a.requete(`${BASE}/approbations/${demandeId}/refuser`, { methode: "POST", corps: { motif_decision: "Refus de ma propre demande." } });
    assert.equal(autoRefus.reponse.status, 403);
    const tropTot = await a.requete(`${BASE}/approbations/${demandeId}/executer`, { methode: "POST", corps: {} });
    assert.equal(tropTot.reponse.status, 409);

    // Approbation: code TOTP invalide refusé, code valide accepté, rejeu du même code refusé.
    const mauvaisCode = await b.requete(`${BASE}/approbations/${demandeId}/approuver`, { methode: "POST", corps: { code_totp: "000000" } });
    assert.equal(mauvaisCode.reponse.status, 401);
    const approbation = await b.requete(`${BASE}/approbations/${demandeId}/approuver`, {
      methode: "POST", corps: { code_totp: await codeMfaInutilise(identifiantB), motif_decision: "Vérifié avec le demandeur." },
    });
    assert.equal(approbation.reponse.status, 200);
    assert.equal(approbation.donnees.statut, "APPROUVEE");
    assert.equal(approbation.donnees.decide_par, proprietaireB);
    const reapprobation = await b.requete(`${BASE}/approbations/${demandeId}/approuver`, { methode: "POST", corps: { code_totp: await codeMfaInutilise(identifiantB) } });
    assert.equal(reapprobation.reponse.status, 409);

    // Seul le demandeur exécute; l'exécution est à usage unique et bascule effectivement le drapeau.
    const executionParB = await b.requete(`${BASE}/approbations/${demandeId}/executer`, { methode: "POST", corps: {} });
    assert.equal(executionParB.reponse.status, 403);
    const execution = await a.requete(`${BASE}/approbations/${demandeId}/executer`, { methode: "POST", corps: {} });
    assert.equal(execution.reponse.status, 200);
    assert.equal(execution.donnees.statut, "EXECUTEE");
    const reexecution = await a.requete(`${BASE}/approbations/${demandeId}/executer`, { methode: "POST", corps: {} });
    assert.equal(reexecution.reponse.status, 409);
    const apres = await a.requete(`${BASE}/drapeaux`);
    const drapeau = apres.donnees.donnees.find((entree) => entree.code === "authz_observation");
    assert.equal(drapeau.actif, true);
    assert.equal(drapeau.version, 2);

    // Refus par l'autre propriétaire avec motif; annulation réservée au demandeur.
    const seconde = await a.requete(`${BASE}/approbations`, { methode: "POST", corps: { drapeau_code: "authz_observation", actif: false, motif: "Désactivation de l’observation Shadow." } });
    assert.equal(seconde.reponse.status, 201);
    const annulationParB = await b.requete(`${BASE}/approbations/${seconde.donnees.id}/annuler`, { methode: "POST", corps: { motif_decision: "Annulation par un tiers." } });
    assert.equal(annulationParB.reponse.status, 403);
    const refus = await b.requete(`${BASE}/approbations/${seconde.donnees.id}/refuser`, { methode: "POST", corps: { motif_decision: "Désactivation non justifiée." } });
    assert.equal(refus.reponse.status, 200);
    assert.equal(refus.donnees.statut, "REFUSEE");

    // Tout est audité avec acteur, cible et motif.
    const actions = base.prepare(`SELECT action, utilisateur_id, entite_id FROM journaux_audit
      WHERE action LIKE 'DEMANDE_APPROBATION_%' OR action = 'BASCULE_DRAPEAU_SIMPLE' ORDER BY cree_le, rowid`).all();
    const noms = actions.map((ligne) => ligne.action);
    for (const attendu of ["BASCULE_DRAPEAU_SIMPLE", "DEMANDE_APPROBATION_CREEE", "DEMANDE_APPROBATION_APPROUVEE", "DEMANDE_APPROBATION_EXECUTEE", "DEMANDE_APPROBATION_REFUSEE"]) {
      assert.ok(noms.includes(attendu), `Audit manquant: ${attendu}`);
    }
    assert.equal(actions.find((ligne) => ligne.action === "DEMANDE_APPROBATION_APPROUVEE").utilisateur_id, proprietaireB);
    assert.equal(actions.find((ligne) => ligne.action === "DEMANDE_APPROBATION_CREEE").utilisateur_id, proprietaireA);
  } finally {
    // Remet le contexte partagé en état: un seul propriétaire actif et drapeaux d'origine.
    base.prepare("UPDATE utilisateurs SET statut = 'SUSPENDU' WHERE identifiant = ?").run(identifiantB);
    base.prepare("UPDATE demandes_approbation SET statut = 'ANNULEE' WHERE statut IN ('EN_ATTENTE', 'APPROUVEE')").run();
    base.prepare("UPDATE drapeaux_plateforme SET actif = 0 WHERE code IN ('consoles_v2', 'authz_observation')").run();
    base.close();
  }
});
