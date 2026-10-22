import { zipSync } from "fflate";
import type {
  ResultatExportRapport,
  ValeurRapport,
} from "./rapports.service.ts";

export interface MetadonneesFichierRapport {
  reference: string;
  dateEmission: string;
  emisPar: string;
  version: string;
}

export interface FichierRapport {
  contenu: Uint8Array;
  typeMime: string;
  extension: "pdf" | "xlsx" | "csv";
}

const formatNombre = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 3,
});
const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Ndjamena",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function dateFrancaise(valeur: string | null): string {
  if (!valeur) return "Non renseignée";
  const date = new Date(`${valeur.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? valeur : formatDate.format(date);
}

function valeurFrancaise(valeur: ValeurRapport): string {
  if (valeur === null) return "";
  if (typeof valeur === "number") return formatNombre.format(valeur);
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(valeur)) return dateFrancaise(valeur);
  return valeur;
}

function protegerFormule(valeur: string): string {
  return /^[\s\uFEFF]*[=+@-]/u.test(valeur) ? `'${valeur}` : valeur;
}

function encodageCsv(valeur: string): string {
  const securisee = protegerFormule(valeur);
  return `"${securisee.replaceAll('"', '""')}"`;
}

function genererCsv(resultat: ResultatExportRapport, meta: MetadonneesFichierRapport): Uint8Array {
  const lignes = [
    ["Rapport", resultat.definition.intitule],
    ["Référence du rapport", meta.reference],
    ["Date d’émission", dateFrancaise(meta.dateEmission)],
    ["Période", `${dateFrancaise(resultat.filtres.date_debut ?? null)} au ${dateFrancaise(resultat.filtres.date_fin ?? null)}`],
    ["Périmètre géographique", resultat.contexte.province_nom ?? "National"],
    ["Référence opérationnelle", resultat.filtres.distribution_id ?? "Toutes les opérations filtrées"],
    ["Émis par", meta.emisPar],
    ["Version SIGAD", meta.version],
    ["Lignes exportées", String(resultat.elements.length)],
    ["Export limité", resultat.export_tronque ? "Oui, limite de sécurité atteinte" : "Non"],
    [],
    resultat.definition.colonnes.map((colonne) => colonne.libelle),
    ...resultat.elements.map((element) => resultat.definition.colonnes.map((colonne) => valeurFrancaise(element[colonne.cle] ?? null))),
  ];
  const contenu = `\uFEFFsep=;\r\n${lignes.map((ligne) => ligne.map(encodageCsv).join(";")).join("\r\n")}`;
  return new TextEncoder().encode(contenu);
}

function xml(valeur: string): string {
  return valeur.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function colonneExcel(index: number): string {
  let resultat = "";
  let restant = index + 1;
  while (restant > 0) {
    const chiffre = (restant - 1) % 26;
    resultat = String.fromCharCode(65 + chiffre) + resultat;
    restant = Math.floor((restant - 1) / 26);
  }
  return resultat;
}

function dateIso(valeur: string | null): string {
  return valeur ? valeur.slice(0, 10) : "";
}

function cellulesExcel(ligne: Array<string | number | null>, numero: number): string {
  const cellules = ligne.map((valeur, index) => {
    const adresse = `${colonneExcel(index)}${numero}`;
    if (typeof valeur === "number" && Number.isFinite(valeur)) {
      return `<c r="${adresse}" s="1"><v>${valeur}</v></c>`;
    }
    const texte = protegerFormule(typeof valeur === "string" ? valeur : valeur === null ? "" : String(valeur));
    return `<c r="${adresse}" t="inlineStr"><is><t xml:space="preserve">${xml(texte)}</t></is></c>`;
  }).join("");
  return `<row r="${numero}">${cellules}</row>`;
}

function genererExcel(resultat: ResultatExportRapport, meta: MetadonneesFichierRapport): Uint8Array {
  const lignes: Array<Array<string | number | null>> = [
    ["Rapport", resultat.definition.intitule],
    ["Référence du rapport", meta.reference],
    ["Date d’émission", dateFrancaise(meta.dateEmission)],
    ["Période", `${dateFrancaise(resultat.filtres.date_debut ?? null)} au ${dateFrancaise(resultat.filtres.date_fin ?? null)}`],
    ["Périmètre géographique", resultat.contexte.province_nom ?? "National"],
    ["Référence opérationnelle", resultat.filtres.distribution_id ?? "Toutes les opérations filtrées"],
    ["Émis par", meta.emisPar],
    ["Version SIGAD", meta.version],
    ["Lignes exportées", resultat.elements.length],
    ["Export limité", resultat.export_tronque ? "Oui, limite de sécurité atteinte" : "Non"],
    [],
    resultat.definition.colonnes.map((colonne) => colonne.libelle),
    ...resultat.elements.map((element) => resultat.definition.colonnes.map((colonne) => {
      const valeur = element[colonne.cle] ?? null;
      if (typeof valeur === "number") return valeur;
      if (typeof valeur === "string" && /^\d{4}-\d{2}-\d{2}/u.test(valeur)) return dateFrancaise(dateIso(valeur));
      return valeur;
    })),
  ];
  const lignesXml = lignes.map((ligne, index) => cellulesExcel(ligne, index + 1)).join("");
  const dernier = lignes.length;
  const dernierChamp = colonneExcel(Math.max(1, ...lignes.map((ligne) => ligne.length)) - 1);
  const feuille = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${dernierChamp}${dernier}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="12" topLeftCell="A13" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="${Math.max(2, resultat.definition.colonnes.length)}" width="24" customWidth="1"/></cols><sheetData>${lignesXml}</sheetData><autoFilter ref="A12:${dernierChamp}${dernier}"/></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rapport SIGAD" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const racine = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="# ##0,00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zipSync({
    "[Content_Types].xml": new TextEncoder().encode(contentTypes),
    "_rels/.rels": new TextEncoder().encode(racine),
    "xl/workbook.xml": new TextEncoder().encode(workbook),
    "xl/_rels/workbook.xml.rels": new TextEncoder().encode(workbookRels),
    "xl/worksheets/sheet1.xml": new TextEncoder().encode(feuille),
    "xl/styles.xml": new TextEncoder().encode(styles),
  }, { level: 6 });
}

