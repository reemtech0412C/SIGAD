import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comparerDecisions, evaluerDecisionOmbre, normaliserObservationHttp } from "../../backend/src/core/authz/comparateur-ombre.ts";
import { CATALOGUE_POLITIQUES_API } from "../../shared/permissions/catalogue.ts";

const racine = resolve(import.meta.dirname, "../..");
const roles = [
  "PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "RESPONSABLE_STOCK",
  "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION", "CONSULTATION_INSTITUTIONNELLE",
];
const migrations = readdirSync(join(racine, "migrations"))
  .filter((nom) => /^\d{4}_.*\.sql$/u.test(nom)).sort();
const snapshotsAnciens = join(racine, "tests/integration/__snapshots__/caracterisation-roles");
const snapshotsB26 = join(racine, "tests/integration/__snapshots__/caracterisation-roles-b2-6");
const snapshotsB32 = join(racine, "tests/integration/__snapshots__/caracterisation-roles-b3-2");
const maintenant = new Date().toISOString();
let db;
let comptes;

function creerSession(id, utilisateurId, options = {}) {
  db.prepare(`INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, expire_le, type, appareil_id)
    VALUES (?, ?, ?, 'csrf-comparateur', datetime('now', '+1 hour'), ?, ?)`)
    .run(id, utilisateurId, `hash-${id}`, options.type ?? "WEB", options.appareilId ?? null);
}

function creerCompte(id, role, provinceId = null) {
  const comptesSemes = {
    PROPRIETAIRE: "usr-proprietaire",
    ADMIN_CENTRAL: "usr-central",
    DELEGUE_PROVINCIAL: "usr-sila",
  };
  const identifiant = comptesSemes[role] ?? id;
  const roleBase = comptesSemes[role] ? role : "ADMIN_CENTRAL";
  const province = roleBase === "DELEGUE_PROVINCIAL" ? provinceId : null;
  if (!comptesSemes[role]) {
    db.prepare(`INSERT INTO utilisateurs
      (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
      VALUES (?, ?, 'Fixture synthétique', ?, ?, 'hash-synthetique', 'ACTIF', 0)`)
      .run(identifiant, `fixture-${identifiant}`, roleBase, province);
  }
  if (["RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION"].includes(role)) {
    let entrepotId = null;
    if (role === "RESPONSABLE_STOCK") {
      const departement = db.prepare("SELECT id FROM departements WHERE province_id = 'prov-sila' ORDER BY id LIMIT 1").get();
      assert.ok(departement);
      db.prepare(`INSERT INTO localites
        (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation, provenance, source_documentation)
        VALUES (?, 'prov-sila', ?, 'Localité synthétique', 'VILLE', 'AUCUN', 'VALIDE', 'TEST', 'fixture comparator')`)
        .run(`geo-${id}`, departement.id);
      db.prepare(`INSERT INTO entrepots
        (id, code_entrepot, nom, niveau, province_id, localite_id, actif)
        VALUES (?, ?, 'Entrepôt synthétique', 'PROVINCIAL', 'prov-sila', ?, 1)`)
        .run(`wh-${id}`, `WH-${id}`, `geo-${id}`);
      entrepotId = `wh-${id}`;
    }
    db.prepare(`INSERT INTO profils_operationnels_terrain
      (id, utilisateur_id, role_terrain, province_id, entrepot_id, statut, attribue_par)
      VALUES (?, ?, ?, 'prov-sila', ?, 'ACTIF', 'usr-central')`)
      .run(`profile-${identifiant}`, identifiant, role, entrepotId);
  }
  if (role === "CONSULTATION_INSTITUTIONNELLE") {
    db.prepare(`INSERT INTO comptes_consultation
      (id, utilisateur_id, institution, fonction, perimetre, statut, cree_par)
      VALUES (?, ?, 'Institution synthétique', 'Observateur', 'NATIONAL', 'ACTIF', 'usr-central')`)
      .run(`consult-${identifiant}`, identifiant);
  }
  return { id: identifiant, role, sessionId: `session-${identifiant}` };
}

function legacyDeclare(politique, role) {
  if (politique.accessMode === "PUBLIC") return "ALLOW";
  if (politique.accessMode === "PREAUTH") return "INDETERMINATE";
  if (politique.accessMode === "SESSION") return "ALLOW";
  if (politique.rolesAutorises.includes(role)) return "ALLOW";
  if (politique.rolesConditionnels.some((regle) => regle.role === role)) return "INDETERMINATE";
  return "DENY";
}

