# UI-MAP 1.6 — Acceptation opérationnelle des indicateurs cartographiques

**STATUT GLOBAL : PARTIAL**

**Périmètre :** tests locaux uniquement, Worker Wrangler, D1 et R2 locales, données synthétiques, Chrome. Aucune migration, écriture distante, publication ou modification du référentiel territorial n’a été effectuée. Les 23 limites OCHA/HDX restent indicatives et non homologuées juridiquement ; les communes en relecture restent inactives.

## Résultats numériques

Les valeurs de l’API ont été comparées aux résultats attendus du jeu de test et, pour les agrégats nationaux, aux lignes sources de D1. Les quantités de stock sont ventilées par article et conservent leur unité.

| Scénario synthétique | KPI | Valeur attendue | Valeur observée | Résultat |
|---|---|---:|---:|---|
| Distribution passée à `EN_EXECUTION`, aucune remise | Réalisées / en cours / ménages servis | 0 / 1 / 0 | 0 / 1 / 0 | PASS |
| Même opération en cours, période filtrée sur janvier 2020 | En cours | 1, indépendamment de la période | 1 | PASS |
| Remises positives, dont une partielle, puis retour pour correction | Réalisées / en cours / ménages distincts | 0 / 1 / 2 | 0 / 1 / 2 | PASS |
| Clôture centrale en Sila, octobre 2026 | Réalisées / en cours / ménages / stock de riz | 1 / 0 / 2 / 59 KG | 1 / 0 / 2 / 59 KG | PASS |
| Ouaddaï, sans opération de ce scénario | Réalisées / en cours / ménages / stock de riz | 0 / 0 / 0 / 20 KG | 0 / 0 / 0 / 20 KG | PASS |
| Après réservation FEFO : lots bons 3 + 60 KG ; lots expiré et endommagé de 50 KG chacun | Stock disponible de riz | 63 − 6 réservés = 57 KG ; lots impropres exclus | 57 KG | PASS |
| Article distinct en litres : 10 L physiques, 3 L réservés | Stock disponible de farine | 7 LITRE, sans addition aux KG | 7 LITRE | PASS |
| Clôture consultée sur janvier 2020 | Réalisées / ménages servis / en cours | 0 / 0 / 0 | 0 / 0 / 0 | PASS |
| Tentative d’annulation de la distribution clôturée | Exclusion d’une opération annulée | KPI non incrémentés | Le statut `ANNULEE` est rejeté par la contrainte D1 ; statut resté `CLOTUREE_CENTRAL` | NON VÉRIFIABLE |

La remise positive partielle compte comme preuve de service. Les agrégats utilisent `COUNT(DISTINCT rd.menage_id)` : plusieurs articles ou plusieurs remises au même ménage ne multiplient pas le nombre de ménages. Le retour pour correction ne supprime ni ne réécrit les remises physiques déjà enregistrées.

### Définitions constatées dans le code et D1

| KPI | Calcul exécuté | Filtres et limites |
|---|---|---|
| Distributions réalisées | Distributions au statut `CLOTUREE_CENTRAL`, jointes à `clotures_distribution`; décompte distinct par province. | Période appliquée à `date_cloture`. Une simple approbation ou une opération non clôturée n’est pas comptée. |
| Distributions en cours | Statuts `EN_EXECUTION`, `TERMINEE_PROVINCE` ou `RETOURNEE_POUR_CORRECTION`, avec une transition historique vers `EN_EXECUTION`. | Photographie opérationnelle indépendante de la période choisie. Le schéma ne porte pas de statut d’annulation de distribution. |
| Ménages servis | Ménages distincts associés à une remise, à une distribution de la même province et à au moins une ligne de remise de quantité positive. | Période appliquée à `remises_distribution.date_remise`; ménage et preuve rapprochés avec la province. |
| Stocks disponibles | Somme, pour l’article demandé, de `quantite_physique - quantite_reservee` des lots `BON` et non expirés dans les entrepôts provinciaux actifs. | Valeur `null` sans article ou en l’absence de stock ; `INCOHERENT` si les sommes lots et `soldes_stock` divergent. Les unités ne sont jamais additionnées entre articles. |

## Sécurité et périmètres

Les tests ont appelé directement `GET /api/rapports/indicateurs-carte` avec des sessions Worker :

