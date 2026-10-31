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
 * Console Plateforme (B3.2): drapeaux et demandes d'approbation à second approbateur (D-15..D-17).
 * Monté sous /api/proprietaire (authentification, CSRF et rôle PROPRIETAIRE déjà exigés). Une seule action de
 * classe A est exécutable ici: la bascule d'un drapeau à double contrôle.
 */
const routesPlateforme = new Hono<EnvironnementApplication>();

const ACTION_BASCULE = "BASCULER_DRAPEAU_AUTORISATION";
const schemaCodeDrapeau = z.string().regex(/^[a-z][a-z0-9_]{2,63}$/u);

interface LigneDrapeau {
  code: string;
  categorie: string;
  description: string;
  actif: number;
  double_controle: number;
  version: number;
  modifie_par: string | null;
  modifie_le: string;
}

routesPlateforme.get("/plateforme/drapeaux", async (c) => {
  const liste = await c.env.DB.prepare(`SELECT code, categorie, description, actif, double_controle, version, modifie_par, modifie_le
    FROM drapeaux_plateforme ORDER BY categorie, code`).all<LigneDrapeau>();
  return c.json({ donnees: liste.results.map((d) => ({ ...d, actif: d.actif === 1, double_controle: d.double_controle === 1 })) });
});

/** Bascule directe, réservée aux drapeaux de présentation à simple contrôle (motif et audit obligatoires). */
routesPlateforme.put("/plateforme/drapeaux/:code", async (c) => {
  const code = schemaCodeDrapeau.safeParse(c.req.param("code"));
  const corps = z.object({ actif: z.boolean(), motif: motifSchema }).strict().safeParse(await lireCorps(c));
  if (!code.success || !corps.success) return c.json({ erreur: "La demande de bascule est invalide." }, 400);
  const drapeau = await c.env.DB.prepare("SELECT * FROM drapeaux_plateforme WHERE code = ?").bind(code.data).first<LigneDrapeau>();
  if (!drapeau) return c.json({ erreur: "Drapeau inconnu." }, 404);
  if (drapeau.double_controle === 1) return c.json({ erreur: "Ce drapeau exige une demande d’approbation." }, 409);
  const acteur = c.get("utilisateur");
  const nouvelEtat = corps.data.actif ? 1 : 0;
  const resultats = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE drapeaux_plateforme SET actif = ?, version = version + 1, modifie_par = ?, modifie_le = datetime('now')
      WHERE code = ? AND double_controle = 0 AND version = ?`).bind(nouvelEtat, acteur.id, drapeau.code, drapeau.version),
    creerInstructionAudit(c.env.DB, {
      utilisateur: acteur, action: "BASCULE_DRAPEAU_SIMPLE", entiteType: "DRAPEAU", entiteId: drapeau.code,
      adresseIp: adresseIp(c.req.raw), donneesAvant: JSON.stringify({ actif: drapeau.actif === 1 }),
      donneesApres: JSON.stringify({ actif: corps.data.actif }), motif: corps.data.motif,
    }),
  ]);
  if ((resultats[0]?.meta.changes ?? 0) < 1) return c.json({ erreur: "Le drapeau a changé simultanément." }, 409);
  return c.json({ code: drapeau.code, actif: corps.data.actif });
});

routesPlateforme.get("/plateforme/approbations", async (c) => {
  await expirerDemandes(c.env.DB);
  const statut = c.req.query("statut");
  const valide = statut === undefined || ["EN_ATTENTE", "APPROUVEE", "REFUSEE", "EXPIREE", "EXECUTEE", "ANNULEE"].includes(statut);
  if (!valide) return c.json({ erreur: "Le filtre de statut est invalide." }, 400);
  const liste = await c.env.DB.prepare(`SELECT * FROM demandes_approbation WHERE action_code = ? AND (? IS NULL OR statut = ?)
    ORDER BY cree_le DESC, id LIMIT 100`).bind(ACTION_BASCULE, statut ?? null, statut ?? null).all<LigneDemande>();
  return c.json({ donnees: liste.results.map(presenterDemande) });
});

routesPlateforme.post("/plateforme/approbations", async (c) => {
  const corps = z.object({ drapeau_code: schemaCodeDrapeau, actif: z.boolean(), motif: motifSchema }).strict()
    .safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "La demande d’approbation est invalide." }, 400);
  await expirerDemandes(c.env.DB);
  const acteur = c.get("utilisateur");
  const recevable = evaluerCreationDemande(ACTION_BASCULE, { role: acteur.role, actif: acteur.statut === "ACTIF" }, {
    maintenant: new Date().toISOString(), proprietairesActifs: await compterComptesActifs(c.env.DB, "PROPRIETAIRE"),
  });
  if (!recevable.autorise) return c.json({ erreur: `Demande refusée (${recevable.motif}).` }, 409);
  const drapeau = await c.env.DB.prepare("SELECT * FROM drapeaux_plateforme WHERE code = ?")
    .bind(corps.data.drapeau_code).first<LigneDrapeau>();
  if (!drapeau) return c.json({ erreur: "Drapeau inconnu." }, 404);
  if (drapeau.double_controle !== 1) return c.json({ erreur: "Ce drapeau se bascule directement avec un motif." }, 409);
  if ((drapeau.actif === 1) === corps.data.actif) return c.json({ erreur: "Le drapeau est déjà dans cet état." }, 409);

  const parametres = { actif: corps.data.actif, version: drapeau.version };
  const empreinte = await empreinteAction({ actionCode: ACTION_BASCULE, cibleType: "DRAPEAU", cibleId: drapeau.code, parametres });
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO demandes_approbation
        (id, action_code, cible_type, cible_id, empreinte_action, parametres, motif, demandeur_id, role_approbateur_requis, request_id, cree_le, expire_le)
        VALUES (?, ?, 'DRAPEAU', ?, ?, ?, ?, ?, 'PROPRIETAIRE', ?, datetime('now'), datetime('now', '+24 hours'))`)
        .bind(id, ACTION_BASCULE, drapeau.code, empreinte, JSON.stringify(parametres), corps.data.motif, acteur.id, c.get("requestId")),
      creerInstructionAudit(c.env.DB, {
        utilisateur: acteur, action: "DEMANDE_APPROBATION_CREEE", entiteType: "DEMANDE_APPROBATION", entiteId: id,
        adresseIp: adresseIp(c.req.raw), donneesApres: JSON.stringify({ action: ACTION_BASCULE, drapeau: drapeau.code, ...parametres }),
        motif: corps.data.motif,
      }),
    ]);
  } catch {
    return c.json({ erreur: "Une demande identique est déjà ouverte." }, 409);
  }
  const creee = await chargerDemande(c.env.DB, id);
  return c.json(creee ? presenterDemande(creee) : { id }, 201);
});

