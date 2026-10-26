# Phase 11 — Audit conservateur du code

Date : 23 octobre 2026 · Branche : `ui/phase-11-harmonisation` · Commit de départ : `371f0bedae975fca49dd4e40782080b1527e29ae`

**CODE_CLEANUP : PARTIAL**

## Portée et méthode

L’inventaire couvre **129 fichiers techniques** sous `frontend/src`, `backend/src`, `shared`, `tests`, `migrations` et `scripts`. Les vérifications ont combiné les imports React, les références de routes, les usages des composants communs, les fichiers chargés par Vite/Wrangler/PWA, les migrations, les tests, les sources géographiques, les paramètres `noUnusedLocals`/`noUnusedParameters` de TypeScript, le build et les tests applicables.

Le worktree était déjà largement modifié et contenait de nombreux fichiers non suivis avant Phase 11. Le commit `371f0be` a été conservé et la branche locale dédiée a été créée sans stash, reset, suppression ni réécriture de ces fichiers. Aucun commit n’a été créé afin de ne pas englober les changements préexistants non audités individuellement.

ESLint et Knip ne sont pas configurés comme outils du projet (`npm pkg get devDependencies.eslint devDependencies.knip` retourne `{}`). `npm ls --depth=0` termine avec le code 0 et tous les paquets racine présents. Aucun outil ni dépendance n’a été ajouté pour cette phase : une analyse d’orphelins qui ignore les imports dynamiques, les chemins Wrangler/Vite et les fichiers chargés par nom aurait présenté un risque de faux positifs. Les options TypeScript d’absence de déclarations inutilisées ont été contrôlées, mais ne remplacent pas une analyse complète de reachabilité.

## Classification

| Classe | Résultat de l’audit | Décision |
|---|---|---|
| `SAFE_TO_REMOVE` | Une règle mobile CSS redondante dans le système commun (2 lignes) était déjà remplacée par la règle responsive consolidée. | Règle supprimée; aucun fichier supprimé. |
| `NEEDS_REFACTOR` | Plusieurs feuilles et composants historiques coexistent avec les styles scoppés de l’AppShell; l’audit de reachabilité statique complète reste à réaliser. | Conservés; pas de réécriture fonctionnelle dans cette phase. |
| `DYNAMIC_REFERENCE` | Assets sous `frontend/public`, fontes, logo, GeoJSON, service worker/PWA, routes importées par l’application, scripts de migrations/tests et bindings Wrangler. | Conservés après contrôle de leurs références ou rôle de configuration. |
| `HISTORICAL_OR_MIGRATION` | Migrations D1, rapports d’audit, données-source territoriales et licence OCHA. | Conservés sans modification ni retrait. |
| `UNCERTAIN_KEEP` | Fichiers modifiés et non suivis présents au début du travail, notamment UI, rapports, tests, cartographie et preuves de référence. | Conservés; aucun fichier utilisateur supprimé. |

## Modifications attribuables à Phase 11

- Deux composants réutilisables, `SIGADFilterBar` et `SIGADFormGrid`, structurent les filtres et formulaires des six modules. Les composants existants ont été adaptés au système partagé au lieu de créer six barres indépendantes.
- Une règle CSS mobile en double a été retirée. Total du nettoyage physique : **0 fichier** et **2 lignes CSS**; aucune dépendance retirée.
- La réception provinciale des approvisionnements expose maintenant les filtres `recherche` et `statut` déjà acceptés par l’API paginée existante. Aucun changement d’API, de schéma D1, de rôle ou de règle métier.
- Le test navigateur attend le décodage du logo et la fin des états de chargement avant les captures, afin que les images documentent le rendu réel et stabilisé.

## Tests observés

| Commande | Avant nettoyage | Après changements de Phase 11 |
|---|---|---|
| `npm run typecheck` | Référence de travail déjà établie; pas de nouvelle erreur relevée. | PASS, code 0. |
| `npm run build` | Build fonctionnel dans les validations précédentes du worktree. | PASS, Vite 8.3.5. |
| `npm run test:unit` | Référence antérieure conservée; aucun test retiré. | PASS, 45/45. |
| `npm run db:verifier` | Migrations et schéma antérieurs sans changement en Phase 11. | PASS, 22 migrations / 65 tables sur base SQLite vierge. |
| `npm run test:security-matrix` | Matrice préexistante conservée. | PASS, 143 routes cataloguées, refus sans mutation. |
| `npm run test:e2e` | Premier passage 11/12 : la réception provinciale n’exposait pas les filtres contrôlés par le test. | PASS après raccordement à l’API existante : 12/12; exécution Wrangler/D1/R2 locale et Playwright Chrome. |
| `npm ls --depth=0` | — | PASS, code 0; aucune dépendance supprimée car aucun paquet inutilisé n’a été démontré. |
| `git diff --check` | — | PASS, code 0; avertissements de conversion LF/CRLF seulement. |

Les bases et secrets d’essai sont restés dans des répertoires temporaires hors du dépôt. Aucune base distante, ressource Cloudflare ou donnée réelle de ménage n’a été touchée.

## Travail restant

Le statut reste **PARTIAL** parce qu’un audit complet des dépendances et de la reachabilité des fichiers demande un outil d’analyse configuré et une revue spécifique des imports dynamiques. Aucun candidat incertain n’a été supprimé. Une suite ultérieure peut ajouter ESLint/Knip avec une approbation de dépendance, puis examiner chaque candidat avant toute suppression.

## Complément Phase 11.1 — nettoyage vérifié

**Vérification : 23 octobre 2026 · branche `ui/phase-11-harmonisation` · base conservée : `371f0be`**

### Retraits réellement effectués