| Session | Résultat observé |
|---|---|
| Anonyme | `401` |
| Délégué de Sila | Une seule entrée `prov-sila`; demande explicite de `prov-ouaddai` refusée `403` |
| Délégué du Ouaddaï | Une seule entrée `prov-ouaddai`; demande explicite de `prov-sila` refusée `403` |
| Administrateur central | Réponse nationale autorisée avec exactement 23 provinces |
| Filtres inversés ou article inconnu | Filtres temporels invalides `400`; article inactif/inconnu `404` |

Les réponses cartographiques ne contiennent ni `menage_id`, ni nom de chef de ménage, ni identité de réceptionnaire. Les appels d’indicateurs sont en lecture seule (`rows_written = 0`). La matrice API a catalogué 141 routes, réalisé 138 essais anonymes et 123 refus RBAC ; l’empreinte des 65 tables D1 n’a pas changé après les requêtes refusées.

## Vérification Chrome de `/tableau-de-bord`

Playwright a couvert la carte provinciale à 1440 px et le parcours central à 390 px : sélection du KPI, filtres de dates, choix d’article, sélection de province, actualisation des détails, unités, état sans article, modes sombre et clair, absence de débordement horizontal et périmètre provincial. Les détails affichés concordent avec les réponses JSON de l’API. Les polygones publics ne contiennent aucun KPI ; un délégué ne reçoit que les indicateurs de sa province. La bannière indique que le jeu et les limites sont expérimentaux.

**Capture Chrome — 1440 px, Sila, mode sombre :**

![Carte des indicateurs en mode sombre, bureau](ui-map-1.6/carte-sila-bureau.png)

**Capture Chrome — 1440 px, mode clair :**

![Carte des indicateurs en mode clair](ui-map-1.6/carte-sila-bureau-clair.png)

**Capture Chrome — 390 px, session centrale et stock synthétique :**

![Carte des indicateurs sur mobile](ui-map-1.6/carte-centrale-mobile-synthetique.png)

## Performance locale

Chaque mesure d’indicateur est répétée cinq fois après insertion progressive de ménages synthétiques. Les P95/P99 ci-dessous sont des percentiles empiriques sur seulement cinq observations et correspondent donc au maximum observé ; ils ne constituent pas des percentiles de production.

| Ménages synthétiques ajoutés | Requête | P50 réponse | P95/P99 observé | D1 rows read / written | Durée D1 / requêtes |
|---:|---|---:|---:|---:|---:|
| 0 | Agrégats sans stock | 41,33 ms | 45,28 ms | 155 / 0 | 1 ms / 1 |
| 0 | Agrégats avec stock | 39,41 ms | 70,20 ms | 288 / 0 | 0 ms / 2 |
| 500 | Agrégats sans stock | 49,90 ms | 60,40 ms | 157 / 0 | 0 ms / 1 |
| 500 | Agrégats avec stock | 53,56 ms | 68,08 ms | 290 / 0 | 0 ms / 2 |
| 1 500 | Agrégats sans stock | 33,34 ms | 57,56 ms | 157 / 0 | 0 ms / 1 |
| 1 500 | Agrégats avec stock | 40,48 ms | 53,51 ms | 290 / 0 | 0 ms / 2 |
| 5 000 | Agrégats sans stock | 31,82 ms | 53,93 ms | 157 / 0 | 0 ms / 1 |
| 5 000 | Agrégats avec stock | 46,92 ms | 49,94 ms | 290 / 0 | 1 ms / 2 |

Le nombre de lignes lues par l’agrégat reste stable entre 155 et 157 pour ces jeux ; le mode stock ajoute une seconde requête en lot et reste entre 288 et 290 lignes lues. Aucun appel n’écrit dans D1. Il s’agit de mesures Wrangler/SQLite locales, pas d’une estimation des quotas ou de la latence Cloudflare distante.

Le test distinct de la liste paginée des ménages utilise l’index `idx_menages_province_statut_date` selon `EXPLAIN QUERY PLAN`. Ses latences locales ont varié fortement selon la charge de la session (par exemple, P50/P95 656/2 020 ms à 1 500 lignes lors d’une exécution). Cette variabilité est consignée comme risque de performance local à investiguer ; elle n’invalide pas le résultat de l’agrégation cartographique, dont les lectures D1 sont restées stables.

