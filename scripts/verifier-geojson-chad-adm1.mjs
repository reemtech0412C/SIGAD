import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dossierSource = resolve(racine, "sources/referentiel-territorial/ocha-cod-ab");
const fichierAdm1 = resolve(dossierSource, "tcd_admin1.geojson");
const fichierAdm0 = resolve(dossierSource, "tcd_admin0.geojson");
const fichierMetadata = resolve(dossierSource, "metadata-hdx-package.json");
const fichierCorrespondance = resolve(racine, "sources/referentiel-territorial/matching-cod-ab-adm1-ui-map-1.csv");
const fichierCorrespondanceClient = resolve(racine, "frontend/src/data/provinces-tchad.ts");
const epsilon = 1e-10;

function exiger(condition, message) {
  if (!condition) throw new Error(message);
}

function normaliserNom(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleUpperCase("fr-FR")
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function parserCsvPointVirgule(texte) {
  const lignes = [];
  let ligne = [];
  let cellule = "";
  let entreGuillemets = false;
  for (let index = 0; index < texte.length; index += 1) {
    const caractere = texte[index];
    if (caractere === '"') {
      if (entreGuillemets && texte[index + 1] === '"') {
        cellule += '"';
        index += 1;
      } else {
        entreGuillemets = !entreGuillemets;
      }
    } else if (caractere === ";" && !entreGuillemets) {
      ligne.push(cellule);
      cellule = "";
    } else if ((caractere === "\n" || caractere === "\r") && !entreGuillemets) {
      if (caractere === "\r" && texte[index + 1] === "\n") index += 1;
      ligne.push(cellule);
      if (ligne.some((valeur) => valeur.length > 0)) lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else {
      cellule += caractere;
    }
  }
  exiger(!entreGuillemets, "Le manifeste CSV contient un champ entre guillemets non terminé.");
  if (cellule.length > 0 || ligne.length > 0) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  const entetes = lignes.shift();
  exiger(entetes && entetes.length > 0, "Le manifeste CSV est vide.");
  return lignes.map((valeurs, index) => {
    exiger(valeurs.length === entetes.length, `Nombre de colonnes invalide dans le manifeste, ligne ${index + 2}.`);
    return Object.fromEntries(entetes.map((entete, colonne) => [entete, valeurs[colonne] ?? ""]));
  });
}

function valeurPosition(position) {
  exiger(Array.isArray(position) && position.length >= 2, "Position GeoJSON invalide.");
  const longitude = position[0];
  const latitude = position[1];
  exiger(Number.isFinite(longitude) && Number.isFinite(latitude), "Coordonnée GeoJSON non finie.");
  exiger(longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90, "Coordonnée hors WGS84 longitude/latitude.");
  return [longitude, latitude];
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function surSegment(point, debut, fin) {
  const tolerance = epsilon * Math.max(1, Math.abs(fin[0] - debut[0]) + Math.abs(fin[1] - debut[1]));
  return Math.abs(orientation(debut, fin, point)) <= tolerance
    && point[0] >= Math.min(debut[0], fin[0]) - epsilon && point[0] <= Math.max(debut[0], fin[0]) + epsilon
    && point[1] >= Math.min(debut[1], fin[1]) - epsilon && point[1] <= Math.max(debut[1], fin[1]) + epsilon;
}

function segmentsSeCroisent(a, b, c, d) {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - epsilon || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - epsilon
    || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - epsilon || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - epsilon) return false;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
    && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
  return (Math.abs(o1) <= epsilon && surSegment(c, a, b))
    || (Math.abs(o2) <= epsilon && surSegment(d, a, b))
    || (Math.abs(o3) <= epsilon && surSegment(a, c, d))
    || (Math.abs(o4) <= epsilon && surSegment(b, c, d));
}

function croisementInterieur(a, b, c, d) {
  if (Math.max(a[0], b[0]) <= Math.min(c[0], d[0]) + epsilon || Math.max(c[0], d[0]) <= Math.min(a[0], b[0]) + epsilon
    || Math.max(a[1], b[1]) <= Math.min(c[1], d[1]) + epsilon || Math.max(c[1], d[1]) <= Math.min(a[1], b[1]) + epsilon) return false;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
    && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon));
}

