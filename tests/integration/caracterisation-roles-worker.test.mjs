import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hacherMotDePasse } from "../../backend/src/services/cryptographie.service.ts";
import { codeMfaInutilise, configurerMfaTest, terminerConnexionMfaTest } from "./mfa-test-helper.mjs";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adresseApi = process.env.SIGAD_LOCAL_API_URL ?? "http://127.0.0.1:8787";
const dossierSnapshots = resolve(racine, "tests/integration/__snapshots__/caracterisation-roles");
const roles = [
  "PROPRIETAIRE",
  "ADMIN_CENTRAL",
  "DELEGUE_PROVINCIAL",
  "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN",
  "AGENT_DISTRIBUTION",
  "CONSULTATION_INSTITUTIONNELLE",
];
const rolesTerrain = new Set(["RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION"]);
const idAbsent = "00000000-0000-4000-8000-000000000000";

function ouvrirD1Locale() {
  const dossier = process.env.SIGAD_D1_STATE_DIR;
  if (!dossier) throw new Error("Le chemin D1 local de la caractérisation est absent.");
  for (const nom of readdirSync(dossier).filter((entree) => entree.endsWith(".sqlite") && entree !== "metadata.sqlite")) {
    const base = new DatabaseSync(join(dossier, nom));
    if (base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'").get()) return base;
    base.close();
  }
  throw new Error("La base D1 locale de la caractérisation est introuvable.");
}

function routesDeLaMatrice() {
  const contenu = readFileSync(resolve(racine, "docs/matrice-securite-api-phase9.md"), "utf8");
  const routes = [...contenu.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \| ([^|]+) \|/gmu)]
    .map((correspondance) => ({
      methode: correspondance[1],
      chemin: correspondance[2],
      politique: correspondance[3]?.trim() ?? "",
    }));
  assert.equal(routes.length, 216, "La caractérisation exige les 216 routes de la matrice versionnée.");
  return routes;
}

function cheminConcrete(chemin, provinceId) {
  return chemin.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, (_capture, parametre) => {
    if (parametre === "provinceId") return provinceId;
    if (parametre === "type") return "RAPPORT_DISTRIBUTION";
    return idAbsent;
  });
}

function classeStatut(statut) {
  if (statut === 401 || statut === 403) return "REFUS_AUTH_SCOPE_OR_CSRF";
  if (statut === 404 || statut === 409) return "RESSOURCE_ABSENTE_OU_CONFLIT";
  return "HANDLER_ATTEINT";
}

class ClientLocal {
  cookies = new Map();
  jetonCsrf = null;
  identifiantConnexion = "";
  motDePasseConnexion = "";

