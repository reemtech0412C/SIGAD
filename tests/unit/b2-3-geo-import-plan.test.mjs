import { describe, expect, it } from "vitest";
import { planifierImportGeo } from "../../backend/src/modules/geo/import-plan.ts";

const source = {
  sourceId: "TEST_ONLY_SOURCE",
  kind: "LEGAL",
  edition: "TEST_ONLY_v1",
  sha256: "a".repeat(64),
  completeness: "COMPLETE",
  verification: "VERIFIE",
};

const types = [
  { code: "TEST_ROOT", family: "ADMINISTRATIVE", parentRequired: false, rootAllowed: true },
  { code: "TEST_CHILD", family: "ADMINISTRATIVE", parentRequired: true, rootAllowed: false },
  { code: "TEST_SITE", family: "OPERATIONNELLE", parentRequired: true, rootAllowed: false },
];

const parentRules = [
  { childType: "TEST_CHILD", parentType: "TEST_ROOT", approved: true },
  { childType: "TEST_SITE", parentType: "TEST_ROOT", approved: true },
];

function candidate(overrides = {}) {
  return {
    gid: "stable-test-child-01",
    typeCode: "TEST_CHILD",
    name: "Synthetic Child",
    parentGid: "stable-test-root-01",
    sourceCitation: "TEST_ONLY: synthetic source, no real units",
    referenceDate: "2026-10-01",
    sourceVersion: "TEST_ONLY_v1",
    ...overrides,
  };
}

const rootExisting = {
  gid: "stable-test-root-01",
  typeCode: "TEST_ROOT",
  name: "Synthetic Root",
  parentGid: null,
  sourceCitation: "TEST_ONLY: synthetic source, no real units",
  referenceDate: "2026-10-01",
  sourceVersion: "TEST_ONLY_v1",
  version: 1,
};

function plan(overrides = {}) {
  return planifierImportGeo({
    source,
    types,
    parentRules,
    existing: [rootExisting],
    proposed: [candidate()],
    sourceApprovedForImport: true,
    ...overrides,
  });
}

describe("B2.3-B — read-only import plan and source/version integrity", () => {
  it("plans a stable proposed identity without writes and is idempotent on the same source version", () => {
    const result = plan();
    expect(result.mode).toBe("READ_ONLY_DRY_RUN");
    expect(result.persistentWrites).toBe(0);
    expect(result.readyForApplication).toBe(true);
    expect(result.sourceVersionKey).toBe(`TEST_ONLY_SOURCE@TEST_ONLY_v1:${"a".repeat(64)}`);
    expect(result.units).toEqual([{
      gid: "stable-test-child-01",
      action: "CREATE_PROPOSED",
      nextVersion: 1,
      validationStatus: "PROPOSE",
      operationalStatus: "INACTIF",
      issueCodes: [],
    }]);

    const replay = plan({
      existing: [rootExisting, { ...candidate(), version: result.units[0].nextVersion }],
    });
    expect(replay.units[0]).toMatchObject({ action: "UNCHANGED", nextVersion: 1 });
  });

  it("keeps a stable GID and proposes a versioned update instead of overwriting", () => {
    const existing = { ...candidate({ name: "Old Synthetic Name" }), version: 4 };
    const result = plan({ existing: [rootExisting, existing] });
    expect(result.units[0]).toMatchObject({ gid: existing.gid, action: "UPDATE_CANDIDATE", nextVersion: 5 });
  });

  it("blocks unapproved, incomplete, or unverified sources without inventing a usable policy", () => {
    const result = plan({
      source: { ...source, verification: "NON_VERIFIE", completeness: "PARTIELLE" },
      sourceApprovedForImport: false,
    });
    expect(result.readyForApplication).toBe(false);
    expect(result.units[0]).toMatchObject({ action: "BLOCKED", validationStatus: "PROPOSE", operationalStatus: "INACTIF" });
    expect(new Set(result.issues.map((issue) => issue.code))).toEqual(new Set([
      "SOURCE_NOT_APPROVED", "SOURCE_NOT_COMPLETE", "SOURCE_NOT_VERIFIED",
    ]));
  });

  it("detects missing parents and unapproved hierarchy rules", () => {
    const missingParent = plan({ proposed: [candidate({ parentGid: "missing-parent" })] });
    expect(missingParent.units[0]).toMatchObject({ action: "BLOCKED", issueCodes: ["PARENT_NOT_FOUND"] });

    const unapprovedRule = plan({ parentRules: [] });
    expect(unapprovedRule.units[0]).toMatchObject({ action: "BLOCKED", issueCodes: ["PARENT_RULE_UNAPPROVED"] });
  });

  it("detects duplicate stable IDs, normalized siblings, and temporal-graph cycles", () => {
    const duplicates = plan({ proposed: [candidate(), candidate({ gid: "stable-test-child-02", name: "synthetic-child" })] });
    expect(duplicates.issues.map((issue) => issue.code)).toContain("DUPLICATE_SIBLING_NAME");
    const repeatedId = plan({ proposed: [candidate(), candidate()] });
    expect(repeatedId.issues.map((issue) => issue.code)).toContain("DUPLICATE_GID");

    const cycle = plan({
      existing: [{ ...candidate(), gid: "stable-test-root-01", typeCode: "TEST_ROOT", parentGid: "stable-test-child-01", version: 1 }],
    });
    expect(cycle.issues.map((issue) => issue.code)).toContain("INVALID_PARENT_CYCLE");
  });

  it("rejects a source-kind mismatch, bad source version, and legacy identity reassignment", () => {
    const wrongSourceKind = plan({ source: { ...source, kind: "OPERATIONAL" } });
    expect(wrongSourceKind.units[0].issueCodes).toContain("SOURCE_KIND_MISMATCH");

    const wrongVersion = plan({ proposed: [candidate({ sourceVersion: "OTHER_VERSION" })] });
    expect(wrongVersion.readyForApplication).toBe(false);
    expect(wrongVersion.issues.map((issue) => issue.code)).toContain("SOURCE_VERSION_MISMATCH");

    const incoming = candidate({ legacyTable: "departements", legacyId: "legacy-01" });
    const current = { ...incoming, gid: "stable-other-gid", version: 2 };
    const reassigned = plan({
      existing: [rootExisting, current],
      proposed: [incoming],
    });
    expect(reassigned.units[0].issueCodes).toContain("LEGACY_IDENTITY_CONFLICT");
  });
});
