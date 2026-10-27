import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";

const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";

function trouverFichierD1Locale() {
  const dossier = process.env.SIGAD_D1_STATE_DIR;
  if (!dossier) throw new Error("Le chemin D1 local de la réconciliation est absent.");
  for (const nom of readdirSync(dossier).filter((entree) => entree.endsWith(".sqlite") && entree !== "metadata.sqlite")) {
    const chemin = join(dossier, nom);
    const base = new DatabaseSync(chemin);
    const existe = Boolean(base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'b22_reconciliation_journal'").get());
    base.close();
    if (existe) return chemin;
  }
  throw new Error("La D1 locale ne contient pas la migration de réconciliation 0042.");
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = "";

  async requete(path, { method = "GET", body } = {}) {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (this.jetonCsrf) headers.set("X-CSRF-Token", this.jetonCsrf);
    if (this.cookies.size) headers.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const response = await fetch(new URL(path, adresseApi), {
      method, headers, signal: AbortSignal.timeout(15_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const value = decodeURIComponent(pair.slice(separator + 1).trim());
      if (!value || attributes.some((attribute) => /^\s*Max-Age=0\s*$/iu.test(attribute))) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async connecter(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.status, 200);
    this.jetonCsrf = (await csrf.json()).jeton_csrf;
    const login = await this.requete("/api/auth/connexion", {
      method: "POST", body: { identifiant, mot_de_passe: motDePasse },
    });
    assert.equal(login.status, 200, "Le compte de test doit obtenir une session Legacy locale.");
  }
}

function executerTransactionConcurrente(cheminBase, utilisateurId, profilId, role, provinceId, delai) {
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(workerData.chemin);
    try {
      db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000; BEGIN IMMEDIATE;');
      db.prepare('UPDATE profils_operationnels_terrain SET role_terrain = ?, province_id = ? WHERE id = ?')
        .run(workerData.role, workerData.provinceId, workerData.profilId);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.delai);
      db.exec('COMMIT;');
      parentPort.postMessage({ ok: true });
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch {}
      parentPort.postMessage({ ok: false, message: error.message });
    } finally { db.close(); }
  `;
  const worker = new Worker(source, {
    eval: true,
    workerData: { chemin: cheminBase, role, provinceId, profilId, delai },
  });
  return new Promise((resolvePromise, rejectPromise) => {
    worker.once("message", (result) => result.ok ? resolvePromise() : rejectPromise(new Error(result.message)));
    worker.once("error", rejectPromise);
    worker.once("exit", (code) => {
      if (code !== 0) rejectPromise(new Error(`Écrivain SQLite terminé avec le code ${code}.`));
    });
  });
}

test("B2.6 — D1 réconcilie les écritures concurrentes et reste en décision Legacy", async () => {
  const cheminBase = trouverFichierD1Locale();
  const base = new DatabaseSync(cheminBase);
  base.exec("PRAGMA foreign_keys = ON;");
  const suffixe = randomBytes(8).toString("hex");
  const profilId = `b26-worker-profile-${suffixe}`;
  const sessionCookie = new ClientLocal();
  let sessionId = null;
  try {
    const compte = base.prepare("SELECT id, identifiant FROM utilisateurs WHERE identifiant = 'sila' AND role = 'DELEGUE_PROVINCIAL'").get();
    assert.ok(compte, "Le seed local fournit le délégué de Sila.");
    const utilisateurId = compte.id;
    assert.equal(base.prepare("SELECT COUNT(*) AS total FROM profils_operationnels_terrain WHERE utilisateur_id = ? AND statut = 'ACTIF'").get(utilisateurId).total, 0,
      "Le compte de fixture ne doit pas avoir d’autre profil terrain actif.");
    const motDePasse = `B26-Worker-${randomBytes(24).toString("base64url")}Aa9`;
    base.prepare(`UPDATE utilisateurs SET mot_de_passe_hash = ?, statut = 'ACTIF',
      doit_changer_mot_de_passe = 0, double_facteur_actif = 0 WHERE id = ?`)
      .run(await hacherMotDePasse(motDePasse), utilisateurId);
    base.prepare(`INSERT INTO profils_operationnels_terrain
      (id, utilisateur_id, role_terrain, province_id, statut, attribue_par)
      VALUES (?, ?, 'SUPERVISEUR_TERRAIN', 'prov-sila', 'ACTIF', 'usr-central')`)
      .run(profilId, utilisateurId);

    let projection = base.prepare(`SELECT role_code, source_legacy FROM affectations_roles WHERE utilisateur_id = ?`).get(utilisateurId);
    assert.equal(projection.role_code, "SUPERVISEUR_TERRAIN");
    assert.equal(projection.source_legacy, "PROFILS_OPERATIONNELS_TERRAIN");
    assert.equal(base.prepare("SELECT gid FROM portees_acces WHERE utilisateur_id = ?").get(utilisateurId).gid, "prov-sila");

    await sessionCookie.connecter(compte.identifiant, motDePasse);
    sessionId = base.prepare("SELECT id FROM sessions WHERE utilisateur_id = ? ORDER BY cree_le DESC LIMIT 1").get(utilisateurId)?.id ?? null;
    assert.ok(sessionId, "La connexion locale doit créer une session liée au compte.");

    const affectation = base.prepare("SELECT id, role_code FROM affectations_roles WHERE utilisateur_id = ?").get(utilisateurId);
    base.prepare("UPDATE affectations_roles SET role_code = 'PROPRIETAIRE' WHERE id = ?").run(affectation.id);
    assert.equal((await sessionCookie.requete("/api/proprietaire/audit")).status, 403,
      "Une divergence Shadow ne doit pas transformer un rôle terrain en propriétaire; Legacy reste la décision.");
    base.prepare("UPDATE affectations_roles SET role_code = ? WHERE id = ?").run(affectation.role_code, affectation.id);

    await Promise.all([
      executerTransactionConcurrente(cheminBase, utilisateurId, profilId, "AGENT_DISTRIBUTION", "prov-ouaddai", 80),
      executerTransactionConcurrente(cheminBase, utilisateurId, profilId, "SUPERVISEUR_TERRAIN", "prov-sila", 0),
    ]);
    const profilFinal = base.prepare("SELECT role_terrain, province_id FROM profils_operationnels_terrain WHERE id = ?").get(profilId);
    projection = base.prepare("SELECT role_code FROM affectations_roles WHERE utilisateur_id = ?").get(utilisateurId);
    assert.equal(projection.role_code, profilFinal.role_terrain);
    const portees = base.prepare(`SELECT id, type_unite, gid, source_legacy, statut FROM portees_acces
      WHERE utilisateur_id = ?`).all(utilisateurId).map((ligne) => ({ ...ligne }));
    assert.deepEqual(portees, [{
      id: `pa:${utilisateurId}:PROVINCE:${profilFinal.province_id}`,
      type_unite: "PROVINCE", gid: profilFinal.province_id,
      source_legacy: "PROFILS_OPERATIONNELS_TERRAIN", statut: "ACTIF",
    }]);
    const affectations = base.prepare(`SELECT role_code, portee_id, source_legacy, statut
      FROM affectations_roles WHERE utilisateur_id = ?`).all(utilisateurId).map((ligne) => ({ ...ligne }));
    assert.deepEqual(affectations, [{
      role_code: profilFinal.role_terrain, portee_id: portees[0].id,
      source_legacy: "PROFILS_OPERATIONNELS_TERRAIN", statut: "ACTIF",
    }]);
    assert.equal(base.prepare("SELECT resultat FROM b22_reconciliation_etat WHERE utilisateur_id = ?").get(utilisateurId).resultat, "RECONCILIE");
    assert.equal(base.prepare("SELECT revoquee FROM sessions WHERE id = ?").get(sessionId).revoquee, 1,
      "Un changement de rôle/niveau invalide la session préexistante dans la même transaction.");
  } finally {
    if (sessionId) base.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    base.prepare("DELETE FROM profils_operationnels_terrain WHERE id = ?").run(profilId);
    base.close();
  }
});
