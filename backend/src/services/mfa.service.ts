const ALPHABETE_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DUREE_PAS_TOTP_MS = 30_000;

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

export function encoderBase32(octets: Uint8Array): string {
  let resultat = "";
  let tampon = 0;
  let bits = 0;
  for (const octet of octets) {
    tampon = (tampon << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      resultat += ALPHABETE_BASE32[(tampon >>> bits) & 31] ?? "";
    }
  }
  if (bits > 0) resultat += ALPHABETE_BASE32[(tampon << (5 - bits)) & 31] ?? "";
  return resultat;
}

export function decoderBase32(valeur: string): Uint8Array {
  const nettoyee = valeur.toUpperCase().replace(/=+$/u, "");
  let tampon = 0;
  let bits = 0;
  const octets: number[] = [];
  for (const caractere of nettoyee) {
    const index = ALPHABETE_BASE32.indexOf(caractere);
    if (index < 0) throw new Error("Le secret TOTP est invalide.");
    tampon = (tampon << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      octets.push((tampon >>> bits) & 255);
    }
  }
  if (octets.length < 16) throw new Error("Le secret TOTP est trop court.");
  return Uint8Array.from(octets);
}

export function genererSecretTotp(): string {
  return encoderBase32(crypto.getRandomValues(new Uint8Array(20)));
}

export async function codeTotp(secretBase32: string, instantMs = Date.now()): Promise<{ code: string; compteur: number }> {
  const compteur = Math.floor(instantMs / DUREE_PAS_TOTP_MS);
  const message = new Uint8Array(8);
  const vue = new DataView(message.buffer);
  vue.setUint32(4, compteur, false);
  const secret = Uint8Array.from(decoderBase32(secretBase32));
  const cle = await crypto.subtle.importKey("raw", secret.buffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cle, message));
  const offset = (signature[signature.length - 1] ?? 0) & 15;
  const nombre = (((signature[offset] ?? 0) & 127) << 24) |
    (((signature[offset + 1] ?? 0) & 255) << 16) |
    (((signature[offset + 2] ?? 0) & 255) << 8) |
    ((signature[offset + 3] ?? 0) & 255);
  return { code: String(nombre % 1_000_000).padStart(6, "0"), compteur };
}

export async function verifierCodeTotp(
  secretBase32: string,
  code: string,
  instantMs = Date.now(),
): Promise<number | null> {
  if (!/^\d{6}$/u.test(code)) return null;
  const compteurActuel = Math.floor(instantMs / DUREE_PAS_TOTP_MS);
  for (const compteur of [compteurActuel - 1, compteurActuel, compteurActuel + 1]) {
    if (compteur < 0) continue;
    const resultat = await codeTotp(secretBase32, compteur * DUREE_PAS_TOTP_MS);
    if (resultat.code === code) return compteur;
  }
  return null;
}

async function cleChiffrement(secret: string): Promise<CryptoKey> {
  let octets: Uint8Array;
  try {
    octets = decoderBase64Url(secret);
  } catch {
    throw new Error("La clé de chiffrement MFA est invalide.");
  }
  if (octets.length !== 32) throw new Error("La clé de chiffrement MFA doit contenir 32 octets aléatoires encodés en Base64URL.");
  return crypto.subtle.importKey("raw", Uint8Array.from(octets).buffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function chiffrerSecretTotp(secretBase32: string, cleMfa: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await cleChiffrement(cleMfa);
  const chiffre = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: Uint8Array.from(iv).buffer },
    cle,
    new TextEncoder().encode(secretBase32).buffer,
  );
  return `v1.${encoderBase64Url(iv)}.${encoderBase64Url(new Uint8Array(chiffre))}`;
}

export async function dechiffrerSecretTotp(secretChiffre: string, cleMfa: string): Promise<string> {
  const [version, ivEncode, donneesEncode] = secretChiffre.split(".");
  if (version !== "v1" || !ivEncode || !donneesEncode) throw new Error("Le secret TOTP chiffré est invalide.");
  const cle = await cleChiffrement(cleMfa);
  const clair = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(decoderBase64Url(ivEncode)).buffer },
    cle,
    Uint8Array.from(decoderBase64Url(donneesEncode)).buffer,
  );
  const secret = new TextDecoder().decode(clair);
  decoderBase32(secret);
  return secret;
}

export function uriProvisionnementTotp(secret: string, identifiant: string): string {
  const libelle = encodeURIComponent(`SIGAD Tchad:${identifiant}`);
  const parametres = new URLSearchParams({ secret, issuer: "SIGAD Tchad", algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${libelle}?${parametres.toString()}`;
}

export function genererCodesRecuperation(nombre = 10): string[] {
  return Array.from({ length: nombre }, () => {
    const hex = [...crypto.getRandomValues(new Uint8Array(16))].map((octet) => octet.toString(16).padStart(2, "0")).join("").toUpperCase();
    return hex.match(/.{1,4}/gu)?.join("-") ?? hex;
  });
}

export function normaliserCodeRecuperation(code: string): string {
  return code.replaceAll("-", "").replaceAll(" ", "").toUpperCase();
}

export function creerCodeOperation(): string {
  return encoderBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}
