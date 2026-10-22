import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { creerFichierRapport, protegerValeurCsv } from "../../backend/src/services/rapports-export.service.ts";

function creerResultat(nombreLignes = 2) {
  const elements = Array.from({ length: nombreLignes }, (_, index) => ({
    code_menage: index === 0 ? "=HYPERLINK(\"https://exemple.invalid\")" : `MEN-${index}`,
    province: "Sila",
    nombre_personnes: 1234.5 + index,
  }));
  return {
    definition: {
      type: "LISTE_BENEFICIAIRES",
      intitule: "Liste des bénéficiaires",
      description: "Liste contrôlée",
      colonnes: [
        { cle: "code_menage", libelle: "Code du ménage" },
        { cle: "province", libelle: "Province" },
        { cle: "nombre_personnes", libelle: "Personnes enregistrées" },
      ],
      donneesSensibles: true,
      identifiantOperationRequis: false,
    },
    elements,
    lignes_totales_estimees: nombreLignes,
    export_tronque: false,
    contexte: { province_id: "prov-sila", province_nom: "Sila", perimetre: "PROVINCIAL" },
    filtres: { date_debut: "2026-10-01", date_fin: "2026-10-22" },
    lignes_lues: nombreLignes,
    duree_requetes_ms: 8,
  };
}

const meta = {
  reference: "rapport-test-001",
  dateEmission: "2026-10-22",
  emisPar: "Administrateur SIGAD",
  version: "SIGAD 3.0",
};

describe("Exports administratifs des rapports", () => {
  it("protège les cellules CSV et applique le format numérique français", () => {
    const fichier = creerFichierRapport(creerResultat(), "CSV", meta);
    const contenu = new TextDecoder().decode(fichier.contenu);
    assert.equal(fichier.extension, "csv");
    assert.match(contenu, /sep=;/u);
    assert.match(contenu, /'=HYPERLINK/u);
    assert.match(contenu, /1\u202f234,5/u);
    assert.equal(protegerValeurCsv("\t=2+2"), "'\t=2+2");
    assert.equal(protegerValeurCsv("-12"), "'-12");
    assert.equal(protegerValeurCsv("Sila"), "Sila");
  });

  it("produit un classeur XLSX valide sans formules provenant des données", () => {
    const fichier = creerFichierRapport(creerResultat(), "EXCEL", meta);
    const archive = unzipSync(fichier.contenu);
    const feuille = strFromU8(archive["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
    assert.equal(fichier.extension, "xlsx");
    assert.match(strFromU8(archive["xl/workbook.xml"] ?? new Uint8Array()), /name="Rapport SIGAD"/u);
    assert.match(feuille, /&apos;=HYPERLINK/u);
    assert.doesNotMatch(feuille, /<f(?:\s|>)/u);
    assert.match(strFromU8(archive["xl/styles.xml"] ?? new Uint8Array()), /# ##0,00/u);
  });

  it("répète les références et numérote toutes les pages du PDF", () => {
    const fichier = creerFichierRapport(creerResultat(80), "PDF", meta);
    const contenu = new TextDecoder().decode(fichier.contenu);
    const pages = Number(contenu.match(/\/Count (\d+)/u)?.[1] ?? "0");
    assert.equal(fichier.extension, "pdf");
    assert.ok(pages >= 3);
    assert.match(contenu, /506167652031202F20/u);
    assert.match(contenu, /506167652032202F20/u);
    assert.match(contenu, /726170706F72742D746573742D303031/u);
  });
});