routesPlateforme.post("/plateforme/approbations/:id/approuver", async (c) =>
  approuverDemande(c, ACTION_BASCULE, {
    proprietairesActifs: await compterComptesActifs(c.env.DB, "PROPRIETAIRE"), administrateursCentrauxActifs: 0,
  }));
routesPlateforme.post("/plateforme/approbations/:id/refuser", (c) => cloreDemande(c, "REFUSEE", ACTION_BASCULE));
routesPlateforme.post("/plateforme/approbations/:id/annuler", (c) => cloreDemande(c, "ANNULEE", ACTION_BASCULE));

routesPlateforme.post("/plateforme/approbations/:id/executer", async (c) => {
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id"));
  if (!ligne || ligne.action_code !== ACTION_BASCULE) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  if (ligne.demandeur_id !== acteur.id) return c.json({ erreur: "Seul le demandeur exécute une demande approuvée." }, 403);
  // L'empreinte est recalculée depuis l'action stockée: toute divergence avec celle approuvée bloque l'exécution.
  const empreinte = await empreinteDepuisLigne(ligne);
  const decision = evaluerExecution(versDemande(ligne), empreinte, { maintenant: new Date().toISOString(), proprietairesActifs: 0 });
  if (!decision.autorise) return c.json({ erreur: `Exécution refusée (${decision.motif}).` }, 409);
  const parametres = JSON.parse(ligne.parametres) as { actif?: unknown; version?: unknown };
  if (typeof parametres.actif !== "boolean" || typeof parametres.version !== "number") {
    return c.json({ erreur: "Les paramètres de la demande sont invalides." }, 409);
  }
  const resultats = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE demandes_approbation SET statut = 'EXECUTEE', execute_le = datetime('now')
      WHERE id = ? AND statut = 'APPROUVEE' AND expire_le > datetime('now') AND demandeur_id = ?
        AND EXISTS (SELECT 1 FROM drapeaux_plateforme WHERE code = ? AND version = ?)`).bind(ligne.id, acteur.id, ligne.cible_id, parametres.version),
    c.env.DB.prepare(`UPDATE drapeaux_plateforme SET actif = ?, version = version + 1, modifie_par = ?, modifie_le = datetime('now')
      WHERE code = ? AND version = ? AND EXISTS (SELECT 1 FROM demandes_approbation WHERE id = ? AND statut = 'EXECUTEE')`)
      .bind(parametres.actif ? 1 : 0, acteur.id, ligne.cible_id, parametres.version, ligne.id),
    creerInstructionAudit(c.env.DB, {
      utilisateur: acteur, action: "DEMANDE_APPROBATION_EXECUTEE", entiteType: "DEMANDE_APPROBATION", entiteId: ligne.id,
      adresseIp: adresseIp(c.req.raw), donneesApres: JSON.stringify({ drapeau: ligne.cible_id, actif: parametres.actif }),
      motif: ligne.motif,
    }),
  ]);
  if ((resultats[0]?.meta.changes ?? 0) < 1) {
    return c.json({ erreur: "La demande ou le drapeau a changé depuis l’approbation: refaites une demande." }, 409);
  }
  const apres = await chargerDemande(c.env.DB, ligne.id);
  return c.json(apres ? presenterDemande(apres) : { id: ligne.id });
});

export { routesPlateforme };
