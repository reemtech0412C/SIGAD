# SIGAD — UI-MAP 1.3 — Contrat des KPI et intégration statistique sécurisée

**Projet :** SIGAD v3.0  
**Branche :** `ui/interactive-map`  
**Date :** 23 octobre 2026  
**Périmètre :** audit du contrat existant, proposition de définitions et vérification locale. Aucun nouveau KPI/API n’est implémenté dans cette étape.

```text
STATUT: PARTIAL
API_CHANGES: NONE
MIGRATIONS: NONE
REMOTE_CHANGES: NONE
DEPLOYMENT: NONE
GIT_PUSH: NONE
```

## Décision

Le tableau de bord existant fournit une base technique réutilisable : `GET /api/rapports/tableau-de-bord` applique le périmètre de session avant les lectures D1 et expose déjà des agrégats par identifiant SIGAD. Ses libellés et calculs actuels ne constituent cependant pas un contrat acceptable pour tous les KPI demandés. En particulier, les distributions comptées ne sont pas filtrées par leur état d’achèvement, la période s’appuie sur la date prévue, l’effectif d’un ménage n’est pas une preuve que chacun de ses membres a reçu l’aide, le stock agrégé additionne des unités hétérogènes et les validations appartiennent à plusieurs workflows.

La carte reste donc un fond expérimental sans valeurs opérationnelles. Les propositions ci-dessous sont des contrats soumis à validation; elles n’autorisent ni changement d’API ni changement de règles métier. Le texte cartographique affiche désormais explicitement : **« Limites administratives indicatives — source OCHA/HDX, homologation juridique non confirmée. »**

## 1. Résultats de l’audit des six KPI

