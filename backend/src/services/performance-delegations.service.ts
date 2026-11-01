/**
 * B3.3 — Performance des délégations. Définitions: docs/architecture-modernization/11-indicateurs-performance-delegations.md.
 * Le calcul est pur (entrée: lignes agrégées par distribution); la lecture SQL est séparée et ne renvoie aucune donnée nominative.
 */

export type StatutDistribution =
  | "BROUILLON" | "EN_PREPARATION" | "VALIDEE_PROVINCE" | "EN_EXECUTION"
  | "TERMINEE_PROVINCE" | "RETOURNEE_POUR_CORRECTION" | "CLOTUREE_CENTRAL";

export interface LigneDistributionPerformance {
  readonly provinceId: string;
  readonly provinceNom: string;
  readonly statut: StatutDistribution;
  readonly datePrevue: string;
  readonly dateDeclarationFin: string | null;
  readonly menagesAssignes: number;
  readonly menagesServis: number;
  readonly menagesPartiels: number;
}

export interface IndicateursPerformance {
  readonly provinceId: string | null;
  readonly provinceNom: string;
  readonly distributions: number;
  readonly distributionsTerminees: number;
  readonly avancementDistributions: number | null;
  readonly menagesAssignes: number;
  readonly menagesServis: number;
  readonly menagesPartiels: number;
  readonly couvertureService: number | null;
  readonly distributionsEnRetard: number;
  readonly tauxRetard: number | null;
  readonly ponctualiteMedianeJours: number | null;
}

const STATUTS_TERMINAUX: readonly StatutDistribution[] = ["TERMINEE_PROVINCE", "CLOTUREE_CENTRAL"];
const JOUR_MS = 86_400_000;

function jour(date: string): number {
  const valeur = Date.parse(date.length > 10 ? `${date.replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/u.test(date) ? "" : "Z"}` : `${date}T00:00:00Z`);
  return Math.floor(valeur / JOUR_MS);
}

function ratio(numerateur: number, denominateur: number): number | null {
  return denominateur === 0 ? null : Math.round((numerateur / denominateur) * 10_000) / 10_000;
}

function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const tries = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  const resultat = tries.length % 2 === 1 ? tries[milieu]! : (tries[milieu - 1]! + tries[milieu]!) / 2;
  return Math.round(resultat * 10) / 10;
}

function calculer(provinceId: string | null, provinceNom: string, lignes: readonly LigneDistributionPerformance[], aujourdhui: number): IndicateursPerformance {
  const terminees = lignes.filter((l) => STATUTS_TERMINAUX.includes(l.statut)).length;
  const enRetard = lignes.filter((l) => !STATUTS_TERMINAUX.includes(l.statut) && jour(l.datePrevue) < aujourdhui).length;
  const assignes = lignes.reduce((total, l) => total + l.menagesAssignes, 0);
  const servis = lignes.reduce((total, l) => total + l.menagesServis, 0);
  const partiels = lignes.reduce((total, l) => total + l.menagesPartiels, 0);
  const ecarts = lignes.filter((l) => l.dateDeclarationFin !== null).map((l) => jour(l.dateDeclarationFin!) - jour(l.datePrevue));
  return {
    provinceId, provinceNom,
    distributions: lignes.length,
    distributionsTerminees: terminees,
    avancementDistributions: ratio(terminees, lignes.length),
    menagesAssignes: assignes, menagesServis: servis, menagesPartiels: partiels,
    couvertureService: ratio(servis, assignes),
    distributionsEnRetard: enRetard,
    tauxRetard: ratio(enRetard, lignes.length),
    ponctualiteMedianeJours: mediane(ecarts),
  };
}

/** Calcule les indicateurs par province et au niveau national. Les brouillons sont exclus de toute population. */
export function calculerPerformanceDelegations(
  lignes: readonly LigneDistributionPerformance[],
  aujourdhui: Date = new Date(),
): { readonly parProvince: readonly IndicateursPerformance[]; readonly national: IndicateursPerformance } {
  const reference = Math.floor(aujourdhui.getTime() / JOUR_MS);
  const retenues = lignes.filter((l) => l.statut !== "BROUILLON");
  const groupes = new Map<string, { nom: string; lignes: LigneDistributionPerformance[] }>();
  for (const ligne of retenues) {
    const groupe = groupes.get(ligne.provinceId) ?? { nom: ligne.provinceNom, lignes: [] };
    groupe.lignes.push(ligne);
    groupes.set(ligne.provinceId, groupe);
  }
  const parProvince = [...groupes.entries()]
    .map(([id, groupe]) => calculer(id, groupe.nom, groupe.lignes, reference))
    .sort((a, b) => (b.avancementDistributions ?? -1) - (a.avancementDistributions ?? -1) || a.provinceNom.localeCompare(b.provinceNom, "fr"));
  return { parProvince, national: calculer(null, "National", retenues, reference) };
}

interface LigneSql {
  province_id: string;
  province_nom: string;
  statut: StatutDistribution;
  date_prevue: string;
  date_declaration_fin: string | null;
  menages_assignes: number;
  menages_servis: number;
  menages_partiels: number;
}

/** Lecture agrégée (une ligne par distribution hors brouillon), sans identifiant de ménage ni de compte. */
export async function lireDistributionsPerformance(db: D1Database): Promise<LigneDistributionPerformance[]> {
  const resultat = await db.prepare(`SELECT d.province_id, p.nom AS province_nom, d.statut, d.date_prevue, d.date_declaration_fin,
      COUNT(m.id) AS menages_assignes,
      COALESCE(SUM(CASE WHEN m.statut_service = 'SERVI' THEN 1 ELSE 0 END), 0) AS menages_servis,
      COALESCE(SUM(CASE WHEN m.statut_service = 'PARTIELLEMENT_SERVI' THEN 1 ELSE 0 END), 0) AS menages_partiels
    FROM distributions_provinciales d
    JOIN provinces p ON p.id = d.province_id
    LEFT JOIN menages_distribution m ON m.distribution_id = d.id
    WHERE d.statut <> 'BROUILLON'
    GROUP BY d.id`).all<LigneSql>();
  return resultat.results.map((l) => ({
    provinceId: l.province_id, provinceNom: l.province_nom, statut: l.statut, datePrevue: l.date_prevue,
    dateDeclarationFin: l.date_declaration_fin, menagesAssignes: l.menages_assignes,
    menagesServis: l.menages_servis, menagesPartiels: l.menages_partiels,
  }));
}
