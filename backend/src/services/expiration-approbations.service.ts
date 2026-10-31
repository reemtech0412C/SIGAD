/**
 * Expiration des demandes d'approbation (D-17: validité 24 h). Exécutée à chaque lecture/décision et par la
 * tâche planifiée du Worker. Chaque expiration est journalisée avant le changement d'état, dans la même transaction.
 */

export const SQL_AUDIT_EXPIRATION_APPROBATIONS = `INSERT INTO journaux_audit
  (id, utilisateur_id, role_utilisateur, action, entite_type, entite_id, donnees_avant, donnees_apres, adresse_ip)
  SELECT lower(hex(randomblob(16))), d.demandeur_id, 'SYSTEME', 'DEMANDE_APPROBATION_EXPIREE', 'DEMANDE_APPROBATION', d.id,
         json_object('statut', d.statut), json_object('statut', 'EXPIREE'), NULL
  FROM demandes_approbation d
  WHERE d.statut IN ('EN_ATTENTE', 'APPROUVEE') AND d.expire_le <= datetime('now')`;

export const SQL_EXPIRER_APPROBATIONS = `UPDATE demandes_approbation SET statut = 'EXPIREE'
  WHERE statut IN ('EN_ATTENTE', 'APPROUVEE') AND expire_le <= datetime('now')`;

export async function expirerDemandesApprobation(db: D1Database): Promise<number> {
  const resultats = await db.batch([db.prepare(SQL_AUDIT_EXPIRATION_APPROBATIONS), db.prepare(SQL_EXPIRER_APPROBATIONS)]);
  return resultats[1]?.meta.changes ?? 0;
}
