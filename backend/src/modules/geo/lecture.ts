import { normaliserNomGeo } from "./arbre";
import type { GeoReadPage, GeoUnitRead } from "../../../../shared/types/geo";

/** Scope resolved by server authentication from the current legacy session. */
export type GeoReadScope =
  | { source: "LEGACY_SESSION"; mode: "NATIONAL" }
  | { source: "LEGACY_SESSION"; mode: "GIDS"; gids: readonly string[] };

export interface GeoReadStatement {
  bind(...values: unknown[]): GeoReadStatement;
  all<T>(): Promise<{ results?: T[] }>;
}

export interface GeoReadDatabase {
  prepare(query: string): GeoReadStatement;
}

export interface GeoReadOptions {
  limit?: number;
  afterGid?: string | null;
}

type GeoRow = {
  gid: string;
  type_code: string;
  famille: GeoUnitRead["family"];
  nom: string;
  nom_ar: string | null;
  statut_validation: GeoUnitRead["validationStatus"];
  statut_operationnel: GeoUnitRead["operationalStatus"];
  parent_gid: string | null;
  source_id: string | null;
  source_edition: string | null;
  date_reference: string | null;
  version: number;
};

function scopeSql(scope: GeoReadScope | null | undefined, alias = "u"): { sql: string; values: string[] } {
  if (!scope || scope.source !== "LEGACY_SESSION") return { sql: "0 = 1", values: [] };
  if (scope.mode === "NATIONAL") return { sql: "1 = 1", values: [] };
  if (scope.mode !== "GIDS" || !Array.isArray(scope.gids) || scope.gids.length === 0
    || scope.gids.some((gid) => typeof gid !== "string" || gid.trim().length === 0)) {
    return { sql: "0 = 1", values: [] };
  }
  const gids = [...new Set(scope.gids)];
  return { sql: `${alias}.gid IN (${gids.map(() => "?").join(", ")})`, values: gids };
}

function pageLimit(value: number | undefined): number {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("geo_invalid_page_limit");
  return value;
}

function toPage(rows: GeoRow[], limit: number): GeoReadPage<GeoUnitRead> {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    gid: row.gid,
    typeCode: row.type_code,
    family: row.famille,
    name: row.nom,
    nameAr: row.nom_ar,
    validationStatus: row.statut_validation,
    operationalStatus: row.statut_operationnel,
    parentGid: row.parent_gid,
    sourceId: row.source_id,
    sourceEdition: row.source_edition,
    referenceDate: row.date_reference,
    version: row.version,
  }));
  return { schemaVersion: 1, items, nextCursor: hasMore ? items.at(-1)?.gid ?? null : null };
}

const SELECT_UNIT = `SELECT u.gid, u.type_code, t.famille, u.nom, u.nom_ar,
  u.statut_validation, u.statut_operationnel, r.parent_gid, u.source_id,
  s.edition AS source_edition, u.date_reference, u.version
FROM geo_unites u
JOIN geo_types_unites t ON t.type_code = u.type_code
LEFT JOIN geo_sources s ON s.source_id = u.source_id
LEFT JOIN geo_rattachements r ON r.enfant_gid = u.gid AND r.statut = 'VALIDE'
  AND r.valide_au IS NULL AND r.valide_du <= date('now')`;

/** Exact authorized GIDs are applied to rows before pagination; no total count is exposed. */
export async function listerEnfantsGeo(
  db: GeoReadDatabase,
  parentGid: string,
  scope: GeoReadScope | null | undefined,
  options: GeoReadOptions = {},
): Promise<GeoReadPage<GeoUnitRead>> {
  const limit = pageLimit(options.limit);
  const allowed = scopeSql(scope);
  if (allowed.sql === "0 = 1") return { schemaVersion: 1, items: [], nextCursor: null };
  const cursorSql = options.afterGid ? " AND u.gid > ?" : "";
  const cursorValues = options.afterGid ? [options.afterGid] : [];
const statement = db.prepare(`${SELECT_UNIT}
JOIN geo_rattachements edge ON edge.enfant_gid = u.gid
WHERE edge.parent_gid = ? AND edge.statut = 'VALIDE' AND edge.valide_du <= date('now')
  AND (edge.valide_au IS NULL OR edge.valide_au > date('now'))
  AND u.statut_validation = 'VALIDE' AND ${allowed.sql}${cursorSql}
ORDER BY u.gid LIMIT ?`);
  const result = await statement.bind(parentGid, ...allowed.values, ...cursorValues, limit + 1).all<GeoRow>();
  return toPage(result.results ?? [], limit);
}

export async function rechercherUnitesGeo(
  db: GeoReadDatabase,
  query: string,
  scope: GeoReadScope | null | undefined,
  options: GeoReadOptions = {},
): Promise<GeoReadPage<GeoUnitRead>> {
  const normalized = normaliserNomGeo(query);
  const limit = pageLimit(options.limit);
  const allowed = scopeSql(scope);
  if (!normalized || allowed.sql === "0 = 1") return { schemaVersion: 1, items: [], nextCursor: null };
  const cursorSql = options.afterGid ? " AND u.gid > ?" : "";
  const cursorValues = options.afterGid ? [options.afterGid] : [];
  const pattern = `%${normalized.replace(/[\\%_]/gu, "\\$&")}%`;
  const statement = db.prepare(`${SELECT_UNIT}
WHERE u.statut_validation = 'VALIDE' AND ${allowed.sql}
  AND (u.nom_normalise LIKE ? ESCAPE '\\' OR EXISTS (
    SELECT 1 FROM geo_alias a WHERE a.gid = u.gid AND a.verifie_le IS NOT NULL
      AND a.nom_normalise LIKE ? ESCAPE '\\'
  ))${cursorSql}
ORDER BY u.gid LIMIT ?`);
  const result = await statement.bind(...allowed.values, pattern, pattern, ...cursorValues, limit + 1).all<GeoRow>();
  return toPage(result.results ?? [], limit);
}

export async function listerAncetresGeo(
  db: GeoReadDatabase,
  descendantGid: string,
  scope: GeoReadScope | null | undefined,
  options: GeoReadOptions = {},
): Promise<GeoReadPage<GeoUnitRead>> {
  const limit = pageLimit(options.limit);
  const allowed = scopeSql(scope, "u");
  if (allowed.sql === "0 = 1") return { schemaVersion: 1, items: [], nextCursor: null };
  const cursorSql = options.afterGid ? " AND u.gid > ?" : "";
  const cursorValues = options.afterGid ? [options.afterGid] : [];
  const statement = db.prepare(`${SELECT_UNIT}
JOIN geo_fermeture f ON f.ancetre_gid = u.gid
WHERE f.descendant_gid = ? AND u.statut_validation = 'VALIDE'
  AND ${allowed.sql}${cursorSql}
ORDER BY u.gid LIMIT ?`);
  const result = await statement.bind(descendantGid, ...allowed.values, ...cursorValues, limit + 1).all<GeoRow>();
  return toPage(result.results ?? [], limit);
}
