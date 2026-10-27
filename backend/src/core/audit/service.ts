import type { UtilisateurSession } from "../../bindings";
import { obtenirRequestIdAudit } from "./contexte.ts";

export interface EntreeAudit {
  utilisateur: UtilisateurSession;
  action: string;
  entiteType: string;
  entiteId: string;
  adresseIp: string | null;
  requestId?: string | null;
  donneesAvant?: string | null;
  donneesApres?: string | null;
  motif?: string | null;
}

const colonnesAudit = `(id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id,
  donnees_avant, donnees_apres, adresse_ip, request_id, motif)`;

function valeursAudit(entree: EntreeAudit): unknown[] {
  return [
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
    entree.requestId ?? obtenirRequestIdAudit(entree.utilisateur),
    entree.motif ?? null,
  ];
}

function preparerInstructionAudit(
  db: D1Database,
  entree: EntreeAudit,
  conditionSql?: string,
  parametresCondition: unknown[] = [],
): D1PreparedStatement {
  const valeurs = valeursAudit(entree);
  const marqueurs = valeurs.map(() => "?").join(", ");
  const insertion = conditionSql
    ? `SELECT ${marqueurs} WHERE ${conditionSql}`
    : `VALUES (${marqueurs})`;
  return db
    .prepare(`INSERT INTO journaux_audit ${colonnesAudit} ${insertion}`)
    .bind(...valeurs, ...parametresCondition);
}

export function creerInstructionAudit(db: D1Database, entree: EntreeAudit): D1PreparedStatement {
  return preparerInstructionAudit(db, entree);
}

export function creerInstructionAuditConditionnelle(
  db: D1Database,
  entree: EntreeAudit,
  conditionSql: string,
  parametresCondition: unknown[] = [],
): D1PreparedStatement {
  return preparerInstructionAudit(db, entree, conditionSql, parametresCondition);
}

export function creerInstructionAuditInscriptionAppareil(
  db: D1Database,
  entree: EntreeAudit,
  defiId: string,
  appareilId: string,
): D1PreparedStatement {
  return preparerInstructionAudit(
    db,
    entree,
    "EXISTS (SELECT 1 FROM defis_appareils WHERE id = ? AND appareil_cree_id = ?)",
    [defiId, appareilId],
  );
}
