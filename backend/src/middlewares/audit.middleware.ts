import type { UtilisateurSession } from "../bindings";

export interface EntreeAudit {
  utilisateur: UtilisateurSession;
  action: string;
  entiteType: string;
  entiteId: string;
  adresseIp: string | null;
  donneesAvant?: string | null;
  donneesApres?: string | null;
}

export function creerInstructionAudit(db: D1Database, entree: EntreeAudit): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO journaux_audit
       (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id,
        donnees_avant, donnees_apres, adresse_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      entree.utilisateur.id,
      entree.utilisateur.role,
      entree.utilisateur.province_id,
      entree.action,
      entree.entiteType,
      entree.entiteId,
      entree.donneesAvant ?? null,
      entree.donneesApres ?? null,
      entree.adresseIp,
    );
}
