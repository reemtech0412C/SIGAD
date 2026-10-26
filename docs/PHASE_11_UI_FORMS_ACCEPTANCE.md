# Phase 11 — Acceptation des formulaires et filtres

Date de vérification : 23 octobre 2026 · Branche locale : `ui/phase-11-harmonisation` · Référence de départ : `371f0bedae975fca49dd4e40782080b1527e29ae`

| Indicateur | État |
|---|---|
| `UI_FORMS` | `PASS` |
| `LOCAL_TESTS` | `PASS` |
| `API_CHANGES` | `NONE` |
| `REMOTE_CHANGES` | `NONE` |

## Résultat

Les six modules administratifs réutilisent `SIGADFilterBar` pour leurs filtres et `SIGADFormGrid` pour leurs formulaires. Les champs sont alignés par grilles, leurs libellés restent associés aux contrôles, les hauteurs sont harmonisées et les grilles passent en une colonne sur téléphone. Les filtres secondaires des modules Contrôle et Rapports restent accessibles par le bouton « Plus de filtres ».

Le parcours provincial de réception des approvisionnements avait une API déjà paginée et acceptant `recherche` et `statut`, mais n’exposait pas ces paramètres dans la vue. La barre ajoutée propose la recherche et le statut puis transmet uniquement ces filtres au endpoint existant. La province demeure imposée par la session côté Worker; aucun `province_id` fourni par le navigateur n’est ajouté.

Les formulaires gardent leurs noms, leur validation et leurs actions métier. Aucun endpoint, schéma D1, rôle, contrôle CSRF, MFA, règle FEFO ou opération de stock n’a été modifié. Les captures ont été prises dans Chrome contre le Worker, D1 et R2 locaux, avec le jeu d’essai synthétique éphémère de Playwright; elles ne représentent pas des données réelles.

## Comparaison visuelle par module

Les captures « avant » sont celles du Chrome local conservées avant l’harmonisation. Les captures « après » ont été produites par Playwright/Chrome à 1440 px et 390 px après les changements.

| Module | Avant — bureau | Après — bureau | Avant — téléphone | Après — téléphone | Résultat |
|---|---|---|---|---|---|
| Gestion des bénéficiaires | [PNG](ui-forms/before/beneficiaires-desktop.png) | [PNG](ui-forms/after/beneficiaires-desktop.png) | [PNG](ui-forms/before/beneficiaires-mobile.png) | [PNG](ui-forms/after/beneficiaires-mobile.png) | PASS |
| Articles et stocks | [PNG](ui-forms/before/stocks-desktop.png) | [PNG](ui-forms/after/stocks-desktop.png) | [PNG](ui-forms/before/stocks-mobile.png) | [PNG](ui-forms/after/stocks-mobile.png) | PASS |
| Approvisionnements | [PNG](ui-forms/before/approvisionnements-desktop.png) | [PNG](ui-forms/after/approvisionnements-desktop.png) | [PNG](ui-forms/before/approvisionnements-mobile.png) | [PNG](ui-forms/after/approvisionnements-mobile.png) | PASS |
| Distributions provinciales | [PNG](ui-forms/before/distributions-desktop.png) | [PNG](ui-forms/after/distributions-desktop.png) | [PNG](ui-forms/before/distributions-mobile.png) | [PNG](ui-forms/after/distributions-mobile.png) | PASS |
| Contrôle et notifications | [PNG](ui-forms/before/controle-desktop.png) | [PNG](ui-forms/after/controle-desktop.png) | [PNG](ui-forms/before/controle-mobile.png) | [PNG](ui-forms/after/controle-mobile.png) | PASS |
| Rapports et tableaux de bord | [PNG](ui-forms/before/rapports-desktop.png) | [PNG](ui-forms/after/rapports-desktop.png) | [PNG](ui-forms/before/rapports-mobile.png) | [PNG](ui-forms/after/rapports-mobile.png) | PASS |

Les vues ont été vérifiées à **1920, 1440, 1280, 768 et 390 px**. Le document ne masque aucun bouton essentiel par un défilement horizontal de la page. Les tableaux larges conservent leur conteneur de défilement propre sur téléphone. La réception provinciale ajoute maintenant les contrôles de filtre dans le même système visuel.

