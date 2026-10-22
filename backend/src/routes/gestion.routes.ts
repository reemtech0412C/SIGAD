import { Hono, type Context } from "hono";
import { z } from "zod";
import type { EnvironnementApplication, UtilisateurSession } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { convertirDateExcel, lireFeuilleExcelMenages } from "../services/xlsx-menages.service";
import {
  schemaCreationListeBeneficiaires,
  schemaCreationPartenaire,
  schemaDecisionDoublon,
  schemaDecisionPartenaire,
  schemaFiltresMenages,
  schemaFiltresPartenaires,
  schemaImportMenages,
  schemaInscriptionsBeneficiaires,
  schemaMenage,
  schemaPaginationGestion,
  type MenageSaisi,
} from "../../../shared/validations/beneficiaires";

const routesGestion = new Hono<EnvironnementApplication>();
const ROLES_LECTURE = ["PROPRIETAIRE", "ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
const ROLES_OPERATIONNELS = ["ADMIN_CENTRAL", "DELEGUE_PROVINCIAL"] as const;
const ROLES_CENTRAUX = ["PROPRIETAIRE", "ADMIN_CENTRAL"] as const;

interface Page<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface ProvinceD1 {
  id: string;
  code: string;
}

interface CategoriePopulationD1 {
  id: string;
  code: string;
  libelle: string;
}

interface ResultatVerificationMenage {
  numero: number;
  localisation_valide: number;
  menage_doublon_id: string | null;
}

interface MenageListe {
  id: string;
  code_menage: string;
  province_id: string;
  departement_id: string;
  localite_id: string | null;
  nom_chef_menage: string;
  sexe_chef: "M" | "F";
  nombre_personnes: number;
  telephone: string | null;
  categorie_population_id: string;
  categorie_population: string;
  statut: string;
  date_enregistrement: string;
}

interface PartenaireListe {
  id: string;
  code: string | null;
  nom: string;
  sigle: string | null;
  type_organisation: string;
  contact_email: string | null;
  contact_telephone: string | null;
  statut_validation: string;
  cree_le: string;
}

interface PartenaireDetail extends PartenaireListe {
  roles: string[];
}

interface ListeBeneficiairesD1 {
  id: string;
  reference_liste: string;
  intitule: string;
  province_id: string;
  nombre_menages_cibles: number;
  nombre_personnes_cibles: number;
  statut: string;
  cree_le: string;
}

interface MembreMenageD1 {
  id: string;
  nom_complet: string;
  sexe: "M" | "F";
  annee_naissance: number | null;
  lien_parente: string;
  identifiant_individuel: string | null;
}

interface SignalementDoublonD1 {
  id: string;
  province_id: string;
  menage_source_id: string;
  menage_suspect_id: string;
  motif_similitude: string;
  statut_traitement: string;
  cree_le: string;
}

interface LigneExportBeneficiaire {
  code_menage: string;
  province: string;
  departement: string;
  localite: string | null;
  nom_chef_menage: string;
  sexe_chef: "M" | "F";
  nombre_personnes: number;
  categorie_population: string;
  criteres_vulnerabilite: string | null;
  date_enregistrement: string;
  statut_menage: string;
  statut_verification: string;
}

interface ImportMenagePrepare {
  id: string;
  code: string;
  province_id: string;
  donnees: MenageSaisi;
  telephone: string | null;
  statut: "ACTIF" | "DOUBLON_SUSPECTE";
  menageDoublonId: string | null;
}

function reponseInterdite(c: Context<EnvironnementApplication>) {
  return c.json({ erreur: "Accès refusé pour cette opération." }, 403);
}

function reponseInvalide(c: Context<EnvironnementApplication>, erreur: string) {
  return c.json({ erreur }, 400);
}

function champCsv(valeur: string | number | null): string {
  const texte = valeur === null ? "" : String(valeur);
  const protege = /^[\s\u200b\ufeff]*[=+\-@]/u.test(texte) ? `'${texte}` : texte;
  return `"${protege.replaceAll('"', '""')}"`;
}

function autorise(utilisateur: UtilisateurSession, roles: readonly string[]): boolean {
  return roles.includes(utilisateur.role);
}

function obtenirProvince(
  utilisateur: UtilisateurSession,
  provinceDemandee: string | undefined,
  obligatoire: boolean,
): { autorisee: boolean; provinceId: string | null } {
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || (provinceDemandee && provinceDemandee !== utilisateur.province_id)) {
      return { autorisee: false, provinceId: null };
    }
    return { autorisee: true, provinceId: utilisateur.province_id };
  }
  if (obligatoire && !provinceDemandee) return { autorisee: false, provinceId: null };
  return { autorisee: true, provinceId: provinceDemandee ?? null };
}

function protegerSql(valeur: string | number | null): string {
  if (valeur === null) return "NULL";
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) throw new Error("Une valeur numérique interne est invalide.");
    return String(valeur);
  }
  return `'${valeur.replaceAll("'", "''")}'`;
}

function extraireFiltres<T>(c: Context<EnvironnementApplication>, schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false } }): T | null {
  const resultat = schema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  return resultat.success ? resultat.data : null;
}

async function lireCorps<T>(
  c: Context<EnvironnementApplication>,
  schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false; error?: { issues: readonly { message: string }[] } } },
): Promise<{ valeur: T } | { erreur: string }> {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return { erreur: "Le corps de la requête est invalide." };
  }
  const resultat = schema.safeParse(corps);
  if (!resultat.success) return { erreur: "Les données transmises sont invalides ou contiennent des champs non autorisés." };
  return { valeur: resultat.data };
}

function ajouterCondition(
  conditions: string[],
  valeurs: (string | number)[],
  condition: string,
  valeur: string | number | null | undefined,
): void {
  if (valeur === undefined || valeur === null || valeur === "") return;
  conditions.push(condition);
  valeurs.push(valeur);
}

