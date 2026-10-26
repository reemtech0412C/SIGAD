import { creerInstructionAudit } from "../middlewares/audit.middleware.ts";
import { obtenirRequestIdAudit } from "../core/audit/contexte.ts";
import { detecterTypeMimeDocument } from "./fichiers-securite.service.ts";
import { televerserPuisReferencerR2 } from "./stockage-r2.service.ts";
import type { EnvironnementApplication, UtilisateurSession } from "../bindings.ts";
import { executerOperationIdempotente, rejouerOperationIdempotente } from "./stock.service.ts";
import type {
  CreationOperationCentraleSaisie,
  schemaEnregistrementApprobation,
  schemaMiseAJourDossierDelegue,
  schemaModificationOperationCentrale,
  schemaPaginationOperationsCentrales,
  schemaTransitionStatutOperation,
} from "../../../shared/validations/operations-centrales.ts";
import type { z } from "zod";
import type {
  ConsolidationNationaleOperation,
  DetailOperationCentrale,
  DossierExecutionProvincial,
  OperationCentrale,
  ProvinceOperation,
  StatutOperationCentrale,
} from "../../../shared/types/operations-centrales.ts";

export class ErreurOperationCentrale extends Error {
  readonly statutHttp: number;
  constructor(message: string, statutHttp: number = 400) {
    super(message);
    this.name = "ErreurOperationCentrale";
    this.statutHttp = statutHttp;
  }
}

type Database = EnvironnementApplication["Bindings"]["DB"];
type Bucket = EnvironnementApplication["Bindings"]["BUCKET"];
type Ecriture = D1PreparedStatement;

function validerCleIdempotence(cle: string): void {
  if (!/^[A-Za-z0-9._:-]{16,160}$/u.test(cle)) {
    throw new ErreurOperationCentrale("Une clé X-Idempotency-Key valide est obligatoire.", 400);
  }
}

function genererCodeOperation(annee: string): string {
  const anneeNettoyee = annee.replace(/[^0-9]/g, "").slice(0, 4) || new Date().getUTCFullYear().toString();
  const aleatoire = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `OPC-${anneeNettoyee}-${aleatoire}`;
}

function genererReferenceDossier(codeProvince: string, annee: string): string {
  const code = codeProvince.replace(/^TD-/u, "").toUpperCase();
  const aleatoire = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `DEX-${code}-${annee.slice(0, 4)}-${aleatoire}`;
}

