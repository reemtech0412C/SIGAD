# SIGAD — Phase 12 : publication GitHub et déploiement Cloudflare sécurisé

Date de contrôle : 23 octobre 2026 (Africa/Ndjamena)  
Commit local de référence : `371f0be`  
Branche locale : `ui/phase-11-harmonisation`

## Décision

**PHASE_12_STATUS : BLOCKED**

La validation locale a confirmé le schéma, le build, les tests unitaires, les tests Worker/D1/R2 et la matrice de sécurité. La publication et le déploiement sont suspendus par deux portes non satisfaites : l’identité GitHub connectée ne peut pas écrire dans le dépôt cible et un test Playwright du téléchargement CSV échoue. Les ressources Cloudflare configurées dans `wrangler.toml` ne correspondent pas aux ressources visibles dans le compte vérifié.

**Aucune écriture distante n’a été effectuée : aucun commit, push, pull request, création de ressource, secret distant, migration distante ou déploiement.** Aucune donnée de production n’a été lue ou modifiée.

## Dépôt et publication GitHub

| Contrôle | Résultat |
|---|---|
| Dépôt cible | `https://github.com/reemtech0412C/SIGAD` |
| Visibilité et branche par défaut | Public, branche `main` |
| Contenu distant | Dépôt vide (`size: 0`) au contrôle |
| Identité GitHub connectée | `sihhaapp` |
| Permission déclarée par l’intégration | `pull: true`, `push: false` |
| Remote Git local | Aucun (`git remote -v` vide) |
| Branche demandée `release/staging-2026-10` | Non créée |
| Commit de publication | Aucun |

L’API GitHub a refusé la lecture du niveau collaborateur avec `403 Resource not accessible by integration`. Les métadonnées du dépôt indiquent néanmoins explicitement `push: false`. Aucun contournement par token, clé SSH ou autre identité n’a été tenté.

Avant l’ajout de ce rapport, l’arbre local comportait 42 chemins suivis modifiés/supprimés et 58 chemins non suivis. Il comporte maintenant 42 chemins suivis modifiés/supprimés et 59 chemins non suivis, ce rapport inclus. Le contenu cumulé n’a pas été ajouté en bloc à Git : les fichiers de toutes les phases doivent être relus et classés avant de constituer un commit public. Le commit de référence local `371f0be` n’a pas été modifié.

## Analyse des secrets

Un contrôle heuristique a parcouru 244 fichiers texte actuels et les 7 commits accessibles. Il n’a relevé aucun motif correspondant aux signatures contrôlées ni fichier sensible candidat. Gitleaks et TruffleHog ne sont pas installés dans l’environnement. Ce résultat ne remplace donc pas un audit dédié exhaustif ; aucun résultat ne justifie une affirmation d’absence absolue de secret.

Le `.gitignore` exclut notamment `.env`, `.dev.vars`, les bases locales, les journaux, les clés et les fichiers d’activation. Les fichiers d’activation temporaires des exécutions locales ont été gardés hors du dépôt. Aucun secret n’a été ajouté à ce rapport.

## Compte et ressources Cloudflare — lecture seule

`wrangler whoami` a réussi avec Wrangler `4.151.3` et a vérifié le compte Cloudflare associé à la session. Les commandes de liste ont été utilisées uniquement en lecture seule.

| Ressource SIGAD configurée | Valeur dans `wrangler.toml` | Vérification du compte |
|---|---|---|
| Worker | `sigad-tchad` | **MISSING** — `wrangler deployments list --name sigad-tchad` répond `10007: This Worker does not exist on your account` |
| D1 | `sigad-base`, identifiant `0cc2b4ec-bd2d-47ad-b804-42889957d1dc` | **MISSING** — aucun résultat de `wrangler d1 list` ne correspond au nom ou à l’identifiant configuré |
| R2 | `sigad-documents` | **MISSING** — absent de `wrangler r2 bucket list` |
| R2 de prévisualisation | `sigad-documents-local` | Liaison locale de prévisualisation ; aucune ressource distante de ce nom n’a été vérifiée |

Le compte contient d’autres bases et buckets, dont certains noms incluent « staging ». Leur appartenance à SIGAD n’est pas établie ; ils n’ont pas été utilisés, inspectés en profondeur ni modifiés. Aucun Worker, D1 ou R2 de staging SIGAD n’a été créé. Aucun domaine ou URL `workers.dev` n’est donc disponible.

Le fichier Wrangler courant déclare `ENVIRONMENT = "production"` et pointe vers des ressources non vérifiées. **Il ne doit pas servir de cible de déploiement staging tel quel.** La configuration de staging doit employer des ressources propres, des secrets séparés et `ENVIRONMENT=staging`, puis être revue avant son premier déploiement.

| Préparation complémentaire | État |
|---|---|
| Secrets et comptes de démonstration staging | Non créés ; aucune donnée réelle utilisée |
| URL Worker staging | Non disponible, Worker non créé |
| Sauvegarde/restauration D1 et R2 | **NOT_TESTED** — aucun staging n’existe pour effectuer une restauration isolée |
| Plan de retour arrière Cloudflare | **NOT_VALIDATED** — à tester sur les nouvelles ressources staging avant validation |
| Coût et quotas staging | **NOT_ASSESSED** — aucune ressource staging créée |

## Validation locale

