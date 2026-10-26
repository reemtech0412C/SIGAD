import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { provinceSelectionnableDansCarte } from "../../frontend/src/components/pilote/carte-provinces-access.ts";
import { PROVINCES_TCHAD } from "../../frontend/src/data/provinces-tchad.ts";

const geojson = JSON.parse(readFileSync(new URL("../../frontend/public/data/tchad-admin1-ocha-v01.geojson", import.meta.url), "utf8"));
const manifeste = readFileSync(new URL("../../sources/referentiel-territorial/matching-cod-ab-adm1-ui-map-1.csv", import.meta.url), "utf8").trim().split(/\r?\n/);

describe("Référentiel cartographique des provinces", () => {
  it("relie exactement les 23 provinces SIGAD aux P-codes et noms ADM1 OCHA", () => {
    assert.equal(PROVINCES_TCHAD.length, 23);
    assert.equal(new Set(PROVINCES_TCHAD.map((province) => province.sigadId)).size, 23);
    assert.equal(new Set(PROVINCES_TCHAD.map((province) => province.pcode)).size, 23);
    assert.equal(geojson.features.length, 23);
    const sourceParCode = new Map(geojson.features.map((feature) => [feature.properties.adm1_pcode, feature.properties.adm1_name]));
    for (const province of PROVINCES_TCHAD) assert.equal(sourceParCode.get(province.pcode), province.nomOcha, province.sigadName);
  });

  it("conserve une ligne de preuve pour chaque identifiant SIGAD", () => {
    const entetes = manifeste[0]?.split(";");
    assert.deepEqual(entetes, ["SIGAD_ID", "SIGAD_NAME", "SOURCE_CODE", "SOURCE_NAME", "STATUS", "EVIDENCE"]);
    assert.equal(manifeste.length, 24);
    const lignes = manifeste.slice(1).map((ligne) => ligne.split(";"));
    assert.equal(new Set(lignes.map((ligne) => ligne[0])).size, 23);
    assert.ok(lignes.every((ligne) => ligne[4] === "VERIFIE_NOM_NORMALISE_ET_PCODE_OCHA" && ligne[5]?.includes("HDX ressource")));
  });

  it("limite la sélection d’un délégué provincial à la province de sa session", () => {
    assert.equal(provinceSelectionnableDansCarte("DELEGUE_PROVINCIAL", "prov-sila", "prov-sila"), true);
    assert.equal(provinceSelectionnableDansCarte("DELEGUE_PROVINCIAL", "prov-sila", "prov-ouaddai"), false);
    assert.equal(provinceSelectionnableDansCarte("DELEGUE_PROVINCIAL", null, "prov-sila"), false);
  });

  it("autorise le choix géographique aux rôles centraux sans attribuer de données opérationnelles", () => {
    assert.equal(provinceSelectionnableDansCarte("ADMIN_CENTRAL", null, "prov-ouaddai"), true);
    assert.equal(provinceSelectionnableDansCarte("PROPRIETAIRE", null, "prov-sila"), true);
  });
});