| KPI | DEFINITION | SOURCE | FORMULE actuelle / proposée | PERMISSIONS | RISQUE DE DOUBLON | VALIDATION |
|---|---|---|---|---|---|---|
| **Distributions réalisées** | Une opération dont la délégation a déclaré la fin, distincte de sa clôture centrale. Événement disponible : `date_declaration_fin`, transition vers `TERMINEE_PROVINCE`; la clôture centrale est `CLOTUREE_CENTRAL`. | `distributions_provinciales(id, province_id, statut, date_prevue, date_declaration_fin)`; historique de statuts; `clotures_distribution`. | **Actuel :** `COUNT(*)` de toutes les distributions filtrées, sans filtre de statut; période par `date_prevue`. **Proposition :** `COUNT(DISTINCT d.id)` avec `date_declaration_fin IS NOT NULL` et statut courant `TERMINEE_PROVINCE` ou `CLOTUREE_CENTRAL`; période sur la date de déclaration. Garder à part le sous-total clôturé central si l’administration veut distinguer contrôle et réalisation. | Lecture nationale : `ADMIN_CENTRAL` et `PROPRIETAIRE` selon la route actuelle. `DELEGUE_PROVINCIAL` : province issue de la session uniquement. Déclaration par délégué; clôture par `ADMIN_CENTRAL`. | Faible avec `COUNT(DISTINCT id)`. Les retours pour correction doivent être exclus tant qu’ils ne sont pas resoumis à l’état terminé. | **À approuver.** Le schéma n’a pas d’état `ANNULEE`; une annulation ne peut pas être explicitement exclue ou comptabilisée. Confirmer la date de référence et le traitement d’une opération retournée. |
| **Distributions en cours** | Opérations non déclarées terminées, avec séparation des brouillons et des corrections. | `distributions_provinciales.statut`; `historique_statuts`; `demandes_correction`. | **Actuel :** aucun KPI isolé; `operations_en_attente` compte chaque distribution dont le statut n’est pas `CLOTUREE_CENTRAL` et y ajoute les approvisionnements non clos. Cela inclut brouillons et opérations déjà terminées par la province. **Proposition :** compter distinctement les distributions `EN_PREPARATION`, `VALIDEE_PROVINCE`, `EN_EXECUTION`; publier `RETOURNEE_POUR_CORRECTION` dans une catégorie « corrections à traiter » distincte. Exclure `BROUILLON`, `TERMINEE_PROVINCE`, `CLOTUREE_CENTRAL`. | Délégué pour les opérations de sa province; central autorisé pour synthèse nationale et suivi des retours/clôtures. | Faible par identifiant; risque de mauvais classement fonctionnel si brouillon, correction et exécution sont additionnés. | **À approuver.** Valider si les retours pour correction sont « en cours » ou une file distincte. Pas d’état d’annulation dans le schéma. |
| **Ménages bénéficiaires** | Nombre de ménages distincts ayant reçu une quantité positive dans la période; distinguer bénéficiaires des ménages simplement ciblés. | `remises_distribution`, `lignes_remise`, `menages_distribution`, `menages`, `distributions_provinciales`. Les lignes de remise matérialisent les articles réellement délivrés. | **Actuel :** `menages_cibles_uniques` compte les ménages de toutes les distributions filtrées; `menages_servis_uniques`/`menages_partiellement_servis_uniques` s’appuient sur `statut_service`, mais sans exiger une distribution terminée. Période par date prévue de l’opération. **Proposition :** `COUNT(DISTINCT rd.menage_id)` avec `EXISTS` une ligne de remise `quantite_remise > 0`, distribution dans l’état approuvé de réalisation et date `rd.date_remise` dans la période. Afficher séparément ménages ciblés, ménages avec remise complète et ménages avec remise partielle si la règle de priorité est acceptée. | Le délégué enregistre les remises de sa province; l’accès au KPI reste borné par le périmètre serveur. Pas de noms, téléphone, identifiant ménage ni détail de remise dans le payload carte. | Un même ménage peut être aidé dans plusieurs distributions. `DISTINCT province_id, menage_id` le compte une fois dans la période; les occurrences de remise restent un autre indicateur. | **Définition calculable, à approuver.** Confirmer que toute remise positive, même partielle, constitue un ménage bénéficiaire et que le décompte est unique sur toute la période sélectionnée. |
| **Personnes bénéficiaires** | Le modèle conserve la taille du ménage, pas une remise d’aide par personne identifiée. Le nombre individuel réellement assisté n’est donc pas établi par les remises actuelles. | `menages.nombre_personnes`; `membres_menage`; remise enregistrée au niveau `menage_id`, sans lien de livraison individuel dans `lignes_remise`. | **Actuel :** `personnes_assistees_menages_uniques` somme `MAX(nombre_personnes)` une fois par ménage ayant un statut `SERVI` ou `PARTIELLEMENT_SERVI`; `personnes_assistees_cumulees` répète l’effectif à chaque occurrence de remise. Aucun des deux ne prouve que tous les membres ont reçu l’aide. **Proposition conditionnelle :** seulement après accord, libeller « Personnes recensées dans les ménages bénéficiaires (estimation) » et sommer une fois `nombre_personnes` par ménage avec remise positive; sinon ne pas publier de KPI personnes. | Même périmètre serveur provincial/national. N’envoyer aucune donnée nominative de `membres_menage` au frontend cartographique. | Élevé : répétition du ménage entre distributions; effectif déclaré peut évoluer; remise partielle ne signifie pas que chaque personne a reçu quelque chose. | **BLOQUÉ.** Approbation nécessaire du libellé « estimation », de la règle de ménage unique et du traitement des remises partielles. Sans cela, aucun KPI « personnes bénéficiaires ». |
| **Stocks disponibles** | Quantité immédiatement mobilisable à une date de photographie, par article et unité compatible; distincte des réservations et des stocks inutilisables. | `lots_stock(quantite_physique, quantite_reservee, etat_qualite, date_peremption, province_id, article_id, entrepot_id)`; contrôle de cohérence avec `soldes_stock`; `articles.unite_mesure_id`; `unites_mesure`. | **Actuel :** somme `quantite_physique - quantite_reservee` des lots `BON`, non périmés, obtenue depuis les soldes; la valeur agrégée mélange articles/unités. **Proposition :** par province et `article_id`, sommer `MAX(0, quantite_physique - quantite_reservee)` uniquement des lots `BON`, non périmés à la date de référence, dans les entrepôts autorisés; retourner l’unité de l’article. Comparer le résultat au solde correspondant et signaler l’incohérence, sans masquer l’écart. Ne jamais totaliser des unités ou articles différents. | Le rôle central consulte les provinces autorisées; le délégué ne reçoit que sa province. Les écritures restent soumises aux règles des services de stock. | Aucun doublon si le stock est agrégé une fois par lot puis par couple province/article. Risque actuel de somme inter-unités et de photographie comprise à tort comme historique. | **À approuver.** Exiger un filtre article (ou une liste de valeurs par article avec unité), valider la date de photographie et le traitement explicite d’un solde incohérent. |
| **Validations en attente** | Tâches de validation à accomplir, comptées par workflow, état et rôle approbateur; pas un total de toutes les opérations non closes. | États distincts : `distributions_provinciales`; `approvisionnements_centraux`; `partenaires.statut_validation`; référentiel territorial `statut_validation`; `demandes_correction.statut`; historiques de validation. | **Actuel :** aucun compte de validation unique. `operations_en_attente` = distributions non clôturées + approvisionnements non clôturés. `lireSyntheseControle` sépare opérations en cours, distributions à clôturer, observations et corrections ouvertes, mais n’est pas un registre universel des demandes de validation par province. **Proposition :** compteurs séparés par workflow et état; pas de total combiné avant définition des files. Exemples : une correction `CORRECTION_SOUMISE` relève du central; `EN_ATTENTE_DELEGUE` relève de la province. Un approvisionnement `BROUILLON` ne prouve pas qu’il a été soumis. | Approbateur variable : `ADMIN_CENTRAL` pour clôtures/corrections centrales, délégué pour validation provinciale, central pour partenaires et référentiel national. Accès central seulement si autorisé; délégué pour son propre périmètre. | Élevé si une même distribution compte comme validation, opération en cours et clôture à traiter; les rôles n’ont pas la même file. | **BLOQUÉ.** Faire approuver la liste des workflows, leurs états « soumis/en attente », l’autorité et le dédoublonnage avant de calculer. |

