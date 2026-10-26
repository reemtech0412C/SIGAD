import { z } from "zod";

const identifiant = z.string().trim().min(1).max(160);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const [annee, mois, jour] = valeur.split("-").map(Number);
  const date = new Date(Date.UTC(annee ?? 0, (mois ?? 1) - 1, jour ?? 1));
  return date.toISOString().slice(0, 10) === valeur;
}, "La date doit être une date calendaire valide au format AAAA-MM-JJ.");

export const schemaFiltresIndicateursCarte = z.strictObject({
  province_id: identifiant.optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
  article_id: identifiant.optional(),
}).superRefine((valeur, contexte) => {
  if (valeur.date_debut && valeur.date_fin && valeur.date_debut > valeur.date_fin) {
    contexte.addIssue({
      code: "custom",
      path: ["date_fin"],
      message: "La date de fin doit être égale ou postérieure à la date de début.",
    });
  }
});

export const ETATS_DONNEES_CARTE = [
  "DISPONIBLE",
  "AUCUNE_DONNEE",
  "INDISPONIBLE",
  "INCOHERENT",
] as const;

export const INDICATEURS_CARTE_ACTIFS = [
  "distributions_realisees",
  "distributions_en_cours",
  "menages_servis",
  "stocks_disponibles",
] as const;

export const INDICATEURS_CARTE_DESACTIVES = [
  "personnes_beneficiaires",
  "validations_en_attente",
] as const;

const schemaValeurCompte = z.strictObject({
  valeur: z.number().int().nonnegative().nullable(),
  etat: z.enum(ETATS_DONNEES_CARTE),
});

const schemaEntrepotCarte = z.strictObject({
  entrepot_id: identifiant,
  nom: z.string(),
  valeur: z.number().nonnegative().nullable(),
  etat: z.enum(["DISPONIBLE", "INCOHERENT"]),
});

const schemaStockCarte = z.strictObject({
  valeur: z.number().nonnegative().nullable(),
  etat: z.enum(ETATS_DONNEES_CARTE),
  article_id: identifiant.nullable(),
  designation: z.string().nullable(),
  unite_mesure_id: identifiant.nullable(),
  unite_code: z.string().nullable(),
  unite_libelle: z.string().nullable(),
  entrepots_actifs: z.number().int().nonnegative(),
  entrepots: z.array(schemaEntrepotCarte),
});

export const schemaProvinceIndicateursCarte = z.strictObject({
  province_id: identifiant,
  nom: z.string(),
  distributions_realisees: schemaValeurCompte,
  distributions_en_cours: schemaValeurCompte,
  menages_servis: schemaValeurCompte,
  stocks_disponibles: schemaStockCarte,
});

export const schemaReponseIndicateursCarte = z.strictObject({
  version_contrat: z.literal("1.5"),
  mode_donnees: z.enum(["OPERATIONNELLES", "SYNTHETIQUES"]),
  perimetre: z.enum(["NATIONAL", "PROVINCIAL"]),
  province_id: identifiant.nullable(),
  periode: z.strictObject({ date_debut: dateIso.nullable(), date_fin: dateIso.nullable() }),
  date_photographie: z.string(),
  indicateurs_actifs: z.array(z.enum(INDICATEURS_CARTE_ACTIFS)),
  indicateurs_desactives: z.array(z.enum(INDICATEURS_CARTE_DESACTIVES)),
  provinces: z.array(schemaProvinceIndicateursCarte),
  ressources_d1: z.strictObject({
    requetes: z.number().int().nonnegative(),
    lignes_lues: z.number().int().nonnegative(),
    lignes_ecrites: z.number().int().nonnegative(),
    duree_requetes_ms: z.number().nonnegative(),
  }),
});

export type FiltresIndicateursCarte = z.infer<typeof schemaFiltresIndicateursCarte>;
export type IndicateurCarteActif = (typeof INDICATEURS_CARTE_ACTIFS)[number];
export type ReponseIndicateursCarte = z.infer<typeof schemaReponseIndicateursCarte>;
