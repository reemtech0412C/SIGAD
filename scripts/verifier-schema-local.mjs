import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { comparerRoleEtPorteeOmbre } from "../backend/src/core/authz/ombre.ts";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dossierMigrations = resolve(racine, "migrations");
const specification = await readFile(resolve(racine, "sigad_v3_0.md"), "utf8");
const fichiers = (await readdir(dossierMigrations))
  .filter((nom) => /^\d{4}_.*\.sql$/u.test(nom))
  .sort((premier, second) => premier.localeCompare(second));

if (fichiers.length !== 45 || !fichiers.at(-1)?.startsWith("0045_")) {
  throw new Error(`Les quarante-cinq migrations versionnées, jusqu’aux drapeaux et approbations de plateforme 0045, sont requises; ${fichiers.length} trouvées.`);
}

const tablesGeoB23 = [
  "geo_sources", "geo_types_unites", "geo_regles_parente", "geo_unites", "geo_rattachements",
  "geo_fermeture", "geo_codes_externes", "geo_alias", "geo_journal_versions",
];

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
  const expression = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+ON\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;]*?)\)(?:\s+WHERE\s+[^;]+)?\s*;/giu;
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

  let rejetDelegueActifDuplique = false;
  try {
    base.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, statut)
      VALUES ('validation-delegue-actif', 'validation-delegue-actif', 'Validation', 'DELEGUE_PROVINCIAL', 'prov-sila', 'empreinte', 'ACTIF')`).run();
  } catch (erreur) {
    rejetDelegueActifDuplique = erreur instanceof Error && /UNIQUE constraint failed/iu.test(erreur.message);
  }
  if (!rejetDelegueActifDuplique) throw new Error(`${source}: deux comptes délégués actifs ont été acceptés pour une même province.`);

  let rejetCourrielDuplique = false;
  base.exec("SAVEPOINT verifier_courriel_unique;");
  try {
    base.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, courriel)
      VALUES ('validation-courriel-1', 'validation-courriel-1', 'Validation', 'ADMIN_CENTRAL', NULL, 'empreinte', 'unique@example.invalid')`).run();
    base.prepare(`INSERT INTO utilisateurs (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, courriel)
      VALUES ('validation-courriel-2', 'validation-courriel-2', 'Validation', 'ADMIN_CENTRAL', NULL, 'empreinte', ' UNIQUE@example.invalid ' )`).run();
  } catch (erreur) {
    rejetCourrielDuplique = erreur instanceof Error && /UNIQUE constraint failed/iu.test(erreur.message);
  } finally {
    base.exec("ROLLBACK TO verifier_courriel_unique; RELEASE verifier_courriel_unique;");
  }
  if (!rejetCourrielDuplique) throw new Error(`${source}: une adresse e-mail insensible à la casse ou aux espaces a été dupliquée.`);
}

