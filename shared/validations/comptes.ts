import { z } from "zod";

const courriel = z.string().trim().email("L’adresse e-mail est invalide.").max(254, "L’adresse e-mail est trop longue.")
  .transform((valeur) => valeur.toLocaleLowerCase("fr-FR"));
const nomComplet = z.string().trim().min(3, "Le nom complet doit comporter au moins 3 caractères.")
  .max(160, "Le nom complet ne peut pas dépasser 160 caractères.");
const telephone = z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/u, "Le numéro de téléphone est invalide.");
const motDePasseFort = z.string().min(12, "Le mot de passe doit comporter au moins 12 caractères.")
  .max(256, "Le mot de passe est trop long.")
  .regex(/[A-Z]/u, "Le mot de passe doit contenir une lettre majuscule.")
  .regex(/[a-z]/u, "Le mot de passe doit contenir une lettre minuscule.")
  .regex(/[0-9]/u, "Le mot de passe doit contenir un chiffre.");

export const schemaInscriptionDelegue = z.object({
  nom_complet: nomComplet,
  province_id: z.string().trim().min(1).max(80),
  courriel,
  telephone,
  mot_de_passe: motDePasseFort,
  confirmation_mot_de_passe: z.string().max(256),
}).refine((valeur) => valeur.mot_de_passe === valeur.confirmation_mot_de_passe, {
  path: ["confirmation_mot_de_passe"],
  message: "Les deux mots de passe ne correspondent pas.",
});

export const schemaVerificationCourriel = z.object({
  inscription_id: z.string().uuid("La demande d’inscription est invalide.").optional(),
  courriel: courriel.optional(),
  code: z.string().regex(/^\d{6}$/u, "Le code doit comporter six chiffres."),
}).refine((valeur) => Boolean(valeur.inscription_id || valeur.courriel), {
  path: ["courriel"],
  message: "Saisissez la référence de la demande ou l’adresse e-mail concernée.",
});

export const schemaRenvoiCodeCourriel = z.object({ courriel });

export const schemaDecisionCompte = z.object({
  motif: z.string().trim().min(10, "Le motif doit comporter au moins 10 caractères.").max(500, "Le motif est trop long."),
  verification_identite_administrative: z.boolean().optional(),
});

export const schemaPaginationComptes = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  decalage: z.coerce.number().int().min(0).max(1_000_000).default(0),
  statut: z.enum(["EMAIL_NON_VERIFIE", "EN_ATTENTE_APPROBATION", "APPROUVEE", "REFUSEE"]).optional(),
});

export const schemaProfilPersonnel = z.object({
  nom_complet: nomComplet,
  telephone: telephone.nullable(),
});

export const schemaChangementCourriel = z.object({
  nouveau_courriel: courriel,
  mot_de_passe_actuel: z.string().min(1).max(256),
});

export const schemaValidationNouveauCourriel = z.object({
  code: z.string().regex(/^\d{6}$/u, "Le code doit comporter six chiffres."),
});

export const schemaChangementMotDePasse = z.object({
  mot_de_passe_actuel: z.string().min(1).max(256),
  nouveau_mot_de_passe: motDePasseFort,
  confirmation_mot_de_passe: z.string().max(256),
}).refine((valeur) => valeur.nouveau_mot_de_passe === valeur.confirmation_mot_de_passe, {
  path: ["confirmation_mot_de_passe"],
  message: "Les deux nouveaux mots de passe ne correspondent pas.",
});

export const schemaCreationCompteConsultation = z.object({
  nom_complet: nomComplet,
  institution: z.string().trim().min(2).max(180),
  fonction: z.string().trim().min(2).max(180),
  courriel,
  telephone: telephone.nullable().optional(),
  perimetre: z.enum(["NATIONAL", "PROVINCIAL", "MULTI_PROVINCIAL"]),
  provinces: z.array(z.string().trim().min(1).max(80)).max(23),
  motif: z.string().trim().min(10).max(500),
}).superRefine((valeur, contexte) => {
  const uniques = new Set(valeur.provinces);
  if (uniques.size !== valeur.provinces.length) {
    contexte.addIssue({ code: "custom", path: ["provinces"], message: "Une province ne peut être sélectionnée qu’une seule fois." });
  }
  if (valeur.perimetre === "NATIONAL" && valeur.provinces.length !== 0) {
    contexte.addIssue({ code: "custom", path: ["provinces"], message: "Un périmètre national ne doit pas contenir de liste provinciale." });
  }
  if (valeur.perimetre === "PROVINCIAL" && valeur.provinces.length !== 1) {
    contexte.addIssue({ code: "custom", path: ["provinces"], message: "Un périmètre provincial exige exactement une province." });
  }
  if (valeur.perimetre === "MULTI_PROVINCIAL" && valeur.provinces.length < 2) {
    contexte.addIssue({ code: "custom", path: ["provinces"], message: "Un périmètre multiprovincial exige au moins deux provinces." });
  }
});

export const schemaModificationPerimetreConsultation = z.object({
  perimetre: z.enum(["NATIONAL", "PROVINCIAL", "MULTI_PROVINCIAL"]),
  provinces: z.array(z.string().trim().min(1).max(80)).max(23),
  motif: z.string().trim().min(10).max(500),
}).superRefine((valeur, contexte) => {
  const uniques = new Set(valeur.provinces);
  if (uniques.size !== valeur.provinces.length) {
    contexte.addIssue({ code: "custom", path: ["provinces"], message: "Une province ne peut être sélectionnée qu’une seule fois." });
  }
  if ((valeur.perimetre === "NATIONAL" && valeur.provinces.length !== 0)
    || (valeur.perimetre === "PROVINCIAL" && valeur.provinces.length !== 1)
    || (valeur.perimetre === "MULTI_PROVINCIAL" && valeur.provinces.length < 2)) {
    contexte.addIssue({ code: "custom", path: ["provinces"], message: "La liste des provinces ne correspond pas au périmètre choisi." });
  }
});
