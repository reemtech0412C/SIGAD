import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings.ts";
import {
  cloturerObservationControle,
  creerObservationControle,
  listerDemandesCorrection,
  listerDossiersACloturer,
  listerJournalAudit,
  listerObservationsControle,
  listerOperationsControle,
  lireEtatClotureDistribution,
  lireSyntheseControle,
  repondreObservationControle,
} from "../services/controle.service.ts";
import { ErreurStock } from "../services/stock.service.ts";
import {
  schemaClotureObservation,
  schemaCreationObservation,
  schemaFiltresAudit,
  schemaFiltresClotures,
  schemaFiltresControle,
  schemaFiltresCorrections,
  schemaFiltresObservations,
  schemaReponseObservation,
} from "../../../shared/validations/controle.ts";
import {
  listerNotifications,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
} from "../services/notifications.service.ts";
import { schemaFiltresNotifications } from "../../../shared/validations/controle.ts";
import { typeErreurSecurise } from "../services/fichiers-securite.service.ts";

export const routesControleCentral = new Hono<EnvironnementApplication>();
export const routesControleProvincial = new Hono<EnvironnementApplication>();
export const routesNotifications = new Hono<EnvironnementApplication>();

function lireCleIdempotence(c: Context<EnvironnementApplication>): string | null {
  const cle = c.req.header("X-Idempotency-Key");
  return cle && /^[A-Za-z0-9._:-]{16,160}$/u.test(cle) ? cle : null;
}

function lireFiltres<T>(
  c: Context<EnvironnementApplication>,
  schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false } },
): T | null {
  const resultat = schema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  return resultat.success ? resultat.data : null;
}

async function lireCorps<T>(
  c: Context<EnvironnementApplication>,
  schema: { safeParse: (valeur: unknown) => { success: true; data: T } | { success: false } },
): Promise<T | null> {
  try {
    const resultat = schema.safeParse(await c.req.json());
    return resultat.success ? resultat.data : null;
  } catch {
    return null;
  }
}

function adresseIp(c: Context<EnvironnementApplication>): string | null {
  return c.req.header("CF-Connecting-IP") ?? null;
}

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurStock) return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  const message = erreur instanceof Error ? erreur.message : "";
  if (/OBSERVATION_CONTROLE_|DEMANDE_CORRECTION_|NOTIFICATION_|JOURNAL_AUDIT_|CLOTURE_DISTRIBUTION_|UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/iu.test(message)) {
    return c.json({ erreur: "Une règle de contrôle ou de cohérence a refusé l’opération." }, 409);
  }
  console.error(JSON.stringify({ action: "echec_controle_central", chemin: c.req.path,
    type_erreur: typeErreurSecurise(erreur) }));
  return c.json({ erreur: "Le service de contrôle n’a pas pu traiter la demande." }, 500);
}

function reponseOperation<T>(c: Context<EnvironnementApplication>, resultat: {
  statutHttp: number; corps: T; rejouee: boolean;
}) {
  c.header("Idempotency-Replayed", resultat.rejouee ? "true" : "false");
  return c.json(resultat.corps, resultat.statutHttp === 201 ? 201 : 200);
}

routesControleCentral.get("/controle/synthese", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresControle);
  if (!filtres) return c.json({ erreur: "Les filtres du tableau national sont invalides." }, 400);
  try { return c.json(await lireSyntheseControle(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.get("/controle/operations", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresControle);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination des opérations sont invalides." }, 400);
  try { return c.json(await listerOperationsControle(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.get("/controle/fermetures", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresClotures);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination des dossiers à clôturer sont invalides." }, 400);
  try { return c.json(await listerDossiersACloturer(c.env.DB, c.get("utilisateur"), {
    limite: filtres.limite, decalage: filtres.decalage,
    ...(filtres.province_id ? { province_id: filtres.province_id } : {}),
  })); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.get("/controle/distributions/:id/cloture", async (c) => {
  try { return c.json(await lireEtatClotureDistribution(c.env.DB, c.get("utilisateur"), c.req.param("id"))); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.get("/controle/observations", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresObservations);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination des observations sont invalides." }, 400);
  try { return c.json(await listerObservationsControle(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.post("/controle/observations", async (c) => {
  const entree = await lireCorps(c, schemaCreationObservation);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Le contenu ou la référence de l’observation est invalide." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try { return reponseOperation(c, await creerObservationControle(c.env.DB, c.get("utilisateur"), {
    operation_type: entree.operation_type, operation_id: entree.operation_id,
    ...(entree.province_id ? { province_id: entree.province_id } : {}),
    niveau_gravite: entree.niveau_gravite, observation: entree.observation,
  }, cle, adresseIp(c))); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.post("/controle/observations/:id/cloture", async (c) => {
  const entree = await lireCorps(c, schemaClotureObservation);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "La décision de clôture de l’observation est invalide." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return reponseOperation(c, await cloturerObservationControle(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree.statut, entree.decision, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.get("/controle/corrections", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresCorrections);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination des demandes de correction sont invalides." }, 400);
  try { return c.json(await listerDemandesCorrection(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleCentral.get("/audit", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresAudit);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination du journal d’audit sont invalides." }, 400);
  try { return c.json(await listerJournalAudit(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleProvincial.get("/observations", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresObservations);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination des observations sont invalides." }, 400);
  try { return c.json(await listerObservationsControle(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleProvincial.post("/observations/:id/reponse", async (c) => {
  const entree = await lireCorps(c, schemaReponseObservation);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "La réponse à l’observation est invalide." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return reponseOperation(c, await repondreObservationControle(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree.reponse_delegue, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleProvincial.get("/corrections", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresCorrections);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination des demandes de correction sont invalides." }, 400);
  try { return c.json(await listerDemandesCorrection(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleProvincial.get("/audit", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresAudit);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination du journal d’audit sont invalides." }, 400);
  try { return c.json(await listerJournalAudit(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesNotifications.get("/", async (c) => {
  const filtres = lireFiltres(c, schemaFiltresNotifications);
  if (!filtres) return c.json({ erreur: "Les filtres ou la pagination des notifications sont invalides." }, 400);
  try { return c.json(await listerNotifications(c.env.DB, c.get("utilisateur"), filtres)); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesNotifications.post("/:id/lecture", async (c) => {
  try { return c.json(await marquerNotificationLue(c.env.DB, c.get("utilisateur"), c.req.param("id"))); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

routesNotifications.post("/lecture-toutes", async (c) => {
  try { return c.json(await marquerToutesNotificationsLues(c.env.DB, c.get("utilisateur"))); }
  catch (erreur) { return reponseErreur(c, erreur); }
});

export { reponseErreur as reponseErreurControle };
