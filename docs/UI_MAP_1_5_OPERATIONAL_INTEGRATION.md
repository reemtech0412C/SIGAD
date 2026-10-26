# SIGAD — UI-MAP 1.5 — Agrégation opérationnelle sécurisée

**Projet :** SIGAD v3.0  
**Branche :** `ui/interactive-map`  
**Date :** 23 octobre 2026  
**Référence :** UI-MAP 1.4 — validation métier des quatre indicateurs

```text
STATUT: PASS — intégration technique locale
VALIDATION_GÉOGRAPHIQUE: PARTIAL — limites OCHA indicatives, homologation juridique non confirmée
API_CHANGES: AJOUT D’UNE ROUTE GET EN LECTURE SEULE
MIGRATIONS: NONE
D1_R2_DISTANTS: NONE
DÉPLOIEMENT: NONE
GIT_PUSH: NONE
```

## Résultat

Les quatre indicateurs approuvés sont calculés côté Worker et raccordés à la carte du tableau de bord réel. Le calcul et le filtrage géographique précèdent la sérialisation JSON. Un compte provincial reçoit uniquement la province issue de sa session; un filtre croisé est refusé avant toute requête D1. L’administration centrale et le propriétaire, autorisés par la garde existante, peuvent consulter les agrégats nationaux.

La carte joint les valeurs par l’identifiant SIGAD explicitement associé au code OCHA vérifié; elle n’utilise ni nom approximatif ni appartenance spatiale. Les 23 limites restent indicatives. Les 500 communes demeurent en révision et aucun référentiel D1 n’a été activé ou modifié.

## Contrat API livré

```http
GET /api/rapports/indicateurs-carte
```

Paramètres facultatifs : `province_id`, `date_debut`, `date_fin`, `article_id`. Les dates doivent être calendaires et au format `AAAA-MM-JJ`; la date de fin doit être égale ou postérieure à la date de début. `article_id` sélectionne un article unique, donc une seule unité de mesure. Les filtres inconnus sont rejetés.

La route réutilise l’authentification, les sessions, la protection CSRF et le contrôle RBAC déjà installés sur `/api/rapports/*`. Les rôles admis sont `PROPRIETAIRE`, `ADMIN_CENTRAL` et `DELEGUE_PROVINCIAL`. L’isolation de province est également imposée dans le service avant construction des requêtes, et pas seulement par middleware.

Réponse : `version_contrat`, `mode_donnees`, `perimetre`, `province_id`, `periode`, `date_photographie`, `indicateurs_actifs`, `indicateurs_desactives`, `provinces` et `ressources_d1`. Chaque indicateur distingue une valeur exacte, l’absence de données et une incohérence. La réponse ne contient aucun nom de ménage, identifiant de ménage, bénéficiaire ou identité de réceptionnaire.

### Indicateurs actifs

| Indicateur | Définition exécutée | Tables et règle de calcul | Limites temporelles |
|---|---|---|---|
| **Distributions réalisées** | Nombre de distributions clôturées définitivement. | `distributions_provinciales` joint à `clotures_distribution` sur l’identifiant et la province; `COUNT(DISTINCT d.id)` avec `d.statut = 'CLOTUREE_CENTRAL'`. | La période filtre `clotures_distribution.date_cloture`, avec borne de fin exclusive au lendemain. Une préparation, une déclaration provinciale ou une opération annulée/incomplète n’est pas comptée. |
| **Distributions en cours** | Photographie des opérations réellement démarrées et non clôturées. | `distributions_provinciales` dans les états `EN_EXECUTION`, `TERMINEE_PROVINCE`, `RETOURNEE_POUR_CORRECTION`, avec preuve `historique_statuts.nouveau_statut = 'EN_EXECUTION'`; comptage distinct par province. | Photographie courante; les filtres de date ne s’appliquent pas à cet indicateur. |
| **Ménages servis** | Nombre de ménages distincts avec preuve positive de remise pendant la période. | `remises_distribution`, `lignes_remise`, `distributions_provinciales`, `menages_distribution`, `menages`; jointures sur distribution, province et ménage; `COUNT(DISTINCT rd.menage_id)` si une ligne a `quantite_remise > 0`. | La période filtre `remises_distribution.date_remise`. Plusieurs articles, lignes ou distributions du même ménage ne le comptent qu’une fois dans la province et la période. Une remise positive partielle constitue une preuve. |
| **Stocks disponibles** | Quantité disponible par province, entrepôt, article et unité. | `lots_stock`, `soldes_stock`, `entrepots`, `articles`, `unites_mesure`; uniquement les entrepôts provinciaux actifs et les lots `BON`, non échus, calculés par `quantite_physique - quantite_reservee`. Les totaux physique et réservé des lots sont rapprochés du solde avant publication. | Photographie courante, indépendante de la période. Sans article, entrepôt actif ou cohérence comptable, la valeur reste `null` avec l’état correspondant. Aucun cumul entre articles ou unités incompatibles. |

