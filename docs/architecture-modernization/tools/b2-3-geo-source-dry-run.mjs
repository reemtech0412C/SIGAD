// B2.3 preflight only: reads checked-in source files and rebuilds the legacy
// schema in SQLite memory. It never writes to a project or persistent database.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const root = resolve(import.meta.dirname, "..", "..", "..");
const sourceDir = join(root, "sources", "referentiel-territorial");
const tables = [
  "provinces", "departements", "sous_prefectures", "communes", "cantons",
  "arrondissements", "quartiers", "carres", "localites", "sites_humanitaires",
];
const unitNameParents = {
  provinces: null,
  departements: "province_id",
  arrondissements: "localite_id",
  quartiers: "arrondissement_id",
  carres: "quartier_id",
  localites: "province_id",
  sites_humanitaires: "province_id",
};

function parseSemicolonCsv(text) {
  const lines = text.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(Boolean);
  const parseLine = (line) => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ";" && !quoted) {
        cells.push(cell); cell = "";
      } else cell += char;
    }
    cells.push(cell);
    return cells;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(
    parseLine(line).map((value, index) => [header[index], value]),
  ));
}

const normalize = (value) => String(value ?? "")
  .normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLocaleUpperCase("fr-FR").replace(/[^A-Z0-9]+/gu, " ").trim();

function countBy(table, rows) {
  const count = (sql) => rows.filter((row) => row[sql] != null && String(row[sql]).trim() !== "").length;
  const metadataColumns = ["source_officielle", "source_documentation", "reference_juridique"]
    .filter((column) => table.columns.includes(column));
  return {
    count: rows.length,
    metadataColumns,
    withoutSourceReference: metadataColumns.length
      ? rows.filter((row) => !metadataColumns.some((column) => count.call(null, column) && row[column]?.trim())).length
      : rows.length,
  };
}

