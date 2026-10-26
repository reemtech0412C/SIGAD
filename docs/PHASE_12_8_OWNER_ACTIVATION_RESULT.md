# SIGAD — Phase 12.8 — Activation initiale du compte propriétaire

## État au 24 octobre 2026

**STATUT : BLOCKED — les tentatives d’émission du 24 octobre 2026 ont répondu HTTP 500; le mécanisme temporaire a été désactivé après chacune.**

Cette phase n’est pas déclarée terminée : aucun nouveau jeton n’a été émis ni remis au coffre, le compte n’a pas été activé par son propriétaire et aucun changement de mot de passe ou de MFA n’a eu lieu. La cause interne du HTTP 500 n’a pas été établie par une preuve exploitable; aucune cause n’est supposée.

## Vérifications et déploiement temporaire

| Contrôle | Résultat | Preuve non sensible |
|---|---|---|
| Compte Cloudflare | PASS | Identifiant vérifié : `a2c898e7e1fda02365b7d8a49809f7e9` |
| Worker Staging | PASS | `sigad-staging`; version sécurisée avant tentative `6f286f27-c663-429d-beac-013a2fdba1ba` |
| D1 Staging | PASS | `sigad-staging-db`, identifiant `a54e1ea9-c49a-4729-ad06-a40ceb421127` |
| R2 Staging | PASS | Binding `BUCKET` vers `sigad-staging-documents` |
| Migrations | PASS | 23 migrations, de `0001` à `0023`; aucune migration en attente |
| Comptes | PASS | 25 comptes; le propriétaire cible est actif, exige un changement initial du mot de passe et n’a pas encore de MFA actif |
| Activations héritées | PASS | 24 activations des autres comptes inchangées; 25 empreintes d’activation présentes au total et 0 expiration définie |
| Récupérations avant émission | PASS | 0 preuve opérateur, 0 dossier ouvert, 0 liaison d’activation de récupération |
| Coffre opérateur | PASS | Sous `YAMI\YAMI`, le vrai `LOCALAPPDATA` est utilisé; dossier et clé DPAPI présents, clé publique concordante; 0 fichier de jeton |
| Build Wrangler à blanc | PASS | Dry-run `sigad-staging`, `ENVIRONMENT=staging`, bindings D1/R2/assets et variable temporaire vérifiés |
| Worker temporaire | PASS | Versions `22988cd6-4ed0-47c7-8577-a5d51369395f` et `97c49e9e-b1a5-49eb-876f-fea59d23c9a7`, Staging uniquement |
| Émission officielle | BLOCKED | Les 3 tentatives cumulées ont répondu HTTP 500; aucun corps n’a été journalisé et aucun fichier de jeton n’a été créé |
| D1 après la tentative | PASS | 25 comptes; propriétaire actif; mot de passe initial encore requis; MFA non enrôlé; 0 expiration rétroactive, 0 liaison, 0 dossier ouvert et 0 preuve; 0 ligne écrite |
| Désactivation après échec | PASS | Version sécurisée active `04ceb607-ca62-4893-b626-eddfb93280c5`; `/api/sante` répond 200 et la route de récupération répond 404 |

## Tests

| Test | Résultat |
|---|---|
| `npm run typecheck` | PASS — relancé seul sous PowerShell Windows normal après un verrou temporaire de journal Wrangler |
| `npm run build` | PASS |
| `npm run test:unit` | PASS — 15 fichiers, 59 tests |
| `npm run test:security-matrix` | PASS — 145 routes cataloguées |
| `npm run db:verifier` | PASS — 23 migrations locales jusqu’à `0023`, contraintes et clés étrangères validées |
| `npm run test:integration` sous PowerShell Windows autorisé | PASS — scénarios Worker/D1 locaux, dont récupération atomique, usage unique, révocation, MFA, stocks, distributions, rapports et isolation |
| Première tentative d’intégration dans le bac à sable | ENVIRONMENT_BLOCKED — `GetFinalPathNameByHandleW: #5`; la relance sous PowerShell utilisateur a réussi |
| Contrôle HTTPS post-déploiement | PASS — santé, CSRF, page, JavaScript `200 text/javascript`, CSS `200 text/css` |
| Route de récupération temporairement active, sans preuve | PASS — refus `401`; aucun jeton créé |
| Observation Wrangler Tail filtrée | PARTIAL — le flux n’a fourni aucun nom d’exception exploitable; aucun payload ni message brut n’a été journalisé |
| Route après désactivation | PASS — HTTPS `404`; santé répond `200` |
| Vérification D1 après l’échec | PASS — 25 comptes inchangés, 24 autres activations conservées sans expiration rétroactive, 0 récupération, 0 preuve, `rows_written=0` |

## Activation personnelle et clôture

Le propriétaire a confirmé être prêt. Le contrôle sous `YAMI\YAMI` a confirmé que Node et PowerShell utilisent le même `LOCALAPPDATA`, que le coffre opérateur DPAPI est accessible et que sa clé correspond à la clé publique Staging. Trois demandes d’émission au total ont répondu HTTP 500. Aucun jeton n’a été remis au coffre (`ACTIVATION_FILE_COUNT=0`). Les vérifications D1 après les deux dernières demandes constatent 0 preuve, 0 dossier, 0 liaison d’activation et aucune expiration définie; le compte propriétaire conserve son état avant émission. Le flux Wrangler Tail filtré n’a livré aucun nom d’exception exploitable. Aucune cause interne n’est supposée.

Après les deux dernières tentatives, les Workers temporaires `22988cd6-4ed0-47c7-8577-a5d51369395f` et `97c49e9e-b1a5-49eb-876f-fea59d23c9a7` ont été remplacés par la version sécurisée `04ceb607-ca62-4893-b626-eddfb93280c5`, vérifiée comme version active à 100 %. `/api/sante` répond `200` et la route de récupération renvoie `404`. Le coffre DPAPI local existe, mais il ne contient aucun fichier d’activation; ne lancez pas la commande de révélation, car elle ne peut pas fournir de jeton.

Restent à établir : diagnostiquer le HTTP 500 avec une source d’observabilité exploitable sans exposer de secret, corriger et valider le défaut, puis obtenir une nouvelle autorisation avant toute autre émission. Aucune activation personnelle, modification de mot de passe ou configuration MFA n’a eu lieu. La version sécurisée actuellement active est `04ceb607-ca62-4893-b626-eddfb93280c5`; la récupération répond `404`.

## Périmètre

Aucune opération Production, aucune modification des 24 autres comptes, aucun Git push et aucune émission réelle de jeton n’ont eu lieu. Le Worker Staging est revenu à la configuration de récupération désactivée.