### Événement d’achèvement et limites des états

La machine de distribution permet `EN_EXECUTION → TERMINEE_PROVINCE`; cette transition écrit `date_declaration_fin` et correspond à la déclaration de fin par le délégué. L’administration centrale peut ensuite effectuer `TERMINEE_PROVINCE → CLOTUREE_CENTRAL` après contrôle du PV, des remises, des corrections, des observations et de la cohérence de stock. La clôture est donc un contrôle administratif postérieur à l’exécution, pas l’événement physique de remise.

Le schéma des distributions accepte `BROUILLON`, `EN_PREPARATION`, `VALIDEE_PROVINCE`, `EN_EXECUTION`, `TERMINEE_PROVINCE`, `RETOURNEE_POUR_CORRECTION`, `CLOTUREE_CENTRAL`; il ne possède pas de statut d’annulation. Une date prévue ne doit pas être présentée comme date d’exécution. Une future définition temporelle doit choisir entre date de déclaration de fin (KPI d’opération) et `remises_distribution.date_remise` (KPI de ménages servis).

## 2. Contrat API proposé — à ne pas implémenter avant validation

### Réutilisation

Le candidat est le chemin existant `GET /api/rapports/tableau-de-bord`, déjà authentifié et soumis à `csrfSessionMiddleware` et aux rôles `PROPRIETAIRE`, `ADMIN_CENTRAL`, `DELEGUE_PROVINCIAL`. Il applique `appliquerPerimetreUtilisateur()` côté service avant les lectures D1. Pour un délégué, `province_id` est imposé par la session; un filtre différent est refusé en `403`.

