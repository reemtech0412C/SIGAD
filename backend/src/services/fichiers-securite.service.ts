export type TypeMimeDocument = "application/pdf" | "image/jpeg" | "image/png";

export const TAILLE_MAXIMALE_CORPS_DOCUMENT = 10 * 1024 * 1024 + 128 * 1024;

export class CorpsDocumentTropVolumineux extends Error {
  constructor() {
    super("Le corps du document dépasse la taille maximale autorisée.");
    this.name = "CorpsDocumentTropVolumineux";
  }
}

export function typeErreurSecurise(erreur: unknown): string {
  if (!(erreur instanceof Error)) return "ErreurNonIdentifiee";
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/u.test(erreur.name) ? erreur.name : "Erreur";
}

function commencePar(octets: Uint8Array, signature: readonly number[]): boolean {
  return octets.length >= signature.length && signature.every((octet, index) => octets[index] === octet);
}

export function detecterTypeMimeDocument(octets: Uint8Array): TypeMimeDocument | null {
  if (octets.length >= 5 && String.fromCharCode(...octets.subarray(0, 5)) === "%PDF-") return "application/pdf";
  if (commencePar(octets, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

export async function lireFormulaireMultipartBorne(requete: Request): Promise<FormData> {
  const longueurEntete = requete.headers.get("Content-Length");
  if (longueurEntete !== null) {
    if (!/^\d+$/u.test(longueurEntete)) throw new TypeError("La longueur du formulaire est invalide.");
    const longueur = Number(longueurEntete);
    if (!Number.isSafeInteger(longueur)) throw new TypeError("La longueur du formulaire est invalide.");
    if (longueur > TAILLE_MAXIMALE_CORPS_DOCUMENT) throw new CorpsDocumentTropVolumineux();
  }

  if (!requete.body) throw new TypeError("Le formulaire du document est vide.");
  const lecteur = requete.body.getReader();
  const fragments: Uint8Array[] = [];
  let longueurTotale = 0;
  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      longueurTotale += value.byteLength;
      if (longueurTotale > TAILLE_MAXIMALE_CORPS_DOCUMENT) {
        await lecteur.cancel().catch(() => undefined);
        throw new CorpsDocumentTropVolumineux();
      }
      fragments.push(value);
    }
  } finally {
    lecteur.releaseLock();
  }

  const corps = new Uint8Array(longueurTotale);
  let decalage = 0;
  for (const fragment of fragments) {
    corps.set(fragment, decalage);
    decalage += fragment.byteLength;
  }

  const entetes = new Headers(requete.headers);
  entetes.delete("Content-Length");
  entetes.delete("Transfer-Encoding");
  const requeteBorne = new Request(requete.url, {
    method: requete.method,
    headers: entetes,
    body: corps,
  });
  return requeteBorne.formData();
}
