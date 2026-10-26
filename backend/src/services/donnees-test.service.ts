import type { UtilisateurSession } from "../bindings";
import { verifierMotDePasse } from "./cryptographie.service";
import { creerInstructionAudit } from "../middlewares/audit.middleware";
import type {
  EntreeAuditSuppressionTest,
  EntreeFileReconciliationR2,
  NatureDonnees,
  RapportEligibiliteOperation,
  RegleSecuriteVerification,
  ResultatSuppressionOperationTest,
  ResultatTraitementReconciliationR2,
  ResumeOperationDonneesTest,
  StatutEligibiliteSuppression,
  StatutReconciliationR2,
  SyntheseDependancesOperation,
} from "../../../shared/types/donnees-test";
import type {
  schemaDemandeReclassification,
  schemaFiltresDonneesTest,
  schemaNettoyageLotDonneesTest,
  schemaSuppressionOperationTest,
} from "../../../shared/validations/donnees-test";
import { z } from "zod";

export class ErreurDonneesTest extends Error {
  statutHttp: number;
  code?: string | undefined;
  constructor(message: string, statutHttp: number = 400, code?: string) {
    super(message);
    this.name = "ErreurDonneesTest";
    this.statutHttp = statutHttp;
    if (code !== undefined) {
      this.code = code;
    }
  }
}

export function validerAccesProprietaire(utilisateur: UtilisateurSession): void {
  if (utilisateur.role !== "PROPRIETAIRE") {
    throw new ErreurDonneesTest(
      "Seul le compte PROPRIETAIRE est habilité à administrer et purger les données de test.",
      403,
      "ACCES_REFUSE_PROPRIETAIRE_REQUIS",
    );
  }
}

export async function verifierMotDePasseProprietaire(
  db: D1Database,
  utilisateurId: string,
  motDePasse: string,
): Promise<void> {
  const compte = await db
    .prepare("SELECT mot_de_passe_hash, role FROM utilisateurs WHERE id = ?")
    .bind(utilisateurId)
    .first<{ mot_de_passe_hash: string; role: string }>();

  if (!compte || compte.role !== "PROPRIETAIRE") {
    throw new ErreurDonneesTest("Compte propriétaire introuvable.", 403);
  }

  const valide = await verifierMotDePasse(motDePasse, compte.mot_de_passe_hash);
  if (!valide) {
    throw new ErreurDonneesTest(
      "Le mot de passe de confirmation est incorrect. Opération de sécurité annulée.",
      403,
      "MOT_DE_PASSE_PROPRIETAIRE_INCORRECT",
    );
  }
}

