# UI-MAP 1.7 — Audit du cycle d’annulation, intégrité des ménages et acceptation opérationnelle

**OPERATIONAL_MAP : PARTIAL**

**LEGAL_BOUNDARIES : NOT_APPROVED**

**CANCELLATION : NOT_SUPPORTED**

**Portée :** validation locale avec Wrangler, Worker, D1/R2 éphémères, données synthétiques et Chrome. Aucune migration, écriture ou publication distante n’a été exécutée.

## Décision exécutive

Les quatre indicateurs cartographiques ont produit les valeurs attendues pour les états effectivement représentables par SIGAD. Les contrôles Sila/Ouaddaï, la confidentialité des agrégats et la cohérence de stock ont réussi. Le test d’annulation n’est pas applicable au modèle actuel : `ANNULEE` n’est pas un état de `distributions_provinciales` et aucune opération d’annulation de distribution n’existe.

L’acceptation opérationnelle reste **PARTIAL** pour un défaut distinct du calcul des KPI : après confirmation centrale `CONFIRME_DISTINCT`, les deux ménages précédemment placés en `DOUBLON_SUSPECTE` restent dans cet état. Le parcours ne fournit pas de décision qui les réactive ou qui tranche explicitement leur statut. Une règle métier est nécessaire avant toute correction. L’import répété n’a pas non plus de clé d’idempotence de requête ; il crée un nouvel enregistrement suspect au lieu de rejouer une réponse antérieure.

Les limites OCHA/HDX restent indicatives. Aucune homologation juridique des frontières n’est établie par cette acceptation.

## Cycle réel des distributions

La contrainte de `distributions_provinciales.statut` dans `migrations/0006_distributions_provinciales.sql` admet exactement les sept états ci-dessous. Le déclencheur `verifier_statut_distribution` de `migrations/0016_integrite_distributions_provinciales.sql` limite les transitions.

| État précédent | État suivant | Opération et autorité observées | Effets et traces |
|---|---|---|---|
| Création | `BROUILLON` | Création provinciale par un délégué autorisé | Le plan est créé dans le périmètre de sa province. |
| `BROUILLON` | `EN_PREPARATION` | `POST /api/distributions/:id/preparation`, délégué de la province | Historique, audit et clé d’idempotence. |
| `EN_PREPARATION` | `VALIDEE_PROVINCE` | `POST /api/distributions/:id/validation`, délégué de la province | Plan figé, validations et réservations FEFO inscrites atomiquement avec les mouvements et l’audit. |
| `VALIDEE_PROVINCE` | `EN_EXECUTION` | `POST /api/distributions/:id/execution`, délégué de la province | Démarrage historisé et audité. |
| `EN_EXECUTION` | `TERMINEE_PROVINCE` | `POST /api/distributions/:id/declaration-fin`, délégué de la province | Requiert la résolution des ménages ciblés et un procès-verbal valide ; transition et audit atomiques. |
| `TERMINEE_PROVINCE` | `RETOURNEE_POUR_CORRECTION` | `POST /api/central/distributions/:id/retour-correction`, administration centrale | Demande de correction, historique, audit et notification. |
| `RETOURNEE_POUR_CORRECTION` | `TERMINEE_PROVINCE` | `POST /api/distributions/:id/corrections`, délégué de la province | Correction limitée aux champs autorisés ; soumission, historique et audit atomiques. Le déclencheur exige une correction soumise. |
| `TERMINEE_PROVINCE` | `CLOTUREE_CENTRAL` | `POST /api/central/distributions/:id/cloture`, administration centrale | Clôture interdite avec correction ouverte ; les réservations résiduelles sont libérées par des mouvements de stock tracés. |

La validation centrale d’une correction change la demande de correction, mais laisse la distribution à `TERMINEE_PROVINCE`. Chaque transition importante utilise `historique_statuts` et `journaux_audit` conformément aux déclencheurs d’intégrité.

### Annulation et retour arrière

