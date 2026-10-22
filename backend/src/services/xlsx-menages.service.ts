import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const TAILLE_MAXIMALE_ARCHIVE = 1_048_576;
const TAILLE_MAXIMALE_DECOMPRESSEE = 8 * 1_048_576;
const TAILLE_MAXIMALE_XML = 4 * 1_048_576;
const NOMBRE_MAXIMAL_ENTREES = 128;
const NOMBRE_MAXIMAL_LIGNES = 501;

type ObjetXml = Record<string, unknown>;

export interface FeuilleMenagesExcel {
  lignes: string[][];
  date1904: boolean;
}

interface EntreeZipControlee {
  nom: string;
  tailleCompressee: number;
  tailleDecompressee: number;
  offsetEnteteLocale: number;
  methode: number;
}

function erreurClasseur(message: string): Error {
  return new Error(`Le classeur Excel est invalide : ${message}`);
}

function lireUint16(vue: DataView, position: number): number {
  if (position < 0 || position + 2 > vue.byteLength) throw erreurClasseur("l’archive ZIP est tronquée.");
  return vue.getUint16(position, true);
}

function lireUint32(vue: DataView, position: number): number {
  if (position < 0 || position + 4 > vue.byteLength) throw erreurClasseur("l’archive ZIP est tronquée.");
  return vue.getUint32(position, true);
}

