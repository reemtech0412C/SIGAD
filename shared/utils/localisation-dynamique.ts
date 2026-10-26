export type NatureLieuSelection =
  | "VILLE"
  | "VILLAGE"
  | "HAMEAU"
  | "FERRICK"
  | "CAMPEMENT"
  | "SITE_HUMANITAIRE";

export type NatureLieu = NatureLieuSelection;

export type ModeDecoupageUrbain = "AUCUN" | "SANS_ARRONDISSEMENT" | "AVEC_ARRONDISSEMENTS";

export interface ChampsLocalisationAffiches {
  arrondissement: boolean;
  quartier: boolean;
  carre: boolean;
}

export function calculerChampsLocalisationAffiches(
  natureLieu: NatureLieuSelection | null,
  modeDecoupageUrbain: ModeDecoupageUrbain | null,
  arrondissementSelectionne: boolean,
  quartierPossedeCarres: boolean,
): ChampsLocalisationAffiches {
  if (natureLieu !== "VILLE" || !modeDecoupageUrbain || modeDecoupageUrbain === "AUCUN") {
    return { arrondissement: false, quartier: false, carre: false };
  }
  const avecArrondissements = modeDecoupageUrbain === "AVEC_ARRONDISSEMENTS";
  const quartier = !avecArrondissements || arrondissementSelectionne;
  return {
    arrondissement: avecArrondissements,
    quartier,
    carre: quartier && quartierPossedeCarres,
  };
}

/**
 * Normalise un nom d'unité territoriale pour la détection anti-doublon :
 * minuscules, suppression des accents/diacritiques, apostrophes et tirets unifiés en espaces simples.
 */
export function normaliserToponymeTerritorial(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’‘`\-_.,/\\()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