La réutilisation ne sera sûre qu’après approbation des formules. Proposition d’évolution additive — sans modification de `provinces` existant ni nouvelle route : ajouter un objet `carte` dont les lignes sont groupées par `province_id` SIGAD explicite. L’administration autorisée reçoit au plus les 23 agrégats; le délégué reçoit exactement l’agrégat de sa province. La jointure frontend est faite exclusivement par `province_id` via la correspondance versionnée P-code OCHA ↔ ID SIGAD; ni le nom seul, ni un point/coordonnée dans le polygone ne détermine une province statistique.

```http
GET /api/rapports/tableau-de-bord?date_debut=AAAA-MM-JJ&date_fin=AAAA-MM-JJ&province_id=prov-sila&article_id=...
```

`article_id` est un paramètre proposé, non reconnu par le schéma strict actuel. Il ne sera ajouté qu’après approbation. `province_id` reste réservé aux rôles centraux; les filtres de période sont appliqués aux dates d’événement du KPI, tandis que le stock est une photographie et porte sa propre date de calcul. Un filtre unique ne doit pas être silencieusement interprété différemment selon les indicateurs.

Schéma JSON proposé, avec valeurs nulles et disponibilité explicites :

```json
{
  "carte": {
    "referentiel": {
      "source": "OCHA/HDX COD-AB v01",
      "statut": "INDICATIF_NON_HOMOLOGUE",
      "correspondance": "SIGAD_ID_ET_PCODE_VERSIONNES"
    },
    "periode": { "date_debut": null, "date_fin": null },
    "date_photographie_stock": "AAAA-MM-JJ",
    "provinces": [
      {
        "province_id": "prov-sila",
        "indicateurs": {
          "distributions_realisees": { "valeur": 0, "unite": "opération", "etat": "DISPONIBLE" },
          "distributions_en_cours": { "valeur": 0, "unite": "opération", "etat": "DISPONIBLE" },
          "menages_beneficiaires": { "valeur": null, "unite": "ménage", "etat": "AUCUNE_DONNEE" },
          "personnes_beneficiaires": { "valeur": null, "unite": "personne", "etat": "INDISPONIBLE" },
          "stock_disponible": { "valeur": null, "unite": null, "etat": "ARTICLE_REQUIS" },
          "validations_en_attente": { "valeur": null, "unite": "demande", "etat": "DEFINITION_NON_APPROUVEE" }
        }
      }
    ],
    "ressources_d1": { "lignes_lues": 0, "duree_requetes_ms": 0 }
  }
}
```

Les zéros ci-dessus ne sont qu’un exemple de contrat, pas des chiffres livrés. En production, `0` ne sera renvoyé que si le calcul et la source sont valides et qu’aucun événement ne correspond. `AUCUNE_DONNEE`, `INDISPONIBLE`, `ARTICLE_REQUIS` et `DEFINITION_NON_APPROUVEE` portent `valeur: null`; ils ne seront jamais convertis en zéro par React. Aucun nom de ménage, téléphone, membre, remise détaillée ou identifiant personnel ne figure dans le schéma cartographique.

### Filtres, rôles et bornes

| Élément | Contrat proposé |
|---|---|
| Méthode / chemin | `GET /api/rapports/tableau-de-bord` existant; objet carte ajouté seulement après validation. Pas de nouvelle route autorisée par ce rapport. |
| Dates | `date_debut`, `date_fin`, ISO `AAAA-MM-JJ`; les distributions utilisent `date_declaration_fin`, les remises `date_remise`; le stock indique une photographie courante et ne prétend pas être historique. |
| Province | Filtre explicite uniquement pour les rôles centraux autorisés. Pour le délégué, valeur de session obligatoire et toute tentative interprovinciale rejetée avant les SELECT. |
| Matière | `article_id` proposé pour le stock; l’article détermine une seule unité. Pour distributions/ménages, appliquer le filtre matière seulement via existence d’une ligne de remise de cet article, après accord. |
| Partenaire / nature | Filtres existants conservés pour les KPI et domaines auxquels ils s’appliquent; ne pas les présenter comme filtres universels des six KPI sans définir le rôle de partenaire source/exécution/bailleur. |
| Pagination | Pas de pagination de l’agrégat cartographique : maximum 23 lignes nationales, une ligne provinciale. Les listes de référence restent paginées séparément; ne pas limiter un agrégat à 100 comme substitut de périmètre. |
| Accès | `ADMIN_CENTRAL`/`PROPRIETAIRE` conformément à la politique explicitement approuvée pour le national; `DELEGUE_PROVINCIAL` pour sa seule province. Autorisation backend, jamais filtrage React du jeu national. |
| Erreurs | `400` filtre invalide, `401` session absente/expirée, `403` rôle ou province interdite; aucun payload partiel national à un délégué. |

