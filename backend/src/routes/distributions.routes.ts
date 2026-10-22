import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings.ts";
import {
  ErreurDistribution,
  cloturerDistribution,
  creerDistribution,
  declarerFinDistribution,
  demarrerExecutionDistribution,
  enregistrerRemiseDistribution,
  listerAllocationsMenage,
  listerDistributions,
  listerMenagesCiblesDisponibles,
  listerMenagesDistribution,
  listerReferentielDistribution,
  lireDetailDistribution,
  lireSyntheseDistribution,
  modifierDistributionBrouillon,
  obtenirPvDistribution,
  preparerDistribution,
  retournerPourCorrectionDistribution,
  soumettreCorrectionDistribution,
  televerserPvDistribution,
  validerCorrectionDistribution,
  validerDistributionEtReserver,
} from "../services/distribution.service.ts";
import { ErreurStock } from "../services/stock.service.ts";
import {
  schemaClotureDistribution,
  schemaDeclarationFinDistribution,
  schemaPaginationDistributions,
  schemaPaginationMenagesDistribution,
  schemaPaginationReferentielDistribution,
  schemaPlanDistribution,
  schemaRemiseDistribution,
  schemaRetourCorrectionDistribution,
  schemaSoumissionCorrectionDistribution,
} from "../../../shared/validations/distributions.ts";