- `ANNULEE` figure dans le domaine de `reservations_stock.statut` pour une réservation ; ce n’est pas un statut de distribution.
- Aucun endpoint, fonction de service ou transition de schéma n’annule une distribution avant son exécution. Aucun endpoint ne supprime une distribution.
- Une tentative d’écriture de `ANNULEE` dans la distribution clôturée de l’essai a été rejetée par la contrainte/transition D1 ; son statut est resté `CLOTUREE_CENTRAL`. L’absence du statut dans la contrainte s’applique aussi aux brouillons et aux opérations démarrées.
- **Annuler avant exécution** nécessiterait une décision métier sur l’état terminal, la libération éventuelle des réservations après validation, le motif, les droits et l’audit. Cette opération n’existe pas aujourd’hui.
- **Revenir sur une distribution déjà commencée** ne peut pas être assimilé à une annulation documentaire : les remises et leurs mouvements sont immuables. Le retour en correction conserve ces preuves et ne recrédite pas le stock. Une inversion nécessiterait des mouvements compensatoires distincts et une procédure approuvée ; elle n’est pas implémentée.
- Le retour pour correction modifie seulement les champs documentaires autorisés. Les remises positives déjà enregistrées restent des preuves de service. La consommation est inscrite lors de chaque remise ; les reliquats réservés sont libérés à la clôture.

**Classement du scénario `ANNULEE` : non applicable au modèle actuel**, et non test réussi. Ajouter une annulation de distribution exige une décision fonctionnelle indépendante ; aucun changement de statut, d’API ou de schéma n’a été fait.

## Résultats des quatre indicateurs

Les valeurs ont été lues directement via `GET /api/rapports/indicateurs-carte` dans les tests Wrangler/D1. Les filtres de période sont appliqués aux clôtures et remises ; l’indicateur « en cours » est une photographie des opérations ayant effectivement atteint `EN_EXECUTION`.

| Scénario local synthétique | KPI | Valeur attendue | Valeur observée | Résultat |
|---|---|---:|---:|---|
| Sila après démarrage, avant remise | Réalisées / en cours / ménages servis | 0 / 1 / 0 | 0 / 1 / 0 | PASS |
| Même opération, période historique janvier 2020 | En cours | 1, photographie indépendante de la période | 1 | PASS |
| Sila après remises positives complètes et partielles, puis retour pour correction | Réalisées / en cours / ménages uniques servis | 0 / 1 / 2 | 0 / 1 / 2 | PASS |
| Sila après clôture centrale, octobre 2026 | Réalisées / en cours / ménages / riz disponible | 1 / 0 / 2 / 59 KG | 1 / 0 / 2 / 59 KG | PASS |
| Ouaddaï après la même clôture | Réalisées / en cours / ménages / riz disponible | 0 / 0 / 0 / 20 KG | 0 / 0 / 0 / 20 KG | PASS |
| Période janvier 2020 après clôture d’octobre | Réalisées / en cours / ménages servis | 0 / 0 / 0 | 0 / 0 / 0 | PASS |
| Sila après réservation FEFO, hors lots périmés/endommagés | Riz disponible | 57 KG | 57 KG | PASS |
| Sila, article d’une autre unité après réservation | Farine disponible | 7 LITRE | 7 LITRE | PASS |
| Sila, après classement d’un ménage déjà servi en revue | Ménages servis / distributions réalisées | 2 / 1, sans variation | 2 / 1 | PASS |

Les ménages sont comptés par identifiant distinct avec une ligne de remise strictement positive : plusieurs articles, plusieurs remises au même ménage et une remise partielle ne multiplient pas le compte. Le stock est séparé par province, entrepôt, article et unité ; les réservations, lots de qualité impropre, lots expirés et entrepôts inactifs sont exclus. Une valeur indisponible reste distincte de zéro.

| Indicateur | Définition exécutée | État |
|---|---|---|
| `Distributions réalisées` | Distribution `CLOTUREE_CENTRAL` avec ligne dans `clotures_distribution`, clôturée dans la période | PASS pour les états admis |
| `Distributions en cours` | État `EN_EXECUTION`, `TERMINEE_PROVINCE` ou `RETOURNEE_POUR_CORRECTION`, avec historique de démarrage, avant clôture | PASS pour les états admis |
| `Ménages servis` | `COUNT(DISTINCT rd.menage_id)` dans la période avec une ligne de remise positive, province rapprochée | PASS, y compris remise partielle et statut de ménage en revue |
| `Stocks disponibles` | Lots des entrepôts provinciaux actifs, qualité `BON`, non expirés : physique moins réservé, par article/unité | PASS, FEFO et réconciliation lots/soldes vérifiés |

Les scénarios d’annulation ne sont pas ajoutés aux formules : aucun état annulé de distribution ne peut être persisté dans le schéma actuel.

