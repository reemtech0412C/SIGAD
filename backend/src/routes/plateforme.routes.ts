import { Hono, type Context } from "hono";
import { z } from "zod";
import type { EnvironnementApplication } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import {
  empreinteAction,
  evaluerApprobation,
  evaluerCreationDemande,
  evaluerExecution,
  type DemandeApprobation,
} from "../core/approbation/politique-approbation.ts";
import { dechiffrerSecretTotp, verifierCodeTotp } from "../services/mfa.service";

/**
 * Console Plateforme (B3.2): drapeaux et demandes d'approbation à second approbateur (D-15..D-17).
 * Monté sous /api/proprietaire (authentification, CSRF et rôle PROPRIETAIRE déjà exigés). Une seule action de
 * classe A est exécutable ici: la bascule d'un drapeau à double contrôle.
 */
const routesPlateforme = new Hono<EnvironnementApplication>();

const ACTION_BASCULE = "BASCULER_DRAPEAU_AUTORISATION";
const motifSchema = z.string().trim().min(10).max(500);
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

interface LigneDemande {
  id: string;
  action_code: string;
  cible_type: string;
  cible_id: string;
  empreinte_action: string;
  parametres: string;
  motif: string;
  demandeur_id: string;
  role_approbateur_requis: string;
  statut: DemandeApprobation["statut"];
  decide_par: string | null;
  decide_le: string | null;
  motif_decision: string | null;
  execute_le: string | null;
  cree_le: string;
  expire_le: string;
}

function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

function versDemande(ligne: LigneDemande): DemandeApprobation {
  return {
    actionCode: ligne.action_code, cibleType: ligne.cible_type, cibleId: ligne.cible_id,
    empreinteAction: ligne.empreinte_action, demandeurId: ligne.demandeur_id, statut: ligne.statut,
    creeLe: ligne.cree_le, expireLe: ligne.expire_le,
  };
}

function presenterDemande(ligne: LigneDemande): Record<string, unknown> {
  return {
    id: ligne.id, action: ligne.action_code, cible_type: ligne.cible_type, cible_id: ligne.cible_id,
    parametres: JSON.parse(ligne.parametres) as unknown, motif: ligne.motif, demandeur_id: ligne.demandeur_id,
    statut: ligne.statut, decide_par: ligne.decide_par, decide_le: ligne.decide_le, motif_decision: ligne.motif_decision,
    execute_le: ligne.execute_le, cree_le: ligne.cree_le, expire_le: ligne.expire_le,
  };
}

async function lireCorps(c: Context<EnvironnementApplication>): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    return null;
  }
}

async function expirerDemandes(db: D1Database): Promise<void> {
  await db.prepare(`UPDATE demandes_approbation SET statut = 'EXPIREE'
    WHERE statut IN ('EN_ATTENTE', 'APPROUVEE') AND expire_le <= datetime('now')`).run();
}

async function compterProprietairesActifs(db: D1Database): Promise<number> {
  const ligne = await db.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = 'PROPRIETAIRE' AND statut = 'ACTIF'")
    .first<{ total: number }>();
  return ligne?.total ?? 0;
}

async function chargerDemande(db: D1Database, id: string): Promise<LigneDemande | null> {
  return db.prepare("SELECT * FROM demandes_approbation WHERE id = ?").bind(id).first<LigneDemande>();
}

async function empreinteDepuisLigne(ligne: LigneDemande): Promise<string> {
  return empreinteAction({
    actionCode: ligne.action_code, cibleType: ligne.cible_type, cibleId: ligne.cible_id,
    parametres: JSON.parse(ligne.parametres) as Record<string, unknown>,
  });
}

/** Preuve MFA récente: code TOTP vérifié par le serveur contre le secret du compte; le compteur ne se rejoue pas. */
async function verifierMfaRecente(c: Context<EnvironnementApplication>, code: unknown): Promise<{ compteur: number } | null> {
  if (typeof code !== "string" || !/^\d{6}$/u.test(code) || !c.env.CLE_CHIFFREMENT_MFA) return null;
  const ligne = await c.env.DB.prepare("SELECT double_facteur_secret FROM utilisateurs WHERE id = ? AND double_facteur_actif = 1")
    .bind(c.get("utilisateur").id).first<{ double_facteur_secret: string | null }>();
  if (!ligne?.double_facteur_secret) return null;
  try {
    const secret = await dechiffrerSecretTotp(ligne.double_facteur_secret, c.env.CLE_CHIFFREMENT_MFA);
    const compteur = await verifierCodeTotp(secret, code);
    return compteur === null ? null : { compteur };
  } catch {
    return null;
  }
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
  const liste = await c.env.DB.prepare(`SELECT * FROM demandes_approbation WHERE (? IS NULL OR statut = ?)
    ORDER BY cree_le DESC, id LIMIT 100`).bind(statut ?? null, statut ?? null).all<LigneDemande>();
  return c.json({ donnees: liste.results.map(presenterDemande) });
});

