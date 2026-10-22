import type { UtilisateurSession } from "../bindings.ts";
import { creerInstructionAudit } from "../middlewares/audit.middleware.ts";
import type {
  FiltresAudit,
  FiltresControle,
  FiltresCorrections,
  FiltresObservations,
} from "../../../shared/validations/controle.ts";
import {
  executerOperationIdempotente,
  rejouerOperationIdempotente,
  ErreurStock,
  type EcritureCritique,
} from "./stock.service.ts";
import { creerInstructionNotification } from "./notifications.service.ts";

type Base = D1Database;
type TypeOperation = "APPROVISIONNEMENT_CENTRAL" | "DISTRIBUTION_PROVINCIALE" | "STOCK_PROVINCIAL";
type StatutObservation = "OUVERTE" | "TRAITEE" | "CLASSEE";

const SQL_OPERATIONS = `WITH operations AS (
  SELECT a.id, 'APPROVISIONNEMENT_CENTRAL' AS type_operation, a.reference,
    a.intitule_operation AS intitule, a.statut, a.date_creation AS date_operation,
    dp.province_id, p.nom AS province_nom, a.partenaire_id,
    NULL AS partenaire_execution_id, pa.nom AS partenaire_nom, NULL AS partenaire_execution_nom,
    a.nature_aide, a.source_articles AS categorie
  FROM approvisionnements_centraux a
  LEFT JOIN destinations_approvisionnement dp ON dp.approvisionnement_id = a.id
  LEFT JOIN provinces p ON p.id = dp.province_id
  LEFT JOIN partenaires pa ON pa.id = a.partenaire_id
  UNION ALL
  SELECT d.id, 'DISTRIBUTION_PROVINCIALE', d.reference_distribution,
    d.intitule_distribution, d.statut, d.date_prevue, d.province_id, p.nom,
    d.bailleur_fonds_id, d.partenaire_execution_id, pb.nom, pe.nom,
    d.nature_aide, d.nature_aide
  FROM distributions_provinciales d
  INNER JOIN provinces p ON p.id = d.province_id
  LEFT JOIN partenaires pb ON pb.id = d.bailleur_fonds_id
  LEFT JOIN partenaires pe ON pe.id = d.partenaire_execution_id
  UNION ALL
  SELECT m.id, 'STOCK_PROVINCIAL', m.reference_mouvement, m.motif,
    m.type_mouvement, substr(m.cree_le, 1, 10), m.province_id, p.nom,
    NULL, NULL, NULL, NULL, a.nature_aide, m.type_mouvement
  FROM mouvements_stock m
  INNER JOIN provinces p ON p.id = m.province_id
  INNER JOIN articles a ON a.id = m.article_id
  WHERE m.province_id IS NOT NULL
)`;

function exigerRole(
  utilisateur: UtilisateurSession,
  roles: readonly UtilisateurSession["role"][],
  message = "Accès refusé pour cette opération.",
): void {
  if (!roles.includes(utilisateur.role)) throw new ErreurStock(message, 403);
}

function dateConditions(
  alias: string,
  debut: string | undefined,
  fin: string | undefined,
  conditions: string[],
  valeurs: (string | number)[],
): void {
  if (debut) { conditions.push(`${alias} >= ?`); valeurs.push(debut); }
  if (fin) { conditions.push(`${alias} <= ?`); valeurs.push(fin); }
}

