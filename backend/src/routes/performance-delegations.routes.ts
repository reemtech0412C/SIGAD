import { Hono } from "hono";
import type { EnvironnementApplication } from "../bindings";
import { calculerPerformanceDelegations, lireDistributionsPerformance } from "../services/performance-delegations.service";

/**
 * B3.3 — Performance des délégations (lecture seule, agrégats par province, aucune donnée nominative).
 * Monté sous /api/central (authentification, CSRF et rôle ADMIN_CENTRAL déjà exigés).
 * Définitions: docs/architecture-modernization/11-indicateurs-performance-delegations.md.
 */
const routesPerformanceDelegations = new Hono<EnvironnementApplication>();

routesPerformanceDelegations.get("/performance-delegations", async (c) => {
  const resultat = calculerPerformanceDelegations(await lireDistributionsPerformance(c.env.DB));
  return c.json({
    genere_le: new Date().toISOString(),
    national: resultat.national,
    provinces: resultat.parProvince,
    indicateurs_a_venir: ["delai_validation_menages", "taux_rejet_menages", "activite_collecte"],
  });
});

export { routesPerformanceDelegations };
