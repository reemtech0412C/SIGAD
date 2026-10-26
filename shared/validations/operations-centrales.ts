import { z } from "zod";
import {
  DECISIONS_APPROBATION,
  SOURCES_VIVRES,
  STATUTS_DOSSIER_EXECUTION,
  STATUTS_OPERATION_CENTRALE,
  TYPES_APPROBATION,
  TYPES_INTERVENTION,
} from "../types/operations-centrales";

const identifiant = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u);
const libelleCourt = z.string().trim().min(2).max(250);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être valide au format AAAA-MM-JJ.");

const schemaArticleCible = z.strictObject({
  article_id: identifiant.optional(),
  designation: z.string().trim().min(2).max(150),
  quantite_prevue: z.number().finite().positive().max(1_000_000_000),
  unite: z.string().trim().max(40).optional(),
});

const schemaAffectationProvince = z.strictObject({
  province_id: identifiant,
  quantite_allouee_prevue: z.number().finite().nonnegative().optional().nullable(),
  nombre_menages_cibles_province: z.number().int().nonnegative().optional().nullable(),
  instructions_specifiques: z.string().trim().max(2000).optional().nullable(),
});

export const schemaCreationOperationCentrale = z.strictObject({
  intitule: libelleCourt,
  reference_administrative: z.string().trim().max(100).optional().nullable(),
  description_contexte: z.string().trim().max(4000).optional().nullable(),
  type_intervention: z.enum(TYPES_INTERVENTION).default("DISTRIBUTION_GRATUITE_VIVRES"),
  annee_campagne: z.string().trim().min(4).max(20),
  institution_responsable: z.string().trim().min(2).max(120).default("MASSNAH"),
  reference_juridique: z.string().trim().max(180).optional().nullable(),
  objectif_general: z.string().trim().max(2000).optional().nullable(),
  categories_beneficiaires: z.string().trim().max(1500).optional().nullable(),
  criteres_eligibilite: z.string().trim().max(2500).optional().nullable(),
  sources_donnees_ciblage: z.string().trim().max(1500).optional().nullable(),
  nombre_previsionnel_menages: z.number().int().nonnegative().optional().nullable(),
  nombre_previsionnel_personnes: z.number().int().nonnegative().optional().nullable(),
  date_debut_prevue: dateIso.optional().nullable(),
  date_fin_prevue: dateIso.optional().nullable(),
  date_limite_preparation_provinciale: dateIso.optional().nullable(),
  date_limite_transmission_rapports: dateIso.optional().nullable(),
  source_vivres: z.enum(SOURCES_VIVRES).default("ONASA"),
  articles_cibles: z.array(schemaArticleCible).max(20).default([]),
  notes_transport_reception: z.string().trim().max(2000).optional().nullable(),
  provinces: z.array(schemaAffectationProvince).min(1, "Au moins une province doit être sélectionnée.").max(23),
}).superRefine((data, ctx) => {
  const provinces = data.provinces.map((p) => p.province_id);
  if (new Set(provinces).size !== provinces.length) {
    ctx.addIssue({ code: "custom", message: "Une province ne peut apparaître qu'une seule fois dans la sélection." });
  }
  if (data.date_debut_prevue && data.date_fin_prevue && data.date_debut_prevue > data.date_fin_prevue) {
    ctx.addIssue({ code: "custom", path: ["date_fin_prevue"], message: "La date de fin prévue doit être postérieure à la date de début." });
  }
});

export type CreationOperationCentraleSaisie = z.infer<typeof schemaCreationOperationCentrale>;

export const schemaModificationOperationCentrale = z.strictObject({
  intitule: libelleCourt,
  reference_administrative: z.string().trim().max(100).optional().nullable(),
  description_contexte: z.string().trim().max(4000).optional().nullable(),
  type_intervention: z.enum(TYPES_INTERVENTION),
  annee_campagne: z.string().trim().min(4).max(20),
  institution_responsable: z.string().trim().min(2).max(120),
  reference_juridique: z.string().trim().max(180).optional().nullable(),
  objectif_general: z.string().trim().max(2000).optional().nullable(),
  categories_beneficiaires: z.string().trim().max(1500).optional().nullable(),
  criteres_eligibilite: z.string().trim().max(2500).optional().nullable(),
  sources_donnees_ciblage: z.string().trim().max(1500).optional().nullable(),
  nombre_previsionnel_menages: z.number().int().nonnegative().optional().nullable(),
  nombre_previsionnel_personnes: z.number().int().nonnegative().optional().nullable(),
  date_debut_prevue: dateIso.optional().nullable(),
  date_fin_prevue: dateIso.optional().nullable(),
  date_limite_preparation_provinciale: dateIso.optional().nullable(),
  date_limite_transmission_rapports: dateIso.optional().nullable(),
  source_vivres: z.enum(SOURCES_VIVRES),
  articles_cibles: z.array(schemaArticleCible).max(20).default([]),
  notes_transport_reception: z.string().trim().max(2000).optional().nullable(),
  provinces: z.array(schemaAffectationProvince).min(1).max(23),
});

export const schemaTransitionStatutOperation = z.strictObject({
  nouveau_statut: z.enum(STATUTS_OPERATION_CENTRALE),
  motif_ou_commentaire: z.string().trim().min(2).max(1000).optional(),
  motif_annulation: z.string().trim().min(5).max(1000).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.nouveau_statut === "ANNULEE" && (!data.motif_annulation || data.motif_annulation.trim().length < 5)) {
    ctx.addIssue({ code: "custom", path: ["motif_annulation"], message: "Un motif d'annulation motivé (minimum 5 caractères) est obligatoire." });
  }
});

export const schemaEnregistrementApprobation = z.strictObject({
  type_approbation: z.enum(TYPES_APPROBATION),
  instance_decisionnaire: z.string().trim().min(2).max(150),
  reference_acte: z.string().trim().min(2).max(120),
  date_decision: dateIso,
  signataire_nom: z.string().trim().min(2).max(120),
  signataire_qualite: z.string().trim().min(2).max(120),
  decision: z.enum(DECISIONS_APPROBATION),
  reserves_ou_conditions: z.string().trim().max(2000).optional().nullable(),
  piece_jointe_id: identifiant.optional().nullable(),
});

export const schemaMiseAJourDossierDelegue = z.strictObject({
  statut_execution: z.enum(STATUTS_DOSSIER_EXECUTION).optional(),
  plan_operationnel_local: z.string().trim().max(3000).optional().nullable(),
  observations_delegue: z.string().trim().max(2000).optional().nullable(),
  date_debut_reelle: dateIso.optional().nullable(),
  date_fin_reelle: dateIso.optional().nullable(),
});

export const schemaPaginationOperationsCentrales = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(100).optional(),
  statut: z.enum(STATUTS_OPERATION_CENTRALE).optional(),
  annee: z.string().trim().max(20).optional(),
  province_id: identifiant.optional(),
});
