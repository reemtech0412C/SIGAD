import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dossierMigrations = resolve(racine, "migrations");
const specification = await readFile(resolve(racine, "sigad_v3_0.md"), "utf8");
const fichiers = (await readdir(dossierMigrations))
  .filter((nom) => /^\d{4}_.*\.sql$/u.test(nom))
  .sort((premier, second) => premier.localeCompare(second));

if (fichiers.length !== 16) throw new Error(`Les seize migrations versionnées attendues jusqu’à la Phase 6 sont requises; ${fichiers.length} trouvées.`);

function extraireTables(sql) {
  const tables = new Map();
  const expression = /CREATE TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\);/giu;
  for (const correspondance of sql.matchAll(expression)) {
    const nom = correspondance[1];
    const corps = correspondance[2];
    if (!nom || !corps) throw new Error("Une définition de table est illisible.");
    const champs = corps.split(/\r?\n/u).flatMap((ligne) => {
      const sansCommentaire = ligne.split("--", 1)[0]?.trim() ?? "";
      if (/^(?:CHECK|CONSTRAINT|FOREIGN|PRIMARY|UNIQUE)\b/iu.test(sansCommentaire)) return [];
      const correspondanceChamp = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+/u.exec(sansCommentaire);
      return correspondanceChamp?.[1] ? [correspondanceChamp[1]] : [];
    });
    tables.set(nom, champs);
  }
  return tables;
}

function extraireIndexes(sql) {
  const indexes = new Map();
  const expression = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ON\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;]*?)\)(?:\s+WHERE\s+[^;]+)?\s*;/giu;
  for (const correspondance of sql.matchAll(expression)) {
    const nom = correspondance[1];
    const table = correspondance[2];
    const champs = correspondance[3]?.replace(/\s+/gu, " ").trim().toLowerCase();
    if (!nom || !table || !champs) throw new Error("Une définition d’index est illisible.");
    indexes.set(nom, `${table.toLowerCase()}(${champs})`);
  }
  return indexes;
}

function verifierContraintes(base, source) {
  let rejetCheck = false;
  try {
    base.prepare(
      `INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash)
       VALUES ('validation-check', 'validation-check', 'Validation', 'ROLE_INVALIDE', NULL, 'empreinte')`,
    ).run();
  } catch (erreur) {
    rejetCheck = erreur instanceof Error && /CHECK constraint failed/iu.test(erreur.message);
  }
  if (!rejetCheck) throw new Error(`${source}: une valeur de rôle interdite n’a pas été rejetée par CHECK.`);

  let rejetUnique = false;
  try {
    base.prepare(
      `INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash)
       VALUES ('validation-unique', 'proprietaire', 'Validation', 'PROPRIETAIRE', NULL, 'empreinte')`,
    ).run();
  } catch (erreur) {
    rejetUnique = erreur instanceof Error && /UNIQUE constraint failed/iu.test(erreur.message);
  }
  if (!rejetUnique) throw new Error(`${source}: une valeur identifiant dupliquée n’a pas été rejetée par UNIQUE.`);
}