function validerAnneau(coords, libelle) {
  exiger(Array.isArray(coords) && coords.length >= 4, `${libelle} : un anneau doit contenir au moins quatre positions.`);
  const points = coords.map(valeurPosition);
  const premier = points[0];
  const dernier = points.at(-1);
  exiger(premier && dernier && Math.abs(premier[0] - dernier[0]) <= epsilon && Math.abs(premier[1] - dernier[1]) <= epsilon, `${libelle} : anneau non fermé.`);
  const aretes = points.length - 1;
  let aireDoublee = 0;
  for (let index = 0; index < aretes; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    exiger(a && b, `${libelle} : position manquante.`);
    exiger(Math.abs(a[0] - b[0]) > epsilon || Math.abs(a[1] - b[1]) > epsilon, `${libelle} : sommets consécutifs identiques.`);
    aireDoublee += a[0] * b[1] - b[0] * a[1];
    const c = points[(index + 2) % aretes];
    if (c && Math.abs(orientation(a, b, c)) <= epsilon) {
      const vecteurBA = [a[0] - b[0], a[1] - b[1]];
      const vecteurBC = [c[0] - b[0], c[1] - b[1]];
      exiger(vecteurBA[0] * vecteurBC[0] + vecteurBA[1] * vecteurBC[1] <= epsilon, `${libelle} : segments adjacents qui se recouvrent.`);
    }
  }
  exiger(Math.abs(aireDoublee) > epsilon, `${libelle} : anneau d’aire nulle.`);
  for (let premierIndex = 0; premierIndex < aretes; premierIndex += 1) {
    const a = points[premierIndex];
    const b = points[premierIndex + 1];
    if (!a || !b) continue;
    for (let secondIndex = premierIndex + 1; secondIndex < aretes; secondIndex += 1) {
      if (secondIndex === premierIndex + 1 || (premierIndex === 0 && secondIndex === aretes - 1)) continue;
      const c = points[secondIndex];
      const d = points[secondIndex + 1];
      if (c && d) exiger(!segmentsSeCroisent(a, b, c, d), `${libelle} : auto-intersection entre les segments ${premierIndex + 1} et ${secondIndex + 1}.`);
    }
  }
  return points;
}

function positionDansAnneau(position, anneau) {
  let interieur = false;
  for (let index = 0, precedent = anneau.length - 1; index < anneau.length; precedent = index, index += 1) {
    const a = anneau[precedent];
    const b = anneau[index];
    if (!a || !b) continue;
    if (surSegment(position, a, b)) return "frontiere";
    const traverse = (a[1] > position[1]) !== (b[1] > position[1]);
    if (traverse && position[0] < ((b[0] - a[0]) * (position[1] - a[1])) / (b[1] - a[1]) + a[0]) interieur = !interieur;
  }
  return interieur ? "interieur" : "exterieur";
}

function anneauxGeometrie(geometrie, libelle) {
  exiger(geometrie && geometrie.type === "Polygon" && Array.isArray(geometrie.coordinates), `${libelle} : type géométrique attendu Polygon.`);
  return geometrie.coordinates.map((anneau, index) => validerAnneau(anneau, `${libelle}, anneau ${index + 1}`));
}

function enveloppe(points) {
  return points.reduce((limites, point) => [Math.min(limites[0], point[0]), Math.min(limites[1], point[1]), Math.max(limites[2], point[0]), Math.max(limites[3], point[1])], [Infinity, Infinity, -Infinity, -Infinity]);
}

function enveloppesSeCroisent(a, b) {
  return a[0] <= b[2] + epsilon && b[0] <= a[2] + epsilon && a[1] <= b[3] + epsilon && b[1] <= a[3] + epsilon;
}

function pointDansPolygone(point, anneaux) {
  const etatExterieur = anneaux[0] ? positionDansAnneau(point, anneaux[0]) : "exterieur";
  if (etatExterieur !== "interieur") return etatExterieur;
  for (const trou of anneaux.slice(1)) {
    const etatTrou = positionDansAnneau(point, trou);
    if (etatTrou === "frontiere") return "frontiere";
    if (etatTrou === "interieur") return "exterieur";
  }
  return "interieur";
}

