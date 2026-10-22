export type NatureLieu = "VILLE" | "VILLAGE" | "FERRICK" | "CAMPEMENT" | "SITE_HUMANITAIRE";
export type ModeDecoupageUrbain = "AUCUN" | "SANS_ARRONDISSEMENT" | "AVEC_ARRONDISSEMENTS" | null;

export interface ChampsLocalisationAffiches {
  arrondissement: boolean;
  quartier: boolean;
  carre: boolean;
}

export function calculerChampsLocalisationAffiches(
  nature: NatureLieu | null,
  modeDecoupageUrbain: ModeDecoupageUrbain,
  arrondissementSelectionne: boolean,
  quartierPossedeCarres: boolean,
): ChampsLocalisationAffiches {
  if (nature !== "VILLE") {
    return { arrondissement: false, quartier: false, carre: false };
  }
  if (modeDecoupageUrbain === "SANS_ARRONDISSEMENT") {
    return { arrondissement: false, quartier: true, carre: quartierPossedeCarres };
  }
  if (modeDecoupageUrbain === "AVEC_ARRONDISSEMENTS") {
    return {
      arrondissement: true,
      quartier: arrondissementSelectionne,
      carre: arrondissementSelectionne && quartierPossedeCarres,
    };
  }
  return { arrondissement: false, quartier: false, carre: false };
}