export async function creerOperationCentrale(
  db: Database,
  utilisateur: UtilisateurSession,
  entree: CreationOperationCentraleSaisie,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") {
    throw new ErreurOperationCentrale("Seule l’administration centrale peut créer une opération centrale de distribution.", 403);
  }
  validerCleIdempotence(cle);

  const routeApi = "/api/operations-centrales";
  const rejouee = await rejouerOperationIdempotente<{ id: string; code_operation: string; statut: string }>({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
  });
  if (rejouee) return rejouee;

  // Vérifier la validité des provinces demandées
  const provincesDemandes = entree.provinces.map((p: { province_id: string }) => p.province_id);
  const placesSql = provincesDemandes.map(() => "?").join(",");
  const provincesExistantes = await db
    .prepare(`SELECT id, code, nom FROM provinces WHERE id IN (${placesSql}) AND actif = 1`)
    .bind(...provincesDemandes)
    .all<{ id: string; code: string; nom: string }>();

  if (provincesExistantes.results.length !== provincesDemandes.length) {
    throw new ErreurOperationCentrale("Une ou plusieurs provinces sélectionnées sont introuvables ou inactives.", 400);
  }

  const id = crypto.randomUUID();
  const codeOperation = genererCodeOperation(entree.annee_campagne);
  const maintenant = new Date().toISOString();

  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    {
      operation: "création de l'opération centrale de distribution",
      instruction: db.prepare(
        `INSERT INTO operations_centrales_distribution
         (id, code_operation, reference_administrative, intitule, description_contexte,
          type_intervention, annee_campagne, institution_responsable, reference_juridique,
          objectif_general, categories_beneficiaires, criteres_eligibilite, sources_donnees_ciblage,
          nombre_previsionnel_menages, nombre_previsionnel_personnes, date_debut_prevue, date_fin_prevue,
          date_limite_preparation_provinciale, date_limite_transmission_rapports, source_vivres,
          articles_cibles_json, notes_transport_reception, statut, cree_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BROUILLON', ?)`,
      ).bind(
        id,
        codeOperation,
        entree.reference_administrative ?? null,
        entree.intitule,
        entree.description_contexte ?? null,
        entree.type_intervention,
        entree.annee_campagne,
        entree.institution_responsable ?? "MASSNAH",
        entree.reference_juridique ?? null,
        entree.objectif_general ?? null,
        entree.categories_beneficiaires ?? null,
        entree.criteres_eligibilite ?? null,
        entree.sources_donnees_ciblage ?? null,
        entree.nombre_previsionnel_menages ?? null,
        entree.nombre_previsionnel_personnes ?? null,
        entree.date_debut_prevue ?? null,
        entree.date_fin_prevue ?? null,
        entree.date_limite_preparation_provinciale ?? null,
        entree.date_limite_transmission_rapports ?? null,
        entree.source_vivres ?? "ONASA",
        JSON.stringify(entree.articles_cibles ?? []),
        entree.notes_transport_reception ?? null,
        utilisateur.id,
      ),
      changementsAttendus: 1,
    },
    ...entree.provinces.map((prov: { province_id: string; quantite_allouee_prevue?: number | null | undefined; nombre_menages_cibles_province?: number | null | undefined; instructions_specifiques?: string | null | undefined }) => ({
      operation: `affectation de la province ${prov.province_id}`,
      instruction: db.prepare(
        `INSERT INTO operations_centrales_provinces
         (id, operation_id, province_id, quantite_allouee_prevue, nombre_menages_cibles_province, instructions_specifiques)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        prov.province_id,
        prov.quantite_allouee_prevue ?? null,
        prov.nombre_menages_cibles_province ?? null,
        prov.instructions_specifiques ?? null,
      ),
      changementsAttendus: 1,
    })),
    {
      operation: "historique initial",
      instruction: db.prepare(
        `INSERT INTO historique_operations_centrales
         (id, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id, request_id)
         VALUES (?, ?, NULL, 'BROUILLON', 'Création initiale du projet d’opération centrale.', ?, ?)`,
      ).bind(crypto.randomUUID(), id, utilisateur.id, obtenirRequestIdAudit(utilisateur)),
      changementsAttendus: 1,
    },
    {
      operation: "audit de création de l'opération",
      instruction: creerInstructionAudit(db, {
        utilisateur,
        action: "CREATION_OPERATION_CENTRALE",
        entiteType: "OPERATION_CENTRALE",
        entiteId: id,
        adresseIp,
        donneesApres: JSON.stringify({
          code_operation: codeOperation,
          intitule: entree.intitule,
          provinces: provincesDemandes,
          cree_le: maintenant,
        }),
      }),
      changementsAttendus: 1,
    },
  ];

  const corps = {
    id,
    code_operation: codeOperation,
    intitule: entree.intitule,
    statut: "BROUILLON",
    nombre_provinces: provincesDemandes.length,
  };

  return executerOperationIdempotente({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
    statutHttp: 201,
    corps,
    instructions,
  });
}

export async function modifierOperationCentrale(
  db: Database,
  utilisateur: UtilisateurSession,
  id: string,
  entree: z.infer<typeof schemaModificationOperationCentrale>,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") {
    throw new ErreurOperationCentrale("Accès refusé.", 403);
  }
  validerCleIdempotence(cle);

  const existante = await db
    .prepare("SELECT * FROM operations_centrales_distribution WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();

  if (!existante) {
    throw new ErreurOperationCentrale("Opération centrale introuvable.", 404);
  }
  if (existante.statut !== "BROUILLON") {
    throw new ErreurOperationCentrale("Seule une opération en statut BROUILLON peut être modifiée.", 409);
  }

  const routeApi = `/api/operations-centrales/${id}`;
  const rejouee = await rejouerOperationIdempotente<{ message: string }>({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
  });
  if (rejouee) return rejouee;

  const provincesDemandes = entree.provinces.map((p: { province_id: string }) => p.province_id);
  const placesSql = provincesDemandes.map(() => "?").join(",");
  const provincesExistantes = await db
    .prepare(`SELECT id FROM provinces WHERE id IN (${placesSql}) AND actif = 1`)
    .bind(...provincesDemandes)
    .all<{ id: string }>();

  if (provincesExistantes.results.length !== provincesDemandes.length) {
    throw new ErreurOperationCentrale("Une ou plusieurs provinces sont introuvables ou inactives.", 400);
  }

  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    {
      operation: "mise à jour des champs de l'opération",
      instruction: db.prepare(
        `UPDATE operations_centrales_distribution
         SET reference_administrative = ?, intitule = ?, description_contexte = ?,
             type_intervention = ?, annee_campagne = ?, institution_responsable = ?,
             reference_juridique = ?, objectif_general = ?, categories_beneficiaires = ?,
             criteres_eligibilite = ?, sources_donnees_ciblage = ?, nombre_previsionnel_menages = ?,
             nombre_previsionnel_personnes = ?, date_debut_prevue = ?, date_fin_prevue = ?,
             date_limite_preparation_provinciale = ?, date_limite_transmission_rapports = ?,
             source_vivres = ?, articles_cibles_json = ?, notes_transport_reception = ?,
             modifie_le = datetime('now')
         WHERE id = ?`,
      ).bind(
        entree.reference_administrative !== undefined ? entree.reference_administrative : (existante.reference_administrative ?? null),
        entree.intitule ?? (existante.intitule as string),
        entree.description_contexte !== undefined ? entree.description_contexte : (existante.description_contexte ?? null),
        entree.type_intervention ?? (existante.type_intervention as string),
        entree.annee_campagne ?? (existante.annee_campagne as string),
        entree.institution_responsable ?? (existante.institution_responsable as string ?? "MASSNAH"),
        entree.reference_juridique !== undefined ? entree.reference_juridique : (existante.reference_juridique ?? null),
        entree.objectif_general !== undefined ? entree.objectif_general : (existante.objectif_general ?? null),
        entree.categories_beneficiaires !== undefined ? entree.categories_beneficiaires : (existante.categories_beneficiaires ?? null),
        entree.criteres_eligibilite !== undefined ? entree.criteres_eligibilite : (existante.criteres_eligibilite ?? null),
        entree.sources_donnees_ciblage !== undefined ? entree.sources_donnees_ciblage : (existante.sources_donnees_ciblage ?? null),
        entree.nombre_previsionnel_menages !== undefined ? entree.nombre_previsionnel_menages : (existante.nombre_previsionnel_menages ?? null),
        entree.nombre_previsionnel_personnes !== undefined ? entree.nombre_previsionnel_personnes : (existante.nombre_previsionnel_personnes ?? null),
        entree.date_debut_prevue !== undefined ? entree.date_debut_prevue : (existante.date_debut_prevue ?? null),
        entree.date_fin_prevue !== undefined ? entree.date_fin_prevue : (existante.date_fin_prevue ?? null),
        entree.date_limite_preparation_provinciale !== undefined ? entree.date_limite_preparation_provinciale : (existante.date_limite_preparation_provinciale ?? null),
        entree.date_limite_transmission_rapports !== undefined ? entree.date_limite_transmission_rapports : (existante.date_limite_transmission_rapports ?? null),
        entree.source_vivres ?? (existante.source_vivres as string ?? "ONASA"),
        entree.articles_cibles !== undefined ? JSON.stringify(entree.articles_cibles) : (existante.articles_cibles_json ?? "[]"),
        entree.notes_transport_reception !== undefined ? entree.notes_transport_reception : (existante.notes_transport_reception ?? null),
        id,
      ),
      changementsAttendus: 1,
    },
    {
      operation: "suppression des anciennes affectations de provinces",
      instruction: db.prepare("DELETE FROM operations_centrales_provinces WHERE operation_id = ?").bind(id),
    },
    ...entree.provinces.map((prov: { province_id: string; quantite_allouee_prevue?: number | null | undefined; nombre_menages_cibles_province?: number | null | undefined; instructions_specifiques?: string | null | undefined }) => ({
      operation: `réaffectation de la province ${prov.province_id}`,
      instruction: db.prepare(
        `INSERT INTO operations_centrales_provinces
         (id, operation_id, province_id, quantite_allouee_prevue, nombre_menages_cibles_province, instructions_specifiques)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        prov.province_id,
        prov.quantite_allouee_prevue ?? null,
        prov.nombre_menages_cibles_province ?? null,
        prov.instructions_specifiques ?? null,
      ),
      changementsAttendus: 1,
    })),
    {
      operation: "audit de modification",
      instruction: creerInstructionAudit(db, {
        utilisateur,
        action: "MODIFICATION_OPERATION_CENTRALE",
        entiteType: "OPERATION_CENTRALE",
        entiteId: id,
        adresseIp,
        donneesApres: JSON.stringify({ intitule: entree.intitule, provinces: provincesDemandes }),
      }),
      changementsAttendus: 1,
    },
  ];

  return executerOperationIdempotente({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
    statutHttp: 200,
    corps: { message: "Opération centrale mise à jour." },
    instructions,
  });
}

