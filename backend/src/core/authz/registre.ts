import { CATALOGUE_POLITIQUES_API, type PolitiqueRouteAPI, type RoleSIGAD } from "../../../../shared/permissions/catalogue.ts";

export interface IdentiteObservation {
  readonly authentifie: boolean;
  readonly preAuthentifie?: boolean;
  readonly role?: RoleSIGAD;
  readonly conditions?: readonly "RAPPORT_NON_SENSIBLE"[];
}

export interface RouteObservee {
  readonly methode: string;
  readonly chemin: string;
}

export type DecisionRegistre = "AUTORISE" | "REFUSE" | "POLITIQUE_ABSENTE";

function cleRoute(methode: string, chemin: string): string {
  return `${methode.toUpperCase()} ${chemin}`;
}

export function rechercherPolitique(
  methode: string,
  chemin: string,
  catalogue: readonly PolitiqueRouteAPI[] = CATALOGUE_POLITIQUES_API,
): PolitiqueRouteAPI | undefined {
  const cle = cleRoute(methode, chemin);
  return catalogue.find((politique) => cleRoute(politique.methode, politique.chemin) === cle);
}

/** Évaluation en lecture seule; le routage et les contrôles historiques restent l'autorité en B2.1. */
export function evaluerPolitiqueObservee(
  methode: string,
  chemin: string,
  identite: IdentiteObservation,
  catalogue: readonly PolitiqueRouteAPI[] = CATALOGUE_POLITIQUES_API,
): DecisionRegistre {
  const politique = rechercherPolitique(methode, chemin, catalogue);
  if (!politique) return "POLITIQUE_ABSENTE";
  if (politique.accessMode === "PUBLIC") return "AUTORISE";
  if (politique.accessMode === "PREAUTH") return identite.preAuthentifie ? "AUTORISE" : "REFUSE";
  if (!identite.authentifie) return "REFUSE";
  if (politique.accessMode === "SESSION") return "AUTORISE";
  if (identite.role && politique.rolesAutorises.includes(identite.role)) return "AUTORISE";
  const conditionnel = politique.rolesConditionnels.some((regle) =>
    regle.role === identite.role && identite.conditions?.includes(regle.condition),
  );
  return conditionnel ? "AUTORISE" : "REFUSE";
}

/** Échoue dès qu'une déclaration Hono n'a pas de politique ou qu'une entrée n'a plus de route. */
export function verifierCouverturePolitiques(
  routes: readonly RouteObservee[],
  catalogue: readonly PolitiqueRouteAPI[] = CATALOGUE_POLITIQUES_API,
): void {
  const clefsRoutes = routes.map(({ methode, chemin }) => cleRoute(methode, chemin));
  const clefsCatalogue = catalogue.map(({ methode, chemin }) => cleRoute(methode, chemin));
  const doublonsRoutes = clefsRoutes.filter((cle, index) => clefsRoutes.indexOf(cle) !== index);
  const doublonsCatalogue = clefsCatalogue.filter((cle, index) => clefsCatalogue.indexOf(cle) !== index);
  const routesSansPolitique = [...new Set(clefsRoutes.filter((cle) => !clefsCatalogue.includes(cle)))];
  const politiquesOrphelines = [...new Set(clefsCatalogue.filter((cle) => !clefsRoutes.includes(cle)))];
  if (doublonsRoutes.length || doublonsCatalogue.length || routesSansPolitique.length || politiquesOrphelines.length) {
    throw new Error([
      doublonsRoutes.length ? `déclarations dupliquées: ${[...new Set(doublonsRoutes)].join(", ")}` : "",
      doublonsCatalogue.length ? `politiques dupliquées: ${[...new Set(doublonsCatalogue)].join(", ")}` : "",
      routesSansPolitique.length ? `routes sans politique: ${routesSansPolitique.join(", ")}` : "",
      politiquesOrphelines.length ? `politiques sans route: ${politiquesOrphelines.join(", ")}` : "",
    ].filter(Boolean).join("; "));
  }
}
