import { Hono } from "hono";
import { z } from "zod";
import type { EnvironnementApplication } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import { empreinteAction, evaluerCreationDemande, evaluerExecution } from "../core/approbation/politique-approbation.ts";
import {
  adresseIp, approuverDemande, chargerDemande, cloreDemande, compterComptesActifs, empreinteDepuisLigne,
  expirerDemandes, lireCorps, motifSchema, presenterDemande, versDemande, type LigneDemande,
} from "./approbation-commun";

/**
 * Exceptions d'accès nominatif (D-02/D-16/D-17): un ADMIN_CENTRAL demande un accès borné (≤ 24 h) à une route
 * nominative; un AUTRE ADMIN_CENTRAL l'approuve avec une MFA fraîche. L'exécution enregistre une exception
 * INERTE (aucune route ne la consulte: l'enforcement relève de B2.6). Monté sous /api/central.
 */
const routesExceptionsNominatives = new Hono<EnvironnementApplication>();

const ACTION_EXCEPTION = "EXCEPTION_ACCES_NOMINATIF";
const ROUTES_NOMINATIVES = ["GET /api/distributions/menages"] as const;

async function contexteComptes(db: D1Database): Promise<{ proprietairesActifs: number; administrateursCentrauxActifs: number }> {
  return {
    proprietairesActifs: await compterComptesActifs(db, "PROPRIETAIRE"),
    administrateursCentrauxActifs: await compterComptesActifs(db, "ADMIN_CENTRAL"),
  };
}

routesExceptionsNominatives.get("/exceptions-nominatives", async (c) => {
  await expirerDemandes(c.env.DB);
  const statut = c.req.query("statut");
  const valide = statut === undefined || ["EN_ATTENTE", "APPROUVEE", "REFUSEE", "EXPIREE", "EXECUTEE", "ANNULEE"].includes(statut);
  if (!valide) return c.json({ erreur: "Le filtre de statut est invalide." }, 400);
  const liste = await c.env.DB.prepare(`SELECT * FROM demandes_approbation WHERE action_code = ? AND (? IS NULL OR statut = ?)
    ORDER BY cree_le DESC, id LIMIT 100`).bind(ACTION_EXCEPTION, statut ?? null, statut ?? null).all<LigneDemande>();
  return c.json({ donnees: liste.results.map(presenterDemande) });
});

