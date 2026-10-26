# SIGAD — Phase 12.7 : préparation de l’activation initiale du propriétaire

Date de contrôle : 24 octobre 2026  
Environnement visé : Cloudflare Staging uniquement  
Compte cible : `usr-proprietaire` (`proprietaire`)

## Décision

```text
OPERATOR_KEY: PASS
PUBLIC_KEY_CONFIG: PASS
RECOVERY_SECURITY: PASS
OWNER_ACCOUNT: VERIFIED
ACTIVATION_READINESS: READY_FOR_APPROVAL
TOKEN_ISSUED: NO
OVERALL: PASS
```

`READY_FOR_APPROVAL` signifie que les préconditions et les protections ont été vérifiées. La récupération reste désactivée. Aucun jeton réel, changement de compte, déploiement ou écriture distante n’a été effectué pendant cette phase.

## Ressources Staging vérifiées

| Élément | Résultat |
|---|---|
| Compte Cloudflare | Vérifié : `a2c898e7e1fda02365b7d8a49809f7e9` |
| Worker | `sigad-staging`, déploiement actif à 100 % |
| Version active constatée | `370a5539-8a48-4940-81e7-626d442aca48` |
| D1 | `sigad-staging-db`, ID `a54e1ea9-c49a-4729-ad06-a40ceb421127` |
| R2 | `sigad-staging-documents` |
| Migrations | `0001` à `0023` enregistrées ; Wrangler indique aucune migration en attente |
| Schéma distant | 68 tables selon `wrangler d1 info` ; aucune écriture produite par les contrôles |

`wrangler d1 list` a affiché `num_tables=0`, valeur incohérente avec la base observée. Le contrôle direct `wrangler d1 info` donne 68 tables, et le registre D1 confirme les 23 migrations. Les requêtes d’état ont confirmé les tables et les données d’authentification attendues. L’incohérence concerne l’affichage de la commande de liste, pas l’état de la base.

La première invocation de `wrangler d1 info` incluait `--remote`, option non prise en charge par cette sous-commande ; elle a été rejetée avant toute action. La commande correcte, sans cette option, a ensuite confirmé la base distante définie par le fichier Staging.

## Compte propriétaire et comptes préservés

Lecture agrégée de Staging, sans afficher de données d’identification :

- Le compte cible existe une fois, porte le rôle `PROPRIETAIRE` et est `ACTIF`.
- Le changement initial de mot de passe est requis ; MFA n’est pas encore activé.
- Un ancien hash d’activation existe, sans date d’expiration ni liaison à une récupération.
- Aucun dossier ou preuve de récupération n’existe ; aucune récupération n’est ouverte.
- Les 24 autres comptes existent. Ils n’ont pas de liaison ni d’expiration de récupération ; le relevé agrégé indique 23 comptes actifs parmi eux.
- La comparaison de la sauvegarde Staging restaurée avant/après 0023 a conservé les 25 comptes champ par champ, dont les états, mots de passe, activations et MFA : 24 activations héritées sans expiration rétroactive, zéro modification inattendue.

La sauvegarde chiffrée existante a été rouverte sous DPAPI CurrentUser puis restaurée en SQLite mémoire. Le contrôle a confirmé 22 migrations dans la sauvegarde, l’application de 0023 sur cette copie seulement, 68 tables, zéro violation de clé étrangère et aucune modification des lignes métier préexistantes. La sauvegarde originale n’a pas été modifiée.

## Coffre opérateur et configuration de clé

- Le coffre a été vérifié sous le profil Windows autorisé. DPAPI CurrentUser a pu ouvrir la clé privée localement.
- La clé privée DPAPI, la clé publique du coffre et la clé publique configurée pour Staging correspondent. Les valeurs cryptographiques ne sont pas reproduites ici.
- Les ACL du dossier et du fichier privé accordent le contrôle au seul profil Windows courant. La clé privée n’est pas configurée sur Cloudflare.
- La configuration Staging contient l’identité opérateur et la seule clé publique. L’inventaire Wrangler des secrets n’expose que le nom du secret MFA, sans valeur.
- Le drapeau `SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE` n’est pas présent dans `wrangler.staging.toml`. Avec un cookie CSRF valide, la route distante de récupération a répondu HTTP 404. Après ce contrôle, les compteurs D1 demeurent à 25 comptes, zéro preuve, zéro dossier, zéro dossier ouvert, zéro expiration et zéro liaison de récupération ; la requête de contrôle a écrit zéro ligne.

