import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings.ts";
import {
  ErreurOperationCentrale,
  changerStatutOperationCentrale,
  creerOperationCentrale,
  enregistrerApprobation,
  lireConsolidationNationale,
  lireDetailOperationCentrale,
  listerOperationsCentrales,
  mettreAJourDossierDelegue,
  modifierOperationCentrale,
  obtenirDocumentOperation,
  televerserDocumentOperation,
} from "../services/operation-centrale.service.ts";
import {
  schemaCreationOperationCentrale,
  schemaEnregistrementApprobation,
  schemaMiseAJourDossierDelegue,
  schemaModificationOperationCentrale,
  schemaPaginationOperationsCentrales,
  schemaTransitionStatutOperation,
} from "../../../shared/validations/operations-centrales.ts";
import { CorpsDocumentTropVolumineux, lireFormulaireMultipartBorne, typeErreurSecurise } from "../services/fichiers-securite.service.ts";

export const routesOperationsCentrales = new Hono<EnvironnementApplication>();
export const routesOperationsProvinciales = new Hono<EnvironnementApplication>();

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
    const corps = await c.req.json();
    const resultat = schema.safeParse(corps);
    return resultat.success ? resultat.data : null;
  } catch {
    return null;
  }
}

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurOperationCentrale) {
    return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  }
  const message = erreur instanceof Error ? erreur.message : "";
  if (/UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/iu.test(message)) {
    return c.json({ erreur: "Une règle de cohérence ou d'unicité a refusé l’opération." }, 409);
  }
  console.error(JSON.stringify({
    action: "operation_centrale_erreur",
    chemin: c.req.path,
    type_erreur: typeErreurSecurise(erreur),
  }));
  return c.json({ erreur: "L’opération n’a pas pu être traitée." }, 500);
}

function construireReponse(c: Context<EnvironnementApplication>, resultat: {
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

// Routes Opérations Centrales (/api/operations-centrales)
routesOperationsCentrales.get("/", async (c) => {
  const filtres = lireFiltres(c, schemaPaginationOperationsCentrales);
  if (!filtres) return c.json({ erreur: "Paramètres de pagination ou de filtrage invalides." }, 400);
  try {
    return c.json(await listerOperationsCentrales(c.env.DB, c.get("utilisateur"), filtres));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.post("/", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaCreationOperationCentrale);
  if (!entree) return c.json({ erreur: "Données de l'opération invalides." }, 400);
  try {
    return construireReponse(c, await creerOperationCentrale(c.env.DB, c.get("utilisateur"), entree, cle, adresseIp(c)));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.get("/:id", async (c) => {
  try {
    return c.json(await lireDetailOperationCentrale(c.env.DB, c.get("utilisateur"), c.req.param("id")));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.put("/:id", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaModificationOperationCentrale);
  if (!entree) return c.json({ erreur: "Données de modification invalides." }, 400);
  try {
    return construireReponse(c, await modifierOperationCentrale(c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c)));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.post("/:id/statut", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaTransitionStatutOperation);
  if (!entree) return c.json({ erreur: "Paramètres de transition de statut invalides." }, 400);
  try {
    return construireReponse(c, await changerStatutOperationCentrale(c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c)));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.post("/:id/approbations", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaEnregistrementApprobation);
  if (!entree) return c.json({ erreur: "Données d'approbation invalides." }, 400);
  try {
    return construireReponse(c, await enregistrerApprobation(c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c)));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.post("/:id/documents", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  let formulaire: FormData;
  try {
    formulaire = await lireFormulaireMultipartBorne(c.req.raw);
  } catch (erreur) {
    if (erreur instanceof CorpsDocumentTropVolumineux) return c.json({ erreur: erreur.message }, 413);
    return c.json({ erreur: "Formulaire multipart invalide." }, 400);
  }
  const fichier = formulaire.get("fichier");
  const categorie = String(formulaire.get("categorie_document") || "AUTRE");
  const intitule = String(formulaire.get("intitule") || "Document");
  if (!(fichier instanceof File)) return c.json({ erreur: "Sélectionnez un fichier valide (PDF ou image)." }, 400);
  try {
    const resultat = await televerserDocumentOperation(
      c.env.DB,
      c.env.BUCKET,
      c.get("utilisateur"),
      c.req.param("id"),
      fichier,
      categorie,
      intitule,
      cle,
      adresseIp(c),
    );
    return c.json(resultat, 201);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.get("/:id/documents/:docId", async (c) => {
  try {
    const doc = await obtenirDocumentOperation(c.env.DB, c.env.BUCKET, c.get("utilisateur"), c.req.param("id"), c.req.param("docId"));
    const nom = encodeURIComponent(doc.nom_fichier_original);
    return new Response(doc.corps, {
      headers: {
        "Content-Type": doc.type_mime,
        "Content-Length": String(doc.taille_octets),
        "Content-Disposition": `attachment; filename*=UTF-8''${nom}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsCentrales.get("/:id/consolidation", async (c) => {
  const utilisateur = c.get("utilisateur");
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    return c.json({ erreur: "La consolidation nationale est réservée à l'administration centrale et aux comptes institutionnels." }, 403);
  }
  try {
    return c.json(await lireConsolidationNationale(c.env.DB, utilisateur, c.req.param("id")));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// Routes Délégué Provincial (/api/provincial/operations-centrales)
routesOperationsProvinciales.get("/", async (c) => {
  const filtres = lireFiltres(c, schemaPaginationOperationsCentrales);
  if (!filtres) return c.json({ erreur: "Paramètres invalides." }, 400);
  try {
    return c.json(await listerOperationsCentrales(c.env.DB, c.get("utilisateur"), filtres));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsProvinciales.get("/:id", async (c) => {
  try {
    return c.json(await lireDetailOperationCentrale(c.env.DB, c.get("utilisateur"), c.req.param("id")));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesOperationsProvinciales.patch("/:id/dossier", async (c) => {
  const cle = lireCleIdempotence(c);
  if (!cle) return c.json({ erreur: "Une clé X-Idempotency-Key valide est obligatoire." }, 400);
  const entree = await lireCorps(c, schemaMiseAJourDossierDelegue);
  if (!entree) return c.json({ erreur: "Données de mise à jour du dossier invalides." }, 400);
  try {
    return construireReponse(c, await mettreAJourDossierDelegue(c.env.DB, c.get("utilisateur"), c.req.param("id"), entree, cle, adresseIp(c)));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});
