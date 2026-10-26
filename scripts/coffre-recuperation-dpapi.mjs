import { randomBytes, webcrypto } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const mode = process.argv[2];
const variableLocalAppData = process.env.LOCALAPPDATA;
const codeDpapi = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class SigadDpapi {
  [StructLayout(LayoutKind.Sequential)]
  private struct DataBlob { public int Length; public IntPtr Data; }
  [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern bool CryptProtectData(ref DataBlob input, string description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out DataBlob output);
  [DllImport("crypt32.dll", SetLastError = true)]
  private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out DataBlob output);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr memory);
  private static DataBlob Allocate(byte[] data) {
    var blob = new DataBlob { Length = data.Length, Data = Marshal.AllocHGlobal(data.Length) };
    Marshal.Copy(data, 0, blob.Data, data.Length);
    return blob;
  }
  private static byte[] Copy(DataBlob blob) {
    var result = new byte[blob.Length];
    Marshal.Copy(blob.Data, result, 0, blob.Length);
    return result;
  }
  public static byte[] Protect(byte[] data) {
    var input = Allocate(data);
    DataBlob output;
    try {
      if (!CryptProtectData(ref input, "SIGAD staging owner recovery", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out output))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      try { return Copy(output); } finally { LocalFree(output.Data); }
    } finally { Marshal.FreeHGlobal(input.Data); }
  }
  public static byte[] Unprotect(byte[] data) {
    var input = Allocate(data);
    DataBlob output;
    try {
      if (!CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out output))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      try { return Copy(output); } finally { LocalFree(output.Data); }
    } finally { Marshal.FreeHGlobal(input.Data); }
  }
}`;
const codeDpapiBase64 = Buffer.from(codeDpapi, "utf8").toString("base64");

function exigerWindows() {
  if (process.platform !== "win32" || !variableLocalAppData) {
    throw new Error("Le coffre de récupération exige Windows et un profil utilisateur local.");
  }
}

function racineCoffre() {
  exigerWindows();
  return join(variableLocalAppData, "SIGAD", "Staging", "recuperation-proprietaire");
}

function executerPowerShell(script, entree) {
  try {
    return execFileSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { input: entree, encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    ).trim();
  } catch {
    throw new Error("La protection DPAPI n’a pas pu être exécutée sous l’utilisateur Windows courant.");
  }
}

function encoderEntreeTexte(valeur) {
  return Buffer.from(valeur, "utf8").toString("base64");
}

function decoderSortieTexte(valeur) {
  return Buffer.from(valeur, "base64").toString("utf8");
}

function protegerDpapi(valeur) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$definition = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${codeDpapiBase64}'))`,
    "Add-Type -TypeDefinition $definition -ErrorAction Stop",
    "$b64 = [Console]::In.ReadToEnd().Trim()",
    "$octets = [Convert]::FromBase64String($b64)",
    "$chiffre = [Convert]::ToBase64String([SigadDpapi]::Protect($octets))",
    "[Console]::Out.Write($chiffre)",
    "[Array]::Clear($octets, 0, $octets.Length)",
    "$chiffre = $null; $b64 = $null",
  ].join("; ");
  const octets = Buffer.isBuffer(valeur) ? valeur : Buffer.from(valeur, "utf8");
  const chiffre = executerPowerShell(script, octets.toString("base64"));
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(chiffre)) throw new Error("DPAPI n’a pas retourné un blob protégé valide.");
  return chiffre;
}

function dechiffrerDpapi(chiffre) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$definition = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${codeDpapiBase64}'))`,
    "Add-Type -TypeDefinition $definition -ErrorAction Stop",
    "$chiffre = [Console]::In.ReadToEnd().Trim()",
    "$octets = [Convert]::FromBase64String($chiffre)",
    "$clair = [SigadDpapi]::Unprotect($octets)",
    "[Console]::Out.Write([Convert]::ToBase64String($clair))",
    "[Array]::Clear($octets, 0, $octets.Length); [Array]::Clear($clair, 0, $clair.Length)",
    "$chiffre = $null; $octets = $null; $clair = $null",
  ].join("; ");
  const resultat = executerPowerShell(script, chiffre);
  try {
    return decoderSortieTexte(resultat);
  } catch {
    throw new Error("Le coffre DPAPI ne peut pas être ouvert par l’utilisateur Windows courant.");
  }
}