export async function changerStatutOperationCentrale(
  db: Database,
  utilisateur: UtilisateurSession,
  id: string,
  entree: z.infer<typeof schemaTransitionStatutOperation>,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") {
    throw new ErreurOperationCentrale("Seule l’administration centrale peut modifier le cycle de vie de l’opération.", 403);
  }
  validerCleIdempotence(cle);

  const operation = await db
    .prepare(
      `SELECT id, code_operation, intitule, statut, annee_campagne,
              date_debut_prevue, date_fin_prevue,
              (SELECT COUNT(*) FROM operations_centrales_provinces WHERE operation_id = operations_centrales_distribution.id) AS nb_provinces,
              (SELECT COUNT(*) FROM approbations_operations WHERE operation_id = operations_centrales_distribution.id AND type_approbation != 'REFERENCE_CADRE_REGLEMENTAIRE' AND decision IN ('APPROUVE', 'APPROUVE_AVEC_RESERVES')) AS nb_approbations,
              (SELECT COUNT(*) FROM approbations_operations WHERE operation_id = operations_centrales_distribution.id AND type_approbation = 'REFERENCE_CADRE_REGLEMENTAIRE') AS nb_cadre_reglementaire
       FROM operations_centrales_distribution WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      code_operation: string;
      intitule: string;
      statut: StatutOperationCentrale;
      annee_campagne: string;
      date_debut_prevue: string | null;
      date_fin_prevue: string | null;
      nb_provinces: number;
      nb_approbations: number;
      nb_cadre_reglementaire: number;
    }>();

  if (!operation) {
    throw new ErreurOperationCentrale("Opération centrale introuvable.", 404);
  }

  const statutActuel = operation.statut;
  const cible = entree.nouveau_statut;

  // Validation de la machine d'état
  if (cible === "ANNULEE") {
    if (statutActuel === "CLOTUREE") {
      throw new ErreurOperationCentrale("Une opération déjà clôturée ne peut plus être annulée.", 409);
    }
  } else if (cible === "BROUILLON") {
    if (statutActuel !== "SOUMISE_A_APPROBATION") {
      throw new ErreurOperationCentrale("Seule une opération soumise à approbation peut être retournée en statut BROUILLON pour corrections.", 409);
    }
    if (!entree.motif_ou_commentaire || entree.motif_ou_commentaire.trim().length < 5) {
      throw new ErreurOperationCentrale("Un motif explicatif d'au moins 5 caractères est requis pour retourner une opération en correction.", 400);
    }
  } else if (cible === "SOUMISE_A_APPROBATION") {
    if (statutActuel !== "BROUILLON") {
      throw new ErreurOperationCentrale("Seul un brouillon peut être soumis à approbation.", 409);
    }
    if (operation.nb_provinces === 0) {
      throw new ErreurOperationCentrale("L'opération doit cibler au moins une province avant soumission.", 400);
    }
  } else if (cible === "APPROUVEE") {
    if (statutActuel !== "SOUMISE_A_APPROBATION" && statutActuel !== "BROUILLON") {
      throw new ErreurOperationCentrale("L'opération doit être en cours d'approbation.", 409);
    }
    if (operation.nb_approbations === 0) {
      if (operation.nb_cadre_reglementaire > 0) {
        throw new ErreurOperationCentrale(
          "L'opération dispose d'une référence au cadre réglementaire général (Arrêté 0033), mais celle-ci ne constitue pas une décision d'approbation opérationnelle. Une décision formelle (Comité de pilotage ou Validation ministérielle) propre à cette opération est obligatoirement requise.",
          400
        );
      }
      throw new ErreurOperationCentrale("Au moins un acte d'approbation formel propre à cette opération (Comité de pilotage ou Validation ministérielle) doit être enregistré avant de déclarer l'opération approuvée.", 400);
    }
  } else if (cible === "OUVERTE") {
    if (statutActuel !== "APPROUVEE") {
      throw new ErreurOperationCentrale("L'opération doit être formellement APPROUVEE avant d'être ouverte aux délégations provinciales.", 409);
    }
  } else if (cible === "EN_COURS") {
    if (statutActuel !== "OUVERTE") {
      throw new ErreurOperationCentrale("L'opération doit être OUVERTE pour passer en cours d'exécution.", 409);
    }
  } else if (cible === "EN_CONSOLIDATION") {
    if (statutActuel !== "EN_COURS" && statutActuel !== "OUVERTE") {
      throw new ErreurOperationCentrale("Seule une opération en cours peut être mise en consolidation.", 409);
    }
  } else if (cible === "CLOTUREE") {
    if (statutActuel !== "EN_CONSOLIDATION") {
      throw new ErreurOperationCentrale("L'opération doit passer par l'étape de consolidation avant clôture définitive.", 409);
    }
  }

  const routeApi = `/api/operations-centrales/${id}/statut`;
  const rejouee = await rejouerOperationIdempotente<{ message: string; nouveau_statut: string }>({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
  });
  if (rejouee) return rejouee;

  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    {
      operation: `mise à jour du statut vers ${cible}`,
      instruction: db.prepare(
        `UPDATE operations_centrales_distribution
         SET statut = ?, motif_annulation = COALESCE(?, motif_annulation), modifie_le = datetime('now')
         WHERE id = ?`,
      ).bind(cible, entree.motif_annulation ?? null, id),
      changementsAttendus: 1,
    },
    {
      operation: "enregistrement de l'historique de statut",
      instruction: db.prepare(
        `INSERT INTO historique_operations_centrales
         (id, operation_id, statut_precedent, nouveau_statut, motif_ou_commentaire, auteur_id, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), id, statutActuel, cible, entree.motif_ou_commentaire ?? entree.motif_annulation ?? null, utilisateur.id, obtenirRequestIdAudit(utilisateur)),
      changementsAttendus: 1,
    },
  ];

  // Si on passe à OUVERTE, générer atomiquement un dossier d'exécution par province ciblée !
  if (cible === "OUVERTE") {
    const provinces = await db
      .prepare(
        `SELECT ocp.province_id, p.code
         FROM operations_centrales_provinces ocp
         INNER JOIN provinces p ON p.id = ocp.province_id
         WHERE ocp.operation_id = ?`,
      )
      .bind(id)
      .all<{ province_id: string; code: string }>();

    for (const prov of provinces.results) {
      const refDossier = genererReferenceDossier(prov.code, operation.annee_campagne);
      instructions.push({
        operation: `création du dossier d'exécution provincial pour ${prov.code}`,
        instruction: db.prepare(
          `INSERT INTO dossiers_execution_provinciaux
           (id, operation_id, province_id, reference_dossier, statut_execution)
           VALUES (?, ?, ?, ?, 'ASSIGNE')
           ON CONFLICT(operation_id, province_id) DO NOTHING`,
        ).bind(crypto.randomUUID(), id, prov.province_id, refDossier),
      });
    }
  }

  instructions.push({
    operation: "audit de changement de statut",
    instruction: creerInstructionAudit(db, {
      utilisateur,
      action: `TRANSITION_STATUT_OPERATION_${cible}`,
      entiteType: "OPERATION_CENTRALE",
      entiteId: id,
      adresseIp,
      donneesApres: JSON.stringify({ statut_precedent: statutActuel, nouveau_statut: cible, motif: entree.motif_ou_commentaire }),
    }),
    changementsAttendus: 1,
  });

  return executerOperationIdempotente({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
    statutHttp: 200,
    corps: {
      message: `Statut de l’opération mis à jour vers ${cible}.`,
      nouveau_statut: cible,
    },
    instructions,
  });
}

