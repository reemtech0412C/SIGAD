# SIGAD — UI-MAP 1.4 — Validation métier des indicateurs

**Projet :** SIGAD v3.0  
**Branche :** `ui/interactive-map`  
**Date :** 23 octobre 2026  
**Référence :** UI-MAP 1.3 — `PARTIAL`

```text
STATUT: PARTIAL
API_CHANGES: NONE
MIGRATIONS: NONE
REMOTE_CHANGES: NONE
DEPLOYMENT: NONE
GIT_PUSH: NONE
```

## Décision

Les tables existantes contiennent une preuve exploitable pour les quatre premiers indicateurs, mais les API actuelles ne calculent ni ne retournent les quatre contrats demandés. L’API de tableau de bord compte les distributions sur leur date prévue, utilise l’état de service du ménage au lieu des lignes de remise et expose un stock scalaire qui additionne des articles et des unités différents. L’API paginée des soldes est plus détaillée, mais elle ne fournit pas à elle seule une synthèse cartographique rapprochée et validée.

Les quatre définitions ci-dessous sont testées comme **oracle synthétique du contrat proposé**, sans être présentées comme des résultats opérationnels de l’application. Aucun indicateur n’est raccordé à la carte. Une extension de l’API existante ou un nouveau service d’agrégation constituerait un changement métier/API; il est documenté ici pour approbation avant implémentation.

La carte garde ses polygones OCHA indicatifs, son avertissement de non-homologation et l’état « Données provinciales indisponibles ». Elle ne reçoit aucun agrégat national ni aucune donnée nominative.

## 1. Matrice de validation

| Indicateur | Source et champs D1 | Règle proposée / compatibilité du schéma | Écart avec les API actuelles | Décision |
|---|---|---|---|---|
| **Distributions réalisées** | `distributions_provinciales(id, province_id, statut)`; `clotures_distribution(distribution_id, province_id, date_cloture)`. | Compter distinctement les distributions en `CLOTUREE_CENTRAL`, ayant une ligne de clôture et dont `date_cloture` est dans la période. Cela représente une clôture finale et exclut brouillons, exécution non close et opérations sans clôture. Le schéma ne contient pas de statut `ANNULEE`; il ne permet pas d’auditer les annulations. | `GET /api/rapports/tableau-de-bord` compte tous les statuts filtrés par `distributions_provinciales.date_prevue`. `GET /api/rapports/RAPPORT_CLOTURE/apercu` utilise bien `date_cloture`, mais retourne une liste paginée avec des champs de rapport, dont l’agent de clôture; ce n’est pas un agrégat cartographique minimal. | **Source calculable; changement de logique du tableau de bord requis. Pas de raccordement avant approbation API.** |
| **Distributions en cours** | `distributions_provinciales.statut`; `historique_statuts(operation_type, operation_id, nouveau_statut, cree_le)`. | Pour une photographie actuelle, inclure les opérations ayant atteint `EN_EXECUTION` et dont l’état courant est `EN_EXECUTION`, `TERMINEE_PROVINCE` ou `RETOURNEE_POUR_CORRECTION`; exclure brouillon, préparation/validation jamais exécutées et `CLOTUREE_CENTRAL`. `historique_statuts` permet de prouver le démarrage. Le schéma ne prévoit pas d’annulation. | Le champ actuel `operations_en_attente` est la somme de distributions non clôturées et d’approvisionnements non clôturés; il comprend les brouillons et n’est donc pas « distributions en cours ». | **Source calculable comme photographie; définition temporelle et nouveau calcul API nécessaires.** |
| **Ménages servis** | `remises_distribution(id, distribution_id, province_id, menage_id, date_remise)`; `lignes_remise(remise_id, quantite_remise)`. | Compter `DISTINCT (province_id, menage_id)` dans la période de `date_remise`, en exigeant au moins une ligne `quantite_remise > 0`. Une remise partielle positive est une preuve; plusieurs articles et plusieurs distributions ne comptent le ménage qu’une fois dans la période. Les insertions réelles de remise et de lignes sont faites par la transaction de remise. | Les agrégats actuels lisent `menages_distribution.statut_service` et appliquent les dates à `distributions_provinciales.date_prevue`. Le statut du plan n’est pas la preuve de remise et la date prévue n’est pas la date d’aide. | **Source calculable; requête et agrégat API nouveaux/revisés requis.** |
| **Stocks disponibles** | `lots_stock(province_id, entrepot_id, article_id, etat_qualite, date_peremption, quantite_physique, quantite_reservee)`; `soldes_stock`; `entrepots(niveau, province_id, actif)`; `articles(unite_mesure_id, actif)`; `unites_mesure`. | Par province, entrepôt actif, article et unité, sommer `quantite_physique - quantite_reservee` des lots de qualité `BON`, non périmés à la date de photographie et de quantité disponible positive. Garder les entrepôts séparés; ne jamais additionner des articles ou unités incompatibles. Comparer physique et réservation des lots au solde comptable; si discordance, signaler `INCOHERENT` et ne pas publier la quantité comme fiable. | `stock_disponible_comptable` de l’API rapports additionne un scalaire inter-articles/unités. `GET /api/stocks/soldes-stock` fournit des lignes paginées par entrepôt/article, unité et `quantite_distribuable`, avec périmètre de session, mais ne vérifie pas la concordance lots/solde ni l’activité de l’entrepôt dans sa requête. `ETAT_STOCKS` donne les écarts par article/entrepôt, mais le contrat de filtre et la projection ne fournissent pas ensemble l’agrégat cartographique, l’unité et la photographie attendue. | **Données disponibles; API actuelle insuffisante pour une carte fiable. Agrégat validé ou extension coordonnée nécessaire.** |
| **Personnes bénéficiaires** | `menages.nombre_personnes`; `membres_menage`; remises au niveau `menage_id`, sans preuve de livraison individuelle par membre. | La taille du ménage ne prouve pas que chaque membre a reçu une aide. Un éventuel total tiré des ménages servis doit porter explicitement le libellé « estimation ». | Les champs existants nommés « personnes assistées » sont des sommes des effectifs déclarés de ménages; ils ne prouvent pas une remise à chaque personne. | **Désactivé**, conformément à la définition métier. |
| **Validations en attente** | Plusieurs workflows : distributions, approvisionnements, partenaires, référentiel territorial, `demandes_correction`; états et autorités distincts. | Aucun compteur global sans dictionnaire approuvé des étapes soumises, états en attente et autorités de décision. Un brouillon n’est pas une demande envoyée. | `operations_en_attente` n’est pas un registre des validations et mêle plusieurs types d’opérations. | **Désactivé**, conformément à la définition métier. |

