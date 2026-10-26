import { Hono, type Context } from "hono";
import type { EnvironnementApplication } from "../bindings";
import {
  ErreurDonneesTest,
  analyserDependancesEtEligibilite,
  listerFileReconciliationR2,
  listerHistoriqueSuppressions,
  listerOperationsDonneesTest,
  nettoyageLotDonneesTest,
  reclassifierOperation,
  supprimerOperationTest,
  traiterFileReconciliationR2,
} from "../services/donnees-test.service";
import type { StatutReconciliationR2 } from "../../../shared/types/donnees-test";
import {
  schemaDemandeReclassification,
  schemaFiltresDonneesTest,
  schemaNettoyageLotDonneesTest,
  schemaSuppressionOperationTest,
} from "../../../shared/validations/donnees-test";

const routesProprietaireDonneesTest = new Hono<EnvironnementApplication>();

function adresseIp(c: Context<EnvironnementApplication>): string | null {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

function reponseErreur(c: Context<EnvironnementApplication>, erreur: unknown) {
  if (erreur instanceof ErreurDonneesTest) {
    return c.json({ erreur: erreur.message }, erreur.statutHttp as 400 | 403 | 404 | 409 | 500);
  }
  const message = erreur instanceof Error ? erreur.message : "Erreur interne.";
  console.error(JSON.stringify({
    action: "erreur_donnees_test",
    chemin: c.req.path,
    message,
  }));
  return c.json({ erreur: "L’opération n’a pas pu être traitée." }, 500);
}

// 1. Liste paginée et filtrée des opérations
routesProprietaireDonneesTest.get("/operations", async (c) => {
  const filtres = schemaFiltresDonneesTest.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams.entries()),
  );
  if (!filtres.success) {
    return c.json({ erreur: "Paramètres de filtrage ou de pagination invalides." }, 400);
  }
  try {
    return c.json(await listerOperationsDonneesTest(c.env.DB, c.get("utilisateur"), filtres.data));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 2. Analyse et aperçu d'éligibilité avant suppression
routesProprietaireDonneesTest.get("/operations/:id/apercu", async (c) => {
  try {
    const id = c.req.param("id");
    return c.json(await analyserDependancesEtEligibilite(c.env.DB, id));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 3. Reclassification formelle (REEL <-> TEST) avec vérification physique
routesProprietaireDonneesTest.post("/operations/:id/reclassifier", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const validation = schemaDemandeReclassification.safeParse(corps);
  if (!validation.success) {
    return c.json({ erreur: validation.error.issues[0]?.message ?? "Données de reclassification invalides." }, 400);
  }
  try {
    const resultat = await reclassifierOperation(
      c.env.DB,
      c.get("utilisateur"),
      c.req.param("id"),
      validation.data,
      adresseIp(c),
    );
    return c.json(resultat, 200);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 4. Suppression sécurisée d'une opération test individuelle
routesProprietaireDonneesTest.post("/operations/:id/supprimer", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const validation = schemaSuppressionOperationTest.safeParse(corps);
  if (!validation.success) {
    return c.json({ erreur: validation.error.issues[0]?.message ?? "Données de confirmation invalides." }, 400);
  }
  try {
    const resultat = await supprimerOperationTest(
      c.env.DB,
      c.env.BUCKET,
      c.get("utilisateur"),
      c.req.param("id"),
      validation.data,
      adresseIp(c),
    );
    return c.json(resultat, 200);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

routesProprietaireDonneesTest.delete("/operations/:id", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const validation = schemaSuppressionOperationTest.safeParse(corps);
  if (!validation.success) {
    return c.json({ erreur: validation.error.issues[0]?.message ?? "Données de confirmation invalides." }, 400);
  }
  try {
    const resultat = await supprimerOperationTest(
      c.env.DB,
      c.env.BUCKET,
      c.get("utilisateur"),
      c.req.param("id"),
      validation.data,
      adresseIp(c),
    );
    return c.json(resultat, 200);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 5. Nettoyage par lot sécurisé
routesProprietaireDonneesTest.post("/nettoyage-lot", async (c) => {
  let corps: unknown;
  try {
    corps = await c.req.json();
  } catch {
    return c.json({ erreur: "Le corps de la requête est invalide." }, 400);
  }
  const validation = schemaNettoyageLotDonneesTest.safeParse(corps);
  if (!validation.success) {
    return c.json({ erreur: validation.error.issues[0]?.message ?? "Données de nettoyage par lot invalides." }, 400);
  }
  try {
    const resultat = await nettoyageLotDonneesTest(
      c.env.DB,
      c.env.BUCKET,
      c.get("utilisateur"),
      validation.data,
      adresseIp(c),
    );
    return c.json(resultat, 200);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 6. Historique immuable des suppressions
routesProprietaireDonneesTest.get("/historique", async (c) => {
  const limite = Math.min(100, Math.max(1, Number(c.req.query("limite") ?? 25)));
  const decalage = Math.max(0, Number(c.req.query("decalage") ?? 0));
  try {
    return c.json(await listerHistoriqueSuppressions(c.env.DB, c.get("utilisateur"), limite, decalage));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 7. File persistante de réconciliation des objets R2 orphelins
routesProprietaireDonneesTest.get("/reconciliation-r2", async (c) => {
  const limite = Math.min(100, Math.max(1, Number(c.req.query("limite") ?? 25)));
  const decalage = Math.max(0, Number(c.req.query("decalage") ?? 0));
  const statut = c.req.query("statut") as StatutReconciliationR2 | undefined;
  try {
    return c.json(await listerFileReconciliationR2(c.env.DB, c.get("utilisateur"), statut, limite, decalage));
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

// 8. Traitement / Reprise de la file de réconciliation des objets R2
routesProprietaireDonneesTest.post("/reconciliation-r2/traiter", async (c) => {
  const limite = Math.min(100, Math.max(1, Number(c.req.query("limite") ?? 25)));
  try {
    const resultat = await traiterFileReconciliationR2(c.env.DB, c.env.BUCKET, c.get("utilisateur"), limite);
    return c.json(resultat, 200);
  } catch (erreur) {
    return reponseErreur(c, erreur);
  }
});

export { routesProprietaireDonneesTest };
