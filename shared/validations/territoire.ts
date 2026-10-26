import { z } from "zod";

const identifiantTerritorial = z.string().trim().min(1).max(120);
const nomTerritorial = z.string().trim().min(2).max(160);
const sourceTerritoriale = z.string().trim().min(3).max(500);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être une date valide au format AAAA-MM-JJ.");

export const TYPES_LOCALITE = ["VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"] as const;
export const TYPES_LOCALITE_PROPOSABLES = ["VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"] as const;
export const MILIEUX_RESIDENCE_TERRITORIALE = ["URBAIN", "RURAL"] as const;
export const CATEGORIES_SITE_HUMANITAIRE = [
  "CAMP_REFUGIES",
  "SITE_DEPLACES",
  "CENTRE_ACCUEIL",
  "SITE_TRANSIT",
  "AUTRE_SITE",
] as const;

export const schemaFiltresTerritoriaux = z.strictObject({
  province_id: identifiantTerritorial.optional(),
  departement_id: identifiantTerritorial.optional(),
  sous_prefecture_id: identifiantTerritorial.optional(),
  commune_id: identifiantTerritorial.optional(),
  canton_id: identifiantTerritorial.optional(),
  localite_id: identifiantTerritorial.optional(),
  arrondissement_id: identifiantTerritorial.optional(),
  quartier_id: identifiantTerritorial.optional(),
  type_localite: z.enum(TYPES_LOCALITE).optional(),
  statut_validation: z.enum(["PROPOSE", "VALIDE", "REJETE", "ARCHIVE", "FERME"]).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).default(0),
});

export const schemaPropositionLocalite = z.strictObject({
  province_id: identifiantTerritorial.optional(),
  departement_id: identifiantTerritorial.nullable().optional(),
  sous_prefecture_id: identifiantTerritorial.nullable().optional(),
  commune_id: identifiantTerritorial.nullable().optional(),
  canton_id: identifiantTerritorial.nullable().optional(),
  nom: nomTerritorial,
  type_localite: z.enum(TYPES_LOCALITE_PROPOSABLES),
  source_documentation: sourceTerritoriale,
});

export const schemaPropositionQuartier = z.strictObject({
  province_id: identifiantTerritorial.optional(),
  localite_id: identifiantTerritorial,
  arrondissement_id: identifiantTerritorial.nullable().optional(),
  nom: nomTerritorial,
  possede_carres: z.boolean().default(false),
  source_documentation: sourceTerritoriale,
});

export const schemaPropositionSiteHumanitaire = z.strictObject({
  province_id: identifiantTerritorial.optional(),
  departement_id: identifiantTerritorial.nullable().optional(),
  sous_prefecture_id: identifiantTerritorial.nullable().optional(),
  commune_id: identifiantTerritorial.nullable().optional(),
  localite_proche_id: identifiantTerritorial.nullable().optional(),
  nom: nomTerritorial,
  categorie_site: z.enum(CATEGORIES_SITE_HUMANITAIRE),
  source_documentation: sourceTerritoriale,
});

export const schemaDecisionTerritoriale = z.strictObject({
  decision: z.enum(["VALIDE", "REJETE"]),
  source_officielle: sourceTerritoriale,
  date_effet: dateIso,
});

export const TYPES_UNITES_TERRITORIALES = [
  "PROVINCE",
  "DEPARTEMENT",
  "SOUS_PREFECTURE",
  "COMMUNE",
  "CANTON",
  "VILLE",
  "VILLAGE",
  "HAMEAU",
  "FERRICK",
  "CAMPEMENT",
  "ARRONDISSEMENT",
  "QUARTIER",
  "CARRE",
  "BLOC",
  "SECTEUR",
  "SITE_HUMANITAIRE",
] as const;

