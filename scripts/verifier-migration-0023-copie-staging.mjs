import { createDecipheriv, createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { dechiffrerOctetsDpapi } from "./coffre-recuperation-dpapi.mjs";
import {
  actionCorrectiveSqlite,
  classifierErreurSqlite,
  codeNatifSqlite,
  decouperInstructionsSql,
  typeErreurSqlite,
} from "./outils-restauration-sqlite.mjs";

let etapeVerification = "DPAPI_DECHIFFREMENT";
let diagnosticCourant = {
  operation: "OUVERTURE_DPAPI_CURRENTUSER",
  action: "Utiliser PowerShell et Node sous le même compte Windows que celui qui a créé le fichier.",
};

function positionnerDiagnostic(etape, operation, action) {
  etapeVerification = etape;
  diagnosticCourant = { operation, action };
}

function exiger(condition, message) {
  if (!condition) throw new Error(message);
}

function exigerAgregat(observe, attendu, groupe, code, action) {
  if (observe === attendu) return;
  diagnosticCourant = { ...diagnosticCourant, code, groupe, attendu, observe, action };
  throw new Error("Un contrôle agrégé pré-migration n’a pas satisfait le seuil attendu.");
}

function identifierSqlite(valeur) {
  return `"${valeur.replaceAll('"', '""')}"`;
}

function ouvrirSnapshot(base, nomTable, colonnesAttenues) {
  const tableSql = identifierSqlite(nomTable);
  const colonnesDisponibles = base.prepare(`PRAGMA table_info(${tableSql})`).all()
    .map((colonne) => Reflect.get(colonne, "name"))
    .filter((nom) => typeof nom === "string");
  const colonnes = colonnesAttenues ?? colonnesDisponibles;
  exiger(colonnes.length > 0 && colonnes.every((nom) => colonnesDisponibles.includes(nom)),
    "Une table du snapshot ne conserve pas toutes ses colonnes initiales.");
  const selection = colonnes.map(identifierSqlite).join(", ");
  const lignes = base.prepare(`SELECT ${selection} FROM ${tableSql}`).all();
  const formes = lignes.map((ligne) => JSON.stringify(colonnes.map((nom) => Reflect.get(ligne, nom) ?? null))).sort();
  return {
    colonnes: colonnes.join("\u001f"),
    lignes: lignes.length,
    empreinte: createHash("sha256").update(JSON.stringify(formes)).digest("hex"),
  };
}

function listerTables(base) {
  return base.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map((ligne) => Reflect.get(ligne, "name")).filter((nom) => typeof nom === "string");
}

function lireIndicateurs(base) {
  const ligne = base.prepare(
    `SELECT COUNT(*) AS comptes,
            SUM(CASE WHEN doit_changer_mot_de_passe = 1 THEN 1 ELSE 0 END) AS changements_requis,
            SUM(CASE WHEN code_activation_hash IS NOT NULL AND role <> 'PROPRIETAIRE' THEN 1 ELSE 0 END) AS activations_heritees,
            SUM(CASE WHEN code_activation_hash IS NOT NULL AND role = 'PROPRIETAIRE' THEN 1 ELSE 0 END) AS activations_proprietaire,
            SUM(CASE WHEN double_facteur_actif = 1 THEN 1 ELSE 0 END) AS mfa_actifs
     FROM utilisateurs`,
  ).get();
  return {
    comptes: Number(Reflect.get(ligne, "comptes")),
    changementsRequis: Number(Reflect.get(ligne, "changements_requis") ?? 0),
    activationsHeritees: Number(Reflect.get(ligne, "activations_heritees") ?? 0),
    activationsProprietaire: Number(Reflect.get(ligne, "activations_proprietaire") ?? 0),
    mfaActifs: Number(Reflect.get(ligne, "mfa_actifs") ?? 0),
  };
}

function dechiffrerCleDpapi(donneeBase64) {
  const cle = dechiffrerOctetsDpapi(donneeBase64);
  exiger(cle.length === 32, "La clé AES de sauvegarde a une longueur invalide.");
  return cle;
}

function cheminSauvegardeValide(cheminFourni) {
  exiger((process.env.LOCALAPPDATA !== undefined && process.env.LOCALAPPDATA.length > 0)
    || (process.env.USERPROFILE !== undefined && process.env.USERPROFILE.length > 0),
    "Le profil Windows local est absent.");
  exiger(isAbsolute(cheminFourni), "Le chemin de sauvegarde doit être absolu.");
  const cible = resolve(cheminFourni);
  const racines = [];
  if (process.env.LOCALAPPDATA) racines.push(resolve(process.env.LOCALAPPDATA, "SIGAD", "Staging", "backups"));
  if (process.env.USERPROFILE) {
    racines.push(resolve(process.env.USERPROFILE, "AppData", "Local", "SIGAD", "Staging", "backups"));
  }
  const candidat = racines.map((racine) => ({ racine, relatif: relative(racine, cible) }))
    .find(({ relatif }) => relatif !== "" && relatif !== ".." && !relatif.startsWith(`..${sep}`));
  exiger(candidat !== undefined,
    "Le fichier indiqué n’est pas dans un dossier de sauvegarde Staging du profil Windows courant.");
  const morceaux = candidat.relatif.split(/[\\/]/u);
  exiger(morceaux.length === 2
    && /^before-0023-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/u.test(morceaux[0] ?? "")
    && basename(cible) === "sigad-staging-db-before-0023.dpapi-aesgcm.json",
  "Le fichier indiqué n’est pas une sauvegarde SIGAD Staging de la portée attendue.");
  return { racine: candidat.racine, cible };
}

async function verifierCheminSauvegarde(chemins) {
  positionnerDiagnostic("DPAPI_DECHIFFREMENT", "VERIFICATION_CHEMIN_SAUVEGARDE",
    "Vérifier lexicalement le dossier Staging et contrôler chaque élément sans résoudre un chemin final bloqué par le Sandbox.");
  const racineVolume = parse(chemins.cible).root;
  const elements = chemins.cible.slice(racineVolume.length).split(/[\\/]/u).filter((element) => element.length > 0);
  let courant = racineVolume;
  for (let index = 0; index < elements.length; index += 1) {
    courant = join(courant, elements[index]);
    const informations = await lstat(courant);
    exiger(!informations.isSymbolicLink(), "Un élément du chemin de sauvegarde est un lien symbolique.");
    if (index < elements.length - 1) {
      exiger(informations.isDirectory(), "Un élément parent du chemin de sauvegarde n’est pas un dossier.");
    } else {
      exiger(informations.isFile(), "Le chemin de sauvegarde ne désigne pas un fichier régulier.");
    }
  }
}

function localiserErreurRestauration(sql) {
  let diagnostic = null;
  let baseDiagnostic;
  try {
    baseDiagnostic = new DatabaseSync(":memory:");
    const instructions = decouperInstructionsSql(sql);
    for (const instruction of instructions) {
      try {
        baseDiagnostic.exec(instruction.sql);
      } catch (erreur) {
        const code = classifierErreurSqlite(erreur);
        diagnostic = {
          operation: instruction.operation,
          ligne: instruction.ligne,
          code,
          type: typeErreurSqlite(erreur),
          codeNatif: codeNatifSqlite(erreur),
          action: actionCorrectiveSqlite(code),
        };
        break;
      }
    }
  } catch (erreur) {
    const code = classifierErreurSqlite(erreur);
    diagnostic = {
      operation: "ANALYSE_INSTRUCTIONS_SQL",
      ligne: null,
      code,
      type: typeErreurSqlite(erreur),
      codeNatif: codeNatifSqlite(erreur),
      action: "Le dump n’a pas pu être analysé instruction par instruction; conserver la sauvegarde et vérifier le runtime SQLite local.",
    };
  } finally {
    baseDiagnostic?.close();
  }
  return diagnostic;
}

async function main() {
  const argumentsUtilisateur = process.argv.slice(2);
  const cheminFourni = argumentsUtilisateur[0] === "--verify-existing"
    ? argumentsUtilisateur[1]
    : argumentsUtilisateur[0];
  exiger(argumentsUtilisateur.length === (argumentsUtilisateur[0] === "--verify-existing" ? 2 : 1),
    "Utilisez --verify-existing suivi du chemin absolu de la sauvegarde chiffrée.");
  exiger(process.platform === "win32", "Ce contrôle de sauvegarde DPAPI doit être exécuté sous Windows.");
  exiger(typeof cheminFourni === "string" && cheminFourni.length > 0,
    "Indiquez le fichier de sauvegarde chiffré Staging en argument.");
  const chemins = cheminSauvegardeValide(cheminFourni);
  await verifierCheminSauvegarde(chemins);

  positionnerDiagnostic("DPAPI_DECHIFFREMENT", "LECTURE_MANIFESTE_CHIFFRE",
    "Vérifier l’accès au fichier chiffré sous son profil Windows propriétaire; ne pas le copier sous un autre compte.");
  const document = JSON.parse(await readFile(chemins.cible, "utf8"));
  exiger(typeof document === "object" && document !== null, "Le manifeste de sauvegarde est invalide.");
  exiger(document.algorithm === "AES-256-GCM", "L’algorithme de sauvegarde n’est pas celui attendu.");
  exiger(typeof document.scope === "string" && document.scope.includes("sigad-staging-db"),
    "La sauvegarde ne correspond pas à la D1 Staging attendue.");
  exiger(typeof document.ciphertext === "string" && typeof document.wrappedKeyDpapiCurrentUser === "string",
    "Le contenu chiffré ou la clé DPAPI est absent.");
  exiger(typeof document.iv === "string" && typeof document.authTag === "string",
    "Les paramètres AES-GCM sont absents.");

  let donneesAuthentifiees;
  if (document.version === 2) {
    exiger(document.keyProtection === "DPAPI-CurrentUser"
      && document.accountId === "a2c898e7e1fda02365b7d8a49809f7e9"
      && document.databaseId === "a54e1ea9-c49a-4729-ad06-a40ceb421127"
      && typeof document.createdAt === "string"
      && document.aad === `SIGAD-D1-BACKUP-v2|${document.accountId}|${document.databaseId}|${document.createdAt}`,
    "Les métadonnées authentifiées ne correspondent pas à la D1 Staging attendue.");
    donneesAuthentifiees = Buffer.from(document.aad, "utf8");
  }
  const tailleClair = Number(document.bytes);
  exiger(Number.isSafeInteger(tailleClair) && tailleClair > 0 && tailleClair <= 2_000_000_000,
    "La taille déclarée de la sauvegarde est invalide.");
  positionnerDiagnostic("DPAPI_DECHIFFREMENT", "DPAPI_CURRENTUSER_UNWRAP",
    "Exécuter le vérificateur sous le même profil Windows CurrentUser qui a chiffré la sauvegarde.");
  const cle = dechiffrerCleDpapi(document.wrappedKeyDpapiCurrentUser);
  const clair = Buffer.alloc(tailleClair);
  let base;
  let diagnosticRestauration = null;
  try {
    positionnerDiagnostic("DPAPI_DECHIFFREMENT", "AUTHENTIFICATION_AES_256_GCM",
      "Conserver la sauvegarde intacte; une erreur d’authentification indique un fichier altéré ou des métadonnées incompatibles.");
    const dechiffreur = createDecipheriv("aes-256-gcm", cle, Buffer.from(document.iv, "base64"));
    dechiffreur.setAuthTag(Buffer.from(document.authTag, "base64"));
    if (donneesAuthentifiees) dechiffreur.setAAD(donneesAuthentifiees);
    const contenu = Buffer.concat([
      dechiffreur.update(Buffer.from(document.ciphertext, "base64")),
      dechiffreur.final(),
    ]);
    exiger(contenu.length === Number(document.bytes), "La taille du snapshot déchiffré est invalide.");
    exiger(createHash("sha256").update(contenu).digest("hex") === document.sha256,
      "L’intégrité du snapshot sauvegardé est invalide.");
    contenu.copy(clair);

    positionnerDiagnostic("RESTAURATION_SQLITE", "IMPORT_DUMP_DANS_SQLITE_MEMOIRE",
      "Conserver la sauvegarde chiffrée et utiliser le diagnostic d’instruction; aucune nouvelle exportation n’est requise pour ce contrôle.");
    base = new DatabaseSync(":memory:");
    const texteSql = clair.toString("utf8");
    try {
      base.exec(texteSql);
    } catch (erreur) {
      diagnosticRestauration = localiserErreurRestauration(texteSql);
      if (diagnosticRestauration !== null) {
        diagnosticCourant = {
          operation: diagnosticRestauration.operation,
          action: diagnosticRestauration.action,
          code: diagnosticRestauration.code,
          type: diagnosticRestauration.type,
          codeNatif: diagnosticRestauration.codeNatif,
          ligne: diagnosticRestauration.ligne,
        };
      } else {
        diagnosticCourant = {
          operation: "EXECUTION_DUMP_COMPLET",
          action: "Le dump échoue comme lot mais pas pendant la relecture instruction par instruction; vérifier les règles transactionnelles du SQL Wrangler.",
          code: classifierErreurSqlite(erreur),
          type: typeErreurSqlite(erreur),
          codeNatif: codeNatifSqlite(erreur),
          ligne: null,
        };
      }
      throw erreur;
    }
    positionnerDiagnostic("RESTAURATION_SQLITE", "ACTIVATION_DES_CLES_ETRANGERES",
      "Vérifier l’ordre de création des tables et l’intégrité relationnelle de la copie locale.");
    base.exec("PRAGMA foreign_keys = ON;");

    positionnerDiagnostic("RESTAURATION_SQLITE", "VERIFICATION_TABLES_AUTHENTIFICATION",
      "Vérifier que le dump contient le schéma SIGAD Staging attendu avant toute comparaison.");
    const tablesAvant = listerTables(base);
    exiger(tablesAvant.includes("utilisateurs") && tablesAvant.includes("sessions") && tablesAvant.includes("defis_mfa"),
      "La sauvegarde ne contient pas les tables d’authentification attendues.");
    positionnerDiagnostic("RESTAURATION_SQLITE", "PRAGMA_INTEGRITY_CHECK_AVANT",
      "Conserver la sauvegarde; vérifier l’intégrité du dump restauré avant de poursuivre.");
    const integriteAvant = base.prepare("PRAGMA integrity_check").all();
    exiger(integriteAvant.length === 1 && Reflect.get(integriteAvant[0], "integrity_check") === "ok",
      "La vérification d’intégrité SQLite a échoué avant la migration.");
    positionnerDiagnostic("RESTAURATION_SQLITE", "PRAGMA_FOREIGN_KEY_CHECK_AVANT",
      "Conserver la sauvegarde; rechercher une relation invalide dans l’export sans afficher de données.");
    const violationsAvant = base.prepare("PRAGMA foreign_key_check").all();
    exiger(violationsAvant.length === 0, "La sauvegarde restaurée contient une violation de clé étrangère.");
    positionnerDiagnostic("RESTAURATION_SQLITE", "VERIFICATION_REGISTRE_MIGRATIONS",
      "Comparer le registre D1 restauré au jeu local 0001–0022 sans modifier l’historique.");
    const versions = base.prepare("SELECT COUNT(*) AS total FROM d1_migrations").get();
    exiger(Number(Reflect.get(versions, "total")) === 22, "La sauvegarde ne contient pas les 22 migrations Staging attendues.");
    const fichiersMigration = (await readdir(new URL("../migrations/", import.meta.url)))
      .filter((nom) => /^\d{4}_.+\.sql$/u.test(nom))
      .sort((a, b) => a.localeCompare(b, "en"));
    const migrationsAttenues = Array.from({ length: 22 }, (_, index) => {
      const prefixe = `${String(index + 1).padStart(4, "0")}_`;
      const fichier = fichiersMigration.find((nom) => nom.startsWith(prefixe));
      exiger(fichier !== undefined, `Le fichier local de migration ${prefixe} est absent.`);
      return fichier.slice(0, -4);
    });
    const colonnesRegistre = base.prepare("PRAGMA table_info(d1_migrations)").all()
      .map((colonne) => Reflect.get(colonne, "name"));
    exiger(colonnesRegistre.includes("name"), "Le registre D1 ne permet pas de vérifier les noms de migrations.");
    const nomsEnregistres = base.prepare("SELECT name FROM d1_migrations ORDER BY name").all()
      .map((ligne) => Reflect.get(ligne, "name"))
      .filter((nom) => typeof nom === "string")
      .map((nom) => nom.replace(/\.sql$/u, ""))
      .sort((a, b) => a.localeCompare(b, "en"));
    exiger(JSON.stringify(nomsEnregistres) === JSON.stringify([...migrationsAttenues].sort((a, b) => a.localeCompare(b, "en"))),
      "Le registre de sauvegarde ne correspond pas exactement aux migrations locales 0001–0022.");

    positionnerDiagnostic("RESTAURATION_SQLITE", "COMPTAGE_COMPTES_ET_ACTIVATIONS",
      "Vérifier les agrégats attendus avant application de 0023; aucune valeur personnelle n’est affichée.");
    const indicateursAvant = lireIndicateurs(base);
    exigerAgregat(indicateursAvant.comptes, 25, "COMPTES", "COMPTES_TOTAL_INATTENDU",
      "Confirmer que cette sauvegarde Staging contient les 25 comptes attendus avant toute comparaison de 0023.");
    exigerAgregat(indicateursAvant.activationsHeritees, 24, "ACTIVATIONS_HERITEES", "ACTIVATIONS_HERITEES_TOTAL_INATTENDU",
      "Examiner la procédure d’activation héritée avant toute migration; ne pas modifier ni faire expirer ces activations.");
    exigerAgregat(indicateursAvant.activationsProprietaire, 1, "ACTIVATION_PROPRIETAIRE_EXISTANTE", "ACTIVATION_PROPRIETAIRE_TOTAL_INATTENDU",
      "Confirmer l’état d’activation préexistant du propriétaire avant la migration; ne pas remplacer ni révoquer son activation.");
    positionnerDiagnostic("RESTAURATION_SQLITE", "EMPREINTES_AVANT_MIGRATION",
      "La sauvegarde est restaurée; vérifier les colonnes et les empreintes internes sans afficher les lignes.");
    const snapshotsAvant = new Map(tablesAvant.map((table) => [table, ouvrirSnapshot(base, table)]));

    positionnerDiagnostic("COMPARAISON_0023", "APPLICATION_MIGRATION_0023_MEMOIRE",
      "Vérifier le SQL de 0023 sur une copie locale uniquement; aucune base distante n’est appelée par ce script.");
    const migration = await readFile(new URL("../migrations/0023_activation_initiale_securisee.sql", import.meta.url), "utf8");
    exiger(!/\bUPDATE\s+utilisateurs\b/iu.test(migration),
      "La migration contient une mise à jour des comptes existants.");
    base.exec(migration);

    positionnerDiagnostic("COMPARAISON_0023", "COMPARAISON_SCHEMA_APRES_0023",
      "Comparer les seules additions prévues par 0023 et préserver l’archive chiffrée en cas d’écart.");
    const tablesApres = listerTables(base);
    exiger(tablesApres.length === tablesAvant.length + 2
      && tablesApres.includes("preuves_operateur_recuperation")
      && tablesApres.includes("recuperations_acces_proprietaire"),
    "La migration n’a pas ajouté exactement les deux tables de récupération attendues.");
    for (const table of tablesAvant) {
      const avant = snapshotsAvant.get(table);
      const apres = ouvrirSnapshot(base, table, avant?.colonnes.split("\u001f"));
      exiger(avant !== undefined && avant.colonnes === apres.colonnes && avant.lignes === apres.lignes && avant.empreinte === apres.empreinte,
        "Une donnée préexistante a changé pendant la migration locale.");
    }

    positionnerDiagnostic("COMPARAISON_0023", "LECTURE_AGREGATS_APRES_0023",
      "Relire les compteurs de comptes, mots de passe, activations et MFA après la migration locale.");
    const indicateursApres = lireIndicateurs(base);
    positionnerDiagnostic("COMPARAISON_0023", "COMPARAISON_AGREGATS_APRES_0023",
      "Comparer uniquement les compteurs agrégés avant/après sans afficher de données de compte.");
    exigerAgregat(indicateursApres.comptes, indicateursAvant.comptes, "COMPTES_APRES_0023", "COMPTES_MODIFIES_PAR_0023",
      "Arrêter la validation et examiner la migration; ne l’appliquer à aucune base distante.");
    exigerAgregat(indicateursApres.changementsRequis, indicateursAvant.changementsRequis, "CHANGEMENTS_MOT_DE_PASSE_APRES_0023", "ETAT_MOT_DE_PASSE_MODIFIE_PAR_0023",
      "Arrêter la validation et examiner la migration; ne l’appliquer à aucune base distante.");
    exigerAgregat(indicateursApres.activationsHeritees, indicateursAvant.activationsHeritees, "ACTIVATIONS_HERITEES_APRES_0023", "ACTIVATIONS_HERITEES_MODIFIEES_PAR_0023",
      "Arrêter la validation et examiner la migration; ne l’appliquer à aucune base distante.");
    exigerAgregat(indicateursApres.activationsProprietaire, indicateursAvant.activationsProprietaire, "ACTIVATION_PROPRIETAIRE_APRES_0023", "ACTIVATION_PROPRIETAIRE_MODIFIEE_PAR_0023",
      "Arrêter la validation et examiner la migration; ne l’appliquer à aucune base distante.");
    exigerAgregat(indicateursApres.mfaActifs, indicateursAvant.mfaActifs, "MFA_APRES_0023", "ETAT_MFA_MODIFIE_PAR_0023",
      "Arrêter la validation et examiner la migration; ne l’appliquer à aucune base distante.");
    positionnerDiagnostic("COMPARAISON_0023", "VERIFICATION_METADATA_ACTIVATION_APRES_0023",
      "Compter les échéances et liaisons de récupération réellement renseignées, sans confondre les empreintes d’activation historiques.");
    const activationPostMigration = base.prepare(
      `SELECT COALESCE(SUM(CASE WHEN code_activation_expire_le IS NOT NULL THEN 1 ELSE 0 END), 0) AS expirations,
              COALESCE(SUM(CASE WHEN code_activation_recuperation_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS liaisons_recuperation
       FROM utilisateurs WHERE code_activation_hash IS NOT NULL`,
    ).get();
    exiger(Number(Reflect.get(activationPostMigration, "expirations")) === 0
      && Number(Reflect.get(activationPostMigration, "liaisons_recuperation") ?? 0) === 0,
    "La migration a modifié les métadonnées d’activation des comptes existants.");
    const colonnesAjoutees = base.prepare(
      `SELECT
         (SELECT COUNT(*) FROM utilisateurs WHERE code_activation_expire_le IS NOT NULL OR code_activation_recuperation_id IS NOT NULL) AS utilisateurs_modifies,
         (SELECT COUNT(*) FROM sessions WHERE activation_initiale <> 0 OR recuperation_id IS NOT NULL) AS sessions_modifiees,
         (SELECT COUNT(*) FROM defis_mfa WHERE activation_initiale <> 0 OR recuperation_id IS NOT NULL) AS defis_modifies`,
    ).get();
    exiger(Number(Reflect.get(colonnesAjoutees, "utilisateurs_modifies")) === 0
      && Number(Reflect.get(colonnesAjoutees, "sessions_modifiees")) === 0
      && Number(Reflect.get(colonnesAjoutees, "defis_modifies")) === 0,
    "Les colonnes ajoutées ne sont pas neutres pour les enregistrements préexistants.");

    positionnerDiagnostic("COMPARAISON_0023", "PRAGMA_FOREIGN_KEY_CHECK_APRES",
      "Vérifier les relations de la copie migrée et ne pas appliquer la migration distante si elles échouent.");
    const violations = base.prepare("PRAGMA foreign_key_check").all();
    exiger(violations.length === 0, "La migration locale a produit une violation de clé étrangère.");
    positionnerDiagnostic("COMPARAISON_0023", "PRAGMA_INTEGRITY_CHECK_APRES",
      "Vérifier l’intégrité SQLite après la migration locale avant toute décision Staging.");
    const integriteApres = base.prepare("PRAGMA integrity_check").all();
    exiger(integriteApres.length === 1 && Reflect.get(integriteApres[0], "integrity_check") === "ok",
      "La vérification d’intégrité SQLite a échoué après la migration.");
    const versionsApres = base.prepare("SELECT COUNT(*) AS total FROM d1_migrations").get();
    exiger(Number(Reflect.get(versionsApres, "total")) === 22,
      "Le registre historique des 22 migrations a été modifié par l’application locale isolée de 0023.");
    const index = base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").get();
    const triggers = base.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger'").get();

    console.log("PASS — sauvegarde Staging déchiffrée et restaurée uniquement en SQLite mémoire sous DPAPI CurrentUser.");
    console.log(`PASS — ${indicateursAvant.comptes} comptes comparés champ par champ ; statut, mot de passe, activation et MFA inchangés.`);
    console.log(`PASS — ${indicateursAvant.activationsHeritees} activations héritées conservées et ${indicateursAvant.activationsProprietaire} activation propriétaire préexistante préservée ; 0 échéance rétroactive, 0 liaison de récupération ajoutée.`);
    console.log(`PASS — 22 migrations restaurées puis migration 0023 appliquée ; ${tablesApres.length} tables au total, ${Number(Reflect.get(index, "total"))} index, ${Number(Reflect.get(triggers, "total"))} déclencheurs, 0 violation FK.`);
    console.log("PASS — aucune ligne métier ou d’authentification préexistante n’a été modifiée par la migration.");
  } finally {
    base?.close();
    cle.fill(0);
    clair.fill(0);
  }
}

main().catch((erreur) => {
  const codeSysteme = typeof erreur === "object" && erreur !== null ? Reflect.get(erreur, "code") : undefined;
  const codeSystemePermis = codeSysteme === "ENOENT" ? "FICHIER_ABSENT"
    : codeSysteme === "EACCES" || codeSysteme === "EPERM" ? "ACCES_FICHIER_REFUSE"
      : null;
  const code = typeof diagnosticCourant.code === "string"
    ? diagnosticCourant.code
    : codeSystemePermis ?? classifierErreurSqlite(erreur);
  const type = typeof diagnosticCourant.type === "string"
    ? diagnosticCourant.type
    : typeErreurSqlite(erreur);
  const codeNatif = typeof diagnosticCourant.codeNatif === "string"
    ? diagnosticCourant.codeNatif
    : codeNatifSqlite(erreur);
  const ligne = typeof diagnosticCourant.ligne === "number" && Number.isInteger(diagnosticCourant.ligne)
    ? String(diagnosticCourant.ligne)
    : "INDISPONIBLE";
  console.error("ETAPE=" + etapeVerification);
  console.error("CODE=" + code);
  console.error("TYPE_ERREUR=" + type);
  console.error("OPERATION=" + diagnosticCourant.operation);
  console.error("SQLITE_CODE_NATIF=" + codeNatif);
  console.error("LIGNE_SQL=" + ligne);
  console.error("ACTION=" + diagnosticCourant.action);
  if (typeof diagnosticCourant.groupe === "string"
    && Number.isSafeInteger(diagnosticCourant.attendu)
    && Number.isSafeInteger(diagnosticCourant.observe)) {
    console.error("AGREGAT=" + diagnosticCourant.groupe);
    console.error("ATTENDU=" + diagnosticCourant.attendu);
    console.error("OBSERVE=" + diagnosticCourant.observe);
  }
  if (codeSystemePermis === "ACCES_FICHIER_REFUSE") {
    console.error("ACTION_SYSTEME=Vérifier le profil et les ACL du fichier avec le même compte Windows; ne pas modifier les ACL globales ni copier le coffre.");
  } else if (codeSystemePermis === "FICHIER_ABSENT") {
    console.error("ACTION_SYSTEME=Vérifier le chemin local exact sous USERPROFILE\\AppData\\Local; aucun export distant n’est requis.");
  }
  console.error("MODE_RESTAURATION=COPIE_SQLITE_MEMOIRE_SEULE; AUCUN_ACCES_CLOUDFLARE");
  process.exitCode = 1;
});