function aireSpheriqueKm2(anneaux) {
  const rayon = 6371.0088;
  return Math.abs(anneaux.reduce((total, anneau, index) => {
    const signe = index === 0 ? 1 : -1;
    let somme = 0;
    for (let position = 0; position < anneau.length - 1; position += 1) {
      const a = anneau[position];
      const b = anneau[position + 1];
      if (!a || !b) continue;
      const longitudeA = a[0] * Math.PI / 180;
      const longitudeB = b[0] * Math.PI / 180;
      const latitudeA = a[1] * Math.PI / 180;
      const latitudeB = b[1] * Math.PI / 180;
      somme += (longitudeB - longitudeA) * (2 + Math.sin(latitudeA) + Math.sin(latitudeB));
    }
    return total + signe * Math.abs(somme) * rayon * rayon / 2;
  }, 0));
}

function verifierCroisementsAnneaux(features) {
  const enveloppes = features.map((feature) => enveloppe(feature.anneaux[0] ?? []));
  let pairesExaminees = 0;
  let testsSegments = 0;
  for (let premier = 0; premier < features.length; premier += 1) {
    const featureA = features[premier];
    if (!featureA) continue;
    for (let second = premier + 1; second < features.length; second += 1) {
      const featureB = features[second];
      if (!featureB || !enveloppesSeCroisent(enveloppes[premier] ?? [], enveloppes[second] ?? [])) continue;
      pairesExaminees += 1;
      const anneauA = featureA.anneaux[0] ?? [];
      const anneauB = featureB.anneaux[0] ?? [];
      for (const point of anneauA.slice(0, -1)) {
        exiger(pointDansPolygone(point, featureB.anneaux) !== "interieur", `Recouvrement de surface entre ${featureA.code} et ${featureB.code}.`);
      }
      for (const point of anneauB.slice(0, -1)) {
        exiger(pointDansPolygone(point, featureA.anneaux) !== "interieur", `Recouvrement de surface entre ${featureA.code} et ${featureB.code}.`);
      }
      for (let indexA = 0; indexA < anneauA.length - 1; indexA += 1) {
        const a = anneauA[indexA];
        const b = anneauA[indexA + 1];
        if (!a || !b) continue;
        for (let indexB = 0; indexB < anneauB.length - 1; indexB += 1) {
          const c = anneauB[indexB];
          const d = anneauB[indexB + 1];
          if (!c || !d) continue;
          if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - epsilon || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - epsilon
            || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - epsilon || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - epsilon) continue;
          testsSegments += 1;
          exiger(!croisementInterieur(a, b, c, d), `Frontières croisées entre ${featureA.code} et ${featureB.code}.`);
        }
      }
    }
  }
  return { pairesExaminees, testsSegments };
}