Une première lecture depuis l’environnement Sandbox avait échoué sur `ENOENT`, car `%LOCALAPPDATA%` y était redirigé vers un profil isolé. Ce n’était pas une erreur DPAPI. La vérification réussie a été exécutée sous le profil Windows autorisé, sans déplacer le coffre ni modifier ses ACL.

## Contrôles de sécurité exécutés

| Contrôle | Résultat |
|---|---|
| Signature ES256 et limitation au compte, à l’opération et au motif | PASS — tests unitaires, y compris sujet/opérateur/opération incorrects |
| Clé non approuvée, signature altérée et preuve expirée ou hors fenêtre | PASS — refus vérifiés |
| Durée de la preuve opérateur | PASS — fenêtre maximale de 300 secondes vérifiée |
| Activation et session temporaire | PASS — expiration de 15 minutes vérifiée ; cookie d’activation limité à 900 secondes |
| Nonce à usage unique et concurrence | PASS — deux requêtes avec la même preuve donnent une seule acceptation ; rejeu refusé |
| CSRF | PASS — écriture sans CSRF refusée dans le Worker local |
| Révocation | PASS — route testée sur Worker/D1 locaux ; la session et le code associés sont invalidés |
| Session d’activation | PASS — accès métier et administratif refusé avant la fin de l’activation |
| Mot de passe et MFA | PASS — MFA central obligatoire avant accès administratif complet |
| Route distante lorsque la récupération est désactivée | PASS — HTTP 404, aucun jeton et aucune écriture D1 |

Le contrôle d’intégration a utilisé uniquement Wrangler et une D1 temporaire locale, un jeu synthétique et une clé de test éphémère. Le test a couvert l’émission locale, l’expiration, la concurrence, la révocation, le changement de mot de passe et l’enrôlement MFA ; il n’a pas utilisé la clé opérateur de Staging ni communiqué avec Cloudflare.

## Outil local de révocation

L’API disposait déjà d’une route de révocation sécurisée et le test d’intégration la couvrait, mais aucun client opérateur local n’était fourni. Un outil dédié, `scripts/revoquer-activation-proprietaire-staging.mjs`, a été ajouté. Il est limité à l’URL HTTPS Staging, exige le coffre DPAPI du profil Windows courant, signe une preuve distincte de révocation, applique CSRF et n’affiche ni preuve, ni jeton, ni corps sensible. Ses tests utilisent une paire de clés synthétique et un transport simulé ; aucune révocation Staging n’a été appelée.

## Vérifications logicielles

| Vérification | Résultat observé |
|---|---|
| `npm run typecheck` | PASS — code de sortie 0 (`wrangler types` puis `tsc --noEmit`) |
| `npm run build` | PASS — Vite et génération PWA |
| `npm run test:unit` | PASS — 15 fichiers, 59 tests |
| Test d’intégration propriétaire | PASS — 1 scénario Worker/D1 local, 1 réussi, 0 échec |
| `npm run test:security-matrix` | PASS — matrice synchronisée avec 145 routes |
| `git diff --check` | PASS — aucun défaut d’espacement ; avertissements Git limités à LF/CRLF |
| Contrôle de sauvegarde et migration locale 0023 | PASS — restauration, comparaison de 25 comptes et contrôles FK |

Un premier lancement de `npm run typecheck` a signalé que Wrangler ne pouvait pas écrire son fichier de log dans le profil isolé, mais le processus s’est terminé avec le code 0. Le contrôle a été relancé avec l’écriture des logs Wrangler désactivée ; le typecheck a de nouveau réussi. Aucun journal contenant des secrets n’a été créé volontairement.

## Procédure proposée après autorisation finale

La procédure suivante n’a pas été exécutée. Elle cible le Worker existant, sans `--env`, et ne touche ni Production ni une autre base :

1. Construire puis contrôler à blanc le Worker Staging, en vérifiant son nom et ses bindings avant publication.
2. Avec autorisation explicite, déployer temporairement l’activation de la route :

   ```powershell
   node .\node_modules\wrangler\bin\wrangler.js deploy --config .\wrangler.staging.toml --name sigad-staging --strict --keep-vars --var SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE:true
   ```