async function verifierBaseD1Locale() {
  const dossierEtat = process.env.SIGAD_D1_STATE_DIR ?? resolve(racine, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const candidats = (await readdir(dossierEtat)).filter((nom) => nom.endsWith(".sqlite") && nom !== "metadata.sqlite");
  let baseD1;
  let cheminBase;
  for (const candidat of candidats) {
    const chemin = join(dossierEtat, candidat);
    const essai = new DatabaseSync(chemin);
    const contientSchemaSigad = essai.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'utilisateurs'",
    ).get().total === 1;
    if (contientSchemaSigad) {
      baseD1 = essai;
      cheminBase = chemin;
      break;
    }
    essai.close();
  }
  if (!baseD1 || !cheminBase) throw new Error("Aucune base D1 locale contenant le schéma SIGAD n’a été trouvée.");

  try {
    const nombreTables = baseD1.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations', '_cf_METADATA')",
    ).get().total;
    if (nombreTables !== 62) {
      const nomsTables = baseD1.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations', '_cf_METADATA') ORDER BY name",
      ).all().map((ligne) => ligne.name);
      throw new Error(`D1 local contient ${nombreTables} tables SIGAD au lieu de 62: ${nomsTables.join(", ")}.`);
    }

    for (const [nom, champsSpecification] of colonnesAttenduesD1) {
      const champsD1 = baseD1.prepare(`PRAGMA table_xinfo("${nom.replaceAll('"', '""')}")`).all().map((champ) => champ.name);
      if (champsD1.length !== champsSpecification.length || champsD1.some((champ, index) => champ !== champsSpecification[index])) {
        throw new Error(`D1 local: les colonnes de ${nom} diffèrent de la spécification.`);
      }
    }

    const nombreProvinces = baseD1.prepare("SELECT COUNT(*) AS total FROM provinces").get().total;
    const nombreUtilisateurs = baseD1.prepare("SELECT COUNT(*) AS total FROM utilisateurs").get().total;
    const proprietaires = baseD1.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'PROPRIETAIRE'").get().total;
    const administrateurs = baseD1.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'ADMIN_CENTRAL'").get().total;
    const delegues = baseD1.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL'").get().total;
    const comptesAvecActivationSecurisee = baseD1.prepare(
      "SELECT COUNT(*) AS total FROM utilisateurs WHERE mot_de_passe_hash LIKE 'pbkdf2-sha256$310000$%' AND code_activation_hash = mot_de_passe_hash AND doit_changer_mot_de_passe = 1",
    ).get().total;
    const nombreCategories = baseD1.prepare("SELECT COUNT(*) AS total FROM categories_aide").get().total;
    const nombreCategoriesPopulation = baseD1.prepare("SELECT COUNT(*) AS total FROM categories_population").get().total;
    const nombreVulnerabilites = baseD1.prepare("SELECT COUNT(*) AS total FROM vulnerabilites").get().total;
    const nombreCommunes = baseD1.prepare("SELECT COUNT(*) AS total FROM communes").get().total;
    const nombreCommunesEnRelecture = baseD1.prepare("SELECT COUNT(*) AS total FROM communes WHERE statut_validation = 'PROPOSE'").get().total;
    const nombreCommunesActives = baseD1.prepare("SELECT COUNT(*) AS total FROM communes WHERE actif = 1 AND statut_validation = 'VALIDE'").get().total;
    const nombreUnites = baseD1.prepare("SELECT COUNT(*) AS total FROM unites_mesure").get().total;
    const nombreMigrations = baseD1.prepare("SELECT COUNT(*) AS total FROM d1_migrations").get().total;
    const nombreIndexesD1 = baseD1.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
    ).get().total;
    const nombreDeclencheursD1 = baseD1.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'verifier_%'",
    ).get().total;
    const erreursClesEtrangeres = baseD1.prepare("PRAGMA foreign_key_check").all();
    if (
      nombreProvinces !== 23 || nombreUtilisateurs !== 25 || proprietaires !== 1 || administrateurs !== 1 || delegues !== 23 ||
      comptesAvecActivationSecurisee !== 25 || nombreCategories !== 5 || nombreUnites !== 6 ||
      nombreCategoriesPopulation !== 5 || nombreVulnerabilites !== 5 || nombreCommunes !== 500 ||
      nombreCommunesEnRelecture !== 500 || nombreCommunesActives !== 0
    ) {
      throw new Error("D1 local: le nombre d’éléments du seed est incohérent.");
    }
    if (nombreMigrations !== fichiers.length) throw new Error(`D1 local enregistre ${nombreMigrations} migrations au lieu de ${fichiers.length}.`);
    if (nombreIndexesD1 !== indexesMigrations.size) throw new Error(`D1 local contient ${nombreIndexesD1} index nommés au lieu des ${indexesMigrations.size} index versionnés.`);
    if (nombreDeclencheursD1 !== declencheursMigrations) throw new Error(`D1 local contient ${nombreDeclencheursD1} contrôles au lieu des ${declencheursMigrations} déclencheurs de validation versionnés.`);
    if (erreursClesEtrangeres.length > 0) throw new Error("D1 local présente une violation de clé étrangère.");
    verifierContraintes(baseD1, "D1 local");
    verifierCorrespondanceProvinces(baseD1, "D1 local");
    console.log(`PASS — Wrangler D1 local (${cheminBase}) : ${nombreMigrations} migrations enregistrées; 62 tables et colonnes conformes; ${nombreIndexesD1} index et ${nombreDeclencheursD1} déclencheurs de validation; 23 provinces comparées au fichier source; 500 communes importées en relecture (0 activée); 25 comptes (1 propriétaire, 1 administrateur central, 23 délégués); 25 codes d’activation hachés avec changement obligatoire; 5 catégories d’aide, 5 catégories de population, 5 vulnérabilités, 6 unités; contraintes CHECK et UNIQUE actives; aucune violation de clé étrangère.`);
  } finally {
    baseD1.close();
  }
}

