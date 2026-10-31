import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { CATALOGUE_POLITIQUES_API } from "../../shared/permissions/catalogue.ts";
import { comparerRoleEtPorteeOmbre } from "../../backend/src/core/authz/ombre.ts";

const racine = resolve(import.meta.dirname, "../..");
const migrations = readdirSync(join(racine, "migrations")).filter((nom) => /^\d{4}_.*\.sql$/u.test(nom)).sort();
const migrationB22 = migrations.find((nom) => nom.startsWith("0036_"));
const indexMigrationB22 = migrations.indexOf(migrationB22);
let db;

function lignes(table, cle = "id") {
  return db.prepare(`SELECT * FROM ${table} ORDER BY ${cle}`).all();
}

describe("B2.2 — rétro-remplissage et comparaison en mode ombre", () => {
  beforeAll(() => {
    expect(migrationB22).toBeTruthy();
    expect(indexMigrationB22).toBeGreaterThanOrEqual(0);
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    for (const fichier of migrations.slice(0, indexMigrationB22)) {
      db.exec(readFileSync(join(racine, "migrations", fichier), "utf8"));
    }

    const departementSila = db.prepare(
      "SELECT id FROM departements WHERE province_id = 'prov-sila' ORDER BY id LIMIT 1",
    ).get();
    assert.ok(departementSila, "Le seed de référence doit fournir un département de Sila.");
    db.prepare(`INSERT INTO localites
      (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation, provenance, source_documentation)
      VALUES ('b22-localite-entrepot', 'prov-sila', ?, 'Localité de test B2.2', 'VILLE', 'AUCUN', 'VALIDE', 'TEST', 'fixture B2.2')`)
      .run(departementSila.id);
    db.prepare(`INSERT INTO entrepots
      (id, code_entrepot, nom, niveau, province_id, localite_id, actif)
      VALUES ('b22-entrepot', 'B22-ENTREPOT', 'Entrepôt de test B2.2', 'PROVINCIAL', 'prov-sila', 'b22-localite-entrepot', 1)`)
      .run();

    const insererProfil = db.prepare(`INSERT INTO profils_operationnels_terrain
      (id, utilisateur_id, role_terrain, province_id, entrepot_id, statut, attribue_par)
      VALUES (?, ?, ?, ?, ?, 'ACTIF', 'usr-central')`);
    insererProfil.run("b22-profil-stock", "usr-sila", "RESPONSABLE_STOCK", "prov-sila", "b22-entrepot");
    insererProfil.run("b22-profil-superviseur", "usr-ouaddai", "SUPERVISEUR_TERRAIN", "prov-sila", null);
    insererProfil.run("b22-profil-agent", "usr-batha", "AGENT_DISTRIBUTION", "prov-sila", null);

    db.prepare(`INSERT INTO utilisateurs
      (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
      VALUES ('b22-utilisateur-consultation', 'b22-consultation', 'Compte de test B2.2', 'ADMIN_CENTRAL', NULL, 'hash-test', 'ACTIF', 0)`)
      .run();
    db.prepare(`INSERT INTO comptes_consultation
      (id, utilisateur_id, institution, fonction, perimetre, statut, cree_par)
      VALUES ('b22-compte-consultation', 'b22-utilisateur-consultation', 'Institution test', 'Analyste', 'MULTI_PROVINCIAL', 'ACTIF', 'usr-central')`)
      .run();
    db.prepare(`INSERT INTO perimetres_provinciaux_consultation (compte_consultation_id, province_id)
      VALUES ('b22-compte-consultation', 'prov-sila'), ('b22-compte-consultation', 'prov-ouaddai')`).run();
  });

  afterAll(() => db?.close());

  it("rétro-remplit rôles et portées explicites sans toucher aux tables héritées", () => {
    const sources = [
      "utilisateurs",
      "profils_operationnels_terrain",
      "comptes_consultation",
      "perimetres_provinciaux_consultation",
    ];
    const lignesAvant = new Map(sources.map((table) => [table, lignes(table, "rowid")]));
    const colonnesAvant = new Map(sources.map((table) => [
      table,
      db.prepare(`PRAGMA table_xinfo("${table}")`).all().map(({ name }) => name),
    ]));

    db.exec(readFileSync(join(racine, "migrations", migrationB22), "utf8"));

    for (const table of sources) {
      expect(lignes(table, "rowid"), `${table}: les lignes sources doivent rester identiques.`).toEqual(lignesAvant.get(table));
      expect(db.prepare(`PRAGMA table_xinfo("${table}")`).all().map(({ name }) => name)).toEqual(colonnesAvant.get(table));
    }
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS total FROM roles").get().total).toBe(7);
    const codesOmbre = new Set(db.prepare("SELECT code FROM permissions ORDER BY code").all().map(({ code }) => code));
    expect(codesOmbre.size).toBe(216);
    const politiquesOmbre = CATALOGUE_POLITIQUES_API.filter(({ permission }) => codesOmbre.has(permission));
    const politiquesHorsOmbre = CATALOGUE_POLITIQUES_API.filter(({ permission }) => !codesOmbre.has(permission));
    expect(politiquesOmbre).toHaveLength(216);
    expect(politiquesHorsOmbre).toHaveLength(27);

    for (const politique of politiquesOmbre) {
      const attendu = new Set();
      const rolesAutorises = politique.accessMode === "SESSION"
        ? ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "CONSULTATION_INSTITUTIONNELLE", "RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION"]
        : politique.accessMode === "ROLE" ? politique.rolesAutorises : [];
      for (const role of rolesAutorises) attendu.add(`${role}|`);
      if (politique.accessMode === "ROLE") {
        for (const { role, condition } of politique.rolesConditionnels) attendu.add(`${role}|${condition}`);
      }
      const observe = db.prepare(`SELECT role_code, condition_code FROM roles_permissions
        WHERE permission_code = ? ORDER BY role_code, condition_code`).all(politique.permission);
      expect(observe.map(({ role_code, condition_code }) => `${role_code}|${condition_code}`))
        .toEqual([...attendu].sort());
    }
    for (const politique of politiquesHorsOmbre) {
      expect(db.prepare("SELECT 1 FROM permissions WHERE code = ?").get(politique.permission)).toBeUndefined();
      expect(db.prepare("SELECT 1 FROM roles_permissions WHERE permission_code = ?").get(politique.permission)).toBeUndefined();
    }

    const roleHistorique = db.prepare(`SELECT u.id,
        CASE WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
             WHEN p.id IS NOT NULL THEN p.role_terrain ELSE u.role END AS role_code
      FROM utilisateurs u
      LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
      LEFT JOIN profils_operationnels_terrain p ON p.utilisateur_id = u.id AND p.statut = 'ACTIF'
      ORDER BY u.id`).all();
    for (const ancien of roleHistorique) {
      const nouveaux = db.prepare(`SELECT DISTINCT role_code FROM affectations_roles
        WHERE utilisateur_id = ? AND statut = 'ACTIF' ORDER BY role_code`).all(ancien.id).map(({ role_code }) => role_code);
      expect(nouveaux, `${ancien.id}: une seule affectation effective doit refléter le CASE historique.`).toEqual([ancien.role_code]);
    }

    const stock = db.prepare(`SELECT r.role_code, p.type_unite, p.gid, p.inclut_descendants
      FROM affectations_roles r JOIN portees_acces p ON p.id = r.portee_id
      WHERE r.utilisateur_id = 'usr-sila' AND r.statut = 'ACTIF'`).all();
    expect(stock).toEqual([{
      role_code: "RESPONSABLE_STOCK",
      type_unite: "LOCALITE",
      gid: "b22-localite-entrepot",
      inclut_descendants: 0,
    }]);

    const profilsDecales = db.prepare(`SELECT r.role_code, p.gid FROM affectations_roles r
      JOIN portees_acces p ON p.id = r.portee_id WHERE r.utilisateur_id = ? AND r.statut = 'ACTIF'`).all("usr-ouaddai");
    expect(profilsDecales).toEqual([{ role_code: "SUPERVISEUR_TERRAIN", gid: "prov-sila" }]);
    const consultation = db.prepare(`SELECT r.role_code, p.type_unite, p.gid
      FROM affectations_roles r JOIN portees_acces p ON p.id = r.portee_id
      WHERE r.utilisateur_id = 'b22-utilisateur-consultation' ORDER BY p.gid`).all();
    expect(consultation).toEqual([
      { role_code: "CONSULTATION_INSTITUTIONNELLE", type_unite: "PROVINCE", gid: "prov-ouaddai" },
      { role_code: "CONSULTATION_INSTITUTIONNELLE", type_unite: "PROVINCE", gid: "prov-sila" },
    ]);
  });

  it("détecte les divergences sans convertir le calcul en décision d'accès", () => {
    const historique = {
      role: "RESPONSABLE_STOCK",
      province_id: "prov-sila",
      provinces_autorisees: [],
      perimetre_consultation: null,
    };
    const conforme = comparerRoleEtPorteeOmbre(historique, [{
      role_code: "RESPONSABLE_STOCK",
      type_unite: "LOCALITE",
      gid: "loc-sila",
      province_id_effectif: "prov-sila",
      source_legacy: "ENTREPOTS",
    }]);
    expect(conforme.divergences).toEqual([]);

    const divergent = comparerRoleEtPorteeOmbre(historique, []);
    expect(divergent.divergences).toEqual(["ROLE_EFFECTIF", "PROVINCE_EFFECTIVE"]);
    expect(divergent.role_effectif_nouveau).toBeNull();
  });
});
