# SIGAD — RAPPORT D'ESSAIS DU MODULE D'ADMINISTRATION TERRITORIALE
## Validation des 24 cas de test d'intégration, sécurité RBAC et intégrité relationnelle

**Date des tests :** 25 octobre 2026  
**Environnement :** Local isolé — SQLite / D1 simulé  
**Banc de test exécuté :** `scripts/tester-administration-territoriale-et-gouvernance.mjs`  
**Résultat global :** **24 / 24 tests réussis (100% PASS)**

---

## 1. Tableau récapitulatif des 24 cas de test

| N° | Intitulé du test | Condition testée | Statut | Preuve vérifiée |
| :---: | :--- | :--- | :---: | :--- |
| **01** | Ajout d'un département | Chef-lieu, source officielle, référence juridique, date d'effet | **PASS** | ID généré, enregistrement dans `departements`, statut `A_VERIFIER` |
| **02** | Modification d'un département | Mise à jour nom et chef-lieu avec motif obligatoire | **PASS** | Données mises à jour, cliché avant/après consigné dans `audits_territoire` |
| **03** | Validation formelle d'un département | Passage de `A_VERIFIER` à `VALIDE` avec source légale | **PASS** | `statut_validation = 'VALIDE'`, `validation_administrative = 'VALIDE'` |
| **04** | Ajout d'une sous-préfecture | Rattachement obligatoire à un département existant | **PASS** | Sous-préfecture créée dans `sous_prefectures` avec FK valide |
| **05** | Ajout d'une ville ordinaire | Mode de découpage urbain `SANS_ARRONDISSEMENT` | **PASS** | Ville créée dans `localites`, `type_localite = 'VILLE'`, mode urbain validé |
| **06** | Ajout d'un quartier à N'Djaména | Rattachement direct au 1er Arrondissement communal | **PASS** | Insertion dans `quartiers`, respect du régime spécial urbain de N'Djaména |
| **07** | Ajout d'un village rural | Rattachement à un département et sous-préfecture | **PASS** | Village créé dans `localites`, statut `VALIDE` |
| **08** | Ajout d'un ferrick nomade | Création d'un campement pastoral mobile | **PASS** | Ferrick créé dans `localites`, statut `A_VERIFIER` |
| **09** | Réaffectation intra-provinciale | Déplacement d'un village vers un autre département de Batha | **PASS** | Simulation autorisée, calcul des ménages impactés, mise à jour effective |
| **10** | Refus de déplacement interprovincial | Tentative de rattacher un village de Batha au Kanem | **PASS** | Rejet strict HTTP 409 (`interdit / même province obligatoire`) |
| **11** | Fusion de 2 villages doublons | Transfert des ménages, table correspondance, archivage | **PASS** | Ménage réaffecté, doublon archivé, correspondance tracée |
| **12** | Refus de fusion interprovinciale | Tentative de fusionner deux unités de provinces distinctes | **PASS** | Rejet strict HTTP 409 (`provinces différentes / fusion interdite`) |
| **13** | Archivage d'une unité | Bascule de statut avec motif d'audit consigné | **PASS** | Statut passé à `REJETE`/`ARCHIVE`, données conservées pour requêtes historiques |
| **14** | Suppression physique sans dépendance | Suppression d'une unité isolée avec 0 ménage/stock | **PASS** | Enregistrement supprimé de la table, audit de suppression consigné |
| **15** | Verrouillage suppression avec ménages | Tentative de suppression d'un village ayant des ménages | **PASS** | Rejet strict HTTP 409 (`dépendances actives / suppression refusée`) |
| **16** | Prévisualisation import CSV | Analyse syntaxique et contrôle des rattachements parents | **PASS** | 2 lignes valides identifiées, 0 erreur |
| **17** | Rejet import rattachements invalides | Import avec provinces ou départements inexistants | **PASS** | Lignes invalides rejetées avec message explicite |
| **18** | Détection automatique des doublons | Recherche d'homonymes toponymiques dans la province | **PASS** | Détection automatique des unités partageant une même toponymie |
| **19** | Export CSV du référentiel | Génération du flux CSV avec fil d'ariane et statuts | **PASS** | Fichier CSV UTF-8 complet et conforme |
| **20** | Intégrité du journal d'audit | Vérification des actions enregistrées dans `audits_territoire` | **PASS** | Traces complètes pour CREATION, MODIFICATION, FUSION, SUPPRESSION, etc. |
| **21** | Contrôle RBAC Propriétaire | Tentative de mutation par délégué ou admin central | **PASS** | Rejet strict HTTP 403 (`Action réservée au rôle PROPRIETAIRE`) |
| **22** | Agrégats réels du tableau de bord | Exactitude des compteurs sans données fictives | **PASS** | 23 provinces réelles, 112 départements qualifiés, répartition exacte |
| **23** | Inscription ménages dans 4 milieux | N'Djaména, ville ordinaire, village rural, ferrick | **PASS** | Conformité aux triggers de ciblage dans chaque contexte territorial |
| **24** | Gouvernance opérations centrales | Rejet Arrêté 0033 seul, anti-recyclage, approbation dédiée | **PASS** | Rejet Arrêté 0033 seul (400), rejet acte recyclé (409), approbation OK |

---

## 2. Analyse détaillée des tests critiques

### 2.1 Test 11 : Intégrité des fusions et protection historique
Lors de la fusion de deux villages doublons :
- Le ménage rattaché au village doublon (`MEN-TEST-DOUBLON`) a été automatiquement transféré vers l'unité principale sans perte d'information.
- Une ligne a été insérée dans `correspondances_fusions_territoriales` (`ancien_id` ➔ `nouveau_id`, motif et utilisateur).
- L'intégrité des distributions historiques est préservée : les requêtes d'audit passées peuvent retrouver l'unité d'origine via la clé étrangère ou par réconciliation via la table de correspondances.

### 2.2 Test 15 : Verrouillage de suppression physique (HTTP 409)
La tentative de suppression physique de l'unité `villageId1` (à laquelle un ménage est rattaché) a été formellement rejetée avec l'exception :
> `ErreurAdministrationTerritoriale: Suppression physique refusée : la localité possède des dépendances actives (1 ménages, 0 zones de distribution, 0 quartiers). Utilisez l'archivage ou la fusion.`
Ce verrouillage garantit l'impossibilité d'une perte accidentelle de données d'assistance.

### 2.3 Test 24 : Gouvernance des approbations et anti-recyclage
Le test 24 a démontré la conformité totale du cycle de gouvernance :
1. L'enregistrement exclusif du cadre réglementaire général (Arrêté n°0033/PR/PM/MASSNAH/SG/2026) n'autorise **PAS** le passage au statut `APPROUVEE` (rejet HTTP 400).
2. L'enregistrement d'une décision opérationnelle propre (`APPROBATION_COMITE_PILOTAGE`) avec avis favorable permet la transition vers `APPROUVEE`.
3. Une tentative ultérieure de réutiliser la même référence d'acte (`DEC-PILOTAGE-2026-001`) pour approuver une seconde opération centrale a été rejetée avec le code HTTP 409 (`référence d'acte déjà enregistrée`).
