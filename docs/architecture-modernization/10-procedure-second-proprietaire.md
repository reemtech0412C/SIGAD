# Procédure documentée — création d’un second propriétaire (D-17)

**Pourquoi.** Les opérations de plateforme de classe A (D-16) exigent un second approbateur PROPRIETAIRE. Avec un seul propriétaire actif, elles échouent fermé (`SECOND_PROPRIETAIRE_ABSENT`). Cette procédure est le seul moyen prévu de créer ce second propriétaire; aucune route API ne crée de compte PROPRIETAIRE.

## Principes

* **Exécution par un opérateur nommé**, jamais par l’application ni par un agent automatique. Le script prépare un fichier SQL et un code; il n’exécute rien et ne contacte aucune base.
* **Garde-fous dans le SQL:** au moins un propriétaire actif doit exister (pas d’amorçage à vide), maximum 3 propriétaires actifs, identifiant libre, exécution rejouable sans doublon ni double audit.
* **Secret hors fichier:** le fichier SQL ne contient que l’empreinte du code d’activation. Le code s’affiche une fois dans le terminal de l’opérateur, expire en 24 h et se saisit comme mot de passe à la première connexion; le changement de mot de passe et la configuration MFA sont ensuite obligatoires (comme pour tout propriétaire).
* **Traçabilité:** une ligne `CREATION_PROPRIETAIRE_SECONDAIRE` est écrite dans `journaux_audit` avec l’identité de l’opérateur, le motif et l’expiration; l’acteur technique est `OPERATEUR_RECOVERY`.
* **Autorisation préalable:** la création est décidée par le propriétaire fonctionnel; le motif (≥ 20 caractères) doit y faire référence.

## Étapes

1. **Préparer** (poste de l’opérateur, dépôt à jour):
   ```bash
   node scripts/preparer-proprietaire-secondaire.mjs --identifiant <identifiant> --nom "<nom complet>" --operateur "<identité de l’opérateur>" --motif "<référence de la décision, ≥ 20 caractères>" --sortie <fichier.sql>
   ```
   Noter le code affiché sur la sortie standard et le transmettre **hors bande** à la personne (pas par le canal où se trouve le fichier).
2. **Contrôler le fichier**: une seule insertion `utilisateurs` (rôle `PROPRIETAIRE`, `doit_changer_mot_de_passe = 1`) et une insertion d’audit; aucun code en clair.
3. **Exécuter** sur l’environnement visé uniquement (exemple Staging; toute exécution distante est un acte d’exploitation distinct):
   ```bash
   npx wrangler d1 execute DB --remote --config wrangler.staging.toml --file="<fichier.sql>"
   ```
4. **Supprimer** le fichier SQL et effacer le code des terminaux.
5. **Activation** (par la personne): connexion avec l’identifiant et le code, nouveau mot de passe, configuration MFA, sauvegarde des codes de récupération.
6. **Vérifier**: `GET /api/proprietaire/utilisateurs` liste le compte actif; les deux propriétaires peuvent désormais traiter les demandes d’approbation (console Plateforme).

## Annulation et incidents

* Code non utilisé dans les 24 h: le compte reste inutilisable après expiration; le suspendre via le cycle de vie des comptes (motif obligatoire) ou rejouer la procédure avec un nouvel identifiant.
* Perte du second propriétaire (suspension): les opérations de classe A échouent de nouveau fermé; relancer la procédure.
* Le dernier propriétaire actif ne peut jamais être suspendu (invariant I5).

## Hors périmètre

La procédure ne contourne ni la double approbation d’autres actions, ni l’audit. L’exécution distante n’est pas faite par l’assistant de développement: elle relève de l’opérateur désigné.
