import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  convertirDateExcel,
  lireFeuilleExcelMenages,
} from "../../backend/src/services/xlsx-menages.service.ts";

function creerClasseur(formule = false) {
  const chaines = ["departement_id", "nom_chef_menage", "sexe_chef", "nombre_personnes", "categorie_population_code", "date_enregistrement", "dep-sila", "Ménage test", "F", "AUTOCHTONE"];
  const xml = (contenu) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${contenu}`);
  const formuleCellule = formule ? "<f>1+2</f><v>3</v>" : "<v>3</v>";
  return zipSync({
    "[Content_Types].xml": xml("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>").slice(),
    "xl/workbook.xml": xml("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Ménages\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"),
    "xl/_rels/workbook.xml.rels": xml("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/></Relationships>"),
    "xl/sharedStrings.xml": xml(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${chaines.map((chaine) => `<si><t>${chaine}</t></si>`).join("")}</sst>`),
    "xl/worksheets/sheet1.xml": xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${chaines.slice(0, 6).map((_, index) => `<c r="${String.fromCharCode(65 + index)}1" t="s"><v>${index}</v></c>`).join("")}</row><row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c><c r="D2">${formuleCellule}</c><c r="E2" t="s"><v>9</v></c><c r="F2"><v>46317</v></c></row></sheetData></worksheet>`),
  });
}

describe("Import des classeurs Excel de ménages", () => {
  it("lit le premier onglet et conserve les colonnes et les valeurs", () => {
    const resultat = lireFeuilleExcelMenages(creerClasseur());
    assert.equal(resultat.date1904, false);
    assert.equal(resultat.lignes.length, 2);
    assert.deepEqual(resultat.lignes[0], ["departement_id", "nom_chef_menage", "sexe_chef", "nombre_personnes", "categorie_population_code", "date_enregistrement"]);
    assert.deepEqual(resultat.lignes[1], ["dep-sila", "Ménage test", "F", "3", "AUTOCHTONE", "46317"]);
  });

  it("convertit les dates Excel 1900 et 1904 au format administratif", () => {
    assert.equal(convertirDateExcel("46317", false), "2026-10-22");
    assert.equal(convertirDateExcel("44855", true), "2026-10-22");
    assert.equal(convertirDateExcel("2026-10-22", false), "2026-10-22");
  });

  it("refuse les cellules avec formule et les archives ZIP tronquées", () => {
    assert.throws(() => lireFeuilleExcelMenages(creerClasseur(true)), /cellules contenant une formule/u);
    assert.throws(() => lireFeuilleExcelMenages(new Uint8Array([1, 2, 3, 4])), /classeur Excel est invalide/u);
  });
});