export const TYPES_UNITES_AJOUT_DYNAMIQUE = [
  "DEPARTEMENT",
  "VILLE",
  "ARRONDISSEMENT",
  "QUARTIER",
  "CARRE",
  "SOUS_PREFECTURE",
  "CANTON",
  "VILLAGE",
  "HAMEAU",
  "FERRICK",
  "CAMPEMENT",
  "SITE_HUMANITAIRE",
] as const;

export const schemaAjoutDynamiqueUniteTerritoriale = z.strictObject({
  type: z.enum(TYPES_UNITES_AJOUT_DYNAMIQUE),
  nom: nomTerritorial,
  code: z.string().trim().max(80).optional().nullable(),
  province_id: identifiantTerritorial,
  departement_id: identifiantTerritorial.optional().nullable(),
  sous_prefecture_id: identifiantTerritorial.optional().nullable(),
  canton_id: identifiantTerritorial.optional().nullable(),
  localite_id: identifiantTerritorial.optional().nullable(),
  arrondissement_id: identifiantTerritorial.optional().nullable(),
  quartier_id: identifiantTerritorial.optional().nullable(),
  site_humanitaire_id: identifiantTerritorial.optional().nullable(),
  chef_lieu: z.string().trim().max(160).optional().nullable(),
  mode_decoupage_urbain: z.enum(["AUCUN", "SANS_ARRONDISSEMENT", "AVEC_ARRONDISSEMENTS"]).optional().nullable(),
  categorie_site: z.enum(CATEGORIES_SITE_HUMANITAIRE).optional().nullable(),
  possede_carres: z.boolean().optional().nullable(),
});

export type TypeUniteAjoutDynamique = (typeof TYPES_UNITES_AJOUT_DYNAMIQUE)[number];
export type DonneesAjoutDynamiqueUniteTerritoriale = z.infer<typeof schemaAjoutDynamiqueUniteTerritoriale>;

export const schemaPropositionCorrectionTerritoriale = z.strictObject({
  type_unite: z.enum(TYPES_UNITES_AJOUT_DYNAMIQUE),
  unite_id: identifiantTerritorial,
  province_id: identifiantTerritorial,
  nom_corrige: nomTerritorial,
  motif_correction: z.string().trim().min(5).max(1000),
  source_documentation: z.string().trim().max(500).optional().nullable(),
});

export type DonneesPropositionCorrectionTerritoriale = z.infer<typeof schemaPropositionCorrectionTerritoriale>;

export const schemaCreationUniteTerritoriale = z.strictObject({
  type: z.enum(TYPES_UNITES_TERRITORIALES),
  nom: nomTerritorial,
  code: z.string().trim().max(80).optional().nullable(),
  province_id: identifiantTerritorial.optional().nullable(),
  departement_id: identifiantTerritorial.optional().nullable(),
  sous_prefecture_id: identifiantTerritorial.optional().nullable(),
  commune_id: identifiantTerritorial.optional().nullable(),
  canton_id: identifiantTerritorial.optional().nullable(),
  localite_id: identifiantTerritorial.optional().nullable(),
  arrondissement_id: identifiantTerritorial.optional().nullable(),
  quartier_id: identifiantTerritorial.optional().nullable(),
  site_humanitaire_id: identifiantTerritorial.optional().nullable(),
  chef_lieu: z.string().trim().max(160).optional().nullable(),
  autres_appellations: z.string().trim().max(500).optional().nullable(),
  source_officielle: z.string().trim().max(500).optional().nullable(),
  reference_juridique: z.string().trim().max(250).optional().nullable(),
  date_effet: dateIso.optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  observations: z.string().trim().max(2000).optional().nullable(),
  statut_validation: z.enum(["VALIDE", "A_VERIFIER", "PROPOSE"]).default("VALIDE"),
  mode_decoupage_urbain: z.enum(["AUCUN", "SANS_ARRONDISSEMENT", "AVEC_ARRONDISSEMENTS"]).optional().nullable(),
  type_commune: z.enum(["URBAINE", "RURALE"]).optional().nullable(),
  statut_particulier: z.boolean().optional().nullable(),
  categorie_site: z.enum(CATEGORIES_SITE_HUMANITAIRE).optional().nullable(),
  possede_carres: z.boolean().optional().nullable(),
});