function dechiffrerOctetsDpapi(chiffre) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$definition = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${codeDpapiBase64}'))`,
    "Add-Type -TypeDefinition $definition -ErrorAction Stop",
    "$chiffre = [Console]::In.ReadToEnd().Trim()",
    "$blob = [Convert]::FromBase64String($chiffre)",
    "$clair = [SigadDpapi]::Unprotect($blob)",
    "[Console]::Out.Write([Convert]::ToBase64String($clair))",
    "[Array]::Clear($blob, 0, $blob.Length); [Array]::Clear($clair, 0, $clair.Length)",
    "$chiffre = $null; $blob = $null; $clair = $null",
  ].join("; ");
  const clairBase64 = executerPowerShell(script, chiffre);
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(clairBase64)) {
    throw new Error("DPAPI n’a pas restitué un contenu binaire valide.");
  }
  return Buffer.from(clairBase64, "base64");
}

function verifierProtectionBinaireDpapi() {
  const cle = randomBytes(32);
  try {
    const blobProtege = protegerDpapi(cle);
    const retour = dechiffrerOctetsDpapi(blobProtege);
    if (!retour.equals(cle)) throw new Error("L’aller-retour DPAPI binaire ne correspond pas.");
    retour.fill(0);
  } finally {
    cle.fill(0);
  }
}

function lireIdentiteWindows() {
  return execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"],
    { encoding: "utf8", windowsHide: true },
  ).trim();
}

