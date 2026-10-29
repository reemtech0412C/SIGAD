import { normaliserNomGeo } from "./arbre";

export type GeoImportFamily = "ADMINISTRATIVE" | "HUMANITAIRE" | "OPERATIONNELLE";
export type GeoSourceKind = "LEGAL" | "STATISTICAL" | "BOUNDARY" | "OPERATIONAL" | "LEGACY" | "TEST";

export interface GeoImportSource {
  readonly sourceId: string;
  readonly kind: GeoSourceKind;
  readonly edition: string;
  readonly sha256: string;
  readonly completeness: "INCONNUE" | "PARTIELLE" | "COMPLETE";
  readonly verification: "NON_VERIFIE" | "VERIFIE" | "REJETE";
}

export interface GeoImportType {
  readonly code: string;
  readonly family: GeoImportFamily;
  readonly parentRequired: boolean;
  readonly rootAllowed: boolean;
}

export interface GeoImportParentRule {
  readonly childType: string;
  readonly parentType: string;
  readonly approved: boolean;
}

export interface GeoImportUnit {
  /** Stable external/current GID. It is never derived from the unit name. */
  readonly gid: string;
  readonly typeCode: string;
  readonly name: string;
  readonly parentGid: string | null;
  readonly sourceCitation: string;
  readonly referenceDate: string;
  readonly sourceVersion: string;
  readonly legacyTable?: string | null;
  readonly legacyId?: string | null;
}

export interface GeoExistingUnit extends GeoImportUnit {
  readonly version: number;
}

export interface GeoImportPlanInput {
  readonly source: GeoImportSource;
  readonly types: readonly GeoImportType[];
  readonly parentRules: readonly GeoImportParentRule[];
  readonly existing: readonly GeoExistingUnit[];
  readonly proposed: readonly GeoImportUnit[];
  /** Set only after the competent authority and the source scope are approved. */
  readonly sourceApprovedForImport: boolean;
}

export type GeoImportIssueCode =
  | "SOURCE_METADATA_INVALID"
  | "SOURCE_VERSION_MISMATCH"
  | "SOURCE_NOT_APPROVED"
  | "SOURCE_NOT_VERIFIED"
  | "SOURCE_NOT_COMPLETE"
  | "SOURCE_KIND_MISMATCH"
  | "DUPLICATE_GID"
  | "UNKNOWN_TYPE"
  | "INVALID_UNIT"
  | "PARENT_REQUIRED"
  | "PARENT_NOT_FOUND"
  | "PARENT_RULE_UNAPPROVED"
  | "DUPLICATE_SIBLING_NAME"
  | "INVALID_PARENT_CYCLE"
  | "LEGACY_IDENTITY_CONFLICT";

export interface GeoImportIssue {
  readonly code: GeoImportIssueCode;
  readonly gid?: string;
  readonly relatedGid?: string;
}

export interface GeoImportPlannedUnit {
  readonly gid: string;
  readonly action: "CREATE_PROPOSED" | "UPDATE_CANDIDATE" | "UNCHANGED" | "BLOCKED";
  readonly nextVersion: number;
  readonly validationStatus: "PROPOSE";
  readonly operationalStatus: "INACTIF";
  readonly issueCodes: readonly GeoImportIssueCode[];
}

export interface GeoImportPlan {
  readonly mode: "READ_ONLY_DRY_RUN";
  readonly sourceId: string;
  readonly sourceEdition: string;
  readonly sourceSha256: string;
  readonly sourceVersionKey: string;
  readonly persistentWrites: 0;
  readonly readyForApplication: boolean;
  readonly totals: Readonly<Record<GeoImportPlannedUnit["action"], number>>;
  readonly issues: readonly GeoImportIssue[];
  readonly units: readonly GeoImportPlannedUnit[];
}