async function lirePage<T>(
  db: D1Database,
  sqlListe: string,
  sqlTotal: string,
  valeurs: readonly (string | number)[],
  limite: number,
  decalage: number,
): Promise<Page<T>> {
  const [liste, total] = await Promise.all([
    db.prepare(sqlListe).bind(...valeurs, limite, decalage).all<T>(),
    db.prepare(sqlTotal).bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite, decalage };
}

function normaliserTelephone(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  const chiffres = valeur.replace(/\D/gu, "");
  return chiffres.length >= 5 ? chiffres : null;
}

function identifiantMenage(): string {
  return crypto.randomUUID();
}

function codeMenage(codeProvince: string): string {
  const annee = new Date().getUTCFullYear();
  const suffixe = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `MEN-${codeProvince.replace(/^TD-/u, "")}-${annee}-${suffixe}`;
}

function creerInstructionMenage(
  menage: ImportMenagePrepare,
  utilisateur: UtilisateurSession,
): string {
  const d = menage.donnees;
  const colonnes = [
    "id", "code_menage", "province_id", "departement_id", "sous_prefecture_id", "commune_id",
    "localite_id", "arrondissement_id", "quartier_id", "carre_id", "site_humanitaire_id",
    "nom_chef_menage", "sexe_chef", "nombre_personnes", "telephone", "categorie_population_id",
    "criteres_vulnerabilite", "date_enregistrement", "statut", "cree_par",
  ];
  const valeurs: (string | number | null)[] = [
    menage.id,
    menage.code,
    menage.province_id,
    d.departement_id,
    d.sous_prefecture_id ?? null,
    d.commune_id ?? null,
    d.localite_id ?? null,
    d.arrondissement_id ?? null,
    d.quartier_id ?? null,
    d.carre_id ?? null,
    d.site_humanitaire_id ?? null,
    d.nom_chef_menage,
    d.sexe_chef,
    d.nombre_personnes,
    menage.telephone,
    d.categorie_population_id,
    JSON.stringify(d.criteres_vulnerabilite),
    d.date_enregistrement,
    menage.statut,
    utilisateur.id,
  ];
  const valuesSql = valeurs.map(protegerSql).join(", ");
  return `INSERT INTO menages (${colonnes.join(", ")}) VALUES (${valuesSql})`;
}

function instructionsMembres(menageId: string, membres: MenageSaisi["membres"]): string[] {
  if (membres.length === 0) return [];
  const lignes = membres.map((membre) => `(${[
    crypto.randomUUID(),
    menageId,
    membre.nom_complet,
    membre.sexe,
    membre.annee_naissance ?? null,
    membre.lien_parente,
    membre.identifiant_individuel ?? null,
  ].map(protegerSql).join(", ")})`);
  const tailleGroupe = 50;
  const instructions: string[] = [];
  for (let debut = 0; debut < lignes.length; debut += tailleGroupe) {
    const bloc = lignes.slice(debut, debut + tailleGroupe);
    instructions.push(
      `INSERT INTO membres_menage (id, menage_id, nom_complet, sexe, annee_naissance, lien_parente, identifiant_individuel) VALUES ${bloc.join(", ")}`,
    );
  }
  return instructions;
}

function instructionsSignalements(menages: readonly ImportMenagePrepare[]): string[] {
  const lignes = menages.flatMap((menage) => {
    if (!menage.menageDoublonId) return [];
    const id = crypto.randomUUID();
    const motif = menage.telephone ? "MEME_TELEPHONE" : "NOM_ET_LOCALITE_SIMILAIRES";
    return [`(${[
      id,
      menage.province_id,
      menage.menageDoublonId,
      menage.id,
      motif,
    ].map(protegerSql).join(", ")})`];
  });
  if (lignes.length === 0) return [];
  const tailleGroupe = 100;
  const lots: string[] = [];
  for (let debut = 0; debut < lignes.length; debut += tailleGroupe) {
    lots.push(
      `INSERT OR IGNORE INTO signalements_doublons (id, province_id, menage_source_id, menage_suspect_id, motif_similitude) VALUES ${lignes.slice(debut, debut + tailleGroupe).join(", ")}`,
    );
  }
  return lots;
}

function requeteVerificationMenages(
  provinceId: string,
  menages: readonly ImportMenagePrepare[],
  indexDebut: number,
): string {
  const nomsColonnes = [
    "numero", "departement_id", "sous_prefecture_id", "commune_id", "localite_id", "arrondissement_id",
    "quartier_id", "carre_id", "site_humanitaire_id", "categorie_population_id", "telephone", "nom_chef_menage",
  ];
  const valeursSql = menages.map((menage, index) => {
    const d = menage.donnees;
    const valeurs: (string | number | null)[] = [
      indexDebut + index,
      d.departement_id,
      d.sous_prefecture_id ?? null,
      d.commune_id ?? null,
      d.localite_id ?? null,
      d.arrondissement_id ?? null,
      d.quartier_id ?? null,
      d.carre_id ?? null,
      d.site_humanitaire_id ?? null,
      d.categorie_population_id,
      menage.telephone,
      d.nom_chef_menage,
    ];
    return `(${valeurs.map(protegerSql).join(", ")})`;
  });
  const provinceSql = protegerSql(provinceId);
  return `WITH demandes (${nomsColonnes.join(", ")}) AS (VALUES ${valeursSql.join(", ")})
    SELECT d.numero,
      CASE WHEN
        EXISTS (SELECT 1 FROM departements dep WHERE dep.id = d.departement_id AND dep.province_id = ${provinceSql} AND dep.actif = 1)
        AND EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = d.categorie_population_id)
        AND (d.sous_prefecture_id IS NULL OR EXISTS (
          SELECT 1 FROM sous_prefectures sp WHERE sp.id = d.sous_prefecture_id
            AND sp.departement_id = d.departement_id AND sp.actif = 1
        ))
        AND (d.commune_id IS NULL OR EXISTS (
          SELECT 1 FROM communes co WHERE co.id = d.commune_id AND co.province_id = ${provinceSql}
            AND co.actif = 1 AND co.statut_validation = 'VALIDE'
            AND EXISTS (
              SELECT 1 FROM rattachements_territoriaux rt WHERE rt.commune_id = co.id
                AND rt.departement_id = d.departement_id
                AND (d.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = d.sous_prefecture_id)
                AND rt.date_debut_validite <= date('now')
                AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
            )
        ))
        AND (d.localite_id IS NULL OR EXISTS (
          SELECT 1 FROM localites loc WHERE loc.id = d.localite_id AND loc.province_id = ${provinceSql}
            AND loc.departement_id = d.departement_id AND loc.statut_validation = 'VALIDE'
            AND (loc.sous_prefecture_id IS NULL OR loc.sous_prefecture_id = d.sous_prefecture_id)
            AND (loc.commune_id IS NULL OR loc.commune_id = d.commune_id)
        ))
        AND (d.arrondissement_id IS NULL OR EXISTS (
          SELECT 1 FROM arrondissements ar INNER JOIN localites loc ON loc.id = ar.localite_id
          WHERE ar.id = d.arrondissement_id AND ar.localite_id = d.localite_id
            AND ar.statut_validation = 'VALIDE' AND loc.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
        ))
        AND (d.quartier_id IS NULL OR EXISTS (
          SELECT 1 FROM quartiers q WHERE q.id = d.quartier_id AND q.localite_id = d.localite_id
            AND q.statut_validation = 'VALIDE' AND q.arrondissement_id IS d.arrondissement_id
        ))
        AND (d.carre_id IS NULL OR EXISTS (
          SELECT 1 FROM carres ca INNER JOIN quartiers q ON q.id = ca.quartier_id
          WHERE ca.id = d.carre_id AND q.id = d.quartier_id AND ca.statut_validation = 'VALIDE'
        ))
        AND (d.site_humanitaire_id IS NULL OR EXISTS (
          SELECT 1 FROM sites_humanitaires site WHERE site.id = d.site_humanitaire_id
            AND site.province_id = ${provinceSql} AND site.departement_id = d.departement_id
            AND site.statut_validation = 'VALIDE'
            AND (site.sous_prefecture_id IS NULL OR site.sous_prefecture_id = d.sous_prefecture_id)
            AND (site.commune_id IS NULL OR site.commune_id = d.commune_id)
            AND (site.localite_proche_id IS NULL OR site.localite_proche_id = d.localite_id)
        ))
      THEN 1 ELSE 0 END AS localisation_valide,
      (SELECT m.id FROM menages m WHERE m.province_id = ${provinceSql} AND m.statut <> 'ARCHIVE'
        AND ((d.telephone IS NOT NULL AND m.telephone = d.telephone)
          OR (d.localite_id IS NOT NULL AND lower(trim(m.nom_chef_menage)) = lower(trim(d.nom_chef_menage))
            AND m.localite_id = d.localite_id))
        ORDER BY CASE WHEN d.telephone IS NOT NULL AND m.telephone = d.telephone THEN 0 ELSE 1 END,
          m.cree_le ASC, m.id ASC LIMIT 1) AS menage_doublon_id
    FROM demandes d`;
}

async function verifierEtSignalerMenages(
  db: D1Database,
  menages: ImportMenagePrepare[],
): Promise<{ valides: boolean; nombreDoublons: number }> {
  const groupesParProvince = new Map<string, { ligne: ImportMenagePrepare; numero: number }[]>();
  for (const [numero, menage] of menages.entries()) {
    const groupes = groupesParProvince.get(menage.province_id) ?? [];
    groupes.push({ ligne: menage, numero });
    groupesParProvince.set(menage.province_id, groupes);
  }
  const requetes = [...groupesParProvince.entries()].flatMap(([provinceId, lignes]) => {
    const resultat: D1PreparedStatement[] = [];
    for (let debut = 0; debut < lignes.length; debut += 10) {
      const groupe = lignes.slice(debut, debut + 10);
      const debutGlobal = groupe[0]?.numero ?? 0;
      resultat.push(db.prepare(requeteVerificationMenages(provinceId, groupe.map((element) => element.ligne), debutGlobal)));
    }
    return resultat;
  });
  const resultats = await db.batch<ResultatVerificationMenage>(requetes);
  const verifications = resultats.flatMap((resultat) => resultat.results);
  const parNumero = new Map(verifications.map((ligne) => [ligne.numero, ligne]));
  if (parNumero.size !== menages.length || verifications.some((ligne) => ligne.localisation_valide !== 1)) {
    return { valides: false, nombreDoublons: 0 };
  }

  const premierParTelephone = new Map<string, string>();
  const premierParNomEtLocalite = new Map<string, string>();
  for (let index = 0; index < menages.length; index += 1) {
    const menage = menages[index];
    const verification = parNumero.get(index);
    if (!menage || !verification) return { valides: false, nombreDoublons: 0 };
    const d = menage.donnees;
    const cleNomLocalite = d.localite_id
      ? `${d.localite_id}\u0000${d.nom_chef_menage.normalize("NFKC").trim().toLocaleLowerCase("fr")}`
      : null;
    const cleTelephoneProvince = menage.telephone ? `${menage.province_id}\u0000${menage.telephone}` : null;
    const cleNomProvinceLocalite = cleNomLocalite ? `${menage.province_id}\u0000${cleNomLocalite}` : null;
    const doublonDansImport = cleTelephoneProvince ? premierParTelephone.get(cleTelephoneProvince) : undefined;
    const doublonNomDansImport = cleNomProvinceLocalite ? premierParNomEtLocalite.get(cleNomProvinceLocalite) : undefined;
    menage.menageDoublonId = verification.menage_doublon_id ?? doublonDansImport ?? doublonNomDansImport ?? null;
    menage.statut = menage.menageDoublonId ? "DOUBLON_SUSPECTE" : "ACTIF";
    if (cleTelephoneProvince && !premierParTelephone.has(cleTelephoneProvince)) premierParTelephone.set(cleTelephoneProvince, menage.id);
    if (cleNomProvinceLocalite && !premierParNomEtLocalite.has(cleNomProvinceLocalite)) premierParNomEtLocalite.set(cleNomProvinceLocalite, menage.id);
  }
  return { valides: true, nombreDoublons: menages.filter((menage) => menage.menageDoublonId !== null).length };
}

function decouperCsv(texte: string): string[][] {
  const premiereLigne = texte.split(/\r?\n/u, 1)[0] ?? "";
  const delimiteur = (premiereLigne.match(/;/gu)?.length ?? 0) > (premiereLigne.match(/,/gu)?.length ?? 0) ? ";" : ",";
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let guillemets = false;
  for (let index = 0; index < texte.length; index += 1) {
    const caractere = texte[index];
    if (caractere === '"') {
      if (guillemets && texte[index + 1] === '"') {
        cellule += '"';
        index += 1;
      } else {
        guillemets = !guillemets;
      }
      continue;
    }
    if (!guillemets && caractere === delimiteur) {
      ligne.push(cellule);
      cellule = "";
      continue;
    }
    if (!guillemets && (caractere === "\n" || caractere === "\r")) {
      if (caractere === "\r" && texte[index + 1] === "\n") index += 1;
      ligne.push(cellule);
      if (ligne.some((valeur) => valeur.length > 0)) lignes.push(ligne);
      ligne = [];
      cellule = "";
      continue;
    }
    if (caractere !== undefined) cellule += caractere;
  }
  if (guillemets) throw new Error("Le fichier CSV contient un champ entre guillemets incomplet.");
  ligne.push(cellule);
  if (ligne.some((valeur) => valeur.length > 0)) lignes.push(ligne);
  if (lignes.length < 2) throw new Error("Le fichier CSV ne contient aucune ligne de ménage.");
  const entetes = lignes[0];
  if (!entetes || new Set(entetes).size !== entetes.length) throw new Error("Les en-têtes du fichier CSV sont vides ou répétés.");
  if (lignes.some((valeur) => valeur.length !== entetes.length)) throw new Error("Les lignes CSV ne possèdent pas le même nombre de colonnes.");
  return lignes;
}

async function convertirLignesMenages(
  db: D1Database,
  lignes: readonly string[][],
  format: "CSV" | "Excel",
  date1904 = false,
): Promise<{ menages: MenageSaisi[]; provinceExposee: boolean }> {
  const entetes = lignes[0]?.map((entete) => entete.trim().toLowerCase());
  if (!entetes) throw new Error(`La ligne d’en-tête du fichier ${format} est absente.`);
  if (new Set(entetes).size !== entetes.length) throw new Error(`Les en-têtes du fichier ${format} se répètent après normalisation.`);
  const colonnesAutorisees = new Set([
    "province_id", "departement_id", "sous_prefecture_id", "commune_id", "localite_id", "arrondissement_id",
    "quartier_id", "carre_id", "site_humanitaire_id", "nom_chef_menage", "sexe_chef", "nombre_personnes",
    "telephone", "categorie_population_code", "criteres_vulnerabilite", "date_enregistrement",
  ]);
  const inconnues = entetes.filter((entete) => !colonnesAutorisees.has(entete));
  if (inconnues.length > 0) throw new Error(`Colonnes ${format} non autorisées : ${inconnues.join(", ")}.`);
  const indexColonnes = new Map(entetes.map((entete, index) => [entete, index]));
  const obligatoires = ["departement_id", "nom_chef_menage", "sexe_chef", "nombre_personnes", "categorie_population_code", "date_enregistrement"];
  const absentes = obligatoires.filter((colonne) => !indexColonnes.has(colonne));
  if (absentes.length > 0) throw new Error(`Colonnes obligatoires absentes du fichier ${format} : ${absentes.join(", ")}.`);
  const categories = await db.prepare("SELECT id, code FROM categories_population").all<CategoriePopulationD1>();
  const idParCode = new Map(categories.results.map((categorie) => [categorie.code, categorie.id]));
  const menages: MenageSaisi[] = [];
  for (let index = 1; index < lignes.length; index += 1) {
    const ligne = lignes[index];
    if (!ligne) continue;
    const valeur = (colonne: string): string | undefined => {
      const position = indexColonnes.get(colonne);
      const cellule = position === undefined ? undefined : ligne[position]?.trim();
      return cellule ? cellule : undefined;
    };
    const categorieCode = valeur("categorie_population_code")?.toUpperCase();
    const categorieId = categorieCode ? idParCode.get(categorieCode) : undefined;
    if (!categorieId) throw new Error(`La catégorie de population de la ligne ${index + 1} est inconnue.`);
    const tailleTexte = valeur("nombre_personnes");
    const taille = tailleTexte === undefined ? Number.NaN : Number(tailleTexte);
    const criteres = valeur("criteres_vulnerabilite")?.split("|").map((code) => code.trim().toUpperCase()).filter(Boolean) ?? [];
    const corps = {
      ...(valeur("province_id") ? { province_id: valeur("province_id") } : {}),
      departement_id: valeur("departement_id"),
      ...(valeur("sous_prefecture_id") ? { sous_prefecture_id: valeur("sous_prefecture_id") } : {}),
      ...(valeur("commune_id") ? { commune_id: valeur("commune_id") } : {}),
      ...(valeur("localite_id") ? { localite_id: valeur("localite_id") } : {}),
      ...(valeur("arrondissement_id") ? { arrondissement_id: valeur("arrondissement_id") } : {}),
      ...(valeur("quartier_id") ? { quartier_id: valeur("quartier_id") } : {}),
      ...(valeur("carre_id") ? { carre_id: valeur("carre_id") } : {}),
      ...(valeur("site_humanitaire_id") ? { site_humanitaire_id: valeur("site_humanitaire_id") } : {}),
      nom_chef_menage: valeur("nom_chef_menage"),
      sexe_chef: valeur("sexe_chef"),
      nombre_personnes: taille,
      ...(valeur("telephone") ? { telephone: valeur("telephone") } : {}),
      categorie_population_id: categorieId,
      criteres_vulnerabilite: criteres,
      date_enregistrement: format === "Excel" && valeur("date_enregistrement")
        ? convertirDateExcel(valeur("date_enregistrement") as string, date1904)
        : valeur("date_enregistrement"),
    };
    const resultat = schemaMenage.safeParse(corps);
    if (!resultat.success) throw new Error(`La ligne ${index + 1} du fichier ${format} est invalide : ${resultat.error.issues[0]?.message ?? "vérifiez ses valeurs"}.`);
    menages.push(resultat.data);
  }
  if (menages.length > 500) throw new Error("Une importation ne peut pas dépasser 500 ménages.");
  return { menages, provinceExposee: indexColonnes.has("province_id") };
}

async function lireCsvMenages(db: D1Database, fichier: File): Promise<{ menages: MenageSaisi[]; provinceExposee: boolean }> {
  if (fichier.size === 0 || fichier.size > 1_048_576) throw new Error("Le fichier CSV doit peser entre 1 octet et 1 Mo.");
  return convertirLignesMenages(db, decouperCsv(await fichier.text()), "CSV");
}

async function lireExcelMenages(db: D1Database, fichier: File): Promise<{ menages: MenageSaisi[]; provinceExposee: boolean }> {
  if (fichier.size === 0 || fichier.size > 1_048_576) throw new Error("Le classeur Excel doit peser entre 1 octet et 1 Mo.");
  const classeur = lireFeuilleExcelMenages(new Uint8Array(await fichier.arrayBuffer()));
  return convertirLignesMenages(db, classeur.lignes, "Excel", classeur.date1904);
}

async function preparerImport(
  c: Context<EnvironnementApplication>,
  menagesSaisis: readonly MenageSaisi[],
): Promise<{ lignes: ImportMenagePrepare[]; erreur: string | null; statut: 400 | 403 | 404 }> {
  const utilisateur = c.get("utilisateur");
  const identifiantsProvince = new Set<string>();
  for (const donnees of menagesSaisis) {
    if (utilisateur.role === "DELEGUE_PROVINCIAL" && donnees.province_id) {
      return { lignes: [], erreur: "La province d’un délégué est déterminée par sa session, jamais par le formulaire.", statut: 403 };
    }
    const provinceId = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : donnees.province_id;
    if (!provinceId) return { lignes: [], erreur: "Une province doit être précisée pour chaque ménage.", statut: 400 };
    identifiantsProvince.add(provinceId);
  }
  if (identifiantsProvince.size > 23) {
    return { lignes: [], erreur: "Une importation ne peut concerner que les 23 provinces du référentiel national.", statut: 400 };
  }
  const idsProvince = [...identifiantsProvince];
  const placeholdersProvince = idsProvince.map(() => "?").join(", ");
  const resultatProvinces = await c.env.DB.prepare(
    `SELECT id, code FROM provinces WHERE actif = 1 AND id IN (${placeholdersProvince})`,
  ).bind(...idsProvince).all<ProvinceD1>();
  const provinces = new Map(resultatProvinces.results.map((province) => [province.id, province]));
  const lignes: ImportMenagePrepare[] = [];
  for (const donnees of menagesSaisis) {
    const provinceId = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : donnees.province_id;
    if (!provinceId) return { lignes: [], erreur: "Une province doit être précisée pour chaque ménage.", statut: 400 };
    const province = provinces.get(provinceId);
    if (!province) return { lignes: [], erreur: "La province demandée est introuvable.", statut: 404 };
    lignes.push({
      id: identifiantMenage(),
      code: codeMenage(province.code),
      province_id: provinceId,
      donnees,
      telephone: normaliserTelephone(donnees.telephone),
      statut: "ACTIF",
      menageDoublonId: null,
    });
  }
  if (lignes.reduce((total, ligne) => total + ligne.donnees.membres.length, 0) > 1000) {
    return { lignes: [], erreur: "Une importation ne peut pas dépasser 1 000 membres de ménage.", statut: 400 };
  }
  return { lignes, erreur: null, statut: 400 };
}

async function enregistrerImport(
  c: Context<EnvironnementApplication>,
  menagesSaisis: readonly MenageSaisi[],
): Promise<Response> {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const preparation = await preparerImport(c, menagesSaisis);
  if (preparation.erreur) return c.json({ erreur: preparation.erreur }, preparation.statut);
  const lignes = preparation.lignes;
  if (lignes.length === 0) return reponseInvalide(c, "Aucun ménage à importer.");

  const controles = await verifierEtSignalerMenages(c.env.DB, lignes);
  if (!controles.valides) return reponseInvalide(c, "Une localisation, une catégorie ou une relation géographique n’est pas validée pour la province du ménage.");

  const instructions = lignes.map((ligne) => creerInstructionMenage(ligne, utilisateur));
  for (const ligne of lignes) instructions.push(...instructionsMembres(ligne.id, ligne.donnees.membres));
  const requetes = instructions.map((instruction) => c.env.DB.prepare(instruction));
  requetes.push(...instructionsSignalements(lignes).map((instruction) => c.env.DB.prepare(instruction)));
  requetes.push(creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "IMPORTATION_MENAGES",
    entiteType: "MENAGE",
    entiteId: lignes[0]?.id ?? crypto.randomUUID(),
    adresseIp: c.req.header("CF-Connecting-IP") ?? null,
  }));
  await c.env.DB.batch(requetes);
  return c.json({
    message: "Importation enregistrée. Les doublons possibles sont signalés pour vérification manuelle.",
    nombre_menages: lignes.length,
    doublons_signales: controles.nombreDoublons,
    codes_menage: lignes.map((ligne) => ligne.code),
  }, 201);
}