function echapperCsv(value) {
  const texte = String(value);
  return /[;"\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

function construireCorrespondance(provincesSigad, featuresOcha, empreinte) {
  const parNom = new Map();
  for (const feature of featuresOcha) {
    const cle = normaliserNom(feature.propriete.adm1_name);
    const liste = parNom.get(cle) ?? [];
    liste.push(feature);
    parNom.set(cle, liste);
  }
  return provincesSigad.map((province) => {
    const candidats = parNom.get(normaliserNom(province.SIGAD_NAME)) ?? [];
    exiger(candidats.length === 1, `Correspondance du nom non unique ou absente pour ${province.SIGAD_NAME}.`);
    const feature = candidats[0];
    exiger(feature && typeof feature.propriete.adm1_pcode === "string", `P-code OCHA absent pour ${province.SIGAD_NAME}.`);
    return {
      SIGAD_ID: province.SIGAD_ID,
      SIGAD_NAME: province.SIGAD_NAME,
      SOURCE_CODE: feature.propriete.adm1_pcode,
      SOURCE_NAME: feature.propriete.adm1_name,
      STATUS: "VERIFIE_NOM_NORMALISE_ET_PCODE_OCHA",
      EVIDENCE: `HDX ressource 575b9fe1-a995-43b8-9e12-de98d4d7d7d1; adm1_pcode ${feature.propriete.adm1_pcode}; adm1_name normalisé; SHA256 ${empreinte}`,
    };
  });
}

function encoderCorrespondance(correspondance) {
  const colonnes = ["SIGAD_ID", "SIGAD_NAME", "SOURCE_CODE", "SOURCE_NAME", "STATUS", "EVIDENCE"];
  return `${colonnes.join(";")}\r\n${correspondance.map((ligne) => colonnes.map((colonne) => echapperCsv(ligne[colonne])).join(";")).join("\r\n")}\r\n`;
}

function encoderCorrespondanceClient(correspondance) {
  const lignes = correspondance.map((ligne) => `  { sigadId: ${JSON.stringify(ligne.SIGAD_ID)}, sigadName: ${JSON.stringify(ligne.SIGAD_NAME)}, pcode: ${JSON.stringify(ligne.SOURCE_CODE)}, nomOcha: ${JSON.stringify(ligne.SOURCE_NAME)} },`);
  return `export interface ProvinceSIGADCartographie {\n  readonly sigadId: string;\n  readonly sigadName: string;\n  readonly pcode: string;\n  readonly nomOcha: string;\n}\n\nexport const PROVINCES_TCHAD = [\n${lignes.join("\n")}\n] as const satisfies readonly ProvinceSIGADCartographie[];\n`;
}

async function lireJson(fichier) {
  return JSON.parse(await readFile(fichier, "utf8"));
}

async function main() {
  const [adm1, adm0, packageHdx, texteCorrespondance] = await Promise.all([
    lireJson(fichierAdm1), lireJson(fichierAdm0), lireJson(fichierMetadata), readFile(fichierCorrespondance, "utf8"),
  ]);
  const sha256 = createHash("sha256").update(await readFile(fichierAdm1)).digest("hex").toUpperCase();
  const ressources = packageHdx.resources;
  const ressource = ressources.find((candidate) => candidate.id === "575b9fe1-a995-43b8-9e12-de98d4d7d7d1");
  exiger(ressource?.name === "tcd_admin_boundaries.geojson.zip", "La ressource HDX sauvegardée ne correspond pas à l’ADM1 GeoJSON attendu.");
  exiger(packageHdx.license_id === "cc-by-igo", "La licence déclarée par HDX a changé ou est absente.");
  exiger(adm1.type === "FeatureCollection" && Array.isArray(adm1.features), "Le fichier ADM1 n’est pas une FeatureCollection GeoJSON.");
  exiger(adm0.type === "FeatureCollection" && adm0.features.length === 1, "La géométrie nationale ADM0 manque pour vérifier la couverture.");
  exiger(adm1.crs?.properties?.name === "urn:ogc:def:crs:OGC:1.3:CRS84", "Le CRS ne désigne pas CRS84 longitude/latitude (WGS84). ");
  exiger(adm1.features.length === 23, `Nombre d’entités ADM1 inattendu : ${adm1.features.length}.`);

  const lignesSource = parserCsvPointVirgule(texteCorrespondance);
  const provincesSigad = lignesSource.map((ligne) => ({ SIGAD_ID: ligne.SIGAD_PROVINCE_ID ?? ligne.SIGAD_ID, SIGAD_NAME: ligne.SIGAD_NAME }));
  exiger(provincesSigad.length === 23, `Le manifeste SIGAD contient ${provincesSigad.length} provinces, attendu 23.`);
  exiger(new Set(provincesSigad.map((province) => province.SIGAD_ID)).size === 23, "Les identifiants SIGAD ne sont pas uniques.");

  const features = adm1.features.map((feature) => {
    const code = feature.properties?.adm1_pcode;
    const nom = feature.properties?.adm1_name;
    exiger(typeof code === "string" && /^TCD\d{2}$/.test(code), `P-code OCHA invalide : ${String(code)}.`);
    exiger(typeof nom === "string" && nom.trim().length > 0, `Nom ADM1 vide pour ${code}.`);
    const anneaux = anneauxGeometrie(feature.geometry, `${code} ${nom}`);
    exiger(anneaux.length > 0, `${code} ne contient aucun anneau.`);
    if (anneaux.length > 1 && anneaux[0]) {
      for (const trou of anneaux.slice(1)) {
        const point = trou[0];
        exiger(point && positionDansAnneau(point, anneaux[0]) === "interieur", `${code} : trou situé hors de l’anneau extérieur.`);
      }
    }
    const aireCalculee = aireSpheriqueKm2(anneaux);
    const aireSource = Number(feature.properties.area_sqkm);
    exiger(Number.isFinite(aireSource) && aireSource > 0, `${code} : aire source absente ou invalide.`);
    exiger(Math.abs(aireCalculee - aireSource) / aireSource < 0.005, `${code} : aire calculée incompatible avec area_sqkm.`);
    return { code, nom, propriete: feature.properties, anneaux, limites: enveloppe(anneaux[0] ?? []), aireSource, aireCalculee };
  });

  exiger(new Set(features.map((feature) => feature.code)).size === 23, "Les P-codes ADM1 OCHA ne sont pas uniques.");
  exiger(new Set(features.map((feature) => normaliserNom(feature.nom))).size === 23, "Les noms ADM1 OCHA ne sont pas uniques après normalisation.");
  exiger(features.every((feature) => feature.propriete.adm0_pcode === "TCD" && feature.propriete.version === "v01" && feature.propriete.valid_on === "2025-02-12"), "Les attributs nationaux, version ou validité diffèrent dans le jeu ADM1.");

  const featureAdm0 = adm0.features[0];
  const anneauxAdm0 = anneauxGeometrie(featureAdm0.geometry, "TCD Tchad ADM0");
  exiger(featureAdm0.properties?.adm0_pcode === "TCD" && Number(featureAdm0.properties.area_sqkm) > 0, "L’entité ADM0 ne correspond pas au Tchad ou son aire manque.");
  for (const feature of features) {
    const anneauExterieur = feature.anneaux[0] ?? [];
    for (const point of anneauExterieur.slice(0, -1)) {
      exiger(positionDansAnneau(point, anneauxAdm0[0] ?? []) !== "exterieur", `${feature.code} contient un sommet hors du contour ADM0 du Tchad.`);
    }
  }

  const controleTopologique = verifierCroisementsAnneaux(features);
  const sommeAires = features.reduce((total, feature) => total + feature.aireSource, 0);
  const aireTchad = Number(featureAdm0.properties.area_sqkm);
  const ecartAires = Math.abs(sommeAires - aireTchad);
  exiger(ecartAires <= 0.01, `Écart entre les aires ADM1 et ADM0 trop important : ${ecartAires.toFixed(6)} km².`);

  const correspondance = construireCorrespondance(provincesSigad, features, sha256);
  exiger(new Set(correspondance.map((ligne) => ligne.SOURCE_CODE)).size === 23, "Deux provinces SIGAD sont associées au même P-code.");
  const sortie = encoderCorrespondance(correspondance);
  const sortieClient = encoderCorrespondanceClient(correspondance);
  if (process.argv.includes("--write-manifest")) {
    await mkdir(dirname(fichierCorrespondanceClient), { recursive: true });
    await writeFile(fichierCorrespondance, sortie, { encoding: "utf8" });
    await writeFile(fichierCorrespondanceClient, sortieClient, { encoding: "utf8" });
  } else {
    exiger(sortie === texteCorrespondance.replace(/^\uFEFF/, ""), "Le manifeste de correspondance ne correspond pas aux géométries et attributs vérifiés. Relancer avec --write-manifest après revue.");
    exiger(await readFile(fichierCorrespondanceClient, "utf8") === sortieClient, "La correspondance frontend diffère des attributs et P-codes vérifiés.");
  }

  const limitesNationales = features.reduce((total, feature) => [Math.min(total[0], feature.limites[0]), Math.min(total[1], feature.limites[1]), Math.max(total[2], feature.limites[2]), Math.max(total[3], feature.limites[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  console.log(`PASS — OCHA/HDX ADM1 : ${features.length} provinces, 23 P-codes uniques et 23 correspondances SIGAD nom-normalisé 1:1.`);
  console.log(`PASS — GeoJSON ${adm1.crs.properties.name}, 23 géométries Polygon valides, auto-intersections absentes, sommets dans ADM0 et croisements intérieurs provinciaux absents.`);
  console.log(`PASS — Couverture : somme area_sqkm ADM1=${sommeAires.toFixed(8)} km²; ADM0=${aireTchad.toFixed(8)} km²; écart=${ecartAires.toFixed(9)} km²; ${controleTopologique.pairesExaminees} paires de provinces examinées.`);
  console.log(`SHA256 ADM1 ${sha256}`);
  console.log(`Emprise WGS84 lon/lat ${limitesNationales.map((valeur) => valeur.toFixed(5)).join(", ")}`);
  if (process.argv.includes("--write-manifest")) console.log(`Manifeste écrit : ${fichierCorrespondance}`);
}

main().catch((erreur) => {
  console.error(`FAIL — ${erreur instanceof Error ? erreur.message : "Erreur inconnue de validation géographique."}`);
  process.exitCode = 1;
});
