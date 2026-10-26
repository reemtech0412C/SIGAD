import { z } from "zod";

export const schemaConnexion = z.object({
  identifiant: z.string().trim().min(1, "L’identifiant ou l’adresse e-mail est obligatoire.").max(254, "L’identifiant est trop long."),
  mot_de_passe: z.string().min(1, "Le mot de passe est obligatoire.").max(256, "Le mot de passe est trop long."),
});

export const schemaChangementMotDePasseInitial = z.object({
  nouveau_mot_de_passe: z
    .string()
    .min(12, "Le nouveau mot de passe doit contenir au moins 12 caractères.")
    .max(256, "Le nouveau mot de passe est trop long.")
    .regex(/[A-Z]/, "Le nouveau mot de passe doit contenir une lettre majuscule.")
    .regex(/[a-z]/, "Le nouveau mot de passe doit contenir une lettre minuscule.")
    .regex(/[0-9]/, "Le nouveau mot de passe doit contenir un chiffre."),
});

export const schemaStatutUtilisateur = z.object({
  statut: z.enum(["ACTIF", "SUSPENDU"]),
  motif: z.string().trim().min(10, "Le motif doit comporter au moins 10 caractères.").max(500, "Le motif est trop long.").optional(),
});