function verifierEgaliteRolesPorteesOmbre(base, source) {
  const utilisateurs = base.prepare(`SELECT u.id, u.role, u.province_id,
      cc.perimetre AS perimetre_consultation,
      (SELECT json_group_array(p.province_id) FROM perimetres_provinciaux_consultation p
        WHERE p.compte_consultation_id = cc.id) AS provinces_autorisees_json,
      (SELECT p.role_terrain FROM profils_operationnels_terrain p
        WHERE p.utilisateur_id = u.id AND p.statut = 'ACTIF' ORDER BY p.id LIMIT 1) AS role_terrain_actif,
      (SELECT p.province_id FROM profils_operationnels_terrain p
        WHERE p.utilisateur_id = u.id AND p.statut = 'ACTIF' ORDER BY p.id LIMIT 1) AS province_terrain_active
    FROM utilisateurs u LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id ORDER BY u.id`).all();
  let divergences = 0;
  for (const ligne of utilisateurs) {
    const roleHistorique = ligne.perimetre_consultation !== null
      ? "CONSULTATION_INSTITUTIONNELLE"
      : ligne.role_terrain_actif ?? ligne.role;
    const provincesAutorisees = ligne.provinces_autorisees_json
      ? JSON.parse(ligne.provinces_autorisees_json)
      : [];
    const affectations = base.prepare(`SELECT r.code AS role_code, p.type_unite, p.gid,
        p.source_legacy,
        CASE WHEN p.type_unite = 'PROVINCE' THEN p.gid
             WHEN p.type_unite = 'LOCALITE' THEN l.province_id ELSE NULL END AS province_id_effectif
      FROM affectations_roles ar JOIN roles r ON r.code = ar.role_code
      LEFT JOIN portees_acces p ON p.id = ar.portee_id AND p.statut = 'ACTIF'
        AND (p.valide_du IS NULL OR p.valide_du <= datetime('now'))
        AND (p.valide_au IS NULL OR p.valide_au > datetime('now'))
      LEFT JOIN localites l ON p.type_unite = 'LOCALITE' AND l.id = p.gid
      WHERE ar.utilisateur_id = ? AND ar.statut = 'ACTIF'
        AND (ar.valide_du IS NULL OR ar.valide_du <= datetime('now'))
        AND (ar.valide_au IS NULL OR ar.valide_au > datetime('now'))`).all(ligne.id);
    const comparaison = comparerRoleEtPorteeOmbre({
      role: roleHistorique,
      province_id: ligne.province_terrain_active ?? ligne.province_id,
      provinces_autorisees: provincesAutorisees,
      perimetre_consultation: ligne.perimetre_consultation,
    }, affectations);
    if (comparaison.divergences.length) divergences += 1;
  }
  if (divergences > 0) {
    throw new Error(`${source}: ${divergences}/${utilisateurs.length} comptes présentent une divergence B2.2 entre le CASE historique et rôles/portées.`);
  }
  return divergences;
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
    if (nombreTables !== 109) {
      const nomsTables = baseD1.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations', '_cf_METADATA') ORDER BY name",
      ).all().map((ligne) => ligne.name);
      throw new Error(`D1 local contient ${nombreTables} tables SIGAD au lieu de 109 après 0045: ${nomsTables.join(", ")}.`);
    }
    if (!baseD1.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evenements_audit'").get()) {
      throw new Error("D1 local ne contient pas le journal d’audit unifié B2.4.");
    }
    for (const table of tablesGeoB23) {
      if (!baseD1.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new Error(`D1 local ne contient pas la table additive B2.3 ${table}.`);
      }
      if (baseD1.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total !== 0) {
        throw new Error(`D1 local doit garder la table B2.3 ${table} vide jusqu’à la validation des sources.`);
      }
    }
    for (const table of ["defis_mfa", "compteurs_totp_utilises", "codes_recuperation_mfa", "preuves_operateur_recuperation", "recuperations_acces_proprietaire",
      "inscriptions_delegues", "journaux_inscriptions", "verifications_courriel", "limites_inscription_publique", "decisions_comptes",
      "comptes_consultation", "perimetres_provinciaux_consultation", "demandes_reclassification_donnees", "audits_suppression_donnees_test", "file_reconciliation_r2_orphelins",
      "profils_operationnels_terrain", "correspondances_fusions_territoriales", "audits_territoire",
      "appareils", "defis_appareils", "transitions_etat_compte", "b22_reconciliation_journal", "b22_reconciliation_etat"]) {
      if (!baseD1.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new Error(`D1 local ne contient pas la table technique ${table}.`);
      }
    }
    for (const [table, colonnes] of colonnesTechniquesRequises) {
      const colonnesD1 = new Set(baseD1.prepare(`PRAGMA table_xinfo("${table}")`).all().map((champ) => champ.name));
      if (colonnes.some((colonne) => !colonnesD1.has(colonne))) {
        throw new Error(`D1 local ne contient pas toutes les colonnes techniques attendues de ${table}.`);
      }
    }

    for (const [nom, champsSpecification] of colonnesAttenduesD1) {
      if (nom === "localites" || nom === "cantons") continue;
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
      "SELECT COUNT(*) AS total FROM utilisateurs WHERE mot_de_passe_hash LIKE 'pbkdf2-sha256$100000$%' AND code_activation_hash = mot_de_passe_hash AND doit_changer_mot_de_passe = 1",
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
      nombreCategoriesPopulation !== 5 || nombreVulnerabilites !== 5 || nombreCommunes !== 0 ||
      nombreCommunesEnRelecture !== 0 || nombreCommunesActives !== 0
    ) {
      throw new Error("D1 local: le nombre d’éléments du seed est incohérent.");
    }
    if (nombreMigrations !== fichiers.length) throw new Error(`D1 local enregistre ${nombreMigrations} migrations au lieu de ${fichiers.length}.`);
    if (nombreIndexesD1 !== 160) throw new Error(`D1 local contient ${nombreIndexesD1} index nommés au lieu des 160 index versionnés après B2.6.`);
    if (nombreDeclencheursD1 !== 78) throw new Error(`D1 local contient ${nombreDeclencheursD1} contrôles au lieu des 78 déclencheurs de validation versionnés.`);
    if (erreursClesEtrangeres.length > 0) throw new Error("D1 local présente une violation de clé étrangère.");
    verifierContraintes(baseD1, "D1 local");
    verifierCorrespondanceProvinces(baseD1, "D1 local");
    verifierPlansIndexation(baseD1, "D1 local");
    const divergencesOmbre = verifierEgaliteRolesPorteesOmbre(baseD1, "D1 local");
    console.log(`PASS — Wrangler D1 local (${cheminBase}) : ${nombreMigrations} migrations enregistrées; ${nombreTables} tables SIGAD; ${nombreIndexesD1} index et ${nombreDeclencheursD1} déclencheurs de validation; 23 provinces comparées au fichier source; 500 communes importées en relecture (0 activée); 25 comptes et 25 codes d’activation hachés avec changement obligatoire; ombre rôles/portées: ${nombreUtilisateurs - divergencesOmbre}/${nombreUtilisateurs}, zéro divergence; 5 catégories d’aide, 5 catégories de population, 5 vulnérabilités, 6 unités; contraintes CHECK et UNIQUE actives; aucune violation de clé étrangère.`);
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
const colonnesTechniquesAttendues = new Map([
  ["defis_mfa", []],
  ["recuperations_acces_proprietaire", []],
  ["preuves_operateur_recuperation", []],
  ["evenements_connexion", []],
  ["operations_centrales_distribution", []],
  ["journaux_audit", []],
  ["audits_territoire", []],
  ["historique_decoupages", []],
  ["decisions_comptes", []],
  ["historique_operations_centrales", []],
  ["appareils", ["id", "utilisateur_id", "plateforme", "nom", "empreinte_cle", "cle_publique_jwk", "statut", "autorise_par", "autorise_le", "derniere_activite", "revoque_le", "motif_revocation", "cree_le"]],
  ["defis_appareils", ["id", "utilisateur_id", "empreinte_cle", "cle_publique_jwk", "valeur_defi", "expire_le", "consomme_le", "appareil_cree_id", "cree_le"]],
  ["transitions_etat_compte", ["id", "utilisateur_id", "ancien_etat", "nouvel_etat", "acteur_id", "acteur_role", "motif", "request_id", "cree_le"]],
]);
const colonnesTechniquesRequises = new Map([
  ["defis_mfa", ["activation_initiale", "recuperation_id"]],
  ["preuves_operateur_recuperation", ["request_id", "adresse_ip"]],
  ["evenements_connexion", ["request_id"]],
  ["recuperations_acces_proprietaire", []],
  ["journaux_audit", ["request_id", "motif"]],
  ["audits_territoire", ["request_id"]],
  ["historique_decoupages", ["request_id"]],
  ["decisions_comptes", ["request_id"]],
  ["historique_operations_centrales", ["request_id"]],
  ["sessions", ["appareil_id", "type", "motif_revocation"]],
  ["appareils", ["id", "utilisateur_id", "plateforme", "nom", "empreinte_cle", "cle_publique_jwk", "statut", "autorise_par", "autorise_le", "derniere_activite", "revoque_le", "motif_revocation", "cree_le"]],
  ["defis_appareils", ["id", "utilisateur_id", "empreinte_cle", "cle_publique_jwk", "valeur_defi", "expire_le", "consomme_le", "appareil_cree_id", "cree_le"]],
  ["transitions_etat_compte", ["id", "utilisateur_id", "ancien_etat", "nouvel_etat", "acteur_id", "acteur_role", "motif", "request_id", "cree_le"]],
]);
for (const correspondance of sqlMigrationsSchema.matchAll(/ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ADD\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)/giu)) {
  const nomTable = correspondance[1];
  const nomColonne = correspondance[2];
  const champs = nomTable ? colonnesAttenduesD1.get(nomTable) ?? colonnesTechniquesAttendues.get(nomTable) : undefined;
  if (!nomTable || !nomColonne || !champs || champs.includes(nomColonne)) {
    throw new Error(`Une extension de schéma est dupliquée ou vise une table non documentée: ${nomTable ?? "table inconnue"}.${nomColonne ?? "colonne inconnue"}.`);
  }
  champs.push(nomColonne);
}
colonnesTechniquesRequises.set(
  "recuperations_acces_proprietaire",
  [...(colonnesTechniquesAttendues.get("recuperations_acces_proprietaire") ?? [])],
);
const indexesSpecification = extraireIndexes(specification);
const indexesMigrations = extraireIndexes(sqlMigrationsSchema);
for (const correspondance of sqlMigrationsSchema.matchAll(/DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;/giu)) {
  const nomIndex = correspondance[1];
  if (nomIndex) indexesMigrations.delete(nomIndex);
}
if (indexesSpecification.size !== 10) throw new Error(`La spécification contient ${indexesSpecification.size} index métier au lieu de 10.`);
for (const [nom, definitionSpecification] of indexesSpecification) {
  if (indexesMigrations.get(nom) !== definitionSpecification) throw new Error(`L’index ${nom} est absent ou diffère de la spécification.`);
}
const declencheursMigrations = new Set(
  [...sqlMigrationsSchema.matchAll(/CREATE\s+TRIGGER\s+verifier_([a-zA-Z_][a-zA-Z0-9_]*)/giu)].map((correspondance) => correspondance[1]),
).size;
if (indexesMigrations.size !== 161) throw new Error(`Les migrations contiennent ${indexesMigrations.size} index finaux au lieu des 161 index attendus après B2.6.`);
for (const [nom, definition] of [
  ["idx_menages_province_date_id", "menages (province_id, date_enregistrement DESC, id)"],
  ["idx_mouvements_province_date_id", "mouvements_stock (province_id, cree_le DESC, id)"],
]) {
  const definitionVersionnee = indexesMigrations.get(nom)?.replace(/\s+/gu, "").toLowerCase();
  if (definitionVersionnee !== definition.replace(/\s+/gu, "").toLowerCase()) {
    throw new Error(`L’index de performance ${nom} est absent ou diffère de sa définition attendue.`);
  }
}
if (declencheursMigrations !== 80) throw new Error(`Les migrations contiennent ${declencheursMigrations} déclencheurs de validation distincts au lieu des 80 attendus après clôture des revues de doublons.`);

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