routesGestion.get("/referentiels", async (c) => {
  if (!autorise(c.get("utilisateur"), ROLES_LECTURE)) return reponseInterdite(c);
  const [categories, vulnerabilites] = await Promise.all([
    c.env.DB.prepare("SELECT id, code, libelle FROM categories_population ORDER BY libelle, id").all<CategoriePopulationD1>(),
    c.env.DB.prepare("SELECT code, libelle, niveau_priorite FROM vulnerabilites ORDER BY niveau_priorite DESC, libelle, code").all<{
      code: string;
      libelle: string;
      niveau_priorite: number;
    }>(),
  ]);
  return c.json({ categories_population: categories.results, vulnerabilites: vulnerabilites.results });
});

routesGestion.get("/partenaires", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c, schemaFiltresPartenaires);
  if (!filtres) return reponseInvalide(c, "Les filtres ou paramètres de pagination sont invalides.");
  const conditions = utilisateur.role === "DELEGUE_PROVINCIAL"
    ? ["(p.statut_validation = 'VALIDE' OR p.propose_par = ?)"]
    : ["1 = 1"];
  const valeurs: (string | number)[] = utilisateur.role === "DELEGUE_PROVINCIAL" ? [utilisateur.id] : [];
  ajouterCondition(conditions, valeurs, "p.statut_validation = ?", filtres.statut_validation);
  ajouterCondition(conditions, valeurs, "EXISTS (SELECT 1 FROM roles_partenaires rp WHERE rp.partenaire_id = p.id AND rp.role = ?)", filtres.role);
  if (filtres.recherche) {
    conditions.push("(p.nom LIKE ? OR p.sigle LIKE ?)");
    valeurs.push(`%${filtres.recherche}%`, `%${filtres.recherche}%`);
  }
  const where = conditions.join(" AND ");
  const page = await lirePage<PartenaireListe>(
    c.env.DB,
    `SELECT p.id, p.code, p.nom, p.sigle, p.type_organisation, p.contact_email,
      p.contact_telephone, p.statut_validation, p.cree_le FROM partenaires p
      WHERE ${where} ORDER BY p.nom COLLATE NOCASE, p.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM partenaires p WHERE ${where}`,
    valeurs,
    filtres.limite,
    filtres.decalage,
  );
  return c.json(page);
});

