import type { Context } from "hono";
import { z } from "zod";
import type { EnvironnementApplication } from "../bindings";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import {
  empreinteAction,
  evaluerApprobation,
  type DemandeApprobation,
} from "../core/approbation/politique-approbation.ts";
import { expirerDemandesApprobation } from "../services/expiration-approbations.service";
import { dechiffrerSecretTotp, verifierCodeTotp } from "../services/mfa.service";

/** Éléments communs aux routes d'approbation (console Plateforme et exceptions d'accès nominatif centrales). */

export type Contexte = Context<EnvironnementApplication>;

export const motifSchema = z.string().trim().min(10).max(500);

export interface LigneDemande {
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

export function adresseIp(requete: Request): string | null {
  return requete.headers.get("CF-Connecting-IP") ?? requete.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
}

export function versDemande(ligne: LigneDemande): DemandeApprobation {
  return {
    actionCode: ligne.action_code, cibleType: ligne.cible_type, cibleId: ligne.cible_id,
    empreinteAction: ligne.empreinte_action, demandeurId: ligne.demandeur_id, statut: ligne.statut,
    creeLe: ligne.cree_le, expireLe: ligne.expire_le,
  };
}

export function presenterDemande(ligne: LigneDemande): Record<string, unknown> {
  return {
    id: ligne.id, action: ligne.action_code, cible_type: ligne.cible_type, cible_id: ligne.cible_id,
    parametres: JSON.parse(ligne.parametres) as unknown, motif: ligne.motif, demandeur_id: ligne.demandeur_id,
    statut: ligne.statut, decide_par: ligne.decide_par, decide_le: ligne.decide_le, motif_decision: ligne.motif_decision,
    execute_le: ligne.execute_le, cree_le: ligne.cree_le, expire_le: ligne.expire_le,
  };
}

export async function lireCorps(c: Contexte): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    return null;
  }
}

export async function expirerDemandes(db: D1Database): Promise<void> {
  await expirerDemandesApprobation(db);
}

export async function compterComptesActifs(db: D1Database, role: "PROPRIETAIRE" | "ADMIN_CENTRAL"): Promise<number> {
  const ligne = await db.prepare("SELECT COUNT(*) AS total FROM utilisateurs WHERE role = ? AND statut = 'ACTIF'")
    .bind(role).first<{ total: number }>();
  return ligne?.total ?? 0;
}

export async function chargerDemande(db: D1Database, id: string): Promise<LigneDemande | null> {
  return db.prepare("SELECT * FROM demandes_approbation WHERE id = ?").bind(id).first<LigneDemande>();
}

export async function empreinteDepuisLigne(ligne: LigneDemande): Promise<string> {
  return empreinteAction({
    actionCode: ligne.action_code, cibleType: ligne.cible_type, cibleId: ligne.cible_id,
    parametres: JSON.parse(ligne.parametres) as Record<string, unknown>,
  });
}

/** Preuve MFA récente: code TOTP vérifié par le serveur contre le secret du compte; le compteur ne se rejoue pas. */
export async function verifierMfaRecente(c: Contexte, code: unknown): Promise<{ compteur: number } | null> {
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

/** Approbation: séparation des tâches, habilitation identique, MFA récente, expiration, usage unique. */
export async function approuverDemande(c: Contexte, actionAttendue: string, contexteComptes: {
  proprietairesActifs: number;
  administrateursCentrauxActifs: number;
}): Promise<Response> {
  const corps = z.object({ code_totp: z.string(), motif_decision: z.string().trim().max(500).optional() }).strict()
    .safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "La décision est invalide." }, 400);
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id") ?? "");
  if (!ligne || ligne.action_code !== actionAttendue) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  const mfa = await verifierMfaRecente(c, corps.data.code_totp);
  const decision = evaluerApprobation(versDemande(ligne), {
    id: acteur.id, role: acteur.role, actif: acteur.statut === "ACTIF",
    mfaVerifieeLe: mfa ? new Date().toISOString() : null,
  }, { maintenant: new Date().toISOString(), ...contexteComptes });
  if (!decision.autorise || !mfa) {
    return c.json({ erreur: `Approbation refusée (${decision.autorise ? "MFA_NON_RECENTE" : decision.motif}).` }, decision.motif === "MFA_NON_RECENTE" || decision.autorise ? 401 : 409);
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
}

/** Refus (autre approbateur) ou annulation (demandeur), toujours motivés et audités. */
export async function cloreDemande(c: Contexte, statutFinal: "REFUSEE" | "ANNULEE", actionAttendue: string): Promise<Response> {
  const corps = z.object({ motif_decision: motifSchema }).strict().safeParse(await lireCorps(c));
  if (!corps.success) return c.json({ erreur: "Un motif d’au moins 10 caractères est requis." }, 400);
  await expirerDemandes(c.env.DB);
  const ligne = await chargerDemande(c.env.DB, c.req.param("id") ?? "");
  if (!ligne || ligne.action_code !== actionAttendue) return c.json({ erreur: "Demande introuvable." }, 404);
  const acteur = c.get("utilisateur");
  if (ligne.statut !== "EN_ATTENTE") return c.json({ erreur: "Seule une demande en attente peut être close." }, 409);
  if (statutFinal === "ANNULEE" && ligne.demandeur_id !== acteur.id) return c.json({ erreur: "Seul le demandeur peut annuler." }, 403);
  if (statutFinal === "REFUSEE" && (ligne.demandeur_id === acteur.id || acteur.statut !== "ACTIF")) {
    return c.json({ erreur: "Le demandeur ne peut pas refuser sa propre demande." }, 403);
  }
  if (statutFinal === "REFUSEE" && acteur.role !== ligne.role_approbateur_requis) {
    return c.json({ erreur: "Votre rôle ne permet pas de refuser cette demande." }, 403);
  }
  const resultats = await c.env.DB.batch([
    statutFinal === "REFUSEE"
      ? c.env.DB.prepare(`UPDATE demandes_approbation SET statut = 'REFUSEE', decide_par = ?, decide_le = datetime('now'), motif_decision = ?
          WHERE id = ? AND statut = 'EN_ATTENTE'`).bind(acteur.id, corps.data.motif_decision, ligne.id)
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