export async function analyserDependancesEtEligibilite(
  db: D1Database,
  operationId: string,
): Promise<RapportEligibiliteOperation> {
  const operation = await db
    .prepare(
      `SELECT id, code_operation, intitule, statut, nature_donnees
       FROM operations_centrales_distribution
       WHERE id = ? OR code_operation = ?`,
    )
    .bind(operationId, operationId)
    .first<{
      id: string;
      code_operation: string;
      intitule: string;
      statut: string;
      nature_donnees: NatureDonnees;
    }>();

  if (!operation) {
    throw new ErreurDonneesTest("Opération centrale introuvable.", 404);
  }

  // 1. Dépendances opérationnelles centrales
  const [provincesLignes, dossiersLignes, approbationsLignes, documentsLignes] = await Promise.all([
    db.prepare(
      `SELECT p.nom as province_nom
       FROM operations_centrales_provinces ocp
       JOIN provinces p ON p.id = ocp.province_id
       WHERE ocp.operation_id = ?`,
    ).bind(operation.id).all<{ province_nom: string }>(),
    db.prepare("SELECT COUNT(*) as c FROM dossiers_execution_provinciaux WHERE operation_id = ?")
      .bind(operation.id).first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) as c FROM approbations_operations WHERE operation_id = ?")
      .bind(operation.id).first<{ c: number }>(),
    db.prepare("SELECT id, nom_fichier_original, cle_r2, taille_octets FROM documents_operations WHERE operation_id = ?")
      .bind(operation.id).all<{ id: string; nom_fichier_original: string; cle_r2: string; taille_octets: number }>(),
  ]);

  // 2. Distributions provinciales associées
  const distributionsLignes = await db
    .prepare("SELECT id, statut FROM distributions_provinciales WHERE operation_centrale_id = ?")
    .bind(operation.id)
    .all<{ id: string; statut: string }>();

  const distIds = distributionsLignes.results.map((d: { id: string; statut: string }) => d.id);
  const placesDist = distIds.map(() => "?").join(",");

  let nbValidations = 0;
  let nbRemises = 0;
  let nbMouvementsStock = 0;
  let nbReservationsStock = 0;

  if (distIds.length > 0) {
    const [resVal, resRem, resMouv, resRes] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as c FROM validations_distribution WHERE distribution_id IN (${placesDist})`)
        .bind(...distIds).first<{ c: number }>(),
      db.prepare(`SELECT COUNT(*) as c FROM remises_distribution WHERE distribution_id IN (${placesDist})`)
        .bind(...distIds).first<{ c: number }>(),
      db.prepare(`
        SELECT COUNT(*) as c FROM mouvements_stock
        WHERE document_source_id IN (${placesDist})
           OR (document_source_type = 'REMISE_DISTRIBUTION' AND document_source_id IN (SELECT id FROM remises_distribution WHERE distribution_id IN (${placesDist})))
           OR motif LIKE ?
      `).bind(...distIds, ...distIds, `%${operation.code_operation}%`).first<{ c: number }>(),
      db.prepare(`SELECT COUNT(*) as c FROM reservations_stock WHERE distribution_id IN (${placesDist})`)
        .bind(...distIds).first<{ c: number }>(),
    ]);
    const nbDistributionsEngagees = distributionsLignes.results.filter((d: { statut: string }) =>
      !["BROUILLON", "ANNULEE"].includes(d.statut),
    ).length;
    nbValidations = (resVal?.c ?? 0) + nbDistributionsEngagees;
    nbRemises = resRem?.c ?? 0;
    nbMouvementsStock = resMouv?.c ?? 0;
    nbReservationsStock = resRes?.c ?? 0;
  } else {
    // Vérifier si des mouvements de stock mentionnent directement le code de l'opération
    const resMouvDirect = await db
      .prepare("SELECT COUNT(*) as c FROM mouvements_stock WHERE motif LIKE ? OR document_source_id = ?")
      .bind(`%${operation.code_operation}%`, operation.id)
      .first<{ c: number }>();
    nbMouvementsStock = resMouvDirect?.c ?? 0;
  }

  const dependances: SyntheseDependancesOperation = {
    nb_provinces: provincesLignes.results.length,
    nb_dossiers: dossiersLignes?.c ?? 0,
    nb_approbations: approbationsLignes?.c ?? 0,
    nb_documents: documentsLignes.results.length,
    nb_distributions: distributionsLignes.results.length,
    nb_distributions_validees: nbValidations,
    nb_remises_effectuees: nbRemises,
    nb_mouvements_stock: nbMouvementsStock,
    nb_reservations_stock: nbReservationsStock,
    provinces_noms: provincesLignes.results.map((p: { province_nom: string }) => p.province_nom),
    documents_r2: documentsLignes.results,
  };

  // Règles de sécurité pour l'éligibilité
  const regles: RegleSecuriteVerification[] = [
    {
      code: "CLASSIFICATION_TEST",
      intitule: "Classification explicite comme données de test",
      satisfaite: operation.nature_donnees === "TEST",
      detail: operation.nature_donnees === "TEST"
        ? "L'opération porte l'étiquette formelle TEST."
        : operation.nature_donnees === "INDETERMINE"
          ? "Nature indéterminée (enregistrement antérieur) : une révision administrative préalable est obligatoire."
          : "L'opération est classifiée REEL (données opérationnelles réelles protégées).",
    },
    {
      code: "ABSENCE_MOUVEMENTS_STOCK",
      intitule: "Absence totale de mouvements ou réservations de stock",
      satisfaite: nbMouvementsStock === 0 && nbReservationsStock === 0,
      detail: nbMouvementsStock === 0 && nbReservationsStock === 0
        ? "Aucun mouvement de stock ou réservation d'entrepôt rattaché."
        : `${nbMouvementsStock} mouvement(s) de stock et ${nbReservationsStock} réservation(s) détectés. Suppression bloquée.`,
    },
    {
      code: "ABSENCE_REMISES_PHYSIQUES",
      intitule: "Absence de remises effectives de vivres aux ménages",
      satisfaite: nbRemises === 0,
      detail: nbRemises === 0
        ? "Aucune remise physique enregistrée."
        : `${nbRemises} remise(s) physique(s) de vivres enregistrée(s). Suppression bloquée.`,
    },
    {
      code: "ABSENCE_DISTRIBUTIONS_VALIDEES",
      intitule: "Absence de validations ou clôtures provinciales officielles",
      satisfaite: nbValidations === 0,
      detail: nbValidations === 0
        ? "Aucun procès-verbal de validation provinciale clôturé."
        : `${nbValidations} acte(s) de validation provinciale enregistré(s). Suppression bloquée.`,
    },
  ];

  // Détermination du statut global
  let statutEligibilite: StatutEligibiliteSuppression = "ELIGIBLE";
  let motifRefus: string | null = null;

  if (nbMouvementsStock > 0 || nbReservationsStock > 0) {
    statutEligibilite = "BLOQUE_MOUVEMENTS_STOCK";
    motifRefus = "Suppression strictement interdite : des mouvements réels de stock sont associés à cette opération.";
  } else if (nbRemises > 0 || nbValidations > 0) {
    statutEligibilite = "BLOQUE_DISTRIBUTIONS_VALIDEES";
    motifRefus = "Suppression strictement interdite : des distributions ont été exécutées ou validées sur le terrain.";
  } else if (operation.nature_donnees === "REEL") {
    statutEligibilite = "PROTEGE_REEL";
    motifRefus = "Opération classifiée REEL. Seules les opérations explicitement classifiées TEST peuvent être purgées.";
  } else if (operation.nature_donnees === "INDETERMINE") {
    statutEligibilite = "NON_CONFIRME";
    motifRefus = "Opération préexistante non étiquetée. Une revue administrative motivée est requise pour certifier qu'il s'agit d'un test.";
  }

  const eligible = statutEligibilite === "ELIGIBLE";

  return {
    operation_id: operation.id,
    code_operation: operation.code_operation,
    intitule: operation.intitule,
    statut: operation.statut,
    nature_donnees: operation.nature_donnees,
    statut_eligibilite: statutEligibilite,
    eligible,
    motif_refus: motifRefus,
    regles,
    dependances,
  };
}

export async function listerOperationsDonneesTest(
  db: D1Database,
  utilisateur: UtilisateurSession,
  filtres: z.infer<typeof schemaFiltresDonneesTest>,
): Promise<{ elements: ResumeOperationDonneesTest[]; total: number; limite: number; decalage: number }> {
  validerAccesProprietaire(utilisateur);

  const conditions: string[] = [];
  const parametres: (string | number)[] = [];

  if (filtres.nature && filtres.nature !== "TOUTES") {
    conditions.push("op.nature_donnees = ?");
    parametres.push(filtres.nature);
  }

  if (filtres.statut) {
    conditions.push("op.statut = ?");
    parametres.push(filtres.statut);
  }

  if (filtres.recherche) {
    conditions.push("(op.code_operation LIKE ? OR op.intitule LIKE ?)");
    const motif = `%${filtres.recherche.trim()}%`;
    parametres.push(motif, motif);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const requeteCompte = `SELECT COUNT(*) as total FROM operations_centrales_distribution op ${whereClause}`;
  const totalLigne = await db.prepare(requeteCompte).bind(...parametres).first<{ total: number }>();
  const total = totalLigne?.total ?? 0;

  const requeteListe = `
    SELECT
      op.id,
      op.code_operation,
      op.intitule,
      op.statut,
      op.nature_donnees,
      op.cree_le,
      (SELECT COUNT(*) FROM operations_centrales_provinces WHERE operation_id = op.id) AS nb_provinces,
      (SELECT COUNT(*) FROM dossiers_execution_provinciaux WHERE operation_id = op.id) AS nb_dossiers,
      (SELECT COUNT(*) FROM distributions_provinciales WHERE operation_centrale_id = op.id) AS nb_distributions,
      (SELECT COUNT(*) FROM documents_operations WHERE operation_id = op.id) AS nb_documents,
      (SELECT COUNT(*) FROM mouvements_stock WHERE motif LIKE '%' || op.code_operation || '%' OR document_source_id = op.id) AS nb_mouvements_stock
    FROM operations_centrales_distribution op
    ${whereClause}
    ORDER BY op.cree_le DESC
    LIMIT ? OFFSET ?
  `;

  const lignes = await db
    .prepare(requeteListe)
    .bind(...parametres, filtres.limite, filtres.decalage)
    .all<{
      id: string;
      code_operation: string;
      intitule: string;
      statut: string;
      nature_donnees: NatureDonnees;
      cree_le: string;
      nb_provinces: number;
      nb_dossiers: number;
      nb_distributions: number;
      nb_documents: number;
      nb_mouvements_stock: number;
    }>();

  const elements: ResumeOperationDonneesTest[] = lignes.results.map((l: {
    id: string;
    code_operation: string;
    intitule: string;
    statut: string;
    nature_donnees: NatureDonnees;
    cree_le: string;
    nb_provinces: number;
    nb_dossiers: number;
    nb_distributions: number;
    nb_documents: number;
    nb_mouvements_stock: number;
  }) => {
    let statutEligibilite: StatutEligibiliteSuppression = "ELIGIBLE";
    if (l.nb_mouvements_stock > 0) statutEligibilite = "BLOQUE_MOUVEMENTS_STOCK";
    else if (l.nature_donnees === "REEL") statutEligibilite = "PROTEGE_REEL";
    else if (l.nature_donnees === "INDETERMINE") statutEligibilite = "NON_CONFIRME";

    return {
      id: l.id,
      code_operation: l.code_operation,
      intitule: l.intitule,
      statut: l.statut,
      nature_donnees: l.nature_donnees,
      statut_eligibilite: statutEligibilite,
      eligible_suppression: statutEligibilite === "ELIGIBLE",
      nb_provinces: l.nb_provinces,
      nb_dossiers: l.nb_dossiers,
      nb_distributions: l.nb_distributions,
      nb_documents: l.nb_documents,
      nb_mouvements_stock: l.nb_mouvements_stock,
      cree_le: l.cree_le,
    };
  });

  return {
    elements,
    total,
    limite: filtres.limite,
    decalage: filtres.decalage,
  };
}

export async function reclassifierOperation(
  db: D1Database,
  utilisateur: UtilisateurSession,
  operationId: string,
  saisie: z.infer<typeof schemaDemandeReclassification>,
  adresseIp: string | null,
): Promise<{ message: string; nouveau_statut_nature: NatureDonnees; demande_id: string }> {
  validerAccesProprietaire(utilisateur);
  await verifierMotDePasseProprietaire(db, utilisateur.id, saisie.mot_de_passe_confirmation);

  const analyse = await analyserDependancesEtEligibilite(db, operationId);

  // Si on tente de classifier vers TEST, vérification impérative d'absence d'actes physiques
  if (saisie.nature_cible === "TEST") {
    if (
      analyse.dependances.nb_mouvements_stock > 0 ||
      analyse.dependances.nb_reservations_stock > 0 ||
      analyse.dependances.nb_remises_effectuees > 0 ||
      analyse.dependances.nb_distributions_validees > 0
    ) {
      throw new ErreurDonneesTest(
        "Reclassification impossible : l'opération comporte des mouvements de stock ou des distributions réelles vérifiées.",
        409,
      );
    }
  }

  const demandeId = `reclass-${crypto.randomUUID()}`;
  const maintenant = new Date().toISOString();

  const verificationsSnapshot = {
    horodatage: maintenant,
    analyse_dependances: analyse.dependances,
    decision_autorisee: true,
  };

  await db.batch([
    db.prepare(
      `INSERT INTO demandes_reclassification_donnees
       (id, entite_type, entite_id, code_entite, intitule_entite,
        nature_initiale, nature_cible, motif, preuves_justificatives,
        verifications_automatiques_json, statut, demandeur_id, examine_par_id,
        examine_le, decision_commentaire)
       VALUES (?, 'OPERATION_CENTRALE', ?, ?, ?, ?, ?, ?, ?, ?, 'APPROUVEE', ?, ?, ?, ?)`,
    ).bind(
      demandeId,
      analyse.operation_id,
      analyse.code_operation,
      analyse.intitule,
      analyse.nature_donnees,
      saisie.nature_cible,
      saisie.motif,
      saisie.preuves_justificatives,
      JSON.stringify(verificationsSnapshot),
      utilisateur.id,
      utilisateur.id,
      maintenant,
      "Reclassification validée après vérification automatique de l'absence de mouvements physiques réels.",
    ),
    db.prepare(
      `UPDATE operations_centrales_distribution
       SET nature_donnees = ?, modifie_le = ?
       WHERE id = ?`,
    ).bind(saisie.nature_cible, maintenant, analyse.operation_id),
    db.prepare(
      `UPDATE distributions_provinciales
       SET nature_donnees = ?
       WHERE operation_centrale_id = ?`,
    ).bind(saisie.nature_cible, analyse.operation_id),
    creerInstructionAudit(db, {
      utilisateur,
      action: "RECLASSIFICATION_NATURE_DONNEES",
      entiteType: "OPERATION_CENTRALE",
      entiteId: analyse.operation_id,
      adresseIp,
      donneesAvant: JSON.stringify({ nature_donnees: analyse.nature_donnees }),
      donneesApres: JSON.stringify({
        nature_donnees: saisie.nature_cible,
        motif: saisie.motif,
        demande_id: demandeId,
      }),
    }),
  ]);

  return {
    message: `L'opération ${analyse.code_operation} a été reclassifiée avec succès en ${saisie.nature_cible}.`,
    nouveau_statut_nature: saisie.nature_cible,
    demande_id: demandeId,
  };
}

