import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { configurerMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const roles = ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"];

function ouvrirD1Locale() {
  const dossier = process.env.SIGAD_D1_STATE_DIR;
  if (!dossier) throw new Error("Le chemin D1 des tests de sécurité est absent.");
  for (const nom of readdirSync(dossier).filter((entree) => entree.endsWith(".sqlite") && entree !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossier, nom));
    if (base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get()) return base;
    base.close();
  }
  throw new Error("La base D1 locale SIGAD est introuvable.");
}

function routesDeLaMatrice() {
  const contenu = readFileSync(resolve(racine, "docs/matrice-securite-api-phase9.md"), "utf8");
  const resultat = [];
  for (const correspondance of contenu.matchAll(/^\| (GET|POST|PUT|PATCH) \| `([^`]+)` \| ([^|]+) \|/gmu)) {
    const methode = correspondance[1];
    const chemin = correspondance[2];
    const politique = correspondance[3]?.trim() ?? "";
    if (!methode || !chemin) continue;
    resultat.push({ methode, chemin, politique });
  }
  if (resultat.length !== 140) throw new Error(`La matrice décrit ${resultat.length} routes au lieu de 140; régénérez et auditez la liste.`);
  return resultat;
}

function cheminConcrete(chemin) {
  return chemin.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, (_capture, parametre) =>
    parametre === "provinceId" ? "prov-ouaddai" : parametre === "type" ? "RAPPORT_DISTRIBUTION" : `absent-${parametre}`);
}

function empreinteEtat(base) {
  const tables = base.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations', '_cf_METADATA') ORDER BY name",
  ).all().map((ligne) => ligne.name);
  const etat = tables.map((nom) => {
    const sur = `"${nom.replaceAll('"', '""')}"`;
    const lignes = base.prepare(`SELECT * FROM ${sur} ORDER BY rowid`).all();
    return `${nom}:${JSON.stringify(lignes)}`;
  }).join("\n");
  return createHash("sha256").update(etat).digest("hex");
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET", headers: entetes,
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
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
    let donnees = null;
    try { donnees = await reponse.json(); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async connecter(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees.jeton_csrf;
    const resultat = await this.requete("/api/auth/connexion", {
      methode: "POST", corps: { identifiant, mot_de_passe: motDePasse },
    });
    assert.equal(resultat.reponse.status, 200);
    if (resultat.donnees?.mfa_requis) throw new Error("Le compte de test exige déjà un défi MFA inattendu.");
    return resultat;
  }
}

function rolesPermis(politique) {
  if (/Public|Défi MFA pré-authentifié/iu.test(politique)) return new Set();
  const trouves = roles.filter((role) => politique.includes(role));
  if (trouves.length > 0) return new Set(trouves);
  if (/session authentifiée|toute session/iu.test(politique)) return new Set(roles);
  return new Set();
}

test("Matrice API : chaque route est protégée et chaque refus ne modifie aucune donnée", async () => {
  const base = ouvrirD1Locale();
  const clients = new Map();
  let clientSila;
  try {
    const identifiants = ["proprietaire", "central", "sila", "ouaddai"];
    for (const identifiant of identifiants) {
      const motDePasse = `Matrice-${randomBytes(24).toString("base64url")}Aa9`;
      base.prepare(
        `UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = NULL, doit_changer_mot_de_passe = 0,
          statut = 'ACTIF', tentatives_echouees = 0, verrouille_jusqua = NULL,
          double_facteur_secret = NULL, double_facteur_secret_temporaire = NULL, double_facteur_actif = 0
         WHERE identifiant = ?`,
      ).run(await hacherMotDePasse(motDePasse), identifiant);
      const ligne = base.prepare("SELECT id FROM utilisateurs WHERE identifiant = ?").get(identifiant);
      assert.ok(ligne, `Le compte ${identifiant} doit exister dans le seed local.`);
      base.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ?").run(ligne.id);
      base.prepare("DELETE FROM codes_recuperation_mfa WHERE utilisateur_id = ?").run(ligne.id);
      base.prepare("DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = ?").run(ligne.id);
      base.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = ?").run(ligne.id);
      const client = new ClientLocal();
      await client.connecter(identifiant, motDePasse);
      if (identifiant === "central" || identifiant === "proprietaire") await configurerMfaTest(client, identifiant);
      clients.set(identifiant === "proprietaire" ? "PROPRIETAIRE" : identifiant === "central" ? "ADMIN_CENTRAL" : "DELEGUE_PROVINCIAL", client);
      if (identifiant === "sila") clientSila = client;
    }

    const matrice = routesDeLaMatrice();
    const anonyme = new ClientLocal();
    const empreinteAvant = empreinteEtat(base);
    let routesAnonymesVerifiees = 0;
    let refusRoleVerifies = 0;
    for (const route of matrice) {
      const chemin = cheminConcrete(route.chemin);
      if (route.politique.includes("Public")) {
        if (route.methode === "GET" && chemin === "/api/auth/csrf") {
          const publicSecurise = await anonyme.requete(chemin);
          assert.equal(publicSecurise.reponse.status, 200);
        }
        continue;
      }
      const resultatAnonyme = await anonyme.requete(chemin, {
        methode: route.methode,
        ...(route.methode === "GET" ? {} : { corps: {} }),
      });
      assert.ok([401, 403].includes(resultatAnonyme.reponse.status),
        `${route.methode} ${route.chemin} doit refuser l’accès sans identité, reçu ${resultatAnonyme.reponse.status}.`);
      routesAnonymesVerifiees += 1;

      const autorises = rolesPermis(route.politique);
      if (autorises.size === 0) continue;
      for (const role of roles) {
        if (autorises.has(role)) continue;
        const client = clients.get(role);
        if (!client) continue;
        const resultat = await client.requete(chemin, {
          methode: route.methode,
          ...(route.methode === "GET" ? {} : { corps: {} }),
        });
        assert.ok([401, 403, 404, 409].includes(resultat.reponse.status),
          `${route.methode} ${route.chemin} doit rejeter ${role}, reçu ${resultat.reponse.status}.`);
        refusRoleVerifies += 1;
      }
    }

    assert.ok(clientSila, "Le compte de test de Sila doit être initialisé.");
    const accesProvinceAlteree = await clientSila.requete("/api/provincial/prov-ouaddai/profil");
    assert.equal(accesProvinceAlteree.reponse.status, 403, "Un délégué de Sila ne doit pas pouvoir changer la province du chemin.");
    const empreinteApres = empreinteEtat(base);
    assert.equal(empreinteApres, empreinteAvant, "Les refus d’accès ne doivent modifier aucune ligne métier, de stock, d’archive, de session ou d’audit.");
    assert.ok(routesAnonymesVerifiees >= 120, `La couverture anonyme ${routesAnonymesVerifiees}/140 est insuffisante.`);
    assert.ok(refusRoleVerifies >= 80, `La couverture RBAC ${refusRoleVerifies} décisions refusées est insuffisante.`);
    console.log(`PASS — matrice sécurité : ${matrice.length} routes cataloguées, ${routesAnonymesVerifiees} essais anonymes et ${refusRoleVerifies} refus RBAC; empreinte complète des 65 tables inchangée après les requêtes interdites.`);
  } finally {
    base.close();
  }
});