## 3. SQL envisagé et coût D1

Les extraits suivants décrivent les règles candidates, pas des requêtes déployées. Les paramètres de périmètre doivent être calculés depuis la session avant binding.

### Distributions réalisées / en cours

```sql
WITH perimetre AS (
  SELECT id, province_id, statut, date_declaration_fin
  FROM distributions_provinciales
  WHERE (? IS NULL OR province_id = ?)
)
SELECT province_id,
  COUNT(DISTINCT CASE
    WHEN statut IN ('TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL')
     AND date_declaration_fin IS NOT NULL
     AND (? IS NULL OR date(date_declaration_fin) >= ?)
     AND (? IS NULL OR date(date_declaration_fin) <= ?) THEN id END) AS distributions_realisees,
  COUNT(DISTINCT CASE
    WHEN statut IN ('EN_PREPARATION', 'VALIDEE_PROVINCE', 'EN_EXECUTION') THEN id END) AS distributions_en_cours,
  COUNT(DISTINCT CASE WHEN statut = 'RETOURNEE_POUR_CORRECTION' THEN id END) AS corrections_a_traiter
FROM perimetre
GROUP BY province_id;
```

Pour « en cours », la période doit être définie à partir d’une date d’entrée dans l’état (historique) si l’on veut mesurer un flux sur une période. Le SQL d’exemple est une photographie d’état et ne filtre donc pas ces opérations sur `date_prevue`.

### Ménages et personnes estimées

```sql
WITH menages_avec_remise AS (
  SELECT DISTINCT d.province_id, rd.menage_id
  FROM remises_distribution rd
  JOIN distributions_provinciales d ON d.id = rd.distribution_id
  WHERE (? IS NULL OR d.province_id = ?)
    AND date(rd.date_remise) >= ? AND date(rd.date_remise) <= ?
    AND d.statut IN ('TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL')
    AND EXISTS (
      SELECT 1 FROM lignes_remise lr
      WHERE lr.remise_id = rd.id AND lr.quantite_remise > 0
    )
), menages_eligibles AS (
  SELECT mr.province_id, mr.menage_id, MAX(m.nombre_personnes) AS nombre_personnes
  FROM menages_avec_remise mr
  JOIN menages m ON m.id = mr.menage_id AND m.province_id = mr.province_id
  GROUP BY mr.province_id, mr.menage_id
)
SELECT province_id, COUNT(*) AS menages_beneficiaires,
  SUM(nombre_personnes) AS personnes_estimees
FROM menages_eligibles
GROUP BY province_id;
```

Cette CTE déduplique avant le `COUNT` et la somme, y compris lorsqu’un ménage possède plusieurs remises ou plusieurs lignes d’article. Les personnes estimées restent bloquées jusqu’à accord de libellé et de règle. Pour un filtre matière approuvé, l’`EXISTS` doit être limité à l’`article_id` demandé avant de dédupliquer.

### Stock disponible par article