routesGestion.get("/partenaires/:partenaireId", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const conditions = utilisateur.role === "DELEGUE_PROVINCIAL"
    ? "p.id = ? AND (p.statut_validation = 'VALIDE' OR p.propose_par = ?)"
    : "p.id = ?";
  const valeurs = utilisateur.role === "DELEGUE_PROVINCIAL"
    ? [c.req.param("partenaireId"), utilisateur.id]
    : [c.req.param("partenaireId")];
  const partenaire = await c.env.DB.prepare(
    `SELECT p.id, p.code, p.nom, p.sigle, p.type_organisation, p.contact_email,
      p.contact_telephone, p.statut_validation, p.cree_le FROM partenaires p WHERE ${conditions}`,
  ).bind(...valeurs).first<PartenaireListe>();
  if (!partenaire) return c.json({ erreur: "Partenaire introuvable." }, 404);
  const roles = await c.env.DB.prepare("SELECT role FROM roles_partenaires WHERE partenaire_id = ? ORDER BY role")
    .bind(partenaire.id).all<{ role: string }>();
  return c.json<PartenaireDetail>({ ...partenaire, roles: roles.results.map((ligne) => ligne.role) });
});

routesGestion.post("/partenaires", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const resultat = await lireCorps(c, schemaCreationPartenaire);
  if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
  const partenaire = resultat.valeur;
  const nomExistant = await c.env.DB.prepare("SELECT id FROM partenaires WHERE lower(trim(nom)) = lower(trim(?))")
    .bind(partenaire.nom).first<{ id: string }>();
  if (nomExistant) return c.json({ erreur: "Un partenaire portant ce nom existe déjà." }, 409);
  const id = crypto.randomUUID();
  const statut = utilisateur.role === "DELEGUE_PROVINCIAL" ? "PROPOSE" : "VALIDE";
  if (statut === "PROPOSE" && !utilisateur.province_id) return reponseInterdite(c);
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO partenaires (id, nom, sigle, type_organisation, contact_email, contact_telephone,
        statut_validation, propose_par, valide_par)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      partenaire.nom,
      partenaire.sigle ?? null,
      partenaire.type_organisation,
      partenaire.contact_email ?? null,
      partenaire.contact_telephone ?? null,
      statut,
      statut === "PROPOSE" ? utilisateur.id : null,
      statut === "VALIDE" ? utilisateur.id : null,
    ),
    ...partenaire.roles.map((role) => c.env.DB.prepare("INSERT INTO roles_partenaires (id, partenaire_id, role) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), id, role)),
    creerInstructionAudit(c.env.DB, {
      utilisateur,
      action: statut === "PROPOSE" ? "PROPOSITION_PARTENAIRE" : "CREATION_PARTENAIRE",
      entiteType: "PARTENAIRE",
      entiteId: id,
      adresseIp: c.req.header("CF-Connecting-IP") ?? null,
      donneesApres: JSON.stringify({ nom: partenaire.nom, roles: partenaire.roles, statut_validation: statut }),
    }),
  ];
  await c.env.DB.batch(statements);
  return c.json({ id, nom: partenaire.nom, statut_validation: statut, roles: partenaire.roles }, 201);
});

