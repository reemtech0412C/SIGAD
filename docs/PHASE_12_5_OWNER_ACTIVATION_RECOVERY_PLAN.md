# SIGAD — Récupération exceptionnelle du compte propriétaire

Date : 24 octobre 2026  
Périmètre exécuté : implémentation et essais locaux isolés uniquement  
Staging : aucune migration, émission, configuration ou publication exécutée  
Production : aucune opération

## Décision et état observé

```text
LOCAL_IMPLEMENTATION: PASS
LOCAL_SECURITY_TESTS: PASS
LOCAL_ACCEPTANCE: PASS
STAGING_ACCOUNT_RECHECK: NOT_PERFORMED
STAGING_D1_MIGRATION: NOT_APPLIED
STAGING_RECOVERY_FLAG: DISABLED / NOT_CONFIGURED
STAGING_OWNER_ACTIVATION_CODE: NOT_ISSUED
LOCAL_TEST_CODE: SYNTHETIC_AND_EPHEMERAL
PRODUCTION_CHANGES: NONE
```

L’ancien état du compte propriétaire cité dans la recette 12.5 est historique et n’a pas été revérifié à distance. Aucun secret, mot de passe, code TOTP ou jeton réel n’a été consulté ou émis. La récupération reste désactivée par défaut : elle exige simultanément `ENVIRONMENT=staging` et `SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE=true`, ainsi que l’identité et la clé publique de l’opérateur. La configuration Staging actuelle ne définit pas ces trois valeurs.

## Schéma additif

La migration `migrations/0023_activation_initiale_securisee.sql` ne modifie aucune migration antérieure. Elle ajoute :

| Élément | Fonction |
|---|---|
| `preuves_operateur_recuperation` | Journal append-only des preuves signées consommées : propriétaire ciblé, identité opérateur, empreinte du nonce, opération, motif, échéance et date de consommation. La preuve brute et le jeton d’activation ne sont jamais enregistrés. |
| `recuperations_acces_proprietaire` | Cycle d’émission, d’expiration, d’utilisation, de révocation et d’achèvement de l’activation initiale; références vers la preuve, la session et le défi MFA concernés. |
| `utilisateurs.code_activation_expire_le` et `code_activation_recuperation_id` | Expiration et liaison du code au dossier d’activation. |
| `sessions.activation_initiale` et `sessions.recuperation_id` | Identification d’une session temporaire et de son dossier source. |
| `defis_mfa.activation_initiale` et `defis_mfa.recuperation_id` | Liaison des défis MFA à l’activation temporaire. |
| Index et déclencheurs | Un seul dossier ouvert par compte, cible limitée à `proprietaire`/`PROPRIETAIRE`, intégrité référentielle et immutabilité du journal de preuves. |

La migration a été appliquée uniquement à une D1 locale temporaire vide par le banc de tests. Résultat vérifié : 23 migrations jusqu’à `0023`, 67 tables, 91 index, 74 déclencheurs de validation et aucune violation de clé étrangère. Le compteur de 67 inclut les 62 tables métier et les 5 tables techniques ajoutées pour MFA et la récupération.

## Preuve opérateur

La preuve n’utilise pas une session SIGAD, un rôle RBAC, un mot de passe de secours ou un facteur MFA de l’utilisateur ciblé. Elle est indépendante de ces mécanismes et vérifiée par le Worker avant toute écriture :

1. Un opérateur autorisé prépare localement une clé ECDSA P-256. Sa clé privée est protégée par Windows DPAPI `CurrentUser`; elle ne quitte pas le profil Windows. La clé publique et l’identité Windows normalisée sont les seules valeurs destinées à la configuration Staging.
2. L’opérateur signe une preuve compacte ES256 avec `iss`, `aud`, `sub`, l’identité autorisée, l’opération exacte, un `jti` aléatoire de 256 bits, l’empreinte SHA-256 du motif, `iat` et `exp`.
3. Le Worker vérifie la signature, le `kid`, la cible fixe `usr-proprietaire`, le motif, l’identité configurée, l’opération et une durée maximale de cinq minutes. Chaque opération a sa portée distincte : émission ou révocation.
4. Le Worker ne persiste que le hash du `jti`. Sa contrainte `UNIQUE` et le `db.batch` rendent son utilisation unique même en cas de concurrence. La preuve et la mutation du compte sont dans le même batch; un échec de persistance annule l’émission.
5. Le code d’activation est aléatoire (32 octets), limité au propriétaire, haché en D1 et valable quinze minutes. Le client de préparation futur, fixé au seul Worker Staging connu, le reçoit en HTTPS et le scelle immédiatement avec DPAPI. Le client n’affiche ni le code, ni la preuve, ni le corps d’erreur.

