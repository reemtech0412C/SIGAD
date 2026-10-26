import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  construireFermetureGeo,
  normaliserNomGeo,
} from "../../backend/src/modules/geo/arbre.ts";
import {
  listerAncetresGeo,
  listerEnfantsGeo,
  rechercherUnitesGeo,
} from "../../backend/src/modules/geo/lecture.ts";

const racine = resolve(import.meta.dirname, "../..");
const fichiersMigrations = readdirSync(join(racine, "migrations"))
  .filter((nom) => /^\d{4}_.*\.sql$/u.test(nom)).sort();
const migrationGeo = fichiersMigrations.findIndex((nom) => nom.startsWith("0037_"));
let db;
let instantaneTablesAnciennes;
let nombresGeoApresMigration;

function executerMigrations(base, jusquaExclu = fichiersMigrations.length) {
  for (const fichier of fichiersMigrations.slice(0, jusquaExclu)) {
    base.exec(readFileSync(join(racine, "migrations", fichier), "utf8"));
  }
}

function instantaneTables(base) {
  const tables = base.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'geo_%' ORDER BY name`).all();
  return Object.fromEntries(tables.map(({ name }) => [name, base.prepare(`SELECT * FROM "${name}"`).all()]));
}

function ajouterSource(id, kind) {
  db.prepare(`INSERT INTO geo_sources
    (source_id, source_kind, reference_code, titre, edition, exhaustivite,
     statut_verification, verifie_par, verifie_le)
    VALUES (?, ?, 'TEST_ONLY', 'Synthetic test fixture only', 'TEST_ONLY_v1', 'PARTIELLE',
      'VERIFIE', 'TEST_ONLY_verifier', '2026-10-26T00:00:00Z')`).run(id, kind);
}

function ajouterType(code, family, parentRequired = 0, root = 1) {
  db.prepare(`INSERT INTO geo_types_unites
    (type_code, famille, libelle, parent_obligatoire, autorise_racine)
    VALUES (?, ?, 'Synthetic test type only', ?, ?)`).run(code, family, parentRequired, root);
}

function approuverRegle(childType, parentType, sourceId = "SYNTHETIC_TEST_LEGAL") {
  db.prepare(`INSERT INTO geo_regles_parente
    (regle_id, type_enfant, type_parent, source_id, citation_source, statut,
     propose_par, approuve_par, autorite_approbatrice, approuve_le)
    VALUES (?, ?, ?, ?, 'TEST_ONLY: synthetic parent rule', 'APPROUVE',
      'TEST_ONLY_proposer', 'TEST_ONLY_approver', 'TEST_ONLY_authority', '2026-10-26T00:00:00Z')`)
    .run(`TEST_ONLY_RULE_${childType}_${parentType}`, childType, parentType, sourceId);
}

function ajouterUnite({ gid, typeCode, name, normalized = name.toLowerCase(), status = "VALIDE", operational = "INACTIF", sourceId = "SYNTHETIC_TEST_LEGAL" }) {
  const details = status === "VALIDE"
    ? `, source_id, citation_source, source_verifiee_le, propose_par, approuve_par,
       autorite_approbatrice, approuve_le`
    : "";
  const placeholders = status === "VALIDE"
    ? `, ?, 'TEST_ONLY: synthetic fixture', '2026-10-26T00:00:00Z',
       'TEST_ONLY_proposer', 'TEST_ONLY_approver', 'TEST_ONLY_authority', '2026-10-26T00:00:00Z'`
    : "";
  const values = status === "VALIDE" ? [sourceId] : [];
  db.prepare(`INSERT INTO geo_unites
    (gid, type_code, nom, nom_normalise, statut_validation, statut_operationnel${details})
    VALUES (?, ?, ?, ?, ?, ?${placeholders})`)
    .run(gid, typeCode, name, normalized, status, operational, ...values);
}

function rattacher({ id, child, parent, from = "2025-01-01", to = null, sourceId = "SYNTHETIC_TEST_LEGAL" }) {
  db.prepare(`INSERT INTO geo_rattachements
    (rattachement_id, enfant_gid, parent_gid, statut, valide_du, valide_au,
     source_id, version_source, citation_source, propose_par, approuve_par,
     autorite_approbatrice, approuve_le)
    VALUES (?, ?, ?, 'VALIDE', ?, ?, ?, 'TEST_ONLY_v1', 'TEST_ONLY: synthetic fixture',
      'TEST_ONLY_proposer', 'TEST_ONLY_approver', 'TEST_ONLY_authority', '2026-10-26T00:00:00Z')`)
    .run(id, child, parent, from, to, sourceId);
}

function adaptateurLecture(base) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...nextValues) { values = nextValues; return this; },
        async all() { return { results: base.prepare(sql).all(...values) }; },
      };
    },
  };
}

beforeAll(() => {
  expect(migrationGeo).toBeGreaterThanOrEqual(0);
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  executerMigrations(db, migrationGeo);
  instantaneTablesAnciennes = instantaneTables(db);
  db.exec(readFileSync(join(racine, "migrations", fichiersMigrations[migrationGeo]), "utf8"));
  nombresGeoApresMigration = db.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'geo_%' ORDER BY name`).all()
    .map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS total FROM ${name}`).get().total]);

  ajouterSource("SYNTHETIC_TEST_LEGAL", "LEGAL");
  ajouterSource("SYNTHETIC_TEST_OPERATIONAL", "OPERATIONAL");
  ajouterType("TEST_ROOT", "ADMINISTRATIVE", 0, 1);
  ajouterType("TEST_CHILD", "ADMINISTRATIVE", 1, 0);
  ajouterType("TEST_ALPHA", "ADMINISTRATIVE", 0, 1);
  ajouterType("TEST_BETA", "ADMINISTRATIVE", 0, 1);
  ajouterType("TEST_SITE", "OPERATIONNELLE", 1, 0);
  approuverRegle("TEST_CHILD", "TEST_ROOT");
  approuverRegle("TEST_ALPHA", "TEST_BETA");
  approuverRegle("TEST_BETA", "TEST_ALPHA");
  approuverRegle("TEST_SITE", "TEST_ROOT", "SYNTHETIC_TEST_OPERATIONAL");
});

describe("B2.3-A — foundation schema, hierarchy and scoped read contracts", () => {
  it("adds only empty geo tables and preserves every pre-existing table row", () => {
    expect(instantaneTables(db)).toEqual(instantaneTablesAnciennes);
    expect(nombresGeoApresMigration).toEqual([
      ["geo_alias", 0], ["geo_codes_externes", 0], ["geo_fermeture", 0], ["geo_journal_versions", 0],
      ["geo_rattachements", 0], ["geo_regles_parente", 0], ["geo_sources", 0], ["geo_types_unites", 0], ["geo_unites", 0],
    ]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("keeps proposed and operational statuses separate and rejects self-approval", () => {
    ajouterUnite({ gid: "TEST_ONLY_proposed", typeCode: "TEST_CHILD", name: "Synthetic proposed unit", status: "PROPOSE" });
    ajouterUnite({ gid: "TEST_ONLY_wrong_source", typeCode: "TEST_ROOT", name: "Synthetic wrong-source unit", status: "PROPOSE" });
    expect(db.prepare("SELECT statut_validation, statut_operationnel FROM geo_unites WHERE gid = ?").get("TEST_ONLY_proposed"))
      .toEqual({ statut_validation: "PROPOSE", statut_operationnel: "INACTIF" });
    expect(() => db.prepare(`UPDATE geo_unites SET statut_validation = 'VALIDE', source_id = ?,
      citation_source = 'TEST_ONLY', source_verifiee_le = '2026-10-26T00:00:00Z',
      propose_par = 'TEST_ONLY_same', approuve_par = 'TEST_ONLY_same',
      autorite_approbatrice = 'TEST_ONLY', approuve_le = '2026-10-26T00:00:00Z' WHERE gid = ?`)
      .run("SYNTHETIC_TEST_LEGAL", "TEST_ONLY_proposed")).toThrow();
    expect(() => db.prepare(`UPDATE geo_unites SET statut_validation = 'VALIDE', source_id = ?,
      citation_source = 'TEST_ONLY', source_verifiee_le = '2026-10-26T00:00:00Z',
      propose_par = 'TEST_ONLY_proposer', approuve_par = 'TEST_ONLY_approver',
      autorite_approbatrice = 'TEST_ONLY', approuve_le = '2026-10-26T00:00:00Z' WHERE gid = ?`)
      .run("SYNTHETIC_TEST_OPERATIONAL", "TEST_ONLY_wrong_source")).toThrow(/geo_unit_requires_verified_source_for_type/u);
    db.prepare(`UPDATE geo_unites SET statut_validation = 'VALIDE', source_id = ?,
      citation_source = 'TEST_ONLY: synthetic fixture', source_verifiee_le = '2026-10-26T00:00:00Z',
      propose_par = 'TEST_ONLY_proposer', approuve_par = 'TEST_ONLY_approver',
      autorite_approbatrice = 'TEST_ONLY_authority', approuve_le = '2026-10-26T00:00:00Z' WHERE gid = ?`)
      .run("SYNTHETIC_TEST_LEGAL", "TEST_ONLY_proposed");
    expect(db.prepare("SELECT statut_validation, statut_operationnel FROM geo_unites WHERE gid = ?").get("TEST_ONLY_proposed"))
      .toEqual({ statut_validation: "VALIDE", statut_operationnel: "INACTIF" });
  });

  it("requires verified family-appropriate source and authorized-rule metadata for valid units", () => {
    expect(() => approuverRegle("TEST_ALPHA", "TEST_ROOT", "SYNTHETIC_TEST_OPERATIONAL"))
      .toThrow(/geo_parent_rule_requires_verified_source/u);
    ajouterUnite({ gid: "TEST_ONLY_valid_root", typeCode: "TEST_ROOT", name: "Synthetic root" });
    ajouterUnite({ gid: "TEST_ONLY_child", typeCode: "TEST_CHILD", name: "Synthetic child" });
    expect(() => db.prepare(`UPDATE geo_unites SET statut_operationnel = 'ACTIF' WHERE gid = ?`).run("TEST_ONLY_child")).toThrow();
    rattacher({ id: "TEST_ONLY_valid_parent", child: "TEST_ONLY_child", parent: "TEST_ONLY_valid_root" });
    db.prepare("UPDATE geo_unites SET statut_operationnel = 'ACTIF' WHERE gid = ?").run("TEST_ONLY_child");
    expect(db.prepare("SELECT statut_operationnel FROM geo_unites WHERE gid = ?").get("TEST_ONLY_child").statut_operationnel).toBe("ACTIF");
  });

  it("rejects invalid parent types, duplicate siblings and overlapping parents", () => {
    ajouterUnite({ gid: "TEST_ONLY_dup_parent", typeCode: "TEST_ROOT", name: "Synthetic parent" });
    ajouterUnite({ gid: "TEST_ONLY_dup_a", typeCode: "TEST_CHILD", name: "Synthetic duplicate", normalized: "synthetic duplicate" });
    ajouterUnite({ gid: "TEST_ONLY_dup_b", typeCode: "TEST_CHILD", name: "Synthetic duplicate", normalized: "synthetic duplicate" });
    ajouterUnite({ gid: "TEST_ONLY_other_type", typeCode: "TEST_BETA", name: "Synthetic invalid parent" });
    expect(() => rattacher({ id: "TEST_ONLY_no_rule", child: "TEST_ONLY_dup_a", parent: "TEST_ONLY_other_type" })).toThrow();
    rattacher({ id: "TEST_ONLY_dup_edge_a", child: "TEST_ONLY_dup_a", parent: "TEST_ONLY_dup_parent" });
    expect(() => rattacher({ id: "TEST_ONLY_dup_edge_b", child: "TEST_ONLY_dup_b", parent: "TEST_ONLY_dup_parent" })).toThrow(/geo_duplicate_sibling_name/u);
    expect(() => rattacher({ id: "TEST_ONLY_overlap", child: "TEST_ONLY_dup_a", parent: "TEST_ONLY_dup_parent", from: "2025-06-01" })).toThrow();
    db.prepare(`INSERT INTO geo_codes_externes(systeme, code_externe, gid, source_id, version_source)
      VALUES ('TEST_ONLY_SYSTEM', 'TEST_ONLY_CODE', 'TEST_ONLY_dup_a', 'SYNTHETIC_TEST_LEGAL', 'TEST_ONLY_v1')`).run();
    expect(() => db.prepare(`INSERT INTO geo_codes_externes(systeme, code_externe, gid, source_id, version_source)
      VALUES ('TEST_ONLY_SYSTEM', 'TEST_ONLY_CODE', 'TEST_ONLY_dup_b', 'SYNTHETIC_TEST_LEGAL', 'TEST_ONLY_v1')`).run()).toThrow();
    db.prepare(`INSERT INTO geo_alias(alias_id, gid, nom_alias, nom_normalise, source_id)
      VALUES ('TEST_ONLY_ALIAS_A', 'TEST_ONLY_dup_a', 'Synthetic alias', 'synthetic alias', 'SYNTHETIC_TEST_LEGAL')`).run();
    expect(() => db.prepare(`INSERT INTO geo_alias(alias_id, gid, nom_alias, nom_normalise, source_id)
      VALUES ('TEST_ONLY_ALIAS_B', 'TEST_ONLY_dup_a', 'Synthetic alias variant', 'synthetic alias', 'SYNTHETIC_TEST_LEGAL')`).run()).toThrow();
  });

  it("allows non-overlapping historical reassignment and rejects cycles", () => {
    ajouterUnite({ gid: "TEST_ONLY_alpha", typeCode: "TEST_ALPHA", name: "Synthetic alpha" });
    ajouterUnite({ gid: "TEST_ONLY_beta", typeCode: "TEST_BETA", name: "Synthetic beta" });
    rattacher({ id: "TEST_ONLY_temporal_ab", child: "TEST_ONLY_alpha", parent: "TEST_ONLY_beta", from: "2025-01-01", to: "2025-06-01" });
    rattacher({ id: "TEST_ONLY_temporal_ba", child: "TEST_ONLY_beta", parent: "TEST_ONLY_alpha", from: "2025-06-01" });

    ajouterUnite({ gid: "TEST_ONLY_reassigned_child", typeCode: "TEST_ALPHA", name: "Synthetic reassigned child" });
    ajouterUnite({ gid: "TEST_ONLY_old_parent", typeCode: "TEST_BETA", name: "Synthetic old parent" });
    ajouterUnite({ gid: "TEST_ONLY_new_parent", typeCode: "TEST_BETA", name: "Synthetic new parent" });
    rattacher({ id: "TEST_ONLY_old_assignment", child: "TEST_ONLY_reassigned_child", parent: "TEST_ONLY_old_parent" });
    db.prepare("UPDATE geo_rattachements SET valide_au = '2025-06-01' WHERE rattachement_id = 'TEST_ONLY_old_assignment'").run();
    expect(() => db.prepare("UPDATE geo_rattachements SET parent_gid = 'TEST_ONLY_new_parent' WHERE rattachement_id = 'TEST_ONLY_old_assignment'").run()).toThrow(/geo_attachment_identity_is_immutable/u);
    rattacher({ id: "TEST_ONLY_new_assignment", child: "TEST_ONLY_reassigned_child", parent: "TEST_ONLY_new_parent", from: "2025-06-01" });

    ajouterUnite({ gid: "TEST_ONLY_cycle_a", typeCode: "TEST_ALPHA", name: "Synthetic cycle alpha" });
    ajouterUnite({ gid: "TEST_ONLY_cycle_b", typeCode: "TEST_BETA", name: "Synthetic cycle beta" });
    rattacher({ id: "TEST_ONLY_cycle_first", child: "TEST_ONLY_cycle_a", parent: "TEST_ONLY_cycle_b" });
    expect(() => rattacher({ id: "TEST_ONLY_cycle_second", child: "TEST_ONLY_cycle_b", parent: "TEST_ONLY_cycle_a" })).toThrow(/geo_attachment_cycle/u);
  });

  it("rebuilds transitive closure deterministically and detects invalid trees", () => {
    const edges = [
      { enfant_gid: "TEST_ONLY_city", parent_gid: "TEST_ONLY_region", statut: "VALIDE", valide_du: "2025-01-01", valide_au: null },
      { enfant_gid: "TEST_ONLY_block", parent_gid: "TEST_ONLY_city", statut: "VALIDE", valide_du: "2025-01-01", valide_au: null },
      { enfant_gid: "TEST_ONLY_outdated", parent_gid: "TEST_ONLY_old", statut: "VALIDE", valide_du: "2020-01-01", valide_au: "2024-01-01" },
    ];
    const closure = construireFermetureGeo(edges, "2026-10-26");
    expect(closure).toContainEqual({ ancetre_gid: "TEST_ONLY_region", descendant_gid: "TEST_ONLY_block", profondeur: 2 });
    expect(construireFermetureGeo(edges, "2026-10-26")).toEqual(closure);
    expect(closure.some((row) => row.descendant_gid === "TEST_ONLY_outdated")).toBe(false);
    expect(() => construireFermetureGeo([
      ...edges,
      { enfant_gid: "TEST_ONLY_region", parent_gid: "TEST_ONLY_block", statut: "VALIDE", valide_du: "2025-01-01", valide_au: null },
    ], "2026-10-26")).toThrow("geo_attachment_cycle");
    expect(() => construireFermetureGeo([
      ...edges,
      { enfant_gid: "TEST_ONLY_city", parent_gid: "TEST_ONLY_other", statut: "VALIDE", valide_du: "2025-01-01", valide_au: null },
    ], "2026-10-26")).toThrow("geo_multiple_current_parents");
  });

  it("normalizes alternate spellings for duplicate detection without deriving GIDs from names", () => {
    expect(normaliserNomGeo("N’Djaména")).toBe("n djamena");
    expect(normaliserNomGeo("N Djamena")).toBe("n djamena");
    expect(db.prepare("SELECT COUNT(*) AS total FROM geo_unites WHERE gid LIKE 'TEST_ONLY_%'").get().total).toBeGreaterThan(0);
  });

  it("filters children, ancestors, search and cursor pages by the server-supplied exact scope", async () => {
    ajouterUnite({ gid: "TEST_ONLY_read_parent", typeCode: "TEST_ROOT", name: "Synthetic read parent" });
    ajouterUnite({ gid: "TEST_ONLY_read_a", typeCode: "TEST_CHILD", name: "Synthetic Alpha" });
    ajouterUnite({ gid: "TEST_ONLY_read_b", typeCode: "TEST_CHILD", name: "Synthetic Beta" });
    ajouterUnite({ gid: "TEST_ONLY_read_out", typeCode: "TEST_CHILD", name: "Synthetic Gamma" });
    rattacher({ id: "TEST_ONLY_read_edge_a", child: "TEST_ONLY_read_a", parent: "TEST_ONLY_read_parent" });
    rattacher({ id: "TEST_ONLY_read_edge_b", child: "TEST_ONLY_read_b", parent: "TEST_ONLY_read_parent" });
    rattacher({ id: "TEST_ONLY_read_edge_out", child: "TEST_ONLY_read_out", parent: "TEST_ONLY_read_parent" });
    db.prepare(`INSERT INTO geo_fermeture (ancetre_gid, descendant_gid, profondeur)
      VALUES ('TEST_ONLY_read_parent', 'TEST_ONLY_read_a', 1), ('TEST_ONLY_read_parent', 'TEST_ONLY_read_b', 1), ('TEST_ONLY_read_parent', 'TEST_ONLY_read_out', 1)`).run();
    db.prepare(`INSERT INTO geo_alias(alias_id, gid, nom_alias, nom_normalise, source_id)
      VALUES ('TEST_ONLY_unverified_alias', 'TEST_ONLY_read_a', 'Unverified alias', 'unverified alias', 'SYNTHETIC_TEST_LEGAL')`).run();
    db.prepare(`INSERT INTO geo_alias(alias_id, gid, nom_alias, nom_normalise, source_id, verifie_le)
      VALUES ('TEST_ONLY_verified_alias', 'TEST_ONLY_read_a', 'Verified alias', 'verified alias', 'SYNTHETIC_TEST_LEGAL', '2026-10-26T00:00:00Z')`).run();

    const api = adaptateurLecture(db);
    const authorized = { source: "LEGACY_SESSION", mode: "GIDS", gids: ["TEST_ONLY_read_a", "TEST_ONLY_read_b"] };
    const first = await listerEnfantsGeo(api, "TEST_ONLY_read_parent", authorized, { limit: 1 });
    expect(first.items.map((unit) => unit.gid)).toEqual(["TEST_ONLY_read_a"]);
    expect(first.nextCursor).toBe("TEST_ONLY_read_a");
    const second = await listerEnfantsGeo(api, "TEST_ONLY_read_parent", authorized, { limit: 1, afterGid: first.nextCursor });
    expect(second.items.map((unit) => unit.gid)).toEqual(["TEST_ONLY_read_b"]);
    expect(second.nextCursor).toBeNull();
    expect(Object.keys(first).sort()).toEqual(["items", "nextCursor", "schemaVersion"]);
    expect((await listerEnfantsGeo(api, "TEST_ONLY_read_parent", { source: "LEGACY_SESSION", mode: "GIDS", gids: [] })).items).toEqual([]);
    expect((await listerEnfantsGeo(api, "TEST_ONLY_read_parent", null)).items).toEqual([]);
    expect((await listerAncetresGeo(api, "TEST_ONLY_read_a", authorized)).items.map((unit) => unit.gid)).toEqual([]);
    const search = await rechercherUnitesGeo(api, "synthetic", authorized);
    expect(search.items.map((unit) => unit.gid)).toEqual(["TEST_ONLY_read_a", "TEST_ONLY_read_b"]);
    expect((await rechercherUnitesGeo(api, "unverified alias", authorized)).items).toEqual([]);
    expect((await rechercherUnitesGeo(api, "verified alias", authorized)).items.map((unit) => unit.gid)).toEqual(["TEST_ONLY_read_a"]);
  });

  it("keeps the change journal append-only and emits scoped synchronization versions", () => {
    ajouterUnite({ gid: "TEST_ONLY_journal_unit", typeCode: "TEST_ROOT", name: "Synthetic journal before" });
    db.prepare("UPDATE geo_unites SET nom = 'Synthetic journal after', nom_normalise = 'synthetic journal after' WHERE gid = 'TEST_ONLY_journal_unit'").run();
    const unit = db.prepare("SELECT version FROM geo_unites WHERE gid = 'TEST_ONLY_journal_unit'").get();
    expect(unit.version).toBe(2);
    const event = db.prepare("SELECT version_id FROM geo_journal_versions WHERE gid = 'TEST_ONLY_journal_unit' ORDER BY version_id DESC LIMIT 1").get();
    expect(event.version_id).toBeGreaterThan(0);
    expect(() => db.prepare("UPDATE geo_journal_versions SET evenement = 'UNITE_CREEE' WHERE version_id = ?").run(event.version_id)).toThrow(/geo_version_journal_is_append_only/u);
    expect(() => db.prepare("DELETE FROM geo_journal_versions WHERE version_id = ?").run(event.version_id)).toThrow(/geo_version_journal_is_append_only/u);
  });
});
