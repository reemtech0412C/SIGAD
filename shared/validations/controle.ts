import { z } from "zod";

const identifiant = z.string().trim().min(1).max(160);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const pagination = {
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
};

export const TYPES_OPERATION_CONTROLE = [
  "APPROVISIONNEMENT_CENTRAL",
  "DISTRIBUTION_PROVINCIALE",
  "STOCK_PROVINCIAL",
] as const;

export const STATUTS_OPERATION_CONTROLE = [
  "BROUILLON",
  "VALIDEE",
  "EN_EXPEDITION",
  "PARTIELLEMENT_RECEPTIONNEE",
  "RECEPTIONNEE",
  "EN_RAPPROCHEMENT",
  "CLOTUREE",
  "PLANIFIEE",
  "RECEPTIONNEE_AVEC_ECART",
  "EN_ECART",
  "EN_PREPARATION",
  "VALIDEE_PROVINCE",
  "EN_EXECUTION",
  "TERMINEE_PROVINCE",
  "RETOURNEE_POUR_CORRECTION",
  "CLOTUREE_CENTRAL",
  "RESERVATION",
  "RECEPTION",
  "ENTREE",
  "SORTIE_DISTRIBUTION",
  "AJUSTEMENT_POSITIF",
  "AJUSTEMENT_NEGATIF",
  "TRANSFERT_ENTRANT",
  "TRANSFERT_SORTANT",
  "PERTE",
] as const;

export const schemaFiltresControle = z.strictObject({
  ...pagination,
  type_operation: z.enum(TYPES_OPERATION_CONTROLE).optional(),
  province_id: identifiant.optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
  statut: z.enum(STATUTS_OPERATION_CONTROLE).optional(),
  partenaire_id: identifiant.optional(),
  recherche: z.string().trim().max(120).optional(),
}).superRefine((valeur, contexte) => {
  if (valeur.date_debut && valeur.date_fin && valeur.date_debut > valeur.date_fin) {
    contexte.addIssue({ code: "custom", path: ["date_fin"], message: "La date de fin doit être postérieure à la date de début." });
  }
});

export const schemaFiltresClotures = z.strictObject({ ...pagination, province_id: identifiant.optional() });

export const schemaFiltresObservations = z.strictObject({
  ...pagination,
  province_id: identifiant.optional(),
  statut: z.enum(["OUVERTE", "TRAITEE", "CLASSEE"]).optional(),
  niveau_gravite: z.enum(["INFO", "AVERTISSEMENT", "CRITIQUE"]).optional(),
  operation_type: z.enum(TYPES_OPERATION_CONTROLE).optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
}).superRefine((valeur, contexte) => {
  if (valeur.date_debut && valeur.date_fin && valeur.date_debut > valeur.date_fin) {
    contexte.addIssue({ code: "custom", path: ["date_fin"], message: "La date de fin doit être postérieure à la date de début." });
  }
});

export const schemaCreationObservation = z.strictObject({
  operation_type: z.enum(TYPES_OPERATION_CONTROLE),
  operation_id: identifiant,
  province_id: identifiant.optional(),
  niveau_gravite: z.enum(["INFO", "AVERTISSEMENT", "CRITIQUE"]).default("INFO"),
  observation: z.string().trim().min(5).max(4000),
});

export const schemaReponseObservation = z.strictObject({
  reponse_delegue: z.string().trim().min(5).max(3000),
});

export const schemaClotureObservation = z.strictObject({
  statut: z.enum(["TRAITEE", "CLASSEE"]),
  decision: z.string().trim().min(5).max(2000),
});

export const schemaFiltresCorrections = z.strictObject({
  ...pagination,
  province_id: identifiant.optional(),
  statut: z.enum(["EN_ATTENTE_DELEGUE", "CORRECTION_SOUMISE", "VALIDEE_CENTRAL"]).optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
  recherche: z.string().trim().max(120).optional(),
}).superRefine((valeur, contexte) => {
  if (valeur.date_debut && valeur.date_fin && valeur.date_debut > valeur.date_fin) {
    contexte.addIssue({ code: "custom", path: ["date_fin"], message: "La date de fin doit être postérieure à la date de début." });
  }
});

export const schemaFiltresAudit = z.strictObject({
  ...pagination,
  utilisateur_id: identifiant.optional(),
  province_id: identifiant.optional(),
  action: z.string().trim().max(100).optional(),
  entite_type: z.string().trim().max(100).optional(),
  reference: z.string().trim().max(160).optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
}).superRefine((valeur, contexte) => {
  if (valeur.date_debut && valeur.date_fin && valeur.date_debut > valeur.date_fin) {
    contexte.addIssue({ code: "custom", path: ["date_fin"], message: "La date de fin doit être postérieure à la date de début." });
  }
});

export const schemaFiltresNotifications = z.strictObject({
  ...pagination,
  lue: z.enum(["0", "1"]).transform((valeur) => valeur === "1").optional(),
  type_alerte: z.enum(["INFO", "ACTION_REQUISE", "ALERTE_STOCK", "DEMANDE_CORRECTION", "CLOTURE"]).optional(),
});

export type FiltresControle = z.infer<typeof schemaFiltresControle>;
export type FiltresObservations = z.infer<typeof schemaFiltresObservations>;
export type FiltresCorrections = z.infer<typeof schemaFiltresCorrections>;
export type FiltresAudit = z.infer<typeof schemaFiltresAudit>;
export type FiltresNotifications = z.infer<typeof schemaFiltresNotifications>;