| Contrôle | Commande / méthode | Résultat réel |
|---|---|---|
| TypeScript | `npm run typecheck` | **PASS** — code de sortie 0 ; Wrangler a affiché un `EPERM` non fatal lors de l’écriture de son journal hors du workspace |
| Build frontend | `npm run build` | **PASS** — Vite et génération PWA terminés, 141 modules transformés |
| Tests unitaires | `npm run test:unit` | **PASS** — 12 fichiers, 48 tests réussis |
| Intégration Worker/D1/R2 | `npm run test:integration` hors sandbox, stockage isolé | **PASS** — 22 tests réussis, aucun échec |
| Schéma et migrations | `npm run db:verifier` et vérification D1 du harnais | **PASS** — migrations `0001–0022`, 65 tables (62 métier et 3 MFA), 86 index, 74 déclencheurs, 25 comptes synthétiques et aucune violation de clé étrangère |
| Données territoriales locales | Vérificateur de schéma | 23 provinces ; 500 communes en relecture, **0 activée** |
| Matrice de sécurité | `npm run test:security-matrix` | **PASS** — 143 routes cataloguées |
| Refus sans mutation | Suite Worker locale | **PASS** — 140 essais anonymes et 128 refus RBAC ; empreinte des 65 tables inchangée après les requêtes interdites |
| Dépendances installées | `npm ls --depth=0` | **PASS** — versions directes résolues sans dépendance manquante |
| Audit npm production | `npm audit --omit=dev` | **PASS** — 0 vulnérabilité après correction ciblée de Zod |
| Audit npm complet | `npm audit` | **PASS** — 0 vulnérabilité après correction ciblée de Zod |
| Diff whitespace | `git diff --check` | **PASS** — avertissements CRLF/LF uniquement, aucune erreur de whitespace |
| Playwright / Chrome | `npm run test:e2e` avec Chrome installé | **PARTIAL** — 11 réussis, 2 ignorés, 1 échec |

Le contrôle initial d’audit npm avait identifié une vulnérabilité **High** dans `zod@4.6.5` (risque d’épuisement mémoire). La version `4.6.7` et son intégrité ont été vérifiées sur `registry.npmjs.org`, puis appliquées sans changement de version majeure. Seuls `package.json` et `package-lock.json` ont été modifiés à cette fin ; les deux audits post-correction indiquent zéro vulnérabilité.

### Détail Playwright

Les tests Chrome ont confirmé le chargement HTTP 200 des assets, le rendu effectif de **DM Sans**, la carte, les six modules administratifs, les vues responsive, les permissions de navigation et le parcours opérationnel.

Deux tests de recherche/enregistrement des communes sont ignorés par la suite parce que le rattachement administratif requis n’est pas vérifié. Le test `tests/e2e/rapports.spec.ts` reçoit bien la réponse d’export CSV en HTTP 200 et observe un événement de téléchargement, mais `download.saveAs()` expire après 60 secondes avec `download.saveAs: canceled`. Une correction UI locale expérimentale de durée de vie du lien Blob a été testée puis retirée, car elle n’a pas résolu l’échec. Le test de téléchargement reste donc **FAIL** et ne doit pas être masqué.

Les performances mesurées sont locales et synthétiques uniquement : pour les listes de ménages, environ 502 / 1 500 / 5 000 lignes, les médianes observées étaient de 65,52 / 59,33 / 53,95 ms et les p95 de 89,30 / 87,04 / 69,71 ms. Les agrégats de carte ont lu 157 lignes sans stock ou 301 avec stock par requête mesurée. Ces mesures ne préjugent pas de la performance Cloudflare.

Le Worker local lancé dans le sandbox de l’agent échoue avec `workerd/util/sqlite.c++:378: failed: GetFinalPathNameByHandleW: #5 Accès refusé`. La même suite a ensuite été exécutée dans un processus local hors sandbox : Wrangler a appliqué les 22 migrations à une D1 temporaire isolée, le vérificateur a confirmé les 65 tables, puis les tests Worker et R2 locaux ont réussi. La tentative CLI isolée du sandbox a été limitée à un chemin neuf, puis ce chemin temporaire a été supprimé après l’échec ; la base de développement habituelle n’a pas été utilisée.

## Écarts et travaux requis

1. Résoudre l’échec de téléchargement dans le test Chrome en conservant une vérification effective du fichier exporté ; ne pas neutraliser l’assertion `saveAs`.
2. Accorder `push` à l’identité GitHub connectée, ou faire connecter une identité autorisée par le propriétaire du dépôt. Le push doit attendre la revue explicite de la liste des fichiers publics.
3. Réconcilier le `wrangler.toml` de production avec le compte réel ; ne jamais utiliser les bindings configurés actuels pour la cible staging.
4. Après réussite de toute la suite, préparer une configuration staging dédiée, vérifier l’absence de collision des noms, revoir les 22 migrations et le plan d’arrêt/restauration, puis utiliser exclusivement une D1 et un bucket R2 nouvellement dédiés à SIGAD.
5. Maintenir les 500 communes non activées et la réserve **Phase 2 — PARTIAL** jusqu’à la validation administrative du référentiel.

## État des changements distants

| Action | État |
|---|---|
| Commit local | Aucun créé |
| Push GitHub / pull request | Aucun |
| Création de ressource Cloudflare | Aucune |
| Migration D1 distante | Aucune |
| Secret Cloudflare modifié | Aucun |
| Déploiement Worker / URL staging | Aucun |
| Modification de production | Aucune |

**Conclusion :** la base locale et les tests de service sont validés ; Phase 12 reste **BLOCKED** jusqu’à résolution du test Playwright d’export et obtention d’un droit GitHub en écriture. Le staging reste non créé et aucun changement Cloudflare n’a été apporté.
