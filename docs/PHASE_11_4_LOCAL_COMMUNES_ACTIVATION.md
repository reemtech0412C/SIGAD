# Phase 11.4 — Réparation locale et activation contrôlée des communes

Date de vérification : 23 octobre 2026 (Africa/Ndjamena)

## Décision

```text
FRONTEND_BOOT: PASS
COMMUNES_LOCAL_ACTIVATION: PASS
PROVINCIAL_ISOLATION: PASS
FORM_INTEGRATION: PARTIAL
KPI_REGRESSION: PASS
OVERALL: PARTIAL
```

L’interface et l’API locales répondent correctement, et les 500 communes sont activées uniquement dans une base D1 locale de test dédiée. L’enregistrement d’un ménage demeure volontairement bloqué lorsqu’aucun rattachement administratif vérifié n’existe : le schéma exige un département et le projet ne contient actuellement ni départements utilisables ni rattachements validés pour ces communes. Aucun lien administratif n’a été inventé.

## Environnements et processus locaux

Tous les processus ci-dessous utilisent `127.0.0.1`. Les commandes Wrangler observées comportent `--local` et ne comportent pas `--remote`. Le répertoire de travail n’est pas exposé par `Win32_Process`; il est déduit du chargement réussi de `wrangler.toml`, des chemins relatifs du projet et de la configuration Vite.

| Port | PID observé | Processus et commande | Stockage | État |
|---|---:|---|---|---|
| 5173 | 43104 | Node.js, `vite --config frontend/vite.config.ts`; démarré le 23/10/2026 à 12:51 (heure système locale) | Serveur Vite existant | Actif; source TSX et client Vite servis en JavaScript |
| 8787 | 16072 (Worker), Wrangler parent 41440 | `wrangler dev --config wrangler.toml --local --var ENVIRONMENT:local --env-file .wrangler/ui-pilot-preview-state/ui-pilot.dev.vars --persist-to .wrangler/ui-pilot-preview-state --ip 127.0.0.1 --port 8787` | D1/R2 locales existantes, conservées | Actif; Worker redémarré sans réinitialiser son état |
| 8788 | 57068 (Worker), Wrangler parent 40856 | `wrangler dev --config wrangler.toml --local --ip 127.0.0.1 --port 8788 --var ENVIRONMENT:development --env-file <fichier local temporaire masqué> --persist-to <état D1 temporaire isolé>` | D1 de test dédiée à l’activation | Actif pour inspection locale |
| 8790 | 57136 (Worker), Wrangler parent 57016 | `wrangler dev --config wrangler.toml --local --ip 127.0.0.1 --port 8790 --var ENVIRONMENT:local --show-interactive-dev-session=false --persist-to .wrangler/local-login-b07b0d29fb` | D1 locale existante, conservée | Actif; Worker redémarré avec le build actuel |

Les processus précédemment associés à 8787 et 8790 ont été identifiés comme des Workers SIGAD. Aucun client n’avait de connexion établie lors de leur redémarrage. Leurs répertoires d’état n’ont pas été supprimés.

## Diagnostic et correction MIME

Le défaut venait d’un Worker ancien qui cherchait un nom de bundle différent de celui du build courant. Le fallback SPA renvoyait alors `index.html` (HTTP 200, `text/html`) à une URL `.js`, ce qui provoquait le rejet MIME du navigateur. Aucun type MIME n’a été forcé dans le HTML et aucune protection du navigateur n’a été désactivée. Après reconstruction et redémarrage contrôlé des Workers, les vérifications HTTP ont donné :

| Requête locale | Résultat observé |
|---|---|
| `GET /` sur 5173, 8787, 8788 et 8790 | HTTP 200, `text/html` |
| `GET /src/main.tsx` sur 5173 | HTTP 200, `text/javascript` |
| `GET /@vite/client` sur 5173 | HTTP 200, `text/javascript` |
| `GET /assets/index-h3_jZmZV.js` sur 8787, 8788 et 8790 | HTTP 200, `text/javascript; charset=utf-8` |
| `GET /api/sante` via 5173, 8787, 8788 et 8790 | HTTP 200, `application/json` |
| `GET /sw.js` sur 8787 | HTTP 200, `text/javascript; charset=utf-8` |
| `GET /manifest.webmanifest` sur 8787 | HTTP 200, `application/manifest+json` |

L’exécution initiale de `npm run dev` depuis le Sandbox n’a pas pu démarrer un second Vite (5173 était déjà occupé) et le Worker a rencontré `GetFinalPathNameByHandleW: #5 Accès refusé`. Les Workers locaux ont ensuite été relancés depuis PowerShell utilisateur normal, avec des répertoires Wrangler de journalisation isolés. Le serveur Vite déjà actif a été conservé. L’URL principale pour l’application est **http://127.0.0.1:5173/**; le Worker seul est accessible sur **http://127.0.0.1:8787/**. La base dédiée des communes activées est accessible via **http://127.0.0.1:8788/**.

## Référentiel et activation isolée

La revue a comparé les 500 codes de la matrice indépendante et du fichier source aux enregistrements importés, en utilisant le code et `province_id_d1` explicite. Résultats : 500/500 codes présents, 500 identifiants et codes distincts, aucune province incorrecte, aucun écart de nom ni de type de commune. La variante de libellé légal `MAYO-KEDBI` et la forme de référence `Mayo-Kebbi` sont déjà documentées dans les sources; les identifiants de province demeurent corrects. La matrice compte 489 lignes relues sur fac-similé et 11 contrôlées par sources croisées. L’ambiguïté de séquence signalée pour BODO ne change ni le code ni l’identifiant utilisé. La répartition attendue est de 125 communes urbaines et 375 rurales.

Les migrations 0001–0022 ont été appliquées à une nouvelle persistance locale distincte :