### Limites de la distribution et des remises

- Les états de distribution acceptés sont `BROUILLON`, `EN_PREPARATION`, `VALIDEE_PROVINCE`, `EN_EXECUTION`, `TERMINEE_PROVINCE`, `RETOURNEE_POUR_CORRECTION` et `CLOTUREE_CENTRAL`. Il n’existe pas d’état ni de transition `ANNULEE`.
- `date_declaration_fin` atteste la déclaration de fin par la délégation; `clotures_distribution.date_cloture` atteste la clôture centrale finale. Pour l’indicateur « réalisées et fermées définitivement », seule la seconde date convient.
- `menages_distribution` a une unicité `(distribution_id, menage_id)`, pas une unicité globale de bénéficiaire. La déduplication sur la période doit donc être faite par `(province_id, menage_id)` après filtrage sur les preuves positives de remise.
- Les remises partielles sont admises par le parcours de distribution. Le critère proposé est une ligne de quantité strictement positive, non l’atteinte de la ration complète.

## 2. Contrat API à soumettre avant changement

### Option de raccordement

Étendre de façon additive `GET /api/rapports/tableau-de-bord` avec un objet `indicateurs_carte`. Ce choix réutiliserait la route existante, mais **modifierait le contrat et les calculs du service**; cette évolution reste en attente d’approbation. Aucune route ni logique n’a été modifiée ici.

```http
GET /api/rapports/tableau-de-bord?date_debut=AAAA-MM-JJ&date_fin=AAAA-MM-JJ&province_id=prov-sila&article_id=...
```

