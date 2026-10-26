import { describe, expect, it } from "vitest";
import { runGeoSourceDryRun } from "../../docs/architecture-modernization/tools/b2-3-geo-source-dry-run.mjs";

const result = runGeoSourceDryRun();

describe("B2.3 geographic source preflight (read-only)", () => {
  it("does not write a persistent database or create target tables", () => {
    expect(result.mode).toBe("READ_ONLY_DRY_RUN");
    expect(result.persistentDatabaseWrites).toBe(0);
    expect(result.expectedIdentityImpact.targetTablesCreated).toBe(0);
    expect(result.expectedIdentityImpact.newUnitsInvented).toBe(0);
  });

  it("matches the 23 ADM1 source codes to existing SIGAD province IDs", () => {
    expect(result.sources.ochaCodAb.adm1).toBe(23);
    expect(result.sources.adm1Mapping.rows).toBe(23);
    expect(result.sources.adm1Mapping.duplicateSourceCodes).toBe(0);
    expect(result.sources.adm1Mapping.duplicateSigadIds).toBe(0);
    expect(result.sources.adm1Mapping.rowsMatchingLegacyAndOchaByIdPcodeAndNormalizedName).toBe(23);
  });

  it("surfaces the incomplete department sources and the OCHA parent integrity", () => {
    expect(result.sources.ochaCodAb.adm2).toBe(70);
    expect(result.sources.ochaCodAb.duplicateAdm2Pcodes).toBe(0);
    expect(result.sources.ochaCodAb.adm2ParentCodesNotInAdm1).toBe(0);
    expect(result.sources.inseedSilaExtract.rows).toBe(5);
    expect(result.sources.inseedSilaExtract.provinces).toEqual(["Sila"]);
    expect(result.legacyInMemory.counts.departements.count).toBe(112);
    expect(result.legacyInMemory.departmentValidation.reduce((sum, row) => sum + row.count, 0)).toBe(112);
    expect(result.legacyInMemory.departmentValidation.some((row) =>
      row.validation_administrative === "A_VERIFIER" && row.statut_validation === "VALIDE",
    )).toBe(true);
    expect(result.dryRunMatch.interpretation).toContain("not a legal department register");
  });

  it("preserves legacy IDs as candidate GIDs and reports relational/source gaps", () => {
    expect(result.legacyInMemory.counts.provinces.count).toBe(23);
    expect(result.legacyInMemory.totalUnits).toBe(165);
    expect(result.legacyInMemory.duplicateIdsAcrossUnitTables).toBe(0);
    expect(result.legacyInMemory.foreignKeyViolations).toBe(0);
    expect(result.expectedIdentityImpact.existingUnitIdsAvailableForGidPreservation).toBe(165);
    expect(result.legacyInMemory.unitsWithoutUnitLevelSourceReference.provinces).toBe(23);
  });
});