export async function enregistrerApprobation(
  db: Database,
  utilisateur: UtilisateurSession,
  operationId: string,
  entree: z.infer<typeof schemaEnregistrementApprobation>,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") {
    throw new ErreurOperationCentrale("Seule l'administration centrale peut enregistrer une approbation de gouvernance.", 403);
  }
  validerCleIdempotence(cle);

  const existante = await db.prepare("SELECT id FROM operations_centrales_distribution WHERE id = ?").bind(operationId).first();
  if (!existante) throw new ErreurOperationCentrale("Opération centrale introuvable.", 404);

  // Pour les décisions opérationnelles propres (hors cadre réglementaire général),
  // interdire formellement le recyclage de la même référence d'acte sur une autre opération.
  if (entree.type_approbation !== "REFERENCE_CADRE_REGLEMENTAIRE") {
    const acteExistant = await db
      .prepare(
        `SELECT ao.id, op.code_operation 
         FROM approbations_operations ao
         INNER JOIN operations_centrales_distribution op ON op.id = ao.operation_id
         WHERE ao.reference_acte = ? AND ao.operation_id != ? AND ao.type_approbation != 'REFERENCE_CADRE_REGLEMENTAIRE'`
      )
      .bind(entree.reference_acte, operationId)
      .first<{ id: string; code_operation: string }>();

    if (acteExistant) {
      throw new ErreurOperationCentrale(
        `La référence d'acte « ${entree.reference_acte} » a déjà été enregistrée pour l'opération ${acteExistant.code_operation}. Chaque décision opérationnelle doit reposer sur un acte distinct et traçable.`,
        409
      );
    }
  }

  // Vérifier la pièce jointe si fournie
  if (entree.piece_jointe_id) {
    const docVerif = await db
      .prepare("SELECT id FROM documents_operations WHERE id = ? AND operation_id = ?")
      .bind(entree.piece_jointe_id, operationId)
      .first();
    if (!docVerif) {
      throw new ErreurOperationCentrale(
        "Le document justificatif associé à l'approbation est introuvable ou n'est pas lié à cette opération.",
        400
      );
    }
  }

  const routeApi = `/api/operations-centrales/${operationId}/approbations`;
  const rejouee = await rejouerOperationIdempotente<{ id: string; message: string }>({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
  });
  if (rejouee) return rejouee;

  const approbationId = crypto.randomUUID();
  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    {
      operation: "insertion de l'acte d'approbation",
      instruction: db.prepare(
        `INSERT INTO approbations_operations
         (id, operation_id, type_approbation, instance_decisionnaire, reference_acte,
          date_decision, signataire_nom, signataire_qualite, decision, reserves_ou_conditions,
          piece_jointe_id, enregistre_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        approbationId,
        operationId,
        entree.type_approbation,
        entree.instance_decisionnaire,
        entree.reference_acte,
        entree.date_decision,
        entree.signataire_nom,
        entree.signataire_qualite,
        entree.decision,
        entree.reserves_ou_conditions ?? null,
        entree.piece_jointe_id ?? null,
        utilisateur.id,
      ),
      changementsAttendus: 1,
    },
    {
      operation: "audit d'approbation",
      instruction: creerInstructionAudit(db, {
        utilisateur,
        action: "ENREGISTREMENT_APPROBATION_OPERATION",
        entiteType: "OPERATION_CENTRALE",
        entiteId: operationId,
        adresseIp,
        donneesApres: JSON.stringify({ type: entree.type_approbation, acte: entree.reference_acte, decision: entree.decision }),
      }),
      changementsAttendus: 1,
    },
  ];

  return executerOperationIdempotente({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
    statutHttp: 201,
    corps: { id: approbationId, message: "Approbation administrative enregistrée." },
    instructions,
  });
}

export async function televerserDocumentOperation(
  db: Database,
  bucket: Bucket,
  utilisateur: UtilisateurSession,
  operationId: string,
  fichier: File,
  categorie: string,
  intitule: string,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "ADMIN_CENTRAL") {
    throw new ErreurOperationCentrale("Accès refusé.", 403);
  }
  validerCleIdempotence(cle);

  const existante = await db.prepare("SELECT id FROM operations_centrales_distribution WHERE id = ?").bind(operationId).first();
  if (!existante) throw new ErreurOperationCentrale("Opération introuvable.", 404);

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mimeReel = detecterTypeMimeDocument(octets);
  if (!mimeReel || (mimeReel !== "application/pdf" && !mimeReel.startsWith("image/"))) {
    throw new ErreurOperationCentrale("Le document doit être au format PDF ou image valide.", 400);
  }

  const documentId = crypto.randomUUID();
  const nomFichierNettoye = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cleR2 = `operations-centrales/${operationId}/${documentId}-${nomFichierNettoye}`;

  await televerserPuisReferencerR2({
    bucket,
    cle: cleR2,
    contenu: octets,
    options: { httpMetadata: { contentType: mimeReel } },
    referenceDejaPresente: async () => {
      const ligne = await db.prepare("SELECT 1 FROM documents_operations WHERE cle_r2 = ?").bind(cleR2).first();
      return Boolean(ligne);
    },
    enregistrerReference: async () => {
      await db.batch([
        db.prepare(
          `INSERT INTO documents_operations
           (id, operation_id, categorie_document, intitule, cle_r2, nom_fichier_original, type_mime, taille_octets, televerse_par)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(documentId, operationId, categorie, intitule, cleR2, fichier.name, mimeReel, octets.byteLength, utilisateur.id),
        creerInstructionAudit(db, {
          utilisateur,
          action: "TELEVERSEMENT_DOCUMENT_OPERATION",
          entiteType: "OPERATION_CENTRALE",
          entiteId: operationId,
          adresseIp,
          donneesApres: JSON.stringify({ categorie, intitule, nom: fichier.name, taille: octets.byteLength }),
        }),
      ]);
    },
    televerserObjet: true,
  });

  return { id: documentId, intitule, nom_fichier_original: fichier.name, categorie };
}

