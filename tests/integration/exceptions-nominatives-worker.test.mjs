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
const BASE = "/api/central/exceptions-nominatives";
const ROUTE = "GET /api/distributions/menages";

function ouvrirD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  for (const fichier of readdirSync(dossierEtat).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossierEtat, fichier));
    base.exec("PRAGMA foreign_keys = ON");
    if (base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'exceptions_acces_nominatif'").get().total === 1) {
      return base;
    }
    base.close();
  }
  throw new Error("La base D1 locale des exceptions nominatives est introuvable.");
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
  }
}

async function preparerCompte(base, identifiant, id) {
  const motDePasse = `Test-${randomBytes(18).toString("base64url")}Aa9!`;
  const empreinte = await hacherMotDePasse(motDePasse);
  if (id) {
    base.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
      VALUES (?, ?, 'Administrateur central synthétique B3.2', 'ADMIN_CENTRAL', NULL, ?, 'ACTIF', 0)`).run(id, identifiant, empreinte);
  } else {
    base.prepare(`UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = ?, code_activation_expire_le = datetime('now', '+24 hours'),
      doit_changer_mot_de_passe = 1, statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL WHERE identifiant = ?`)
      .run(empreinte, empreinte, identifiant);
  }
  const client = new ClientLocal();
  await client.connexion(identifiant, motDePasse);
  return client;
}

test("Exceptions d'accès nominatif: cycle complet à deux administrateurs centraux, exception inerte et auditée", async () => {
  const base = ouvrirD1Locale();
  const identifiantB = `central-b32-${randomBytes(4).toString("hex")}`;
  const idB = randomBytes(16).toString("hex");
  const corpsDemande = { route_cible: ROUTE, duree_heures: 2, motif: "Vérification d’un signalement de doublon nominatif." };
  try {
    // Les autres comptes ADMIN_CENTRAL du seed sont suspendus pour que le comptage actif soit déterministe.
    base.prepare("UPDATE utilisateurs SET statut = 'SUSPENDU' WHERE role = 'ADMIN_CENTRAL' AND identifiant <> 'central'").run();
    const a = await preparerCompte(base, "central");
    const idA = base.prepare("SELECT id FROM utilisateurs WHERE identifiant = 'central'").get().id;

    // Un seul administrateur central actif: échec fermé.
    const seul = await a.requete(BASE, { methode: "POST", corps: corpsDemande });
    assert.equal(seul.reponse.status, 409);
    assert.match(seul.donnees.erreur, /SECOND_ADMIN_CENTRAL_ABSENT/u);

    const b = await preparerCompte(base, identifiantB, idB);

    // Route hors liste fermée ou durée excessive: refusées avant toute écriture.
    for (const invalide of [{ ...corpsDemande, route_cible: "GET /api/stocks/entrepots" }, { ...corpsDemande, duree_heures: 48 }]) {
      assert.equal((await a.requete(BASE, { methode: "POST", corps: invalide })).reponse.status, 400);
    }

    const creation = await a.requete(BASE, { methode: "POST", corps: corpsDemande });
    assert.equal(creation.reponse.status, 201);
    const id = creation.donnees.id;
    assert.equal((await a.requete(BASE, { methode: "POST", corps: corpsDemande })).reponse.status, 409);

    // Séparation des tâches: auto-approbation, refus du demandeur et exécution prématurée sont refusés.
    const autoApprobation = await a.requete(`${BASE}/${id}/approuver`, { methode: "POST", corps: { code_totp: await codeMfaInutilise("central") } });
    assert.equal(autoApprobation.reponse.status, 409);
    assert.match(autoApprobation.donnees.erreur, /AUTO_APPROBATION_INTERDITE/u);
    assert.equal((await a.requete(`${BASE}/${id}/refuser`, { methode: "POST", corps: { motif_decision: "Refus de ma propre demande." } })).reponse.status, 403);
    assert.equal((await a.requete(`${BASE}/${id}/executer`, { methode: "POST", corps: {} })).reponse.status, 409);

    // Approbation par l'autre administrateur central: MFA fraîche et non rejouable.
    assert.equal((await b.requete(`${BASE}/${id}/approuver`, { methode: "POST", corps: { code_totp: "000000" } })).reponse.status, 401);
    const approbation = await b.requete(`${BASE}/${id}/approuver`, { methode: "POST", corps: { code_totp: await codeMfaInutilise(identifiantB), motif_decision: "Finalité vérifiée." } });
    assert.equal(approbation.reponse.status, 200);
    assert.equal(approbation.donnees.statut, "APPROUVEE");
    assert.equal(approbation.donnees.decide_par, idB);
    assert.equal((await b.requete(`${BASE}/${id}/approuver`, { methode: "POST", corps: { code_totp: await codeMfaInutilise(identifiantB) } })).reponse.status, 409);

    // Seul le demandeur exécute, une seule fois; l'exception est bornée et inerte.
    assert.equal((await b.requete(`${BASE}/${id}/executer`, { methode: "POST", corps: {} })).reponse.status, 403);
    const execution = await a.requete(`${BASE}/${id}/executer`, { methode: "POST", corps: {} });
    assert.equal(execution.reponse.status, 200);
    assert.equal(execution.donnees.statut, "EXECUTEE");
    assert.equal((await a.requete(`${BASE}/${id}/executer`, { methode: "POST", corps: {} })).reponse.status, 409);
    const exception = base.prepare("SELECT beneficiaire_id, accorde_par, route_cible, expire_le, accorde_le FROM exceptions_acces_nominatif WHERE demande_id = ?").get(id);
    assert.deepEqual([exception.beneficiaire_id, exception.accorde_par, exception.route_cible], [idA, idB, ROUTE]);
    const dureeMs = Date.parse(`${exception.expire_le.replace(" ", "T")}Z`) - Date.parse(`${exception.accorde_le.replace(" ", "T")}Z`);
    assert.equal(dureeMs, 2 * 3_600_000);

    // Inerte: l'exception n'ouvre rien. La liste nominative reste refusée à l'administration centrale (D-02).
    assert.equal((await a.requete("/api/distributions/menages")).reponse.status, 403);

    // Refus par l'autre administrateur et annulation réservée au demandeur.
    const seconde = await a.requete(BASE, { methode: "POST", corps: { ...corpsDemande, duree_heures: 3 } });
    assert.equal(seconde.reponse.status, 201);
    assert.equal((await b.requete(`${BASE}/${seconde.donnees.id}/annuler`, { methode: "POST", corps: { motif_decision: "Annulation par un tiers." } })).reponse.status, 403);
    const refus = await b.requete(`${BASE}/${seconde.donnees.id}/refuser`, { methode: "POST", corps: { motif_decision: "Finalité non démontrée." } });
    assert.equal(refus.reponse.status, 200);
    assert.equal(refus.donnees.statut, "REFUSEE");

    const noms = base.prepare("SELECT action FROM journaux_audit WHERE action LIKE 'DEMANDE_APPROBATION_%' OR action = 'EXCEPTION_ACCES_NOMINATIF_ACCORDEE'").all().map((l) => l.action);
    for (const attendu of ["DEMANDE_APPROBATION_CREEE", "DEMANDE_APPROBATION_APPROUVEE", "DEMANDE_APPROBATION_EXECUTEE", "DEMANDE_APPROBATION_REFUSEE", "EXCEPTION_ACCES_NOMINATIF_ACCORDEE"]) {
      assert.ok(noms.includes(attendu), `Audit manquant: ${attendu}`);
    }
  } finally {
    base.prepare("UPDATE utilisateurs SET statut = 'SUSPENDU' WHERE identifiant = ?").run(identifiantB);
    base.prepare("UPDATE utilisateurs SET statut = 'ACTIF' WHERE role = 'ADMIN_CENTRAL' AND identifiant <> ? AND statut = 'SUSPENDU' AND identifiant NOT LIKE 'central-b32-%'").run(identifiantB);
    base.prepare("UPDATE demandes_approbation SET statut = 'ANNULEE' WHERE statut IN ('EN_ATTENTE', 'APPROUVEE')").run();
    base.close();
  }
});
