import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";

const racine = resolve(import.meta.dirname, "../..");
const migrations = readdirSync(join(racine, "migrations"))
  .filter((nom) => /^\d{4}_.*\.sql$/u.test(nom))
  .sort();
const migrationReconciliation = migrations.find((nom) => nom.startsWith("0042_"));
let db;

function lignes(sql, ...parametres) {
  return db.prepare(sql).all(...parametres);
}

function rolesOmbre(utilisateurId) {
  return lignes(`SELECT role_code, portee_id, source_legacy, statut
    FROM affectations_roles WHERE utilisateur_id = ? ORDER BY role_code, portee_id`, utilisateurId);
}

function porteesOmbre(utilisateurId) {
  return lignes(`SELECT type_unite, gid, source_legacy, statut
    FROM portees_acces WHERE utilisateur_id = ? ORDER BY type_unite, gid`, utilisateurId);
}

function compterEcarts(utilisateurId = null) {
  const filtreE = utilisateurId === null ? "" : " WHERE e.utilisateur_id = ?";
  const filtreP = utilisateurId === null ? "" : " WHERE p.utilisateur_id = ?";
  const filtreR = utilisateurId === null ? "" : " WHERE r.utilisateur_id = ?";
  const filtreA = utilisateurId === null ? "" : " WHERE a.utilisateur_id = ?";
  const parametres = utilisateurId === null ? [] : [utilisateurId];
  const vuesPortee = [
    "b22_portee_nationale_role",
    "b22_portee_nationale_consultation",
    "b22_portee_province_delegue",
    "b22_portee_province_terrain",
    "b22_portee_localite_stock",
    "b22_portee_province_consultation",
  ];
  let differences = 0;
  for (const vue of vuesPortee) {
    differences += db.prepare(`SELECT COUNT(*) AS total FROM ${vue} e${filtreE}
      ${filtreE ? "AND" : "WHERE"} NOT EXISTS (
        SELECT 1 FROM portees_acces p WHERE p.id = e.id AND p.utilisateur_id = e.utilisateur_id
          AND p.type_unite = e.type_unite AND p.gid IS e.gid
          AND p.inclut_descendants = e.inclut_descendants
          AND p.source_legacy = e.source_legacy AND p.statut = e.statut
      )`).get(...parametres).total;
  }
  const exigencesSupplementaires = vuesPortee.map((vue) => `NOT EXISTS (
    SELECT 1 FROM ${vue} e WHERE e.id = p.id AND e.utilisateur_id = p.utilisateur_id
      AND e.type_unite = p.type_unite AND e.gid IS p.gid
      AND e.inclut_descendants = p.inclut_descendants
      AND e.source_legacy = p.source_legacy AND e.statut = p.statut
  )`).join(" AND ");
  differences += db.prepare(`SELECT COUNT(*) AS total FROM portees_acces p${filtreP}
    ${filtreP ? "AND" : "WHERE"} ${exigencesSupplementaires}`).get(...parametres).total;

  const attenduRole = `SELECT 1 FROM b22_profil_role_effectif r
    JOIN roles catalogue ON catalogue.code = r.role_code
    LEFT JOIN portees_acces p ON p.utilisateur_id = r.utilisateur_id
    WHERE r.utilisateur_id = a.utilisateur_id AND r.role_code IS NOT NULL
      AND a.id = 'ar:' || r.utilisateur_id || ':' || r.role_code || ':' || COALESCE(p.id, 'SANS_PORTEE')
      AND a.role_code = r.role_code AND a.portee_id IS p.id
      AND a.source_legacy = r.source_role AND a.statut = r.statut_ombre`;
  differences += db.prepare(`SELECT COUNT(*) AS total FROM b22_profil_role_effectif r${filtreR}
    ${filtreR ? "AND" : "WHERE"} r.role_code IS NOT NULL AND EXISTS (
      SELECT 1 FROM roles catalogue WHERE catalogue.code = r.role_code
    ) AND NOT EXISTS (
      SELECT 1 FROM affectations_roles a WHERE a.utilisateur_id = r.utilisateur_id
        AND a.role_code = r.role_code AND a.source_legacy = r.source_role AND a.statut = r.statut_ombre
    )`).get(...parametres).total;
  differences += db.prepare(`SELECT COUNT(*) AS total FROM affectations_roles a${filtreA}
    ${filtreA ? "AND" : "WHERE"} NOT EXISTS (${attenduRole})`).get(...parametres).total;
  const conflits = utilisateurId === null
    ? db.prepare("SELECT COUNT(*) AS total FROM b22_reconciliation_etat WHERE resultat IN ('CONFLIT', 'COMPTE_ABSENT')").get().total
    : db.prepare("SELECT COUNT(*) AS total FROM b22_reconciliation_etat WHERE utilisateur_id = ? AND resultat IN ('CONFLIT', 'COMPTE_ABSENT')").get(utilisateurId).total;
  return differences + conflits;
}