export async function obtenirDocumentOperation(
  db: Database,
  bucket: Bucket,
  utilisateur: UtilisateurSession,
  operationId: string,
  docId: string,
) {
  // Vérification de lecture
  await lireDetailOperationCentrale(db, utilisateur, operationId);

  const doc = await db
    .prepare("SELECT id, cle_r2, nom_fichier_original, type_mime, taille_octets FROM documents_operations WHERE id = ? AND operation_id = ?")
    .bind(docId, operationId)
    .first<{ id: string; cle_r2: string; nom_fichier_original: string; type_mime: string; taille_octets: number }>();

  if (!doc) throw new ErreurOperationCentrale("Document introuvable.", 404);

  const objetR2 = await bucket.get(doc.cle_r2);
  if (!objetR2 || !objetR2.body) {
    throw new ErreurOperationCentrale("Le fichier binaire est indisponible sur le stockage sécurisé.", 404);
  }

  return {
    nom_fichier_original: doc.nom_fichier_original,
    type_mime: doc.type_mime,
    taille_octets: doc.taille_octets,
    corps: objetR2.body,
  };
}

export async function listerOperationsCentrales(
  db: Database,
  utilisateur: UtilisateurSession,
  filtres: z.infer<typeof schemaPaginationOperationsCentrales>,
): Promise<{ elements: OperationCentrale[]; total: number; limite: number; decalage: number }> {
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  const provinceFiltre = estDelegue ? utilisateur.province_id : filtres.province_id;

  const conditions: string[] = [];
  const valeurs: (string | number)[] = [];

  if (provinceFiltre) {
    conditions.push("EXISTS (SELECT 1 FROM operations_centrales_provinces ocp WHERE ocp.operation_id = op.id AND ocp.province_id = ?)");
    valeurs.push(provinceFiltre);
  }

  if (filtres.statut) {
    conditions.push("op.statut = ?");
    valeurs.push(filtres.statut);
  }

  if (filtres.annee) {
    conditions.push("op.annee_campagne = ?");
    valeurs.push(filtres.annee);
  }

  if (filtres.recherche && filtres.recherche.trim()) {
    conditions.push("(op.code_operation LIKE ? OR op.intitule LIKE ? OR op.reference_administrative LIKE ?)");
    const motif = `%${filtres.recherche.trim()}%`;
    valeurs.push(motif, motif, motif);
  }

  const clauseWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [elements, total] = await Promise.all([
    db.prepare(
      `SELECT op.id, op.code_operation, op.reference_administrative, op.intitule,
              op.type_intervention, op.annee_campagne, op.institution_responsable,
              op.reference_juridique, op.statut, op.date_debut_prevue, op.date_fin_prevue,
              op.source_vivres, op.cree_le, op.modifie_le, op.cree_par, u.nom_complet AS cree_par_nom,
              (SELECT COUNT(*) FROM operations_centrales_provinces WHERE operation_id = op.id) AS nombre_provinces,
              COALESCE((SELECT SUM(total_menages_servis) FROM dossiers_execution_provinciaux WHERE operation_id = op.id), 0) AS total_menages_servis_consolide,
              COALESCE((SELECT SUM(quantite_totale_distribuee) FROM dossiers_execution_provinciaux WHERE operation_id = op.id), 0) AS quantite_distribuee_consolidee
       FROM operations_centrales_distribution op
       LEFT JOIN utilisateurs u ON u.id = op.cree_par
       ${clauseWhere}
       ORDER BY op.cree_le DESC
       LIMIT ? OFFSET ?`,
    ).bind(...valeurs, filtres.limite, filtres.decalage).all<OperationCentrale>(),

    db.prepare(
      `SELECT COUNT(*) AS total
       FROM operations_centrales_distribution op
       ${clauseWhere}`,
    ).bind(...valeurs).first<{ total: number }>(),
  ]);

  return {
    elements: elements.results,
    total: total?.total ?? 0,
    limite: filtres.limite,
    decalage: filtres.decalage,
  };
}