```sql
SELECT l.province_id, l.article_id, a.unite_mesure_id,
  SUM(l.quantite_physique - l.quantite_reservee) AS quantite_disponible
FROM lots_stock l
JOIN entrepots e ON e.id = l.entrepot_id AND e.actif = 1
  AND e.niveau = 'PROVINCIAL' AND e.province_id = l.province_id
JOIN articles a ON a.id = l.article_id AND a.actif = 1
WHERE (? IS NULL OR l.province_id = ?)
  AND l.article_id = ?
  AND l.etat_qualite = 'BON'
  AND (l.date_peremption IS NULL OR date(l.date_peremption) >= date('now'))
  AND l.quantite_physique > l.quantite_reservee
GROUP BY l.province_id, l.article_id, a.unite_mesure_id;
```

Avant d’afficher le résultat, vérifier dans la même lecture que `soldes_stock` correspond à la somme des lots pour l’article/entrepôt; retourner un état incohérent plutôt qu’un total présenté comme exact. Le filtre article évite les additions de kg, litres, sacs, cartons et pièces. Une période ne s’applique pas à cette photographie sans historique d’état des lots.

### Validations

Pas de SQL unique approuvé. Il faut des sous-agrégats nommés par workflow/état/approbateur, puis une jointure par `province_id`. Ne pas compter `BROUILLON` comme demande soumise par simple inférence. `demandes_correction` doit distinguer `EN_ATTENTE_DELEGUE` de `CORRECTION_SOUMISE`; `partenaires` et territoires `PROPOSE` ont des autorités différentes. Les demandes sans `province_id` (référentiel national) doivent être séparées d’une file provinciale.

### Coût et index

- Le endpoint actuel exécute trois SELECT dans un `db.batch` : synthèse, série mensuelle (résultat borné à 12 mois), et agrégat provincial (au plus 23 provinces actives, la limite SQL actuelle est 100). La synthèse est un agrégat d’une ligne, non une liste paginée; sa lecture sous-jacente n’est pas bornée par `LIMIT`.
- Une extension peut remplacer/enrichir le SELECT provincial et garder trois statements; il ne faut pas exécuter une requête par province. Un sous-agrégat de validations peut ajouter un quatrième SELECT si son contrat l’exige. Aucun coût de cette proposition n’est mesuré car la requête n’existe pas.
- Les index pertinents observés comprennent `idx_dist_prov_statut`, `idx_distributions_date_rapport`, `idx_menages_dist_statut`, les contraintes uniques de remise/ménage, `idx_soldes_stock_prov` et `idx_lots_stock_fefo`. Le plan final doit être testé avec les filtres réels et une cardinalité réaliste, notamment la relation remise → ménage et les lots par article.
- Base de comparaison UI-MAP 1.2 (acceptation synthétique locale seulement) : 513 lignes D1 lues / 1 ms cumulé dans un cas provincial et 624 / 1 ms dans un cas central mobile. Ces chiffres décrivent l’ancien dashboard, ne sont ni un benchmark des SQL candidats ni une estimation de quota/production.
- Avant implémentation : capturer `EXPLAIN QUERY PLAN`, `rows_read`, `rows_written`, la durée D1 et le temps Worker pour 1, 23 provinces, périodes courtes/longues, nombreux ménages/remises et plusieurs milliers de lots. Les tables agrégées/index ou cache ne sont pas proposés sans mesures.

## 4. Sécurité, données et carte

