import type { UtilisateurSession } from "../../bindings";
import { creerInstructionAudit } from "../../core/audit/service.ts";

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
): Promise<"ABSENT" | "DEJA_REVOQUE" | "REVOQUE"> {
  const requete = proprietaireAppareilId
    ? db.prepare("SELECT id, statut FROM appareils WHERE id = ? AND utilisateur_id = ?")
    : db.prepare("SELECT id, statut FROM appareils WHERE id = ?");
  const appareil = await (proprietaireAppareilId
    ? requete.bind(appareilId, proprietaireAppareilId)
    : requete.bind(appareilId)).first<{ id: string; statut: string }>();
  if (!appareil) return "ABSENT";
  if (appareil.statut === "REVOQUE") return "DEJA_REVOQUE";
  await db.batch([
    db.prepare(`UPDATE appareils SET statut = 'REVOQUE', revoque_le = datetime('now'), motif_revocation = ?
      WHERE id = ? AND statut <> 'REVOQUE'`).bind(motif, appareilId),
    db.prepare(`UPDATE sessions SET revoquee = 1, motif_revocation = 'APPAREIL_REVOQUE'
      WHERE appareil_id = ? AND revoquee = 0`).bind(appareilId),
    creerInstructionAudit(db, { utilisateur: acteur, action: "REVOCATION_APPAREIL", entiteType: "APPAREIL", entiteId: appareilId,
      adresseIp, requestId, motif, donneesAvant: JSON.stringify({ statut: appareil.statut }), donneesApres: JSON.stringify({ statut: "REVOQUE" }) }),
  ]);
  return "REVOQUE";
}