function verifierArchiveZip(octets: Uint8Array): EntreeZipControlee[] {
  if (octets.byteLength < 22 || octets.byteLength > TAILLE_MAXIMALE_ARCHIVE) {
    throw erreurClasseur("la taille doit être comprise entre 22 octets et 1 Mo.");
  }
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const debutRecherche = Math.max(0, octets.byteLength - 65_557);
  let finArchive = -1;
  for (let position = octets.byteLength - 22; position >= debutRecherche; position -= 1) {
    if (lireUint32(vue, position) === 0x06054b50) {
      finArchive = position;
      break;
    }
  }
  if (finArchive < 0) throw erreurClasseur("la fin de l’archive ZIP est absente.");

  const longueurCommentaire = lireUint16(vue, finArchive + 20);
  if (finArchive + 22 + longueurCommentaire !== octets.byteLength) {
    throw erreurClasseur("la structure de fin de l’archive ZIP est incohérente.");
  }
  const disque = lireUint16(vue, finArchive + 4);
  const disqueRepertoire = lireUint16(vue, finArchive + 6);
  const entreesDisque = lireUint16(vue, finArchive + 8);
  const nombreEntrees = lireUint16(vue, finArchive + 10);
  const tailleRepertoire = lireUint32(vue, finArchive + 12);
  const offsetRepertoire = lireUint32(vue, finArchive + 16);
  if (disque !== 0 || disqueRepertoire !== 0 || entreesDisque !== nombreEntrees ||
      nombreEntrees === 0 || nombreEntrees > NOMBRE_MAXIMAL_ENTREES ||
      nombreEntrees === 0xffff || tailleRepertoire === 0xffffffff || offsetRepertoire === 0xffffffff ||
      offsetRepertoire + tailleRepertoire > finArchive) {
    throw erreurClasseur("l’archive multi-disque, ZIP64 ou trop volumineuse n’est pas acceptée.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entrees: EntreeZipControlee[] = [];
  const noms = new Set<string>();
  let position = offsetRepertoire;
  let tailleTotaleDecompressee = 0;
  for (let index = 0; index < nombreEntrees; index += 1) {
    if (lireUint32(vue, position) !== 0x02014b50) throw erreurClasseur("le répertoire central ZIP est invalide.");
    const indicateurs = lireUint16(vue, position + 8);
    const methode = lireUint16(vue, position + 10);
    const tailleCompressee = lireUint32(vue, position + 20);
    const tailleDecompressee = lireUint32(vue, position + 24);
    const longueurNom = lireUint16(vue, position + 28);
    const longueurExtra = lireUint16(vue, position + 30);
    const longueurCommentaireEntree = lireUint16(vue, position + 32);
    const offsetEnteteLocale = lireUint32(vue, position + 42);
    const finEntree = position + 46 + longueurNom + longueurExtra + longueurCommentaireEntree;
    if (finEntree > offsetRepertoire + tailleRepertoire || tailleCompressee === 0xffffffff ||
        tailleDecompressee === 0xffffffff || offsetEnteteLocale === 0xffffffff ||
        (indicateurs & 0x0001) !== 0 || (indicateurs & 0x0040) !== 0 ||
        (methode !== 0 && methode !== 8) || tailleCompressee > octets.byteLength ||
        tailleDecompressee > TAILLE_MAXIMALE_XML) {
      throw erreurClasseur("une entrée est chiffrée, tronquée, ZIP64 ou utilise une compression non prise en charge.");
    }
    let nom: string;
    try {
      nom = decoder.decode(octets.subarray(position + 46, position + 46 + longueurNom));
    } catch {
      throw erreurClasseur("un nom de fichier ZIP n’est pas encodé en UTF-8.");
    }
    if (!nom || nom.startsWith("/") || nom.includes("\\") || nom.split("/").includes("..") || noms.has(nom)) {
      throw erreurClasseur("un chemin de fichier ZIP est invalide ou répété.");
    }
    noms.add(nom);
    tailleTotaleDecompressee += tailleDecompressee;
    if (tailleTotaleDecompressee > TAILLE_MAXIMALE_DECOMPRESSEE) {
      throw erreurClasseur("le contenu décompressé dépasse 8 Mo.");
    }

    if (lireUint32(vue, offsetEnteteLocale) !== 0x04034b50) throw erreurClasseur("une entrée locale ZIP est invalide.");
    const longueurNomLocal = lireUint16(vue, offsetEnteteLocale + 26);
    const longueurExtraLocale = lireUint16(vue, offsetEnteteLocale + 28);
    const debutDonnees = offsetEnteteLocale + 30 + longueurNomLocal + longueurExtraLocale;
    if (debutDonnees + tailleCompressee > octets.byteLength) throw erreurClasseur("une entrée dépasse les limites de l’archive.");
    entrees.push({ nom, tailleCompressee, tailleDecompressee, offsetEnteteLocale, methode });
    position = finEntree;
  }
  if (position !== offsetRepertoire + tailleRepertoire) throw erreurClasseur("le répertoire central ZIP comporte des données inattendues.");
  return entrees;
}

function estObjetXml(valeur: unknown): valeur is ObjetXml {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function propriete(valeur: unknown, nom: string): unknown {
  if (!estObjetXml(valeur)) return undefined;
  return Object.getOwnPropertyDescriptor(valeur, nom)?.value;
}

function elements(valeur: unknown, nom: string): ObjetXml[] {
  const enfant = propriete(valeur, nom);
  if (Array.isArray(enfant)) return enfant.filter(estObjetXml);
  return estObjetXml(enfant) ? [enfant] : [];
}

function texteXml(valeur: unknown): string {
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "number" || typeof valeur === "boolean") return String(valeur);
  const texte = propriete(valeur, "#text");
  return typeof texte === "string" || typeof texte === "number" ? String(texte) : "";
}

function textesRiches(valeur: unknown, resultat: string[] = []): string[] {
  if (typeof valeur === "string" || typeof valeur === "number") {
    resultat.push(String(valeur));
  } else if (Array.isArray(valeur)) {
    for (const enfant of valeur) textesRiches(enfant, resultat);
  } else if (estObjetXml(valeur)) {
    const texte = propriete(valeur, "#text");
    if (typeof texte === "string" || typeof texte === "number") resultat.push(String(texte));
    for (const [nom, enfant] of Object.entries(valeur)) {
      if (!nom.startsWith("@_") && nom !== "#text" && nom !== "rPh" && nom !== "phoneticPr") {
        textesRiches(enfant, resultat);
      }
    }
  }
  return resultat;
}

function analyserXml(octets: Uint8Array, nom: string): unknown {
  if (octets.byteLength === 0 || octets.byteLength > TAILLE_MAXIMALE_XML) throw erreurClasseur(`${nom} dépasse la taille XML autorisée.`);
  const contenu = strFromU8(octets);
  if (/<!DOCTYPE|<!ENTITY/iu.test(contenu)) throw erreurClasseur(`${nom} contient une déclaration XML interdite.`);
  const validation = XMLValidator.validate(contenu);
  if (validation !== true) throw erreurClasseur(`${nom} n’est pas un document XML valide.`);
  const parseur = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: { enabled: true, maxTotalExpansions: 1_000, maxExpandedLength: TAILLE_MAXIMALE_XML },
  });
  return parseur.parse(contenu) as unknown;
}

function texteCellule(cellule: ObjetXml, chainesPartagees: readonly string[]): string {
  if (propriete(cellule, "f") !== undefined) throw erreurClasseur("les cellules contenant une formule doivent être converties en valeurs avant importation.");
  const type = texteXml(propriete(cellule, "@_t"));
  if (type === "inlineStr") return textesRiches(propriete(cellule, "is")).join("");
  const valeur = texteXml(propriete(cellule, "v"));
  if (type === "s") {
    const index = Number(valeur);
    if (!Number.isInteger(index) || index < 0 || index >= chainesPartagees.length) {
      throw erreurClasseur("un index de chaîne partagée est invalide.");
    }
    return chainesPartagees[index] ?? "";
  }
  if (type === "b") return valeur === "1" ? "TRUE" : "FALSE";
  return valeur;
}