export function runGeoSourceDryRun() {
  const db = new DatabaseSync(":memory:");
  const migrationsDir = join(root, "migrations");
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  const legacy = {};
  const rowsByTable = {};
  const ids = [];
  for (const name of tables) {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name);
    const rows = db.prepare(`SELECT * FROM ${name}`).all();
    rowsByTable[name] = rows;
    legacy[name] = countBy({ columns }, rows);
    ids.push(...rows.map((row) => row.id));
  }

  const metadata = JSON.parse(readFileSync(join(sourceDir, "ocha-cod-ab", "metadata-hdx-package.json"), "utf8"));
  const adm1 = JSON.parse(readFileSync(join(sourceDir, "ocha-cod-ab", "tcd_admin1.geojson"), "utf8")).features;
  const zip = unzipSync(readFileSync(join(sourceDir, "ocha-cod-ab", "tcd_admin_boundaries.geojson.zip")));
  const adm2 = JSON.parse(strFromU8(zip["tcd_admin2.geojson"])).features;
  const mapping = parseSemicolonCsv(readFileSync(join(sourceDir, "matching-cod-ab-adm1-ui-map-1.csv"), "utf8"));
  const inseedDepartments = parseSemicolonCsv(readFileSync(join(sourceDir, "departements-sila-inseed-2024.csv"), "utf8"));
  const communesLoi015 = parseSemicolonCsv(readFileSync(join(sourceDir, "communes-loi-015-2024.csv"), "utf8"));

  const byId = new Map(rowsByTable.provinces.map((row) => [row.id, row]));
  const mappingByPcode = new Map(mapping.map((row) => [row.SOURCE_CODE, row]));
  const adm1ByPcode = new Map(adm1.map((feature) => [feature.properties.adm1_pcode, feature.properties]));
  const duplicateValues = (values) => values.length - new Set(values).size;
  const provinceMatches = mapping.filter((row) => {
    const local = byId.get(row.SIGAD_ID);
    const source = adm1ByPcode.get(row.SOURCE_CODE);
    return local && source && normalize(local.nom) === normalize(row.SIGAD_NAME)
      && normalize(source.adm1_name) === normalize(row.SOURCE_NAME);
  }).length;
  const pcodeToProvinceId = new Map(mapping.map((row) => [row.SOURCE_CODE, row.SIGAD_ID]));
  const currentDeptKeys = new Set(rowsByTable.departements.map((row) => `${row.province_id}|${normalize(row.nom)}`));
  const adm2Keys = adm2.map((feature) => {
    const properties = feature.properties;
    const provinceId = pcodeToProvinceId.get(properties.adm1_pcode);
    return { provinceId, name: normalize(properties.adm2_name), pcode: properties.adm2_pcode };
  });
  const departmentMatches = adm2Keys.filter((row) => row.provinceId && currentDeptKeys.has(`${row.provinceId}|${row.name}`)).length;
  const duplicateScopedNames = Object.fromEntries(Object.entries(unitNameParents).map(([table, parentColumn]) => {
    const keys = rowsByTable[table].map((row) =>
      `${parentColumn ? row[parentColumn] ?? "<NULL>" : "<ROOT>"}|${normalize(row.nom)}`,
    );
    return [table, duplicateValues(keys)];
  }));
  const duplicateOchaAdm2NamesWithinParent = duplicateValues(adm2Keys.map((row) => `${row.provinceId ?? "<UNMAPPED>"}|${row.name}`));
  const existingRelationCounts = {};
  for (const table of tables) {
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${table})`).all()) {
      const column = String(fk.from);
      existingRelationCounts[`${table}.${column}`] = rowsByTable[table]
        .filter((row) => row[column] != null && String(row[column]).trim() !== "").length;
    }
  }
  const localDeptNames = new Map();
  for (const row of rowsByTable.departements) {
    const name = normalize(row.nom);
    localDeptNames.set(name, [...(localDeptNames.get(name) ?? []), row]);
  }
  const sameNameDifferentParentCandidates = adm2Keys.filter((source) => {
    if (!source.provinceId) return false;
    return (localDeptNames.get(source.name) ?? []).some((local) => local.province_id !== source.provinceId);
  }).length;
  const legacyForeignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  const statusSummary = (key) => Object.fromEntries(
    [...new Set(inseedDepartments.map((row) => row[key]).filter(Boolean))]
      .map((value) => [value, inseedDepartments.filter((row) => row[key] === value).length]),
  );

  const result = {
    mode: "READ_ONLY_DRY_RUN",
    runAt: new Date().toISOString(),
    persistentDatabaseWrites: 0,
    migrationsApplied: "in-memory only, to reconstruct current repository state",
    sources: {
      ochaCodAb: {
        title: metadata.title,
        license: metadata.license_title,
        datasetDate: metadata.dataset_date,
        metadataModified: metadata.metadata_modified,
        adm1: adm1.length,
        adm2: adm2.length,
        uniqueAdm1Pcodes: new Set(adm1.map((row) => row.properties.adm1_pcode)).size,
        duplicateAdm1Pcodes: duplicateValues(adm1.map((row) => row.properties.adm1_pcode)),
        duplicateAdm2Pcodes: duplicateValues(adm2.map((row) => row.properties.adm2_pcode)),
        duplicateAdm2NamesWithinMappedParent: duplicateOchaAdm2NamesWithinParent,
        adm2ParentCodesNotInAdm1: adm2.filter((row) => !adm1ByPcode.has(row.properties.adm1_pcode)).length,
      },
      inseedSilaExtract: {
        rows: inseedDepartments.length,
        provinces: [...new Set(inseedDepartments.map((row) => row.province_source))],
        documentaryStatus: statusSummary("verification_documentaire"),
        operationalDecision: statusSummary("decision_operationnelle"),
      },
      loi015CommunesTranscription: { rows: communesLoi015.length, sourceLevel: "communes/collectivités autonomes" },
      adm1Mapping: {
        rows: mapping.length,
        duplicateSourceCodes: duplicateValues(mapping.map((row) => row.SOURCE_CODE)),
        duplicateSigadIds: duplicateValues(mapping.map((row) => row.SIGAD_ID)),
        rowsMatchingLegacyAndOchaByIdPcodeAndNormalizedName: provinceMatches,
      },
    },
    legacyInMemory: {
      counts: legacy,
      departmentValidation: db.prepare(`
        SELECT validation_administrative, validation_rattachement, statut_validation,
               statut_operationnel, COUNT(*) AS count
        FROM departements
        GROUP BY 1, 2, 3, 4
        ORDER BY 1, 2, 3, 4
      `).all(),
      totalUnits: Object.values(legacy).reduce((sum, value) => sum + value.count, 0),
      duplicateIdsAcrossUnitTables: duplicateValues(ids),
      duplicateNormalizedNamesWithinRecordedParent: duplicateScopedNames,
      populatedLegacyRelationColumns: existingRelationCounts,
      foreignKeyViolations: legacyForeignKeyViolations.length,
      unitsWithoutUnitLevelSourceReference: Object.fromEntries(
        Object.entries(legacy).filter(([, value]) => value.count).map(([name, value]) => [name, value.withoutSourceReference]),
      ),
    },
    dryRunMatch: {
      ochaAdm2MatchedByNormalizedNameAndMappedProvince: departmentMatches,
      ochaAdm2Unmatched: adm2.length - departmentMatches,
      localDepartmentsNotMatchedToOchaAdm2: rowsByTable.departements.length - departmentMatches,
      sameNameDifferentParentCandidates,
      unmappedAdm2Parents: adm2Keys.filter((row) => !row.provinceId).length,
      interpretation: "name matching is diagnostic only; OCHA ADM2 is not a legal department register",
    },
    expectedIdentityImpact: {
      existingUnitIdsAvailableForGidPreservation: ids.length,
      existingForeignKeysChanged: 0,
      newUnitsInvented: 0,
      targetTablesCreated: 0,
    },
  };
  db.close();
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(runGeoSourceDryRun(), null, 2));
}