routesGestion.post("/partenaires/:partenaireId/validation", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_CENTRAUX)) return reponseInterdite(c);
  const resultat = await lireCorps(c, schemaDecisionPartenaire);
  if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
  const id = c.req.param("partenaireId");
  const avant = await c.env.DB.prepare("SELECT statut_validation FROM partenaires WHERE id = ?").bind(id)
    .first<{ statut_validation: string }>();
  if (!avant) return c.json({ erreur: "Partenaire introuvable." }, 404);
  if (avant.statut_validation !== "PROPOSE") return c.json({ erreur: "Seule une proposition peut recevoir une décision." }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE partenaires SET statut_validation = ?, valide_par = ? WHERE id = ? AND statut_validation = 'PROPOSE'")
      .bind(resultat.valeur.decision, utilisateur.id, id),
    creerInstructionAudit(c.env.DB, {
      utilisateur,
      action: resultat.valeur.decision === "VALIDE" ? "VALIDATION_PARTENAIRE" : "REFUS_PARTENAIRE",
      entiteType: "PARTENAIRE",
      entiteId: id,
      adresseIp: c.req.header("CF-Connecting-IP") ?? null,
      donneesAvant: JSON.stringify(avant),
      donneesApres: JSON.stringify(resultat.valeur),
    }),
  ]);
  return c.json({ id, statut_validation: resultat.valeur.decision });
});

