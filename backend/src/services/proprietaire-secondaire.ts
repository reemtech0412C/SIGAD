import { genererJetonAleatoire, hacherMotDePasse } from "./cryptographie.service.ts";

/**
 * Procédure d'exploitation (D-17): création d'un second PROPRIETAIRE, prérequis des opérations de plateforme à
 * double contrôle. Ce module ne contacte aucune base: il produit un fichier SQL que l'opérateur exécute
 * lui-même sur l'environnement cible, et un code d'activation à usage unique remis hors bande.
 */

export const DUREE_ACTIVATION_SECONDAIRE_HEURES = 24;
export const MAX_PROPRIETAIRES_ACTIFS = 3;

export interface OptionsProprietaireSecondaire {
  readonly identifiant: string;
  readonly nomComplet: string;
  readonly operateur: string;
  readonly motif: string;
}

export interface ProprietaireSecondairePrepare {
  readonly sql: string;
  readonly codeActivation: string;
  readonly utilisateurId: string;
  readonly expireLe: string;
}

const IDENTIFIANTS_RESERVES = new Set(["proprietaire", "central", "admin", "administrateur", "root", "system", "systeme"]);

export function validerOptionsProprietaireSecondaire(options: OptionsProprietaireSecondaire): string[] {
  const erreurs: string[] = [];
  if (!/^[a-z][a-z0-9._-]{2,39}$/u.test(options.identifiant)) erreurs.push("IDENTIFIANT_INVALIDE");
  if (IDENTIFIANTS_RESERVES.has(options.identifiant)) erreurs.push("IDENTIFIANT_RESERVE");
  if (options.nomComplet.trim().length < 3 || options.nomComplet.length > 120) erreurs.push("NOM_INVALIDE");
  if (options.operateur.trim().length < 3 || options.operateur.length > 120) erreurs.push("OPERATEUR_INVALIDE");
  if (options.motif.trim().length < 20 || options.motif.length > 500) erreurs.push("MOTIF_TROP_COURT");
  return erreurs;
}

function litteral(valeur: string): string {
  return `'${valeur.replaceAll("'", "''")}'`;
}

function dateSql(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export async function preparerProprietaireSecondaire(
  options: OptionsProprietaireSecondaire,
  maintenant = new Date(),
): Promise<ProprietaireSecondairePrepare> {
  const erreurs = validerOptionsProprietaireSecondaire(options);
  if (erreurs.length) throw new Error(`Options invalides: ${erreurs.join(", ")}.`);

  const codeActivation = genererJetonAleatoire(32);
  const empreinte = await hacherMotDePasse(codeActivation);
  const utilisateurId = `usr-${crypto.randomUUID()}`;
  const expireLe = dateSql(new Date(maintenant.getTime() + DUREE_ACTIVATION_SECONDAIRE_HEURES * 3_600_000));
  const nom = litteral(options.nomComplet.trim());
  const identifiant = litteral(options.identifiant);
  const id = litteral(utilisateurId);
  // Gardes dans le SQL: au moins un propriétaire actif existe (pas d'amorçage à vide), pas de dépassement du plafond,
  // identifiant libre. Si une garde échoue, aucune ligne n'est écrite et l'audit n'est pas inséré non plus.
  const garde = `EXISTS (SELECT 1 FROM utilisateurs WHERE role = 'PROPRIETAIRE' AND statut = 'ACTIF')
    AND (SELECT COUNT(*) FROM utilisateurs WHERE role = 'PROPRIETAIRE' AND statut = 'ACTIF') < ${MAX_PROPRIETAIRES_ACTIFS}
    AND NOT EXISTS (SELECT 1 FROM utilisateurs WHERE identifiant = ${identifiant})`;
  const sql = `-- Création d'un second propriétaire (procédure D-17). Exécuter une seule fois sur l'environnement visé.
-- Opérateur: ${options.operateur.replaceAll("\n", " ")}
-- Le code d'activation n'est PAS dans ce fichier (empreinte seulement). Supprimer ce fichier après exécution.

INSERT INTO utilisateurs
  (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, code_activation_hash, code_activation_expire_le,
   statut, doit_changer_mot_de_passe)
SELECT ${id}, ${identifiant}, ${nom}, 'PROPRIETAIRE', NULL, ${litteral(empreinte)}, ${litteral(empreinte)},
       ${litteral(expireLe)}, 'ACTIF', 1
WHERE ${garde};

INSERT INTO journaux_audit
  (id, utilisateur_id, role_utilisateur, action, entite_type, entite_id, donnees_apres, adresse_ip)
SELECT lower(hex(randomblob(16))), ${id}, 'OPERATEUR_RECOVERY', 'CREATION_PROPRIETAIRE_SECONDAIRE', 'UTILISATEUR', ${id},
       json_object('identifiant', ${identifiant}, 'operateur', ${litteral(options.operateur.trim())},
                   'motif', ${litteral(options.motif.trim())}, 'expire_le', ${litteral(expireLe)}), NULL
WHERE EXISTS (SELECT 1 FROM utilisateurs WHERE id = ${id})
  AND NOT EXISTS (SELECT 1 FROM journaux_audit WHERE action = 'CREATION_PROPRIETAIRE_SECONDAIRE' AND entite_id = ${id});
`;
  return { sql, codeActivation, utilisateurId, expireLe };
}
