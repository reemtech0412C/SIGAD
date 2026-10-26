export interface ComparaisonDoublon {
  version: 1;
  criteres: Array<"TELEPHONE_IDENTIQUE" | "NOM_LOCALITE_IDENTIQUES">;
  localite_id: string | null;
}

export interface PreuveDoublonCalculee {
  empreintes: string[];
  comparaison: ComparaisonDoublon;
}

export type SignerPreuve = (domaine: string, contenu: string) => Promise<string>;

const ENCODEUR = new TextEncoder();
const SEL_HKDF = ENCODEUR.encode("SIGAD-DUPLICATE-REVIEW-V1");
const CONTEXTE_HKDF = ENCODEUR.encode("preuve-doublon-hmac-sha256");

function hexadecimal(octets: Uint8Array): string {
  return Array.from(octets, (octet) => octet.toString(16).padStart(2, "0")).join("");
}

export async function creerSignatairePreuve(secret: string): Promise<SignerPreuve> {
  if (secret.length < 32) throw new Error("La clé de protection des empreintes de revue est indisponible ou trop courte.");
  const materiau = await crypto.subtle.importKey(
    "raw",
    ENCODEUR.encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const cle = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SEL_HKDF, info: CONTEXTE_HKDF },
    materiau,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return async (domaine, contenu) => {
    const message = ENCODEUR.encode(`SIGAD-DUPLICATE-REVIEW-V1\u0000${domaine}\u0000${contenu}`);
    return hexadecimal(new Uint8Array(await crypto.subtle.sign("HMAC", cle, message)));
  };
}

export async function calculerPreuveImportMenage(options: {
  signer: SignerPreuve;
  provinceId: string;
  telephone: string | null;
  nomChef: string;
  localiteId: string | null;
  telephoneIdentique: boolean;
  nomLocaliteIdentiques: boolean;
}): Promise<PreuveDoublonCalculee> {
  const criteres: ComparaisonDoublon["criteres"] = [];
  const empreintes: string[] = [];
  const nomNormalise = options.nomChef.normalize("NFKC").trim().toLocaleLowerCase("fr");
  if (options.telephoneIdentique && options.telephone) {
    criteres.push("TELEPHONE_IDENTIQUE");
    empreintes.push(await options.signer("telephone", `${options.provinceId}\u0000${options.telephone}`));
  }
  if (options.nomLocaliteIdentiques && options.localiteId) {
    criteres.push("NOM_LOCALITE_IDENTIQUES");
    empreintes.push(await options.signer("identite-localite", `${options.provinceId}\u0000${options.localiteId}\u0000${nomNormalise}`));
  }
  return {
    empreintes: [...new Set(empreintes)].sort(),
    comparaison: {
      version: 1,
      criteres,
      localite_id: options.nomLocaliteIdentiques ? options.localiteId : null,
    },
  };
}

export async function empreinteReferencePreuve(signer: SignerPreuve, reference: string): Promise<string> {
  const referenceNormalisee = reference.normalize("NFKC").trim().toLocaleLowerCase("fr");
  return signer("reference-documentaire", referenceNormalisee);
}

export function lireEmpreintesPreuve(json: string | null): string[] | null {
  if (json === null) return null;
  let valeur: unknown;
  try {
    valeur = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(valeur) || valeur.some((empreinte) => typeof empreinte !== "string" || !/^[0-9a-f]{64}$/u.test(empreinte))) {
    return null;
  }
  return [...new Set(valeur)].sort();
}

export function fusionnerEmpreintes(...groupes: readonly (readonly string[] | null)[]): string[] {
  return [...new Set(groupes.flatMap((groupe) => groupe ?? []))].sort();
}

export function contientPreuveNouvelle(preuvesActuelles: readonly string[], preuvesConnues: readonly string[] | null): boolean {
  if (preuvesConnues === null) return false;
  const connues = new Set(preuvesConnues);
  return preuvesActuelles.some((preuve) => !connues.has(preuve));
}