const sectionsSpecification = [...specification.matchAll(/^### 3\.([1-7])\..*$/gmu)];
if (sectionsSpecification.length !== 7) throw new Error(`La spécification contient ${sectionsSpecification.length} sections de schéma au lieu de 7.`);
const tablesSpecification = new Map();
for (let index = 0; index < sectionsSpecification.length; index += 1) {
  const section = sectionsSpecification[index];
  const debut = section?.index;
  const fin = sectionsSpecification[index + 1]?.index ?? specification.indexOf("## 🔐 4.", debut);
  if (debut === undefined || fin < 0) throw new Error("Les bornes des sections de schéma sont invalides.");
  const contenu = specification.slice(debut, fin);
  const blocSql = /```sql\s*([\s\S]*?)```/iu.exec(contenu)?.[1];
  if (!blocSql) throw new Error(`La section ${section?.[1] ?? "?"} ne contient pas de schéma SQL.`);
  for (const [nom, champs] of extraireTables(blocSql)) tablesSpecification.set(nom, champs);
}

const tablesMigrations = new Map();
let sqlMigrationsSchema = "";
for (const fichier of fichiers.slice(0, 7)) {
  const sqlMigration = await readFile(resolve(dossierMigrations, fichier), "utf8");
  sqlMigrationsSchema += `\n${sqlMigration}`;
  for (const [nom, champs] of extraireTables(sqlMigration)) {
    tablesMigrations.set(nom, champs);
  }
}
for (const fichier of fichiers.slice(7)) {
  sqlMigrationsSchema += `\n${await readFile(resolve(dossierMigrations, fichier), "utf8")}`;
}
if (tablesSpecification.size !== 62) throw new Error(`La spécification contient ${tablesSpecification.size} tables au lieu des 62 définitions recensées.`);
if (tablesMigrations.size !== tablesSpecification.size) throw new Error(`Les migrations contiennent ${tablesMigrations.size} tables contre ${tablesSpecification.size} dans la spécification.`);
for (const [nom, champsSpecification] of tablesSpecification) {
  const champsMigration = tablesMigrations.get(nom);
  if (!champsMigration) throw new Error(`La table ${nom} de la spécification est absente des migrations.`);
  if (champsMigration.length !== champsSpecification.length || champsMigration.some((champ, index) => champ !== champsSpecification[index])) {
    throw new Error(`Les champs ou leur ordre diffèrent pour ${nom}: spécification [${champsSpecification.join(", ")}], migrations [${champsMigration.join(", ")}].`);
  }
}
const colonnesAttenduesD1 = new Map([...tablesSpecification].map(([nom, champs]) => [nom, [...champs]]));
for (const correspondance of sqlMigrationsSchema.matchAll(/ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ADD\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)/giu)) {
  const nomTable = correspondance[1];
  const nomColonne = correspondance[2];
  const champs = nomTable ? colonnesAttenduesD1.get(nomTable) : undefined;
  if (!nomTable || !nomColonne || !champs || champs.includes(nomColonne)) {
    throw new Error(`Une extension de schéma est dupliquée ou vise une table non documentée: ${nomTable ?? "table inconnue"}.${nomColonne ?? "colonne inconnue"}.`);
  }
  champs.push(nomColonne);
}
const indexesSpecification = extraireIndexes(specification);
const indexesMigrations = extraireIndexes(sqlMigrationsSchema);
if (indexesSpecification.size !== 10) throw new Error(`La spécification contient ${indexesSpecification.size} index métier au lieu de 10.`);
for (const [nom, definitionSpecification] of indexesSpecification) {
  if (indexesMigrations.get(nom) !== definitionSpecification) throw new Error(`L’index ${nom} est absent ou diffère de la spécification.`);
}
const declencheursMigrations = new Set(
  [...sqlMigrationsSchema.matchAll(/CREATE\s+TRIGGER\s+verifier_([a-zA-Z_][a-zA-Z0-9_]*)/giu)].map((correspondance) => correspondance[1]),
).size;
if (indexesMigrations.size !== 61) throw new Error(`Les migrations contiennent ${indexesMigrations.size} index explicites au lieu des 61 index de sécurité, du référentiel territorial, du ciblage, du dédoublonnage, du stock, des approvisionnements et des distributions attendus.`);
if (declencheursMigrations !== 61) throw new Error(`Les migrations contiennent ${declencheursMigrations} déclencheurs de validation distincts au lieu des 61 attendus après remplacement des déclencheurs historiques.`);

function verifierCorrespondanceProvinces(base, source) {
  const texteCsv = requireContenuCsvProvinces;
  const lignes = texteCsv.trim().split(/\r?\n/u).slice(1);
  const correspondances = lignes.map((ligne) => {
    const colonnes = /^"([^"]+)";"([^"]+)";"([^"]+)"/u.exec(ligne);
    if (!colonnes?.[2] || !colonnes[3]) throw new Error("Le fichier source territorial ne porte pas une correspondance province lisible.");
    return { id: colonnes[2], nom: colonnes[3] };
  });
  const provincesSource = new Map(correspondances.map((ligne) => [ligne.id, ligne.nom]));
  const provincesD1 = base.prepare("SELECT id, nom FROM provinces ORDER BY id").all();
  if (provincesSource.size !== 23 || provincesD1.length !== 23) throw new Error(`${source}: les 23 provinces du droit et de D1 ne sont pas présentes.`);
  if (correspondances.length !== 500) throw new Error(`${source}: le fichier source doit rattacher les 500 communes aux provinces.`);
  for (const province of provincesD1) {
    if (provincesSource.get(province.id) !== province.nom) {
      throw new Error(`${source}: la correspondance de province ${province.id} ne correspond pas au nom D1 ${province.nom}.`);
    }
  }
  for (const ligne of correspondances) {
    if (!provincesSource.has(ligne.id)) throw new Error(`${source}: la commune est rattachée à une province non documentée (${ligne.id}).`);
  }
}