| Contrôle | Résultat d’audit |
|---|---|
| Isolation Sila ↔ Ouaddaï | Tests d’intégration existants : chaque délégué reçoit une seule ligne provinciale issue de sa session; le filtre de l’autre province renvoie `403`. La limitation est appliquée dans `lireTableauDeBordRapports()` avant les SELECT. |
| Agrégat national | Route existante autorise `ADMIN_CENTRAL` et `PROPRIETAIRE`; l’accès au national doit rester réservé aux rôles explicitement approuvés. Les tests de compte central obtiennent `perimetre=NATIONAL`; aucun rôle provincial ne reçoit ces 23 lignes. |
| Données nominatives | `CarteProvincesTchad` reçoit le compte authentifié, mais pas de liste de ménages ni de détails de remises. L’API dashboard renvoie des nombres/labels d’agrégats; le contrat carte proposé n’expose aucun identifiant ménage ou personne. |
| Jointure géographique | À faire par `province_id` SIGAD explicite et table versionnée P-code ↔ ID SIGAD; pas de spatial join ou de point-in-polygon. La géométrie demeure indicative et non homologuée. |
| Zéro / absence | Le contrat proposé distingue valeur calculée zéro, aucune observation et KPI indisponible. Pas de conversion d’un `null` en zéro. |
| Filtres auxiliaires | `GET /api/rapports/filtres` limite provinces, localités et distributions pour le délégué, mais sa requête partenaires retourne actuellement jusqu’à 100 partenaires validés sans filtre de province. Ce ne sont pas des statistiques ni des données nominatives; examiner le moindre privilège avant d’ajouter ces options au sélecteur cartographique. |

Le chargement de la carte ne contient que les polygones OCHA et les métadonnées publiques de province. Les valeurs statistiques restent indisponibles; le navigateur ne reçoit donc aucun agrégat national à filtrer pour un délégué. L’intégration future devra maintenir cette propriété côté serveur, quel que soit le mode de sélection React.

## 5. Tests synthétiques et résultats

Les suites exécutées valident la base de code et le comportement actuel; elles ne transforment pas les formules proposées en règle métier approuvée.

| Contrôle | Scénario couvert / constat | Résultat |
|---|---|---|
| Typecheck | `npm run typecheck` (Wrangler types puis `tsc --noEmit`) | **PASS**, sortie 0. Wrangler signale un `EPERM` non bloquant en écrivant un log utilisateur dans l’environnement isolé; génération et `tsc` aboutissent. |
| Build | `npm run build` | **PASS**, Vite 8.3.5 et PWA générés. |
| Unit tests | `npm run test:unit` | **PASS**, 9 fichiers, 36 tests. |
| Matrice RBAC statique | `npm run test:security-matrix` | **PASS**, matrice synchronisée avec 140 routes API déclarées. |
| Schéma local | `npm run db:verifier` | **PASS**, SQLite neuf : 21 migrations, 65 tables, FK/CHECK/UNIQUE, index et triggers vérifiés. Ce contrôle ne migre aucune base distante. |
| D1 / Worker / R2 | `npm run test:e2e` (précontrôle d’intégration inclus, Wrangler local) | **PASS**, 21 tests d’intégration : Worker d’authentification (2), matrice de sécurité (1), stocks (1), approvisionnements (1), distributions (10), rapports (6). Worker, D1 et R2 de test sont locaux. Mesures liste ménages : 502/1 500/5 000 enregistrements, 10 mesures après échauffement pour chaque taille; médianes 52,58/54,40/47,69 ms; P95 61,35/68,61/74,99 ms. `EXPLAIN QUERY PLAN` confirme `idx_menages_province_statut_date`. La précédente erreur Workerd sandbox n’a pas été reproduite dans cette exécution locale. |
| Playwright / Chrome | `npm run test:e2e` | **PASS**, 11/11 tests, Chrome réel, Worker/D1 locaux. La suite couvre les 2 tests de carte, les 6 modules administratifs, les rôles central/provincial, filtres/exports, états Loading/Empty/Error et parcours opérationnel. DevTools confirme le chargement effectif de DM Sans. |
| Distinct ménages / plusieurs articles | Le test d’intégration rapports utilise un jeu synthétique `SERVI`, `PARTIELLEMENT_SERVI`, `NON_SERVI` et deux articles; il vérifie deux occurrences bénéficiaires, pas quatre. Le même test met le plan de distribution en `BROUILLON`, révélant que le total actuel « distributions » l’inclut. | **PASS caractérisation du code actuel; FAIL sémantique si ce total est présenté comme réalisé.** |
| Plusieurs distributions d’un ménage | Pas de fixture d’acceptation dédiée au doublon inter-distributions dans la suite de rapport actuelle. | **PARTIAL — test à ajouter après approbation de la règle de période/dédoublonnage.** |
| Annulation | Aucun statut `ANNULEE` ni transition d’annulation dans le schéma actuel. | **BLOCKED par le modèle; aucun test de calcul possible sans changer le schéma/règle.** |
| Stock réservé / non utilisable / unités | Les services de stock ont des tests FEFO/qualité/réservation et l’état des stocks vérifie égalité lots ↔ soldes; aucun test de l’agrégat dashboard démontrant une unité cohérente entre articles n’existe. | **PARTIAL — tests stock génériques présents; KPI agrégé non approuvable.** |
| Validations soumises / déjà approuvées | Tests de workflows existent, mais aucune définition universelle ni fixture de synthèse couvrant les différentes autorités. | **BLOCKED jusqu’à approbation des workflows composant le KPI.** |
| Carte / avertissement juridique | Les deux tests `tests/e2e/carte-tchad.spec.ts` passent dans Chrome; contrôle de la mention exacte, du périmètre provincial et des propriétés GeoJSON sans champs de ménages/bénéficiaires/distributions/stocks/indicateurs. | **PASS — 2/2 tests de carte.** |
| `git diff --check` | Contrôle exécuté après les modifications. | **PASS**, code de sortie 0; Git a seulement signalé des conversions de fins de ligne LF/CRLF dans la copie de travail. |

