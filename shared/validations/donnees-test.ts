import { z } from "zod";

export const schemaFiltresDonneesTest = z.strictObject({
  nature: z.enum(["TOUTES", "REEL", "TEST", "INDETERMINE"]).optional().default("TOUTES"),
  statut: z.string().trim().max(50).optional(),
  recherche: z.string().trim().max(120).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).default(0),
});

export const schemaDemandeReclassification = z.strictObject({
  nature_cible: z.enum(["REEL", "TEST"]),
  motif: z.string().trim().min(10, "Le motif de reclassification doit comporter au moins 10 caractères.").max(1000),
  preuves_justificatives: z.string().trim().min(10, "Veuillez fournir les éléments et preuves justifiant la reclassification.").max(3000),
  mot_de_passe_confirmation: z.string().min(1, "Le mot de passe du propriétaire est requis pour confirmer la reclassification."),
});

export const schemaSuppressionOperationTest = z.strictObject({
  confirmation_code: z.string().trim().min(1, "Le code exact de l'opération est obligatoire pour confirmer la suppression."),
  mot_de_passe_confirmation: z.string().min(1, "Le mot de passe du propriétaire est requis pour confirmer cette suppression sensible."),
  motif: z.string().trim().min(5, "Le motif de suppression doit comporter au moins 5 caractères.").max(1000),
});

export const schemaNettoyageLotDonneesTest = z.strictObject({
  operation_ids: z.array(z.string().trim().min(1)).min(1, "Sélectionnez au moins une opération de test à supprimer.").max(50),
  confirmation_texte: z.literal("SUPPRIMER_DEFINITIVEMENT_DONNEES_TEST"),
  mot_de_passe_confirmation: z.string().min(1, "Le mot de passe du propriétaire est requis pour valider le nettoyage par lot."),
  motif: z.string().trim().min(5, "Le motif du nettoyage doit comporter au moins 5 caractères.").max(1000),
});