| Élément | Contrat proposé |
|---|---|
| Dates | ISO `AAAA-MM-JJ`. Les distributions réalisées filtrent `clotures_distribution.date_cloture`; les ménages filtrent `remises_distribution.date_remise`. Les distributions en cours sont une photographie actuelle et ne reçoivent pas de filtre temporel, sauf décision explicite contraire. Le stock porte `date_photographie`, pas une fausse période historique. |
| Province | Pour `DELEGUE_PROVINCIAL`, le service dérive la province de la session, rejette un filtre croisé avant les requêtes et ne renvoie qu’une ligne de sa province. Un rôle central autorisé peut demander une province ou le national. |
| Article | Pour le stock, `article_id` désigne un article unique dont l’unité est déterminée par `articles.unite_mesure_id`. Aucun total inter-unités. |
| Résultat | Agrégats sans noms, téléphones, identifiants de ménages, détails de remise, agents ou données de `membres_menage`. Le stock conserve les dimensions `province_id`, `entrepot_id`, `article_id`, `unite_mesure_id`. |
| Pagination | Pas de pagination pour les agrégats nationaux bornés à 23 provinces. Les lignes de stock détaillées éventuelles sont paginées côté serveur; ne pas contourner leur pagination dans React pour envoyer un jeu national au rôle provincial. |
| Valeurs | Distinguer `{ valeur: 0, etat: "DISPONIBLE" }`, `{ valeur: null, etat: "AUCUNE_DONNEE" }` et `{ valeur: null, etat: "INCOHERENT" }`. Personnes et validations restent absentes ou `INDISPONIBLE`. |
| Autorisation | La route actuelle est protégée par rôles `ADMIN_CENTRAL`, `PROPRIETAIRE`, `DELEGUE_PROVINCIAL`; les tests démontrent le périmètre sessionnel. Le rôle `PROPRIETAIRE` reçoit actuellement le national de façon explicite dans la garde. Toute restriction à `ADMIN_CENTRAL` seul serait une décision RBAC distincte. |

### Formules SQL candidates

Extraits indicatifs pour préparer l’implémentation après approbation; ils n’ont pas été exécutés dans le Worker et ne sont pas des requêtes en production.

```sql
-- Clôtures finales pendant l’intervalle; le périmètre vient de la session.
SELECT d.province_id, COUNT(DISTINCT d.id) AS distributions_realisees
FROM distributions_provinciales d
JOIN clotures_distribution c ON c.distribution_id = d.id AND c.province_id = d.province_id
WHERE d.statut = 'CLOTUREE_CENTRAL'
  AND (? IS NULL OR d.province_id = ?)
  AND c.date_cloture >= ? AND c.date_cloture < date(?, '+1 day')
GROUP BY d.province_id;

-- Photographie des opérations qui ont réellement atteint l’exécution.
SELECT d.province_id, COUNT(DISTINCT d.id) AS distributions_en_cours
FROM distributions_provinciales d
WHERE d.statut IN ('EN_EXECUTION', 'TERMINEE_PROVINCE', 'RETOURNEE_POUR_CORRECTION')
  AND EXISTS (
    SELECT 1 FROM historique_statuts h
    WHERE h.operation_type = 'DISTRIBUTION_PROVINCIALE'
      AND h.operation_id = d.id AND h.nouveau_statut = 'EN_EXECUTION'
  )
  AND (? IS NULL OR d.province_id = ?)
GROUP BY d.province_id;

-- Ménages distincts avec preuve positive de remise dans la période.
SELECT rd.province_id, COUNT(DISTINCT rd.menage_id) AS menages_servis
FROM remises_distribution rd
WHERE (? IS NULL OR rd.province_id = ?)
  AND rd.date_remise >= ? AND rd.date_remise < date(?, '+1 day')
  AND EXISTS (
    SELECT 1 FROM lignes_remise lr
    WHERE lr.remise_id = rd.id AND lr.quantite_remise > 0
  )
GROUP BY rd.province_id;

-- Stock conforme conservé par dimensions compatibles.
SELECT l.province_id, l.entrepot_id, l.article_id, a.unite_mesure_id,
       SUM(l.quantite_physique - l.quantite_reservee) AS quantite_disponible
FROM lots_stock l
JOIN entrepots e ON e.id = l.entrepot_id AND e.actif = 1
  AND e.niveau = 'PROVINCIAL' AND e.province_id = l.province_id
JOIN articles a ON a.id = l.article_id AND a.actif = 1
WHERE l.province_id = ? AND l.article_id = ?
  AND l.etat_qualite = 'BON'
  AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
  AND l.quantite_physique > l.quantite_reservee
GROUP BY l.province_id, l.entrepot_id, l.article_id, a.unite_mesure_id;
```