routesGestion.get("/menages", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c, schemaFiltresMenages);
  if (!filtres) return reponseInvalide(c, "Les filtres de ménage ou paramètres de pagination sont invalides.");
  const portee = obtenirProvince(utilisateur, filtres.province_id, false);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "m.province_id = ?", portee.provinceId);
  ajouterCondition(conditions, valeurs, "m.departement_id = ?", filtres.departement_id);
  ajouterCondition(conditions, valeurs, "m.localite_id = ?", filtres.localite_id);
  ajouterCondition(conditions, valeurs, "m.categorie_population_id = ?", filtres.categorie_population_id);
  ajouterCondition(conditions, valeurs, "m.statut = ?", filtres.statut);
  if (filtres.recherche) {
    conditions.push("(m.code_menage LIKE ? OR m.nom_chef_menage LIKE ? OR m.telephone LIKE ?)");
    const terme = `%${filtres.recherche}%`;
    valeurs.push(terme, terme, terme);
  }
  const where = conditions.join(" AND ");
  return c.json(await lirePage<MenageListe>(
    c.env.DB,
    `SELECT m.id, m.code_menage, m.province_id, m.departement_id, m.localite_id,
      m.nom_chef_menage, m.sexe_chef, m.nombre_personnes, m.telephone,
      m.categorie_population_id, cp.libelle AS categorie_population, m.statut, m.date_enregistrement
     FROM menages m INNER JOIN categories_population cp ON cp.id = m.categorie_population_id
     WHERE ${where} ORDER BY m.date_enregistrement DESC, m.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM menages m WHERE ${where}`,
    valeurs,
    filtres.limite,
    filtres.decalage,
  ));
});

routesGestion.get("/menages/:menageId", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const province = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !province) return reponseInterdite(c);
  const sql = `SELECT m.id, m.code_menage, m.province_id, m.departement_id, m.sous_prefecture_id,
      m.commune_id, m.localite_id, m.arrondissement_id, m.quartier_id, m.carre_id, m.site_humanitaire_id,
      m.nom_chef_menage, m.sexe_chef, m.nombre_personnes, m.telephone, m.categorie_population_id,
      m.criteres_vulnerabilite, m.date_enregistrement, m.statut
    FROM menages m WHERE m.id = ?${province ? " AND m.province_id = ?" : ""}`;
  const valeurs = province ? [c.req.param("menageId"), province] : [c.req.param("menageId")];
  const menage = await c.env.DB.prepare(sql).bind(...valeurs).first<Record<string, string | number | null>>();
  if (!menage) return c.json({ erreur: "Ménage introuvable." }, 404);
  const pagination = extraireFiltres(c, schemaPaginationGestion);
  if (!pagination) return reponseInvalide(c, "Les paramètres de pagination sont invalides.");
  const pageMembres = await lirePage<MembreMenageD1>(
    c.env.DB,
    "SELECT id, nom_complet, sexe, annee_naissance, lien_parente, identifiant_individuel FROM membres_menage WHERE menage_id = ? ORDER BY id LIMIT ? OFFSET ?",
    "SELECT COUNT(*) AS total FROM membres_menage WHERE menage_id = ?",
    [c.req.param("menageId")],
    pagination.limite,
    pagination.decalage,
  );
  return c.json({ menage, membres: pageMembres });
});

routesGestion.post("/menages", async (c) => {
  const resultat = await lireCorps(c, schemaMenage);
  if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
  return enregistrerImport(c, [resultat.valeur]);
});

routesGestion.post("/menages/importations", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const contenu = (c.req.header("Content-Type") ?? "").toLowerCase();
  let menages: MenageSaisi[];
  let provinceExposee = false;
  if (contenu.includes("application/json")) {
    const resultat = await lireCorps(c, schemaImportMenages);
    if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
    menages = resultat.valeur.menages;
    provinceExposee = menages.some((menage) => menage.province_id !== undefined);
  } else if (contenu.includes("multipart/form-data")) {
    let formulaire: FormData;
    try {
      formulaire = await c.req.formData();
    } catch {
      return reponseInvalide(c, "Le formulaire d’importation est invalide.");
    }
    const fichier = formulaire.get("fichier");
    if (!(fichier instanceof File)) return reponseInvalide(c, "Sélectionnez un fichier CSV ou un classeur Excel de ménages.");
    try {
      const extension = fichier.name.toLowerCase().split(".").pop();
      const resultat = extension === "csv"
        ? await lireCsvMenages(c.env.DB, fichier)
        : extension === "xlsx"
          ? await lireExcelMenages(c.env.DB, fichier)
          : null;
      if (!resultat) return reponseInvalide(c, "Le format accepté est CSV ou Excel (.xlsx).");
      menages = resultat.menages;
      provinceExposee = resultat.provinceExposee;
    } catch (erreur) {
      return reponseInvalide(c, erreur instanceof Error ? erreur.message : "Le fichier d’importation n’a pas pu être lu.");
    }
  } else {
    return reponseInvalide(c, "Transmettez un tableau JSON ou un fichier CSV/Excel multipart.");
  }
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && provinceExposee) return reponseInterdite(c);
  return enregistrerImport(c, menages);
});

routesGestion.get("/listes-beneficiaires", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const filtres = extraireFiltres(c, schemaPaginationGestion.extend({
    province_id: z.string().trim().min(1).max(120).optional(),
    statut: z.enum(["BROUILLON", "PRETE", "VERROUILLEE"]).optional(),
  }));
  if (!filtres) return reponseInvalide(c, "Les filtres de liste ou paramètres de pagination sont invalides.");
  const portee = obtenirProvince(utilisateur, filtres.province_id, false);
  if (!portee.autorisee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "province_id = ?", portee.provinceId);
  ajouterCondition(conditions, valeurs, "statut = ?", filtres.statut as string | undefined);
  const where = conditions.join(" AND ");
  return c.json(await lirePage<ListeBeneficiairesD1>(
    c.env.DB,
    `SELECT id, reference_liste, intitule, province_id, nombre_menages_cibles,
      nombre_personnes_cibles, statut, cree_le FROM listes_beneficiaires
     WHERE ${where} ORDER BY cree_le DESC, id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM listes_beneficiaires WHERE ${where}`,
    valeurs,
    filtres.limite,
    filtres.decalage,
  ));
});

