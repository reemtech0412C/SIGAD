import { z } from "zod";

const identifiantTerritorial = z.string().trim().min(1).max(120);
const nomTerritorial = z.string().trim().min(2).max(160);
const sourceTerritoriale = z.string().trim().min(3).max(500);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être une date valide au format AAAA-MM-JJ.");

export const TYPES_LOCALITE = ["VILLE", "VILLAGE", "FERRICK", "CAMPEMENT"] as const;
export const TYPES_LOCALITE_PROPOSABLES = ["VILLAGE", "FERRICK", "CAMPEMENT"] as const;
export const MODES_DECOUPAGE_URBAIN = ["AUCUN", "SANS_ARRONDISSEMENT", "AVEC_ARRONDISSEMENTS"] as const;
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
  departement_id: identifiantTerritorial,
  sous_prefecture_id: identifiantTerritorial.nullable().optional(),
  commune_id: identifiantTerritorial.nullable().optional(),
  canton_id: identifiantTerritorial.nullable().optional(),
  nom: nomTerritorial,
  type_localite: z.enum(TYPES_LOCALITE_PROPOSABLES),
  source_documentation: sourceTerritoriale,
});

export const schemaPropositionQuartier = z.strictObject({
  localite_id: identifiantTerritorial,
  arrondissement_id: identifiantTerritorial.nullable().optional(),
  nom: nomTerritorial,
  possede_carres: z.boolean().default(false),
  source_documentation: sourceTerritoriale,
});

export const schemaPropositionSiteHumanitaire = z.strictObject({
  departement_id: identifiantTerritorial,
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

export type TypeLocalite = (typeof TYPES_LOCALITE)[number];
export type TypeLocaliteProposable = (typeof TYPES_LOCALITE_PROPOSABLES)[number];
export type CategorieSiteHumanitaire = (typeof CATEGORIES_SITE_HUMANITAIRE)[number];