  async requete(chemin, options = {}) {
    const entetes = new Headers({ Accept: "application/json" });
    if (options.corps !== undefined) entetes.set("Content-Type", "application/json");
    if (options.csrf !== false && this.jetonCsrf) entetes.set("X-CSRF-Token", this.jetonCsrf);
    if (options.cleIdempotence) entetes.set("X-Idempotency-Key", options.cleIdempotence);
    if (this.cookies.size) entetes.set("Cookie", [...this.cookies].map(([nom, valeur]) => `${nom}=${encodeURIComponent(valeur)}`).join("; "));
    const reponse = await fetch(new URL(chemin, adresseApi), {
      method: options.methode ?? "GET",
      headers: entetes,
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
    const texte = await reponse.text();
    let donnees = null;
    try { donnees = JSON.parse(texte); } catch { donnees = null; }
    return { reponse, donnees };
  }

  async connecter(identifiant, motDePasse) {
    const csrf = await this.requete("/api/auth/csrf");
    assert.equal(csrf.reponse.status, 200);
    this.jetonCsrf = csrf.donnees?.jeton_csrf;
    assert.equal(typeof this.jetonCsrf, "string");
    const connexion = await this.requete("/api/auth/connexion", {
      methode: "POST",
      corps: { identifiant, mot_de_passe: motDePasse },
    });
    assert.equal(connexion.reponse.status, 200, `Connexion locale impossible pour le rôle ${identifiant}.`);
    if (connexion.donnees?.mfa_requis === true) {
      const verification = await terminerConnexionMfaTest(this, identifiant, connexion);
      assert.equal(verification.reponse.status, 200, `Le défi MFA local doit être validé pour ${identifiant}.`);
    }
  }

  async reconnecterApresActivationMfa(identifiant, motDePasse) {
    const deconnexion = await this.requete("/api/auth/deconnexion", {
      methode: "POST", corps: {}, cleIdempotence: `role-char-setup-logout-${identifiant}-0001`,
    });
    assert.equal(deconnexion.reponse.status, 200, `La session de préparation doit pouvoir se fermer pour ${identifiant}.`);
    this.cookies.clear();
    this.jetonCsrf = null;
    await this.connecter(identifiant, motDePasse);
  }
}

async function preparerCompte(base, compte) {
  const motDePasse = `RoleProbe-${randomBytes(24).toString("base64url")}Aa9`;
  await base.prepare(`UPDATE utilisateurs SET mot_de_passe_hash = ?, code_activation_hash = NULL,
      code_activation_expire_le = NULL, doit_changer_mot_de_passe = 0, statut = 'ACTIF',
      tentatives_echouees = 0, verrouille_jusqua = NULL, double_facteur_secret = NULL,
      double_facteur_secret_temporaire = NULL, double_facteur_actif = 0 WHERE id = ?`)
    .run(await hacherMotDePasse(motDePasse), compte.id);
  await base.prepare("UPDATE sessions SET revoquee = 1 WHERE utilisateur_id = ?").run(compte.id);
  await base.prepare("DELETE FROM codes_recuperation_mfa WHERE utilisateur_id = ?").run(compte.id);
  await base.prepare("DELETE FROM compteurs_totp_utilises WHERE utilisateur_id = ?").run(compte.id);
  await base.prepare("UPDATE defis_mfa SET consomme = 1 WHERE utilisateur_id = ?").run(compte.id);
  const client = new ClientLocal();
  client.identifiantConnexion = compte.identifiant;
  client.motDePasseConnexion = motDePasse;
  await client.connecter(compte.identifiant, motDePasse);
  if (["PROPRIETAIRE", "ADMIN_CENTRAL", "CONSULTATION_INSTITUTIONNELLE"].includes(compte.roleCaractérisation)) {
    await configurerMfaTest(client, compte.identifiant);
    await client.reconnecterApresActivationMfa(compte.identifiant, motDePasse);
  }
  return client;
}

function estPreAuthentification(policy) {
  return /Public|Défi MFA pré-authentifié|preuve opérateur|pré-authentification/iu.test(policy);
}

function rolesPermis(policy, methode) {
  if (estPreAuthentification(policy)) return new Set();
  const rubrique = methode === "GET" ? /Lecture\s*:\s*([^;]+)/iu : /Mutations?\s*:\s*([^;]+)/iu;
  const segment = policy.match(rubrique)?.[1] ?? policy;
  if (methode === "GET" && /trois rôles/iu.test(segment)) {
    return new Set(["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"]);
  }
  const trouves = roles.filter((role) => segment.includes(role));
  const interdiction = /CONSULTATION_INSTITUTIONNELLE\s+(?:est\s+)?interdite/iu.test(segment);
  if (interdiction) return new Set(trouves.filter((role) => role !== "CONSULTATION_INSTITUTIONNELLE"));
  if (trouves.length) return new Set(trouves);
  if (/session authentifiée|toute session/iu.test(segment)) return new Set(roles);
  return new Set();
}

function attendrePolicy(policy, role, methode) {
  if (estPreAuthentification(policy)) return "PUBLIC_OR_PREAUTH";
  if (rolesPermis(policy, methode).has(role)) return "DECLARE_ALLOW";
  if (rolesPermis(policy, methode).size > 0 || roles.some((roleDeclare) => policy.includes(roleDeclare))) return "DECLARE_DENY";
  if (/session authentifiée|toute session/iu.test(policy)) return "DECLARE_ALLOW";
  return "MATRIX_UNSPECIFIED";
}

async function corpsCaracterisation(route, role, compte) {
  if (route.chemin === "/api/auth/mfa/reinitialiser/:utilisateurId" && role === "PROPRIETAIRE") {
    return { code: await codeMfaInutilise(compte.identifiant) };
  }
  return {};
}

test("Caractérisation HTTP des 7 rôles × 216 routes — statuts seulement", async () => {
  const base = ouvrirD1Locale();
  const clients = new Map();
  const profilsAjoutes = [];
  let compteConsultationAjoute = null;

  try {
    const proprietaire = base.prepare("SELECT id, identifiant, role, province_id FROM utilisateurs WHERE identifiant = 'proprietaire'").get();
    const central = base.prepare("SELECT id, identifiant, role, province_id FROM utilisateurs WHERE identifiant = 'central'").get();
    const delegueSila = base.prepare("SELECT id, identifiant, role, province_id FROM utilisateurs WHERE identifiant = 'sila'").get();
    assert.ok(proprietaire && central && delegueSila, "Le seed local doit contenir les trois comptes de base.");
    const deleguesDisponibles = base.prepare(`SELECT u.id, u.identifiant, u.role, u.province_id
      FROM utilisateurs u
      WHERE u.role = 'DELEGUE_PROVINCIAL' AND u.statut = 'ACTIF' AND u.province_id IS NOT NULL
        AND u.identifiant NOT IN ('sila', 'ouaddai')
        AND NOT EXISTS (SELECT 1 FROM profils_operationnels_terrain p WHERE p.utilisateur_id = u.id AND p.statut = 'ACTIF')
        AND NOT EXISTS (SELECT 1 FROM comptes_consultation c WHERE c.utilisateur_id = u.id)
      ORDER BY u.identifiant LIMIT 3`).all();
    assert.equal(deleguesDisponibles.length, 3, "Le seed doit fournir trois comptes provinciaux isolables pour les rôles terrain.");

    const [responsableStock, superviseur, agent] = deleguesDisponibles;
    const consultation = {
      id: randomBytes(16).toString("hex"),
      identifiant: `role-consultation-${randomBytes(8).toString("hex")}`,
      role: "ADMIN_CENTRAL",
      province_id: null,
      roleCaractérisation: "CONSULTATION_INSTITUTIONNELLE",
    };
    await base.prepare(`INSERT INTO utilisateurs
      (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, doit_changer_mot_de_passe, statut)
      VALUES (?, ?, 'Compte synthétique de caractérisation', 'ADMIN_CENTRAL', NULL, ?, 0, 'ACTIF')`)
      .run(consultation.id, consultation.identifiant, await hacherMotDePasse(`RoleProbe-${randomBytes(24).toString("base64url")}Aa9`));
    const comptes = [
      { ...proprietaire, roleCaractérisation: "PROPRIETAIRE" },
      { ...central, roleCaractérisation: "ADMIN_CENTRAL" },
      { ...delegueSila, roleCaractérisation: "DELEGUE_PROVINCIAL" },
      { ...responsableStock, roleCaractérisation: "RESPONSABLE_STOCK" },
      { ...superviseur, roleCaractérisation: "SUPERVISEUR_TERRAIN" },
      { ...agent, roleCaractérisation: "AGENT_DISTRIBUTION" },
      consultation,
    ];

    for (const compte of comptes) {
      const compteConsultatif = compte.roleCaractérisation === "CONSULTATION_INSTITUTIONNELLE";
      if (compteConsultatif) {
        const idCompte = randomBytes(16).toString("hex");
        await base.prepare(`INSERT INTO comptes_consultation
          (id, utilisateur_id, institution, fonction, perimetre, statut, cree_par)
          VALUES (?, ?, 'Institution synthétique de test', 'Observateur', 'NATIONAL', 'ACTIF', ?)`)
          .run(idCompte, compte.id, central.id);
        compteConsultationAjoute = { id: idCompte, utilisateur_id: compte.id };
      }
      if (rolesTerrain.has(compte.roleCaractérisation)) {
        const idProfil = randomBytes(16).toString("hex");
        await base.prepare(`INSERT INTO profils_operationnels_terrain
          (id, utilisateur_id, role_terrain, province_id, statut, attribue_par)
          VALUES (?, ?, ?, ?, 'ACTIF', ?)`)
          .run(idProfil, compte.id, compte.roleCaractérisation, compte.province_id, central.id);
        profilsAjoutes.push(idProfil);
      }
      clients.set(compte.roleCaractérisation, await preparerCompte(base, compte));
    }

    const matrice = routesDeLaMatrice();
    const observations = new Map(roles.map((role) => [role, []]));
    const routesDeconnexion = matrice.filter((route) => route.methode === "POST" && route.chemin === "/api/auth/deconnexion");
    const routesOrdinaires = matrice.filter((route) => !routesDeconnexion.includes(route));
    assert.equal(routesDeconnexion.length, 1, "La route de déconnexion doit être unique dans la matrice.");

    for (const role of roles) {
      const compte = comptes.find((element) => element.roleCaractérisation === role);
      const client = clients.get(role);
      assert.ok(compte && client, `Le contexte de test du rôle ${role} doit être prêt.`);
      for (let index = 0; index < routesOrdinaires.length; index += 1) {
        const route = routesOrdinaires[index];
        const resultat = await client.requete(cheminConcrete(route.chemin, compte.province_id ?? "prov-sila"), {
          methode: route.methode,
          ...(route.methode === "GET" ? {} : {
            corps: await corpsCaracterisation(route, role, compte),
            cleIdempotence: `role-char-${role}-${String(index).padStart(3, "0")}-0001`,
          }),
        });
        const attendu = attendrePolicy(route.politique, role, route.methode);
        observations.get(role).push({
          methode: route.methode,
          chemin: route.chemin,
          attendu,
          statut: resultat.reponse.status,
          observation: classeStatut(resultat.reponse.status),
        });
      }
    }
    // Déconnexion est la dernière requête de chaque session pour préserver le reste des observations.
    for (const role of roles) {
      const route = routesDeconnexion[0];
      const resultat = await clients.get(role).requete(route.chemin, {
        methode: route.methode,
        corps: {},
        cleIdempotence: `role-char-logout-${role}-0001`,
      });
      observations.get(role).push({
        methode: route.methode,
        chemin: route.chemin,
        attendu: attendrePolicy(route.politique, role, route.methode),
        statut: resultat.reponse.status,
        observation: classeStatut(resultat.reponse.status),
      });
    }

    const discrepancesPotentielles = [];
    const sondesInconclusives = [];
    const accesSansPolitiqueExplicite = [];
    for (const role of roles) {
      const lignes = observations.get(role);
      assert.equal(lignes.length, 216, `La couverture du rôle ${role} doit contenir 216 routes.`);
      const fichierSnapshot = join(dossierSnapshots, `${role}.json`);
      const contenu = `${JSON.stringify(lignes, null, 2)}\n`;
      if (process.env.SIGAD_UPDATE_ROLE_SNAPSHOT === "1") {
        mkdirSync(dossierSnapshots, { recursive: true });
        writeFileSync(fichierSnapshot, contenu, { encoding: "utf8", flag: "w", mode: 0o600 });
      } else {
        assert.deepEqual(JSON.parse(readFileSync(fichierSnapshot, "utf8")), lignes,
          `تغير توصيف ${role}; راجع كل اختلاف قبل تحديث snapshot.`);
      }
      for (const ligne of lignes) {
        if (ligne.attendu === "DECLARE_ALLOW" && [401, 403].includes(ligne.statut)) {
          discrepancesPotentielles.push({ role, methode: ligne.methode, chemin: ligne.chemin, ecart: "DOC_ALLOW_RUNTIME_DENY", statut: ligne.statut });
        } else if (ligne.attendu === "DECLARE_DENY" && ligne.statut === 400) {
          sondesInconclusives.push({ role, methode: ligne.methode, chemin: ligne.chemin, motif: "VALIDATION_AVANT_DECISION_ROLE" });
        } else if (ligne.attendu === "DECLARE_DENY" && ![401, 403, 404, 409].includes(ligne.statut)) {
          discrepancesPotentielles.push({ role, methode: ligne.methode, chemin: ligne.chemin, ecart: "DOC_DENY_RUNTIME_HANDLER", statut: ligne.statut });
        } else if (ligne.attendu === "MATRIX_UNSPECIFIED" && [200, 201, 204].includes(ligne.statut)) {
          accesSansPolitiqueExplicite.push({ role, methode: ligne.methode, chemin: ligne.chemin, statut: ligne.statut });
        }
      }
    }
    console.log(`PASS — 7×216=${roles.length * matrice.length} requêtes; écarts de rôle documentés=${discrepancesPotentielles.length}; sondes inconclusives HTTP 400=${sondesInconclusives.length}; accès sans politique de rôle explicite=${accesSansPolitiqueExplicite.length}; corps/tokens non enregistrés.`);
    if (discrepancesPotentielles.length) console.log(JSON.stringify(discrepancesPotentielles));
    if (sondesInconclusives.length) console.log(`SONDES_INCONCLUSIVES ${JSON.stringify(sondesInconclusives)}`);
    if (accesSansPolitiqueExplicite.length) console.log(`ACCES_SANS_POLITIQUE ${JSON.stringify(accesSansPolitiqueExplicite)}`);

    const provincesARestaurer = [];
    const resultatsSondesValides = [];
    const idCarreProbe = "b21-carre-probe-ndjamena";
    try {
      base.prepare(`INSERT INTO carres (id, quartier_id, code_ou_nom, statut_validation)
        VALUES (?, 'qrt-ndj-1-farcha', 'Sonde temporaire B2.1', 'VALIDE')`).run(idCarreProbe);
      assert.ok(base.prepare(`SELECT c.id FROM carres c INNER JOIN quartiers q ON q.id = c.quartier_id
        INNER JOIN localites l ON l.id = q.localite_id
        WHERE c.id = ? AND c.statut_validation = 'VALIDE' AND l.province_id = 'prov-ndjamena'`).get(idCarreProbe),
      "Le carré synthétique doit être valide et rattaché au référentiel de N’Djamena avant la sonde HTTP.");
      for (const role of rolesTerrain) {
        const compte = comptes.find((element) => element.roleCaractérisation === role);
        assert.ok(compte, `Le compte de test de ${role} est requis pour les sondes géographiques.`);
        const utilisateur = base.prepare("SELECT province_id FROM utilisateurs WHERE id = ?").get(compte.id);
        const profil = base.prepare(`SELECT id, province_id FROM profils_operationnels_terrain
          WHERE utilisateur_id = ? AND role_terrain = ? AND statut = 'ACTIF'`).get(compte.id, role);
        assert.ok(utilisateur && profil, `Le compte et le profil ${role} doivent exister dans la D1 temporaire.`);
        provincesARestaurer.push({ utilisateurId: compte.id, provinceUtilisateur: utilisateur.province_id, profilId: profil.id, provinceProfil: profil.province_id });
        if (utilisateur.province_id === "prov-ndjamena" || profil.province_id === "prov-ndjamena") {
          base.prepare("UPDATE utilisateurs SET province_id = 'prov-sila' WHERE id = ?").run(compte.id);
          base.prepare("UPDATE profils_operationnels_terrain SET province_id = 'prov-sila' WHERE id = ?").run(profil.id);
        }
      }

      for (const role of [...rolesTerrain, "CONSULTATION_INSTITUTIONNELLE"]) {
        const client = clients.get(role);
        await client.connecter(client.identifiantConnexion, client.motDePasseConnexion);
      }

      const sondesTerritoriales = [
        ["arrondissements", "/api/territoire/arrondissements?localite_id=loc-ndjamena-ville"],
        ["quartiers", "/api/territoire/quartiers?localite_id=loc-ndjamena-ville&arrondissement_id=arr-ndj-1"],
        ["carres", "/api/territoire/carres?quartier_id=qrt-ndj-1-farcha"],
      ];
      for (const role of rolesTerrain) {
        const client = clients.get(role);
        for (const [nom, chemin] of sondesTerritoriales) {
          const resultat = await client.requete(chemin);
          resultatsSondesValides.push({
            role,
            sonde: nom,
            statut: resultat.reponse.status,
            erreur: resultat.donnees?.erreur ?? null,
            lignes: Array.isArray(resultat.donnees?.elements) ? resultat.donnees.elements.length : null,
            resultatAttendu: nom === "carres" ? "REFUS_INTERPROVINCIAL_404" : "REFUS_INTERPROVINCIAL",
          });
        }
        const referentiel = await client.requete("/api/distributions/referentiels?type=articles");
        resultatsSondesValides.push({ role, sonde: "referentiels-distribution", statut: referentiel.reponse.status, resultatAttendu: "REFUS_ROLE" });
      }

      const exportConsultatif = await clients.get("CONSULTATION_INSTITUTIONNELLE").requete(
        "/api/rapports/RAPPORT_DISTRIBUTION/export",
        { methode: "POST", corps: { format: "CSV", filtres: {}, archiver: false }, cleIdempotence: "b21-role-probe-report-0001" },
      );
      const idRapportProbe = exportConsultatif.reponse.headers.get("X-Report-Id");
      if (idRapportProbe) await base.prepare("DELETE FROM rapports_generes WHERE id = ?").run(idRapportProbe);
      resultatsSondesValides.push({
        role: "CONSULTATION_INSTITUTIONNELLE",
        sonde: "export-rapport-non-sensible",
        statut: exportConsultatif.reponse.status,
        resultatAttendu: "AUTORISATION_CONDITIONNELLE_DOCUMENTEE",
      });
      const exportSensible = await clients.get("CONSULTATION_INSTITUTIONNELLE").requete(
        "/api/rapports/LISTE_BENEFICIAIRES/export",
        { methode: "POST", corps: { format: "CSV", filtres: {}, archiver: false }, cleIdempotence: "b21-role-probe-sensitive-0001" },
      );
      resultatsSondesValides.push({
        role: "CONSULTATION_INSTITUTIONNELLE",
        sonde: "export-rapport-sensible",
        statut: exportSensible.reponse.status,
        resultatAttendu: "REFUS_SENSIBLE",
      });

      console.log(`SONDES_VALIDES_B2_1 ${JSON.stringify(resultatsSondesValides)}`);
      const refusInattendus = resultatsSondesValides.filter((sonde) => {
        if (sonde.sonde === "export-rapport-non-sensible") return sonde.statut !== 200;
        if (sonde.sonde === "export-rapport-sensible") return sonde.statut !== 403;
        if (sonde.sonde === "carres") return sonde.statut !== 404;
        return sonde.statut !== 403;
      });
      assert.deepEqual(refusInattendus, [],
        "Les requêtes valides doivent respecter les refus de rôle et de province caractérisés; examiner toute réponse différente avant de modifier la matrice.");
      for (const role of [...rolesTerrain, "CONSULTATION_INSTITUTIONNELLE"]) {
        const client = clients.get(role);
        const deconnexion = await client.requete("/api/auth/deconnexion", {
          methode: "POST", corps: {}, cleIdempotence: `b21-role-probe-logout-${role}-0001`,
        });
        assert.equal(deconnexion.reponse.status, 200);
      }
    } finally {
      base.prepare("DELETE FROM carres WHERE id = ?").run(idCarreProbe);
      for (const valeur of provincesARestaurer) {
        base.prepare("UPDATE profils_operationnels_terrain SET province_id = ? WHERE id = ?").run(valeur.provinceProfil, valeur.profilId);
        base.prepare("UPDATE utilisateurs SET province_id = ? WHERE id = ?").run(valeur.provinceUtilisateur, valeur.utilisateurId);
      }
    }
  } finally {
    for (const id of profilsAjoutes) await base.prepare("DELETE FROM profils_operationnels_terrain WHERE id = ?").run(id);
    if (compteConsultationAjoute) {
      await base.prepare("DELETE FROM comptes_consultation WHERE id = ?").run(compteConsultationAjoute.id);
    }
    base.close();
  }
});
