import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fichierSpecification = resolve(racine, "sigad_v3_0.md");
const iterationsPbkdf2 = 100_000;

function encoderBase64Url(octets) {
  return Buffer.from(octets).toString("base64url");
}

function citerSql(valeur) {
  return `'${String(valeur).replaceAll("'", "''")}'`;
}

async function hacherMotDePasse(motDePasse) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveBits"]);
  const derive = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sel, iterations: iterationsPbkdf2, hash: "SHA-256" },
    cle,
    256,
  );
  return `pbkdf2-sha256$${iterationsPbkdf2}$${encoderBase64Url(sel)}$${encoderBase64Url(new Uint8Array(derive))}`;
}

function extraireProvinces(document) {
  const debut = document.indexOf("## 🔐 4.");
  const fin = document.indexOf("## ⚙️ 5.", debut);
  if (debut < 0 || fin < 0) throw new Error("Le tableau initial des provinces est introuvable dans la spécification.");
  const section = document.slice(debut, fin);
  const provinces = [];
  for (const ligne of section.split(/\r?\n/u)) {
    const correspondance = ligne.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/u);
    if (!correspondance) continue;
    provinces.push({
      rang: Number(correspondance[1]),
      nom: correspondance[2].trim(),
      code: correspondance[3].trim(),
      identifiantCompte: correspondance[4].trim(),
      chefLieu: correspondance[5].trim(),
    });
  }
  if (provinces.length !== 23 || provinces.some((province, index) => province.rang !== index + 1)) {
    throw new Error("La spécification doit contenir exactement les 23 provinces dans l’ordre indiqué.");
  }
  return provinces;
}

function lireArguments(argumentsScript) {
  const argumentsLigne = new Map();
  for (const argument of argumentsScript) {
    const separateur = argument.indexOf("=");
    if (argument.startsWith("--") && separateur > 2) {
      argumentsLigne.set(argument.slice(2, separateur), argument.slice(separateur + 1));
    }
  }
  return argumentsLigne;
}

function creerListeUtilisateurs(provinces) {
  return [
    { id: "usr-proprietaire", identifiant: "proprietaire", nom: "Propriétaire du SIGAD", role: "PROPRIETAIRE", provinceId: null },
    { id: "usr-central", identifiant: "central", nom: "Administrateur central", role: "ADMIN_CENTRAL", provinceId: null },
    ...provinces.map((province) => ({
      id: `usr-${province.identifiantCompte}`,
      identifiant: province.identifiantCompte,
      nom: `Délégué provincial — ${province.nom}`,
      role: "DELEGUE_PROVINCIAL",
      provinceId: `prov-${province.identifiantCompte}`,
    })),
  ];
}

function creerCodeActivation(codesDejaUtilises) {
  let code = encoderBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  while (codesDejaUtilises.has(code)) code = encoderBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  codesDejaUtilises.add(code);
  return code;
}

function verifierDestinationPrivee(destination, libelle) {
  const cheminRelatif = relative(racine, destination);
  if (cheminRelatif === "" || (!cheminRelatif.startsWith(`..${sep}`) && cheminRelatif !== ".." && !isAbsolute(cheminRelatif))) {
    throw new Error(`Le fichier ${libelle} doit être placé en dehors du dépôt SIGAD.`);
  }
}

async function restreindreAcces(destination) {
  if (process.platform === "win32") {
    const identifiantSecurite = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"],
      { encoding: "utf8" },
    ).trim();
    execFileSync("icacls.exe", [destination, "/inheritance:r", "/grant:r", `*${identifiantSecurite}:(F)`], { stdio: "ignore" });
  } else {
    await chmod(destination, 0o600);
  }
}