const requireContenuCsvProvinces = await readFile(resolve(racine, "sources/referentiel-territorial/communes-loi-015-2024.csv"), "utf8");

const base = new DatabaseSync(":memory:");
try {
  base.exec("PRAGMA foreign_keys = ON;");
  for (const fichier of fichiers) base.exec(await readFile(resolve(dossierMigrations, fichier), "utf8"));

  const nombreTables = base.prepare(
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).get().total;
  const nombreProvinces = base.prepare("SELECT COUNT(*) AS total FROM provinces").get().total;
  const nombreUtilisateurs = base.prepare("SELECT COUNT(*) AS total FROM utilisateurs").get().total;
  const comptesAvecActivationSecurisee = base.prepare(
    "SELECT COUNT(*) AS total FROM utilisateurs WHERE mot_de_passe_hash LIKE 'pbkdf2-sha256$310000$%' AND code_activation_hash = mot_de_passe_hash AND doit_changer_mot_de_passe = 1",
  ).get().total;
  const nombreProprietaires = base.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'PROPRIETAIRE'").get().total;
  const nombreAdministrateurs = base.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'ADMIN_CENTRAL'").get().total;
  const nombreDelegues = base.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'DELEGUE_PROVINCIAL'").get().total;
  const nombreCategories = base.prepare("SELECT COUNT(*) AS total FROM categories_aide").get().total;
  const nombreCategoriesPopulation = base.prepare("SELECT COUNT(*) AS total FROM categories_population").get().total;
  const nombreVulnerabilites = base.prepare("SELECT COUNT(*) AS total FROM vulnerabilites").get().total;
  const nombreCommunes = base.prepare("SELECT COUNT(*) AS total FROM communes").get().total;
  const nombreCommunesEnRelecture = base.prepare("SELECT COUNT(*) AS total FROM communes WHERE statut_validation = 'PROPOSE'").get().total;
  const nombreCommunesActives = base.prepare("SELECT COUNT(*) AS total FROM communes WHERE actif = 1 AND statut_validation = 'VALIDE'").get().total;
  const nombreUnites = base.prepare("SELECT COUNT(*) AS total FROM unites_mesure").get().total;
  const nombreIndexes = base.prepare(
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
  ).get().total;
  const nombreDeclencheurs = base.prepare(
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'verifier_%'",
  ).get().total;
  const erreursClesEtrangeres = base.prepare("PRAGMA foreign_key_check").all();

  if (nombreTables !== 62) throw new Error(`Le schéma contient ${nombreTables} tables au lieu des 62 tables détaillées dans la spécification.`);
  if (nombreProvinces !== 23) throw new Error(`Le seed contient ${nombreProvinces} provinces au lieu de 23.`);
  if (nombreUtilisateurs !== 25) throw new Error(`Le seed contient ${nombreUtilisateurs} comptes au lieu de 25.`);
  if (comptesAvecActivationSecurisee !== 25) throw new Error("Le seed doit imposer un code d’activation haché et un changement initial aux 25 comptes.");
  if (nombreProprietaires !== 1 || nombreAdministrateurs !== 1 || nombreDelegues !== 23) {
    throw new Error("La répartition des 25 comptes par rôle est incohérente.");
  }
  if (nombreCategories !== 5) throw new Error(`Le référentiel contient ${nombreCategories} catégories d’aide au lieu de 5.`);
  if (nombreUnites !== 6) throw new Error(`Le référentiel contient ${nombreUnites} unités de mesure au lieu de 6.`);
  if (nombreIndexes !== indexesMigrations.size) throw new Error(`Le schéma contient ${nombreIndexes} index nommés au lieu des ${indexesMigrations.size} index définis.`);
  if (nombreDeclencheurs !== declencheursMigrations) throw new Error(`Le schéma contient ${nombreDeclencheurs} déclencheurs de validation au lieu de ${declencheursMigrations}.`);
  if (erreursClesEtrangeres.length > 0) throw new Error("La vérification des clés étrangères a détecté une incohérence.");
  verifierContraintes(base, "SQLite vierge");

  if (nombreCategoriesPopulation !== 5 || nombreVulnerabilites !== 5 || nombreCommunes !== 500 || nombreCommunesEnRelecture !== 500 || nombreCommunesActives !== 0) {
    throw new Error(`Le référentiel territorial et bénéficiaire est incohérent : ${nombreCommunes} communes (${nombreCommunesEnRelecture} à relire, ${nombreCommunesActives} activées), ${nombreCategoriesPopulation} catégories de population et ${nombreVulnerabilites} vulnérabilités.`);
  }
  verifierCorrespondanceProvinces(base, "SQLite vierge");
  console.log(`PASS — SQLite vierge : ${fichiers.length} migrations (0001–0007, seed 0008, corrections 0009–${fichiers.at(-1)?.slice(0, 4)}) appliquées; 62 tables et champs conformes à la spécification; ${nombreIndexes} index; ${nombreDeclencheurs} déclencheurs de validation; 23 provinces comparées au fichier source; 500 communes en relecture, aucune activée; 25 comptes; 5 catégories de population; 5 vulnérabilités; 5 catégories d’aide; 6 unités; contraintes CHECK et UNIQUE actives; aucune violation de clé étrangère.`);
  if (process.argv.includes("--d1-local")) await verifierBaseD1Locale();
} finally {
  base.close();
}