## Import et rapprochement des doublons

Les essais ont été exécutés sur D1 locale avec un délégué Sila et un administrateur central MFA.

| Cas | Résultat observé | Résultat |
|---|---|---|
| Premier import d’un ménage sans correspondance | Un dossier `ACTIF` créé | PASS |
| Réimport identique | Un nouveau dossier est ajouté ; la détection signale le doublon ; les deux dossiers passent à `DOUBLON_SUSPECTE` | PASS pour l’absence d’activation automatique ; limite d’idempotence documentée |
| Deux imports concurrents avec le même téléphone | Deux dossiers `DOUBLON_SUSPECTE`, aucun actif sélectionné arbitrairement ; signalement unique | PASS |
| Échec forcé du journal d’audit pendant un import en doublon | HTTP 500 ; aucun nouvel enregistrement, changement du dossier source, signalement ni audit partiel ; nouvel essai ensuite accepté | PASS — rollback complet de `db.batch` |
| Décision `CONFIRME_DISTINCT` par le délégué | HTTP 403 | PASS — décision centrale protégée par RBAC |
| Même décision par l’administration centrale MFA | HTTP 200, signalement traité et décision auditée | PASS pour la décision et l’audit |
| Statut des deux dossiers après `CONFIRME_DISTINCT` | Les deux restent `DOUBLON_SUSPECTE` ; aucun parcours ne les réactive dans le code existant | **Réserve métier** |
| Classement en revue d’un ménage déjà servi | Le KPI reste à 2 ménages servis et 1 distribution réalisée | PASS — le marquage seul ne réécrit pas les preuves ni les KPI |

La limite constatée ne provient pas du KPI : l’endpoint de décision met à jour `signalements_doublons` et l’audit ; il ne restaure pas les statuts des ménages après `CONFIRME_DISTINCT`. Aucun chemin applicatif observé ne remet un ménage de `DOUBLON_SUSPECTE` à `ACTIF`. Il faut décider si cette confirmation restaure le dossier source, le dossier suspect, les deux ou aucun. Aucun comportement n’a été inventé dans cette phase.

Par ailleurs, `/api/gestion/menages/importations` n’accepte pas de clé d’idempotence de requête. Une répétition déclenche le rapprochement et crée un nouveau dossier suspect, au lieu de retourner la première réponse. La prévention des doublons actifs est vérifiée ; l’exactement-une-fois de l’import ne l’est pas et n’est pas implémenté.

## RBAC et isolation provinciale

| Session | Essai | Résultat observé |
|---|---|---|
| Anonyme | `GET /api/rapports/indicateurs-carte` | `401` |
| Délégué Sila | Requête sans province imposée | Agrégat limité à `prov-sila` |
| Délégué Sila | Demande explicite Ouaddaï | `403`, aucune donnée Ouaddaï dans la réponse |
| Délégué Ouaddaï | Requête sans province imposée | Agrégat limité à `prov-ouaddai` |
| Délégué Ouaddaï | Demande explicite Sila | `403`, aucune donnée Sila dans la réponse |
| Administration centrale autorisée avec MFA | Agrégat national | 23 entrées de province ; agrégats seulement |
| Décision de doublon | Délégué / administration centrale MFA | `403` / `200` |

Les réponses de carte ne transportent pas d’identifiants ou noms de ménages, ni d’identité de réceptionnaire. Le classement d’un ménage en revue ne modifie pas les mouvements ni les preuves de remise. La matrice de sécurité couvre 141 routes ; 138 essais anonymes et 123 refus RBAC ont été vérifiés sans mutation de l’empreinte des 65 tables.

## Ressources et mesures locales

La vérification D1 vierge a appliqué les **21 migrations** (0001–0007, seed 0008, corrections 0009–0021) : **65 tables** (62 métier et 3 MFA), 83 index, 68 déclencheurs, 23 provinces et 25 comptes ; aucune violation de clé étrangère. Les 500 communes restent en relecture et aucune n’est activée. Aucun changement de schéma n’a été créé.

Les mesures du test complet sont locales, synthétiques, à cinq répétitions par variante et ne représentent pas des performances Cloudflare distantes :

