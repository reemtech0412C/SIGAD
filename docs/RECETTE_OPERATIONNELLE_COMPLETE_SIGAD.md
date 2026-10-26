# SIGAD — Recette opérationnelle complète et intégrale de bout en bout

**Référence :** Chantier 06 — Programme intégral de refonte SIGAD  
**Statut :** PASS (Vérifié et validé localement)  
**Date :** 25 octobre 2026  
**Environnement d'exécution :** Local SQLite D1 isolé / In-Memory (31 migrations versionnées)  
**Test automatisé de référence :** [recette-operationnelle-complete.test.mjs](file:///C:/Users/Lenovo/Downloads/SIGAD/tests/unit/recette-operationnelle-complete.test.mjs)

---

## 1. Objectif et périmètre de la recette

L'objectif du Chantier 06 est d'apporter la preuve formelle et vérifiable du fonctionnement intégré de l'ensemble de la chaîne opérationnelle de SIGAD, depuis la décision stratégique centrale jusqu'à la remise physique de vivres aux ménages dans les provinces du Tchad, conformément à l'Arrêté n°0033/PR/PM/MASSNAH/SG/2026.

La recette a été menée sur des **données entièrement fictives et sécurisées**, garantissant une étanchéité absolue vis-à-vis des données réelles et des environnements distants (Staging / Production).

---

## 2. Matrice d'exécution des 21 étapes opérationnelles

| N° | Étape opérationnelle | Acteur responsable | Tables D1 et colonnes modifiées | État initial → final | Preuve de validation | Résultat |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: |
| **01** | **Création de l'opération centrale** | `ADMIN_CENTRAL` (`usr-central`) | `operations_centrales_distribution` | Néant → `BROUILLON` | Code unique généré `OPC-2026-RECETTE-E2E`, année 2026, source ONASA | **PASS** |
| **02** | **Ciblage multi-provincial** | `ADMIN_CENTRAL` | `operations_centrales_provinces` | 0 → 2 provinces liées | Ouaddaï (50 t) et Sila (50 t) rattachées avec consignes locales | **PASS** |
| **03** | **Définition objectifs & critères** | `ADMIN_CENTRAL` | `operations_centrales_distribution` | Prévisions renseignées | 2 000 ménages, 12 000 personnes, critères pauvreté extrême | **PASS** |
| **04** | **Enregistrement des actes d'approbation** | `ADMIN_CENTRAL` / Gouvernance | `approbations_operations` | 0 → 2 actes officiels | PV Comité Pilotage `PV-CNP-2026-03` + Arrêté Ministériel n°042 | **PASS** |
| **05** | **Approbation et ouverture centrale** | `ADMIN_CENTRAL` | `operations_centrales_distribution` | `BROUILLON` → `APPROUVEE` → `OUVERTE` | Transitions d'état autorisées et validées par déclencheurs | **PASS** |
| **06** | **Instanciation des dossiers provinciaux** | Système / Central | `dossiers_execution_provinciaux` | 2 dossiers créés | `DOS-REC-OUA-2026` et `DOS-REC-SIL-2026` au statut `ASSIGNE` | **PASS** |
| **07** | **Vérification de la localisation ciblée** | `DELEGUE_PROVINCIAL` | `localites`, `quartiers`, `carres` | Hiérarchie urbaine vérifiée | Ville d'Abéché (`loc-abeche`) + Quartier Djar-El-Goz + Carré | **PASS** |
| **08** | **Enregistrement des ménages éligibles** | `SUPERVISEUR_TERRAIN` | `menages` | 2 ménages inscrits | Chefs F et M, composition 6 et 7 pers., catégories vérifiées | **PASS** |
| **09** | **Contrôle et arbitrage des doublons** | `DELEGUE_PROVINCIAL` | Moteur de déduplication SIGAD | Contrôle d'unicité | Zéro doublon sur téléphone et composition familiale | **PASS** |
| **10** | **Validation administrative de la liste** | `DELEGUE_PROVINCIAL` (`usr-ouaddai`) | `listes_beneficiaires`, `inscriptions_beneficiaires` | `BROUILLON` → `PRETE` → `VERROUILLEE` | Liste `LST-REC-OUA-2026-01` scellée pour la distribution | **PASS** |
| **11** | **Allocation et expédition centrale** | `ADMIN_CENTRAL` | `approvisionnements_centraux`, `expeditions`, `lignes_expedition` | `BROUILLON` → `VALIDEE` → `EN_ROUTE` | Convoi `EXP-REC-E2E-001` expédiant 100 sacs de Sorgho (lot FEFO) | **PASS** |
| **12** | **Constat de réception physique** | `RESPONSABLE_STOCK` (`usr-ouaddai`) | `receptions_stock`, `receptions_provinciales` | `EN_ROUTE` → `RECEPTIONNEE` | Réception contradictoire 100 sacs au magasin d'Abéché | **PASS** |
| **13** | **Entrée officielle en stock provincial** | `RESPONSABLE_STOCK` | `lots_stock` (lot provincial créé) | 100 sacs disponibles | Lot `LOT-SOR-REC-01` créé avec expiration 31/12/2027 | **PASS** |
| **14** | **Planification & réservation des rations** | `DELEGUE_PROVINCIAL` | `distributions_provinciales`, `articles_distribution` | `EN_PREPARATION` → `VALIDEE_PROVINCE` | 2 sacs réservés (1 sac/ménage), ménages convoqués `EN_ATTENTE` | **PASS** |
| **15** | **Exécution terrain et remises** | `AGENT_DISTRIBUTION` | `distributions_provinciales`, `menages_distribution` | `VALIDEE_PROVINCE` → `EN_EXECUTION` | Statut service passé à `SERVI` avec horodatage | **PASS** |
| **16** | **Traitement des cas et émargements** | `AGENT_DISTRIBUTION` | `menages_distribution` | Émargement contradictoire | Pointage individuel vérifié sans anomalie | **PASS** |
| **17** | **Décrémentation unique du stock** | `RESPONSABLE_STOCK` | `lots_stock` | 100 → 98 sacs en stock | Sortie physique exacte de 2 sacs sans double imputation | **PASS** |
| **18** | **Clôture provinciale de la distribution** | `DELEGUE_PROVINCIAL` | `distributions_provinciales`, `dossiers_execution_provinciaux` | `EN_EXECUTION` → `TERMINEE_PROVINCE` | Dossier provincial `RAPPORT_TRANSMIS` avec bilan chiffré | **PASS** |
| **19** | **Consolidation nationale des bilans** | `ADMIN_CENTRAL` | `operations_centrales_distribution` | `OUVERTE` → `EN_CONSOLIDATION` | Agrégation nationale : 2 ménages servis, 2 sacs vivres | **PASS** |
| **20** | **Édition des pièces et archivage audit** | Système SIGAD | `journaux_audit` | Traçabilité complète | Pistes d'audit scellées et cohérentes | **PASS** |
| **21** | **Clôture administrative définitive** | `ADMIN_CENTRAL` / Comité | `operations_centrales_distribution` | `EN_CONSOLIDATION` → `CLOTUREE` | Clôture finale de la campagne d'assistance | **PASS** |

---

## 3. Variantes opérationnelles et tests de robustesse

1. **Cloisonnement interprovincial :** Le délégué du Sila (`usr-sila`) ne peut ni lire ni modifier la distribution de l'Ouaddaï (requête filtrée à 0 enregistrement, HTTP 403 en API).
2. **Consultation institutionnelle :** Les profils d'audit observateur sont strictement limités au verbe HTTP `GET` ; toute tentative de mutation est rejetée à la racine par le middleware RBAC.
3. **Séparation des fonctions incompatibles :** L'agent distributeur ne peut pas signer le procès-verbal de réception de stock, et le magasinier ne peut pas valider administrativement la liste de ciblage.
4. **Intégrité territoriale :** Les ménages ne peuvent être rattachés qu'à des subdivisions géographiques existantes et actives de leur province.

**Verdict global du Chantier 06 : PASS (100% des étapes validées)**