export async function lireDetailOperationCentrale(
  db: Database,
  utilisateur: UtilisateurSession,
  id: string,
): Promise<DetailOperationCentrale> {
  const op = await db
    .prepare(
      `SELECT op.*, u.nom_complet AS cree_par_nom
       FROM operations_centrales_distribution op
       LEFT JOIN utilisateurs u ON u.id = op.cree_par
       WHERE op.id = ?`,
    )
    .bind(id)
    .first<OperationCentrale>();

  if (!op) {
    throw new ErreurOperationCentrale("Opération centrale introuvable.", 404);
  }

  // Si délégué provincial, vérifier que sa province est bien ciblée
  if (utilisateur.role === "DELEGUE_PROVINCIAL") {
    if (!utilisateur.province_id) throw new ErreurOperationCentrale("Accès refusé.", 403);
    const assignation = await db
      .prepare("SELECT 1 FROM operations_centrales_provinces WHERE operation_id = ? AND province_id = ?")
      .bind(id, utilisateur.province_id)
      .first();
    if (!assignation) {
      throw new ErreurOperationCentrale("Cette opération n’est pas affectée à votre province.", 403);
    }
  }

  const [provinces, dossiers, approbations, documents] = await Promise.all([
    db.prepare(
      `SELECT ocp.*, p.nom AS province_nom, p.code AS province_code
       FROM operations_centrales_provinces ocp
       INNER JOIN provinces p ON p.id = ocp.province_id
       WHERE ocp.operation_id = ?
       ORDER BY p.nom`,
    ).bind(id).all<ProvinceOperation>(),

    db.prepare(
      `SELECT dex.*, p.nom AS province_nom, p.code AS province_code,
              (SELECT COUNT(*) FROM distributions_provinciales WHERE dossier_execution_id = dex.id) AS nombre_distributions_provinciales
       FROM dossiers_execution_provinciaux dex
       INNER JOIN provinces p ON p.id = dex.province_id
       WHERE dex.operation_id = ?
       ORDER BY p.nom`,
    ).bind(id).all<DossierExecutionProvincial>(),

    db.prepare(
      `SELECT a.*, u.nom_complet AS enregistre_par_nom
       FROM approbations_operations a
       LEFT JOIN utilisateurs u ON u.id = a.enregistre_par
       WHERE a.operation_id = ?
       ORDER BY a.date_decision DESC, a.enregistre_le DESC`,
    ).bind(id).all(),

    db.prepare(
      `SELECT id, operation_id, categorie_document, intitule, cle_r2, nom_fichier_original, type_mime, taille_octets, televerse_par, cree_le
       FROM documents_operations
       WHERE operation_id = ?
       ORDER BY cree_le DESC`,
    ).bind(id).all(),
  ]);

  return {
    ...op,
    provinces: utilisateur.role === "DELEGUE_PROVINCIAL"
      ? provinces.results.filter((p) => p.province_id === utilisateur.province_id)
      : provinces.results,
    dossiers: utilisateur.role === "DELEGUE_PROVINCIAL"
      ? dossiers.results.filter((d) => d.province_id === utilisateur.province_id)
      : dossiers.results,
    approbations: approbations.results as any,
    documents: documents.results as any,
  };
}