## Police et identité visuelle

- Le logo SIGAD livré localement est attendu dans l’en-tête des six modules.
- DM Sans est servi depuis les assets locaux, sans dépendance CDN. Les réponses de fontes sont HTTP 200; Chrome DevTools a identifié effectivement **DM Sans**. Les graisses 400, 500, 600 et 700 ainsi que l’italique 400 sont vérifiées dans l’E2E.
- Le thème sombre et le thème clair sont commutables. Le parcours navigateur vérifie les deux thèmes et le retour au thème sombre.
- Les captures « après » sont issues d’une session locale de test. Le jeu de données synthétique est visible dans certaines captures; il n’est ni une source de KPI de production ni une copie de bénéficiaires réels.

## Fichiers concernés par Phase 11

- `frontend/src/components/administration/SIGADFilterBar.tsx` et `SIGADFormGrid.tsx` : composants communs de filtres et de formulaires.
- `frontend/src/components/administration/sigad-app-shell.css` : règles communes, alignement, états focus et points de rupture responsives, limités à `.sigad-admin`.
- `frontend/src/components/gestion/TableauGestionBeneficiaires.tsx`, `TableauGestionStocks.tsx`, `TableauApprovisionnements.tsx`, `TableauDistributions.tsx`, `TableauControle.tsx` et `TableauRapports.tsx` : adoption du système commun; filtre de réception provincial ajouté à partir des paramètres API déjà pris en charge.
- `tests/e2e/global-admin-ui.spec.ts` : cinq largeurs, filtres des six modules, requête de statut, décodage du logo et attente de la fin des chargements avant capture.
- `docs/ui-forms/before/` et `docs/ui-forms/after/` : 12 captures Chrome avant et 12 après.

Ces fichiers se trouvaient dans un worktree déjà largement modifié et non validé avant cette phase. Ils ont été conservés. Aucun nettoyage Git destructif, commit de ces travaux antérieurs, push ou déploiement n’a été effectué.

## Vérifications

| Vérification | Résultat réel |
|---|---|
| `npm run typecheck` | PASS — Wrangler 4.151.3 a généré les types puis `tsc --noEmit` a terminé avec le code 0. |
| `npm run build` | PASS — Vite 8.3.5 a produit le build et le service worker PWA. |
| `npm run test:unit` | PASS — 11 fichiers, 45 tests. |
| Intégration Cloudflare locale (`tests/integration/run-auth-worker.mjs`, appelée par `test:e2e`) | PASS — 22 tests répartis entre authentification, sécurité, stocks, approvisionnements, distributions et rapports. |
| `npm run db:verifier` | PASS — SQLite vierge, 22 migrations vérifiées, 65 tables, 86 index, 74 déclencheurs, FK/CHECK/UNIQUE vérifiés; aucune donnée D1 existante modifiée. |
| `npm run test:security-matrix` | PASS — matrice synchronisée avec 143 routes; 140 essais anonymes et 128 refus RBAC sans changement des empreintes des 65 tables. |
| `npm run test:e2e` | PASS — Wrangler Worker local, D1/R2 locales temporaires, **12 tests Playwright sur 12**. Un premier passage a exposé l’absence de filtres dans la réception provinciale (11/12); l’interface a été raccordée à `recherche` et `statut`, puis les 12 tests ont réussi. |
| `git diff --check` | PASS — code 0; Git a uniquement signalé les conversions LF/CRLF habituelles du worktree Windows. |

Playwright comprend le parcours opérationnel de réception, distribution, contrôle et notification; vérifie les modules aux cinq largeurs; teste un filtre d’état provincial et les interactions clavier; et rapporte DM Sans comme fonte rendue. Les demandes Wrangler de cette suite ont explicitement utilisé les bindings locaux, un répertoire temporaire Windows et aucun `--remote`.

## Réserve de périmètre

L’harmonisation porte sur les filtres, formulaires et grilles de ces six modules. Elle n’est pas une refonte intégrale de chaque tableau ni une homologation des contenus géographiques. Les limites OCHA restent indicatives. Les communes non vérifiées restent inactives.