export async function supprimerOperationTest(
  db: D1Database,
  bucket: R2Bucket,
  utilisateur: UtilisateurSession,
  operationId: string,
  saisie: z.infer<typeof schemaSuppressionOperationTest>,
  adresseIp: string | null,
): Promise<ResultatSuppressionOperationTest> {
  validerAccesProprietaire(utilisateur);
  await verifierMotDePasseProprietaire(db, utilisateur.id, saisie.mot_de_passe_confirmation);

  const analyse = await analyserDependancesEtEligibilite(db, operationId);

  // Vérification stricte du code
  if (saisie.confirmation_code.trim().toUpperCase() !== analyse.code_operation.trim().toUpperCase()) {
    throw new ErreurDonneesTest(
      `Le code saisi "${saisie.confirmation_code}" ne correspond pas au code exact de l'opération "${analyse.code_operation}".`,
      400,
    );
  }

  // Vérification de l'éligibilité
  if (!analyse.eligible) {
    throw new ErreurDonneesTest(
      analyse.motif_refus ?? "L'opération ne remplit pas les critères d'éligibilité à la suppression.",
      409,
    );
  }

  const maintenant = new Date().toISOString();
  const auditId = `audit-del-${crypto.randomUUID()}`;
  const clesR2ASupprimer = analyse.dependances.documents_r2.map((d) => d.cle_r2).filter(Boolean);

  // 1. Nettoyage Cloudflare R2 préalable pour classifier immédiatement les réussites/échecs
  const clesSupprimees: string[] = [];
  const clesEchouees: Array<{ cle: string; erreur: string }> = [];

  for (const cle of clesR2ASupprimer) {
    try {
      await bucket.delete(cle);
      clesSupprimees.push(cle);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      clesEchouees.push({ cle, erreur: msg });
    }
  }

  const statutResultat = clesEchouees.length > 0 ? "ECHEC_PARTIEL" : "SUCCES";

  const perimetre = {
    documents_operations: analyse.dependances.nb_documents,
    approbations_operations: analyse.dependances.nb_approbations,
    dossiers_execution_provinciaux: analyse.dependances.nb_dossiers,
    operations_centrales_provinces: analyse.dependances.nb_provinces,
    historique_operations_centrales: 0,
    distributions_provinciales: analyse.dependances.nb_distributions,
    operations_centrales_distribution: 1,
    fichiers_r2: clesR2ASupprimer.length,
  };

  // Récupérer le nombre de lignes d'historique avant purge
  const histLigne = await db
    .prepare("SELECT COUNT(*) as c FROM historique_operations_centrales WHERE operation_id = ?")
    .bind(analyse.operation_id)
    .first<{ c: number }>();
  perimetre.historique_operations_centrales = histLigne?.c ?? 0;

  // Transactions D1 atomique : suppression en cascade contrôlée
  await db.batch([
    db.prepare("DELETE FROM documents_operations WHERE operation_id = ?").bind(analyse.operation_id),
    db.prepare("DELETE FROM approbations_operations WHERE operation_id = ?").bind(analyse.operation_id),
    db.prepare("DELETE FROM dossiers_execution_provinciaux WHERE operation_id = ?").bind(analyse.operation_id),
    db.prepare("DELETE FROM operations_centrales_provinces WHERE operation_id = ?").bind(analyse.operation_id),
    db.prepare("DELETE FROM historique_operations_centrales WHERE operation_id = ?").bind(analyse.operation_id),
    // Pour les distributions enfants d'un test sans remises réelles
    db.prepare("DELETE FROM remises_distribution WHERE distribution_id IN (SELECT id FROM distributions_provinciales WHERE operation_centrale_id = ?)")
      .bind(analyse.operation_id),
    db.prepare("DELETE FROM allocations_distribution WHERE distribution_id IN (SELECT id FROM distributions_provinciales WHERE operation_centrale_id = ?)")
      .bind(analyse.operation_id),
    db.prepare("DELETE FROM menages_distribution WHERE distribution_id IN (SELECT id FROM distributions_provinciales WHERE operation_centrale_id = ?)")
      .bind(analyse.operation_id),
    db.prepare("DELETE FROM distributions_provinciales WHERE operation_centrale_id = ?").bind(analyse.operation_id),
    db.prepare("DELETE FROM operations_centrales_distribution WHERE id = ?").bind(analyse.operation_id),
    // Journal d'audit immuable
    db.prepare(
      `INSERT INTO audits_suppression_donnees_test
       (id, utilisateur_id, utilisateur_identifiant, utilisateur_nom, adresse_ip,
        entite_type, entite_id, code_entite, intitule_entite,
        perimetre_supprime_json, documents_r2_supprimes_json, motif,
        details_verification_json, statut_resultat, horodatage)
       VALUES (?, ?, ?, ?, ?, 'OPERATION_CENTRALE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      auditId,
      utilisateur.id,
      utilisateur.identifiant,
      utilisateur.nom_complet,
      adresseIp,
      analyse.operation_id,
      analyse.code_operation,
      analyse.intitule,
      JSON.stringify(perimetre),
      JSON.stringify(clesSupprimees),
      saisie.motif,
      JSON.stringify({
        verification_stock: "0 mouvement",
        verification_remises: "0 remise",
        regles_satisfaites: analyse.regles,
        echecs_r2: clesEchouees,
      }),
      statutResultat,
      maintenant,
    ),
    // Instructions d'insertion dans la file persistante de réconciliation pour tout échec R2
    ...clesEchouees.map((e) =>
      db.prepare(
        `INSERT INTO file_reconciliation_r2_orphelins
         (id, cle_r2, entite_id, code_entite, audit_id, statut, tentatives,
          derniere_tentative, prochaine_tentative, dernier_message_erreur)
         VALUES (?, ?, ?, ?, ?, 'EN_ATTENTE', 1, ?, datetime('now', '+1 hour'), ?)`
      ).bind(
        `reconcil-r2-${crypto.randomUUID()}`,
        e.cle,
        analyse.operation_id,
        analyse.code_operation,
        auditId,
        maintenant,
        e.erreur.slice(0, 500),
      )
    ),
    creerInstructionAudit(db, {
      utilisateur,
      action: "SUPPRESSION_OPERATION_TEST",
      entiteType: "OPERATION_CENTRALE",
      entiteId: analyse.operation_id,
      adresseIp,
      donneesAvant: JSON.stringify({
        code_operation: analyse.code_operation,
        intitule: analyse.intitule,
        perimetre_supprime: perimetre,
        motif: saisie.motif,
      }),
    }),
  ]);

  return {
    succes: true,
    code_operation: analyse.code_operation,
    intitule: analyse.intitule,
    perimetre_supprime: perimetre,
    fichiers_r2_supprimes: clesSupprimees,
    fichiers_r2_echecs: clesEchouees,
    audit_id: auditId,
    horodatage: maintenant,
  };
}

export async function nettoyageLotDonneesTest(
  db: D1Database,
  bucket: R2Bucket,
  utilisateur: UtilisateurSession,
  saisie: z.infer<typeof schemaNettoyageLotDonneesTest>,
  adresseIp: string | null,
): Promise<{
  succes: boolean;
  total_supprime: number;
  operations_supprimees: ResultatSuppressionOperationTest[];
}> {
  validerAccesProprietaire(utilisateur);
  await verifierMotDePasseProprietaire(db, utilisateur.id, saisie.mot_de_passe_confirmation);

  if (saisie.confirmation_texte !== "SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST") {
    throw new ErreurDonneesTest(
      "Texte de confirmation invalide. Saisissez exactement SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST.",
      400,
    );
  }

  // Phase 1 : Contrôle préliminaire intégral de TOUTES les opérations demandées
  const analyses = await Promise.all(
    saisie.operation_ids.map((id) => analyserDependancesEtEligibilite(db, id)),
  );

  for (const a of analyses) {
    if (!a.eligible) {
      throw new ErreurDonneesTest(
        `Le lot contient l'opération "${a.code_operation}" qui n'est pas éligible à la suppression (${a.motif_refus}). Aucun enregistrement n'a été supprimé.`,
        409,
      );
    }
  }

  // Phase 2 : Suppression séquentielle sécurisée
  const resultats: ResultatSuppressionOperationTest[] = [];
  for (const a of analyses) {
    const res = await supprimerOperationTest(
      db,
      bucket,
      utilisateur,
      a.operation_id,
      {
        confirmation_code: a.code_operation,
        mot_de_passe_confirmation: saisie.mot_de_passe_confirmation,
        motif: `[NETTOYAGE PAR LOT] ${saisie.motif}`,
      },
      adresseIp,
    );
    resultats.push(res);
  }

  return {
    succes: true,
    total_supprime: resultats.length,
    operations_supprimees: resultats,
  };
}