export const routesDistributions = new Hono<EnvironnementApplication>();
export const routesControleDistributions = new Hono<EnvironnementApplication>();

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

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurDistribution) {
    return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  }
  if (erreur instanceof ErreurStock) {
    return c.json({ erreur: "Une contrainte de cohérence a refusé l’opération. Rechargez les données avant de réessayer." }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (/DISTRIBUTION_|ZONE_DISTRIBUTION_|MENAGE_DISTRIBUTION_|ARTICLE_DISTRIBUTION_|ALLOCATION_DISTRIBUTION_|RESERVATION_DISTRIBUTION_|REMISE_DISTRIBUTION_|LIGNE_REMISE_DISTRIBUTION_|VALIDATION_DISTRIBUTION_|PLAN_DISTRIBUTION_|TRANSITION_STATUT_|AUDIT_DISTRIBUTION_|MOUVEMENT_STOCK_|MOUVEMENT_SANS_MUTATION_EFFECTIVE|UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/iu.test(message)) {
    return c.json({ erreur: "La distribution n’a pas été enregistrée car une règle de cohérence a refusé l’opération." }, 409);
  }
  console.error(JSON.stringify({ action: "operation_distribution_refusee", chemin: c.req.path, erreur: message }));
  return c.json({ erreur: "L’opération de distribution n’a pas pu être enregistrée." }, 500);
}

function construireReponseOperation(c: Context<EnvironnementApplication>, resultat: {
  statutHttp: number;
  corps: unknown;
  rejouee: boolean;
}) {
  c.header("Idempotency-Replayed", resultat.rejouee ? "true" : "false");
  return c.json(resultat.corps, resultat.statutHttp === 201 ? 201 : 200);
}

function adresseIp(c: Context<EnvironnementApplication>): string | null {
  return c.req.header("CF-Connecting-IP") ?? null;
}

routesDistributions.get("/", async (c) => {
  const filtres = lireFiltres(c, schemaPaginationDistributions);
  if (!filtres) return c.json({ erreur: "Les paramètres de recherche ou de pagination sont invalides." }, 400);
  try {
    return c.json(await listerDistributions(c.env.DB, c.get("utilisateur"), filtres));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/referentiels", async (c) => {
  const filtres = lireFiltres(c, schemaPaginationReferentielDistribution);
  if (!filtres) return c.json({ erreur: "Le type de référentiel ou la pagination est invalide." }, 400);
  try {
    return c.json(await listerReferentielDistribution(c.env.DB, c.get("utilisateur"), filtres));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/menages", async (c) => {
  const filtres = lireFiltres(c, schemaPaginationMenagesDistribution);
  if (!filtres) return c.json({ erreur: "Les filtres de ménages ou la pagination sont invalides." }, 400);
  try {
    return c.json(await listerMenagesCiblesDisponibles(c.env.DB, c.get("utilisateur"), filtres));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/", async (c) => {
  const entree = await lireCorps(c, schemaPlanDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Le plan de distribution est invalide ou contient des champs non autorisés." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await creerDistribution(c.env.DB, c.get("utilisateur"), entree, cle, adresseIp(c)));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/:id", async (c) => {
  try {
    return c.json(await lireDetailDistribution(c.env.DB, c.get("utilisateur"), c.req.param("id")));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.put("/:id", async (c) => {
  const entree = await lireCorps(c, schemaPlanDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Le plan de distribution est invalide ou contient des champs non autorisés." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await modifierDistributionBrouillon(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/:id/menages", async (c) => {
  const filtres = lireFiltres(c, schemaPaginationMenagesDistribution);
  if (!filtres) return c.json({ erreur: "Les paramètres de pagination sont invalides." }, 400);
  try {
    return c.json(await listerMenagesDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), filtres.limite, filtres.decalage,
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/:id/menages/:menageDistributionId/allocations", async (c) => {
  try {
    return c.json(await listerAllocationsMenage(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), c.req.param("menageDistributionId"),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/:id/synthese", async (c) => {
  try {
    return c.json(await lireSyntheseDistribution(c.env.DB, c.get("utilisateur"), c.req.param("id")));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/preparation", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await preparerDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/validation", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await validerDistributionEtReserver(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/execution", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await demarrerExecutionDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/remises", async (c) => {
  const entree = await lireCorps(c, schemaRemiseDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Les données de remise sont invalides ou contiennent des champs non autorisés." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await enregistrerRemiseDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/pv", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  let formulaire: FormData;
  try { formulaire = await c.req.raw.formData(); } catch { return c.json({ erreur: "Le formulaire de téléversement est invalide." }, 400); }
  const fichier = formulaire.get("fichier");
  if (!(fichier instanceof File)) return c.json({ erreur: "Sélectionnez un procès-verbal au format PDF." }, 400);
  try {
    return c.json(await televerserPvDistribution(
      c.env.DB, c.env.BUCKET, c.get("utilisateur"), c.req.param("id"), fichier, cle, adresseIp(c),
    ), 201);
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.get("/:id/pv", async (c) => {
  try {
    const pv = await obtenirPvDistribution(c.env.DB, c.env.BUCKET, c.get("utilisateur"), c.req.param("id"));
    const nom = encodeURIComponent(pv.nom_fichier_original);
    return new Response(pv.corps, {
      headers: {
        "Content-Type": pv.type_mime,
        "Content-Length": String(pv.taille_octets),
        "Content-Disposition": `attachment; filename*=UTF-8''${nom}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/declaration-fin", async (c) => {
  const entree = await lireCorps(c, schemaDeclarationFinDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Les observations de fin de distribution sont invalides." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await declarerFinDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree.observations ?? null, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesDistributions.post("/:id/corrections", async (c) => {
  const entree = await lireCorps(c, schemaSoumissionCorrectionDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "La réponse à la demande de correction est invalide." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await soumettreCorrectionDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleDistributions.post("/:id/retour-correction", async (c) => {
  const entree = await lireCorps(c, schemaRetourCorrectionDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Le motif ou le périmètre de correction est invalide." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await retournerPourCorrectionDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleDistributions.post("/:id/corrections/:correctionId/validation", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await validerCorrectionDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), c.req.param("correctionId"), cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});

routesControleDistributions.post("/:id/cloture", async (c) => {
  const entree = await lireCorps(c, schemaClotureDistribution);
  const cle = lireCleIdempotence(c);
  if (!entree) return c.json({ erreur: "Les observations de clôture sont invalides." }, 400);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  try {
    return construireReponseOperation(c, await cloturerDistribution(
      c.env.DB, c.get("utilisateur"), c.req.param("id"), entree.observations_finales ?? null, cle, adresseIp(c),
    ));
  } catch (erreur) { return reponseErreur(c, erreur); }
});