export const schemaModificationUniteTerritoriale = z.strictObject({
  nom: nomTerritorial.optional(),
  code: z.string().trim().max(80).optional().nullable(),
  chef_lieu: z.string().trim().max(160).optional().nullable(),
  autres_appellations: z.string().trim().max(500).optional().nullable(),
  source_officielle: z.string().trim().max(500).optional().nullable(),
  reference_juridique: z.string().trim().max(250).optional().nullable(),
  date_effet: dateIso.optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  observations: z.string().trim().max(2000).optional().nullable(),
  mode_decoupage_urbain: z.enum(["AUCUN", "SANS_ARRONDISSEMENT", "AVEC_ARRONDISSEMENTS"]).optional().nullable(),
  possede_carres: z.boolean().optional().nullable(),
  motif: z.string().trim().min(5).max(1000),
});

export const schemaModificationRattachementTerritorial = z.strictObject({
  nouveau_departement_id: identifiantTerritorial.optional().nullable(),
  nouvelle_sous_prefecture_id: identifiantTerritorial.optional().nullable(),
  nouvelle_commune_id: identifiantTerritorial.optional().nullable(),
  nouveau_canton_id: identifiantTerritorial.optional().nullable(),
  nouvelle_localite_id: identifiantTerritorial.optional().nullable(),
  nouvel_arrondissement_id: identifiantTerritorial.optional().nullable(),
  nouveau_quartier_id: identifiantTerritorial.optional().nullable(),
  justificatif: sourceTerritoriale,
  motif: z.string().trim().min(5).max(1000),
});

export const schemaFusionUnitesTerritoriales = z.strictObject({
  unite_principale_id: identifiantTerritorial,
  unite_doublon_id: identifiantTerritorial,
  motif: z.string().trim().min(5).max(1000),
  justificatif: sourceTerritoriale,
});

export const schemaArchivageUniteTerritoriale = z.strictObject({
  motif: z.string().trim().min(5).max(1000),
  remplacee_par_id: identifiantTerritorial.optional().nullable(),
});

export const schemaSuppressionUniteTerritoriale = z.strictObject({
  motif: z.string().trim().min(5).max(1000),
});

export const schemaValidationUniteTerritoriale = z.strictObject({
  statut_validation: z.enum(["VALIDE", "A_VERIFIER"]),
  source_officielle: sourceTerritoriale,
  reference_juridique: z.string().trim().max(250).optional().nullable(),
  date_effet: dateIso.optional().nullable(),
  motif: z.string().trim().min(5).max(1000),
});

export const schemaValidationLotTerritoire = z.strictObject({
  ids: z.array(identifiantTerritorial).min(1).max(500),
  statut_validation: z.enum(["VALIDE", "A_VERIFIER"]),
  source_officielle: sourceTerritoriale,
  motif: z.string().trim().min(5).max(1000),
});

export const schemaFiltresRechercheTerritoire = z.strictObject({
  recherche: z.string().trim().max(160).optional(),
  type: z.enum(TYPES_UNITES_TERRITORIALES).optional(),
  province_id: identifiantTerritorial.optional(),
  departement_id: identifiantTerritorial.optional(),
  sous_prefecture_id: identifiantTerritorial.optional(),
  statut_validation: z.enum(["VALIDE", "A_VERIFIER", "PROPOSE", "ARCHIVE"]).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  decalage: z.coerce.number().int().min(0).default(0),
});

export type TypeLocalite = (typeof TYPES_LOCALITE)[number];
export type CategorieSiteHumanitaire = (typeof CATEGORIES_SITE_HUMANITAIRE)[number];
export type TypeUniteAdministrative = (typeof TYPES_UNITES_TERRITORIALES)[number];