async function construireSeed(mode, fichierCodes, fichierSeed) {
  const document = await readFile(fichierSpecification, "utf8");
  const provinces = extraireProvinces(document);
  const utilisateurs = creerListeUtilisateurs(provinces);
  const donneesActivation = [];
  const codesDejaUtilises = new Set();

  const provincesSql = provinces.map((province) => `(${[
    citerSql(`prov-${province.identifiantCompte}`),
    citerSql(province.code),
    citerSql(province.identifiantCompte),
    citerSql(province.nom),
    citerSql(province.chefLieu),
    province.nom === "N'Djamena" ? "1" : "0",
    "1",
  ].join(", ")})`).join(",\n");

  const utilisateursSql = [];
  for (const utilisateur of utilisateurs) {
    const secret = creerCodeActivation(codesDejaUtilises);
    const empreinte = await hacherMotDePasse(secret);
    donneesActivation.push({ identifiant: utilisateur.identifiant, code_activation: secret });
    utilisateursSql.push(`(${[
      citerSql(utilisateur.id),
      citerSql(utilisateur.identifiant),
      citerSql(utilisateur.nom),
      citerSql(utilisateur.role),
      utilisateur.provinceId === null ? "NULL" : citerSql(utilisateur.provinceId),
      citerSql(empreinte),
      citerSql(empreinte),
      "datetime('now', '+24 hours')",
      "1",
      "'ACTIF'",
    ].join(", ")})`);
  }

  const categoriesSql = [
    ["ALIMENTAIRE", "Aide alimentaire"],
    ["MENAGER", "Articles ménagers essentiels"],
    ["HYGIENE", "Hygiène et assainissement"],
    ["ABRI", "Abri et matériaux de construction"],
    ["AUTRE_NFI", "Autres articles non alimentaires"],
  ].map(([code, libelle]) => `(${citerSql(`cat-${code.toLowerCase()}`)}, ${citerSql(code)}, ${citerSql(libelle)})`).join(",\n");

  const unites = [
    ["KG", "Kilogramme", 3],
    ["LITRE", "Litre", 3],
    ["SAC", "Sac", 0],
    ["CARTON", "Carton", 0],
    ["PIECE", "Pièce", 0],
    ["KIT", "Kit", 0],
  ];
  const unitesSql = unites.map(([code, libelle, decimales]) =>
    `(${citerSql(`unit-${String(code).toLowerCase()}`)}, ${citerSql(code)}, ${citerSql(libelle)}, ${decimales})`,
  ).join(",\n");

  const contenu = `PRAGMA foreign_keys = ON;

INSERT INTO provinces (id, code, identifiant_compte, nom, chef_lieu, statut_particulier, actif)
VALUES
${provincesSql}
ON CONFLICT(id) DO NOTHING;

INSERT INTO utilisateurs
  (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, code_activation_hash, code_activation_expire_le, doit_changer_mot_de_passe, statut)
VALUES
${utilisateursSql.join(",\n")}
ON CONFLICT(id) DO UPDATE SET
  mot_de_passe_hash = excluded.mot_de_passe_hash,
  code_activation_hash = excluded.code_activation_hash,
  code_activation_expire_le = excluded.code_activation_expire_le,
  code_activation_recuperation_id = NULL,
  doit_changer_mot_de_passe = 1,
  statut = excluded.statut;

INSERT INTO categories_aide (id, code, libelle)
VALUES
${categoriesSql}
ON CONFLICT(id) DO NOTHING;

INSERT INTO unites_mesure (id, code, libelle, decimales_autorisees)
VALUES
${unitesSql}
ON CONFLICT(id) DO NOTHING;
`;

  const destinationCodes = fichierCodes ? resolve(fichierCodes) : resolve(tmpdir(), `sigad-codes-activation-${crypto.randomUUID()}.json`);
  const destinationSeed = fichierSeed ? resolve(fichierSeed) : resolve(tmpdir(), `sigad-seed-initial-${crypto.randomUUID()}.sql`);
  verifierDestinationPrivee(destinationCodes, "des codes d’activation");
  verifierDestinationPrivee(destinationSeed, "du seed SQL");
  await Promise.all([mkdir(dirname(destinationCodes), { recursive: true }), mkdir(dirname(destinationSeed), { recursive: true })]);
  let seedEcrit = false;
  let codesEcrits = false;
  try {
    await writeFile(destinationSeed, contenu, { encoding: "utf8", flag: "wx", mode: 0o600 });
    seedEcrit = true;
    await writeFile(destinationCodes, `${JSON.stringify(donneesActivation, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    codesEcrits = true;
    await Promise.all([restreindreAcces(destinationSeed), restreindreAcces(destinationCodes)]);
  } catch {
    await Promise.all([
      ...(seedEcrit ? [unlink(destinationSeed)] : []),
      ...(codesEcrits ? [unlink(destinationCodes)] : []),
    ]);
    throw new Error("La création sécurisée du seed ou des codes a échoué; les fichiers créés ont été supprimés.");
  }
  return { destinationCodes, destinationSeed };
}

const argumentsScript = lireArguments(process.argv.slice(2));
const mode = argumentsScript.get("mode");
const fichierCodes = argumentsScript.get("fichier-codes");
const fichierSeed = argumentsScript.get("fichier-seed");
if (!mode) throw new Error("Précisez explicitement --mode=development ou --mode=production.");
if (mode !== "development" && mode !== "production") throw new Error("Le mode doit être development ou production.");
if (mode === "production" && !fichierCodes) throw new Error("En mode production, fournissez --fichier-codes avec un chemin sécurisé hors du projet.");
if (mode === "production" && !fichierSeed) throw new Error("En mode production, fournissez --fichier-seed avec un chemin sécurisé hors du projet.");

const { destinationCodes, destinationSeed } = await construireSeed(mode, fichierCodes, fichierSeed);
console.log(`Seed initial sécurisé généré pour ${mode === "production" ? "la production" : "le développement local"}.`);
console.log(`Seed SQL conservé hors du dépôt : ${destinationSeed}`);
console.log(`Codes d’activation conservés hors du dépôt : ${destinationCodes}`);