function creerUtilisateur(id, role = "ADMIN_CENTRAL", provinceId = null) {
  db.prepare(`INSERT INTO utilisateurs
    (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut, doit_changer_mot_de_passe)
    VALUES (?, ?, 'Fixture B2.6', ?, ?, 'hash-fixture', 'ACTIF', 0)`)
    .run(id, `login-${id}`, role, provinceId);
}

function creerSession(id, utilisateurId) {
  db.prepare(`INSERT INTO sessions (id, utilisateur_id, jeton_hash, jeton_csrf, expire_le)
    VALUES (?, ?, ?, 'csrf-fixture', datetime('now', '+1 hour'))`)
    .run(id, utilisateurId, `hash-${id}`);
}

describe("B2.6 — synchronisation et réconciliation B2.2 en ombre", () => {
  beforeAll(() => {
    expect(migrationReconciliation).toBeTruthy();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    for (const fichier of migrations) {
      db.exec(readFileSync(join(racine, "migrations", fichier), "utf8"));
    }
  });

  afterAll(() => db?.close());

  it("réconcilie les comptes préexistants et expose les conflits sans élargir", () => {
    const totalComptes = db.prepare("SELECT COUNT(*) AS total FROM utilisateurs").get().total;
    const totalReconciles = db.prepare("SELECT COUNT(*) AS total FROM b22_reconciliation_etat WHERE resultat = 'RECONCILIE'").get().total;
    expect(totalComptes).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) AS total FROM b22_reconciliation_etat").get().total).toBe(totalComptes);
    expect(totalReconciles).toBe(totalComptes);
    expect(compterEcarts()).toBe(0);
  });

  it("projette création, changement de rôle/portée, suspension et réactivation, et invalide la session", () => {
    const id = "b26-sync-identite";
    creerUtilisateur(id);
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["ADMIN_CENTRAL"]);
    expect(porteesOmbre(id)).toEqual([{
      type_unite: "NATIONALE", gid: null, source_legacy: "ROLES_NATIONAUX", statut: "ACTIF",
    }]);

    creerSession("b26-sync-session", id);
    db.prepare("UPDATE utilisateurs SET role = 'PROPRIETAIRE' WHERE id = ?").run(id);
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["PROPRIETAIRE"]);
    expect(porteesOmbre(id)).toEqual([{
      type_unite: "NATIONALE", gid: null, source_legacy: "ROLES_NATIONAUX", statut: "ACTIF",
    }]);
    expect(db.prepare("SELECT revoquee, motif_revocation FROM sessions WHERE id = ?").get("b26-sync-session"))
      .toEqual({ revoquee: 1, motif_revocation: "PORTEE_MODIFIEE" });

    creerSession("b26-sync-session-suspension", id);
    db.prepare("UPDATE utilisateurs SET statut = 'SUSPENDU' WHERE id = ?").run(id);
    expect(rolesOmbre(id).every((ligne) => ligne.statut === "SUSPENDU")).toBe(true);
    expect(porteesOmbre(id).every((ligne) => ligne.statut === "SUSPENDU")).toBe(true);
    expect(db.prepare("SELECT revoquee, motif_revocation FROM sessions WHERE id = ?").get("b26-sync-session-suspension"))
      .toEqual({ revoquee: 1, motif_revocation: "COMPTE_NON_ACTIF" });
    db.prepare("UPDATE utilisateurs SET statut = 'ACTIF' WHERE id = ?").run(id);
    expect(rolesOmbre(id).every((ligne) => ligne.statut === "ACTIF")).toBe(true);

    db.prepare("UPDATE utilisateurs SET role = 'ADMIN_CENTRAL' WHERE id = ?").run(id);
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["ADMIN_CENTRAL"]);
    expect(compterEcarts(id)).toBe(0);
  });

  it("réconcilie les profils, entrepôts et périmètres de consultation de manière idempotente", () => {
    const id = "b26-sync-profil";
    const departement = db.prepare("SELECT id FROM departements WHERE province_id = 'prov-sila' ORDER BY id LIMIT 1").get();
    assert.ok(departement, "Le seed local fournit un département de Sila.");
    db.prepare(`INSERT INTO localites
      (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation, provenance, source_documentation)
      VALUES ('b26-localite-a', 'prov-sila', ?, 'Localité synthétique A', 'VILLE', 'AUCUN', 'VALIDE', 'TEST', 'fixture B2.6'),
             ('b26-localite-b', 'prov-sila', ?, 'Localité synthétique B', 'VILLE', 'AUCUN', 'VALIDE', 'TEST', 'fixture B2.6')`)
      .run(departement.id, departement.id);
    const localites = lignes("SELECT id FROM localites WHERE id IN ('b26-localite-a', 'b26-localite-b') ORDER BY id");
    assert.equal(localites.length, 2);
    creerUtilisateur(id);
    db.prepare(`INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id, localite_id, actif)
      VALUES ('b26-sync-entrepot', 'B26-SYNC', 'Entrepôt B2.6', 'PROVINCIAL', 'prov-sila', ?, 1)`)
      .run(localites[0].id);
    db.prepare(`INSERT INTO profils_operationnels_terrain
      (id, utilisateur_id, role_terrain, province_id, entrepot_id, statut, attribue_par)
      VALUES ('b26-sync-profil-row', ?, 'RESPONSABLE_STOCK', 'prov-sila', 'b26-sync-entrepot', 'ACTIF', 'usr-central')`)
      .run(id);
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["RESPONSABLE_STOCK"]);
    expect(porteesOmbre(id)).toEqual([{
      type_unite: "LOCALITE", gid: localites[0].id, source_legacy: "ENTREPOTS", statut: "ACTIF",
    }]);

    creerSession("b26-entrepot-session", id);
    db.prepare("UPDATE entrepots SET localite_id = ? WHERE id = 'b26-sync-entrepot'").run(localites[1].id);
    expect(porteesOmbre(id).map((ligne) => ligne.gid)).toEqual([localites[1].id]);
    expect(db.prepare("SELECT revoquee FROM sessions WHERE id = 'b26-entrepot-session'").get().revoquee).toBe(1);

    db.prepare("UPDATE profils_operationnels_terrain SET role_terrain = 'SUPERVISEUR_TERRAIN', province_id = 'prov-ouaddai' WHERE id = 'b26-sync-profil-row'").run();
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["SUPERVISEUR_TERRAIN"]);
    expect(porteesOmbre(id)).toEqual([{
      type_unite: "PROVINCE", gid: "prov-ouaddai", source_legacy: "PROFILS_OPERATIONNELS_TERRAIN", statut: "ACTIF",
    }]);
    db.prepare("UPDATE profils_operationnels_terrain SET statut = 'SUSPENDU' WHERE id = 'b26-sync-profil-row'").run();
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["ADMIN_CENTRAL"]);
    expect(porteesOmbre(id).map((ligne) => ligne.type_unite)).toEqual(["NATIONALE"]);
    db.prepare("UPDATE profils_operationnels_terrain SET statut = 'ACTIF' WHERE id = 'b26-sync-profil-row'").run();

    const avantReprise = JSON.stringify({ role: rolesOmbre(id), portee: porteesOmbre(id) });
    db.prepare(`INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
      VALUES (?, 'MIGRATION_0042')`).run(id);
    expect(JSON.stringify({ role: rolesOmbre(id), portee: porteesOmbre(id) })).toBe(avantReprise);
    expect(db.prepare("SELECT resultat FROM b22_reconciliation_etat WHERE utilisateur_id = ?").get(id).resultat).toBe("RECONCILIE");

    const consultationId = "b26-sync-consultation";
    creerUtilisateur(consultationId, "ADMIN_CENTRAL", null);
    db.prepare(`INSERT INTO comptes_consultation
      (id, utilisateur_id, institution, fonction, perimetre, statut, cree_par)
      VALUES ('b26-sync-consultation-row', ?, 'Institution B2.6', 'Lecteur', 'MULTI_PROVINCIAL', 'INVITE', 'usr-central')`)
      .run(consultationId);
    db.prepare(`INSERT INTO perimetres_provinciaux_consultation (compte_consultation_id, province_id)
      VALUES ('b26-sync-consultation-row', 'prov-sila'), ('b26-sync-consultation-row', 'prov-ouaddai')`).run();
    expect(rolesOmbre(consultationId).map((ligne) => ligne.role_code)).toEqual(["CONSULTATION_INSTITUTIONNELLE", "CONSULTATION_INSTITUTIONNELLE"]);
    expect(rolesOmbre(consultationId).every((ligne) => ligne.statut === "SUSPENDU")).toBe(true);
    expect(porteesOmbre(consultationId).map((ligne) => ligne.gid)).toEqual(["prov-ouaddai", "prov-sila"]);
    creerSession("b26-consultation-activation-session", consultationId);
    db.prepare("UPDATE comptes_consultation SET statut = 'ACTIF' WHERE id = 'b26-sync-consultation-row'").run();
    expect(rolesOmbre(consultationId).every((ligne) => ligne.statut === "ACTIF")).toBe(true);
    expect(db.prepare("SELECT revoquee FROM sessions WHERE id = 'b26-consultation-activation-session'").get().revoquee).toBe(0);
    creerSession("b26-consultation-session", consultationId);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM perimetres_provinciaux_consultation WHERE compte_consultation_id = 'b26-sync-consultation-row'").run();
      db.prepare("INSERT INTO perimetres_provinciaux_consultation (compte_consultation_id, province_id) VALUES ('b26-sync-consultation-row', 'prov-sila')").run();
      db.exec("COMMIT");
    } catch (erreur) {
      db.exec("ROLLBACK");
      throw erreur;
    }
    expect(porteesOmbre(consultationId).map((ligne) => ligne.gid)).toEqual(["prov-sila"]);
    expect(db.prepare("SELECT revoquee FROM sessions WHERE id = 'b26-consultation-session'").get().revoquee).toBe(1);
    db.prepare("UPDATE comptes_consultation SET statut = 'SUSPENDU' WHERE id = 'b26-sync-consultation-row'").run();
    expect(rolesOmbre(consultationId).every((ligne) => ligne.statut === "SUSPENDU")).toBe(true);
    expect(compterEcarts()).toBe(0);
  });

  it("annule la modification Legacy si la projection échoue", () => {
    const id = "b26-sync-echec";
    creerUtilisateur(id);
    creerSession("b26-sync-echec-session", id);
    db.exec(`CREATE TEMP TRIGGER b26_echec_projection
      BEFORE INSERT ON main.portees_acces WHEN NEW.utilisateur_id = '${id}'
      BEGIN SELECT RAISE(ABORT, 'echec projection de test'); END;`);
    try {
      expect(() => db.prepare(`UPDATE utilisateurs SET role = 'PROPRIETAIRE' WHERE id = ?`).run(id))
        .toThrow(/echec projection de test/u);
    } finally {
      db.exec("DROP TRIGGER IF EXISTS temp.b26_echec_projection;");
    }
    expect(db.prepare("SELECT role, province_id FROM utilisateurs WHERE id = ?").get(id))
      .toEqual({ role: "ADMIN_CENTRAL", province_id: null });
    expect(db.prepare("SELECT revoquee FROM sessions WHERE id = 'b26-sync-echec-session'").get().revoquee).toBe(0);
    expect(rolesOmbre(id).map((ligne) => ligne.role_code)).toEqual(["ADMIN_CENTRAL"]);
  });

  it("conserve un résultat explicite pour les suppressions et les comptes ambigus", () => {
    const id = "b26-sync-ambigu";
    creerUtilisateur(id);
    db.prepare(`INSERT INTO profils_operationnels_terrain
      (id, utilisateur_id, role_terrain, province_id, statut, attribue_par)
      VALUES ('b26-sync-ambigu-a', ?, 'SUPERVISEUR_TERRAIN', 'prov-sila', 'ACTIF', 'usr-central'),
             ('b26-sync-ambigu-b', ?, 'AGENT_DISTRIBUTION', 'prov-ouaddai', 'ACTIF', 'usr-central')`)
      .run(id, id);
    expect(db.prepare("SELECT resultat, raison FROM b22_reconciliation_etat WHERE utilisateur_id = ?").get(id))
      .toEqual({ resultat: "CONFLIT", raison: "PLUSIEURS_PROFILS_TERRAIN_ACTIFS" });
    expect(rolesOmbre(id)).toEqual([]);
    expect(porteesOmbre(id)).toEqual([]);
    expect(compterEcarts(id)).toBe(1);

    db.prepare("DELETE FROM profils_operationnels_terrain WHERE utilisateur_id = ?").run(id);
    expect(db.prepare("SELECT resultat FROM b22_reconciliation_etat WHERE utilisateur_id = ?").get(id).resultat).toBe("RECONCILIE");
    db.prepare("DELETE FROM utilisateurs WHERE id = ?").run(id);
    expect(db.prepare("SELECT resultat, raison FROM b22_reconciliation_etat WHERE utilisateur_id = ?").get(id))
      .toEqual({ resultat: "COMPTE_ABSENT", raison: "UTILISATEUR_SUPPRIME" });
  });
});