export async function lireConsolidationNationale(
  db: Database,
  utilisateur: UtilisateurSession,
  id: string,
): Promise<ConsolidationNationaleOperation> {
  const detail = await lireDetailOperationCentrale(db, utilisateur, id);

  const dossiers = detail.dossiers;
  const nombreProvinces = detail.provinces.length;
  const nombreDossiersOuverts = dossiers.length;
  const nombreDossiersTermines = dossiers.filter((d: DossierExecutionProvincial) => d.statut_execution === "TERMINE" || d.statut_execution === "VALIDE_CENTRAL").length;

  const totalMenagesServis = dossiers.reduce((acc: number, d: DossierExecutionProvincial) => acc + (d.total_menages_servis || 0), 0);
  const totalPersonnesServies = dossiers.reduce((acc: number, d: DossierExecutionProvincial) => acc + (d.total_personnes_servies || 0), 0);
  const quantiteTotaleDistribuee = dossiers.reduce((acc: number, d: DossierExecutionProvincial) => acc + (d.quantite_totale_distribuee || 0), 0);

  const nbPrevMenages = detail.nombre_previsionnel_menages || 0;
  const tauxAvancement = nbPrevMenages > 0 ? Math.min(100, Math.round((totalMenagesServis / nbPrevMenages) * 100)) : (nombreDossiersTermines > 0 ? Math.round((nombreDossiersTermines / Math.max(1, nombreProvinces)) * 100) : 0);

  return {
    operation_id: detail.id,
    code_operation: detail.code_operation,
    intitule: detail.intitule,
    statut: detail.statut,
    nombre_provinces_ciblees: nombreProvinces,
    nombre_dossiers_ouverts: nombreDossiersOuverts,
    nombre_dossiers_termines: nombreDossiersTermines,
    nombre_previsionnel_menages_national: nbPrevMenages,
    nombre_previsionnel_personnes_national: detail.nombre_previsionnel_personnes || 0,
    total_menages_servis_national: totalMenagesServis,
    total_personnes_servies_national: totalPersonnesServies,
    quantite_totale_distribuee_national: quantiteTotaleDistribuee,
    taux_avancement_global_pourcentage: tauxAvancement,
    provinces_detail: dossiers.map((d: DossierExecutionProvincial) => ({
      province_id: d.province_id,
      province_nom: d.province_nom || "",
      province_code: d.province_code || "",
      statut_execution: d.statut_execution,
      nombre_distributions_provinciales: d.nombre_distributions_provinciales || 0,
      total_menages_servis: d.total_menages_servis,
      total_personnes_servies: d.total_personnes_servies,
      quantite_totale_distribuee: d.quantite_totale_distribuee,
      date_fin_reelle: d.date_fin_reelle ?? null,
      pv_piece_jointe_id: d.pv_piece_jointe_id || null,
    })),
  };
}

