import { z } from "zod";

const identifiant = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u, "L’identifiant est invalide.");
const nom = z.string().trim().min(2).max(160);
const telephone = z.string().trim().regex(/^\+?[0-9 ()-]{5,32}$/u, "Le numéro de téléphone est invalide.").nullable().optional();
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être valide au format AAAA-MM-JJ.");

export const ROLES_PARTENAIRES = [
  "BAILLEUR_DE_FONDS",
  "DONATEUR",
  "FOURNISSEUR",
  "PARTENAIRE_EXECUTION",
  "TRANSPORTEUR",
  "GESTIONNAIRE_SITE",
] as const;

export const CODES_VULNERABILITE = [
  "FEMME_CHEF_MENAGE",
  "HANDICAP",
  "PERSONNE_AGEE",
  "ENFANT_NON_ACCOMPAGNE",
  "MALNUTRITION",
] as const;

export const schemaPaginationGestion = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).default(0),
});

export const schemaFiltresPartenaires = schemaPaginationGestion.extend({
  recherche: z.string().trim().max(120).optional(),
  role: z.enum(ROLES_PARTENAIRES).optional(),
  statut_validation: z.enum(["PROPOSE", "VALIDE", "INACTIF"]).optional(),
});

export const schemaCreationPartenaire = z.strictObject({
  nom,
  sigle: z.string().trim().max(40).nullable().optional(),
  type_organisation: z.string().trim().min(2).max(100),
  contact_email: z.email().max(254).nullable().optional(),
  contact_telephone: telephone,
  roles: z.array(z.enum(ROLES_PARTENAIRES)).min(1).max(6),
});

export const schemaDecisionPartenaire = z.strictObject({
  decision: z.enum(["VALIDE", "INACTIF"]),
});

export const schemaFiltresMenages = schemaPaginationGestion.extend({
  province_id: identifiant.optional(),
  departement_id: identifiant.optional(),
  localite_id: identifiant.optional(),
  categorie_population_id: identifiant.optional(),
  statut: z.enum(["ACTIF", "INACTIF", "DOUBLON_SUSPECTE", "ARCHIVE"]).optional(),
  statut_validation: z.enum(["A_VERIFIER", "VALIDE", "REFUSE"]).optional(),
  recherche: z.string().trim().max(120).optional(),
});

export const schemaMembreMenage = z.strictObject({
  nom_complet: nom,
  sexe: z.enum(["M", "F"]),
  annee_naissance: z.number().int().min(1900).max(new Date().getUTCFullYear()).nullable().optional(),
  lien_parente: z.string().trim().min(2).max(60),
  identifiant_individuel: z.string().trim().max(80).nullable().optional(),
});

export const MILIEUX_INTERVENTION = [
  "URBAIN",
  "RURAL_SEDENTAIRE",
  "NOMADE_PASTORAL",
  "SITE_HUMANITAIRE",
] as const;

export type MilieuIntervention = (typeof MILIEUX_INTERVENTION)[number];

export const schemaMenage = z.strictObject({
  province_id: identifiant.optional(),
  departement_id: identifiant.nullable().optional(),
  milieu_intervention: z.enum(MILIEUX_INTERVENTION).optional(),
  sous_prefecture_id: identifiant.nullable().optional(),
  commune_id: identifiant.nullable().optional(),
  localite_id: identifiant.nullable().optional(),
  arrondissement_id: identifiant.nullable().optional(),
  quartier_id: identifiant.nullable().optional(),
  carre_id: identifiant.nullable().optional(),
  site_humanitaire_id: identifiant.nullable().optional(),
  nom_chef_menage: nom,
  sexe_chef: z.enum(["M", "F"]),
  nombre_personnes: z.number().int().min(1).max(250),
  telephone,
  categorie_population_id: identifiant,
  criteres_vulnerabilite: z.array(z.enum(CODES_VULNERABILITE)).max(5).default([]),
  date_enregistrement: dateIso,
  membres: z.array(schemaMembreMenage).max(100).default([]),
});

export const schemaImportMenages = z.strictObject({
  menages: z.array(schemaMenage).min(1).max(500),
});

export const schemaCreationListeBeneficiaires = z.strictObject({
  province_id: identifiant.optional(),
  intitule: z.string().trim().min(3).max(180),
});

export const schemaInscriptionsBeneficiaires = z.strictObject({
  menage_ids: z.array(identifiant).min(1).max(500),
});

export const schemaDecisionDoublon = z.strictObject({
  decision: z.enum(["CONFIRME_DISTINCT", "CONFIRME_DOUBLON"]),
  observations: z.string().trim().max(1000).nullable().optional(),
});

export const schemaDecisionValidationMenage = z.strictObject({
  decision: z.enum(["VALIDER", "REFUSER"]),
  observations: z.string().trim().min(8).max(1000),
});

export const schemaReouvertureDoublon = z.strictObject({
  reference_preuve: z.string().trim().min(8).max(200),
  date_preuve: dateIso,
  observations: z.string().trim().min(8).max(1000),
});

export type CreationPartenaire = z.infer<typeof schemaCreationPartenaire>;
export type MenageSaisi = z.infer<typeof schemaMenage>;
export type FiltresMenages = z.infer<typeof schemaFiltresMenages>;