async function restreindreAcl(chemin, estDossier) {
  const sid = execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  if (!/^S-1-[0-9-]+$/u.test(sid)) throw new Error("Le SID de l’utilisateur Windows courant est invalide.");
  try {
    const indicateursHeritage = estDossier ? "(OI)(CI)" : "";
    execFileSync("icacls.exe", [chemin, "/inheritance:r", "/grant:r", `*${sid}:${indicateursHeritage}F`], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    throw new Error("Les permissions du coffre local ne peuvent pas être restreintes au profil Windows courant.");
  }
}

async function ecrireFichierProtege(nom, contenu) {
  const dossier = racineCoffre();
  const destination = join(dossier, nom);
  await writeFile(destination, `${JSON.stringify(contenu)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await restreindreAcl(dossier, true);
    await restreindreAcl(destination, false);
  } catch {
    throw new Error("Le coffre a été créé, mais son ACL n’a pas été confirmée; ne l’utilisez pas avant vérification manuelle.");
  }
  return destination;
}

function normaliserIdentiteWindows(identite) {
  return identite.trim().toLowerCase();
}

async function chargerClePriveeOperateur() {
  exigerWindows();
  const chemin = join(racineCoffre(), "operateur-prive.dpapi.json");
  const enregistrement = JSON.parse(await readFile(chemin, "utf8"));
  if (Reflect.get(enregistrement, "version") !== 1
    || Reflect.get(enregistrement, "portee") !== "sigad-staging-owner-recovery"
    || normaliserIdentiteWindows(String(Reflect.get(enregistrement, "identiteWindows") ?? "")) !== normaliserIdentiteWindows(lireIdentiteWindows())) {
    throw new Error("La clé opérateur n’appartient pas au profil Windows courant ou sa portée est invalide.");
  }
  const chiffre = Reflect.get(enregistrement, "contenuProtegeDpapi");
  if (typeof chiffre !== "string") throw new Error("La clé opérateur protégée est absente.");
  const texte = dechiffrerDpapi(chiffre);
  try {
    const cle = JSON.parse(texte);
    if (typeof cle !== "object" || cle === null || Reflect.get(cle, "kty") !== "EC"
      || Reflect.get(cle, "crv") !== "P-256" || typeof Reflect.get(cle, "d") !== "string") {
      throw new Error("La clé opérateur protégée est invalide.");
    }
    return cle;
  } catch {
    throw new Error("La clé opérateur protégée ne peut pas être vérifiée.");
  }
}

async function scellerJetonActivation(code, expiration) {
  exigerWindows();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(code) || typeof expiration !== "string" || !Number.isFinite(Date.parse(expiration.replace(" ", "T") + "Z"))) {
    throw new Error("La réponse d’activation ne contient pas un code et une expiration valides.");
  }
  const protege = protegerDpapi(JSON.stringify({ compte: "proprietaire", code_activation: code, expire_le: expiration }));
  const horodatage = new Date().toISOString().replace(/[-:.]/gu, "");
  const destination = await ecrireFichierProtege(`activation-proprietaire-${horodatage}.dpapi.json`, {
    version: 1,
    portee: "activation-initiale-proprietaire",
    contenuProtegeDpapi: protege,
  });
  return destination;
}

async function creerCoffreOperateur() {
  const dossier = racineCoffre();
  await mkdir(dirname(dossier), { recursive: true });
  await mkdir(dossier, { recursive: false });
  await restreindreAcl(dossier, true);
  const paire = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const clePrivee = JSON.stringify(await webcrypto.subtle.exportKey("jwk", paire.privateKey));
  const clePublique = await webcrypto.subtle.exportKey("jwk", paire.publicKey);
  const cheminPrive = await ecrireFichierProtege("operateur-prive.dpapi.json", {
    version: 1,
    portee: "sigad-staging-owner-recovery",
    identiteWindows: lireIdentiteWindows(),
    contenuProtegeDpapi: protegerDpapi(clePrivee),
  });
  const cheminPublic = await ecrireFichierProtege("operateur-public.json", {
    version: 1,
    portee: "sigad-staging-owner-recovery",
    identiteWindows: lireIdentiteWindows(),
    clePublique,
  });
  console.log(`Coffre opérateur préparé sous le profil Windows courant : ${cheminPrive}`);
  console.log(`Clé publique non secrète : ${cheminPublic}`);
}

async function scellerJetonDepuisEntree() {
  exigerWindows();
  let texte = await readFile(0, "utf8");
  let valeur;
  try {
    valeur = JSON.parse(texte);
  } catch {
    throw new Error("L’entrée doit être la réponse JSON de l’émission d’activation.");
  }
  texte = "";
  if (typeof valeur !== "object" || valeur === null) throw new Error("La réponse d’activation est invalide.");
  const code = Reflect.get(valeur, "code_activation");
  const expiration = Reflect.get(valeur, "expire_le");
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(code) || typeof expiration !== "string") {
    throw new Error("La réponse d’activation ne contient pas un code et une expiration valides.");
  }
  const destination = await scellerJetonActivation(code, expiration);
  console.log(`Le résultat d’activation a été protégé par DPAPI et conservé sous le profil Windows courant : ${destination}`);
}

async function revelerJetonLocalement() {
  const nom = (await readdir(racineCoffre()))
    .filter((fichier) => /^activation-proprietaire-[0-9TZ]+\.dpapi\.json$/u.test(fichier))
    .sort()
    .at(-1);
  if (!nom) throw new Error("Aucun coffre d’activation local n’est disponible.");
  const destination = join(racineCoffre(), nom);
  const enregistrement = JSON.parse(await readFile(destination, "utf8"));
  const chiffre = Reflect.get(enregistrement, "contenuProtegeDpapi");
  if (typeof chiffre !== "string") throw new Error("Le coffre d’activation est invalide.");
  const secret = JSON.parse(dechiffrerDpapi(chiffre));
  const code = Reflect.get(secret, "code_activation");
  const expiration = Reflect.get(secret, "expire_le");
  if (typeof code !== "string" || typeof expiration !== "string") throw new Error("Le coffre ne contient pas un code d’activation valide.");
  process.stdout.write(`${code}\nExpiration : ${expiration}\n`);
}

async function publierClePublique() {
  const cheminPublic = join(racineCoffre(), "operateur-public.json");
  const enregistrement = JSON.parse(await readFile(cheminPublic, "utf8"));
  const cle = Reflect.get(enregistrement, "clePublique");
  const identite = Reflect.get(enregistrement, "identiteWindows");
  if (typeof identite !== "string" || typeof cle !== "object" || cle === null) {
    throw new Error("La clé publique opérateur ne peut pas être lue depuis le coffre.");
  }
  const base64Url = Buffer.from(JSON.stringify(cle), "utf8").toString("base64url");
  process.stdout.write(`Identité opérateur : ${identite.trim().toLowerCase()}\nClé publique Base64URL : ${base64Url}\n`);
}

function verifierArguments() {
  if (process.argv.length !== 3) {
    throw new Error("Usage : node scripts/coffre-recuperation-dpapi.mjs verifier-dpapi | preparer-operateur | publier-cle-publique | sceller-jeton | reveler-jeton");
  }
}

export {
  chargerClePriveeOperateur,
  dechiffrerDpapi,
  dechiffrerOctetsDpapi,
  ecrireFichierProtege,
  protegerDpapi,
  racineCoffre,
  scellerJetonActivation,
};

const scriptDirectementExecute = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (scriptDirectementExecute) {
  verifierArguments();
  if (mode === "verifier-dpapi") {
    exigerWindows();
    const temoin = randomBytes(32).toString("base64url");
    const chiffre = protegerDpapi(temoin);
    const retour = dechiffrerDpapi(chiffre);
    if (retour !== temoin) throw new Error("L’aller-retour DPAPI ne correspond pas au témoin local.");
    verifierProtectionBinaireDpapi();
    console.log("PASS — DPAPI CurrentUser protège et restitue un témoin textuel et une clé binaire de 32 octets dans le processus local.");
  } else if (mode === "preparer-operateur") {
    exigerWindows();
    await creerCoffreOperateur();
  } else if (mode === "publier-cle-publique") {
    exigerWindows();
    await publierClePublique();
  } else if (mode === "sceller-jeton") {
    await scellerJetonDepuisEntree();
  } else if (mode === "reveler-jeton") {
    await revelerJetonLocalement();
  } else {
    throw new Error("Mode DPAPI inconnu.");
  }
}