| Ménages synthétiques ajoutés | Agrégat sans stock : lignes D1 lues ; P50/P95 | Avec stock : lignes D1 lues ; P50/P95 |
|---:|---|---|
| 0 | 155 ; 34,32 / 304,55 ms | 299 ; 31,66 / 44,05 ms |
| 500 | 157 ; 41,67 / 71,34 ms | 301 ; 43,15 / 74,43 ms |
| 1 500 | 157 ; 39,86 / 56,25 ms | 301 ; 37,80 / 61,66 ms |
| 5 000 | 157 ; 29,54 / 71,64 ms | 301 ; 42,50 / 188,92 ms |

Les percentiles empiriques sur cinq mesures sont sensibles aux valeurs extrêmes. Les appels n’ont pas écrit de lignes D1. Ces chiffres ne sont ni des quotas ni une promesse de latence distante.

## Vérifications exécutées

| Commande ou vérification | Résultat réel |
|---|---|
| `npm run typecheck` | PASS — Wrangler types et `tsc --noEmit`, code de sortie 0 |
| `npm run build` | PASS — Vite 8.3.5, code de sortie 0 |
| `npm run test:unit` | PASS — 10 fichiers, 42 tests |
| `npm run test:integration` | PASS — 22 tests dans 6 fichiers ; Worker Wrangler, D1/R2 locaux ; exécution complète avant l’ajout final du test de revue |
| `SIGAD_INTEGRATION_TESTS=auth-worker.test.mjs npm run test:integration` | PASS — 2/2 tests après ajout du test final : refus provincial, décision centrale, audit et états des ménages |
| `npm run test:e2e` | PASS — build, vérification de schéma, intégration et 11/11 tests Playwright dans Chrome ; exécuté sur la version applicative inchangée |
| `npm run test:security-matrix` | PASS — matrice synchronisée, 141 routes |
| Vérification de schéma D1 locale | PASS — migrations et contraintes ; `foreign_key_check` sans anomalie |
| `git diff --check` | PASS — aucun espace fautif ; avertissements Git LF/CRLF seulement |

`workerd` a échoué dans le bac à sable avec `GetFinalPathNameByHandleW: #5 Accès refusé`. Le même harnais a ensuite réussi depuis PowerShell local non sandboxé, en conservant `--local`, un état D1 éphémère et des fichiers d’activation temporaires hors du dépôt. Aucun `--remote` n’a été utilisé.

## Fichiers créés ou modifiés pour UI-MAP 1.7

- `tests/integration/auth-worker.test.mjs` — import initial, réimport, import concurrent, décision RBAC de doublon et rollback forcé par échec d’audit.
- `tests/integration/distributions-worker.test.mjs` — invariance du KPI après classement en revue et vérification du rejet de `ANNULEE`.
- `tests/unit/ui-map-kpi-contract.test.mjs` — retrait de l’état `ANNULEE` non représentable des fixtures de calcul ; ce cas n’est pas présenté comme testé positivement.
- `docs/UI_MAP_1_7_FINAL_OPERATIONAL_ACCEPTANCE.md` — présent rapport.

Aucune API, règle métier, migration, donnée D1/R2 distante ou ressource Cloudflare n’a été modifiée. Les autres changements présents dans l’arbre de travail appartiennent aux travaux antérieurs ; aucun commit ni push n’a été effectué.

## Réserves et décision finale

1. **Annulation de distribution : NOT_SUPPORTED.** L’état n’existe pas ; il ne doit pas être ajouté sans décision fonctionnelle. Les indicateurs sont acceptés pour les états existants.
2. **Décision « distinct » de doublon :** le signalement est résolu et audité, mais les dossiers restent bloqués en `DOUBLON_SUSPECTE`. Choisir le comportement attendu avant toute correction.
3. **Import répété :** pas de clé d’idempotence ; un nouvel enregistrement suspect est créé à la répétition. Choisir si l’import doit obtenir un mécanisme d’idempotence.
4. **Limites géographiques :** OCHA/HDX reste un fond indicatif, non homologué juridiquement. Le succès technique des KPI ne vaut pas approbation légale.

**OPERATIONAL_MAP : PARTIAL** — calculs, sécurité et cohérence des quatre indicateurs passent sur les états disponibles ; la résolution fonctionnelle des dossiers confirmés distincts et l’idempotence des importations restent ouvertes.

**LEGAL_BOUNDARIES : NOT_APPROVED** — l’homologation légale des frontières provinciales reste à établir indépendamment.
