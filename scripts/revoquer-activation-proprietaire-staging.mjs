import { webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chargerClePriveeOperateur } from "./coffre-recuperation-dpapi.mjs";

const URL_STAGING = "https://sigad-staging.reemtech0412.workers.dev";
const IDENTIFIANT_PREUVE = "SIGAD-RECUPERATION-PROPRIETAIRE";
const AUDIENCE_PREUVE = "sigad-staging-owner-recovery";
const SUJET_PREUVE = "usr-proprietaire";
const KID_PREUVE = "sigad-staging-recovery-v1";
const OPERATION = "REVOQUER_ACTIVATION_INITIALE";
const encodeur = new TextEncoder();

function encoderBase64Url(valeur) {
  return Buffer.from(valeur).toString("base64url");
}

export function lireMotif(argumentsCli) {
  if (argumentsCli.length !== 4 || argumentsCli[2] !== "--executer-staging" || !argumentsCli[3]?.startsWith("--motif=")) {
    throw new Error("Usage : node scripts/revoquer-activation-proprietaire-staging.mjs --executer-staging --motif=<justification>");
  }
  const motif = argumentsCli[3].slice("--motif=".length).trim();
  if (motif.length < 10 || motif.length > 300) throw new Error("Le motif doit comporter de 10 à 300 caractères.");
  return motif;
}

export async function creerPreuveRevoquer(motif, clePriveeJwk, identiteOperateur, maintenantMs = Date.now()) {
  if (motif.trim().length < 10 || motif.trim().length > 300) throw new Error("Le motif de révocation est invalide.");
  if (!/^[^\\/\s]+\\[^\\/\s]+$/u.test(identiteOperateur.trim())) throw new Error("L’identité Windows de l’opérateur est invalide.");
  const clePrivee = await webcrypto.subtle.importKey(
    "jwk",
    clePriveeJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const maintenant = Math.floor(maintenantMs / 1000);
  const empreinteMotif = await webcrypto.subtle.digest("SHA-256", encodeur.encode(motif.trim()));
  const entete = { alg: "ES256", typ: "JWT", kid: KID_PREUVE };
  const charge = {
    iss: IDENTIFIANT_PREUVE,
    aud: AUDIENCE_PREUVE,
    sub: SUJET_PREUVE,
    operateur: identiteOperateur.trim().toLowerCase(),
    operation: OPERATION,
    jti: encoderBase64Url(webcrypto.getRandomValues(new Uint8Array(32))),
    motif_sha256: encoderBase64Url(empreinteMotif),
    iat: maintenant,
    exp: maintenant + 300,
  };
  const contenu = `${encoderBase64Url(JSON.stringify(entete))}.${encoderBase64Url(JSON.stringify(charge))}`;
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    clePrivee,
    encodeur.encode(contenu),
  );
  return `${contenu}.${encoderBase64Url(signature)}`;
}

function extraireCookie(reponse, nom) {
  const cookie = reponse.headers.getSetCookie().find((valeur) => valeur.startsWith(`${nom}=`));
  return cookie?.split(";", 1)[0] ?? null;
}

export async function soumettreRequeteRevocation(motif, preuve, transport = fetch) {
  const controle = await transport(`${URL_STAGING}/api/sante`, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!controle.ok) throw new Error("Le contrôle HTTPS du Worker Staging a échoué; aucune demande de révocation n’a été envoyée.");

  const csrfResponse = await transport(`${URL_STAGING}/api/auth/csrf`, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!csrfResponse.ok) throw new Error("Le canal CSRF Staging est indisponible; aucune preuve n’a été envoyée.");
  const csrfCookie = extraireCookie(csrfResponse, "sigad_csrf");
  const csrfBody = await csrfResponse.json();
  const csrfToken = typeof csrfBody === "object" && csrfBody !== null ? Reflect.get(csrfBody, "jeton_csrf") : null;
  if (!csrfCookie || typeof csrfToken !== "string" || csrfToken.length < 32) {
    throw new Error("La réponse CSRF Staging est invalide; aucune preuve n’a été envoyée.");
  }

  const reponse = await transport(`${URL_STAGING}/api/auth/recuperation-proprietaire/revoquer`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      Cookie: csrfCookie,
      "X-CSRF-Token": csrfToken,
      "X-SIGAD-Preuve-Operateur": preuve,
    },
    body: JSON.stringify({ motif }),
  });
  if (!reponse.ok) {
    await reponse.body?.cancel();
    throw new Error(`Staging a refusé la révocation (HTTP ${reponse.status}); le corps de réponse n’a pas été journalisé.`);
  }
  const resultat = await reponse.json();
  if (typeof resultat !== "object" || resultat === null || Reflect.get(resultat, "revoquee") !== true) {
    throw new Error("Staging n’a pas confirmé la révocation; aucune réponse sensible n’a été journalisée.");
  }
}

async function main() {
  if (process.platform !== "win32") throw new Error("La révocation sécurisée exige le profil Windows ayant préparé le coffre opérateur.");
  const motif = lireMotif(process.argv);
  const clePriveeJwk = await chargerClePriveeOperateur();
  const identiteOperateur = execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  const preuve = await creerPreuveRevoquer(motif, clePriveeJwk, identiteOperateur);
  await soumettreRequeteRevocation(motif, preuve);
  console.log("REVOCATION_STAGING=PASS — activation initiale révoquée; aucune donnée sensible affichée.");
}

const scriptDirectementExecute = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (scriptDirectementExecute) {
  await main().catch((erreur) => {
    console.error(erreur instanceof Error ? erreur.message : "Échec sécurisé de la révocation Staging.");
    process.exitCode = 1;
  });
}