export async function listerOperationsControle(db: Base, utilisateur: UtilisateurSession, filtres: FiltresControle) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
  const conditions: string[] = [];
  const valeurs: (string | number)[] = [];
  if (filtres.type_operation) { conditions.push("o.type_operation = ?"); valeurs.push(filtres.type_operation); }
  if (filtres.province_id) { conditions.push("o.province_id = ?"); valeurs.push(filtres.province_id); }
  if (filtres.statut) { conditions.push("o.statut = ?"); valeurs.push(filtres.statut); }
  if (filtres.partenaire_id) {
    conditions.push("(o.partenaire_id = ? OR o.partenaire_execution_id = ?)");
    valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
  }
  if (filtres.recherche) {
    conditions.push("(o.reference LIKE ? OR o.intitule LIKE ? OR o.province_nom LIKE ? OR o.partenaire_nom LIKE ? OR o.partenaire_execution_nom LIKE ?)");
    const terme = `%${filtres.recherche}%`;
    valeurs.push(terme, terme, terme, terme, terme);
  }
  dateConditions("o.date_operation", filtres.date_debut, filtres.date_fin, conditions, valeurs);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [liste, total] = await Promise.all([
    db.prepare(
      `${SQL_OPERATIONS}
       SELECT o.id, o.type_operation, o.reference, o.intitule, o.statut, o.date_operation,
         o.province_id, o.province_nom, o.partenaire_id, o.partenaire_nom,
         o.partenaire_execution_id, o.partenaire_execution_nom, o.nature_aide, o.categorie
       FROM operations o ${where}
       ORDER BY o.date_operation DESC, o.type_operation, o.reference, o.id
       LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`${SQL_OPERATIONS} SELECT COUNT(*) AS total FROM operations o ${where}`)
      .bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}

export async function lireSyntheseControle(db: Base, utilisateur: UtilisateurSession, filtres: FiltresControle) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
  const conditions: string[] = ["o.type_operation <> 'STOCK_PROVINCIAL'"];
  const valeurs: (string | number)[] = [];
  if (filtres.type_operation) { conditions.push("o.type_operation = ?"); valeurs.push(filtres.type_operation); }
  if (filtres.province_id) { conditions.push("o.province_id = ?"); valeurs.push(filtres.province_id); }
  if (filtres.statut) { conditions.push("o.statut = ?"); valeurs.push(filtres.statut); }
  if (filtres.partenaire_id) {
    conditions.push("(o.partenaire_id = ? OR o.partenaire_execution_id = ?)");
    valeurs.push(filtres.partenaire_id, filtres.partenaire_id);
  }
  if (filtres.recherche) {
    conditions.push("(o.reference LIKE ? OR o.intitule LIKE ? OR o.province_nom LIKE ? OR o.partenaire_nom LIKE ? OR o.partenaire_execution_nom LIKE ?)");
    const terme = `%${filtres.recherche}%`;
    valeurs.push(terme, terme, terme, terme, terme);
  }
  dateConditions("o.date_operation", filtres.date_debut, filtres.date_fin, conditions, valeurs);
  const where = conditions.join(" AND ");
  const [operations, observations, corrections] = await Promise.all([
    db.prepare(
      `${SQL_OPERATIONS} SELECT
        COUNT(DISTINCT CASE WHEN o.statut NOT IN ('CLOTUREE', 'CLOTUREE_CENTRAL', 'TERMINEE_PROVINCE') THEN o.type_operation || ':' || o.id END) AS operations_en_cours,
        COUNT(DISTINCT CASE WHEN o.statut IN ('CLOTUREE', 'CLOTUREE_CENTRAL') THEN o.type_operation || ':' || o.id END) AS operations_terminees,
        COUNT(DISTINCT CASE WHEN o.type_operation = 'DISTRIBUTION_PROVINCIALE' AND o.statut = 'TERMINEE_PROVINCE' THEN o.id END) AS distributions_a_cloturer,
        COUNT(DISTINCT CASE WHEN o.type_operation = 'APPROVISIONNEMENT_CENTRAL' AND o.statut = 'EN_RAPPROCHEMENT' THEN o.id END) AS approvisionnements_avec_ecarts
       FROM operations o WHERE ${where}`,
    ).bind(...valeurs).first<Record<string, number>>(),
    db.prepare(
      `SELECT COUNT(*) AS total FROM observations_controle o
       WHERE o.statut = 'OUVERTE'
         AND (? IS NULL OR o.province_id = ?)
         AND (? IS NULL OR o.operation_type = ?)
         AND (? IS NULL OR date(o.cree_le) >= ?)
         AND (? IS NULL OR date(o.cree_le) <= ?)`,
    ).bind(
      filtres.province_id ?? null, filtres.province_id ?? null,
      filtres.type_operation ?? null, filtres.type_operation ?? null,
      filtres.date_debut ?? null, filtres.date_debut ?? null,
      filtres.date_fin ?? null, filtres.date_fin ?? null,
    ).first<{ total: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS total FROM demandes_correction dc
       WHERE dc.statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE')
         AND (? IS NULL OR dc.province_id = ?)
         AND (? IS NULL OR date(dc.cree_le) >= ?)
         AND (? IS NULL OR date(dc.cree_le) <= ?)`
    ).bind(
      filtres.province_id ?? null, filtres.province_id ?? null,
      filtres.date_debut ?? null, filtres.date_debut ?? null,
      filtres.date_fin ?? null, filtres.date_fin ?? null,
    ).first<{ total: number }>(),
  ]);
  return {
    operations_en_cours: operations?.operations_en_cours ?? 0,
    operations_terminees: operations?.operations_terminees ?? 0,
    distributions_a_cloturer: operations?.distributions_a_cloturer ?? 0,
    approvisionnements_avec_ecarts: operations?.approvisionnements_avec_ecarts ?? 0,
    observations_ouvertes: observations?.total ?? 0,
    demandes_correction_ouvertes: corrections?.total ?? 0,
  };
}

