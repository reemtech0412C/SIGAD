import { webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chargerClePriveeOperateur, scellerJetonActivation } from "./coffre-recuperation-dpapi.mjs";

const URL_STAGING = "https://sigad-staging.reemtech0412.workers.dev";
const IDENTIFIANT_PREUVE = "SIGAD-RECUPERATION-PROPRIETAIRE";
const AUDIENCE_PREUVE = "sigad-staging-owner-recovery";
const SUJET_PREUVE = "usr-proprietaire";
const KID_PREUVE = "sigad-staging-recovery-v1";
const OPERATION = "EMETTRE_ACTIVATION_INITIALE";

function base64Url(valeur) {
  return Buffer.from(valeur).toString("base64url");
}

function lireMotif(argumentsCli) {
  if (argumentsCli.length !== 4 || argumentsCli[2] !== "--executer-staging" || !argumentsCli[3]?.startsWith("--motif=")) {
    throw new Error("Usage : node scripts/emettre-activation-proprietaire-staging.mjs --executer-staging --motif=<justification>");
  }
  const motif = argumentsCli[3].slice("--motif=".length).trim();
  if (motif.length < 10 || motif.length > 300) throw new Error("Le motif doit comporter de 10 à 300 caractères.");
  return motif;
}

async function creerPreuve(motif) {
  const clePriveeJwk = await chargerClePriveeOperateur();
  const clePrivee = await webcrypto.subtle.importKey(
    "jwk",
    clePriveeJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const maintenant = Math.floor(Date.now() / 1000);
  const motifHash = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(motif));
  const entete = { alg: "ES256", typ: "JWT", kid: KID_PREUVE };
  const charge = {
    iss: IDENTIFIANT_PREUVE,
    aud: AUDIENCE_PREUVE,
    sub: SUJET_PREUVE,
    operateur: execFileSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"],
      { encoding: "utf8", windowsHide: true },
    ).trim().toLowerCase(),
    operation: OPERATION,
    jti: base64Url(webcrypto.getRandomValues(new Uint8Array(32))),
    motif_sha256: base64Url(motifHash),
    iat: maintenant,
    exp: maintenant + 300,
  };
  const contenu = `${base64Url(JSON.stringify(entete))}.${base64Url(JSON.stringify(charge))}`;
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    clePrivee,
    new TextEncoder().encode(contenu),
  );
  return `${contenu}.${base64Url(signature)}`;
}

function extraireCookie(reponse, nom) {
  const cookie = reponse.headers.getSetCookie().find((valeur) => valeur.startsWith(`${nom}=`));
  return cookie?.split(";", 1)[0] ?? null;
}

async function main() {
  if (process.platform !== "win32") throw new Error("L’émission sécurisée exige le profil Windows ayant préparé le coffre opérateur.");
  const motif = lireMotif(process.argv);
  const controle = await fetch(`${URL_STAGING}/api/sante`, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!controle.ok) throw new Error("Le contrôle HTTPS du Worker Staging a échoué; aucune demande d’émission n’a été envoyée.");

  const csrfResponse = await fetch(`${URL_STAGING}/api/auth/csrf`, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!csrfResponse.ok) throw new Error("Le canal CSRF Staging est indisponible; aucune preuve n’a été envoyée.");
  const csrfCookie = extraireCookie(csrfResponse, "sigad_csrf");
  const csrfBody = await csrfResponse.json();
  const csrfToken = typeof csrfBody === "object" && csrfBody !== null ? Reflect.get(csrfBody, "jeton_csrf") : null;
  if (!csrfCookie || typeof csrfToken !== "string" || csrfToken.length < 32) {
    throw new Error("La réponse CSRF Staging est invalide; aucune preuve n’a été envoyée.");
  }

  const preuve = await creerPreuve(motif);
  const emission = await fetch(`${URL_STAGING}/api/auth/recuperation-proprietaire`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      "Cookie": csrfCookie,
      "X-CSRF-Token": csrfToken,
      "X-SIGAD-Preuve-Operateur": preuve,
    },
    body: JSON.stringify({ motif }),
  });
  if (emission.status !== 201) {
    const reference = emission.headers.get("X-Correlation-ID");
    await emission.body?.cancel();
    const referenceSecurisee = reference && /^[0-9a-f-]{36}$/iu.test(reference) ? `; référence ${reference}` : "";
    throw new Error(`Staging a refusé l’émission (HTTP ${emission.status})${referenceSecurisee}; le corps de réponse n’a pas été journalisé.`);
  }

  const resultat = await emission.json();
  const code = typeof resultat === "object" && resultat !== null ? Reflect.get(resultat, "code_activation") : null;
  const expiration = typeof resultat === "object" && resultat !== null ? Reflect.get(resultat, "expire_le") : null;
  if (typeof code !== "string" || typeof expiration !== "string") {
    throw new Error("Staging a répondu sans résultat d’activation valide; aucune valeur n’a été affichée.");
  }
  const cheminCoffre = await scellerJetonActivation(code, expiration);
  console.log(`Activation reçue par HTTPS et protégée par DPAPI CurrentUser. Coffre local : ${cheminCoffre}`);
}

await main().catch((erreur) => {
  console.error(erreur instanceof Error ? erreur.message : "Échec sécurisé de l’opération Staging.");
  process.exitCode = 1;
});