### Limites d’acceptation

Les tests SQL et les tests fonctionnels de stock ne prouvent pas la sémantique des KPI au niveau carte. Aucun KPI ambigu n’est affiché ou transmis à la carte dans cette livraison. Les cas qui exigent une catégorie « annulée » ou une autorité de validation consolidée restent explicitement non testables avec le modèle accepté actuel.

## 6. Fichiers touchés

- `frontend/src/components/pilote/CarteProvincesTchad.tsx` — mention juridique exacte, sans modification du GeoJSON ni du chargement des données.
- `tests/e2e/carte-tchad.spec.ts` — assertion Playwright de la mention et absence de données statistiques personnelles dans les propriétés GeoJSON.
- `tests/e2e/ui-preview.spec.ts` — mise à jour de l’attendu E2E pour la mention juridique harmonisée; aucune nouvelle donnée statistique n’est introduite.
- `docs/UI_MAP_1_3_KPI_CONTRACT.md` — présent audit, définitions candidates, contrat proposé, SQL et coûts.

**Aucun changement** de route, service API, schéma D1, migration, RBAC, données, ressources Cloudflare ou référence territoriale n’est apporté. Aucun commit ni push n’est fait.

## 7. Décisions attendues avant développement statistique

1. Confirmer « réalisée » au moment de la déclaration provinciale (`TERMINEE_PROVINCE`) ou seulement après clôture centrale (`CLOTUREE_CENTRAL`); décider du traitement d’un retour pour correction et de l’absence d’état d’annulation.
2. Confirmer les états composant « en cours » et isoler la file « corrections à traiter ».
3. Confirmer que « ménage bénéficiaire » signifie un ménage avec une remise positive, dédupliqué par ménage sur la période, et que les remises partielles comptent.
4. Approuver ou rejeter le libellé estimatif des personnes recensées dans ces ménages. Sans approbation, le KPI personnes reste masqué/indisponible.
5. Choisir la matière par `article_id`; décider si l’interface affiche une valeur par unité/article plutôt qu’une somme inter-unités.
6. Définir les workflows et états d’une validation en attente, l’autorité compétente et le périmètre d’agrégation. Sans cette liste, ne pas produire le KPI.
7. Confirmer que `PROPRIETAIRE`, en plus de `ADMIN_CENTRAL`, est autorisé à consulter la synthèse nationale cartographique.

Après ces décisions, les tests dédiés aux scénarios acceptés pourront être ajoutés, puis l’extension additive du contrat existant proposée pour une seconde approbation avant implémentation. Jusqu’alors : **UI-MAP 1.3 = PARTIAL**.
