import { z } from "zod";

const identifiant = z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}_.:-]+$/u);
const libelle = z.string().trim().min(2).max(180);
const quantitePositive = z.number().finite().positive().max(1_000_000_000);
const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((valeur) => {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === valeur;
}, "La date doit être valide au format AAAA-MM-JJ.");

const schemaZoneDistribution = z.strictObject({
  localite_id: identifiant.nullable().optional(),
  arrondissement_id: identifiant.nullable().optional(),
  quartier_id: identifiant.nullable().optional(),
  carre_id: identifiant.nullable().optional(),
  site_humanitaire_id: identifiant.nullable().optional(),
  nom_site_distribution: libelle,
});

const schemaArticleDistribution = z.strictObject({
  article_id: identifiant,
  source_approvisionnement: z.enum([
    "APPROVISIONNEMENT_CENTRAL",
    "APPROVISIONNEMENT_DIRECT",
    "STOCK_EXISTANT",
    "MIXTE",
  ]),
  ration_par_menage: quantitePositive,
});

const schemaMenageCible = z.strictObject({
  menage_id: identifiant,
  index_zone: z.number().int().min(0).max(19),
});

export const schemaPlanDistribution = z.strictObject({
  intitule_distribution: libelle,
  departement_id: identifiant,
  sous_prefecture_id: identifiant.nullable().optional(),
  commune_id: identifiant.nullable().optional(),
  nature_aide: z.enum(["ALIMENTAIRE", "NFI", "MIXTE"]),
  bailleur_fonds_id: identifiant.nullable().optional(),
  partenaire_execution_id: identifiant.nullable().optional(),
  objectif: z.string().trim().min(5).max(2000),
  date_prevue: dateIso,
  entrepot_id: identifiant,
  liste_beneficiaires_id: identifiant.nullable().optional(),
  observations: z.string().trim().max(2000).nullable().optional(),
  zones: z.array(schemaZoneDistribution).min(1).max(20),
  articles: z.array(schemaArticleDistribution).min(1).max(10),
  menages: z.array(schemaMenageCible).min(1).max(500),
}).superRefine((plan, contexte) => {
  const articles = plan.articles.map((article) => article.article_id);
  if (new Set(articles).size !== articles.length) {
    contexte.addIssue({ code: "custom", path: ["articles"], message: "Chaque article doit apparaître une seule fois dans le plan." });
  }
  const menages = plan.menages.map((menage) => menage.menage_id);
  if (new Set(menages).size !== menages.length) {
    contexte.addIssue({ code: "custom", path: ["menages"], message: "Un même ménage ne peut pas être inscrit deux fois dans la distribution." });
  }
  plan.menages.forEach((menage, index) => {
    if (menage.index_zone >= plan.zones.length) {
      contexte.addIssue({ code: "custom", path: ["menages", index, "index_zone"], message: "La zone indiquée n’existe pas dans le plan." });
    }
  });
  plan.zones.forEach((zone, index) => {
    if (!zone.localite_id && !zone.site_humanitaire_id) {
      contexte.addIssue({ code: "custom", path: ["zones", index], message: "Une zone doit désigner une localité ou un site humanitaire." });
    }
  });
});

export const schemaPaginationDistributions = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(120).optional(),
  statut: z.enum([
    "BROUILLON",
    "EN_PREPARATION",
    "VALIDEE_PROVINCE",
    "EN_EXECUTION",
    "TERMINEE_PROVINCE",
    "RETOURNEE_POUR_CORRECTION",
    "CLOTUREE_CENTRAL",
  ]).optional(),
  province_id: identifiant.optional(),
});

export const schemaPaginationMenagesDistribution = z.strictObject({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(120).optional(),
  departement_id: identifiant.optional(),
  localite_id: identifiant.optional(),
  site_humanitaire_id: identifiant.optional(),
});

export const schemaPaginationReferentielDistribution = z.strictObject({
  type: z.enum(["entrepots", "articles", "partenaires", "localites", "sites", "listes"]),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  decalage: z.coerce.number().int().min(0).max(10_000_000).default(0),
  recherche: z.string().trim().max(120).optional(),
});

export const schemaRemiseDistribution = z.strictObject({
  menage_distribution_id: identifiant,
  date_remise: dateIso,
  identite_recepteur: libelle,
  emargement_reference: z.string().trim().max(160).nullable().optional(),
  statut_service: z.enum(["SERVI", "PARTIELLEMENT_SERVI", "ABSENT", "NON_SERVI"]),
  motif_non_service: z.string().trim().min(3).max(1000).nullable().optional(),
  lignes: z.array(z.strictObject({
    allocation_id: identifiant,
    quantite_remise: quantitePositive,
  })).max(10),
}).superRefine((remise, contexte) => {
  const allocations = remise.lignes.map((ligne) => ligne.allocation_id);
  if (new Set(allocations).size !== allocations.length) {
    contexte.addIssue({ code: "custom", path: ["lignes"], message: "Une allocation ne peut apparaître qu’une fois dans une remise." });
  }
  if (["ABSENT", "NON_SERVI"].includes(remise.statut_service) && remise.lignes.length > 0) {
    contexte.addIssue({ code: "custom", path: ["lignes"], message: "Un ménage absent ou non servi ne peut recevoir aucune quantité." });
  }
  if (remise.statut_service === "PARTIELLEMENT_SERVI" && remise.lignes.length === 0) {
    contexte.addIssue({ code: "custom", path: ["lignes"], message: "Une remise partielle doit contenir au moins une ligne servie." });
  }
  if (["ABSENT", "NON_SERVI"].includes(remise.statut_service) && !remise.motif_non_service?.trim()) {
    contexte.addIssue({ code: "custom", path: ["motif_non_service"], message: "Le motif de non-service est obligatoire." });
  }
  if (remise.statut_service === "SERVI" && remise.lignes.length === 0) {
    contexte.addIssue({ code: "custom", path: ["lignes"], message: "Une remise servie doit contenir au moins une ligne." });
  }
});

export const schemaDeclarationFinDistribution = z.strictObject({
  observations: z.string().trim().max(2000).nullable().optional(),
});

export const schemaRetourCorrectionDistribution = z.strictObject({
  motif_retour: z.string().trim().min(5).max(2000),
  elements_a_corriger: z.array(z.enum([
    "intitule_distribution",
    "objectif",
    "date_prevue",
    "observations",
  ])).min(1).max(5),
}).superRefine((entree, contexte) => {
  if (new Set(entree.elements_a_corriger).size !== entree.elements_a_corriger.length) {
    contexte.addIssue({ code: "custom", path: ["elements_a_corriger"], message: "Chaque élément à corriger ne peut apparaître qu’une fois." });
  }
});

export const schemaSoumissionCorrectionDistribution = z.strictObject({
  reponse_delegue: z.string().trim().min(5).max(2000),
  corrections: z.record(z.string(), z.union([z.string().trim().max(2000), z.null()])).default({}),
});

export const schemaClotureDistribution = z.strictObject({
  observations_finales: z.string().trim().max(2000).nullable().optional(),
});

export type PlanDistributionSaisi = z.infer<typeof schemaPlanDistribution>;
export type RemiseDistributionSaisie = z.infer<typeof schemaRemiseDistribution>;
export type FiltresDistributions = z.infer<typeof schemaPaginationDistributions>;
