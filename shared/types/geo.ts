/** Contrat de lecture versionné, sans données personnelles et indépendant des noms. */
export const GEO_SCHEMA_VERSION = 1 as const;

export type GeoFamily = "ADMINISTRATIVE" | "HUMANITAIRE" | "OPERATIONNELLE";
export type GeoValidationStatus = "PROPOSE" | "A_VERIFIER" | "VALIDE" | "ARCHIVE";
export type GeoOperationalStatus = "INACTIF" | "ACTIF" | "SUSPENDU" | "ARCHIVE";

export interface GeoUnitRead {
  gid: string;
  typeCode: string;
  family: GeoFamily;
  name: string;
  nameAr: string | null;
  validationStatus: GeoValidationStatus;
  operationalStatus: GeoOperationalStatus;
  parentGid: string | null;
  sourceId: string | null;
  sourceEdition: string | null;
  referenceDate: string | null;
  version: number;
}

/** `nextCursor` is an opaque stable GID cursor; no unscoped total is returned. */
export interface GeoReadPage<T> {
  schemaVersion: typeof GEO_SCHEMA_VERSION;
  items: readonly T[];
  nextCursor: string | null;
}

/** Opaque cursor may bind the authorized session scope; Android sends it back unchanged. */
export interface GeoDeltaCursor {
  schemaVersion: typeof GEO_SCHEMA_VERSION;
  opaqueCursor: string;
}

export interface GeoDeltaPage {
  schemaVersion: typeof GEO_SCHEMA_VERSION;
  changes: readonly GeoUnitRead[];
  nextCursor: GeoDeltaCursor;
  hasMore: boolean;
}