export async function mettreAJourDossierDelegue(
  db: Database,
  utilisateur: UtilisateurSession,
  operationId: string,
  entree: z.infer<typeof schemaMiseAJourDossierDelegue>,
  cle: string,
  adresseIp: string | null,
) {
  if (utilisateur.role !== "DELEGUE_PROVINCIAL" || !utilisateur.province_id) {
    throw new ErreurOperationCentrale("Seul le délégué provincial concerné peut mettre à jour ce dossier d'exécution.", 403);
  }
  validerCleIdempotence(cle);

  const dossier = await db
    .prepare("SELECT id, statut_execution FROM dossiers_execution_provinciaux WHERE operation_id = ? AND province_id = ?")
    .bind(operationId, utilisateur.province_id)
    .first<{ id: string; statut_execution: string }>();

  if (!dossier) {
    throw new ErreurOperationCentrale("Dossier d’exécution provincial introuvable pour votre province.", 404);
  }

  const routeApi = `/api/provincial/operations-centrales/${operationId}/dossier`;
  const rejouee = await rejouerOperationIdempotente<{ message: string }>({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
  });
  if (rejouee) return rejouee;

  // Calculer automatiquement les métriques réelles à partir des distributions provinciales liées à ce dossier
  const statsLiaison = await db
    .prepare(
      `SELECT COUNT(*) AS total_dists,
              COALESCE(SUM(nombre_menages_cibles), 0) AS menages,
              COALESCE(SUM(nombre_personnes_cibles), 0) AS personnes
       FROM distributions_provinciales
       WHERE dossier_execution_id = ? AND statut IN ('VALIDEE_PROVINCE', 'EN_EXECUTION', 'TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL')`,
    )
    .bind(dossier.id)
    .first<{ total_dists: number; menages: number; personnes: number }>();

  const nouveauStatut = entree.statut_execution ?? dossier.statut_execution;

  const instructions: Array<{ instruction: Ecriture; operation: string; changementsAttendus?: number }> = [
    {
      operation: "mise à jour du dossier d'exécution provincial",
      instruction: db.prepare(
        `UPDATE dossiers_execution_provinciaux
         SET statut_execution = ?, plan_operationnel_local = COALESCE(?, plan_operationnel_local),
             observations_delegue = COALESCE(?, observations_delegue),
             date_debut_reelle = COALESCE(?, date_debut_reelle),
             date_fin_reelle = COALESCE(?, date_fin_reelle),
             total_menages_servis = CASE WHEN ? > 0 THEN ? ELSE total_menages_servis END,
             total_personnes_servies = CASE WHEN ? > 0 THEN ? ELSE total_personnes_servies END,
             modifie_le = datetime('now')
         WHERE id = ?`,
      ).bind(
        nouveauStatut,
        entree.plan_operationnel_local ?? null,
        entree.observations_delegue ?? null,
        entree.date_debut_reelle ?? null,
        entree.date_fin_reelle ?? null,
        statsLiaison?.menages ?? 0,
        statsLiaison?.menages ?? 0,
        statsLiaison?.personnes ?? 0,
        statsLiaison?.personnes ?? 0,
        dossier.id,
      ),
      changementsAttendus: 1,
    },
    {
      operation: "audit de mise à jour du dossier provincial",
      instruction: creerInstructionAudit(db, {
        utilisateur,
        action: "MISE_A_JOUR_DOSSIER_EXECUTION_PROVINCIAL",
        entiteType: "DOSSIER_EXECUTION_PROVINCIAL",
        entiteId: dossier.id,
        adresseIp,
        donneesApres: JSON.stringify({ operationId, statut: nouveauStatut }),
      }),
      changementsAttendus: 1,
    },
  ];

  return executerOperationIdempotente({
    db,
    utilisateur,
    routeApi,
    cle,
    chargeUtile: entree,
    statutHttp: 200,
    corps: { message: "Dossier d’exécution provincial mis à jour." },
    instructions,
  });
}

export async function listerDossiersProvince(
  db: Database,
  provinceId: string,
  filtres: { statut?: string; limite?: number; decalage?: number } = {},
): Promise<{ elements: DossierExecutionProvincial[]; total: number; limite: number; decalage: number }> {
  const limite = filtres.limite ?? 50;
  const decalage = filtres.decalage ?? 0;
  const conditions = ["dex.province_id = ?"];
  const params: (string | number)[] = [provinceId];
  if (filtres.statut) {
    conditions.push("dex.statut_execution = ?");
    params.push(filtres.statut);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [elements, total] = await Promise.all([
    db.prepare(`
      SELECT dex.*, op.code_operation, op.intitule AS intitule_operation,
        p.nom AS province_nom, p.code AS province_code,
        (SELECT COUNT(*) FROM distributions_provinciales WHERE dossier_execution_id = dex.id) AS nombre_distributions_provinciales
      FROM dossiers_execution_provinciaux dex
      INNER JOIN operations_centrales_distribution op ON op.id = dex.operation_id
      INNER JOIN provinces p ON p.id = dex.province_id
      ${where}
      ORDER BY op.cree_le DESC, dex.id
      LIMIT ? OFFSET ?
    `).bind(...params, limite, decalage).all<DossierExecutionProvincial>(),
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM dossiers_execution_provinciaux dex
      ${where}
    `).bind(...params).first<{ total: number }>(),
  ]);
  return {
    elements: elements.results,
    total: total?.total ?? 0,
    limite,
    decalage,
  };
}

export const changerStatutOperation = changerStatutOperationCentrale;
export const enregistrerApprobationOperation = enregistrerApprobation;
export const obtenirDetailOperation = lireDetailOperationCentrale;
export const calculerConsolidationNationale = lireConsolidationNationale;