routesGestion.get("/listes-beneficiaires/:listeId/export", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const provinceId = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !provinceId) return reponseInterdite(c);
  const listeId = c.req.param("listeId");
  const liste = await c.env.DB.prepare(
    "SELECT id, reference_liste FROM listes_beneficiaires WHERE id = ?" + (provinceId ? " AND province_id = ?" : ""),
  ).bind(...(provinceId ? [listeId, provinceId] : [listeId])).first<{ id: string; reference_liste: string }>();
  if (!liste) return c.json({ erreur: "Liste bénéficiaire introuvable." }, 404);

  const titres = [
    "Référence du ménage", "Province", "Département", "Localité", "Chef de ménage", "Sexe du chef",
    "Nombre de personnes", "Catégorie de population", "Critères de vulnérabilité", "Date d’enregistrement",
    "Statut du ménage", "Statut de vérification",
  ];
  const entete = `\ufeff${titres.map(champCsv).join(";")}\r\n`;
  const encodeur = new TextEncoder();
  const enTeteEncodee = encodeur.encode(entete);
  let decalage = 0;
  const sql = `SELECT m.code_menage, p.nom AS province, d.nom AS departement, l.nom AS localite,
      m.nom_chef_menage, m.sexe_chef, m.nombre_personnes, cp.libelle AS categorie_population,
      m.criteres_vulnerabilite, m.date_enregistrement, m.statut AS statut_menage, i.statut_verification
    FROM inscriptions_beneficiaires i
    INNER JOIN listes_beneficiaires lb ON lb.id = i.liste_id
    INNER JOIN menages m ON m.id = i.menage_id
    INNER JOIN provinces p ON p.id = m.province_id
    INNER JOIN departements d ON d.id = m.departement_id
    LEFT JOIN localites l ON l.id = m.localite_id
    INNER JOIN categories_population cp ON cp.id = m.categorie_population_id
    WHERE lb.id = ?${provinceId ? " AND lb.province_id = ?" : ""}
    ORDER BY i.ordre_affichage, m.code_menage LIMIT 100 OFFSET ?`;
  const stream = new ReadableStream<Uint8Array>({
    start(controleur) {
      controleur.enqueue(enTeteEncodee);
    },
    async pull(controleur) {
      try {
        const parametres: (string | number)[] = provinceId ? [listeId, provinceId, decalage] : [listeId, decalage];
        const page = await c.env.DB.prepare(sql).bind(...parametres).all<LigneExportBeneficiaire>();
        const lignes = page.results.map((ligne) => [
          ligne.code_menage, ligne.province, ligne.departement, ligne.localite, ligne.nom_chef_menage,
          ligne.sexe_chef === "F" ? "Féminin" : "Masculin", ligne.nombre_personnes, ligne.categorie_population,
          ligne.criteres_vulnerabilite, ligne.date_enregistrement, ligne.statut_menage, ligne.statut_verification,
        ].map(champCsv).join(";")).join("\r\n");
        if (lignes) controleur.enqueue(encodeur.encode(`${lignes}\r\n`));
        decalage += page.results.length;
        if (page.results.length < 100) controleur.close();
      } catch {
        controleur.error(new Error("L’export de la liste bénéficiaire a échoué."));
      }
    },
  });
  const referenceSecurisee = liste.reference_liste.replace(/[^a-zA-Z0-9_-]/gu, "_");
  return c.body(stream, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${referenceSecurisee}.csv"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
});

