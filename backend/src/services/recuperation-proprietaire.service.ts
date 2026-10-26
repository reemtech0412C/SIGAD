import { hacherJeton, genererJetonAleatoire } from "./cryptographie.service";

const IDENTIFIANT_COMPTE_CIBLE = "usr-proprietaire";
const IDENTIFIANT_PREUVE = "SIGAD-RECUPERATION-PROPRIETAIRE";
const AUDIENCE_PREUVE = "sigad-staging-owner-recovery";
const KID_PREUVE = "sigad-staging-recovery-v1";
const DUREE_PREUVE_MAXIMALE_SECONDES = 300;
const DUREE_ACTIVATION_MINUTES = 15;

interface EntetePreuve {
  alg: string;
  typ: string;
  kid: string;
}

interface ChargePreuve {
  iss: string;
  aud: string;
  sub: string;
  operateur: string;
  operation: OperationPreuveOperateur;
  jti: string;
  motif_sha256: string;
  iat: number;
  exp: number;
}

export type OperationPreuveOperateur = "EMETTRE_ACTIVATION_INITIALE" | "REVOQUER_ACTIVATION_INITIALE";

export interface PreuveOperateurValidee {
  identite: string;
  empreinteNonce: string;
  expireLe: string;
}

function encoderBase64Url(octets: Uint8Array): string {
  let binaire = "";
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decoderBase64Url(valeur: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(valeur)) throw new Error("Preuve invalide.");
  const base64 = valeur.replaceAll("-", "+").replaceAll("_", "/");
  const binaire = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const resultat = new Uint8Array(binaire.length);
  for (let index = 0; index < binaire.length; index += 1) resultat[index] = binaire.charCodeAt(index);
  if (encoderBase64Url(resultat) !== valeur) throw new Error("Preuve invalide.");
  return resultat;
}

function objetJson(valeur: string): Record<string, unknown> {
  const resultat: unknown = JSON.parse(new TextDecoder().decode(decoderBase64Url(valeur)));
  if (typeof resultat !== "object" || resultat === null || Array.isArray(resultat)) throw new Error("Preuve invalide.");
  return resultat as Record<string, unknown>;
}

function estEntetePreuve(valeur: Record<string, unknown>): valeur is Record<string, unknown> & EntetePreuve {
  return valeur.alg === "ES256" && valeur.typ === "JWT" && valeur.kid === KID_PREUVE;
}

function estChargePreuve(valeur: Record<string, unknown>): valeur is Record<string, unknown> & ChargePreuve {
  return typeof valeur.iss === "string"
    && typeof valeur.aud === "string"
    && typeof valeur.sub === "string"
    && typeof valeur.operateur === "string"
    && typeof valeur.operation === "string"
    && typeof valeur.jti === "string"
    && typeof valeur.motif_sha256 === "string"
    && typeof valeur.iat === "number"
    && Number.isSafeInteger(valeur.iat)
    && typeof valeur.exp === "number"
    && Number.isSafeInteger(valeur.exp);
}

async function empreinteTexte(valeur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valeur));
  return encoderBase64Url(new Uint8Array(empreinte));
}

function dateSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function lireClePublique(base64Url: string): JsonWebKey {
  const valeur = new TextDecoder().decode(decoderBase64Url(base64Url));
  const resultat: unknown = JSON.parse(valeur);
  if (typeof resultat !== "object" || resultat === null || Array.isArray(resultat)) throw new Error("Clé publique invalide.");
  const cle = resultat as JsonWebKey;
  if (cle.kty !== "EC" || cle.crv !== "P-256" || typeof cle.x !== "string" || typeof cle.y !== "string" || cle.d !== undefined) {
    throw new Error("Clé publique invalide.");
  }
  return cle;
}

export async function verifierPreuveOperateur(
  jeton: string,
  identiteAutorisee: string,
  clePubliqueBase64Url: string,
  operationAttendue: OperationPreuveOperateur,
  motif: string,
  maintenantMs = Date.now(),
): Promise<PreuveOperateurValidee> {
  if (jeton.length > 4096 || motif.length < 10 || motif.length > 300) throw new Error("Preuve invalide.");
  const segments = jeton.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) throw new Error("Preuve invalide.");

  const entete = objetJson(segments[0] ?? "");
  const charge = objetJson(segments[1] ?? "");
  if (!estEntetePreuve(entete) || !estChargePreuve(charge)) throw new Error("Preuve invalide.");
  const now = Math.floor(maintenantMs / 1000);
  if (charge.iss !== IDENTIFIANT_PREUVE
    || charge.aud !== AUDIENCE_PREUVE
    || charge.sub !== IDENTIFIANT_COMPTE_CIBLE
    || charge.operation !== operationAttendue
    || charge.operateur !== identiteAutorisee.trim().toLowerCase()
    || !/^[A-Za-z0-9_-]{43}$/u.test(charge.jti)
    || charge.iat > now + 30
    || charge.iat < now - DUREE_PREUVE_MAXIMALE_SECONDES
    || charge.exp <= now
    || charge.exp <= charge.iat
    || charge.exp - charge.iat > DUREE_PREUVE_MAXIMALE_SECONDES
    || charge.motif_sha256 !== await empreinteTexte(motif.trim())) {
    throw new Error("Preuve invalide.");
  }

  const clePublique = await crypto.subtle.importKey(
    "jwk",
    lireClePublique(clePubliqueBase64Url),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const message = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
  const signatureValide = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    clePublique,
    decoderBase64Url(segments[2] ?? ""),
    message,
  );
  if (!signatureValide) throw new Error("Preuve invalide.");

  const expiration = new Date(charge.exp * 1000);
  return {
    identite: charge.operateur,
    empreinteNonce: await hacherJeton(charge.jti),
    expireLe: dateSqlite(expiration),
  };
}

export function creerJetonActivationProprietaire(): string {
  return genererJetonAleatoire(32);
}

export function expirationJetonActivationProprietaire(maintenant = new Date()): string {
  return dateSqlite(new Date(maintenant.getTime() + DUREE_ACTIVATION_MINUTES * 60_000));
}

export function expirationSessionActivation(maintenant = new Date()): string {
  return dateSqlite(new Date(maintenant.getTime() + DUREE_ACTIVATION_MINUTES * 60_000));
}

export function estEnvironnementAutoriseRecuperation(environnement: string, active: string | undefined): boolean {
  return environnement === "staging" && active === "true";
}
