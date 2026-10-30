import { CATALOGUE_POLITIQUES_API, type PolitiqueRouteAPI, type RoleSIGAD } from "../../../shared/permissions/catalogue";

export type DecisionDeclaree = "AUTORISE" | "CONDITIONNEL" | "REFUSE" | "SESSION_SEULE" | "PUBLIC";

/**
 * Lecture de la politique Legacy déclarée dans le catalogue (B1.1). Ne reflète ni l'état d'une session,
 * ni l'affectation, ni la propriété d'une ressource: l'API reste l'autorité d'accès.
 */
export function decisionDeclaree(politique: PolitiqueRouteAPI, role: RoleSIGAD): DecisionDeclaree {
  if (politique.accessMode === "PUBLIC" || politique.accessMode === "PREAUTH") return "PUBLIC";
  if (politique.accessMode === "SESSION") return "SESSION_SEULE";
  if (politique.rolesAutorises.includes(role)) return "AUTORISE";
  if (politique.rolesConditionnels.some((regle) => regle.role === role)) return "CONDITIONNEL";
  return "REFUSE";
}

export function rechercherPolitiques(
  filtre: string,
  catalogue: readonly PolitiqueRouteAPI[] = CATALOGUE_POLITIQUES_API,
): PolitiqueRouteAPI[] {
  const terme = filtre.trim().toLowerCase();
  return catalogue.filter((p) => !terme || `${p.methode} ${p.chemin}`.toLowerCase().includes(terme));
}

export function resumerParRole(
  role: RoleSIGAD,
  catalogue: readonly PolitiqueRouteAPI[] = CATALOGUE_POLITIQUES_API,
): Record<DecisionDeclaree, number> {
  const total: Record<DecisionDeclaree, number> = { AUTORISE: 0, CONDITIONNEL: 0, REFUSE: 0, SESSION_SEULE: 0, PUBLIC: 0 };
  for (const p of catalogue) total[decisionDeclaree(p, role)] += 1;
  return total;
}
