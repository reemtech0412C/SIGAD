import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  for (const fichier of readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossierEtat, fichier));
    base.exec("PRAGMA foreign_keys = ON");
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'operations_centrales_distribution'").get().total === 1) {
      return base;
    }
    base.close();
  }
  throw new Error("La base D1 locale des opérations centrales est introuvable.");
}

function nouveauMotDePasse() {
  return `Test-${randomBytes(18).toString("base64url")}Aa9!`;
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;
  motDePasseActuel = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers();
    if (!options.brut) entetes.set("Accept", "application/json");
    const formulaire = options.corps instanceof FormData;
    if (options.corps !== undefined && !formulaire) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));

    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: formulaire ? options.corps : JSON.stringify(options.corps) }),
    });

    for (const cookie of reponse.headers.getSetCookie()) {
      const [paire, ...attributs] = cookie.split(";");
      if (!paire) continue;
      const separateur = paire.indexOf("=");
      if (separateur < 1) continue;
      const nom = paire.slice(0, separateur).trim();
      const valeur = decodeURIComponent(paire.slice(separateur + 1).trim());
      if (!valeur || attributs.some((attribut) => /^\s*Max-Age=0\s*$/iu.test(attribut))) this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }

    if (options.brut) {
      return { reponse, donnees: null };
    }

    let donnees = null;
    try { donnees = await reponse.json(); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async connexion(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    let connexion = await this.requete("/api/auth/connexion", {
      methode: "POST", corps: { identifiant, mot_de_passe: motDePasse },
    });
    assert.equal(connexion.reponse.status, 200, `La connexion locale du compte ${identifiant} doit réussir.`);
    connexion = await terminerConnexionMfaTest(this, identifiant, connexion);
    if (connexion.donnees?.utilisateur?.doit_changer_mot_de_passe) {
      const nouveauMdp = nouveauMotDePasse();
      const changement = await this.requete("/api/auth/changer-mot-de-passe-initial", {
        methode: "POST", corps: { nouveau_mot_de_passe: nouveauMdp },
      });
      assert.equal(changement.reponse.status, 200, "Le changement initial de mot de passe doit être obligatoire.");
      this.motDePasseActuel = nouveauMdp;
    } else {
      this.motDePasseActuel = motDePasse;
    }
    if (["central", "proprietaire"].includes(identifiant)) await configurerMfaTest(this, identifiant);
    return connexion;
  }
}

async function ouvrirSessions(base) {
  const comptes = {};
  for (const identifiant of ["sila", "central", "proprietaire"]) {
    const motDePasse = nouveauMotDePasse();
    const empreinte = await hacherMotDePasse(motDePasse);
    base.prepare(
      `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?,
       code_activation_expire_le = datetime('now', '+24 hours'),
       doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0,
       verrouille_jusqua = NULL WHERE identifiant = ?`,
    ).run(empreinte, empreinte, identifiant);
    const client = new ClientLocal();
    await client.connexion(identifiant, motDePasse);
    comptes[identifiant] = client;
  }
  for (const [identifiant, fichier] of [
    ["central", process.env.SIGAD_E2E_PASSWORD_FILE],
    ["sila", process.env.SIGAD_E2E_SILA_PASSWORD_FILE],
    ["proprietaire", process.env.SIGAD_E2E_PROPRIETAIRE_PASSWORD_FILE],
  ]) {
    const motDePasseActuel = comptes[identifiant]?.motDePasseActuel;
    if (fichier && motDePasseActuel) {
      await writeFile(fichier, `${motDePasseActuel}\n`, { encoding: "utf8", flag: "w", mode: 0o600 });
    }
  }
  return comptes;
}