const caracteresCp1252 = new Map<string, number>([
  ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85], ["†", 0x86],
  ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a], ["‹", 0x8b], ["Œ", 0x8c],
  ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95],
  ["–", 0x96], ["—", 0x97], ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b],
  ["œ", 0x9c], ["ž", 0x9e], ["Ÿ", 0x9f],
]);

function hexPdf(valeur: string): string {
  return Array.from(valeur, (caractere) => {
    const code = caractere.codePointAt(0) ?? 63;
    const octet = caracteresCp1252.get(caractere) ?? (code <= 0xff ? code : 63);
    return octet.toString(16).padStart(2, "0").toUpperCase();
  }).join("");
}

function envelopper(valeur: string, largeur: number): string[] {
  const mots = valeur.split(/\s+/u);
  const lignes: string[] = [];
  let courant = "";
  for (const mot of mots) {
    const morceaux = mot.match(new RegExp(`.{1,${largeur}}`, "gu")) ?? [""];
    for (const morceau of morceaux) {
      const prochain = courant ? `${courant} ${morceau}` : morceau;
      if (prochain.length > largeur && courant) { lignes.push(courant); courant = morceau; }
      else courant = prochain;
    }
  }
  if (courant) lignes.push(courant);
  return lignes.length ? lignes : [""];
}

function genererPdf(resultat: ResultatExportRapport, meta: MetadonneesFichierRapport): Uint8Array {
  const periode = `${dateFrancaise(resultat.filtres.date_debut ?? null)} au ${dateFrancaise(resultat.filtres.date_fin ?? null)}`;
  const portee = resultat.contexte.province_nom ?? "National";
  const lignesEntete: string[] = [
    `SIGAD — République du Tchad | ${resultat.definition.intitule}`,
    `Référence : ${meta.reference} | Émis le : ${dateFrancaise(meta.dateEmission)} | Version : ${meta.version}`,
    `Période : ${periode} | Périmètre : ${portee} | Émis par : ${meta.emisPar}`,
    `Référence opérationnelle : ${resultat.filtres.distribution_id ?? "Toutes les opérations filtrées"}`,
    `Lignes exportées : ${formatNombre.format(resultat.elements.length)}${resultat.export_tronque ? " | Export limité à 10 000 lignes" : ""}`,
    "",
    resultat.definition.colonnes.map((colonne) => colonne.libelle).join(" | "),
    "─".repeat(110),
  ];
  const lignesDonnees: string[] = [];
  for (const element of resultat.elements) {
    const cellule = resultat.definition.colonnes.map((colonne) => {
      const valeur = valeurFrancaise(element[colonne.cle] ?? null);
      return valeur.replaceAll("\n", " ").replaceAll("\r", " ");
    }).join(" | ");
    lignesDonnees.push(...envelopper(cellule, 110));
  }
  if (!resultat.elements.length) lignesDonnees.push("Aucune donnée ne correspond aux filtres sélectionnés.");
  const capacitePage = 35;
  const groupes: string[][] = [];
  for (let index = 0; index < lignesDonnees.length; index += capacitePage) {
    groupes.push([...lignesEntete, ...lignesDonnees.slice(index, index + capacitePage)]);
  }
  if (!groupes.length) groupes.push(lignesEntete);
  const nombrePages = Math.max(1, groupes.length);
  const objets: string[] = [];
  const pagesId: number[] = [];
  const fontId = 3;
  for (let index = 0; index < nombrePages; index += 1) pagesId.push(4 + index * 2);
  objets.push("<< /Type /Catalog /Pages 2 0 R >>");
  objets.push(`<< /Type /Pages /Count ${nombrePages} /Kids [${pagesId.map((id) => `${id} 0 R`).join(" ")}] >>`);
  objets.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  groupes.forEach((groupe, index) => {
    const pageId = pagesId[index] ?? 4 + index * 2;
    const contenuId = pageId + 1;
    const instructions = [
      "BT /F1 8 Tf 42 790 Td 12 TL",
      ...groupe.map((ligne) => `<${hexPdf(ligne)}> Tj T*`),
      `ET BT /F1 8 Tf 42 24 Td <${hexPdf(`SIGAD | ${meta.reference} | Page ${index + 1} / ${nombrePages}`)}> Tj ET`,
    ].join("\n");
    objets.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contenuId} 0 R >>`);
    objets.push(`<< /Length ${new TextEncoder().encode(instructions).length} >>\nstream\n${instructions}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objets.forEach((objet, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const debutXref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function creerFichierRapport(
  resultat: ResultatExportRapport,
  format: "PDF" | "EXCEL" | "CSV",
  meta: MetadonneesFichierRapport,
): FichierRapport {
  if (format === "CSV") return { contenu: genererCsv(resultat, meta), typeMime: "text/csv; charset=utf-8", extension: "csv" };
  if (format === "EXCEL") return { contenu: genererExcel(resultat, meta), typeMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  return { contenu: genererPdf(resultat, meta), typeMime: "application/pdf", extension: "pdf" };
}

export function protegerValeurCsv(valeur: string): string {
  return protegerFormule(valeur);
}