La clé opérateur est générée uniquement lorsque l’opérateur exécutera explicitement `preparer-operateur`. Cette génération et la publication/configuration de sa clé publique n’ont pas été exécutées dans cette tâche. Le fichier de configuration Wrangler n’a pas été activé.

## Échange et restrictions de session

Le parcours prévu est :

1. Le propriétaire saisit le code comme secret de première connexion sur Staging HTTPS. La consommation du hash du code, la création de la session limitée et la liaison au dossier sont atomiques. Un second échange concurrent échoue.
2. Le cookie de cette session expire après quinze minutes. L’autorisation du middleware ne permet que session, déconnexion, changement du mot de passe initial et routes d’enrôlement/confirmation MFA nécessaires. Toute route métier ou administrative est refusée.
3. Si un MFA existant est déjà actif, l’étape MFA reste obligatoire avant la création de la session; la récupération ne le contourne pas. Sinon, le mot de passe doit être changé, puis le MFA enrôlé et confirmé avant de clôturer le dossier et d’ouvrir l’accès normal.
4. La révocation exige une nouvelle preuve opérateur de portée `REVOQUER_ACTIVATION_INITIALE`. Elle invalide le code, le défi et la session temporaire associés.

L’émission invalide les sessions et défis MFA précédents du propriétaire. Aucun privilège RBAC n’est ajouté et aucun nouveau compte n’est créé.

## Coffre local Windows

`scripts/coffre-recuperation-dpapi.mjs` fournit un test DPAPI, la préparation du coffre opérateur, l’export de la seule clé publique, le scellement DPAPI et une commande explicite de révélation locale du code pour saisie dans le navigateur. Les données privées sont stockées hors du dépôt sous le profil `%LOCALAPPDATA%\SIGAD\Staging\recuperation-proprietaire`, avec ACL restreinte au SID Windows courant et DPAPI `CurrentUser`.

`scripts/emettre-activation-proprietaire-staging.mjs` est limité à l’URL exacte `https://sigad-staging.reemtech0412.workers.dev`, utilise HTTPS avec vérification TLS normale, CSRF et preuve signée, puis scelle la réponse directement dans le coffre. Il n’accepte pas d’URL arbitraire. Il n’a pas été exécuté et ne pourra réussir que si la migration, le Worker et la configuration Staging sont déployés et activés après autorisation explicite. Le code n’est ni transmis dans la conversation ni écrit dans le dépôt.

Les fichiers du coffre ne sont pas des artefacts versionnés. La D1, les logs Wrangler, les rapports de tests et les sorties de commande ne contiennent aucun code d’activation réel.

## Résultats des essais locaux

| Contrôle | Résultat observé |
|---|---|
| TypeScript strict (`npm run typecheck`) | PASS — code de sortie 0 |
| Build Vite/PWA (`npm run build`) | PASS — build terminé |
| Tests unitaires (`npm run test:unit`) | PASS — 54 tests dans 14 fichiers |
| Vérification D1 locale (`node --experimental-sqlite scripts/verifier-schema-local.mjs`) | PASS — 23 migrations, 67 tables, 91 index, 74 triggers, 25 comptes de test, aucune violation FK |
| Tests d’intégration Worker/D1/Wrangler | PASS — 1 scénario de récupération, 1/1 réussi sur Worker Wrangler local et D1 temporaire isolée |
| Tests de preuve | PASS — signature invalide, mauvaise portée/cible/identité/motif, preuve expirée ou future refusées; rejeu et preuve concurrente refusés |
| Tests du cycle d’activation | PASS — expiration, code à usage unique sous concurrence, session temporaire, refus métier, révocation du code/session/défi, changement de mot de passe et MFA requis |
| Rollback d’écriture d’audit | PASS — erreur provoquée dans la base temporaire, aucune mutation partielle du compte ni preuve conservée |
| Coffre Windows DPAPI `CurrentUser` et ACL | PASS — `node scripts/verifier-coffre-recuperation-dpapi.mjs` a scellé puis relu un code synthétique dans un profil temporaire, vérifié le contenu chiffré et appliqué l’ACL; le répertoire de test a été supprimé |
| Security Matrix (`npm run test:security-matrix`) | PASS — matrice régénérée et cohérente, 145 routes classées |
| `git diff --check` | PASS |
| Playwright | NON EXÉCUTÉ — hors parcours navigateur; aucune affirmation de validation E2E |

Commandes de validation exécutées : `npm run typecheck`, `npm run build`, `npm run test:unit`, `node --experimental-sqlite scripts/verifier-schema-local.mjs`, `npm run test:security-matrix`, `git diff --check`, `node scripts/verifier-coffre-recuperation-dpapi.mjs` et le test Worker/D1 ciblé `recovery-proprietaire-worker.test.mjs` via `npm run test:integration` sous PowerShell Windows avec `SIGAD_INTEGRATION_TESTS` fixé à ce fichier. Le runner a refusé une première configuration qui plaçait le seed temporaire dans le dépôt; il a été relancé avec un répertoire temporaire Windows hors dépôt et a terminé avec succès. Le seul échec d’environnement antérieur est le refus d’accès `workerd` dans le bac à sable; le même test a réussi dans le contexte PowerShell local autorisé. L’intégration a émis des codes uniquement pour les fixtures synthétiques de sa D1 temporaire; aucune émission Staging n’a été faite.