routesPlateforme.post("/plateforme/approbations", async (c) => {
  const corps = z.object({ drapeau_code: schemaCodeDrapeau, actif: z.boolean(), motif: motifSchema }).strict()
    .safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "La demande d’approbation est invalide." }, 400);
  await expirerDemandes(c.env.DB);
  const acteur = c.get("utilisateur");
  const recevable = evaluerCreationDemande(ACTION_BASCULE, { role: acteur.role, actif: acteur.statut === "ACTIF" }, {
    maintenant: new Date().toISOString(), proprietairesActifs: await compterProprietairesActifs(c.env.DB),
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

routesPlateforme.post("/plateforme/approbations/:id/approuver", async (c) => {
  const corps = z.object({ code_totp: z.string(), motif_decision: z.string().trim().max(500).optional() }).strict()
    .safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "La décision est invalide." }, 400);
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id"));
  if (!ligne) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  const mfa = await verifierMfaRecente(c, corps.data.code_totp);
  const decision = evaluerApprobation(versDemande(ligne), {
    id: acteur.id, role: acteur.role, actif: acteur.statut === "ACTIF",
    mfaVerifieeLe: mfa ? new Date().toISOString() : null,
  }, { maintenant: new Date().toISOString(), proprietairesActifs: await compterProprietairesActifs(c.env.DB) });
  if (!decision.autorise || !mfa) {
    return c.json({ erreur: `Approbation refusée (${decision.autorise ? "MFA_NON_RECENTE" : decision.motif}).` }, decision.motif === "MFA_NON_RECENTE" ? 401 : 409);
  }
  try {
    const resultats = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE demandes_approbation SET statut = 'APPROUVEE', decide_par = ?, decide_le = datetime('now'), motif_decision = ?
        WHERE id = ? AND statut = 'EN_ATTENTE' AND expire_le > datetime('now')`).bind(acteur.id, corps.data.motif_decision ?? null, ligne.id),
      c.env.DB.prepare("INSERT INTO compteurs_totp_utilises (utilisateur_id, compteur, operation_id) VALUES (?, ?, ?)")
        .bind(acteur.id, mfa.compteur, crypto.randomUUID()),
      creerInstructionAudit(c.env.DB, {
        utilisateur: acteur, action: "DEMANDE_APPROBATION_APPROUVEE", entiteType: "DEMANDE_APPROBATION", entiteId: ligne.id,
        adresseIp: adresseIp(c.req.raw), motif: corps.data.motif_decision ?? null,
      }),
    ]);
    if ((resultats[0]?.meta.changes ?? 0) < 1) return c.json({ erreur: "La demande a changé simultanément." }, 409);
  } catch {
    return c.json({ erreur: "L’approbation a été refusée (code déjà utilisé ou règle d’intégrité)." }, 409);
  }
  const apres = await chargerDemande(c.env.DB, ligne.id);
  return c.json(apres ? presenterDemande(apres) : { id: ligne.id });
});

async function cloreDemande(c: Context<EnvironnementApplication>, statutFinal: "REFUSEE" | "ANNULEE"): Promise<Response> {
  const corps = z.object({ motif_decision: motifSchema }).strict().safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "Un motif d’au moins 10 caractères est requis." }, 400);
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id") ?? "");
  if (!ligne) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  if (ligne.statut !== "EN_ATTENTE") return c.json({ erreur: "Seule une demande en attente peut être close." }, 409);
  // Annuler: le demandeur seulement. Refuser: un autre propriétaire (jamais le demandeur ni la cible).
  if (statutFinal === "ANNULEE" && ligne.demandeur_id !== acteur.id) return c.json({ erreur: "Seul le demandeur peut annuler." }, 403);
  if (statutFinal === "REFUSEE" && (ligne.demandeur_id === acteur.id || acteur.statut !== "ACTIF")) {
    return c.json({ erreur: "Le demandeur ne peut pas refuser sa propre demande." }, 403);
  }
  const decideur = statutFinal === "REFUSEE" ? acteur.id : null;
  const resultats = await c.env.DB.batch([
    statutFinal === "REFUSEE"
      ? c.env.DB.prepare(`UPDATE demandes_approbation SET statut = 'REFUSEE', decide_par = ?, decide_le = datetime('now'), motif_decision = ?
          WHERE id = ? AND statut = 'EN_ATTENTE'`).bind(decideur, corps.data.motif_decision, ligne.id)
      : c.env.DB.prepare(`UPDATE demandes_approbation SET statut = 'ANNULEE', motif_decision = ?
          WHERE id = ? AND statut = 'EN_ATTENTE' AND demandeur_id = ?`).bind(corps.data.motif_decision, ligne.id, acteur.id),
    creerInstructionAudit(c.env.DB, {
      utilisateur: acteur, action: statutFinal === "REFUSEE" ? "DEMANDE_APPROBATION_REFUSEE" : "DEMANDE_APPROBATION_ANNULEE",
      entiteType: "DEMANDE_APPROBATION", entiteId: ligne.id, adresseIp: adresseIp(c.req.raw), motif: corps.data.motif_decision,
    }),
  ]);
  if ((resultats[0]?.meta.changes ?? 0) < 1) return c.json({ erreur: "La demande a changé simultanément." }, 409);
  const apres = await chargerDemande(c.env.DB, ligne.id);
  return c.json(apres ? presenterDemande(apres) : { id: ligne.id });
}

routesPlateforme.post("/plateforme/approbations/:id/refuser", (c) => cloreDemande(c, "REFUSEE"));
routesPlateforme.post("/plateforme/approbations/:id/annuler", (c) => cloreDemande(c, "ANNULEE"));

routesPlateforme.post("/plateforme/approbations/:id/executer", async (c) => {
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id"));
  if (!ligne) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  if (ligne.demandeur_id !== acteur.id) return c.json({ erreur: "Seul le demandeur exécute une demande approuvée." }, 403);
  if (ligne.action_code !== ACTION_BASCULE) return c.json({ erreur: "Cette action n’est pas exécutable ici." }, 501);
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