## Tests exécutés

| Vérification | Résultat |
|---|---|
| `npm run typecheck` (`wrangler types` puis `tsc --noEmit`) | PASS |
| `npm run build` (Vite 8.3.5, inclus dans `npm run test:e2e`) | PASS |
| `npm run test:unit` | PASS — 10 fichiers, 42 tests |
| Intégration Wrangler/D1/R2 (`npm run test:e2e`, puis `npm run test:integration` après ajout des mesures) | PASS — 22 tests d’intégration répartis en 6 suites ; la dernière exécution dédiée a réussi |
| Vérification de schéma D1 vierge | PASS — 21 migrations, 65 tables (62 métier + 3 MFA), 83 index, 68 déclencheurs, aucune violation FK |
| `npm run test:security-matrix` et empreinte des tables | PASS — 141 routes, refus sans modification des données |
| Playwright avec Chrome | PASS — 11/11 tests sur la version fonctionnelle finale, dont les deux tests cartographiques |
| `git diff --check` | PASS — avertissements Git LF/CRLF uniquement |

Les migrations et tests se sont exécutés sur D1/R2 locales éphémères. La dernière modification après Playwright a uniquement ajouté la mesure D1 du chemin stock au test d’intégration ; ce test d’intégration a ensuite réussi. Aucun code applicatif ou composant d’interface n’a changé après la suite Playwright réussie.

## Écarts, corrections et réserves

1. **Déduplication à l’import :** le test d’intégration a révélé qu’un doublon importé lors d’une requête ultérieure pouvait laisser l’enregistrement source `ACTIF`. Le traitement met maintenant aussi l’enregistrement source en `DOUBLON_SUSPECTE`, dans le même `db.batch` et avec contrôle de province. Les tests de gestion et d’intégration passent ; aucune route ni migration n’a été ajoutée.
2. **Sélecteur de province sous Chrome :** la carte donne temporairement priorité à la province survolée pour afficher son aperçu. Le test browser déplace désormais le pointeur hors de la carte avant de comparer la province explicitement sélectionnée ; les tests 1440/390 passent sans changement du comportement UI.
3. **Scénario annulé :** `distributions_provinciales` n’admet pas `ANNULEE`; la tentative D1 est rejetée sans modification. L’exclusion d’opérations annulées ne peut donc pas être prouvée par un état métier réel dans cette version. Une décision métier et une évolution ultérieure du workflow seraient nécessaires ; aucune migration n’a été créée ici.
4. **Latence de liste :** les mesures locales de la liste des ménages restent variables sous la charge de test, malgré le plan utilisant l’index attendu. Une mesure dédiée et répétée dans un environnement isolé est recommandée avant de conclure sur cette liste.

## Fichiers créés ou modifiés pour cette acceptation

- `tests/integration/distributions-worker.test.mjs` — attentes numériques de cycle, FEFO, corrections, fermeture, Sila/Ouaddaï et unités KG/LITRE.
- `tests/integration/rapports-worker.test.mjs` — comparaison API/D1, isolation et mesures des deux variantes d’indicateurs à 0/500/1 500/5 000 ménages.
- `tests/e2e/carte-tchad.spec.ts` — interactions de carte, comparaison avec l’API et captures Chrome bureau/mobile.
- `backend/src/routes/gestion.routes.ts` — correction transactionnelle des doublons importés, découverte pendant les tests.
- `docs/ui-map-1.6/` — trois captures Chrome réelles.
- `docs/UI_MAP_1_6_OPERATIONAL_ACCEPTANCE.md` — présent rapport.

**Aucune modification d’API, migration, ressource distante, base distante, référentiel territorial ou donnée de production.**

## Décision

**UI-MAP 1.6 : PARTIAL.** Les quatre calculs exercés, les contrôles Sila/Ouaddaï, l’affichage de carte et les exports concernés ont passé les assertions locales. Les deux KPI de distribution ne sont pas totalement acceptés tant qu’un état métier d’annulation n’existe pas pour valider son exclusion ; l’acceptation géographique reste également expérimentale et les latences de la liste paginée demandent une analyse isolée. Les données affichées pendant ces essais étaient synthétiques.
