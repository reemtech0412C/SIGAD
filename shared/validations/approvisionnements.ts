import { z } from "zod";

const identifiant = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u);
const libelle = z.string().trim().min(2).max(160);
const quantitePositive = z.number().finite().positive().max(1_000_000_000);
const quantiteNulleOuPositive = z.number().finite().nonnegative().max(1_000_000_000);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être valide au format AAAA-MM-JJ.");

const schemaArticleAffecte = z.strictObject({
  article_id: identifiant,
  quantite_allouee: quantitePositive,
});

const schemaDestinationAffectee = z.strictObject({
  province_id: identifiant,
  articles: z.array(schemaArticleAffecte).min(1).max(20),
}).superRefine((destination, contexte) => {
  const articles = destination.articles.map((article) => article.article_id);
  if (new Set(articles).size !== articles.length) {
    contexte.addIssue({ code: "custom", message: "Un article ne peut être réparti qu’une fois par province." });
  }
});

export const schemaCreationApprovisionnement = z.strictObject({
  reference: z.string().trim().min(6).max(80).regex(/^APP-[A-Z0-9-]+$/u),
  operation_centrale_id: identifiant.nullable().optional(),
  intitule_operation: libelle,
  description: z.string().trim().max(2000).nullable().optional(),
  source_articles: z.enum(["ENTREPOT_CENTRAL", "FOURNISSEUR_EXTERNE", "DON_PARTENAIRE"]),
  partenaire_id: identifiant.nullable().optional(),
  nature_aide: z.enum(["ALIMENTAIRE", "NFI", "MIXTE"]),
  date_prevue_expedition: dateIso.nullable().optional(),
  instructions: z.string().trim().max(2000).nullable().optional(),
  destinations: z.array(schemaDestinationAffectee).min(1).max(23),
}).superRefine((entree, contexte) => {
  const provinces = entree.destinations.map((destination) => destination.province_id);
  if (new Set(provinces).size !== provinces.length) {
    contexte.addIssue({ code: "custom", message: "Chaque province doit apparaître une seule fois dans la répartition." });
  }
  if (entree.source_articles === "ENTREPOT_CENTRAL" && entree.partenaire_id) {
    contexte.addIssue({ code: "custom", message: "Un approvisionnement issu du stock central ne doit pas désigner de partenaire fournisseur." });
  }
  if (entree.source_articles !== "ENTREPOT_CENTRAL" && !entree.partenaire_id) {
    contexte.addIssue({ code: "custom", message: "Un fournisseur ou partenaire est obligatoire pour cette origine." });
  }
});

const schemaLigneExpedition = z.strictObject({
  article_approvisionnement_id: identifiant,
  quantite_expediee: quantitePositive,
  numero_lot_fournisseur: z.string().trim().min(1).max(100).optional(),
  date_peremption: dateIso.nullable().optional(),
});

export const schemaCreationExpedition = z.strictObject({
  destination_id: identifiant,
  date_expedition: dateIso,
  origine_expedition: z.enum(["ENTREPOT_CENTRAL", "LIVRAISON_DIRECTE_FOURNISSEUR"]),
  entrepot_origine_id: identifiant.nullable().optional(),
  reference_bordereau: z.string().trim().min(2).max(120),
  transporteur_partenaire_id: identifiant.nullable().optional(),
  informations_transport: z.string().trim().max(500).nullable().optional(),
  lignes: z.array(schemaLigneExpedition).min(1).max(20),
}).superRefine((entree, contexte) => {
  const allocations = entree.lignes.map((ligne) => ligne.article_approvisionnement_id);
  if (new Set(allocations).size !== allocations.length) {
    contexte.addIssue({ code: "custom", message: "Une allocation ne peut apparaître qu’une fois par expédition." });
  }
  if (entree.origine_expedition === "ENTREPOT_CENTRAL" && !entree.entrepot_origine_id) {
    contexte.addIssue({ code: "custom", message: "Un entrepôt central est obligatoire pour cette expédition." });
  }
  if (entree.origine_expedition === "LIVRAISON_DIRECTE_FOURNISSEUR" && entree.entrepot_origine_id) {
    contexte.addIssue({ code: "custom", message: "Une livraison directe ne doit pas désigner d’entrepôt central." });
  }
  if (entree.origine_expedition === "LIVRAISON_DIRECTE_FOURNISSEUR") {
    entree.lignes.forEach((ligne, index) => {
      if (!ligne.numero_lot_fournisseur) {
        contexte.addIssue({ code: "custom", path: ["lignes", index, "numero_lot_fournisseur"], message: "Le numéro de lot du fournisseur est obligatoire." });
      }
    });
  } else if (entree.lignes.some((ligne) => ligne.numero_lot_fournisseur)) {
    contexte.addIssue({ code: "custom", message: "Le numéro de lot fournisseur ne s’applique qu’aux livraisons directes." });
  }
});

