import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { protegerDpapi } from "./coffre-recuperation-dpapi.mjs";

const racineProjet = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableWrangler = resolve(racineProjet, "node_modules/wrangler/bin/wrangler.js");
const fichierConfiguration = resolve(racineProjet, "wrangler.staging.toml");
const fichierVerificateur = resolve(racineProjet, "scripts/verifier-migration-0023-copie-staging.mjs");
const compteCloudflareAttendu = "a2c898e7e1fda02365b7d8a49809f7e9";
const nomBaseAttendu = "sigad-staging-db";
const identifiantBaseAttendu = "a54e1ea9-c49a-4729-ad06-a40ceb421127";
const liaisonBaseAttendue = "DB";
const versionEnveloppe = 2;
let cheminSauvegardeResultat;
let exportD1Declenche = "NON";
let marqueurExecution;
let etapeCourante = {
  nom: "PRÉCONDITIONS",
  code: "SIGAD_PRECONDITIONS",
  explication: "Une précondition locale n’est pas satisfaite.",
  action: "Exécutez le mode diagnostic sans export et corrigez le contrôle indiqué.",
};

class ErreurDiagnostique extends Error {
  constructor(etape, code, explication, action, diagnosticSqlite = null) {
    super(explication);
    this.name = "ErreurDiagnostique";
    this.etape = etape;
    this.code = code;
    this.action = action;
    this.diagnosticSqlite = diagnosticSqlite;
  }
}

function positionnerEtape(nom, code, explication, action) {
  etapeCourante = { nom, code, explication, action };
}

function exiger(condition, message) {
  if (!condition) throw new ErreurDiagnostique(etapeCourante.nom, etapeCourante.code, message, etapeCourante.action);
}

function codeSysteme(erreur) {
  return typeof erreur === "object" && erreur !== null && typeof Reflect.get(erreur, "code") === "string"
    ? Reflect.get(erreur, "code")
    : "INCONNU";
}

function erreurFichier(etape, erreur, codeBase = etape) {
  const code = codeSysteme(erreur);
  if (code === "ENOENT") {
    return new ErreurDiagnostique(etape, `${codeBase}_ENOENT`, "Un dossier ou fichier local requis est introuvable.",
      "Vérifiez le chemin indiqué par le diagnostic; le script crée désormais le dossier parent des sauvegardes.");
  }
  if (code === "EACCES" || code === "EPERM") {
    return new ErreurDiagnostique(etape, `${codeBase}_ACCESS_DENIED`, "Windows a refusé l’accès au chemin local requis.",
      "Vérifiez les ACL du dossier sous le même compte Windows; ne modifiez pas les permissions globales du disque.");
  }
  return new ErreurDiagnostique(etape, `${codeBase}_FILESYSTEM_ERROR`, "Une opération locale sur le système de fichiers a échoué.",
    "Relancez le diagnostic pour obtenir le code d’étape; aucun contenu de fichier n’est affiché.");
}

function environnementWrangler(niveau = "error") {
  return {
    ...process.env,
    WRANGLER_LOG: niveau,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_SANITIZE: "true",
    NO_COLOR: "1",
  };
}

