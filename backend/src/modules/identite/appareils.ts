import type { UtilisateurSession } from "../../bindings";
import { creerInstructionAuditConditionnelle } from "../../core/audit/service.ts";

type ResultatTransitionAppareil = "ABSENT" | "ETAT_INVALIDE" | "APPROBATION_PROPRE_INTERDITE" | "CONFLIT" | "TRANSITIONNE" | "REVOQUE";
type ActionAppareil = "APPROBATION_APPAREIL" | "SUSPENSION_APPAREIL" | "REVOCATION_APPAREIL";

export async function listerAppareils(db: D1Database, utilisateurId?: string) {
  const filtre = utilisateurId ? "WHERE a.utilisateur_id = ?" : "";
  const requete = db.prepare(`SELECT a.id, a.utilisateur_id, u.identifiant, u.role, u.province_id,
      a.plateforme, a.nom, a.statut, a.cree_le, a.derniere_activite, a.autorise_le,
      a.revoque_le, a.motif_revocation,
      (SELECT COUNT(*) FROM sessions s WHERE s.appareil_id = a.id AND s.revoquee = 0
        AND s.expire_le > datetime('now')) AS sessions_actives
    FROM appareils a INNER JOIN utilisateurs u ON u.id = a.utilisateur_id ${filtre}
    ORDER BY a.cree_le DESC, a.id LIMIT 200`);
  const resultat = utilisateurId ? await requete.bind(utilisateurId).all() : await requete.all();
  return resultat.results;
}

export async function revoquerAppareil(
  db: D1Database,
  appareilId: string,
  acteur: UtilisateurSession,
  motif: string,
  adresseIp: string | null,
  requestId: string,
  proprietaireAppareilId?: string,
): Promise<ResultatTransitionAppareil> {
  const resultat = await transitionnerAppareil(db, appareilId, "REVOCATION_APPAREIL", acteur, motif, adresseIp, requestId,
    proprietaireAppareilId ? { proprietaireId: proprietaireAppareilId } : undefined);
  return resultat === "TRANSITIONNE" ? "REVOQUE" : resultat;
}

export async function approuverAppareil(
  db: D1Database,
  appareilId: string,
  acteur: UtilisateurSession,
  motif: string,
  adresseIp: string | null,
  requestId: string,
): Promise<ResultatTransitionAppareil> {
  return transitionnerAppareil(db, appareilId, "APPROBATION_APPAREIL", acteur, motif, adresseIp, requestId);
}

export async function suspendreAppareil(
  db: D1Database,
  appareilId: string,
  acteur: UtilisateurSession,
  motif: string,
  adresseIp: string | null,
  requestId: string,
): Promise<ResultatTransitionAppareil> {
  return transitionnerAppareil(db, appareilId, "SUSPENSION_APPAREIL", acteur, motif, adresseIp, requestId);
}

async function transitionnerAppareil(
  db: D1Database,
  appareilId: string,
  action: ActionAppareil,
  acteur: UtilisateurSession,
  motif: string,
  adresseIp: string | null,
  requestId: string,
  options?: { proprietaireId?: string },
): Promise<ResultatTransitionAppareil> {
  const appareil = await db.prepare(`SELECT id, utilisateur_id, statut FROM appareils WHERE id = ?${options?.proprietaireId ? " AND utilisateur_id = ?" : ""}`)
    .bind(...(options?.proprietaireId ? [appareilId, options.proprietaireId] : [appareilId]))
    .first<{ id: string; utilisateur_id: string; statut: string }>();
  if (!appareil) return "ABSENT";
  if (action === "APPROBATION_APPAREIL" && appareil.utilisateur_id === acteur.id) return "APPROBATION_PROPRE_INTERDITE";

  const statutCible = action === "APPROBATION_APPAREIL" ? "AUTORISE"
    : action === "SUSPENSION_APPAREIL" ? "SUSPENDU" : "REVOQUE";
  const statutAttendu = action === "APPROBATION_APPAREIL" ? "EN_ATTENTE"
    : action === "SUSPENSION_APPAREIL" ? "AUTORISE" : appareil.statut;
  if ((action === "APPROBATION_APPAREIL" && appareil.statut !== "EN_ATTENTE")
    || (action === "SUSPENSION_APPAREIL" && appareil.statut !== "AUTORISE")
    || (action === "REVOCATION_APPAREIL" && appareil.statut === "REVOQUE")) return "ETAT_INVALIDE";

  const miseAJour = action === "APPROBATION_APPAREIL"
    ? db.prepare(`UPDATE appareils SET statut = 'AUTORISE', autorise_par = ?, autorise_le = datetime('now')
        WHERE id = ? AND statut = 'EN_ATTENTE' AND utilisateur_id <> ?`).bind(acteur.id, appareilId, acteur.id)
    : action === "SUSPENSION_APPAREIL"
      ? db.prepare("UPDATE appareils SET statut = 'SUSPENDU' WHERE id = ? AND statut = 'AUTORISE'").bind(appareilId)
      : db.prepare(`UPDATE appareils SET statut = 'REVOQUE', revoque_le = datetime('now'), motif_revocation = ?
          WHERE id = ? AND statut = ? AND statut <> 'REVOQUE'`).bind(motif, appareilId, statutAttendu);

  const commandes = [
    miseAJour,
    creerInstructionAuditConditionnelle(db, {
      utilisateur: acteur,
      action,
      entiteType: "APPAREIL",
      entiteId: appareilId,
      adresseIp,
      requestId,
      motif,
      donneesAvant: JSON.stringify({ statut: appareil.statut }),
      donneesApres: JSON.stringify({ statut: statutCible }),
    }, "changes() = 1"),
    db.prepare(`UPDATE sessions SET revoquee = 1, motif_revocation = ?
      WHERE appareil_id = ? AND revoquee = 0
        AND EXISTS (SELECT 1 FROM appareils WHERE id = ? AND statut IN ('SUSPENDU', 'REVOQUE'))`)
      .bind(action === "SUSPENSION_APPAREIL" ? "APPAREIL_SUSPENDU" : "APPAREIL_REVOQUE", appareilId, appareilId),
  ];
  const resultats = await db.batch(commandes);
  return (resultats[0]?.meta.changes ?? 0) === 1 ? "TRANSITIONNE" : "CONFLIT";
}