### Indicateurs désactivés

- **Personnes bénéficiaires :** désactivé. Les tailles déclarées des ménages ne constituent pas une preuve de remise individuelle.
- **Validations en attente :** désactivé. Les workflows n’ont pas de définition commune approuvée des étapes soumises et des autorités de décision.

Les deux noms apparaissent dans `indicateurs_desactives`; aucune valeur n’est calculée ou affichée comme zéro.

## Contrôles de sécurité et intégrité

| Contrôle | Résultat local |
|---|---|
| Appel sans session | **PASS** — HTTP 401. |
| Session Sila | **PASS** — une seule ligne `prov-sila`; le filtre `prov-ouaddai` renvoie HTTP 403 avant D1. |
| Session Ouaddaï | **PASS** — une seule ligne `prov-ouaddai`; le filtre `prov-sila` renvoie HTTP 403 avant D1. |
| Administration centrale | **PASS** — 23 provinces dans l’agrégat national autorisé. |
| Données personnelles | **PASS** — absence de `menage_id`, identité de réceptionnaire et noms de bénéficiaires dans le JSON. Le GeoJSON chargé ne contient aucun KPI. |
| Stocks | **PASS** — test de rapprochement contre les lots et les soldes; les incohérences ne publient pas de quantité. La réponse ne modifie aucune ligne D1. |
| Cartographie | **PASS technique** — sélection d’un identifiant connu, refus de sélection d’une autre province par le délégué, et état visible de non-homologation juridique. |

La route d’agrégation n’écrit pas dans D1. Elle utilise un `db.batch` de lectures liées au même appel : une requête pour les comptes et ménages; une seconde seulement lorsqu’un article est demandé pour le stock. Le nombre de requêtes, `rows_read`, `rows_written` et la durée D1 sont retournés dans `ressources_d1`. Le test confirme `rows_written = 0`; la capture Chrome Sila montre une photographie sans filtre article de **43 lignes lues, 0 écriture et 2 ms D1** pour cette exécution locale. Ces valeurs sont propres à ce jeu synthétique et ne prédisent pas les quotas d’un déploiement.

## Interface et carte

Le composant est intégré au tableau de bord réel et reste également disponible dans `/ui-preview`. Il conserve le shell Tabler, le logo SIGAD, DM Sans, le sélecteur d’indicateur, les dates, la recherche et la pagination serveur des articles, la légende, les détails de province et les états de chargement, erreur, absence et incohérence.

Le mode local affiche explicitement **« Jeu de données synthétiques de validation »**. Les captures jointes sont prises par Chrome contre le Worker et la D1 locale d’acceptation; les valeurs visibles sont des données de test et ne sont pas des résultats nationaux réels.

Source du fond : OCHA FIS / HDX, COD-AB v01, fichier `frontend/public/data/tchad-admin1-ocha-v01.geojson`. La licence indiquée dans l’interface est CC BY-IGO. La carte conserve l’avertissement : **« Limites administratives indicatives — source OCHA/HDX, homologation juridique non confirmée. »** Aucun changement de limites ni de référentiel administratif SIGAD n’a été effectué.

### Captures Chrome réelles

- [Carte Sila — bureau, mode sombre](ui-map-1.5/carte-sila-bureau.png)
- [Carte Sila — bureau, mode clair](ui-map-1.5/carte-sila-bureau-clair.png)
- [Carte nationale — mobile, données synthétiques](ui-map-1.5/carte-centrale-mobile-synthetique.png)

## Tests et résultats