function executerSilencieusement(executable, argumentsCommande, options = {}) {
  const resultat = spawnSync(executable, argumentsCommande, {
    cwd: options.cwd ?? racineProjet,
    env: options.env ?? environnementWrangler(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (options.marqueExportD1 === true) {
    exportD1Declenche = resultat.error && !resultat.pid
      ? "NON"
      : resultat.status === 0
        ? "OUI — commande Wrangler terminée avec succès"
        : resultat.pid
          ? "POSSIBLE — processus Wrangler lancé; résultat distant non confirmé"
          : "NON";
  }
  if (resultat.error) {
    const codeErreurSysteme = typeof resultat.error.code === "string" ? resultat.error.code : "INCONNU";
    const estDroits = codeErreurSysteme === "EACCES" || codeErreurSysteme === "EPERM";
    const estAbsent = codeErreurSysteme === "ENOENT";
    throw new ErreurDiagnostique(
      etapeCourante.nom,
      `${options.codeEchec ?? etapeCourante.code}_${codeErreurSysteme}`,
      estAbsent
        ? "Le sous-processus ou le chemin requis est introuvable."
        : estDroits
          ? "Windows a refusé l’accès au sous-processus ou au chemin demandé."
          : "Le sous-processus n’a pas pu être démarré.",
      estAbsent
        ? "Vérifiez le chemin de Node/Wrangler/PowerShell et relancez le diagnostic sans export."
        : estDroits
          ? "Vérifiez les ACL du dossier et l’accès au binaire; ne changez pas les permissions système globales."
          : "Relancez le diagnostic sans export et vérifiez l’état du processus Windows.",
    );
  }
  if (resultat.status !== 0) {
    const contenuInterne = `${resultat.stdout ?? ""}\n${resultat.stderr ?? ""}`.toLowerCase();
    if (/not authenticated|not logged in|credentials may have expired|run `?wrangler login/u.test(contenuInterne)) {
      throw new ErreurDiagnostique("CLOUDFLARE_AUTHENTIFICATION", "WRANGLER_AUTH_REQUIRED",
        "La session Wrangler du PowerShell courant n’est pas authentifiée ou a expiré.",
        "Depuis ce PowerShell, vérifiez `npx wrangler whoami`; réauthentifiez Wrangler uniquement via le navigateur officiel si nécessaire.");
    }
    if (/forbidden|permission denied|insufficient permissions|unauthorized|error 10000/u.test(contenuInterne)) {
      throw new ErreurDiagnostique(etapeCourante.nom, "WRANGLER_PERMISSION_DENIED",
        "Le compte connecté ne possède pas les droits requis pour cette lecture Cloudflare.",
        "Faites vérifier l’accès en lecture D1 sur le compte et la base Staging; ne changez aucun rôle de production.");
    }
    if (/enotfound|eai_again|dns|tls|certificate|fetch failed|network/u.test(contenuInterne)) {
      throw new ErreurDiagnostique(etapeCourante.nom, "WRANGLER_NETWORK_FAILURE",
        "Wrangler n’a pas pu joindre le service Cloudflare (réseau, DNS ou TLS).",
        "Vérifiez la connectivité officielle, le DNS et l’horloge Windows; ne désactivez pas la validation TLS.");
    }
    const codeSortie = Number.isInteger(resultat.status) ? String(resultat.status) : "INCONNU";
    throw new ErreurDiagnostique(etapeCourante.nom, `${options.codeEchec ?? etapeCourante.code}_EXIT_${codeSortie}`,
      options.explicationEchec ?? "Le sous-processus a retourné un code d’échec; sa sortie brute a été supprimée.",
      options.actionEchec ?? "Consultez le code non sensible affiché, puis relancez le diagnostic sans export.");
  }
  return resultat.stdout;
}

function analyserJsonPrive(sortie, message) {
  try {
    return JSON.parse(sortie.trim());
  } catch {
    throw new ErreurDiagnostique(etapeCourante.nom, etapeCourante.code + "_INVALID_JSON", message,
      "Vérifiez la version locale de Wrangler et relancez uniquement le diagnostic sans export.");
  }
}

function verifierConfiguration() {
  const texte = readFileSync(fichierConfiguration, "utf8");
  exiger(/^name\s*=\s*"sigad-staging"\s*$/mu.test(texte), "Le fichier Wrangler ne cible pas le Worker de Staging attendu.");
  exiger(/^ENVIRONMENT\s*=\s*"staging"\s*$/mu.test(texte), "ENVIRONMENT n’est pas staging dans la configuration visée.");

  const sections = texte.split(/^\[\[d1_databases\]\]\s*$/mu);
  exiger(sections.length === 2, "La configuration ne contient pas une unique liaison D1 Staging explicite.");
  const section = sections[1].split(/^\[/mu, 1)[0];
  exiger(/^binding\s*=\s*"DB"\s*$/mu.test(section), "La liaison D1 attendue DB est absente.");
  exiger(/^database_name\s*=\s*"sigad-staging-db"\s*$/mu.test(section), "Le nom de D1 dans Wrangler ne correspond pas à Staging.");
  exiger(/^database_id\s*=\s*"a54e1ea9-c49a-4729-ad06-a40ceb421127"\s*$/mu.test(section), "L’identifiant D1 dans Wrangler ne correspond pas à Staging.");
}

function verifierProfilWindows() {
  exiger(process.platform === "win32", "Exécutez ce script depuis PowerShell sous Windows.");
  const profil = process.env.USERPROFILE;
  const appDataLocal = process.env.LOCALAPPDATA;
  exiger(typeof profil === "string" && profil.length > 0 && typeof appDataLocal === "string" && appDataLocal.length > 0,
    "Le profil Windows courant ne fournit pas USERPROFILE et LOCALAPPDATA.");
  exiger(!/\\Packages\\sandbox\./iu.test(resolve(appDataLocal)),
    "LOCALAPPDATA est redirigé par le Sandbox. Ouvrez PowerShell Windows normal sous le compte DPAPI propriétaire.");

  const dossierSauvegardes = resolve(appDataLocal, "SIGAD", "Staging", "backups");
  const relatifAuProjet = relative(racineProjet, dossierSauvegardes);
  exiger(relatifAuProjet.startsWith(`..${sep}`) || relatifAuProjet === ".." || isAbsolute(relatifAuProjet),
    "Le dossier de sauvegarde doit rester hors du dépôt Git.");
  return dossierSauvegardes;
}

function verifierConnexionEtBase() {
  positionnerEtape("CLOUDFLARE", "WRANGLER_WHOAMI", "La vérification Cloudflare en lecture seule a échoué.",
    "Vérifiez la session Wrangler et l’accès en lecture à la D1 Staging depuis ce PowerShell.");
  const identite = analyserJsonPrive(
    executerSilencieusement(process.execPath, [executableWrangler, "whoami", "--json"], {
      codeEchec: "WRANGLER_WHOAMI",
      messageEchec: "Wrangler n’est pas authentifié dans ce PowerShell ou whoami a échoué; aucun export n’a été lancé.",
    }),
    "La réponse JSON de whoami est invalide; aucun export n’a été lancé.",
  );
  exiger(identite.loggedIn === true && Array.isArray(identite.accounts)
    && identite.accounts.some((account) => account && account.id === compteCloudflareAttendu),
  "Le compte Cloudflare authentifié n’est pas celui autorisé; aucun export n’a été lancé.");

  positionnerEtape("CLOUDFLARE", "WRANGLER_D1_LIST", "La liste des D1 Staging n’a pas pu être vérifiée en lecture seule.",
    "Vérifiez l’accès en lecture aux bases D1 et l’identifiant de la base Staging.");
  const bases = analyserJsonPrive(
    executerSilencieusement(process.execPath, [executableWrangler, "d1", "list", "--config", fichierConfiguration, "--json"], {
      env: environnementWrangler("log"),
      codeEchec: "WRANGLER_D1_LIST",
      messageEchec: "La liste D1 est inaccessible; aucun export n’a été lancé.",
    }),
    "La réponse JSON de la liste D1 est invalide; aucun export n’a été lancé.",
  );
  exiger(Array.isArray(bases), "La liste D1 retournée est invalide; aucun export n’a été lancé.");
  const base = bases.find((candidate) => candidate && candidate.name === nomBaseAttendu
    && [candidate.uuid, candidate.database_id, candidate.id].includes(identifiantBaseAttendu));
  exiger(base !== undefined, "La D1 Staging et son identifiant exact ne figurent pas dans le compte authentifié; aucun export n’a été lancé.");
}

function lireSidWindows() {
  positionnerEtape("PRÉCONDITIONS", "WINDOWS_IDENTITY", "L’identité Windows de l’exécution n’a pas pu être vérifiée.",
    "Utilisez PowerShell Windows normal sous le compte DPAPI autorisé.");
  const sortie = executerSilencieusement("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
  ], { env: process.env, messageEchec: "L’identité Windows courante ne peut pas être vérifiée." }).trim();
  exiger(/^S-1-[0-9-]+$/u.test(sortie), "Le SID Windows courant est invalide.");
  return sortie;
}

function restreindreAcl(chemin, sid, dossier) {
  const droit = dossier ? `(OI)(CI)F` : "F";
  executerSilencieusement("icacls.exe", [chemin, "/inheritance:r", "/grant:r", `*${sid}:${droit}`], {
    env: process.env,
    messageEchec: "Les ACL du dossier de sauvegarde n’ont pas pu être limitées au compte Windows courant.",
  });
}

async function verifierEcritureEtAcl(dossierSauvegardes, sid) {
  positionnerEtape("PRÉCONDITIONS", "BACKUP_PATH", "Le chemin ou les droits du dossier de sauvegarde sont invalides.",
    "Vérifiez le profil Windows et les ACL du dossier de sauvegarde; le diagnostic ne touche qu’à son dossier temporaire.");
  try {
    await mkdir(dossierSauvegardes, { recursive: true });
    const dossierSonde = join(dossierSauvegardes, `.sigad-diagnostic-${randomBytes(8).toString("hex")}`);
    await mkdir(dossierSonde, { recursive: false });
    try {
      restreindreAcl(dossierSonde, sid, true);
      const fichierSonde = join(dossierSonde, "acces.txt");
      await ecrireAtomiquement(fichierSonde, "SIGAD_LOCAL_ACCESS_CHECK\n");
      const lecture = await readFile(fichierSonde, "utf8");
      exiger(lecture === "SIGAD_LOCAL_ACCESS_CHECK\n", "Le contrôle local de lecture/écriture n’a pas réussi.");
    } finally {
      await rm(dossierSonde, { recursive: true, force: true });
    }
  } catch (erreur) {
    if (erreur instanceof ErreurDiagnostique) throw erreur;
    throw erreurFichier("PRÉCONDITIONS", erreur, "BACKUP_PATH");
  }
}

async function demanderConfirmation() {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return await terminal.question(
      "L’export est en lecture seule pour D1, mais Cloudflare indique qu’il peut suspendre brièvement les requêtes. Saisissez OUI pour continuer : ",
    );
  } finally {
    terminal.close();
  }
}

function dateCompacte(date) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
}

async function ecrireAtomiquement(chemin, contenu) {
  const fichier = await open(chemin, "wx", 0o600);
  try {
    await fichier.writeFile(contenu, "utf8");
    await fichier.sync();
  } finally {
    await fichier.close();
  }
}

async function supprimerExportTemporaire(chemin) {
  try {
    const informations = await stat(chemin);
    if (informations.isFile() && informations.size > 0) {
      const fichier = await open(chemin, "r+");
      try {
        const blocZero = Buffer.alloc(64 * 1024);
        let position = 0;
        while (position < informations.size) {
          const taille = Math.min(blocZero.length, informations.size - position);
          const resultat = await fichier.write(blocZero, 0, taille, position);
          exiger(resultat.bytesWritten === taille, "L’effacement de précaution du SQL temporaire est incomplet.");
          position += taille;
        }
        await fichier.sync();
        blocZero.fill(0);
      } finally {
        await fichier.close();
      }
    }
    await rm(chemin, { force: true });
    exiger(!(await access(chemin).then(() => true, () => false)),
      "Le fichier SQL temporaire est encore présent après nettoyage.");
    return true;
  } catch {
    await rm(chemin, { force: true }).catch(() => undefined);
    return false;
  }
}

function chiffrerExport(contenuSql) {
  const cle = randomBytes(32);
  const iv = randomBytes(12);
  const date = new Date().toISOString();
  const aad = `SIGAD-D1-BACKUP-v${versionEnveloppe}|${compteCloudflareAttendu}|${identifiantBaseAttendu}|${date}`;
  try {
    const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
    chiffreur.setAAD(Buffer.from(aad, "utf8"));
    const contenuChiffre = Buffer.concat([chiffreur.update(contenuSql), chiffreur.final()]);
    const document = {
      version: versionEnveloppe,
      algorithm: "AES-256-GCM",
      keyProtection: "DPAPI-CurrentUser",
      scope: nomBaseAttendu,
      accountId: compteCloudflareAttendu,
      databaseId: identifiantBaseAttendu,
      createdAt: date,
      aad,
      bytes: contenuSql.length,
      sha256: createHash("sha256").update(contenuSql).digest("hex"),
      iv: iv.toString("base64"),
      authTag: chiffreur.getAuthTag().toString("base64"),
      ciphertext: contenuChiffre.toString("base64"),
      wrappedKeyDpapiCurrentUser: protegerDpapi(cle),
    };
    contenuChiffre.fill(0);
    return `${JSON.stringify(document)}\n`;
  } finally {
    cle.fill(0);
    iv.fill(0);
  }
}

function executerVerificationLocale(cheminSauvegarde) {
  positionnerEtape("RESTAURATION_SQLITE", "SQLITE_RESTORE", "La sauvegarde chiffrée n’a pas pu être restaurée dans SQLite local.",
    "Conservez le fichier chiffré non validé et relancez le vérificateur après correction.");
  const resultat = spawnSync(process.execPath, [
    "--experimental-sqlite", fichierVerificateur, "--verify-existing", cheminSauvegarde,
  ], {
    cwd: racineProjet,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (resultat.error) {
    const code = codeSysteme(resultat.error);
    throw new ErreurDiagnostique("RESTAURATION_SQLITE", "SQLITE_VERIFIER_" + code,
      "Le sous-processus local de restauration SQLite n’a pas pu démarrer.",
      "Vérifiez le chemin Node et la disponibilité de node:sqlite sous la version Node utilisée.");
  }
  if (resultat.status !== 0) {
    const sortieInterne = (resultat.stdout ?? "") + "\n" + (resultat.stderr ?? "");
    const stageVerificateur = sortieInterne.match(/^(?:ETAPE|SIGAD_STAGE)=(DPAPI_DECHIFFREMENT|RESTAURATION_SQLITE|COMPARAISON_0023)$/mu)?.[1];
    if (stageVerificateur === "DPAPI_DECHIFFREMENT") {
      throw new ErreurDiagnostique("CHIFFREMENT_DPAPI", "DPAPI_DECRYPTION_FAILED",
        "Le fichier chiffré n’a pas pu être ouvert sous le profil DPAPI Windows courant.",
        "Utilisez le même compte Windows que celui qui a créé la sauvegarde; ne copiez pas le fichier sous une autre identité.");
    }
    if (stageVerificateur === "COMPARAISON_0023") {
      throw new ErreurDiagnostique("COMPARAISON_0023", "MIGRATION_0023_COMPARISON_FAILED",
        "La comparaison avant/après de 0023 ou son contrôle d’intégrité a échoué sur la copie SQLite locale.",
        "Conservez la sauvegarde chiffrée non validée et examinez la migration sur une copie de test; aucune base distante n’a été modifiée.");
    }
    const diagnosticSqlite = {
      code: sortieInterne.match(/^CODE=([A-Z0-9_]{1,64})$/mu)?.[1] ?? null,
      type: sortieInterne.match(/^TYPE_ERREUR=([A-Za-z][A-Za-z0-9_]{0,63})$/mu)?.[1] ?? null,
      operation: sortieInterne.match(/^OPERATION=([A-Z0-9_]{1,64})$/mu)?.[1] ?? null,
      codeNatif: sortieInterne.match(/^SQLITE_CODE_NATIF=([A-Z0-9_]{1,64})$/mu)?.[1] ?? null,
      ligne: sortieInterne.match(/^LIGNE_SQL=([0-9]{1,9}|INDISPONIBLE)$/mu)?.[1] ?? null,
      action: sortieInterne.match(/^ACTION=([\p{L}\p{N} ,;.'’:-]{1,300})$/mu)?.[1] ?? null,
    };
    const codeSortie = Number.isInteger(resultat.status) ? String(resultat.status) : "INCONNU";
    throw new ErreurDiagnostique("RESTAURATION_SQLITE", "SQLITE_RESTORE_EXIT_" + codeSortie,
      "La restauration SQLite locale a échoué; le sous-processus a fourni un diagnostic filtré.",
      diagnosticSqlite.action ?? "Relancez le mode --verify-existing sur le fichier chiffré; aucun nouvel export ni accès Cloudflare n’est nécessaire.",
      diagnosticSqlite);
  }
  const lignesAutorisees = resultat.stdout.split(/\r?\n/u).filter((ligne) =>
    /^PASS — (sauvegarde Staging déchiffrée|\d+ comptes comparés|\d+ empreintes d’activation|22 migrations restaurées|aucune ligne métier)/u.test(ligne));
  exiger(lignesAutorisees.length >= 4, "Le vérificateur n’a pas retourné toutes les preuves agrégées attendues.");
  return lignesAutorisees;
}

async function executerDiagnosticSeul(dossierSauvegardes) {
  console.log("MODE_DIAGNOSTIC: ACTIF — aucun export, migration, déploiement ou changement de compte ne sera lancé.");
  console.log(`DOSSIER_SAUVEGARDE: ${dossierSauvegardes}`);
  const sid = lireSidWindows();
  await verifierEcritureEtAcl(dossierSauvegardes, sid);
  console.log("CHEMIN_ACL: PASS — écriture, lecture, ACL de la sonde et suppression vérifiées; la sonde a été supprimée.");

  positionnerEtape("PRÉCONDITIONS", "WRANGLER_BINARY", "Le binaire Wrangler local n’a pas pu être vérifié.",
    "Restaurez les dépendances du dépôt à partir du lockfile, puis relancez le mode diagnostic.");
  const version = executerSilencieusement(process.execPath, [executableWrangler, "--version"], {
    codeEchec: "WRANGLER_VERSION",
    explicationEchec: "Le sous-processus Wrangler local n’a pas pu démarrer correctement.",
    actionEchec: "Vérifiez Node.js et l’installation locale de Wrangler; aucune commande distante n’a été lancée.",
    env: environnementWrangler("log"),
  }).trim();
  exiger(/^\d+\.\d+\.\d+$/u.test(version), "La version Wrangler locale n’a pas été reconnue.");
  console.log("WRANGLER_LOCAL: PASS — " + version + "; sous-processus Node local vérifié.");

  positionnerEtape("PRÉCONDITIONS", "DPAPI_SELF_TEST", "Le test DPAPI CurrentUser n’a pas abouti.",
    "Exécutez PowerShell et Node sous le même compte Windows propriétaire du profil DPAPI; ne changez pas de compte.");
  executerSilencieusement(process.execPath, [join(racineProjet, "scripts/coffre-recuperation-dpapi.mjs"), "verifier-dpapi"], {
    codeEchec: "DPAPI_SELF_TEST",
    explicationEchec: "L’aller-retour DPAPI CurrentUser a échoué ou son sous-processus n’a pas pu démarrer.",
    actionEchec: "Vérifiez que PowerShell et Node sont lancés sous le même compte Windows; aucun secret n’a été écrit.",
    env: process.env,
  });
  console.log("DPAPI_CURRENTUSER: PASS — aller-retour témoin vérifié dans un sous-processus; aucun secret persistant créé.");

  verifierConnexionEtBase();
  console.log("CLOUDFLARE_LECTURE: PASS — session et identité exacte de la D1 Staging vérifiées; aucune exportation demandée.");

  let tentativeAncienne = "INDÉTERMINÉ — l’exécution précédente ne conservait aucun marqueur d’étape.";
  try {
    const entrees = await readdir(dossierSauvegardes, { withFileTypes: true });
    const anciensDossiers = entrees
      .filter((entree) => entree.isDirectory() && /^before-0023-\d{8}T\d{6}Z-[a-f0-9]{8}$/u.test(entree.name))
      .map((entree) => entree.name)
      .sort()
      .reverse();
    let marqueurTrouve = false;
    for (const ancienDossier of anciensDossiers) {
      const marqueur = join(dossierSauvegardes, ancienDossier, "etat-export.json");
      if (!(await access(marqueur).then(() => true, () => false))) continue;
      const document = JSON.parse(await readFile(marqueur, "utf8"));
      const etat = Reflect.get(document, "exportD1");
      if (etat === "NON" || etat === "POSSIBLE" || etat === "OUI") {
        tentativeAncienne = etat;
        marqueurTrouve = true;
        break;
      }
    }
    if (anciensDossiers.length === 0) {
      tentativeAncienne = "AUCUN DOSSIER D’EXÉCUTION TROUVÉ — aucune preuve d’export antérieur dans le chemin vérifié.";
    } else if (!marqueurTrouve) {
      tentativeAncienne = "INDÉTERMINÉ — les anciens dossiers ne contiennent pas de marqueur d’étape; l’ancien script ne consignait pas ce statut.";
    }
  } catch {
    tentativeAncienne = "INDÉTERMINÉ — le journal local d’exécution n’est pas lisible.";
  }
  console.log(`EXPORT_D1_PRÉCÉDENT: ${tentativeAncienne}`);
  console.log("EXPORT_D1_DANS_CE_DIAGNOSTIC: NON");
  console.log("COMPARAISON_0023: NON EFFECTUÉE");
}

async function enregistrerEtatExport(etat) {
  if (!marqueurExecution) return;
  try {
    await writeFile(marqueurExecution, JSON.stringify({ version: 1, exportD1: etat }) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch (erreur) {
    throw erreurFichier(etapeCourante.nom, erreur, "EXPORT_STATUS_MARKER");
  }
}

function etatExportPersistable() {
  if (exportD1Declenche.startsWith("OUI")) return "OUI";
  if (exportD1Declenche.startsWith("POSSIBLE")) return "POSSIBLE";
  return "NON";
}

function verifierWranglerLocal() {
  positionnerEtape("PRÉCONDITIONS", "WRANGLER_BINARY", "Le binaire Wrangler local n’a pas pu être vérifié.",
    "Restaurez les dépendances du dépôt à partir du lockfile, puis relancez le mode diagnostic.");
  const version = executerSilencieusement(process.execPath, [executableWrangler, "--version"], {
    codeEchec: "WRANGLER_VERSION",
    explicationEchec: "Le sous-processus Wrangler local n’a pas pu démarrer correctement.",
    actionEchec: "Vérifiez Node.js et l’installation locale de Wrangler; aucune commande distante n’a été lancée.",
    env: environnementWrangler("log"),
  }).trim();
  exiger(/^\d+\.\d+\.\d+$/u.test(version), "La version Wrangler locale n’a pas été reconnue.");
  return version;
}

function verifierDpapiCurrentUser() {
  positionnerEtape("CHIFFREMENT_DPAPI", "DPAPI_SELF_TEST", "Le test DPAPI CurrentUser n’a pas abouti.",
    "Exécutez PowerShell et Node sous le même compte Windows propriétaire du profil DPAPI; ne changez pas de compte.");
  executerSilencieusement(process.execPath, [join(racineProjet, "scripts/coffre-recuperation-dpapi.mjs"), "verifier-dpapi"], {
    codeEchec: "DPAPI_SELF_TEST",
    explicationEchec: "L’aller-retour DPAPI CurrentUser a échoué ou son sous-processus n’a pas pu démarrer.",
    actionEchec: "Vérifiez que PowerShell et Node sont lancés sous le même compte Windows; aucun secret persistant n’a été créé.",
    env: process.env,
  });
}

async function main() {
  positionnerEtape("PRÉCONDITIONS", "LOCAL_PROFILE", "Le profil Windows local est incomplet ou redirigé vers le Sandbox.",
    "Ouvrez PowerShell Windows normal sous le compte utilisateur autorisé; ne partagez aucun secret.");
  exiger(typeof process.env.LOCALAPPDATA === "string" && process.env.LOCALAPPDATA.length > 0,
    "LOCALAPPDATA est absent du profil Windows courant.");
  positionnerEtape("PRÉCONDITIONS", "WRANGLER_CONFIG", "La configuration locale Wrangler Staging est absente ou incohérente.",
    "Vérifiez le fichier wrangler.staging.toml et ses valeurs attendues; aucun export ne sera lancé.");
  verifierConfiguration();
  positionnerEtape("PRÉCONDITIONS", "WINDOWS_PROFILE", "Le profil Windows local est absent ou redirigé.",
    "Utilisez PowerShell Windows normal sous le compte utilisateur autorisé.");
  const dossierSauvegardes = verifierProfilWindows();
  positionnerEtape("PRÉCONDITIONS", "LOCAL_FILES", "Un fichier local requis est absent du dépôt.",
    "Vérifiez le chemin du projet et les dépendances locales Wrangler.");
  exiger(await access(executableWrangler).then(() => true, () => false),
    "Wrangler local est introuvable; installez les dépendances du dépôt avec le lockfile avant de continuer.");
  exiger(await access(fichierVerificateur).then(() => true, () => false), "Le vérificateur local de migration 0023 est absent.");

  if (process.argv.includes("--diagnostic-only")) {
    await executerDiagnosticSeul(dossierSauvegardes);
    return;
  }

  const sid = lireSidWindows();
  await verifierEcritureEtAcl(dossierSauvegardes, sid);
  verifierWranglerLocal();
  verifierDpapiCurrentUser();

  const confirmation = await demanderConfirmation();
  if (confirmation !== "OUI") {
    console.log("Annulé avant toute connexion Cloudflare ou tout export.");
    return;
  }

  verifierConnexionEtBase();
  const identifiantExecution = randomBytes(4).toString("hex");
  positionnerEtape("PRÉCONDITIONS", "BACKUP_RUN_DIRECTORY", "Le dossier privé de cette exécution n’a pas pu être préparé.",
    "Vérifiez le chemin et les ACL locales; aucune exportation n’est lancée avant la création et la protection du dossier.");
  await mkdir(dossierSauvegardes, { recursive: true });
  const dossierExecution = join(dossierSauvegardes, `before-0023-${dateCompacte(new Date())}-${identifiantExecution}`);
  await mkdir(dossierExecution, { recursive: false });
  restreindreAcl(dossierExecution, sid, true);

  const cheminSqlTemporaire = join(dossierExecution, "export-d1-staging-temporaire.sql");
  const cheminSauvegarde = join(dossierExecution, "sigad-staging-db-before-0023.dpapi-aesgcm.json");
  marqueurExecution = join(dossierExecution, "etat-export.json");
  cheminSauvegardeResultat = cheminSauvegarde;
  await enregistrerEtatExport("NON");
  const marqueurTemporaire = await open(cheminSqlTemporaire, "wx", 0o600);
  await marqueurTemporaire.close();

  let contenuSql;
  let exportReussi = false;
  try {
    positionnerEtape("EXPORT_D1", "WRANGLER_D1_EXPORT", "La commande d’export D1 Staging a échoué; sa sortie brute a été supprimée.",
      "Consultez le code et le statut EXPORT_D1; vérifiez le dossier de sauvegarde avant toute nouvelle tentative.");
    exportD1Declenche = "POSSIBLE — lancement imminent de Wrangler; résultat distant non confirmé";
    await enregistrerEtatExport("POSSIBLE");
    executerSilencieusement(process.execPath, [
      executableWrangler,
      "d1", "export", liaisonBaseAttendue,
      "--remote",
      "--config", fichierConfiguration,
      "--output", cheminSqlTemporaire,
      "--skip-confirmation",
    ], {
      codeEchec: "WRANGLER_D1_EXPORT",
      marqueExportD1: true,
      explicationEchec: "Wrangler a échoué pendant l’export; la sortie brute et tout lien temporaire ont été supprimés.",
      actionEchec: "Consultez le statut EXPORT_D1 et le dossier de sauvegarde avant toute nouvelle tentative.",
    });
    await enregistrerEtatExport(etatExportPersistable());
    exportReussi = true;
    positionnerEtape("CHIFFREMENT_DPAPI", "BACKUP_ENCRYPTION", "L’export local n’a pas pu être chiffré ou protégé par DPAPI.",
      "Ne réutilisez pas le SQL temporaire; confirmez son nettoyage et le test DPAPI CurrentUser avant une nouvelle tentative.");
    const taille = (await stat(cheminSqlTemporaire)).size;
    exiger(taille > 0, "L’export SQL est vide.");
    contenuSql = await readFile(cheminSqlTemporaire);
    exiger(contenuSql.length === taille, "La lecture du fichier SQL temporaire est incomplète.");
    const documentChiffre = chiffrerExport(contenuSql);
    await ecrireAtomiquement(cheminSauvegarde, documentChiffre);
    restreindreAcl(cheminSauvegarde, sid, false);
  } finally {
    contenuSql?.fill(0);
    await enregistrerEtatExport(etatExportPersistable());
    positionnerEtape("NETTOYAGE_SQL", "SQL_TEMP_CLEANUP", "Le fichier SQL temporaire n’a pas pu être confirmé comme supprimé.",
      "Vérifiez le dossier privé indiqué par le script et ne conservez pas le SQL en clair.");
    const nettoyageReussi = await supprimerExportTemporaire(cheminSqlTemporaire);
    exiger(nettoyageReussi, "L’export a été effectué, mais le fichier SQL temporaire n’a pas pu être confirmé comme supprimé.");
  }

  exiger(exportReussi, "L’export D1 n’a pas été achevé.");
  const preuves = executerVerificationLocale(cheminSauvegarde);
  console.log("EXPORT_D1: PASS — lecture seule, compte et identifiant de base vérifiés; aucun lien signé ni sortie Wrangler n’a été affiché ou journalisé.");
  console.log("CHIFFREMENT: PASS — AES-256-GCM; clé protégée DPAPI CurrentUser; ACL limitée au compte Windows courant.");
  console.log(`SAUVEGARDE_VÉRIFIABLE: ${cheminSauvegarde}`);
  for (const preuve of preuves) console.log(preuve);
}

main().catch(async (erreur) => {
  let diagnostic = erreur instanceof ErreurDiagnostique
    ? erreur
    : erreurFichier(etapeCourante.nom, erreur, etapeCourante.code);
  if (!(erreur instanceof ErreurDiagnostique) && codeSysteme(erreur) === "INCONNU") {
    diagnostic = new ErreurDiagnostique(etapeCourante.nom, etapeCourante.code + "_UNCLASSIFIED",
      "L’étape courante a échoué sans code système exploitable; aucun détail brut n’est affiché.",
      "Exécutez --diagnostic-only et transmettez uniquement les lignes ETAPE, CODE et EXPORT_D1.");
  }
  if (marqueurExecution) await enregistrerEtatExport(etatExportPersistable()).catch(() => undefined);
  console.error("ETAPE: " + diagnostic.etape);
  console.error("CODE: " + diagnostic.code);
  console.error("EXPLICATION: " + diagnostic.message);
  console.error("ACTION: " + diagnostic.action);
  if (diagnostic.diagnosticSqlite) {
    const detail = diagnostic.diagnosticSqlite;
    if (detail.code) console.error("CODE_SQLITE: " + detail.code);
    if (detail.type) console.error("TYPE_ERREUR: " + detail.type);
    if (detail.operation) console.error("OPERATION: " + detail.operation);
    if (detail.codeNatif) console.error("SQLITE_CODE_NATIF: " + detail.codeNatif);
    if (detail.ligne) console.error("LIGNE_SQL: " + detail.ligne);
  }
  console.error("EXPORT_D1: " + exportD1Declenche);
  const messageAutorise = erreur instanceof Error && [
    "Exécutez ce script depuis PowerShell sous Windows.",
    "LOCALAPPDATA est redirigé par le Sandbox. Ouvrez PowerShell Windows normal sous le compte DPAPI propriétaire.",
    "Wrangler n’est pas authentifié dans ce PowerShell ou whoami a échoué; aucun export n’a été lancé.",
    "Le compte Cloudflare authentifié n’est pas celui autorisé; aucun export n’a été lancé.",
    "La D1 Staging et son identifiant exact ne figurent pas dans le compte authentifié; aucun export n’a été lancé.",
    "La sauvegarde chiffrée a été créée, mais la restauration/comparaison locale n’a pas réussi. Le diagnostic détaillé est masqué; aucun changement distant n’a été effectué.",
  ].includes(erreur.message) ? erreur.message : "Échec contrôlé. Aucun secret, contenu SQL ou lien temporaire n’a été affiché.";
  console.error(`BLOCKED — ${messageAutorise}`);
  if (cheminSauvegardeResultat && await access(cheminSauvegardeResultat).then(() => true, () => false)) {
    console.error(`SAUVEGARDE_CHIFFRÉE_NON_VALIDÉE: ${cheminSauvegardeResultat}`);
  }
  process.exitCode = 1;
});
