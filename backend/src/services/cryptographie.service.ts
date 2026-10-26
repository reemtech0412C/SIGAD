import { pbkdf2, timingSafeEqual } from "node:crypto";

// Cloudflare Workers production rejects PBKDF2 requests above 100,000 iterations.
const COUT_PBKDF2 = 100_000;
const COUT_PBKDF2_MAXIMUM = 100_000;
const LONGUEUR_SEL_OCTETS = 16;
const LONGUEUR_DERIVEE_OCTETS = 32;

function encoderBase64Url(octets: Uint8Array): string {
  let binaire = "";
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decoderBase64Url(valeur: string): Uint8Array {
  const base64 = valeur.replaceAll("-", "+").replaceAll("_", "/");
  const binaire = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binaire, (caractere) => caractere.charCodeAt(0));
}

async function deriveurPbkdf2(motDePasse: string, sel: Uint8Array, iterations: number): Promise<Uint8Array> {
  const derivee = await new Promise<Buffer>((resoudre, rejeter) => {
    pbkdf2(
      motDePasse,
      Buffer.from(sel),
      iterations,
      LONGUEUR_DERIVEE_OCTETS,
      "sha256",
      (erreur, resultat) => {
        if (erreur) rejeter(erreur);
        else resoudre(resultat);
      },
    );
  });
  return new Uint8Array(derivee);
}

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(LONGUEUR_SEL_OCTETS));
  const derive = await deriveurPbkdf2(motDePasse, sel, COUT_PBKDF2);
  return `pbkdf2-sha256$${COUT_PBKDF2}$${encoderBase64Url(sel)}$${encoderBase64Url(derive)}`;
}

export async function verifierMotDePasse(motDePasse: string, empreinte: string): Promise<boolean> {
  const [algorithme, iterationsTexte, selEncode, deriveEncode] = empreinte.split("$");
  const iterations = Number(iterationsTexte);
  if (
    algorithme !== "pbkdf2-sha256" ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    iterations > COUT_PBKDF2_MAXIMUM ||
    !selEncode ||
    !deriveEncode
  ) {
    return false;
  }

  try {
    const sel = decoderBase64Url(selEncode);
    const attendu = decoderBase64Url(deriveEncode);
    if (sel.length !== LONGUEUR_SEL_OCTETS || attendu.length !== LONGUEUR_DERIVEE_OCTETS) return false;
    const fourni = await deriveurPbkdf2(motDePasse, sel, iterations);
    return timingSafeEqual(fourni, attendu);
  } catch {
    return false;
  }
}

export async function hacherJeton(jeton: string): Promise<string> {
  const empreinte = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return encoderBase64Url(new Uint8Array(empreinte));
}

export async function comparerSecrets(texteA: string, texteB: string): Promise<boolean> {
  const encodeur = new TextEncoder();
  const [empreinteA, empreinteB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encodeur.encode(texteA)),
    crypto.subtle.digest("SHA-256", encodeur.encode(texteB)),
  ]);
  return timingSafeEqual(new Uint8Array(empreinteA), new Uint8Array(empreinteB));
}

export function genererJetonAleatoire(nombreOctets = 32): string {
  return encoderBase64Url(crypto.getRandomValues(new Uint8Array(nombreOctets)));
}