`C:\Users\Lenovo\AppData\Local\Temp\sigad-phase114-communes-test-469ccee7218847a4a4803777fb58abc9\d1-state`

Après activation, une lecture de contrôle a confirmé :

- 500 communes au total, 500 identifiants distincts et 500 codes distincts;
- 500 communes actives en statut `VALIDE`, 0 en statut `PROPOSE`;
- 23 provinces, 125 communes `URBAINE` et 375 `RURALE`;
- 0 ligne dans `rattachements_territoriaux`;
- `PRAGMA foreign_key_check` sans résultat, donc aucune violation;
- aucune migration historique modifiée et aucun département, sous-préfecture ou canton créé.

L’activation a été limitée à cette base de test. Les bases D1 locales préexistantes, les bases distantes, les frontières OCHA et les données de production n’ont pas été modifiées.

## Intégration au formulaire et isolation provinciale

Le sélecteur charge maintenant la liste paginée des communes par `province_id`; il ne filtre plus la recherche sur un département ou une sous-préfecture non établis. La note visible précise qu’aucun lien administratif n’est présumé. La liste conserve une limite serveur de 40 éléments. En revanche, le schéma de filtres API et le composant n’offrent pas de recherche textuelle dédiée par nom : ce comportement n’a donc pas été présenté comme testé ou disponible.

Le parcours Playwright dédié, exécuté avec Chrome contre le Worker 8788 et la D1 isolée, a réussi (1/1) : le compte Sila reçoit ses 19 communes, chaque résultat est rattaché à `prov-sila`, et une demande explicite pour `prov-ouaddai` est refusée sans exposer d’éléments ni le nom de la province. Le formulaire affiche la commune sélectionnée, maintient le département désactivé et empêche l’enregistrement.

Cette dernière restriction correspond à une contrainte réelle du modèle : `menages.departement_id` est obligatoire et le mécanisme d’intégrité attend un rattachement territorial validé. Comme aucune relation département–commune vérifiée n’est disponible, enregistrer un ménage avec la seule commune serait invalide et l’inventer violerait les règles de la phase. La sélection fonctionne; la persistance d’un nouveau ménage à partir de ce référentiel reste donc **PARTIAL** en attente d’un référentiel départemental vérifié ou d’une décision métier et d’un schéma compatibles.

Les comptes régionaux et centraux restent soumis aux règles RBAC existantes. La sélection commune ne donne aucun droit d’élargir la province dans les paramètres de requête.

## Tests exécutés

| Vérification | Résultat réel |
|---|---|
| `npm run typecheck` | PASS — `wrangler types` et `tsc --noEmit` terminés avec le code 0 |
| `npm run build` | PASS — Vite 8.3.5; 140 modules transformés; bundle et PWA générés |
| `npm run test:unit` | PASS — 11 fichiers, 45 tests |
| Intégration Wrangler/D1/R2, exécutée par `npm run test:e2e` | PASS — 22 tests : authentification 2, matrice API 1, stocks 1, approvisionnements 1, distributions 10, rapports et KPI 7 |
| Matrice de sécurité | PASS — 143 routes répertoriées; 140 tentatives anonymes et 128 refus RBAC; empreinte des tables inchangée après les requêtes refusées |
| Vérification de schéma | PASS — 22 migrations; 65 tables (62 métier et 3 MFA), 86 index, 74 déclencheurs; contraintes vérifiées; aucune violation FK |
| Playwright/Chrome — suite générale | PASS — 12 tests réussis sur 13; le test opt-in d’activation est exclu de cette suite générale |
| Playwright/Chrome — parcours dédié Phase 11.4 | PASS — 1 test réussi contre la D1 isolée activée |
| KPI et performances synthétiques | PASS — comparaisons API attendues/réelles; listes de ménages à 502, 1 500 et 5 000 lignes mesurées; requête indexée `idx_menages_province_statut_date` |
| `git diff --check` | PASS — code 0, sans erreur d’espacement; Git a émis uniquement des avertissements de normalisation LF/CRLF |
| MIME réel | PASS — les sources Vite et le bundle de production renvoient un type JavaScript; aucune URL `.js` testée ne renvoie HTML |

Les mesures d’intégration sont locales et synthétiques, non une projection de performance Cloudflare. Les KPI ne dépendent pas du statut de validation d’une commune; leur suite de non-régression a conservé les valeurs attendues et l’activation n’a modifié aucune table d’opération ou de stock.

## Fichiers de Phase 11.4

- `frontend/src/components/territoire/SelecteurLocalisationDynamique.tsx` — liste paginée limitée à la province et état explicite des rattachements non établis.
- `tests/e2e/communes-phase114.spec.ts` — parcours opt-in Chrome sur la base isolée, isolation SILA/OUADDAÏ et blocage sûr de l’enregistrement.
- `docs/PHASE_11_4_LOCAL_COMMUNES_ACTIVATION.md` — présent rapport.

Aucune migration, API, configuration de production, règle RBAC ou ressource Cloudflare distante n’a été modifiée. Aucun déploiement ni Git push n’a été effectué.

## Réserves

1. Le référentiel des 500 communes est activé uniquement dans la D1 locale isolée; l’activation d’une base de développement partagée ou distante n’est pas couverte par cette acceptation.
2. Le rattachement administratif départemental des communes n’est pas démontré. Le formulaire ne permet donc pas de créer un ménage avec une commune seule.
3. La recherche textuelle des communes par nom n’est pas implémentée; seules la sélection paginée et les relations vérifiées sont disponibles.
4. Les limites cartographiques OCHA restent indicatives et non homologuées juridiquement.
5. Le test Playwright opt-in a été exécuté séparément contre la D1 dédiée; le rapport distingue ce résultat du test sauté dans la suite générale.