function positionColonne(reference: string): number {
  const resultat = /^([A-Z]{1,3})\d+$/u.exec(reference);
  const lettres = resultat?.[1];
  if (!lettres) throw erreurClasseur("une référence de cellule est invalide.");
  let index = 0;
  for (const caractere of lettres) index = index * 26 + caractere.charCodeAt(0) - 64;
  if (index > 32) throw erreurClasseur("la feuille dépasse 32 colonnes.");
  return index - 1;
}

function cheminFeuille(cible: string): string {
  const normalise = cible.replaceAll("\\", "/").replace(/^\//u, "");
  const complet = normalise.startsWith("xl/") ? normalise : `xl/${normalise}`;
  if (!/^xl\/worksheets\/[a-zA-Z0-9_.-]+\.xml$/u.test(complet) || complet.split("/").includes("..")) {
    throw erreurClasseur("le premier onglet référence un chemin de feuille interdit.");
  }
  return complet;
}

export function lireFeuilleExcelMenages(octets: Uint8Array): FeuilleMenagesExcel {
  const attendues = verifierArchiveZip(octets);
  const archive = unzipSync(octets);
  let tailleDecompressee = 0;
  for (const entree of attendues) {
    const contenu = archive[entree.nom];
    if (!contenu || contenu.byteLength !== entree.tailleDecompressee) {
      throw erreurClasseur("la taille décompressée d’une entrée ne correspond pas au répertoire ZIP.");
    }
    tailleDecompressee += contenu.byteLength;
  }
  if (tailleDecompressee > TAILLE_MAXIMALE_DECOMPRESSEE) throw erreurClasseur("le contenu décompressé dépasse 8 Mo.");

  const classeurOctets = archive["xl/workbook.xml"];
  const relationsOctets = archive["xl/_rels/workbook.xml.rels"];
  if (!classeurOctets || !relationsOctets) throw erreurClasseur("les métadonnées du classeur sont absentes.");
  const classeur = propriete(analyserXml(classeurOctets, "le classeur"), "workbook");
  const relationRacine = propriete(analyserXml(relationsOctets, "les relations du classeur"), "Relationships");
  const onglet = elements(propriete(classeur, "sheets"), "sheet")[0];
  const identifiantRelation = onglet ? texteXml(propriete(onglet, "@_r:id")) : "";
  if (!identifiantRelation) throw erreurClasseur("aucun premier onglet exploitable n’est défini.");
  const relation = elements(relationRacine, "Relationship")
    .find((element) => texteXml(propriete(element, "@_Id")) === identifiantRelation);
  const cible = relation ? texteXml(propriete(relation, "@_Target")) : "";
  if (!cible) throw erreurClasseur("la relation du premier onglet est absente.");
  const feuilleOctets = archive[cheminFeuille(cible)];
  if (!feuilleOctets) throw erreurClasseur("le contenu du premier onglet est absent.");

  const chainesOctets = archive["xl/sharedStrings.xml"];
  const chaines = chainesOctets
    ? elements(propriete(analyserXml(chainesOctets, "les chaînes partagées"), "sst"), "si")
      .map((chaine) => textesRiches(chaine).join(""))
    : [];
  const feuille = propriete(analyserXml(feuilleOctets, "le premier onglet"), "worksheet");
  const lignesSource = elements(propriete(feuille, "sheetData"), "row");
  if (lignesSource.length === 0 || lignesSource.length > NOMBRE_MAXIMAL_LIGNES) {
    throw erreurClasseur("le premier onglet doit contenir un en-tête et au plus 500 lignes de données.");
  }
  const lignes: string[][] = [];
  for (const ligne of lignesSource) {
    const cellules = elements(ligne, "c");
    if (cellules.length === 0) continue;
    const valeurs: string[] = [];
    for (const cellule of cellules) {
      const reference = texteXml(propriete(cellule, "@_r"));
      const colonne = positionColonne(reference);
      valeurs[colonne] = texteCellule(cellule, chaines);
    }
    const resultat = Array.from({ length: valeurs.length }, (_, index) => valeurs[index] ?? "");
    if (resultat.some((valeur) => valeur.trim().length > 0)) lignes.push(resultat);
  }
  if (lignes.length < 2 || lignes.length > NOMBRE_MAXIMAL_LIGNES) {
    throw erreurClasseur("le premier onglet doit contenir un en-tête et au plus 500 lignes non vides.");
  }
  const proprietesClasseur = propriete(classeur, "workbookPr");
  const date1904 = ["1", "true"].includes(texteXml(propriete(proprietesClasseur, "@_date1904")).toLowerCase());
  return { lignes, date1904 };
}

export function convertirDateExcel(valeur: string, date1904: boolean): string {
  if (!/^\d+(?:\.\d+)?$/u.test(valeur)) return valeur;
  const serie = Math.floor(Number(valeur));
  if (!Number.isSafeInteger(serie) || serie < 0 || serie > 2_958_465) return valeur;
  const origine = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(origine + serie * 86_400_000).toISOString().slice(0, 10);
}