function lireMatriceSnapshots() {
  const lignes = [];
  for (const role of roles) {
    for (const [dossier, attendu] of [[snapshotsAnciens, 216], [snapshotsB26, 13], [snapshotsB32, 14]]) {
      const fichier = join(dossier, `${role}.json`);
      const contenu = JSON.parse(readFileSync(fichier, "utf8"));
      assert.equal(contenu.length, attendu, `${role}: couverture snapshot attendue.`);
      lignes.push(...contenu.map((ligne) => ({ role, ...ligne })));
    }
  }
  return lignes;
}

describe("B2.6 — moteur indépendant de comparaison Legacy/Shadow", () => {
  beforeAll(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    for (const migration of migrations) db.exec(readFileSync(join(racine, "migrations", migration), "utf8"));
    comptes = new Map();
    for (const role of roles) {
      const compte = creerCompte(`cmp-${role.toLowerCase()}`, role, "prov-sila");
      creerSession(compte.sessionId, compte.id);
      comptes.set(role, compte);
    }
  });

  afterAll(() => db?.close());

  it("compare la matrice 243 × 7 au niveau des décisions de route, en gardant les limites HTTP séparées", () => {
    const lignes = lireMatriceSnapshots();
    expect(lignes).toHaveLength(243 * 7);
    const compteurs = { MATCH: 0, MISMATCH: 0, INDETERMINATE: 0, ERROR: 0 };
    const originesIndeterminables = {};
    const comparaisonsRuntime = { MATCH: 0, MISMATCH: 0, INDETERMINATE: 0, ERROR: 0 };
    const observationsHttp = { ALLOW: 0, DENY: 0, INDETERMINATE: 0, ERROR: 0 };
    const inconnuesShadow = new Set();

    for (const ligne of lignes) {
      const politique = CATALOGUE_POLITIQUES_API.find((entree) =>
        entree.methode === ligne.methode && entree.chemin === ligne.chemin);
      assert.ok(politique, `Route du snapshot absente du catalogue: ${ligne.methode} ${ligne.chemin}`);
      const compte = comptes.get(ligne.role);
      const shadow = evaluerDecisionOmbre(db, {
        methode: ligne.methode,
        chemin: ligne.chemin,
        utilisateurId: compte.id,
        sessionId: compte.sessionId,
        maintenant,
      });
      const decisionLegacyRoute = legacyDeclare(politique, ligne.role);
      const comparaison = comparerDecisions({ decision: decisionLegacyRoute, niveau: "ROUTE_GATE" }, shadow);
      compteurs[comparaison.classe] += 1;
      if (comparaison.classe === "INDETERMINATE") {
        const origine = decisionLegacyRoute === "INDETERMINATE"
          ? "POLITIQUE_LEGACY_CONDITIONNELLE"
          : shadow.motifs[0] ?? "SHADOW_INDETERMINATE";
        originesIndeterminables[origine] = (originesIndeterminables[origine] ?? 0) + 1;
      }
      const observation = normaliserObservationHttp(ligne.statut);
      comparaisonsRuntime[comparerDecisions({ decision: observation, niveau: "AUTORISATION_COMPLETE" }, shadow).classe] += 1;
      if (shadow.motifs.includes("POLITIQUE_SHADOW_ABSENTE")) inconnuesShadow.add(`${ligne.methode} ${ligne.chemin}`);
      observationsHttp[observation] += 1;
    }

    expect(Object.values(compteurs).reduce((a, b) => a + b, 0)).toBe(1701);
    expect(compteurs).toEqual({ MATCH: 1679, MISMATCH: 0, INDETERMINATE: 22, ERROR: 0 });
    expect(originesIndeterminables).toEqual({ POLITIQUE_LEGACY_CONDITIONNELLE: 22 });
    expect(comparaisonsRuntime).toEqual({ MATCH: 0, MISMATCH: 0, INDETERMINATE: 1701, ERROR: 0 });
    expect(inconnuesShadow.size, "0043 et 0046 doivent couvrir les routes appareils/sessions et plateforme").toBe(0);
    expect(observationsHttp.ERROR).toBe(0);
    // Conserver un résumé compact dans la sortie vérifiable du test.
    console.info(`[B2.6-COMPARATOR] route-gate=${JSON.stringify(compteurs)}; origines-indeterminables=${JSON.stringify(originesIndeterminables)}; runtime-complet=${JSON.stringify(comparaisonsRuntime)}; http-observe=${JSON.stringify(observationsHttp)}; shadow-policy-absente=${inconnuesShadow.size}`);
  });

  it("n'accorde que les permissions réellement mappées dans Shadow et signale une route absente du catalogue Shadow", () => {
    const policyDelegue = CATALOGUE_POLITIQUES_API.find((politique) =>
      politique.accessMode === "ROLE" && politique.rolesAutorises.includes("DELEGUE_PROVINCIAL")
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(politique.permission));
    assert.ok(policyDelegue);
    const delegue = comptes.get("DELEGUE_PROVINCIAL");
    expect(evaluerDecisionOmbre(db, {
      methode: policyDelegue.methode, chemin: policyDelegue.chemin,
      utilisateurId: delegue.id, sessionId: delegue.sessionId, maintenant,
    }).decision).toBe("ALLOW");

    // Les 13 routes appareils/sessions sont couvertes par 0043; une route inconnue reste INDETERMINATE.
    const policyManquante = { methode: "POST", chemin: "/api/route-inexistante-b26" };
    expect(evaluerDecisionOmbre(db, {
      methode: policyManquante.methode, chemin: policyManquante.chemin,
      utilisateurId: delegue.id, sessionId: delegue.sessionId, maintenant,
    })).toMatchObject({ decision: "INDETERMINATE", motifs: ["POLITIQUE_SHADOW_ABSENTE"] });
  });

  it("refuse une permission retirée et une affectation expirée sans repli implicite", () => {
    const politique = CATALOGUE_POLITIQUES_API.find((entree) =>
      entree.accessMode === "ROLE" && entree.rolesAutorises.includes("DELEGUE_PROVINCIAL")
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(entree.permission)
      && db.prepare("SELECT 1 FROM roles_permissions WHERE role_code = 'DELEGUE_PROVINCIAL' AND permission_code = ?")
        .get(entree.permission));
    assert.ok(politique);
    const delegue = comptes.get("DELEGUE_PROVINCIAL");
    const requete = {
      methode: politique.methode, chemin: politique.chemin,
      utilisateurId: delegue.id, sessionId: delegue.sessionId, maintenant,
    };
    expect(evaluerDecisionOmbre(db, requete).decision).toBe("ALLOW");

    db.exec("SAVEPOINT b26_permission_retiree");
    try {
      db.prepare("DELETE FROM roles_permissions WHERE role_code = 'DELEGUE_PROVINCIAL' AND permission_code = ?")
        .run(politique.permission);
      expect(evaluerDecisionOmbre(db, requete).decision).toBe("DENY");
    } finally {
      db.exec("ROLLBACK TO b26_permission_retiree; RELEASE b26_permission_retiree;");
    }

    const idAffectation = db.prepare("SELECT id FROM affectations_roles WHERE utilisateur_id = ? AND role_code = 'DELEGUE_PROVINCIAL'")
      .get(delegue.id)?.id;
    assert.ok(idAffectation);
    db.exec("SAVEPOINT b26_affectation_expiree");
    try {
      db.prepare("UPDATE affectations_roles SET valide_au = datetime('now', '-1 hour') WHERE id = ?").run(idAffectation);
      expect(evaluerDecisionOmbre(db, requete).decision).toBe("DENY");
    } finally {
      db.exec("ROLLBACK TO b26_affectation_expiree; RELEASE b26_affectation_expiree;");
    }
  });

  it("n'invente ni autorisation de pré-authentification ni résultat après HTTP 400", () => {
    const policy = CATALOGUE_POLITIQUES_API.find((entree) => entree.accessMode === "PREAUTH"
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(entree.permission));
    assert.ok(policy);
    expect(evaluerDecisionOmbre(db, {
      methode: policy.methode, chemin: policy.chemin, preAuthentifie: true, maintenant,
    })).toMatchObject({ decision: "INDETERMINATE", motifs: ["PREAUTH_NON_REPRESENTEE_DANS_SHADOW"] });
    expect(evaluerDecisionOmbre(db, {
      methode: policy.methode, chemin: policy.chemin, preAuthentifie: false, maintenant,
    }).decision).toBe("DENY");
    expect(normaliserObservationHttp(201)).toBe("ALLOW");
    expect(normaliserObservationHttp(500)).toBe("ERROR");
  });

  it("évalue l'ownership et la portée directement depuis les affectations Shadow", () => {
    const politique = CATALOGUE_POLITIQUES_API.find((entree) =>
      entree.accessMode === "ROLE" && entree.rolesAutorises.includes("DELEGUE_PROVINCIAL")
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(entree.permission));
    const delegue = comptes.get("DELEGUE_PROVINCIAL");
    const base = {
      methode: politique.methode, chemin: politique.chemin,
      utilisateurId: delegue.id, sessionId: delegue.sessionId, maintenant,
      exigences: { geographique: true, proprietaire: true },
    };
    expect(evaluerDecisionOmbre(db, {
      ...base, proprietaireRessourceId: delegue.id,
      porteeRessource: { typeUnite: "PROVINCE", gid: "prov-sila" },
    }).decision).toBe("ALLOW");
    expect(evaluerDecisionOmbre(db, {
      ...base, proprietaireRessourceId: "autre-utilisateur",
      porteeRessource: { typeUnite: "PROVINCE", gid: "prov-sila" },
    }).decision).toBe("DENY");
    expect(evaluerDecisionOmbre(db, {
      ...base, proprietaireRessourceId: delegue.id,
      porteeRessource: { typeUnite: "PROVINCE", gid: "prov-ouaddai" },
    }).decision).toBe("DENY");
    // La fermeture geo_unites est vide/non homologuée; l'inclusion de descendants n'est donc pas prouvable.
    expect(evaluerDecisionOmbre(db, {
      ...base, proprietaireRessourceId: delegue.id,
      porteeRessource: { typeUnite: "LOCALITE", gid: "localite-synthetique" },
    }).decision).toBe("INDETERMINATE");
    expect(evaluerDecisionOmbre(db, { ...base, proprietaireRessourceId: delegue.id }).decision).toBe("INDETERMINATE");
    expect(evaluerDecisionOmbre(db, {
      ...base, proprietaireRessourceId: delegue.id,
      porteeRessource: { typeUnite: "PROVINCE", gid: "prov-sila" },
      exigences: { organisation: true },
    }).decision).toBe("INDETERMINATE");
  });

  it("refuse les sessions révoquées et les appareils non autorisés, sans hériter d'une ancienne affectation", () => {
    const politique = CATALOGUE_POLITIQUES_API.find((entree) => entree.accessMode === "ROLE"
      && entree.rolesAutorises.includes("ADMIN_CENTRAL")
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(entree.permission));
    const central = comptes.get("ADMIN_CENTRAL");
    const input = { methode: politique.methode, chemin: politique.chemin, utilisateurId: central.id, sessionId: central.sessionId, maintenant };
    expect(evaluerDecisionOmbre(db, input).decision).toBe("ALLOW");
    db.prepare("UPDATE sessions SET revoquee = 1 WHERE id = ?").run(central.sessionId);
    expect(evaluerDecisionOmbre(db, input).decision).toBe("DENY");

    const idAppareil = "cmp-device-revoked";
    db.prepare(`INSERT INTO appareils
      (id, utilisateur_id, plateforme, nom, empreinte_cle, cle_publique_jwk, statut, autorise_par, autorise_le)
      VALUES (?, ?, 'ANDROID', 'Fixture appareil', ?, ?, 'AUTORISE', ?, datetime('now'))`)
      .run(idAppareil, central.id, "a".repeat(64), JSON.stringify({ kty: "EC", crv: "P-256", x: "a", y: "b" }), comptes.get("PROPRIETAIRE").id);
    const sessionMobile = `session-mobile-${central.id}`;
    creerSession(sessionMobile, central.id, { type: "MOBILE", appareilId: idAppareil });
    const requeteMobile = { ...input, sessionId: sessionMobile, appareilId: idAppareil };
    expect(evaluerDecisionOmbre(db, requeteMobile).decision).toBe("ALLOW");
    db.prepare("UPDATE sessions SET mfa_verifiee = 0 WHERE id = ?").run(sessionMobile);
    expect(evaluerDecisionOmbre(db, { ...requeteMobile, mfaVerifieeRequise: true }).decision).toBe("DENY");
    db.prepare("UPDATE sessions SET mfa_verifiee = 1 WHERE id = ?").run(sessionMobile);
    db.prepare("UPDATE appareils SET statut = 'REVOQUE' WHERE id = ?").run(idAppareil);
    expect(evaluerDecisionOmbre(db, requeteMobile).decision).toBe("DENY");

    const sessionRoleChange = `session-role-change-${central.id}`;
    creerSession(sessionRoleChange, central.id);
    db.prepare("UPDATE utilisateurs SET role = 'PROPRIETAIRE' WHERE id = ?").run(central.id);
    const apresChangement = evaluerDecisionOmbre(db, { ...input, sessionId: sessionRoleChange });
    expect(apresChangement.decision).toBe("DENY");
    expect(apresChangement.motifs).toContain("SESSION_REVOQUEE_OU_EXPIREE");

    const sessionExpiree = `session-expiree-${central.id}`;
    creerSession(sessionExpiree, central.id);
    db.prepare("UPDATE sessions SET expire_le = datetime('now', '-1 minute') WHERE id = ?").run(sessionExpiree);
    expect(evaluerDecisionOmbre(db, { ...input, sessionId: sessionExpiree }).decision).toBe("DENY");

    const superviseur = comptes.get("SUPERVISEUR_TERRAIN");
    const policyTerrain = CATALOGUE_POLITIQUES_API.find((entree) => entree.accessMode === "ROLE"
      && entree.rolesAutorises.includes("SUPERVISEUR_TERRAIN") && entree.rolesConditionnels.length === 0
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(entree.permission));
    creerSession(`session-suspend-${superviseur.id}`, superviseur.id);
    const avantSuspension = evaluerDecisionOmbre(db, {
      methode: policyTerrain.methode, chemin: policyTerrain.chemin,
      utilisateurId: superviseur.id, sessionId: `session-suspend-${superviseur.id}`, maintenant,
    });
    expect(avantSuspension.decision).toBe("ALLOW");
    db.prepare("UPDATE utilisateurs SET statut = 'SUSPENDU' WHERE id = ?").run(superviseur.id);
    expect(evaluerDecisionOmbre(db, {
      methode: policyTerrain.methode, chemin: policyTerrain.chemin,
      utilisateurId: superviseur.id, sessionId: `session-suspend-${superviseur.id}`, maintenant,
    })).toMatchObject({ decision: "DENY", motifs: ["COMPTE_NON_ACTIF"] });
  });

  it("ne traite ni les HTTP 400 ni les niveaux d'évaluation incomplets comme une équivalence", () => {
    const delegue = comptes.get("DELEGUE_PROVINCIAL");
    const policy = CATALOGUE_POLITIQUES_API.find((entree) => entree.accessMode === "ROLE"
      && entree.rolesAutorises.includes("DELEGUE_PROVINCIAL") && entree.rolesConditionnels.length === 0
      && db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(entree.permission));
    const shadow = evaluerDecisionOmbre(db, {
      methode: policy.methode, chemin: policy.chemin,
      utilisateurId: delegue.id, sessionId: delegue.sessionId, maintenant,
    });
    expect(normaliserObservationHttp(400)).toBe("INDETERMINATE");
    expect(normaliserObservationHttp(404)).toBe("INDETERMINATE");
    expect(normaliserObservationHttp(409)).toBe("INDETERMINATE");
    expect(comparerDecisions({ decision: "ALLOW", niveau: "AUTORISATION_COMPLETE" }, shadow).classe).toBe("INDETERMINATE");
    expect(shadow.decision).toBe("ALLOW");
    expect(comparerDecisions({ decision: "DENY", niveau: "ROUTE_GATE" }, shadow).classe).toBe("MISMATCH");
    expect(comparerDecisions({ decision: "INDETERMINATE", niveau: "ROUTE_GATE" }, shadow).classe).toBe("INDETERMINATE");
    const evaluationErreur = evaluerDecisionOmbre({ prepare() { throw new Error("fixture SQL"); } }, {
      methode: policy.methode, chemin: policy.chemin,
    });
    expect(evaluationErreur.decision).toBe("ERROR");
    expect(comparerDecisions({ decision: evaluationErreur.decision, niveau: evaluationErreur.niveau }, shadow).classe).toBe("ERROR");
    expect(evaluerDecisionOmbre(db, {
      methode: policy.methode, chemin: policy.chemin, actionDemandee: "ACTION_INCOHERENTE",
      utilisateurId: delegue.id, sessionId: delegue.sessionId, maintenant,
    })).toMatchObject({ decision: "ERROR", motifs: ["ACTION_DEMANDEE_DIFFERENTE_DE_LA_POLITIQUE"] });
  });
});