test("Cycle complet de gestion et purge sécurisée des données de test sur Worker local", async () => {
  const base = ouvrirD1Locale();

  try {
    const sessions = await ouvrirSessions(base);
    const clientSila = sessions.sila;
    const clientCentral = sessions.central;
    const clientProprietaire = sessions.proprietaire;

    // 1. Contrôle d'accès strict (seul PROPRIETAIRE autorisé)
    const accesSila = await clientSila.requete("/api/proprietaire/donnees-test/operations");
    assert.equal(accesSila.reponse.status, 403, "Le délégué provincial doit être rejeté avec 403.");

    const accesCentral = await clientCentral.requete("/api/proprietaire/donnees-test/operations");
    assert.equal(accesCentral.reponse.status, 403, "L'administrateur central doit être rejeté avec 403.");

    const accesProprietaire = await clientProprietaire.requete("/api/proprietaire/donnees-test/operations");
    assert.equal(accesProprietaire.reponse.status, 200, "Le propriétaire doit pouvoir accéder au module.");
    assert.ok(Array.isArray(accesProprietaire.donnees.elements));

    // 2. Création d'une opération fictive non classifiée (INDETERMINE) simulant une opération antérieure
    const idFictif = "op-fictif-e2e-001";
    const codeFictif = "OPC-FICTIF-E2E-001";

    base.prepare(`
      INSERT OR REPLACE INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable,
        statut, nature_donnees, cree_par
      ) VALUES (
        ?, ?, 'Opération Fictive de Test Intégration', '2026-2027', 'MASSNAH',
        'BROUILLON', 'INDETERMINE', 'usr-central'
      )
    `).run(idFictif, codeFictif);

    base.prepare(`
      INSERT OR REPLACE INTO operations_centrales_provinces (id, operation_id, province_id, quantite_allouee_prevue)
      VALUES ('opp-fictif-001', ?, 'prov-sila', 300)
    `).run(idFictif);

    base.prepare(`
      INSERT OR REPLACE INTO documents_operations (
        id, operation_id, categorie_document, intitule, cle_r2,
        nom_fichier_original, type_mime, taille_octets, televerse_par
      ) VALUES (
        'doc-fictif-001', ?, 'ARRETE_MINISTERIEL', 'Arrêté fictif', 'operations/op-fictif-e2e-001/arrete.pdf',
        'arrete.pdf', 'application/pdf', 1024, 'usr-central'
      )
    `).run(idFictif);

    // 3. Consultation du pré-vol (Aperçu)
    const apercuAvant = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/apercu`);
    assert.equal(apercuAvant.reponse.status, 200);
    assert.equal(apercuAvant.donnees.statut_eligibilite, "NON_CONFIRME");
    assert.equal(apercuAvant.donnees.eligible, false);

    // 4. Tentative de suppression sans reclassification (doit être refusée 409)
    const tentativeSupprIndet = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/supprimer`, {
      methode: "POST",
      corps: {
        confirmation_code: codeFictif,
        mot_de_passe_confirmation: clientProprietaire.motDePasseActuel,
        motif: "Tentative suppression indéterminée",
      },
    });
    assert.equal(tentativeSupprIndet.reponse.status, 409, "La suppression directe d'une opération INDETERMINE doit être rejetée.");

    // 5. Reclassification administrative avec preuves
    // 5.1 Rejet avec mauvais mot de passe
    const reclassMdpFaux = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/reclassifier`, {
      methode: "POST",
      corps: {
        nature_cible: "TEST",
        motif: "Opération de test d'acceptation de bout en bout",
        preuves_justificatives: "Session test Worker local du 2026-10-24",
        mot_de_passe_confirmation: "MauvaisMotDePasse123!",
      },
    });
    assert.equal(reclassMdpFaux.reponse.status, 403, "Le mauvais mot de passe doit renvoyer 403.");

    // 5.2 Succès avec mot de passe valide
    const reclassSucces = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/reclassifier`, {
      methode: "POST",
      corps: {
        nature_cible: "TEST",
        motif: "Opération de test d'acceptation de bout en bout",
        preuves_justificatives: "Session test Worker local du 2026-10-24",
        mot_de_passe_confirmation: clientProprietaire.motDePasseActuel,
      },
    });
    assert.equal(reclassSucces.reponse.status, 200);
    assert.equal(reclassSucces.donnees.nouveau_statut_nature, "TEST");

    // Vérifier la mise à jour en base locale
    const opReclassee = base.prepare("SELECT nature_donnees FROM operations_centrales_distribution WHERE id = ?").get(idFictif);
    assert.equal(opReclassee.nature_donnees, "TEST");

    // 6. Nouvel aperçu après reclassification : l'opération doit être ELIGIBLE
    const apercuApres = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/apercu`);
    assert.equal(apercuApres.reponse.status, 200);
    assert.equal(apercuApres.donnees.statut_eligibilite, "ELIGIBLE");
    assert.equal(apercuApres.donnees.eligible, true);

    // 7. Protocole de suppression sécurisée
    // 7.1 Rejet si code erroné
    const supprCodeFaux = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/supprimer`, {
      methode: "POST",
      corps: {
        confirmation_code: "MAUVAIS-CODE-000",
        mot_de_passe_confirmation: clientProprietaire.motDePasseActuel,
        motif: "Nettoyage opération fictive validée",
      },
    });
    assert.equal(supprCodeFaux.reponse.status, 400, "Le code inexact doit être rejeté.");

    // 7.2 Rejet si mot de passe erroné
    const supprMdpFaux = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/supprimer`, {
      methode: "POST",
      corps: {
        confirmation_code: codeFictif,
        mot_de_passe_confirmation: "MauvaisMdpProprietaire!",
        motif: "Nettoyage opération fictive validée",
      },
    });
    assert.equal(supprMdpFaux.reponse.status, 403, "Le mot de passe incorrect doit être rejeté.");

    // 7.3 Exécution conforme de la purge
    const supprValide = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idFictif}/supprimer`, {
      methode: "POST",
      corps: {
        confirmation_code: codeFictif,
        mot_de_passe_confirmation: clientProprietaire.motDePasseActuel,
        motif: "Purge de fin de test d'acceptation de bout en bout",
      },
    });
    assert.equal(supprValide.reponse.status, 200);
    assert.equal(supprValide.donnees.succes, true);
    assert.equal(supprValide.donnees.code_operation, codeFictif);

    // 8. Vérification de l'intégrité D1
    const opApres = base.prepare("SELECT COUNT(*) AS total FROM operations_centrales_distribution WHERE id = ?").get(idFictif).total;
    assert.equal(opApres, 0, "L'opération centrale doit être supprimée.");

    const docApres = base.prepare("SELECT COUNT(*) AS total FROM documents_operations WHERE operation_id = ?").get(idFictif).total;
    assert.equal(docApres, 0, "Les documents associés doivent être supprimés.");

    const provApres = base.prepare("SELECT COUNT(*) AS total FROM operations_centrales_provinces WHERE operation_id = ?").get(idFictif).total;
    assert.equal(provApres, 0, "Les provinces rattachées doivent être supprimées.");

    // 9. Vérification du journal d'audit immuable
    const audit = base.prepare("SELECT * FROM audits_suppression_donnees_test WHERE entite_id = ?").get(idFictif);
    assert.ok(audit, "Un audit permanent doit être présent.");
    assert.equal(audit.code_entite, codeFictif);
    assert.equal(audit.utilisateur_identifiant, "proprietaire");
    assert.equal(audit.statut_resultat, "SUCCES");

    // 10. Immuabilité absolue de l'audit
    assert.throws(() => {
      base.prepare("UPDATE audits_suppression_donnees_test SET motif = 'Altération interdite' WHERE id = ?").run(audit.id);
    }, /immuable/iu);

    assert.throws(() => {
      base.prepare("DELETE FROM audits_suppression_donnees_test WHERE id = ?").run(audit.id);
    }, /ne peuvent pas être supprimés/iu);

    // 11. Protection des données REEL
    const idReel = "op-fictif-reel-999";
    base.prepare(`
      INSERT OR REPLACE INTO operations_centrales_distribution (
        id, code_operation, intitule, annee_campagne, institution_responsable, statut, nature_donnees, cree_par
      ) VALUES (
        ?, 'OPC-REEL-PROTEGE', 'Opération Réelle Fictive', '2026-2027', 'MASSNAH', 'OUVERTE', 'REEL', 'usr-central'
      )
    `).run(idReel);

    const supprReel = await clientProprietaire.requete(`/api/proprietaire/donnees-test/operations/${idReel}/supprimer`, {
      methode: "POST",
      corps: {
        confirmation_code: "OPC-REEL-PROTEGE",
        mot_de_passe_confirmation: clientProprietaire.motDePasseActuel,
        motif: "Tentative suppression d'une donnée réelle",
      },
    });
    assert.equal(supprReel.reponse.status, 409, "Une opération classifiée REEL ne doit jamais pouvoir être purgée.");

    // Nettoyage de l'opération réelle fictive
    base.prepare("DELETE FROM operations_centrales_distribution WHERE id = ?").run(idReel);

  } finally {
    base.close();
  }
});