export async function listerHistoriqueSuppressions(
  db: D1Database,
  utilisateur: UtilisateurSession,
  limite: number = 25,
  decalage: number = 0,
): Promise<{ elements: EntreeAuditSuppressionTest[]; total: number }> {
  validerAccesProprietaire(utilisateur);

  const [totalLigne, lignes] = await Promise.all([
    db.prepare("SELECT COUNT(*) as total FROM audits_suppression_donnees_test").first<{ total: number }>(),
    db.prepare(
      `SELECT id, utilisateur_id, utilisateur_identifiant, utilisateur_nom, adresse_ip,
              entite_type, entite_id, code_entite, intitule_entite,
              perimetre_supprime_json, documents_r2_supprimes_json, motif,
              statut_resultat, horodatage
       FROM audits_suppression_donnees_test
       ORDER BY horodatage DESC
       LIMIT ? OFFSET ?`,
    ).bind(limite, decalage).all<{
      id: string;
      utilisateur_id: string;
      utilisateur_identifiant: string;
      utilisateur_nom: string;
      adresse_ip: string | null;
      entite_type: string;
      entite_id: string;
      code_entite: string;
      intitule_entite: string;
      perimetre_supprime_json: string;
      documents_r2_supprimes_json: string | null;
      motif: string;
      statut_resultat: "SUCCES" | "ECHEC_PARTIEL" | "BLOQUE";
      horodatage: string;
    }>(),
  ]);

  const elements: EntreeAuditSuppressionTest[] = lignes.results.map((r: {
    id: string;
    utilisateur_id: string;
    utilisateur_identifiant: string;
    utilisateur_nom: string;
    adresse_ip: string | null;
    entite_type: string;
    entite_id: string;
    code_entite: string;
    intitule_entite: string;
    perimetre_supprime_json: string;
    documents_r2_supprimes_json: string | null;
    motif: string;
    statut_resultat: "SUCCES" | "ECHEC_PARTIEL" | "BLOQUE";
    horodatage: string;
  }) => ({
    id: r.id,
    utilisateur_id: r.utilisateur_id,
    utilisateur_identifiant: r.utilisateur_identifiant,
    utilisateur_nom: r.utilisateur_nom,
    adresse_ip: r.adresse_ip,
    entite_type: r.entite_type,
    entite_id: r.entite_id,
    code_entite: r.code_entite,
    intitule_entite: r.intitule_entite,
    perimetre_supprime: JSON.parse(r.perimetre_supprime_json),
    documents_r2_supprimes: r.documents_r2_supprimes_json ? JSON.parse(r.documents_r2_supprimes_json) : [],
    motif: r.motif,
    statut_resultat: r.statut_resultat,
    horodatage: r.horodatage,
  }));

  return {
    elements,
    total: totalLigne?.total ?? 0,
  };
}

