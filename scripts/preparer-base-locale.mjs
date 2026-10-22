import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
if (action !== "migrate" && action !== "seed") {
  throw new Error("Précisez migrate pour appliquer les migrations locales, ou seed pour réinitialiser les comptes locaux.");
}

const dossierTemporaire = await mkdtemp(resolve(tmpdir(), "sigad-preparation-base-locale-"));
const racineTemporaire = resolve(dossierTemporaire);
const racineTmp = resolve(tmpdir());
if (!racineTemporaire.startsWith(`${racineTmp}${sep}`) || !racineTemporaire.slice(racineTmp.length + 1).startsWith("sigad-preparation-base-locale-")) {
  throw new Error("Le dossier des fichiers privés de seed est hors du répertoire temporaire attendu.");
}

const executableWrangler = resolve(racine, "node_modules/wrangler/bin/wrangler.js");
const fichierSeed = resolve(dossierTemporaire, "seed-initial.sql");
const fichierCodes = process.env.SIGAD_ACTIVATION_CODES_PATH
  ? resolve(process.env.SIGAD_ACTIVATION_CODES_PATH)
  : resolve(racineTmp, `sigad-codes-activation-${crypto.randomUUID()}.json`);
const dossierPersistance = process.env.SIGAD_D1_PERSIST_DIR ? resolve(process.env.SIGAD_D1_PERSIST_DIR) : null;
const racinePersistanceAutorisee = resolve(racine, ".wrangler");
if (dossierPersistance && !dossierPersistance.startsWith(`${racinePersistanceAutorisee}${sep}`)) {
  throw new Error("La persistance D1 de vérification doit rester dans .wrangler et demeurer locale.");
}
const dossierConfiguration = resolve(dossierTemporaire, "appdata");
const environnement = {
  ...process.env,
  APPDATA: dossierConfiguration,
  LOCALAPPDATA: resolve(dossierConfiguration, "local"),
  XDG_CONFIG_HOME: resolve(dossierConfiguration, "xdg"),
};

function executerNode(argumentsNode) {
  execFileSync(process.execPath, argumentsNode, {
    cwd: racine,
    env: environnement,
    stdio: "inherit",
    windowsHide: true,
  });
}

function argumentsBaseLocale() {
  return ["--local", ...(dossierPersistance ? ["--persist-to", dossierPersistance] : [])];
}

try {
  executerNode([
    resolve(racine, "scripts/generer-seed-initial.mjs"),
    "--mode=development",
    `--fichier-codes=${fichierCodes}`,
    `--fichier-seed=${fichierSeed}`,
  ]);
  if (action === "migrate") {
    executerNode([executableWrangler, "d1", "migrations", "apply", "DB", ...argumentsBaseLocale()]);
  }
  executerNode([executableWrangler, "d1", "execute", "DB", ...argumentsBaseLocale(), "--file", fichierSeed]);
  console.log("PASS — Base D1 locale préparée sans modifier les fichiers de migration.");
  console.log(`Codes d’activation conservés hors du dépôt : ${fichierCodes}`);
} finally {
  await rm(racineTemporaire, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
