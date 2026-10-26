export function normaliserNomCommune(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/œ/gu, "oe")
    .replace(/æ/gu, "ae")
    .replace(/[’‘´`']/gu, "")
    .replace(/[-‐‑‒–—]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