export const schemaReceptionProvinciale = z.strictObject({
  entrepot_recepteur_id: identifiant,
  date_reception: dateIso,
  numero_pv_reception: z.string().trim().min(2).max(120),
  pv_piece_jointe_id: identifiant,
  observations: z.string().trim().max(2000).nullable().optional(),
  lignes: z.array(z.strictObject({
    ligne_expedition_id: identifiant,
    quantite_recue_physique: quantiteNulleOuPositive,
    quantite_acceptee: quantiteNulleOuPositive,
    quantite_endommagee: quantiteNulleOuPositive,
  })).min(1).max(20),
}).superRefine((entree, contexte) => {
  const ids = entree.lignes.map((ligne) => ligne.ligne_expedition_id);
  if (new Set(ids).size !== ids.length) {
    contexte.addIssue({ code: "custom", message: "Une ligne d’expédition ne peut être reçue qu’une fois." });
  }
  entree.lignes.forEach((ligne, index) => {
    if (Math.abs(ligne.quantite_recue_physique - ligne.quantite_acceptee - ligne.quantite_endommagee) > 0.000001) {
      contexte.addIssue({ code: "custom", path: ["lignes", index], message: "La quantité physique doit être égale aux quantités acceptée et endommagée." });
    }
  });
});

export const schemaRapprochementApprovisionnement = z.strictObject({
  justifications: z.array(z.strictObject({
    ligne_reception_id: identifiant,
    justification_ecart: z.string().trim().min(5).max(1000),
  })).min(1).max(20),
}).superRefine((entree, contexte) => {
  const ids = entree.justifications.map((ligne) => ligne.ligne_reception_id);
  if (new Set(ids).size !== ids.length) {
    contexte.addIssue({ code: "custom", message: "Une ligne d’écart ne peut être justifiée qu’une fois dans la même requête." });
  }
});

export const schemaClotureApprovisionnement = z.strictObject({
  observations_cloture: z.string().trim().max(2000).nullable().optional(),
});

export const schemaPaginationApprovisionnements = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(120).optional(),
  statut: z.enum([
    "BROUILLON", "VALIDEE", "EN_EXPEDITION", "PARTIELLEMENT_RECEPTIONNEE", "RECEPTIONNEE", "EN_RAPPROCHEMENT", "CLOTUREE",
    "PLANIFIEE", "EN_ECART",
  ]).optional(),
  province_id: identifiant.optional(),
});

export type CreationApprovisionnementSaisie = z.infer<typeof schemaCreationApprovisionnement>;
export type CreationExpeditionSaisie = z.infer<typeof schemaCreationExpedition>;
export type ReceptionProvincialeSaisie = z.infer<typeof schemaReceptionProvinciale>;
export type RapprochementApprovisionnementSaisi = z.infer<typeof schemaRapprochementApprovisionnement>;
export type ClotureApprovisionnementSaisie = z.infer<typeof schemaClotureApprovisionnement>;
export type PaginationApprovisionnements = z.infer<typeof schemaPaginationApprovisionnements>;