function conditionsObservations(
  utilisateur: UtilisateurSession,
  filtres: FiltresObservations,
): { conditions: string[]; valeurs: (string | number)[] } {
  const conditions: string[] = [];
  const valeurs: (string | number)[] = [];
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || (filtres.province_id && filtres.province_id !== utilisateur.province_id)) {
      throw new ErreurStock("Accès refusé hors de votre province.", 403);
    }
    conditions.push("o.province_id = ?");
    valeurs.push(utilisateur.province_id);
  } else {
    exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
    if (filtres.province_id) { conditions.push("o.province_id = ?"); valeurs.push(filtres.province_id); }
  }
  if (filtres.statut) { conditions.push("o.statut = ?"); valeurs.push(filtres.statut); }
  if (filtres.niveau_gravite) { conditions.push("o.niveau_gravite = ?"); valeurs.push(filtres.niveau_gravite); }
  if (filtres.operation_type) { conditions.push("o.operation_type = ?"); valeurs.push(filtres.operation_type); }
  dateConditions("date(o.cree_le)", filtres.date_debut, filtres.date_fin, conditions, valeurs);
  return { conditions, valeurs };
}

export async function listerObservationsControle(
  db: Base,
  utilisateur: UtilisateurSession,
  filtres: FiltresObservations,
) {
  const { conditions, valeurs } = conditionsObservations(utilisateur, filtres);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [liste, total] = await Promise.all([
    db.prepare(
      `SELECT o.id, o.operation_type, o.operation_id, o.province_id, p.nom AS province_nom,
         o.niveau_gravite, o.observation, o.auteur_central_id, u.nom_complet AS auteur_central,
         o.reponse_delegue, o.date_reponse, o.statut, o.cree_le
       FROM observations_controle o
       INNER JOIN provinces p ON p.id = o.province_id
       INNER JOIN utilisateurs u ON u.id = o.auteur_central_id
       ${where} ORDER BY o.cree_le DESC, o.id DESC LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM observations_controle o ${where}`)
      .bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}

async function provinceOperation(
  db: Base,
  type: TypeOperation,
  id: string,
  provinceDemandee?: string,
): Promise<{ province_id: string; reference: string }> {
  const requete = type === "DISTRIBUTION_PROVINCIALE"
    ? db.prepare("SELECT province_id, reference_distribution AS reference FROM distributions_provinciales WHERE id = ?").bind(id)
    : type === "APPROVISIONNEMENT_CENTRAL"
      ? db.prepare(
        `SELECT p.id AS province_id, a.reference FROM approvisionnements_centraux a
         INNER JOIN destinations_approvisionnement d ON d.approvisionnement_id = a.id
         INNER JOIN provinces p ON p.id = d.province_id WHERE a.id = ?
           AND (? IS NULL OR p.id = ?) GROUP BY p.id, a.reference`,
      ).bind(id, provinceDemandee ?? null, provinceDemandee ?? null)
      : db.prepare(
        `SELECT m.province_id, m.reference_mouvement AS reference FROM mouvements_stock m
         INNER JOIN entrepots e ON e.id = m.entrepot_id AND e.niveau = 'PROVINCIAL'
           AND e.province_id = m.province_id
         WHERE m.id = ? AND m.province_id IS NOT NULL`,
      ).bind(id);
  const resultats = await requete.all<{ province_id: string; reference: string }>();
  if (resultats.results.length === 0) throw new ErreurStock("L’opération n’existe pas ou ne possède aucune destination provinciale.", 404);
  if (type === "APPROVISIONNEMENT_CENTRAL" && resultats.results.length > 1) {
    throw new ErreurStock("Une observation d’approvisionnement doit viser une destination provinciale précise.", 400);
  }
  const operation = resultats.results[0];
  if (!operation) throw new ErreurStock("Opération introuvable.", 404);
  return operation;
}

export async function creerObservationControle(
  db: Base,
  utilisateur: UtilisateurSession,
  entree: { operation_type: TypeOperation; operation_id: string; province_id?: string; niveau_gravite: "INFO" | "AVERTISSEMENT" | "CRITIQUE"; observation: string },
  cle: string,
  adresseIp: string | null,
) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
  const routeApi = "/api/central/controle/observations";
  const rejouee = await rejouerOperationIdempotente<{ id: string; province_id: string; statut: StatutObservation }>({
    db, utilisateur, routeApi, cle, chargeUtile: entree,
  });
  if (rejouee) return rejouee;
  const operation = await provinceOperation(db, entree.operation_type, entree.operation_id, entree.province_id);
  const id = crypto.randomUUID();
  const corps = { id, province_id: operation.province_id, statut: "OUVERTE" as const };
  const instructions: EcritureCritique[] = [
    {
      operation: "la création de l’observation de contrôle",
      instruction: db.prepare(
        `INSERT INTO observations_controle
          (id, operation_type, operation_id, province_id, niveau_gravite, observation, auteur_central_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, entree.operation_type, entree.operation_id, operation.province_id,
        entree.niveau_gravite, entree.observation, utilisateur.id),
    },
    {
      operation: "la notification de la délégation provinciale",
      instruction: creerInstructionNotification(db,
        { provinceId: operation.province_id, role: "DELEGUE_PROVINCIAL" },
        "Nouvelle observation de contrôle",
        `Une observation ${entree.niveau_gravite.toLowerCase()} est ouverte pour l’opération ${operation.reference}.`,
        entree.niveau_gravite === "CRITIQUE" ? "ACTION_REQUISE" : "INFO",
        "/controle/observations",
      ),
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: creerInstructionAudit(db, {
        utilisateur, action: "CREATION_OBSERVATION_CONTROLE", entiteType: "OBSERVATION_CONTROLE",
        entiteId: id, adresseIp,
        donneesApres: JSON.stringify({ operation_type: entree.operation_type, operation_id: entree.operation_id,
          province_id: operation.province_id, niveau_gravite: entree.niveau_gravite }),
      }),
    },
  ];
  return executerOperationIdempotente({ db, utilisateur, routeApi, cle, chargeUtile: entree, statutHttp: 201, corps, instructions });
}

export async function repondreObservationControle(
  db: Base,
  utilisateur: UtilisateurSession,
  observationId: string,
  reponse: string,
  cle: string,
  adresseIp: string | null,
) {
  exigerRole(utilisateur, ["DELEGUE_PROVINCIAL"]);
  const provinceId = utilisateur.province_id;
  if (!provinceId) throw new ErreurStock("La session ne contient aucune province.", 403);
  const routeApi = `/api/provincial/observations/${observationId}/reponse`;
  const chargeUtile = { observation_id: observationId, reponse_delegue: reponse };
  const rejouee = await rejouerOperationIdempotente<{ id: string; statut: "OUVERTE" }>({ db, utilisateur, routeApi, cle, chargeUtile });
  if (rejouee) return rejouee;
  const observation = await db.prepare(
    `SELECT id, province_id, niveau_gravite, operation_type, operation_id
     FROM observations_controle WHERE id = ? AND province_id = ? AND statut = 'OUVERTE'
       AND reponse_delegue IS NULL`,
  ).bind(observationId, provinceId).first<{
    id: string; province_id: string; niveau_gravite: string; operation_type: string; operation_id: string;
  }>();
  if (!observation) throw new ErreurStock("L’observation est introuvable, déjà traitée ou située hors de votre province.", 404);
  const corps = { id: observationId, statut: "OUVERTE" as const };
  const instructions: EcritureCritique[] = [
    {
      operation: "l’enregistrement de la réponse provinciale",
      instruction: db.prepare(
        `UPDATE observations_controle SET reponse_delegue = ?, date_reponse = datetime('now')
         WHERE id = ? AND province_id = ? AND statut = 'OUVERTE' AND reponse_delegue IS NULL`,
      ).bind(reponse, observationId, provinceId),
    },
    {
      operation: "la notification à l’administration centrale",
      instruction: creerInstructionNotification(db, { role: "ADMIN_CENTRAL" },
        "Réponse provinciale à une observation",
        `La délégation de votre province a répondu à une observation de contrôle.`,
        "ACTION_REQUISE", "/controle/observations"),
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: creerInstructionAudit(db, {
        utilisateur, action: "REPONSE_OBSERVATION_CONTROLE", entiteType: "OBSERVATION_CONTROLE",
        entiteId: observationId, adresseIp,
        donneesApres: JSON.stringify({ operation_type: observation.operation_type,
          operation_id: observation.operation_id, niveau_gravite: observation.niveau_gravite }),
      }),
    },
  ];
  return executerOperationIdempotente({ db, utilisateur, routeApi, cle, chargeUtile, statutHttp: 200, corps, instructions });
}

export async function cloturerObservationControle(
  db: Base,
  utilisateur: UtilisateurSession,
  observationId: string,
  statut: "TRAITEE" | "CLASSEE",
  decision: string,
  cle: string,
  adresseIp: string | null,
) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
  const routeApi = `/api/central/controle/observations/${observationId}/cloture`;
  const chargeUtile = { observation_id: observationId, statut, decision };
  const rejouee = await rejouerOperationIdempotente<{ id: string; statut: "TRAITEE" | "CLASSEE" }>({ db, utilisateur, routeApi, cle, chargeUtile });
  if (rejouee) return rejouee;
  const observation = await db.prepare(
    `SELECT id, province_id, operation_type, operation_id, niveau_gravite, observation,
       reponse_delegue FROM observations_controle WHERE id = ? AND statut = 'OUVERTE'`,
  ).bind(observationId).first<Record<string, string | null>>();
  if (!observation) throw new ErreurStock("L’observation est introuvable ou déjà clôturée.", 404);
  if (!observation.reponse_delegue) throw new ErreurStock("La réponse de la délégation doit être examinée avant de clôturer l’observation.", 409);
  const corps = { id: observationId, statut };
  const instructions: EcritureCritique[] = [
    {
      operation: "la clôture de l’observation après contrôle de la réponse",
      instruction: db.prepare(
        `UPDATE observations_controle SET statut = ?
         WHERE id = ? AND statut = 'OUVERTE' AND reponse_delegue IS NOT NULL`,
      ).bind(statut, observationId),
    },
    {
      operation: "la notification de la décision de contrôle",
      instruction: creerInstructionNotification(db,
        { provinceId: observation.province_id ?? null, role: "DELEGUE_PROVINCIAL" },
        "Observation de contrôle clôturée", `La réponse à l’observation ${observationId} a été examinée.`,
        "INFO", "/controle/observations"),
    },
    {
      operation: "l’écriture du journal d’audit",
      instruction: creerInstructionAudit(db, {
        utilisateur, action: "CLOTURE_OBSERVATION_CONTROLE", entiteType: "OBSERVATION_CONTROLE",
        entiteId: observationId, adresseIp,
        donneesAvant: JSON.stringify({ statut: "OUVERTE" }),
        donneesApres: JSON.stringify({ statut, decision, operation_type: observation.operation_type,
          operation_id: observation.operation_id, niveau_gravite: observation.niveau_gravite }),
      }),
    },
  ];
  return executerOperationIdempotente({ db, utilisateur, routeApi, cle, chargeUtile, statutHttp: 200, corps, instructions });
}

function conditionsCorrections(utilisateur: UtilisateurSession, filtres: FiltresCorrections) {
  const conditions: string[] = [];
  const valeurs: (string | number)[] = [];
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id || (filtres.province_id && filtres.province_id !== utilisateur.province_id)) {
      throw new ErreurStock("Accès refusé hors de votre province.", 403);
    }
    conditions.push("dc.province_id = ?");
    valeurs.push(utilisateur.province_id);
  } else {
    exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
    if (filtres.province_id) { conditions.push("dc.province_id = ?"); valeurs.push(filtres.province_id); }
  }
  if (filtres.statut) { conditions.push("dc.statut = ?"); valeurs.push(filtres.statut); }
  if (filtres.recherche) {
    const terme = `%${filtres.recherche}%`;
    conditions.push("(d.reference_distribution LIKE ? OR d.intitule_distribution LIKE ? OR dc.motif_retour LIKE ? OR dc.reponse_delegue LIKE ?)");
    valeurs.push(terme, terme, terme, terme);
  }
  dateConditions("date(dc.cree_le)", filtres.date_debut, filtres.date_fin, conditions, valeurs);
  return { conditions, valeurs };
}

export async function listerDemandesCorrection(db: Base, utilisateur: UtilisateurSession, filtres: FiltresCorrections) {
  const { conditions, valeurs } = conditionsCorrections(utilisateur, filtres);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [liste, total] = await Promise.all([
    db.prepare(
      `SELECT dc.id, dc.distribution_id, dc.province_id, p.nom AS province_nom,
         d.reference_distribution, d.intitule_distribution, d.statut AS statut_distribution,
         dc.motif_retour, dc.elements_a_corriger, dc.statut, dc.demande_par,
         auteur.nom_complet AS auteur_central, dc.traite_par_delegue,
         delegue.nom_complet AS nom_delegue, dc.reponse_delegue, dc.cree_le, dc.resolu_le
       FROM demandes_correction dc
       INNER JOIN distributions_provinciales d ON d.id = dc.distribution_id
       INNER JOIN provinces p ON p.id = dc.province_id
       INNER JOIN utilisateurs auteur ON auteur.id = dc.demande_par
       LEFT JOIN utilisateurs delegue ON delegue.id = dc.traite_par_delegue
       ${where} ORDER BY dc.cree_le DESC, dc.id DESC LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT COUNT(*) AS total FROM demandes_correction dc
       INNER JOIN distributions_provinciales d ON d.id = dc.distribution_id ${where}`,
    ).bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}

const SELECT_ETAT_CLOTURE = `SELECT d.id, d.reference_distribution, d.intitule_distribution,
  d.province_id, p.nom AS province_nom, d.statut, d.date_declaration_fin,
  EXISTS (SELECT 1 FROM pieces_jointes pj WHERE pj.entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
    AND pj.entite_liee_id = d.id AND pj.province_id = d.province_id
    AND pj.categorie_document = 'PV_DISTRIBUTION') AS pv_present,
  (SELECT COUNT(*) FROM menages_distribution md WHERE md.distribution_id = d.id
    AND md.province_id = d.province_id AND (md.statut_service = 'EN_ATTENTE'
      OR (md.statut_service IN ('PARTIELLEMENT_SERVI', 'ABSENT', 'NON_SERVI')
        AND (md.motif_non_service IS NULL OR length(trim(md.motif_non_service)) = 0)))) AS livraisons_non_resolues,
  (SELECT COUNT(*) FROM demandes_correction dc WHERE dc.distribution_id = d.id
    AND dc.statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE')) AS corrections_ouvertes,
  (SELECT COUNT(*) FROM observations_controle o WHERE o.province_id = d.province_id
    AND o.statut = 'OUVERTE' AND o.niveau_gravite = 'CRITIQUE'
    AND ((o.operation_type = 'DISTRIBUTION_PROVINCIALE' AND o.operation_id = d.id)
      OR (o.operation_type = 'STOCK_PROVINCIAL' AND EXISTS (
        SELECT 1 FROM mouvements_stock m WHERE m.id = o.operation_id AND m.province_id = d.province_id
          AND (m.document_source_id = d.id OR (m.document_source_type = 'REMISE_DISTRIBUTION'
            AND EXISTS (SELECT 1 FROM remises_distribution rd WHERE rd.id = m.document_source_id AND rd.distribution_id = d.id)))
      )))) AS observations_critiques_ouvertes,
  (SELECT COUNT(*) FROM reservations_stock r WHERE r.distribution_id = d.id
    AND r.statut = 'ACTIVE' AND r.quantite_reservee - r.quantite_consommee - r.quantite_liberee > 0.000001) AS lots_a_liberer,
  (SELECT COALESCE(SUM(r.quantite_reservee - r.quantite_consommee - r.quantite_liberee), 0)
    FROM reservations_stock r WHERE r.distribution_id = d.id AND r.statut = 'ACTIVE') AS quantite_a_liberer,
  EXISTS (SELECT 1 FROM reservations_stock r INNER JOIN lots_stock l ON l.id = r.lot_stock_id
    LEFT JOIN soldes_stock s ON s.entrepot_id = l.entrepot_id AND s.article_id = l.article_id
      AND s.province_id IS l.province_id
    WHERE r.distribution_id = d.id AND (
      abs(l.quantite_reservee - COALESCE((SELECT SUM(r2.quantite_reservee - r2.quantite_consommee - r2.quantite_liberee)
        FROM reservations_stock r2 WHERE r2.lot_stock_id = l.id AND r2.statut = 'ACTIVE'), 0)) > 0.000001
      OR s.entrepot_id IS NULL
      OR abs(s.quantite_physique - COALESCE((SELECT SUM(l2.quantite_physique) FROM lots_stock l2
        WHERE l2.entrepot_id = l.entrepot_id AND l2.article_id = l.article_id AND l2.province_id IS l.province_id), 0)) > 0.000001
      OR abs(s.quantite_reservee - COALESCE((SELECT SUM(l3.quantite_reservee) FROM lots_stock l3
        WHERE l3.entrepot_id = l.entrepot_id AND l3.article_id = l.article_id AND l3.province_id IS l.province_id), 0)) > 0.000001
      OR abs(r.quantite_consommee - COALESCE((SELECT SUM(lr.quantite_remise) FROM lignes_remise lr
        INNER JOIN remises_distribution rd ON rd.id = lr.remise_id
        WHERE lr.reservation_id = r.id AND rd.distribution_id = d.id), 0)) > 0.000001
    )) AS stock_incoherent
FROM distributions_provinciales d INNER JOIN provinces p ON p.id = d.province_id`;

function presenterEtatCloture(ligne: Record<string, unknown> | null) {
  if (!ligne) throw new ErreurStock("Distribution introuvable.", 404);
  const bloqueurs: string[] = [];
  if (ligne.statut !== "TERMINEE_PROVINCE" || !ligne.date_declaration_fin) bloqueurs.push("L’annonce de fin par la délégation provinciale est requise.");
  if (Number(ligne.pv_present) !== 1) bloqueurs.push("Le procès-verbal de distribution est absent.");
  if (Number(ligne.corrections_ouvertes) > 0) bloqueurs.push("Une demande de correction attend encore une réponse ou une validation centrale.");
  if (Number(ligne.livraisons_non_resolues) > 0) bloqueurs.push("Des ménages restent en attente ou sans justification de service.");
  if (Number(ligne.observations_critiques_ouvertes) > 0) bloqueurs.push("Une observation critique liée à cette distribution demeure ouverte.");
  if (Number(ligne.stock_incoherent) === 1) bloqueurs.push("Les réservations, les sorties ou les soldes de stock ne sont pas cohérents.");
  return { ...ligne, pret: bloqueurs.length === 0, bloqueurs };
}

export async function lireEtatClotureDistribution(db: Base, utilisateur: UtilisateurSession, distributionId: string) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
  const ligne = await db.prepare(`${SELECT_ETAT_CLOTURE} WHERE d.id = ?`)
    .bind(distributionId).first<Record<string, unknown>>();
  return presenterEtatCloture(ligne);
}

export async function listerDossiersACloturer(
  db: Base,
  utilisateur: UtilisateurSession,
  filtres: { limite: number; decalage: number; province_id?: string },
) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL"]);
  const conditions = ["d.statut = 'TERMINEE_PROVINCE'"];
  const valeurs: (string | number)[] = [];
  if (filtres.province_id) { conditions.push("d.province_id = ?"); valeurs.push(filtres.province_id); }
  const where = conditions.join(" AND ");
  const [liste, total] = await Promise.all([
    db.prepare(`${SELECT_ETAT_CLOTURE} WHERE ${where} ORDER BY d.date_declaration_fin, d.id LIMIT ? OFFSET ?`)
      .bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM distributions_provinciales d WHERE ${where}`)
      .bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results.map(presenterEtatCloture), total: total?.total ?? 0,
    limite: filtres.limite, decalage: filtres.decalage };
}

export async function listerJournalAudit(db: Base, utilisateur: UtilisateurSession, filtres: FiltresAudit) {
  exigerRole(utilisateur, ["ADMIN_CENTRAL", "DELEGUE_PROVINCIAL", "PROPRIETAIRE"]);
  const conditions: string[] = [];
  const valeurs: (string | number)[] = [];
  const jointures = `LEFT JOIN distributions_provinciales d ON j.entite_type = 'DISTRIBUTION_PROVINCIALE' AND d.id = j.entite_id
    LEFT JOIN approvisionnements_centraux a ON j.entite_type = 'APPROVISIONNEMENT_CENTRAL' AND a.id = j.entite_id
    LEFT JOIN destinations_approvisionnement dp ON j.entite_type = 'DESTINATION_APPROVISIONNEMENT' AND dp.id = j.entite_id
    LEFT JOIN expeditions e ON j.entite_type = 'EXPEDITION' AND e.id = j.entite_id
    LEFT JOIN receptions_provinciales rp ON j.entite_type = 'RECEPTION_PROVINCIALE' AND rp.id = j.entite_id
    LEFT JOIN remises_distribution rd ON j.entite_type = 'REMISE_DISTRIBUTION' AND rd.id = j.entite_id
    LEFT JOIN mouvements_stock m ON j.entite_type = 'MOUVEMENT_STOCK' AND m.id = j.entite_id
    LEFT JOIN observations_controle oc ON j.entite_type = 'OBSERVATION_CONTROLE' AND oc.id = j.entite_id
    LEFT JOIN demandes_correction dc ON j.entite_type = 'DEMANDE_CORRECTION' AND dc.id = j.entite_id
    LEFT JOIN pieces_jointes pj ON j.entite_type = 'PIECE_JOINTE' AND pj.id = j.entite_id
    LEFT JOIN receptions_stock rs ON j.entite_type = 'RECEPTION_STOCK' AND rs.id = j.entite_id
    LEFT JOIN entrepots wh ON j.entite_type = 'ENTREPOT' AND wh.id = j.entite_id
    LEFT JOIN reservations_stock r ON j.entite_type = 'RESERVATION_STOCK' AND r.id = j.entite_id
    LEFT JOIN clotures_distribution cl ON j.entite_type = 'CLOTURE_DISTRIBUTION'
      AND (cl.id = j.entite_id OR cl.distribution_id = j.entite_id)`;
  const porteeProvince = `(
    j.province_id = ? OR d.province_id = ? OR dp.province_id = ? OR e.province_destinataire_id = ?
    OR rp.province_id = ? OR rd.province_id = ? OR m.province_id = ? OR oc.province_id = ?
    OR dc.province_id = ? OR pj.province_id = ? OR rs.province_id = ? OR wh.province_id = ?
    OR r.province_id = ? OR cl.province_id = ?
    OR (j.entite_type = 'APPROVISIONNEMENT_CENTRAL' AND EXISTS (
      SELECT 1 FROM destinations_approvisionnement scope_dp
      WHERE scope_dp.approvisionnement_id = j.entite_id AND scope_dp.province_id = ?
    ))
  )`;
  const provinceScope = utilisateur.role === "DELEGUE_PROVINCIAL" ? utilisateur.province_id : filtres.province_id;
  if (utilisateur.role === "DELEGUE_PROVINCIAL" &&
      (!provinceScope || (filtres.province_id && filtres.province_id !== provinceScope))) {
    throw new ErreurStock("Accès refusé hors de votre province.", 403);
  }
  if (provinceScope) {
    conditions.push(porteeProvince);
    valeurs.push(...Array.from({ length: 15 }, () => provinceScope));
  }
  if (filtres.utilisateur_id) { conditions.push("j.utilisateur_id = ?"); valeurs.push(filtres.utilisateur_id); }
  if (filtres.action) { conditions.push("j.action = ?"); valeurs.push(filtres.action); }
  if (filtres.entite_type) { conditions.push("j.entite_type = ?"); valeurs.push(filtres.entite_type); }
  const reference = `COALESCE(d.reference_distribution, a.reference, e.reference_expedition,
    rp.reference_reception_prov, rd.reference_remise, m.reference_mouvement, j.entite_id)`;
  if (filtres.reference) { conditions.push(`(j.entite_id LIKE ? OR ${reference} LIKE ?)`); valeurs.push(`%${filtres.reference}%`, `%${filtres.reference}%`); }
  dateConditions("date(j.cree_le)", filtres.date_debut, filtres.date_fin, conditions, valeurs);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const provinceAffichee = `COALESCE(j.province_id, d.province_id, dp.province_id, e.province_destinataire_id,
    rp.province_id, rd.province_id, m.province_id, oc.province_id, dc.province_id, pj.province_id,
    rs.province_id, wh.province_id, r.province_id, cl.province_id)`;
  const [liste, total] = await Promise.all([
    db.prepare(
      `SELECT j.id, j.utilisateur_id, u.nom_complet AS utilisateur_nom, j.role_utilisateur,
         ${provinceAffichee} AS province_id,
         CASE WHEN j.entite_type = 'APPROVISIONNEMENT_CENTRAL' THEN
           (SELECT GROUP_CONCAT(DISTINCT p2.nom) FROM destinations_approvisionnement da
            INNER JOIN provinces p2 ON p2.id = da.province_id WHERE da.approvisionnement_id = j.entite_id)
           ELSE p.nom END AS province_nom,
         j.action, j.entite_type, j.entite_id, ${reference} AS reference, j.cree_le
       FROM journaux_audit j ${jointures}
       LEFT JOIN utilisateurs u ON u.id = j.utilisateur_id
       LEFT JOIN provinces p ON p.id = ${provinceAffichee}
       ${where} ORDER BY j.cree_le DESC, j.id DESC LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total FROM journaux_audit j ${jointures} ${where}`)
      .bind(...valeurs).first<{ total: number }>(),
  ]);
  return { elements: liste.results, total: total?.total ?? 0, limite: filtres.limite, decalage: filtres.decalage };
}
