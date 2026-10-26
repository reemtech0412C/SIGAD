import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const racine = resolve(import.meta.dirname, "..");
const options = new Set(process.argv.slice(2));
const optionsConnues = new Set(["--rapide", "--integration-only"]);
for (const option of options) {
  if (!optionsConnues.has(option)) throw new Error(`Option inconnue: ${option}. Options: --rapide, --integration-only.`);
}
if (options.has("--rapide") && options.has("--integration-only")) {
  throw new Error("--rapide et --integration-only ne peuvent pas être combinés.");
}

const lancerIntegration = !options.has("--rapide");
const integrationSeulement = options.has("--integration-only");
const environnementModeLocal = /CLOUDFLARE|(^|_)CF_|API[_-]?KEY|ACCESS[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|DATABASE_URL|SIGAD_EMAIL_API_URL|(^|_)PROD(uction)?(_|$)|(^|_)STAGING(_|$)|^(HTTP|HTTPS|ALL)_PROXY$/iu;
const environnementEnfant = Object.fromEntries(
  Object.entries(process.env).filter(([nom]) => !environnementModeLocal.test(nom)),
);
for (const nom of [
  "SIGAD_RUN_PLAYWRIGHT",
  "SIGAD_PHASE114_ACTIVATION",
  "SIGAD_INTEGRATION_TESTS",
  "SIGAD_PLAYWRIGHT_GREP",
  "SIGAD_PLAYWRIGHT_GREP_INVERT",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NPM_CONFIG_USERCONFIG",
  "NPM_CONFIG_REGISTRY",
]) delete environnementEnfant[nom];
environnementEnfant.WRANGLER_SEND_METRICS = "false";
environnementEnfant.DO_NOT_TRACK = "1";

function formaterDate(date) {
  return `${date.toISOString()} (${date.toLocaleString("fr-FR", { timeZone: "Africa/Ndjamena" })} Africa/Ndjamena)`;
}

function citerCommande(executable, argumentsCommande) {
  return JSON.stringify([executable, ...argumentsCommande]);
}

function nettoyerSortie(sortie) {
  return sortie
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/giu, "[CLE PRIVEE MASQUEE]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/giu, "Bearer [MASQUE]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[COURRIEL MASQUE]")
    .replace(/\+?235[\s().-]*\d[\d\s().-]{5,}\d/gu, "[TELEPHONE MASQUE]")
    .replace(/\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/gu, "[JETON MASQUE]");
}

function executerCommande(argumentsCommande, environnement) {
  return new Promise((resoudre) => {
    const sortie = [];
    let erreurDemarrage = null;
    const enfant = spawn(process.execPath, argumentsCommande, {
      cwd: racine,
      env: environnement,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    enfant.stdout.on("data", (bloc) => sortie.push(bloc));
    enfant.stderr.on("data", (bloc) => sortie.push(bloc));
    enfant.once("error", (erreur) => { erreurDemarrage = erreur; });
    enfant.once("close", (code, signal) => {
      resoudre({ code, signal, erreurDemarrage, sortie: Buffer.concat(sortie).toString("utf8") });
    });
  });
}

function lireCheminsGit(argumentsGit) {
  const resultat = execFileSync("git", argumentsGit, { cwd: racine, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  return resultat.toString("utf8").split("\0").filter(Boolean);
}

async function prendreInstantaneProjet() {
  const chemins = new Set([
    ...lireCheminsGit(["ls-files", "-z"]),
    ...lireCheminsGit(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const empreintes = new Map();
  for (const chemin of chemins) {
    const octets = await readFile(join(racine, chemin));
    empreintes.set(chemin, createHash("sha256").update(octets).digest("hex"));
  }
  return empreintes;
}

function lireInventaireIgnore() {
  const resultat = execFileSync("git", ["status", "--short", "--ignored", "--untracked-files=normal"], {
    cwd: racine,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return resultat.split(/\r?\n/u).filter((ligne) => ligne.startsWith("!! ")).map((ligne) => ligne.slice(3)).sort();
}

function tomlString(valeur) {
  return JSON.stringify(valeur.replaceAll("\\", "/"));
}

async function preparerConfigurationLocale() {
  const racineTemporaire = await mkdtemp(join(tmpdir(), "sigad-verify-"));
  const dossierAssets = join(racineTemporaire, "assets");
  const dossierEtat = join(racineTemporaire, "state");
  const fichierConfiguration = join(racineTemporaire, "wrangler.verify.local.toml");
  await Promise.all([mkdir(dossierAssets, { recursive: true }), mkdir(dossierEtat, { recursive: true })]);

  const configurationCourriel = await readFile(join(racine, "tests/fixtures/email-provider/wrangler.toml"), "utf8");
  const nomMock = /^\s*name\s*=\s*"([^"]+)"\s*$/mu.exec(configurationCourriel)?.[1];
  if (nomMock !== "sigad-email-mock") throw new Error("Le Worker de courriel local ne porte pas le nom attendu par la configuration d’intégration.");

  const contenu = [
    'name = "sigad-verify-local"',
    `main = ${tomlString(join(racine, "backend/src/index.ts"))}`,
    'compatibility_date = "2026-10-22"',
    'compatibility_flags = ["nodejs_compat"]',
    "",
    "[vars]",
    'ENVIRONMENT = "staging"',
    'EMAIL_DELIVERY_ENABLED = "true"',
    "",
    "[[d1_databases]]",
    'binding = "DB"',
    'database_name = "sigad-verify-local"',
    'database_id = "00000000-0000-4000-8000-000000000001"',
    `migrations_dir = ${tomlString(join(racine, "migrations"))}`,
    "",
    "[[r2_buckets]]",
    'binding = "BUCKET"',
    'bucket_name = "sigad-verify-local"',
    'preview_bucket_name = "sigad-verify-local-preview"',
    "",
    "[[services]]",
    'binding = "SIGAD_EMAIL_PROVIDER"',
    `service = ${tomlString(nomMock)}`,
    "",
    "[assets]",
    `directory = ${tomlString(dossierAssets)}`,
    'binding = "ASSETS"',
    'not_found_handling = "single-page-application"',
    'run_worker_first = ["/api/*"]',
    "",
  ].join("\n");
  if (/^\s*(?:account_id|zone_id|routes|remote)\s*=/imu.test(contenu)) {
    throw new Error("La configuration locale ne doit déclarer aucun compte, route ou binding distant.");
  }
  await writeFile(fichierConfiguration, contenu, { encoding: "utf8", flag: "wx" });

  const environnementIntegration = {
    ...environnementEnfant,
    SIGAD_VERIFY_TEMP_ROOT: racineTemporaire,
    SIGAD_WRANGLER_CONFIG: fichierConfiguration,
    SIGAD_TEST_TEMP_ROOT: racineTemporaire,
    SIGAD_TEST_STATE_ROOT: dossierEtat,
    SIGAD_EMAIL_DELIVERY_ENABLED: "true",
  };
  return { racineTemporaire, fichierConfiguration, environnementIntegration };
}

function comparerInstantanes(avant, apres) {
  const chemins = new Set([...avant.keys(), ...apres.keys()]);
  const differences = [];
  for (const chemin of chemins) {
    if (avant.get(chemin) !== apres.get(chemin)) differences.push(chemin);
  }
  return differences.sort();
}

const debutGlobal = new Date();
const etiquetteHorodatage = debutGlobal.toISOString().replaceAll(":", "").replaceAll("-", "").replaceAll(".", "");
const fichierPreuve = join(racine, "docs/architecture-modernization/evidence", `verify-${etiquetteHorodatage}.txt`);
const branche = execFileSync("git", ["branch", "--show-current"], { cwd: racine, encoding: "utf8" }).trim();
const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: racine, encoding: "utf8" }).trim();
const instantaneAvant = await prendreInstantaneProjet();
const inventaireIgnoreAvant = lireInventaireIgnore();
let racineTemporaire = null;
const resultats = [];

const commandes = integrationSeulement
  ? [{ nom: "Intégration Wrangler locale", arguments: [join(racine, "tests/integration/run-auth-worker.mjs")], integration: true }]
  : [
    ...(!options.has("--integration-only") ? [
      { nom: "TypeScript sans génération", arguments: [join(racine, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "tsconfig.json"] },
      { nom: "Tests unitaires", arguments: [join(racine, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.ts", "--pool=threads", "--maxWorkers=1", "--reporter=dot"] },
      { nom: "Matrice des permissions en mode contrôle", arguments: [join(racine, "scripts/generer-matrice-securite-phase9.mjs"), "--check"] },
      { nom: "Schéma et migrations en mémoire", arguments: ["--experimental-sqlite", join(racine, "scripts/verifier-schema-local.mjs")] },
      { nom: "Migration 0022 en mémoire", arguments: ["--experimental-sqlite", join(racine, "scripts/verifier-migration-0022.mjs")] },
    ] : []),
    ...(lancerIntegration ? [{ nom: "Intégration Wrangler locale", arguments: [join(racine, "tests/integration/run-auth-worker.mjs")], integration: true }] : []),
  ];

const details = [];
if (commandes.some((commande) => commande.integration)) {
  const configuration = await preparerConfigurationLocale();
  racineTemporaire = configuration.racineTemporaire;
  for (const commande of commandes) {
    if (commande.integration) commande.environnement = configuration.environnementIntegration;
  }
}

for (const commande of commandes) {
  const debut = new Date();
  const argumentsComplets = commande.arguments;
  const environnement = commande.environnement ?? environnementEnfant;
  console.log(`\n[VERIFY] DÉBUT ${commande.nom} — ${formaterDate(debut)}`);
  const resultat = await executerCommande(argumentsComplets, environnement);
  const fin = new Date();
  const code = resultat.code ?? 1;
  const sortie = nettoyerSortie(resultat.sortie);
  if (sortie) process.stdout.write(sortie.endsWith("\n") ? sortie : `${sortie}\n`);
  const nomCommande = citerCommande(process.execPath, argumentsComplets);
  const erreur = resultat.erreurDemarrage ? nettoyerSortie(resultat.erreurDemarrage.message) : null;
  console.log(`[VERIFY] FIN ${commande.nom} — ${formaterDate(fin)} — exit=${code}${resultat.signal ? ` — signal=${resultat.signal}` : ""}`);
  resultats.push({ nom: commande.nom, commande: nomCommande, debut, fin, code, signal: resultat.signal, sortie, erreur });
}

const instantaneApres = await prendreInstantaneProjet();
const fichiersModifiesParVerification = comparerInstantanes(instantaneAvant, instantaneApres);
const inventaireIgnoreApres = lireInventaireIgnore();
const ignoresAjoutes = inventaireIgnoreApres.filter((chemin) => !inventaireIgnoreAvant.includes(chemin));
const ignoresDisparus = inventaireIgnoreAvant.filter((chemin) => !inventaireIgnoreApres.includes(chemin));
const controleFichiers = {
  nom: "عدم تعديل ملفات المشروع بواسطة الفحوص",
  commande: "SHA-256 snapshot of tracked/non-ignored project files; compare ignored-root inventory",
  debut: new Date(),
  fin: new Date(),
  code: fichiersModifiesParVerification.length === 0 && ignoresAjoutes.length === 0 && ignoresDisparus.length === 0 ? 0 : 1,
  signal: null,
  sortie: [
    `Tracked/non-ignored files changed: ${fichiersModifiesParVerification.length}`,
    ...fichiersModifiesParVerification,
    `Ignored root entries added: ${ignoresAjoutes.length}`,
    ...ignoresAjoutes,
    `Ignored root entries disappeared: ${ignoresDisparus.length}`,
    ...ignoresDisparus,
  ].join("\n"),
  erreur: null,
};
resultats.push(controleFichiers);
console.log(`\n[VERIFY] ${nettoyerSortie(controleFichiers.sortie)}`);

const finGlobal = new Date();
const echecs = resultats.filter((resultat) => resultat.code !== 0);
const statut = echecs.length === 0 ? "PASS" : "FAIL";
const mode = integrationSeulement ? "integration-only" : options.has("--rapide") ? "rapide (sans intégration)" : "complet";
const lignes = [
  "SIGAD — preuve d’exécution du pipeline verify",
  `Statut global: ${statut}`,
  `Mode: ${mode}`,
  `Début: ${formaterDate(debutGlobal)}`,
  `Fin: ${formaterDate(finGlobal)}`,
  `Durée totale: ${((finGlobal.getTime() - debutGlobal.getTime()) / 1000).toFixed(1)} s`,
  `Branche: ${branche}`,
  `Révision: ${revision}`,
  `Node: ${process.version}`,
  `Configuration Wrangler temporaire: ${racineTemporaire ?? "non utilisée"}`,
  "Isolation: configuration écrite dans le répertoire temporaire; identifiant D1 fictif; D1/R2/service Wrangler en mode --local avec --persist-to temporaire; aucun account_id/zone_id/route/binding distant; variables Cloudflare/API/proxy/secrets retirées des environnements enfants.",
  "Le libellé ENVIRONMENT=staging est conservé uniquement pour caractériser le comportement local; aucune ressource Staging ou Production n’est ciblée.",
  "wrangler.toml et worker-configuration.d.ts sont vérifiés par empreinte; Wrangler ne charge pas wrangler.toml et aucune commande ne génère ces fichiers.",
  "D-10 reste ouvert; ce pipeline n’altère pas la configuration Production suivie par Git.",
  "",
];
for (const resultat of resultats) {
  lignes.push(
    `## ${resultat.nom}`,
    `Commande: ${resultat.commande}`,
    `Début: ${formaterDate(resultat.debut)}`,
    `Fin: ${formaterDate(resultat.fin)}`,
    `Durée: ${((resultat.fin.getTime() - resultat.debut.getTime()) / 1000).toFixed(1)} s`,
    `Code de sortie: ${resultat.code}${resultat.signal ? ` (signal ${resultat.signal})` : ""}`,
  );
  if (resultat.erreur) lignes.push(`Erreur de démarrage: ${resultat.erreur}`);
  lignes.push("Sortie:", nettoyerSortie(resultat.sortie) || "(aucune)", "");
}
if (echecs.length) lignes.push(`Échecs: ${echecs.map((resultat) => resultat.nom).join(", ")}`);

await mkdir(join(racine, "docs/architecture-modernization/evidence"), { recursive: true });
await writeFile(fichierPreuve, `${lignes.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
console.log(`\n[VERIFY] Evidence: ${relative(racine, fichierPreuve).replaceAll("\\", "/")}`);
if (echecs.length) process.exitCode = 1;
