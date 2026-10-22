import { z } from "zod";

const identifiant = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u);
const libelle = z.string().trim().min(2).max(160);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être valide au format AAAA-MM-JJ.");
const quantite = z.number().finite().positive().max(1_000_000_000);

export const schemaPaginationStocks = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).default(0),
  recherche: z.string().trim().max(120).optional(),
  province_id: identifiant.optional(),
  entrepot_id: identifiant.optional(),
  article_id: identifiant.optional(),
  categorie_id: identifiant.optional(),
  type_mouvement: z.enum([
    "RECEPTION", "ENTREE", "SORTIE_EXPEDITION", "SORTIE_DISTRIBUTION", "RESERVATION",
    "LIBERATION_RESERVATION", "TRANSFERT_SORTANT", "TRANSFERT_ENTRANT", "RETOUR",
    "AJUSTEMENT_POSITIF", "AJUSTEMENT_NEGATIF", "PERTE", "INVENTAIRE",
  ]).optional(),
  date_debut: dateIso.optional(),
  date_fin: dateIso.optional(),
});

export const schemaCategorieAide = z.strictObject({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/u),
  libelle,
});

export const schemaUniteMesure = z.strictObject({
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/u),
  libelle,
  decimales_autorisees: z.number().int().min(0).max(6).default(0),
});

export const schemaConditionnement = z.strictObject({
  libelle,
  unite_base_id: identifiant,
  facteur_conversion: z.number().finite().positive().max(1_000_000),
});

export const schemaArticle = z.strictObject({
  code_article: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_-]+$/u),
  designation: libelle,
  categorie_id: identifiant,
  unite_mesure_id: identifiant,
  conditionnement_id: identifiant.nullable().optional(),
  perissable: z.boolean().default(false),
  actif: z.boolean().default(true),
});

export const schemaEntrepot = z.strictObject({
  code_entrepot: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_-]+$/u),
  nom: libelle,
  niveau: z.enum(["CENTRAL", "PROVINCIAL"]),
  province_id: identifiant.optional(),
  localite_id: identifiant.nullable().optional(),
  adresse_detaillee: z.string().trim().max(240).nullable().optional(),
  capacite_indicative: z.string().trim().max(120).nullable().optional(),
  responsable_nom: z.string().trim().max(160).nullable().optional(),
  responsable_telephone: z.string().trim().max(32).nullable().optional(),
  actif: z.boolean().default(true),
});

export const schemaLigneReception = z.strictObject({
  article_id: identifiant,
  numero_lot: z.string().trim().min(1).max(100),
  quantite_recue: quantite,
  quantite_acceptee: z.number().finite().nonnegative().max(1_000_000_000),
  quantite_endommagee: z.number().finite().nonnegative().max(1_000_000_000).default(0),
  date_peremption: dateIso.nullable().optional(),
});

export const schemaReceptionStock = z.strictObject({
  entrepot_id: identifiant,
  type_entree: z.enum(["APPROVISIONNEMENT_DIRECT_PARTENAIRE", "STOCK_INITIAL"]),
  partenaire_id: identifiant.nullable().optional(),
  date_reception: dateIso,
  numero_bordereau_externe: z.string().trim().max(120).nullable().optional(),
  observations: z.string().trim().max(1000).nullable().optional(),
  lignes: z.array(schemaLigneReception).min(1).max(20),
});

export const schemaAjustementStock = z.strictObject({
  entrepot_id: identifiant,
  article_id: identifiant,
  lot_stock_id: identifiant,
  type_ajustement: z.enum(["INVENTAIRE", "PERTE", "AVARIE", "CORRECTION_ERREUR"]),
  ecart_quantite: z.number().finite().min(-1_000_000_000).max(1_000_000_000).refine((valeur) => valeur !== 0),
  motif_detaille: z.string().trim().min(5).max(1000),
});

export const schemaTransfertStock = z.strictObject({
  entrepot_source_id: identifiant,
  entrepot_destination_id: identifiant,
  lignes: z.array(z.strictObject({ lot_stock_id: identifiant, quantite: quantite })).min(1).max(20),
  motif: z.string().trim().min(5).max(500),
});

export const schemaReservationStock = z.strictObject({
  distribution_id: identifiant,
  entrepot_id: identifiant,
  province_id: identifiant,
  article_id: identifiant,
  quantite: quantite,
});

export type ReceptionStockSaisie = z.infer<typeof schemaReceptionStock>;
export type AjustementStockSaisi = z.infer<typeof schemaAjustementStock>;
export type TransfertStockSaisi = z.infer<typeof schemaTransfertStock>;
export type ReservationStockSaisie = z.infer<typeof schemaReservationStock>;
