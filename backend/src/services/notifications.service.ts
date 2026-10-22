import type { UtilisateurSession } from "../bindings.ts";
import { ErreurStock } from "./stock.service.ts";
import type { FiltresNotifications } from "../../../shared/validations/controle.ts";

export interface NotificationDestinataire {
  utilisateurId?: string | null;
  provinceId?: string | null;
  role?: "PROPRIETAIRE" | "ADMIN_CENTRAL" | "DELEGUE_PROVINCIAL" | null;
}

export function creerInstructionNotification(
  db: D1Database,
  destinataire: NotificationDestinataire,
  titre: string,
  message: string,
  typeAlerte: "INFO" | "ACTION_REQUISE" | "ALERTE_STOCK" | "DEMANDE_CORRECTION" | "CLOTURE",
  lienCible: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO notifications
      (id, destinataire_utilisateur_id, destinataire_province_id, destinataire_role,
       titre, message, type_alerte, lien_cible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), destinataire.utilisateurId ?? null, destinataire.provinceId ?? null,
    destinataire.role ?? null, titre, message, typeAlerte, lienCible,
  );
}

function conditionDestinataire(utilisateur: UtilisateurSession): { sql: string; valeurs: (string | null)[] } {
  const clauses = ["n.destinataire_utilisateur_id = ?"];
  const valeurs: (string | null)[] = [utilisateur.id];
  if (utilisateur.province_id) {
    clauses.push(`(n.destinataire_utilisateur_id IS NULL AND n.destinataire_province_id = ?
      AND (n.destinataire_role IS NULL OR n.destinataire_role = ?))`);
    valeurs.push(utilisateur.province_id, utilisateur.role);
  }
  clauses.push(`(n.destinataire_utilisateur_id IS NULL AND n.destinataire_province_id IS NULL
    AND n.destinataire_role = ?)`);
  valeurs.push(utilisateur.role);
  return { sql: `(${clauses.join(" OR ")})`, valeurs };
}

export async function listerNotifications(
  db: D1Database,
  utilisateur: UtilisateurSession,
  filtres: FiltresNotifications,
) {
  const destinataire = conditionDestinataire(utilisateur);
  const conditions = [destinataire.sql];
  const valeurs: (string | number | null)[] = [...destinataire.valeurs];
  if (filtres.lue !== undefined) {
    conditions.push("n.lue = ?");
    valeurs.push(filtres.lue ? 1 : 0);
  }
  if (filtres.type_alerte) {
    conditions.push("n.type_alerte = ?");
    valeurs.push(filtres.type_alerte);
  }
  const where = conditions.join(" AND ");
  const [liste, total, nonLues] = await Promise.all([
    db.prepare(
      `SELECT n.id, n.titre, n.message, n.type_alerte, n.lien_cible, n.lue, n.cree_le
       FROM notifications n WHERE ${where}
       ORDER BY n.cree_le DESC, n.id DESC LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM notifications n WHERE ${where}`)
      .bind(...valeurs).first<{ total: number }>(),
    db.prepare(`SELECT COUNT(*) AS total FROM notifications n WHERE ${destinataire.sql} AND n.lue = 0`)
      .bind(...destinataire.valeurs).first<{ total: number }>(),
  ]);
  return {
    elements: liste.results,
    total: total?.total ?? 0,
    non_lues: nonLues?.total ?? 0,
    limite: filtres.limite,
    decalage: filtres.decalage,
  };
}

export async function marquerNotificationLue(
  db: D1Database,
  utilisateur: UtilisateurSession,
  notificationId: string,
) {
  const destinataire = conditionDestinataire(utilisateur);
  const resultat = await db.prepare(
    `UPDATE notifications AS n SET lue = 1
     WHERE n.id = ? AND n.lue = 0 AND ${destinataire.sql}`,
  ).bind(notificationId, ...destinataire.valeurs).run();
  if (resultat.meta.changes === 0) {
    const existante = await db.prepare(
      `SELECT n.lue FROM notifications n WHERE n.id = ? AND ${destinataire.sql}`,
    ).bind(notificationId, ...destinataire.valeurs).first<{ lue: number }>();
    if (!existante) throw new ErreurStock("La notification est introuvable dans votre périmètre.", 404);
  }
  return { id: notificationId, lue: true };
}

export async function marquerToutesNotificationsLues(db: D1Database, utilisateur: UtilisateurSession) {
  const destinataire = conditionDestinataire(utilisateur);
  const resultat = await db.prepare(
    `UPDATE notifications AS n SET lue = 1 WHERE n.lue = 0 AND ${destinataire.sql}`,
  ).bind(...destinataire.valeurs).run();
  return { nombre_marque: resultat.meta.changes };
}