La requête de stock doit en outre rapprocher les totaux physiques et réservés des lots au couple `soldes_stock(entrepot_id, article_id)` avant de publier une quantité. En cas d’écart, l’état est `INCOHERENT`; on ne substitue pas silencieusement le solde comptable au disponible FEFO.

### Coût D1 et index

- La réponse actuelle de `GET /api/rapports/tableau-de-bord` a déclaré **623 lignes lues et 3 ms D1 cumulées** dans le dernier Worker local d’acceptation avec données synthétiques (appel national, période d’octobre). Ce coût agrège les trois SELECT existants; il ne peut pas être attribué à chacun des nouveaux indicateurs.
- Les requêtes candidates n’étant pas dans le Worker, leurs `rows_read`, `EXPLAIN QUERY PLAN` et coûts par filtre sont **non mesurés**. Aucun chiffre du cas local n’est extrapolé à Cloudflare distant.
- Les index existants pertinents comprennent `idx_distributions_province_statut_date`, `idx_distributions_date_rapport`, `idx_menages_distribution_province_statut`, `idx_remises_distribution_date`, `idx_lots_stock_fefo` et `idx_soldes_stock_prov`.
- Avant développement, vérifier le plan de jointure pour `clotures_distribution.date_cloture`, `historique_statuts(operation_type, operation_id, nouveau_statut)`, les remises par date et l’existence de lignes par `remise_id`. Les migrations actuelles ne déclarent pas d’index spécialisé sur la date de clôture ni sur l’événement d’entrée en exécution. Un index sur les remises commençant par `(province_id, distribution_id, date_remise)` ne couvre pas optimalement une agrégation nationale par intervalle de date.
- Mesure de charge distincte, liste de ménages sur Worker local, dix mesures après échauffement : 502 ménages médiane 72,05 ms / P95 79,12 ms; 1 500 médiane 54,30 ms / P95 65,21 ms; 5 000 médiane 63,61 ms / P95 80,83 ms. Cela mesure la liste des ménages et son index, pas les KPI candidats.

## 3. Sécurité et périmètre

| Contrôle | Résultat |
|---|---|
| Sila vers Ouaddaï | **PASS** en intégration Worker : réponse Sila limitée à `prov-sila`, filtre `prov-ouaddai` refusé; réciproquement Ouaddaï ne reçoit que `prov-ouaddai` et le filtre Sila est refusé. La portée est imposée dans le service avant la sérialisation JSON. |
| National | **PASS** pour le compte `ADMIN_CENTRAL` autorisé : réponse nationale de 23 provinces. La garde de route autorise également explicitement `PROPRIETAIRE`. |
| Données personnelles sur la carte | **PASS** pour l’état actuel : le composant ne reçoit pas les agrégats du tableau de bord et le GeoJSON ne contient aucun ménage, personne, remise ou stock. Les nouveaux KPI ne sont pas envoyés au navigateur. |
| Accès stock | `GET /api/stocks/soldes-stock` applique `appliquerPorteeProvince` côté Worker et une pagination serveur; le périmètre de session est confirmé par les tests. Cela n’autorise pas à contourner la pagination ou à calculer un national côté délégation. |
| Référentiel géographique | Aucun changement. Les limites OCHA restent indicatives et non homologuées; aucun code spatial n’associe des statistiques à une province. |

## 4. Tests exécutés

