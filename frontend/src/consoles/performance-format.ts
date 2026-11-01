export interface IndicateursPerformanceUI {
  provinceId: string | null;
  provinceNom: string;
  distributions: number;
  distributionsTerminees: number;
  avancementDistributions: number | null;
  menagesAssignes: number;
  menagesServis: number;
  menagesPartiels: number;
  couvertureService: number | null;
  distributionsEnRetard: number;
  tauxRetard: number | null;
  ponctualiteMedianeJours: number | null;
}

export interface ReponsePerformanceUI {
  genere_le: string;
  national: IndicateursPerformanceUI;
  provinces: IndicateursPerformanceUI[];
  indicateurs_a_venir: string[];
}

/** Un ratio absent s'affiche « n/d », jamais 0 %: l'absence de population n'est pas une performance nulle. */
export function formaterPourcentage(valeur: number | null): string {
  return valeur === null ? "n/d" : `${(valeur * 100).toFixed(1).replace(".", ",")} %`;
}

export function formaterEcartJours(valeur: number | null): string {
  if (valeur === null) return "n/d";
  if (valeur === 0) return "à l’heure";
  const absolu = Math.abs(valeur).toString().replace(".", ",");
  return valeur > 0 ? `+${absolu} j (retard)` : `−${absolu} j (avance)`;
}