3. Émettre une preuve opérateur fraîche et un jeton limité au compte propriétaire. Le motif doit être une justification administrative non secrète de 10 à 300 caractères :

   ```powershell
   node .\scripts\emettre-activation-proprietaire-staging.mjs --executer-staging --motif="Activation initiale demandée par le propriétaire sur Staging."
   ```

   Le jeton est conservé dans le coffre DPAPI CurrentUser. Le script d’émission affiche seulement le chemin du coffre. Pour le lire localement au moment de l’utilisation, dans une fenêtre PowerShell privée :

   ```powershell
   node .\scripts\coffre-recuperation-dpapi.mjs reveler-jeton
   ```

   Ne pas activer de transcription PowerShell, ne pas copier la sortie dans un ticket ou une conversation, et effacer l’affichage local après l’avoir collée dans le navigateur.

4. Utiliser le jeton sans délai : il expire 15 minutes après son émission. Garder la route activée seulement pendant la configuration personnelle du compte. Une fois le mot de passe changé, TOTP confirmé et la session complète vérifiée, désactiver immédiatement la route :

   ```powershell
   node .\node_modules\wrangler\bin\wrangler.js deploy --config .\wrangler.staging.toml --name sigad-staging --strict --keep-vars --var SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE:false
   ```

   Vérifier ensuite que la route répond à nouveau 404. La procédure ne dépend pas d’une utilisation du jeton après désactivation.

5. Sur [https://sigad-staging.reemtech0412.workers.dev/](https://sigad-staging.reemtech0412.workers.dev/), se connecter avec l’identifiant `proprietaire` et coller le jeton dans le champ « Mot de passe ». Le jeton remplace l’ancien code d’activation du propriétaire et ne peut servir qu’une fois.
6. Choisir un mot de passe unique d’au moins 12 caractères, puis enrôler TOTP dans l’application d’authentification personnelle, confirmer le code à six chiffres et conserver hors ligne les codes de récupération affichés une seule fois. Aucune fonction administrative n’est disponible avant le mot de passe et MFA.
7. Confirmer la session dans l’interface et ouvrir le tableau de bord. Si l’activation doit être annulée avant sa consommation, pendant la fenêtre autorisée et avant de désactiver la route, exécuter :

   ```powershell
   node .\scripts\revoquer-activation-proprietaire-staging.mjs --executer-staging --motif="Révocation de l’activation propriétaire sur Staging."
   ```

   La révocation efface le hash d’activation courant du propriétaire et invalide la session temporaire associée. Après toute révocation, redéployer le drapeau à `false`.

### Effet exact de l’émission réelle

La route d’émission utilisera une transaction D1 pour créer la preuve et le dossier, remplacer le hash d’activation préexistant du propriétaire par le hash du nouveau code expirant après 15 minutes, imposer le changement de mot de passe, révoquer les sessions et défis MFA précédents du propriétaire, et journaliser l’opération. Le contrôle distant a constaté MFA inactif ; l’enrôlement TOTP personnel sera donc obligatoire. Aucun autre compte ne fait partie des instructions ciblées. Ces mutations nécessitent l’autorisation finale et ne sont pas couvertes par l’autorisation de préparation seule.

Le déploiement temporaire et le retour au drapeau `false` créeraient chacun une nouvelle version du Worker Staging. Avant ces commandes, refaire un dry-run et vérifier bindings, variables préservées et artefacts ; ne pas lancer le déploiement si une différence non approuvée apparaît.

## Fichiers créés ou modifiés

- Créé : `scripts/revoquer-activation-proprietaire-staging.mjs`.
- Créé : `tests/unit/revoquer-activation-staging.test.mjs`.
- Modifié : `tests/unit/recuperation-proprietaire.test.mjs` — tests de clé publique non approuvée et des durées de 15 minutes.
- Créé : `docs/PHASE_12_7_OWNER_ACTIVATION_READINESS.md`.

## Opérations non réalisées

- Aucun déploiement Worker ni changement de variable Cloudflare.
- Aucune migration distante, écriture D1, émission ou révocation de jeton.
- Aucun changement de mot de passe ou MFA, y compris pour le propriétaire.
- Aucune action sur Production, GitHub ou Git push.
- Aucun accès à des données réelles de bénéficiaires.