routesGestion.post("/listes-beneficiaires", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const resultat = await lireCorps(c, schemaCreationListeBeneficiaires);
  if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && resultat.valeur.province_id) return reponseInterdite(c);
  const portee = obtenirProvince(utilisateur, resultat.valeur.province_id, true);
  if (!portee.autorisee || !portee.provinceId) return reponseInvalide(c, "La province est obligatoire pour créer une liste.");
  const province = await c.env.DB.prepare("SELECT code FROM provinces WHERE id = ? AND actif = 1")
    .bind(portee.provinceId).first<{ code: string }>();
  if (!province) return c.json({ erreur: "Province introuvable." }, 404);
  const id = crypto.randomUUID();
  const reference = `BEN-${province.code.replace(/^TD-/u, "")}-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO listes_beneficiaires (id, reference_liste, intitule, province_id, cree_par) VALUES (?, ?, ?, ?, ?)")
      .bind(id, reference, resultat.valeur.intitule, portee.provinceId, utilisateur.id),
    creerInstructionAudit(c.env.DB, {
      utilisateur,
      action: "CREATION_LISTE_BENEFICIAIRES",
      entiteType: "LISTE_BENEFICIAIRES",
      entiteId: id,
      adresseIp: c.req.header("CF-Connecting-IP") ?? null,
      donneesApres: JSON.stringify({ reference_liste: reference, province_id: portee.provinceId }),
    }),
  ]);
  return c.json({ id, reference_liste: reference, intitule: resultat.valeur.intitule, province_id: portee.provinceId, statut: "BROUILLON" }, 201);
});

routesGestion.get("/listes-beneficiaires/:listeId/menages", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const pagination = extraireFiltres(c, schemaPaginationGestion);
  if (!pagination) return reponseInvalide(c, "Les paramètres de pagination sont invalides.");
  const portee = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !portee) return reponseInterdite(c);
  const conditions = ["i.liste_id = ?"];
  const valeurs: (string | number)[] = [c.req.param("listeId")];
  ajouterCondition(conditions, valeurs, "lb.province_id = ?", portee);
  const where = conditions.join(" AND ");
  const page = await lirePage<MenageListe>(
    c.env.DB,
    `SELECT m.id, m.code_menage, m.province_id, m.departement_id, m.localite_id,
      m.nom_chef_menage, m.sexe_chef, m.nombre_personnes, m.telephone,
      m.categorie_population_id, cp.libelle AS categorie_population, m.statut, m.date_enregistrement
     FROM inscriptions_beneficiaires i INNER JOIN listes_beneficiaires lb ON lb.id = i.liste_id
     INNER JOIN menages m ON m.id = i.menage_id INNER JOIN categories_population cp ON cp.id = m.categorie_population_id
     WHERE ${where} ORDER BY i.ordre_affichage, m.code_menage LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM inscriptions_beneficiaires i
     INNER JOIN listes_beneficiaires lb ON lb.id = i.liste_id WHERE ${where}`,
    valeurs,
    pagination.limite,
    pagination.decalage,
  );
  if (page.total === 0) {
    const liste = await c.env.DB.prepare("SELECT id FROM listes_beneficiaires WHERE id = ?" + (portee ? " AND province_id = ?" : ""))
      .bind(...(portee ? [c.req.param("listeId"), portee] : [c.req.param("listeId")])).first<{ id: string }>();
    if (!liste) return c.json({ erreur: "Liste bénéficiaire introuvable." }, 404);
  }
  return c.json(page);
});

routesGestion.post("/listes-beneficiaires/:listeId/inscriptions", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const resultat = await lireCorps(c, schemaInscriptionsBeneficiaires);
  if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
  const portee = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !portee) return reponseInterdite(c);
  const liste = await c.env.DB.prepare(
    "SELECT id, province_id, statut FROM listes_beneficiaires WHERE id = ?" + (portee ? " AND province_id = ?" : ""),
  ).bind(...(portee ? [c.req.param("listeId"), portee] : [c.req.param("listeId")])).first<{
    id: string;
    province_id: string;
    statut: string;
  }>();
  if (!liste) return c.json({ erreur: "Liste bénéficiaire introuvable." }, 404);
  if (liste.statut === "VERROUILLEE") return c.json({ erreur: "La liste est verrouillée et ne peut plus être modifiée." }, 409);
  const ids = [...new Set(resultat.valeur.menage_ids)];
  if (ids.length !== resultat.valeur.menage_ids.length) return c.json({ erreur: "La demande contient un même ménage plusieurs fois." }, 409);
  const listeSql = ids.map(protegerSql).join(", ");
  const menages = await c.env.DB.prepare(
    `SELECT id, province_id, nombre_personnes, statut FROM menages WHERE id IN (${listeSql}) AND province_id = ${protegerSql(liste.province_id)} AND statut = 'ACTIF'`,
  ).all<{ id: string; province_id: string; nombre_personnes: number; statut: string }>();
  if (menages.results.length !== ids.length) return reponseInvalide(c, "Tous les ménages doivent être actifs et appartenir à la province de la liste.");
  const dejaInscrits = await c.env.DB.prepare(
    `SELECT menage_id FROM inscriptions_beneficiaires WHERE liste_id = ${protegerSql(liste.id)} AND menage_id IN (${listeSql})`,
  ).all<{ menage_id: string }>();
  if (dejaInscrits.results.length > 0) return c.json({ erreur: "Au moins un ménage figure déjà dans cette liste." }, 409);
  const statements = ids.map((menageId, ordre) => c.env.DB.prepare(
    "INSERT INTO inscriptions_beneficiaires (id, liste_id, menage_id, ordre_affichage, statut_verification) VALUES (?, ?, ?, ?, 'VALIDE')",
  ).bind(crypto.randomUUID(), liste.id, menageId, ordre + 1));
  const nombrePersonnesAjoutees = menages.results.reduce((total, menage) => total + menage.nombre_personnes, 0);
  statements.push(c.env.DB.prepare(
    "UPDATE listes_beneficiaires SET nombre_menages_cibles = nombre_menages_cibles + ?, nombre_personnes_cibles = nombre_personnes_cibles + ? WHERE id = ? AND statut <> 'VERROUILLEE'",
  ).bind(ids.length, nombrePersonnesAjoutees, liste.id));
  statements.push(creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: "INSCRIPTION_MENAGES_BENEFICIAIRES",
    entiteType: "LISTE_BENEFICIAIRES",
    entiteId: liste.id,
    adresseIp: c.req.header("CF-Connecting-IP") ?? null,
    donneesApres: JSON.stringify({ nombre_menages: ids.length }),
  }));
  await c.env.DB.batch(statements);
  return c.json({ message: "Les ménages ont été ajoutés à la liste bénéficiaire.", nombre_menages: ids.length });
});

routesGestion.get("/signalements-doublons", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_LECTURE)) return reponseInterdite(c);
  const pagination = extraireFiltres(c, schemaPaginationGestion);
  if (!pagination) return reponseInvalide(c, "Les paramètres de pagination sont invalides.");
  const portee = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !portee) return reponseInterdite(c);
  const conditions = ["1 = 1"];
  const valeurs: (string | number)[] = [];
  ajouterCondition(conditions, valeurs, "sd.province_id = ?", portee);
  const where = conditions.join(" AND ");
  return c.json(await lirePage<SignalementDoublonD1>(
    c.env.DB,
    `SELECT sd.id, sd.province_id, sd.menage_source_id, sd.menage_suspect_id,
      sd.motif_similitude, sd.statut_traitement, sd.cree_le FROM signalements_doublons sd
     WHERE ${where} ORDER BY sd.cree_le DESC, sd.id LIMIT ? OFFSET ?`,
    `SELECT COUNT(*) AS total FROM signalements_doublons sd WHERE ${where}`,
    valeurs,
    pagination.limite,
    pagination.decalage,
  ));
});

routesGestion.post("/signalements-doublons/:signalementId/decision", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (!autorise(utilisateur, ROLES_OPERATIONNELS)) return reponseInterdite(c);
  const resultat = await lireCorps(c, schemaDecisionDoublon);
  if ("erreur" in resultat) return reponseInvalide(c, resultat.erreur);
  const portee = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : null;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" && !portee) return reponseInterdite(c);
  const signalement = await c.env.DB.prepare(
    "SELECT id, province_id, menage_source_id, menage_suspect_id, statut_traitement FROM signalements_doublons WHERE id = ?" + (portee ? " AND province_id = ?" : ""),
  ).bind(...(portee ? [c.req.param("signalementId"), portee] : [c.req.param("signalementId")])).first<SignalementDoublonD1>();
  if (!signalement) return c.json({ erreur: "Signalement de doublon introuvable." }, 404);
  if (signalement.statut_traitement !== "EN_ATTENTE") return c.json({ erreur: "Ce signalement a déjà été traité." }, 409);
  const avant = await c.env.DB.prepare("SELECT statut FROM menages WHERE id = ? AND province_id = ?")
    .bind(signalement.menage_suspect_id, signalement.province_id).first<{ statut: string }>();
  if (!avant) return c.json({ erreur: "Ménage suspect introuvable." }, 404);
  const statements = [
    c.env.DB.prepare(
      "UPDATE signalements_doublons SET statut_traitement = ?, traite_par = ?, observations = ? WHERE id = ? AND statut_traitement = 'EN_ATTENTE'",
    ).bind(resultat.valeur.decision, utilisateur.id, resultat.valeur.observations ?? null, signalement.id),
  ];
  if (resultat.valeur.decision === "CONFIRME_DOUBLON") {
    statements.push(c.env.DB.prepare("UPDATE menages SET statut = 'DOUBLON_SUSPECTE' WHERE id = ? AND province_id = ?")
      .bind(signalement.menage_suspect_id, signalement.province_id));
  }
  statements.push(creerInstructionAudit(c.env.DB, {
    utilisateur,
    action: resultat.valeur.decision,
    entiteType: "SIGNALEMENT_DOUBLON",
    entiteId: signalement.id,
    adresseIp: c.req.header("CF-Connecting-IP") ?? null,
    donneesAvant: JSON.stringify({ statut_traitement: signalement.statut_traitement, statut_menage: avant.statut }),
    donneesApres: JSON.stringify(resultat.valeur),
  }));
  await c.env.DB.batch(statements);
  return c.json({ id: signalement.id, statut_traitement: resultat.valeur.decision });
});

export { routesGestion };
