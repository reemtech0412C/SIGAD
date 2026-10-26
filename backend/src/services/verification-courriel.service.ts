export interface D1RequetesLimitees {
  prepare(sql: string): {
    bind(...valeurs: Array<string | number>): {
      run(): Promise<{ success: boolean }>;
      first<T>(): Promise<T | null>;
    };
  };
}

function decoderBase64Url(valeur: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(valeur)) throw new Error("SECRET_OTP_FORMAT_INVALIDE");
  const base64 = valeur.replaceAll("-", "+").replaceAll("_", "/");
  const binaire = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binaire, (caractere) => caractere.charCodeAt(0));
}

async function importerCleHmac(secret: string): Promise<CryptoKey> {
  const octets = decoderBase64Url(secret);
  if (octets.length < 32) throw new Error("SECRET_OTP_TROP_COURT");
  return crypto.subtle.importKey("raw", Uint8Array.from(octets).buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function encoderBase64Url(octets: Uint8Array): string {
  let binaire = "";
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function empreinteCodeVerification(secret: string, usage: string, cible: string, code: string): Promise<string> {
  const cle = await importerCleHmac(secret);
  const message = new TextEncoder().encode(`${usage}\u0000${cible}\u0000${code}`);
  return encoderBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", cle, message)));
}

export async function empreinteLimite(secret: string, portee: string, valeur: string): Promise<string> {
  const cle = await importerCleHmac(secret);
  return encoderBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${portee}\u0000${valeur}`))));
}

export function genererCodeSixChiffres(): string {
  const plage = 0x1_0000_0000;
  const plafond = Math.floor(plage / 1_000_000) * 1_000_000;
  const tableau = new Uint32Array(1);
  let valeur: number;
  do {
    crypto.getRandomValues(tableau);
    valeur = tableau[0] ?? plage;
  } while (valeur >= plafond);
  return String(valeur % 1_000_000).padStart(6, "0");
}

export async function verifierLimiteAction(
  db: D1RequetesLimitees,
  empreinte: string,
  maximum: number,
  dureeSecondes: number,
): Promise<boolean> {
  await db.prepare(
    `INSERT INTO limites_inscription_publique (empreinte_cle, compteur, fenetre_debut)
     VALUES (?, 1, datetime('now'))
     ON CONFLICT(empreinte_cle) DO UPDATE SET
       compteur = CASE
         WHEN datetime(limites_inscription_publique.fenetre_debut, '+' || ? || ' seconds') <= datetime('now') THEN 1
         ELSE limites_inscription_publique.compteur + 1
       END,
       fenetre_debut = CASE
         WHEN datetime(limites_inscription_publique.fenetre_debut, '+' || ? || ' seconds') <= datetime('now') THEN datetime('now')
         ELSE limites_inscription_publique.fenetre_debut
       END,
       modifie_le = datetime('now')`,
  ).bind(empreinte, dureeSecondes, dureeSecondes).run();
  const compteur = await db.prepare(
    "SELECT compteur FROM limites_inscription_publique WHERE empreinte_cle = ?",
  ).bind(empreinte).first<{ compteur: number }>();
  return Boolean(compteur && compteur.compteur <= maximum);
}