Le premier lancement depuis l’environnement isolé de l’agent a échoué avec `workerd/util/sqlite.c++:378: GetFinalPathNameByHandleW #5 Access denied`, attribué au bac à sable Windows. Le même runner, toujours local et avec stockage D1 isolé, a ensuite réussi dans le contexte PowerShell utilisateur autorisé. Aucun fichier d’état de développement n’a été utilisé comme cible des tests.

## Procédure Staging soumise à autorisation future

Cette procédure est documentaire; aucune commande ci-dessous n’a été exécutée à distance.

1. Vérifier à nouveau, en lecture seule, le compte Cloudflare, le Worker `sigad-staging`, la base `sigad-staging-db` et l’identifiant attendu `a54e1ea9-c49a-4729-ad06-a40ceb421127`. Vérifier aussi que la base est bien la cible approuvée et que ses données sont synthétiques. Arrêter si un identifiant diffère.
2. Préparer un instantané/backup Staging vérifiable et consigner le plan de restauration. Examiner la migration `0023` et les migrations en attente.
3. Après autorisation distincte de migration, appliquer les migrations avec `npx wrangler d1 migrations apply DB --remote --config wrangler.staging.toml`, puis vérifier le journal et le schéma contre l’ID cible. Ne pas employer `--env` ni une autre configuration. Aucune commande Wrangler distante n’a été exécutée dans cette tâche.
4. Générer le coffre opérateur sur le poste Windows autorisé, vérifier l’identité, et transmettre la clé publique via le canal de configuration Cloudflare approuvé. Configurer `SIGAD_RECUPERATION_OPERATEUR_IDENTITE`, `SIGAD_RECUPERATION_OPERATEUR_CLE_PUBLIQUE` et `SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE=true` uniquement en Staging. Le drapeau doit rester absent ou faux avant la fenêtre d’intervention; ne pas le placer dans une configuration commune/Production.
5. Après autorisation distincte de publication, déployer la version Staging et vérifier l’URL fixe, les bindings et les contrôles sans émettre de code. L’émission est encore une action distante distincte.
6. Après autorisation explicite de récupérer le compte, saisir un motif non personnel dans `node scripts/emettre-activation-proprietaire-staging.mjs --executer-staging --motif=<justification>`. Le script scelle le code dans le coffre DPAPI et n’affiche que le chemin. Révéler le code uniquement sur le poste autorisé avec `node scripts/coffre-recuperation-dpapi.mjs reveler-jeton`, puis le saisir immédiatement dans la page HTTPS Staging; changer le mot de passe et terminer l’enrôlement MFA dans le navigateur.
7. Désactiver ensuite immédiatement le drapeau de récupération et retirer l’identité/la clé publique opérateur de Staging; déployer la configuration désactivée. Laisser les preuves et dossiers immuables pour audit. Supprimer le coffre après confirmation de la clôture selon la politique locale de conservation.

## Retour arrière

La migration est additive et ne possède pas de `DOWN` destructive. Avant application future, faire un backup D1 Staging et tester sa restauration dans une base isolée. Si le Worker provoque un incident, désactiver le drapeau de récupération et revenir à la version Worker précédente depuis le mécanisme de versions Cloudflare approuvé. Cela ne restaure pas D1. Si la migration est déjà appliquée, conserver le schéma et les traces; ne pas supprimer les tables ni effacer les preuves. La restauration D1 doit être une procédure de restauration testée, vers une base isolée d’abord, puis autorisée explicitement. Pour les essais locaux jetables, le runner utilise un répertoire temporaire dédié qu’il détruit après fermeture du Worker.

## État du dépôt et limites

- Fichiers fonctionnels de cette évolution : migration `0023`, service de vérification de preuve, routes d’authentification, bindings et middleware de session, coffre DPAPI, client d’émission Staging non exécuté, tests unitaires/intégration et vérificateur de schéma/matrice adaptés.
- Le dépôt comportait déjà de nombreux changements SIGAD non liés dans l’arbre de travail; ils n’ont pas été nettoyés, réinitialisés ni commités.
- Aucune migration distante, modification du compte propriétaire Staging, génération de code réel, configuration de clé publique/secrets, publication Worker, action Production ou push GitHub n’a eu lieu.
- La procédure de récupération n’est pas déclarée Production-Ready. L’acceptation concerne seulement la conformité locale du parcours et des protections testées.