Le contrôle des références (`rg` sur imports, exports et usages, avec revue des points d’entrée React, imports dynamiques, configurations Vite/Wrangler, scripts et tests) a permis de retirer les éléments sans appelant ni rôle de chargement :

| Fichier | Retrait | Motif vérifié |
|---|---|---|
| `shared/constantes/catalogue.ts` | Fichier complet, deux tableaux exportés de catégories et unités | Aucun import, référence ou chargement par nom; les référentiels opérationnels sont lus depuis D1. |
| `frontend/src/services/api.ts` | Interface `ReponseErreur` | Aucune référence TypeScript. |
| `frontend/src/utils/formatters.ts` | Fonction `formaterNombre` et instance locale `Intl.NumberFormat` | Aucune référence; les autres usages numériques gardent leur format métier. |
| `backend/src/routes/rapports.routes.ts` | Fonction `estTypeRapport` | Aucune référence; la validation de route active reste en place. |
| `backend/src/services/rapports.service.ts` | `lireRapportArchive`, `verifierReferencesArchives` | Aucun appelant; les routes emploient les services d’archives encore référencés. |
| `shared/types/authentification.ts` | Type `SessionAuthentifiee` | Aucun import ni annotation. |
| `shared/validations/authentification.ts` | Types `DonneesConnexion`, `DonneesChangementMotDePasseInitial` | Aucun consommateur; les schémas Zod restent inchangés. |
| `shared/validations/beneficiaires.ts` | Constante `CODES_CATEGORIES_POPULATION` | Aucune référence; la catégorie opérationnelle est lue du référentiel en base. |
| `shared/validations/controle.ts` | `schemaPaginationControle` | Aucun appelant. |
| `shared/validations/rapports.ts` | Type `FormatRapport` | Aucun import; les formats autorisés restent définis par `FORMATS_RAPPORT`. |
| `shared/validations/territoire.ts` | `MODES_DECOUPAGE_URBAIN`, `TypeLocaliteProposable` | Aucune référence; les valeurs runtime encore utilisées sont conservées. |

Total du complément : **un fichier supprimé, deux tableaux exportés contenus dans ce fichier et 14 déclarations mortes supprimées dans les autres fichiers** (16 déclarations au total), sans retrait de route active, migration, test, source territoriale, carte, police, licence, script utilisé, dépendance ou règle métier. Les éléments à référence dynamique ou incertaine ont été conservés. Aucun CSS supplémentaire n’a été supprimé pendant ce complément; la règle mobile retirée à la Phase 11 initiale est distincte.

### Résultats des outils d’analyse

- Le balayage manuel a couvert les 70 modules TypeScript/TSX et leurs consommateurs côté configurations, scripts et tests; chaque élément retiré a été recherché avant suppression.
- `tsconfig.json` applique `strict`, `noUnusedLocals` et `noUnusedParameters`; le contrôle TypeScript complète la revue des références.
- Knip et ESLint ne sont pas installés/configurés. Leur installation a été bloquée par `npm ping --fetch-retries=0 --fetch-timeout=10000` (`getaddrinfo ENOTFOUND registry.npmjs.org`). `npm exec --yes --package=knip@5 -- knip --version` n’a pas pu résoudre le paquet et a été interrompu. Aucun manifeste ni lockfile n’a été modifié. L’API AST TypeScript 7 attendue par le script ponctuel essayé n’est pas exposée par `require('typescript')`; aucun résultat Knip n’est revendiqué.
- Les sélecteurs CSS identiques mais limités à des contextes responsives différents ont été conservés afin de ne pas modifier le rendu selon la largeur.

### Acceptation technique après nettoyage

| Commande / contrôle | Résultat observé |
|---|---|
| `npm run typecheck` | **PASS**, code 0. Wrangler a émis un avertissement `EPERM` pour son fichier de log sous AppData, puis généré les types; `tsc --noEmit -p tsconfig.json` a terminé sans erreur. |
| `npm run build` | **PASS**, Vite 8.3.5, 140 modules; PWA et service worker générés. |
| `npm run test:unit` | **PASS**, 11 fichiers, 45 tests réussis. |
| `npm run test:e2e` — suites Worker/D1 locales | **PASS**, 22 tests : authentification 2, sécurité 1, stocks 1, approvisionnements 1, distributions 10, rapports 7. |
| `npm run db:verifier` et contrôle D1 Wrangler local | **PASS**, 22 migrations, 65 tables (62 métier + 3 MFA), 86 index, 74 déclencheurs, 23 provinces, 500 communes en revue et aucune activée, 25 comptes, aucune violation FK. |
| `npm run test:security-matrix` | **PASS**, matrice à 143 routes; la suite Worker a vérifié 140 essais anonymes, 128 refus RBAC et aucune mutation des 65 tables. |
| `npm run test:e2e` — Playwright Chrome | **PASS**, 12/12 tests, code 0. La première tentative a échoué car le Chromium du répertoire temporaire manquait; la seconde a utilisé Chrome déjà installé via `C:\Program Files\Google\Chrome\Application\chrome.exe`, sans téléchargement. Chrome a confirmé DM Sans. |
| `git diff --check` | **PASS**, code 0; avertissements de conversion LF/CRLF seulement. |

Les tests ont confirmé `Resource location: local`; les bindings D1 et R2 étaient locaux et les migrations furent appliquées à un état temporaire créé par le runner. Aucune ressource distante ni donnée réelle n’a été touchée.

### Décision Phase 11.1 — nettoyage

**CODE_CLEANUP : PARTIAL.** Les retraits conservateurs sont exécutés et les contrôles TypeScript, build, unitaires, intégration et navigateur passent. L’analyse automatique Knip/ESLint reste bloquée par le DNS npm; aucun autre candidat incertain n’a été supprimé et aucun nettoyage exhaustif n’est revendiqué.