| Vérification | Exécution | Résultat |
|---|---|---|
| TypeScript strict | `npm run typecheck` (`wrangler types` puis `tsc --noEmit -p tsconfig.json`) | **PASS**, code 0. |
| Build frontend | `npm run build` (Vite 8.3.5 et PWA) | **PASS**, code 0. |
| Unit tests | `npm run test:unit` | **PASS**, 10 fichiers / 42 tests. Les contrats couvrent les formules et la validation des filtres. |
| Migrations et schéma | `npm run test:e2e`, base Wrangler/D1 temporaire vierge, mode local | **PASS** — migrations 0001–0021 appliquées; 65 tables (62 métier et 3 MFA), 83 index, 68 déclencheurs, 23 provinces, 25 comptes; aucune violation FK. Les 500 communes importées restent en révision, 0 activée. |
| Plan d’exécution | Vérificateur de schéma SQLite vierge et D1 locale | **PASS** pour les listes paginées de ménages et mouvements; index composites utilisés sans tri temporaire. Aucun nouvel index ni migration KPI n’a été requis. |
| Worker/D1/R2 local | `npm run test:e2e` avec toutes les intégrations | **PASS**, 22 cas d’intégration : authentification 2, matrice de sécurité 1, stocks 1, approvisionnements 1, distributions 10, rapports 7. Le cas des quatre KPI compare les résultats de l’API aux preuves D1 directes, vérifie les filtres, les unités, les états et les périmètres. |
| Matrice des routes | `npm run test:security-matrix` et test Worker | **PASS** — 141 routes cataloguées; 138 essais anonymes et 123 refus RBAC; empreinte des 65 tables inchangée après les essais interdits. |
| Chrome / Playwright | `npm run test:e2e`, Chrome installé, Worker et D1 locaux | **PASS**, 11/11 tests lors du passage final. La suite couvre carte, périmètre Sila, 23 limites, six modules, responsive, rapports, export CSV téléchargé, MFA, navigation et parcours opérationnel. Chrome DevTools confirme DM Sans. |
| Export CSV | Test navigateur de rapports | **PASS** — HTTP 200, en-têtes CSV/téléchargement vérifiés; le contenu est contrôlé sur le fichier enregistré par Chrome (`sep=;`, référence du rapport). |
| Diff | `git diff --check` | **PASS**, code 0; avertissements Git de normalisation LF/CRLF uniquement. |

Un premier passage Playwright avait échoué sur deux assertions devenues obsolètes : le test lisait `Response.text()` d’une réponse traitée comme téléchargement par Chrome, et le test du tableau attendait l’ancien message d’indisponibilité alors que l’API renvoie maintenant l’état exact. Les tests ont été corrigés sans modifier les assertions métier de l’API, puis les deux cas ciblés et la suite complète ont réussi.

## Fichiers de cette livraison

- `backend/src/routes/rapports.routes.ts` — ajout de `GET /indicateurs-carte` sous les protections existantes.
- `backend/src/services/indicateurs-carte.service.ts` — agrégats, périmètre de session, rapprochement des lots et métadonnées D1.
- `shared/validations/indicateurs-carte.ts` — schémas stricts de filtres, réponse et états de données.
- `frontend/src/components/pilote/CarteProvincesTchad.tsx` — sélection des KPI, filtres, carte et états de réponse.
- `frontend/src/components/pilote/tableau-bord-pilote.css` — styles du module cartographique.
- `tests/integration/rapports-worker.test.mjs` — vérification réelle de l’API sur D1 locale et de l’isolation.
- `tests/unit/ui-map-kpi-contract.test.mjs` — tests unitaires des règles et filtres.
- `tests/e2e/carte-tchad.spec.ts` — tests Chrome de la carte et captures d’écran.
- `tests/e2e/rapports.spec.ts`, `tests/e2e/ui-preview.spec.ts` — assertions de téléchargement et d’état de données actualisées.
- `tests/integration/securite-matrice-worker.test.mjs`, `docs/matrice-securite-api-phase9.md` — matrice portée à 141 routes.
- `docs/ui-map-1.5/` — trois captures Chrome réelles.

## Changements hors périmètre

Aucune modification d’API existante, migration, table, D1 ou R2 distante, donnée de production, RBAC, workflow d’approvisionnement/distribution ou limite géographique n’a été faite. Aucun déploiement, push Git ni activation de commune n’a eu lieu. Les routes de l’API d’agrégation sont en lecture seule.

## Réserves

1. Le fond ADM1 OCHA demeure indicatif jusqu’à validation juridique des limites et de la correspondance nationale.
2. Les états opérationnels visibles dans les captures proviennent du seed synthétique local; ils ne constituent pas une validation de données réelles.
3. Aucun test distant de quotas Cloudflare n’a été exécuté. Les compteurs D1 locaux ne doivent pas être extrapolés au plan Free ou à une charge nationale de production.
4. Les indicateurs « Personnes bénéficiaires » et « Validations en attente » restent volontairement désactivés.

**Décision : UI-MAP 1.5 = PASS technique local. L’homologation géographique nationale reste PARTIAL et indépendante de cette acceptation.**
