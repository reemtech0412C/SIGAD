import { z } from "zod";

export const schemaConnexion = z.object({
  identifiant: z.string().trim().min(1, "L’identifiant est obligatoire.").max(80, "L’identifiant est trop long."),
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
});

export type DonneesConnexion = z.infer<typeof schemaConnexion>;
export type DonneesChangementMotDePasseInitial = z.infer<typeof schemaChangementMotDePasseInitial>;