const EMPTY_TOTALS = {
  CREATE_PROPOSED: 0,
  UPDATE_CANDIDATE: 0,
  UNCHANGED: 0,
  BLOCKED: 0,
} as const;

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/iu.test(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function sourceKindMatchesFamily(kind: GeoSourceKind, family: GeoImportFamily): boolean {
  if (family === "ADMINISTRATIVE") return kind === "LEGAL";
  return kind === "OPERATIONAL";
}

function sameImportContent(left: GeoImportUnit, right: GeoImportUnit): boolean {
  return left.typeCode === right.typeCode
    && left.name.trim() === right.name.trim()
    && left.parentGid === right.parentGid
    && left.sourceCitation.trim() === right.sourceCitation.trim()
    && left.referenceDate === right.referenceDate
    && left.sourceVersion === right.sourceVersion
    && (left.legacyTable ?? null) === (right.legacyTable ?? null)
    && (left.legacyId ?? null) === (right.legacyId ?? null);
}

/**
 * Produces an immutable, read-only plan for a candidate geography source.
 * It never writes to D1. Unapproved/unverified data cannot yield an applicable plan,
 * and every planned new unit remains PROPOSE / INACTIF.
 */
export function planifierImportGeo(input: GeoImportPlanInput): GeoImportPlan {
  const issues: GeoImportIssue[] = [];
  const typesByCode = new Map(input.types.map((type) => [type.code, type]));
  const existingByGid = new Map(input.existing.map((unit) => [unit.gid, unit]));
  const existingByLegacyIdentity = new Map(input.existing
    .filter((unit) => unit.legacyTable && unit.legacyId)
    .map((unit) => [`${unit.legacyTable}|${unit.legacyId}`, unit]));
  const proposedByGid = new Map<string, GeoImportUnit>();
  const issueIndexes = new Map<string, Set<GeoImportIssueCode>>();

  const addIssue = (code: GeoImportIssueCode, gid?: string, relatedGid?: string) => {
    issues.push({ code, ...(gid ? { gid } : {}), ...(relatedGid ? { relatedGid } : {}) });
    if (gid) {
      const codes = issueIndexes.get(gid) ?? new Set<GeoImportIssueCode>();
      codes.add(code);
      issueIndexes.set(gid, codes);
    }
  };

  if (!input.source.sourceId.trim() || !input.source.edition.trim() || !isSha256(input.source.sha256)) {
    addIssue("SOURCE_METADATA_INVALID");
  }
  if (input.proposed.some((unit) => unit.sourceVersion !== input.source.edition)) {
    addIssue("SOURCE_VERSION_MISMATCH");
  }
  if (!input.sourceApprovedForImport) addIssue("SOURCE_NOT_APPROVED");
  if (input.source.verification !== "VERIFIE") addIssue("SOURCE_NOT_VERIFIED");
  if (input.source.completeness !== "COMPLETE") addIssue("SOURCE_NOT_COMPLETE");

  const seen = new Set<string>();
  for (const unit of input.proposed) {
    if (seen.has(unit.gid)) addIssue("DUPLICATE_GID", unit.gid);
    seen.add(unit.gid);
    proposedByGid.set(unit.gid, unit);
    if (!unit.gid.trim() || !unit.name.trim() || !normaliserNomGeo(unit.name)
      || !unit.sourceCitation.trim() || !unit.sourceVersion.trim()
      || !isIsoDate(unit.referenceDate)) {
      addIssue("INVALID_UNIT", unit.gid || undefined);
    }
    if (existingByGid.has(unit.gid)) {
      const existing = existingByGid.get(unit.gid)!;
      if ((unit.legacyTable ?? null) !== (existing.legacyTable ?? null)
        || (unit.legacyId ?? null) !== (existing.legacyId ?? null)) {
        addIssue("LEGACY_IDENTITY_CONFLICT", unit.gid);
      }
    }
    if (unit.legacyTable && unit.legacyId) {
      const sameLegacyIdentity = existingByLegacyIdentity.get(`${unit.legacyTable}|${unit.legacyId}`);
      if (sameLegacyIdentity && sameLegacyIdentity.gid !== unit.gid) {
        addIssue("LEGACY_IDENTITY_CONFLICT", unit.gid, sameLegacyIdentity.gid);
      }
    }
  }

  const unitFor = (gid: string) => proposedByGid.get(gid) ?? existingByGid.get(gid);
  const parentFor = (gid: string) => {
    const candidate = proposedByGid.get(gid);
    return candidate ? candidate.parentGid : existingByGid.get(gid)?.parentGid ?? null;
  };

  for (const unit of input.proposed) {
    const type = typesByCode.get(unit.typeCode);
    if (!type) {
      addIssue("UNKNOWN_TYPE", unit.gid);
      continue;
    }
    if (!sourceKindMatchesFamily(input.source.kind, type.family)) addIssue("SOURCE_KIND_MISMATCH", unit.gid);

    if (unit.parentGid === null) {
      if (type.parentRequired || !type.rootAllowed) addIssue("PARENT_REQUIRED", unit.gid);
      continue;
    }

    const parent = unitFor(unit.parentGid);
    if (!parent) {
      addIssue("PARENT_NOT_FOUND", unit.gid, unit.parentGid);
      continue;
    }
    if (!input.parentRules.some((rule) => rule.approved
      && rule.childType === unit.typeCode && rule.parentType === parent.typeCode)) {
      addIssue("PARENT_RULE_UNAPPROVED", unit.gid, unit.parentGid);
    }
  }

  const siblingKeys = new Map<string, string>();
  for (const unit of input.existing) {
    siblingKeys.set(`${unit.parentGid ?? "<ROOT>"}|${unit.typeCode}|${normaliserNomGeo(unit.name)}`, unit.gid);
  }
  for (const unit of input.proposed) {
    const key = `${unit.parentGid ?? "<ROOT>"}|${unit.typeCode}|${normaliserNomGeo(unit.name)}`;
    const prior = siblingKeys.get(key);
    if (prior && prior !== unit.gid) addIssue("DUPLICATE_SIBLING_NAME", unit.gid, prior);
    else siblingKeys.set(key, unit.gid);
  }

  for (const unit of input.proposed) {
    const visited = new Set<string>([unit.gid]);
    let parentGid = unit.parentGid;
    while (parentGid) {
      if (visited.has(parentGid)) {
        addIssue("INVALID_PARENT_CYCLE", unit.gid, parentGid);
        break;
      }
      visited.add(parentGid);
      parentGid = parentFor(parentGid);
    }
  }

  const globalBlockers = new Set<GeoImportIssueCode>([
    "SOURCE_METADATA_INVALID", "SOURCE_VERSION_MISMATCH", "SOURCE_NOT_APPROVED", "SOURCE_NOT_VERIFIED", "SOURCE_NOT_COMPLETE",
  ]);
  const totals = { ...EMPTY_TOTALS };
  const units = input.proposed.map((unit): GeoImportPlannedUnit => {
    const existing = existingByGid.get(unit.gid);
    const unitIssues = [...(issueIndexes.get(unit.gid) ?? [])];
    const hasGlobalBlocker = issues.some((issue) => globalBlockers.has(issue.code));
    const blocked = hasGlobalBlocker || unitIssues.length > 0;
    const action: GeoImportPlannedUnit["action"] = blocked
      ? "BLOCKED"
      : !existing
        ? "CREATE_PROPOSED"
        : sameImportContent(existing, unit)
          ? "UNCHANGED"
          : "UPDATE_CANDIDATE";
    totals[action] += 1;
    return {
      gid: unit.gid,
      action,
      nextVersion: existing ? existing.version + (sameImportContent(existing, unit) ? 0 : 1) : 1,
      validationStatus: "PROPOSE",
      operationalStatus: "INACTIF",
      issueCodes: unitIssues.sort(),
    };
  });

  // Existing legacy parents may be supplied by a later proposed unit; all cycle
  // checks use the combined candidate/existing graph without changing GIDs.
  const sortedIssues = issues.sort((a, b) => (a.gid ?? "").localeCompare(b.gid ?? "")
    || a.code.localeCompare(b.code) || (a.relatedGid ?? "").localeCompare(b.relatedGid ?? ""));

  return {
    mode: "READ_ONLY_DRY_RUN",
    sourceId: input.source.sourceId,
    sourceEdition: input.source.edition,
    sourceSha256: input.source.sha256.toLowerCase(),
    sourceVersionKey: `${input.source.sourceId}@${input.source.edition}:${input.source.sha256.toLowerCase()}`,
    persistentWrites: 0,
    readyForApplication: input.sourceApprovedForImport && input.source.verification === "VERIFIE"
      && input.source.completeness === "COMPLETE" && sortedIssues.length === 0,
    totals,
    issues: sortedIssues,
    units,
  };
}