export async function listerFileReconciliationR2(
  db: D1Database,
  utilisateur: UtilisateurSession,
  statut?: StatutReconciliationR2,
  limite: number = 25,
  decalage: number = 0,
): Promise<{ elements: EntreeFileReconciliationR2[]; total: number }> {
  validerAccesProprietaire(utilisateur);

  const conditions: string[] = [];
  const parametres: (string | number)[] = [];

  if (statut) {
    conditions.push("statut = ?");
    parametres.push(statut);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [totalLigne, lignes] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM file_reconciliation_r2_orphelins ${whereClause}`).bind(...parametres).first<{ total: number }>(),
    db.prepare(
      `SELECT id, cle_r2, entite_id, code_entite, audit_id, statut,
              tentatives, derniere_tentative, prochaine_tentative,
              dernier_message_erreur, cree_le, purgee_le
       FROM file_reconciliation_r2_orphelins
       ${whereClause}
       ORDER BY cree_le DESC
       LIMIT ? OFFSET ?`,
    ).bind(...parametres, limite, decalage).all<EntreeFileReconciliationR2>(),
  ]);

  return {
    elements: lignes.results,
    total: totalLigne?.total ?? 0,
  };
}

export async function traiterFileReconciliationR2(
  db: D1Database,
  bucket: R2Bucket,
  utilisateur?: UtilisateurSession,
  limite: number = 25,
): Promise<ResultatTraitementReconciliationR2> {
  if (utilisateur) {
    validerAccesProprietaire(utilisateur);
  }

  const entrees = await db
    .prepare(
      `SELECT id, cle_r2, tentatives
       FROM file_reconciliation_r2_orphelins
       WHERE statut = 'EN_ATTENTE' AND prochaine_tentative <= datetime('now')
       ORDER BY prochaine_tentative ASC
       LIMIT ?`,
    )
    .bind(limite)
    .all<{ id: string; cle_r2: string; tentatives: number }>();

  let succes = 0;
  let echecs = 0;
  const maintenant = new Date().toISOString();

  for (const entree of entrees.results) {
    try {
      await bucket.delete(entree.cle_r2);
      await db
        .prepare(
          `UPDATE file_reconciliation_r2_orphelins
           SET statut = 'PURGEE', purgee_le = ?, derniere_tentative = ?
           WHERE id = ?`,
        )
        .bind(maintenant, maintenant, entree.id)
        .run();
      succes += 1;
    } catch (cause) {
      echecs += 1;
      const nbTentatives = entree.tentatives + 1;
      const nouveauStatut = nbTentatives >= 5 ? "ECHOUEE_DEFINITIVE" : "EN_ATTENTE";
      const heuresDelai = Math.min(24, Math.pow(2, nbTentatives));
      const msgErreur = cause instanceof Error ? cause.message : String(cause);

      await db
        .prepare(
          `UPDATE file_reconciliation_r2_orphelins
           SET statut = ?, tentatives = ?, derniere_tentative = ?,
               prochaine_tentative = datetime('now', ?), dernier_message_erreur = ?
           WHERE id = ?`,
        )
        .bind(
          nouveauStatut,
          nbTentatives,
          maintenant,
          `+${heuresDelai} hours`,
          msgErreur.slice(0, 500),
          entree.id,
        )
        .run();
    }
  }

  const restantsLigne = await db
    .prepare("SELECT COUNT(*) as total FROM file_reconciliation_r2_orphelins WHERE statut = 'EN_ATTENTE'")
    .first<{ total: number }>();

  return {
    total_traites: entrees.results.length,
    succes,
    echecs,
    restants: restantsLigne?.total ?? 0,
  };
}