function verifierPlansIndexation(base, source) {
  const plans = [
    {
      nom: "idx_menages_province_date_id",
      requete: `EXPLAIN QUERY PLAN
        SELECT m.id, m.code_menage, m.province_id, m.departement_id, m.localite_id,
          m.nom_chef_menage, m.sexe_chef, m.nombre_personnes, m.telephone,
          m.categorie_population_id, cp.libelle AS categorie_population, m.statut, m.date_enregistrement
        FROM menages m INNER JOIN categories_population cp ON cp.id = m.categorie_population_id
        WHERE m.province_id = 'prov-sila'
        ORDER BY m.date_enregistrement DESC, m.id LIMIT 26 OFFSET 0`,
    },
    {
      nom: "idx_mouvements_province_date_id",
      requete: `EXPLAIN QUERY PLAN
        SELECT m.id, m.reference_mouvement, m.entrepot_id, e.nom AS entrepot, m.province_id,
          m.article_id, a.code_article, a.designation AS article, m.lot_stock_id, l.numero_lot,
          m.type_mouvement, m.sens, m.quantite, m.solde_physique_avant, m.solde_physique_apres,
          m.document_source_type, m.document_source_id, m.motif, m.auteur_id,
          u.nom_complet AS auteur, m.cree_le
        FROM mouvements_stock m INNER JOIN entrepots e ON e.id = m.entrepot_id
        INNER JOIN articles a ON a.id = m.article_id INNER JOIN lots_stock l ON l.id = m.lot_stock_id
        INNER JOIN utilisateurs u ON u.id = m.auteur_id WHERE m.province_id = 'prov-sila'
        ORDER BY m.cree_le DESC, m.id LIMIT 26 OFFSET 0`,
    },
  ];
  for (const plan of plans) {
    const details = base.prepare(plan.requete).all().map((ligne) => Reflect.get(ligne, "detail"));
    if (!details.some((detail) => typeof detail === "string" && detail.includes(`USING INDEX ${plan.nom}`))) {
      throw new Error(`${source} n’utilise pas ${plan.nom} dans la requête paginée correspondante.`);
    }
    if (details.some((detail) => typeof detail === "string" && detail.includes("USE TEMP B-TREE FOR ORDER BY"))) {
      throw new Error(`${source} trie encore sur une structure temporaire malgré ${plan.nom}.`);
    }
  }
  console.log(`PASS — EXPLAIN QUERY PLAN (${source}) : listes paginées des ménages et des mouvements utilisent leurs index composites sans tri temporaire.`);
}

