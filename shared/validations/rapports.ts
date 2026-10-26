import { z } from "zod";

export const TYPES_RAPPORT = [
  "RAPPORT_MENSUEL_PROVINCIAL",
  "RAPPORT_NATIONAL_CONSOLIDE",
  "RAPPORT_APPROVISIONNEMENTS_CENTRAUX",
  "RAPPORT_EXPEDITIONS",
  "RAPPORT_RECEPTIONS_PROVINCIALES",
  "ETAT_STOCKS",
  "RAPPORT_MOUVEMENTS_STOCK",
  "RAPPORT_DISTRIBUTION",
  "LISTE_BENEFICIAIRES",
  "LISTE_EMARGEMENT",
  "PROCES_VERBAL_DISTRIBUTION",
  "RAPPORT_ECARTS",
  "RAPPORT_CLOTURE",
  "RAPPORT_PARTENAIRE",
  "RAPPORT_COUVERTURE_GEOGRAPHIQUE",
] as const;

export const FORMATS_RAPPORT = ["PDF", "EXCEL", "CSV"] as const;

const identifiant = z.string().trim().min(1).max(160);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const filtresCommuns = {
  province_id: identifiant.optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
  partenaire_id: identifiant.optional(),
  nature_aide: z.string().trim().min(1).max(120).optional(),
  statut: z.string().trim().min(1).max(80).optional(),
  distribution_id: identifiant.optional(),
  localite_id: identifiant.optional(),
};

function validerPeriode(
  valeur: { date_debut?: string | undefined; date_fin?: string | undefined },
  contexte: z.RefinementCtx,
): void {
  if (valeur.date_debut && valeur.date_fin && valeur.date_debut > valeur.date_fin) {
    contexte.addIssue({
      code: "custom",
      path: ["date_fin"],
      message: "La date de fin doit être égale ou postérieure à la date de début.",
    });
  }
}

export const schemaFiltresRapport = z.strictObject({
  ...filtresCommuns,
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
}).superRefine(validerPeriode);

export const schemaFiltresTableauRapports = z.strictObject(filtresCommuns).superRefine(validerPeriode);

export const schemaExportRapport = z.strictObject({
  format: z.enum(FORMATS_RAPPORT),
  filtres: z.strictObject(filtresCommuns).default({}),
  archiver: z.boolean().default(false),
});

export const schemaPaginationArchives = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  type_rapport: z.enum(TYPES_RAPPORT).optional(),
});

export const schemaReconciliationArchives = z.strictObject({
  curseur: z.string().trim().min(1).max(1024).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  confirmer_suppression: z.boolean().default(false),
});

export type TypeRapport = (typeof TYPES_RAPPORT)[number];
export type FiltresRapport = z.infer<typeof schemaFiltresTableauRapports>;
export type FiltresRapportPagine = z.infer<typeof schemaFiltresRapport>;