routesExceptionsNominatives.post("/exceptions-nominatives", async (c) => {
  const corps = z.object({
    route_cible: z.enum(ROUTES_NOMINATIVES),
    duree_heures: z.number().int().min(1).max(24),
    motif: motifSchema,
  }).strict().safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "La demande d’exception est invalide." }, 400);
  await expirerDemandes(c.env.DB);
  const acteur = c.get("utilisateur");
  const recevable = evaluerCreationDemande(ACTION_EXCEPTION, { role: acteur.role, actif: acteur.statut === "ACTIF" }, {
    maintenant: new Date().toISOString(), ...(await contexteComptes(c.env.DB)),
  });
  if (!recevable.autorise) return c.json({ erreur: `Demande refusée (${recevable.motif}).` }, 409);

  const parametres = { route_cible: corps.data.route_cible, duree_heures: corps.data.duree_heures, beneficiaire_id: acteur.id };
  const empreinte = await empreinteAction({ actionCode: ACTION_EXCEPTION, cibleType: "ROUTE", cibleId: corps.data.route_cible, parametres });
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO demandes_approbation
        (id, action_code, cible_type, cible_id, empreinte_action, parametres, motif, demandeur_id, role_approbateur_requis, request_id, cree_le, expire_le)
        VALUES (?, ?, 'ROUTE', ?, ?, ?, ?, ?, 'ADMIN_CENTRAL', ?, datetime('now'), datetime('now', '+24 hours'))`)
        .bind(id, ACTION_EXCEPTION, corps.data.route_cible, empreinte, JSON.stringify(parametres), corps.data.motif, acteur.id, c.get("requestId")),
      creerInstructionAudit(c.env.DB, {
        utilisateur: acteur, action: "DEMANDE_APPROBATION_CREEE", entiteType: "DEMANDE_APPROBATION", entiteId: id,
        adresseIp: adresseIp(c.req.raw), donneesApres: JSON.stringify({ action: ACTION_EXCEPTION, ...parametres }), motif: corps.data.motif,
      }),
    ]);
  } catch {
    return c.json({ erreur: "Une demande identique est déjà ouverte." }, 409);
  }
  const creee = await chargerDemande(c.env.DB, id);
  return c.json(creee ? presenterDemande(creee) : { id }, 201);
});

routesExceptionsNominatives.post("/exceptions-nominatives/:id/approuver", async (c) =>
  approuverDemande(c, ACTION_EXCEPTION, await contexteComptes(c.env.DB)));
routesExceptionsNominatives.post("/exceptions-nominatives/:id/refuser", (c) => cloreDemande(c, "REFUSEE", ACTION_EXCEPTION));
routesExceptionsNominatives.post("/exceptions-nominatives/:id/annuler", (c) => cloreDemande(c, "ANNULEE", ACTION_EXCEPTION));

routesExceptionsNominatives.post("/exceptions-nominatives/:id/executer", async (c) => {
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id"));
  if (!ligne || ligne.action_code !== ACTION_EXCEPTION) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  if (ligne.demandeur_id !== acteur.id) return c.json({ erreur: "Seul le demandeur exécute une demande approuvée." }, 403);
  const empreinte = await empreinteDepuisLigne(ligne);
  const decision = evaluerExecution(versDemande(ligne), empreinte, { maintenant: new Date().toISOString(), proprietairesActifs: 0 });
  if (!decision.autorise) return c.json({ erreur: `Exécution refusée (${decision.motif}).` }, 409);
  const parametres = JSON.parse(ligne.parametres) as { route_cible?: unknown; duree_heures?: unknown; beneficiaire_id?: unknown };
  if (typeof parametres.route_cible !== "string" || !(ROUTES_NOMINATIVES as readonly string[]).includes(parametres.route_cible)
    || typeof parametres.duree_heures !== "number" || !Number.isInteger(parametres.duree_heures)
    || parametres.duree_heures < 1 || parametres.duree_heures > 24 || parametres.beneficiaire_id !== acteur.id) {
    return c.json({ erreur: "Les paramètres de la demande sont invalides." }, 409);
  }
  const idException = crypto.randomUUID();
  const resultats = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE demandes_approbation SET statut = 'EXECUTEE', execute_le = datetime('now')
      WHERE id = ? AND statut = 'APPROUVEE' AND expire_le > datetime('now') AND demandeur_id = ?`).bind(ligne.id, acteur.id),
    c.env.DB.prepare(`INSERT INTO exceptions_acces_nominatif (id, demande_id, beneficiaire_id, route_cible, finalite, accorde_par, accorde_le, expire_le)
      SELECT ?, d.id, d.demandeur_id, ?, d.motif, d.decide_par, datetime('now'), datetime('now', ?)
      FROM demandes_approbation d WHERE d.id = ? AND d.statut = 'EXECUTEE' AND d.decide_par IS NOT NULL`)
      .bind(idException, parametres.route_cible, `+${parametres.duree_heures} hours`, ligne.id),
    creerInstructionAudit(c.env.DB, {
      utilisateur: acteur, action: "EXCEPTION_ACCES_NOMINATIF_ACCORDEE", entiteType: "DEMANDE_APPROBATION", entiteId: ligne.id,
      adresseIp: adresseIp(c.req.raw),
      donneesApres: JSON.stringify({ exception_id: idException, route: parametres.route_cible, duree_heures: parametres.duree_heures }),
      motif: ligne.motif,
    }),
  ]);
  if ((resultats[0]?.meta.changes ?? 0) < 1 || (resultats[1]?.meta.changes ?? 0) < 1) {
    return c.json({ erreur: "La demande a changé depuis l’approbation: refaites une demande." }, 409);
  }
  const apres = await chargerDemande(c.env.DB, ligne.id);
  return c.json({ ...(apres ? presenterDemande(apres) : { id: ligne.id }), exception_id: idException });
});

export { routesExceptionsNominatives };