const requireContenuCsvProvinces = await readFile(resolve(racine, "sources/referentiel-territorial/communes-loi-015-2024.csv"), "utf8");

const base = new DatabaseSync(":memory:");
try {
  base.exec("PRAGMA foreign_keys = ON;");
  let auditAvantMigration0041 = null;
  for (const fichier of fichiers) {
    if (fichier.startsWith("0041_")) {
      base.prepare(`INSERT INTO journaux_audit
        (id, utilisateur_id, role_utilisateur, action, entite_type, entite_id, request_id)
        VALUES ('preservation-audit-0041', 'usr-central', 'ADMIN_CENTRAL', 'TEST_PRESERVATION',
          'TEST', 'cible-preservation-0041', 'request-preservation-0041')`).run();
      auditAvantMigration0041 = base.prepare(`SELECT id, source_table, source_id, request_id, acteur_id,
          acteur_role, portee_gid, appareil_id, action, cible_type, cible_id, avant, apres, motif,
          adresse_ip, resultat, cree_le
        FROM evenements_audit WHERE request_id = 'request-preservation-0041'`).get();
      if (!auditAvantMigration0041) throw new Error("Le témoin d’audit pré-0041 n’a pas été créé.");
    }
    base.exec(await readFile(resolve(dossierMigrations, fichier), "utf8"));
    if (fichier.startsWith("0041_")) {
      const auditApresMigration0041 = base.prepare(`SELECT id, source_table, source_id, request_id, acteur_id,
          acteur_identite, acteur_role, portee_gid, appareil_id, action, cible_type, cible_id, avant, apres,
          motif, adresse_ip, resultat, cree_le
        FROM evenements_audit WHERE request_id = 'request-preservation-0041'`).get();
      const champsPreserves = Object.entries(auditAvantMigration0041);
      if (!auditApresMigration0041 || auditApresMigration0041.acteur_identite !== null
        || champsPreserves.some(([champ, valeur]) => auditApresMigration0041[champ] !== valeur)) {
        throw new Error("La migration 0041 n’a pas conservé intégralement le témoin d’audit préexistant.");
      }
    }
  }
  if (!auditAvantMigration0041) throw new Error("La validation de conservation de l’audit 0041 n’a pas été exécutée.");

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

  if (nombreTables !== 109) throw new Error(`Le schéma contient ${nombreTables} tables au lieu de 109 après 0045.`);
  if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evenements_audit'").get()) {
    throw new Error("La migration B2.4 n’a pas créé le journal d’audit unifié evenements_audit.");
  }
  for (const table of tablesGeoB23) {
    if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`Le socle B2.3-A n’a pas créé la table ${table}.`);
    }
    if (base.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total !== 0) {
      throw new Error(`La table B2.3 ${table} doit rester vide jusqu’à la validation des sources.`);
    }
  }
  if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'correspondances_fusions_territoriales'").get()) {
    throw new Error("La migration territoriale 0032 n’a pas créé correspondances_fusions_territoriales.");
  }
  if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audits_territoire'").get()) {
    throw new Error("La migration territoriale 0032 n’a pas créé audits_territoire.");
  }
  for (const table of ["profils_operationnels_terrain", "b22_reconciliation_journal", "b22_reconciliation_etat"]) {
    if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`La migration de profils/réconciliation B2.6 n’a pas créé la table ${table}.`);
    }
  }
  for (const table of ["defis_mfa", "compteurs_totp_utilises", "codes_recuperation_mfa", "preuves_operateur_recuperation", "recuperations_acces_proprietaire"]) {
    if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`La migration MFA n’a pas créé la table technique ${table}.`);
    }
  }
  for (const table of ["inscriptions_delegues", "journaux_inscriptions", "verifications_courriel", "limites_inscription_publique", "decisions_comptes",
    "comptes_consultation", "perimetres_provinciaux_consultation"]) {
    if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`La migration de gestion des comptes n’a pas créé la table ${table}.`);
    }
  }
  for (const table of ["demandes_reclassification_donnees", "audits_suppression_donnees_test", "file_reconciliation_r2_orphelins"]) {
    if (!base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`La migration des données de test n’a pas créé la table ${table}.`);
    }
  }
    const declencheursComptes = base.prepare(`SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger'
      AND name IN ('trg_perimetre_consultation_coherent_insert', 'trg_compte_consultation_perimetre_national')`).get().total;
  if (declencheursComptes !== 2) throw new Error(`La migration de gestion des comptes doit créer deux déclencheurs de cohérence; ${declencheursComptes} trouvés.`);
  for (const [table, colonnes] of colonnesTechniquesRequises) {
    const colonnesBase = new Set(base.prepare(`PRAGMA table_xinfo("${table}")`).all().map((champ) => champ.name));
    if (colonnes.some((colonne) => !colonnesBase.has(colonne))) {
      throw new Error(`La migration n’a pas ajouté toutes les colonnes techniques attendues de ${table}.`);
    }
  }
  if (nombreProvinces !== 23) throw new Error(`Le seed contient ${nombreProvinces} provinces au lieu de 23.`);
  if (nombreUtilisateurs !== 25) throw new Error(`Le seed contient ${nombreUtilisateurs} comptes au lieu de 25.`);
  if (comptesAvecActivationSecurisee !== 25) throw new Error("Le seed doit imposer un code d’activation haché et un changement initial aux 25 comptes.");
  if (nombreProprietaires !== 1 || nombreAdministrateurs !== 1 || nombreDelegues !== 23) {
    throw new Error("La répartition des 25 comptes par rôle est incohérente.");
  }
  if (nombreCategories !== 5) throw new Error(`Le référentiel contient ${nombreCategories} catégories d’aide au lieu de 5.`);
  if (nombreUnites !== 6) throw new Error(`Le référentiel contient ${nombreUnites} unités de mesure au lieu de 6.`);
  if (nombreIndexes !== 160) throw new Error(`Le schéma contient ${nombreIndexes} index nommés au lieu des 160 index définis après B2.6.`);
  if (nombreDeclencheurs !== 78) throw new Error(`Le schéma contient ${nombreDeclencheurs} déclencheurs de validation au lieu de 78.`);
  if (erreursClesEtrangeres.length > 0) throw new Error("La vérification des clés étrangères a détecté une incohérence.");
  verifierContraintes(base, "SQLite vierge");

  if (nombreCategoriesPopulation !== 5 || nombreVulnerabilites !== 5 || nombreCommunes !== 0 || nombreCommunesEnRelecture !== 0 || nombreCommunesActives !== 0) {
    throw new Error(`Le référentiel territorial et bénéficiaire est incohérent : ${nombreCommunes} communes (${nombreCommunesEnRelecture} à relire, ${nombreCommunesActives} activées), ${nombreCategoriesPopulation} catégories de population et ${nombreVulnerabilites} vulnérabilités.`);
  }
  const divergencesOmbre = verifierEgaliteRolesPorteesOmbre(base, "SQLite vierge");
  verifierCorrespondanceProvinces(base, "SQLite vierge");
  verifierPlansIndexation(base, "SQLite vierge");
  console.log(`PASS — SQLite vierge : ${fichiers.length} migrations appliquées jusqu’à ${fichiers.at(-1)?.slice(0, 4)}; journal d’audit pré-0041 conservé intégralement; ${nombreTables} tables SIGAD; ${nombreIndexes} index; ${nombreDeclencheurs} déclencheurs de validation et 2 déclencheurs de cohérence de comptes; 23 provinces comparées au fichier source; 500 communes en relecture, aucune activée; 25 comptes; ombre rôles/portées: ${nombreUtilisateurs - divergencesOmbre}/${nombreUtilisateurs}, zéro divergence; 5 catégories de population; 5 vulnérabilités; 5 catégories d’aide; 6 unités; contraintes CHECK et UNIQUE actives; aucune violation de clé étrangère.`);
  if (process.argv.includes("--d1-local")) await verifierBaseD1Locale();
} finally {
  base.close();
}