| Test | Commande / portée | Résultat |
|---|---|---|
| Contrats synthétiques des quatre KPI | Inclus dans `npm run test:unit` : clôture/date, opération réellement démarrée, preuves positives avec ménage répété et remise partielle, stock réservé/non utilisable/unités/entrepôts/provinces. | **PASS**, 4 nouveaux tests; suite totale 10 fichiers / 40 tests. Ces tests valident les règles candidates, pas le service API de production. |
| TypeScript | `npm run typecheck` | **PASS**, sortie 0 (`wrangler types` puis `tsc --noEmit`). Wrangler a émis un `EPERM` non bloquant en tentant d’écrire un journal utilisateur hors du dépôt; les types ont été générés et `tsc` a réussi. |
| Build | `npm run build` et build inclus à `npm run test:e2e` | **PASS**, Vite 8.3.5; PWA générée. |
| Schéma | `npm run db:verifier`; contrôle D1 local temporaire de `npm run test:e2e` | **PASS**, SQLite vierge et D1 Wrangler locale : 21 migrations, 65 tables (62 métier + 3 MFA), 83 index, 68 déclencheurs, 23 provinces, 25 comptes, 500 communes en relecture/0 active, contraintes et clés étrangères valides. Aucun accès distant. |
| Matrice de sécurité | `npm run test:security-matrix` et intégration Worker | **PASS**, 140 routes cataloguées; 137 essais anonymes et 123 refus RBAC sans modification de l’empreinte des 65 tables. |
| Worker/D1/R2 | Exécution d’intégration incluse à `npm run test:e2e`, Wrangler `--local` | **PASS**, 21/21 sous-tests : authentification 2, matrice 1, stocks 1, approvisionnements 1, distributions 10, rapports 6. La sous-suite rapports vérifie les filtres, les périmètres Sila/Ouaddaï, les rapports et exports; elle confirme également qu’un brouillon de distribution apparaît dans l’ancien total et qu’un ménage portant un statut servi sans ligne de remise ne constitue pas une preuve de remise. |
| Playwright / Chrome | `SIGAD_PLAYWRIGHT_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe' npm run test:e2e` (Worker et D1 locaux) | **PARTIAL**, 10/11 tests passent. Carte, restrictions de rôle, modules et parcours opérationnel réussissent. `tests/e2e/rapports.spec.ts` échoue au téléchargement CSV : après réception de l’événement et du statut de succès, `download.path()` renvoie `download: canceled` sous Chrome installé. Le premier essai sans chemin Chrome a été bloqué car le navigateur Chromium n’était pas présent dans le répertoire temporaire imposé par le harnais. Aucun test n’a été supprimé ou affaibli. |
| Vérification du diff | `git diff --check` | **PASS**, code 0; avertissements de normalisation LF/CRLF seulement. |

La suite d’intégration sur Worker démontre les périmètres et les transactions existants, mais ne constitue pas un test d’un endpoint de KPI 1.4. Les quatre tests ajoutés isolent explicitement les définitions candidates et ne déguisent pas l’absence de calcul dans l’API.

## 5. Modifications et suite requise

### Fichiers modifiés/créés

- `tests/unit/ui-map-kpi-contract.test.mjs` — quatre tests synthétiques de contrat, sans export de logique métier vers l’application.
- `tests/integration/rapports-worker.test.mjs` — assertions de caractérisation de l’API actuelle et mesure locale `rows_read` / durée D1.
- `docs/UI_MAP_1_4_BUSINESS_VALIDATION.md` — présente validation et proposition de contrat.

Aucun changement de composant cartographique, d’API, de service métier, de schéma, de migration, de référence territorial, de donnée, de ressource distante ou de RBAC.

### Évolutions nécessaires après approbation

1. Valider que « distributions en cours » est une photographie, avec états inclus `EN_EXECUTION`, `TERMINEE_PROVINCE` et `RETOURNEE_POUR_CORRECTION`, et que le filtre de période ne s’y applique pas.
2. Décider si le schéma doit plus tard représenter les annulations; actuellement aucune annulation n’est enregistrable.
3. Approuver l’extension additive de `GET /api/rapports/tableau-de-bord` et le schéma JSON `indicateurs_carte`; aucune donnée nominative ne devra y apparaître.
4. Choisir l’état de sortie quand les lots et `soldes_stock` divergent (`INCOHERENT`, recommandé) et confirmer l’exclusion des entrepôts inactifs.
5. Après approbation, implémenter les agrégats dans le Worker avec périmètre issu de session, index vérifiés, mesures `rows_read`, tests D1 synthétiques et E2E d’isolation; ensuite seulement raccorder la carte.
6. Régler ou diagnostiquer l’annulation de téléchargement CSV Playwright sous Chrome sans retirer le test ni désactiver l’acceptation des téléchargements.

Les indicateurs **Personnes bénéficiaires** et **Validations en attente** restent désactivés. **UI-MAP 1.4 : PARTIAL**, en attente d’approbation du contrat API et de résolution du test de téléchargement Chrome.
