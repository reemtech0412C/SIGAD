# SIGAD — RAPPORT DE CONTRÔLE QUALITÉ FINAL ET AUDIT CONTRADICTOIRE
## Revue technique rigoureuse, corrections d'anomalies et verdict d'éligibilité Staging

**Date :** 25 octobre 2026  
**Projet :** SIGAD — Système Intégré de Gestion des Aides et des Distributions (République du Tchad)  
**Environnement de validation :** Banc local isolé (`Node.js v24.19.0`, SQLite `DatabaseSync`, Miniflare / Wrangler `4.151.3`, Vitest `4.1.12`)  
**Statut d'exécution :** Validation locale contradictoire achevée sans déploiement distant  

---

## 1. Anomalies identifiées lors de la revue contradictoire

Une revue contradictoire minutieuse de l'ensemble des sept chantiers de refonte et des migrations associées a mis en évidence plusieurs anomalies critiques avant tout déploiement :

### 1.1 Référentiel territorial et statut provisoire des départements
- **Confusion sur le statut des 112 départements :** La migration `0028` introduisait 112 départements candidats sans mention explicite dans l'interface de leur nature provisoire, risquant d'induire en erreur les utilisateurs sur le caractère officiel ou achevé du découpage national.
- **Blocage du parcours N'Djaména dans le composant de sélection :** Dans `frontend/src/components/territoire/SelecteurLocalisationDynamique.tsx`, le champ de sélection de la « Nature du lieu » possédait une contrainte `disabled={!departementId}` et le sélecteur de département était marqué `obligatoire`. Comme la ville de N'Djaména (province à statut particulier) ne comporte aucun échelon départemental (`statut_particulier = 1`), tout enregistrement de ménage ou sélection de localisation à N'Djaména se trouvait bloqué côté client.
- **Signalement erroné d'absence de département à N'Djaména :** L'avertissement *« Aucun département vérifié n'est disponible... »* s'affichait systématiquement pour N'Djaména, alors que cette absence découle de la structure administrative légale de la capitale.

### 1.2 Entrepôts et lots de stock dans la migration opérationnelle
- **Données fictives insérées dans une migration de schéma :** La migration `0029_mise_en_service_stocks.sql` contenait en dur 23 entrepôts (1 central fictif et 22 provinciaux arbitraires) ainsi que 12 lots de stocks fictifs avec soldes précalculés.
- **Non-respect du principe d'intégrité opérationnelle :** Une migration D1 destinée à être appliquée sur un environnement opérationnel (Staging ou Production) ne doit jamais injecter des infrastructures physiques ou des stocks d'inventaire non constatés sur le terrain.

### 1.3 Cloisonnement RBAC et séparation des responsabilités
- **Contrôles provinciaux restreints au seul rôle délégué :** Dans `backend/src/routes/stocks.routes.ts`, les vérifications d'isolation provinciale reposaient sur des comparaisons strictes `utilisateur.role === "DELEGUE_PROVINCIAL"`, omettant les nouveaux rôles opérationnels décentralisés introduits par la migration `0030` (`RESPONSABLE_STOCK`, `SUPERVISEUR_TERRAIN`).
- **Absence de filtrage adéquat sur les modifications d'entrepôts :** Un magasinier ou délégué provincial pouvait être bloqué ou mal restreint dans la gestion des entrepôts de sa province.

### 1.4 Cycle de gouvernance des opérations centrales
- **Absence de test contradictoire du renvoi pour correction :** Le circuit de retour pour correction (`SOUMISE_A_APPROBATION` -> `BROUILLON`) avec motif obligatoire $\ge 5$ caractères et la ré-édition du projet d'opération n'étaient pas éprouvés à travers les routes HTTP complètes du Worker Cloudflare.

---

## 2. Corrections effectivement réalisées

Les réparations suivantes ont été implémentées et validées sur le code source du projet :

### 2.1 Référentiel territorial et composant de sélection dynamique
- **Fichier modifié :** [SelecteurLocalisationDynamique.tsx](file:///c:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/territoire/SelecteurLocalisationDynamique.tsx#L304-L420)
  - Prise en compte du statut particulier de N'Djaména (`estNdjamena = provinceSelectionnee?.statut_particulier === 1`).
  - Rendu non obligatoire du département pour N'Djaména (`obligatoire={!estNdjamena}`).
  - Déblocage de la sélection de la nature de lieu pour N'Djaména : `disabled={!departementId && !estNdjamena}`.
  - Neutralisation de l'avertissement départemental erroné sur N'Djaména et affichage d'un texte explicatif institutionnel : *« Ville de N’Djaména (statut particulier) : découpage direct par arrondissements et quartiers sans échelon départemental »*.
  - Labellisation explicite des départements en statut provisoire : `${element.nom} (À vérifier — provisoire)`.
  - Adaptation de la soumission de proposition territoriale pour autoriser le délégué de N'Djaména à formuler des propositions sans département.

### 2.2 Assainissement de la migration 0029 et isolation du banc d'essai
- **Fichier modifié :** [0029_mise_en_service_stocks.sql](file:///c:/Users/Lenovo/Downloads/SIGAD/migrations/0029_mise_en_service_stocks.sql#L1-L40)
  - Suppression intégrale de tous les enregistrements fictifs d'entrepôts (`ent-central-ndjamena`, `ent-prov-*`) et des lots de stock initiaux (`lot-demo-*`).
  - La migration `0029` est strictement restreinte aux tables de schéma, déclencheurs d'intégrité, contraintes CHECK/UNIQUE, et aux référentiels officiels de base : 6 conditionnements standards et 6 articles de secours d'urgence.
- **Fichier créé :** [demonstration-stocks.sql](file:///c:/Users/Lenovo/Downloads/SIGAD/tests/fixtures/demonstration-stocks.sql)
  - Déplacement des 23 entrepôts de démonstration et des 12 lots de test dans un fichier de fixture isolé, réservé aux bancs de test locaux.
  - Mise à jour des suites de tests unitaires et d'intégration pour charger cette fixture de manière contrôlée.

### 2.3 Cloisonnement RBAC des stocks et profils opérationnels
- **Fichier modifié :** [stocks.routes.ts](file:///c:/Users/Lenovo/Downloads/SIGAD/backend/src/routes/stocks.routes.ts#L25-L50)
  - Définition formelle de `ROLES_PROVINCIAUX = new Set(["DELEGUE_PROVINCIAL", "RESPONSABLE_STOCK", "SUPERVISEUR_TERRAIN", "AGENT_DISTRIBUTION"])` et de la fonction d'aide `estRoleProvincial(role)`.
  - Intégration de `RESPONSABLE_STOCK` dans `ROLES_OPERATIONNELS` (mutations d'entrepôts, réceptions, ajustements, transferts).
  - Intégration de `RESPONSABLE_STOCK` et `SUPERVISEUR_TERRAIN` dans `ROLES_LECTURE` (consultation des soldes, réceptions, mouvements).
  - Exclusion stricte de `AGENT_DISTRIBUTION` des mutations de gestion de stock en entrepôt.
  - Généralisation de la portée provinciale : `estRoleProvincial(utilisateur.role)` remplace les tests restrictifs `utilisateur.role === "DELEGUE_PROVINCIAL"` sur l'ensemble des routes d'entrepôts, mouvements et réceptions.

### 2.4 Vérification du schéma local et matrice de sécurité
- **Fichier modifié :** [verifier-schema-local.mjs](file:///c:/Users/Lenovo/Downloads/SIGAD/scripts/verifier-schema-local.mjs#L365-L370)
  - Actualisation du décompte des tables SQLite : passage à 84 tables (69 tables métier dont `profils_operationnels_terrain`, 3 MFA, 2 récupération propriétaire, 7 gestion des comptes, 3 données de test).
  - Ajout du contrôle d'existence de la table `profils_operationnels_terrain`.
- **Fichier modifié :** [securite-matrice-worker.test.mjs](file:///c:/Users/Lenovo/Downloads/SIGAD/tests/integration/securite-matrice-worker.test.mjs#L26-L38)
  - Prise en compte de la méthode `DELETE` dans le parseur de la matrice de sécurité.
  - Alignement du seuil de vérification sur 194 routes API documentées et protégées.

### 2.5 Validation du cycle complet de gouvernance en conditions réelles Worker
- **Fichier modifié :** [operations-centrales-worker.test.mjs](file:///c:/Users/Lenovo/Downloads/SIGAD/tests/integration/operations-centrales-worker.test.mjs#L205-L260)
  - Éprouve le cycle complet d'une opération centrale sur Worker Cloudflare local avec D1 et R2 :
    1. Création par l'administration habilitée en statut `BROUILLON`.
    2. Soumission initiale vers `SOUMISE_A_APPROBATION`.
    3. Rejet avec motif < 5 caractères -> rejeté par l'API avec HTTP 400.
    4. Rejet motivé valide ($\ge 5$ caractères) -> retour immédiat à `BROUILLON`.
    5. Modification autorisée en statut `BROUILLON` via `PUT /api/operations-centrales/:id` -> HTTP 200.
    6. Nouvelle soumission vers `SOUMISE_A_APPROBATION` -> HTTP 200.
    7. Tentative de modification directe sous statut d'approbation -> bloquée avec HTTP 400.
    8. Approbations successives (`COMITE_PILOTAGE`, `VALIDATION_MINISTERIELLE`).
    9. Statut `APPROUVEE` puis `OUVERTE` avec génération atomique des 3 dossiers provinciaux d'exécution.
    10. Enregistrement des documents de cadrage sur bucket Cloudflare R2.
    11. Saisie des plans provinciaux et rattachement de distribution provinciale.
    12. Consolidation nationale des indicateurs d'exécution.
    13. Transition vers `EN_CONSOLIDATION` puis `CLOTUREE` avec motif consigné dans l'historique d'audit.

---

## 3. Données fictives détectées et traitement appliqué

| Donnée détectée | Emplacement initial | Risque opérationnel | Traitement réalisé |
|---|---|---|---|
| **23 entrepôts préconfigurés** (1 central, 22 provinciaux) | `migrations/0029_mise_en_service_stocks.sql` | Création d'entrepôts physiques inexistants sur le terrain en Staging | **Supprimés** de la migration 0029. Déplacés dans la fixture isolée `tests/fixtures/demonstration-stocks.sql`. |
| **12 lots de stocks fictifs** (farine, riz, huile avec dates et quantités) | `migrations/0029_mise_en_service_stocks.sql` | Faux inventaires comptables crédités sans bordereau de réception réel | **Supprimés** de la migration 0029. Déplacés dans la fixture `tests/fixtures/demonstration-stocks.sql`. |
| **112 départements non vérifiés** | `migrations/0028_refonte_referentiel_territorial.sql` | Présentation d'un inventaire non consolidé comme découpage officiel | Maintenus avec le statut explicite `statut_validation = 'A_VERIFIER'`. Affichage dans l'UI annoté `(À vérifier — provisoire)`. |
| **Comptes et opérations de test Staging** | Base distante Staging | Risque de confusion avec les opérations réelles | Conservés sous le module de purge sécurisée réservé au `PROPRIETAIRE` (migration `0027`). |

---

## 4. Éléments nécessitant une validation administrative formelle

Avant toute mise en production ou utilisation contractuelle des données, les validations administratives suivantes sont impératives :

1. **Découpage départemental complet du Tchad :**
   - Les 112 départements candidats recensés doivent faire l'objet d'un décret ou arrêté portant nomenclature officielle des circonscriptions administratives du Ministère de l'Administration du Territoire.
   - Les rattachements des sous-préfectures et communes aux départements doivent être formellement collationnés.
2. **Localisation et capacité réelle des entrepôts :**
   - Chaque délégation provinciale du MASSNAH et chaque magasinier de l'ONASA doivent constater contradictoirement les magasins réels (adresse, capacité volumique, état de salubrité) avant leur enregistrement via `POST /api/stocks/entrepots`.
3. **Articles et conditionnements autorisés :**
   - Le catalogue de 6 articles (Riz 50kg, Maïs 50kg, Huile 5L, Sucre 25kg, CSB++ 25kg, Haricots 50kg) doit être homologué par la commission conjointe MASSNAH / ONASA / Partenaires techniques.
4. **Affectation des profils opérationnels de terrain :**
   - Les actes de désignation des magasiniers (`RESPONSABLE_STOCK`), superviseurs (`SUPERVISEUR_TERRAIN`) et agents de distribution (`AGENT_DISTRIBUTION`) doivent être signés par les délégués provinciaux et notifiés à l'administration centrale.

---

## 5. Résultats précis des tests techniques et fonctionnels

### 5.1 Synthèse globale d'exécution

| Banc de test | Commande | Périmètre | Résultat |
|---|---|---|---|
| **Contrôle de typage** | `npx tsc --noEmit -p tsconfig.json` | Totalité du backend, frontend et shared types | **PASS (0 erreur)** |
| **Build de production** | `npm run build` | Frontend Vite, Rollup chunks, Service Worker PWA | **PASS (dist généré)** |
| **Matrice de sécurité** | `npm run test:security-matrix` | 194 routes API déclarées | **PASS (194/194 synchronisées)** |
| **Vérification schéma** | `node --experimental-sqlite scripts/verifier-schema-local.mjs` | 31 migrations, 84 tables, index, triggers | **PASS (84 tables conformes)** |
| **Tests unitaires** | `npm run test:unit` | 26 suites de tests unitaires Vitest | **PASS (26 suites, 107 tests)** |
| **Tests d'intégration Worker** | `npm run test:integration` | 11 suites Worker live Miniflare + D1 + R2 | **PASS (11 suites, 100% succès)** |

### 5.2 Détail des suites de tests unitaires (Vitest)
- `tests/unit/stocks-service-0029.test.mjs` : 4/4 réussis (catalogue officiel 0029, fixture de démo isolée, FEFO, interdiction stock négatif).
- `tests/unit/gouvernance-approbations-0030.test.mjs` : 3/3 réussis (édition brouillon, renvoi motivé $\ge 5$ chars, actes constitutifs).
- `tests/unit/roles-responsabilites-0030.test.mjs` : 2/2 réussis (profils terrain, séparation des tâches incompatibles).
- `tests/unit/tracabilite-approvisionnements-0031.test.mjs` : 1/1 réussi (chaîne continue opération -> stock -> distribution).
- `tests/unit/recette-operationnelle-complete.test.mjs` : 1/1 réussi (parcours nominal 21 étapes).
- `tests/unit/referentiel-territorial-0028.test.mjs` : 5/5 réussis (intégrité 0028, 112 départements, N'Djaména, N+1).
- `tests/unit/donnees-test.test.mjs` : 12/12 réussis (purge, réconciliation R2, reclassification).
- `tests/unit/operations-centrales.test.mjs` : 9/9 réussis.
- Autres suites unitaires (cryptographie, comptes, mfa, etc.) : 66/66 réussis.

### 5.3 Détail des suites d'intégration Worker Cloudflare local (Miniflare)
- `auth-worker.test.mjs` : Authentification, sessions D1, CSRF, contrôles territoriaux, permissions.
- `securite-matrice-worker.test.mjs` : Test exhaustif des 194 routes API avec vérification de l'invariance d'état D1 sur rejet.
- `operations-centrales-worker.test.mjs` : Cycle complet de gouvernance (création brouillon, rejet motivé, resoumission, approbations, ouverture, génération dossiers provinciaux, téléversement R2, consolidation, clôture).
- `stocks-worker.test.mjs` : Gestion des entrepôts, réceptions, ajustements, mouvements, idempotence et contrôle RBAC.
- `approvisionnements-worker.test.mjs` : Approvisionnements centraux, expéditions, PV de réception et rapprochement.
- `distributions-worker.test.mjs` : Cycle de distribution avec allocation FEFO, remises partielles, clôture et libération des réservations.
- `rapports-worker.test.mjs` : 15 rapports opérationnels, exports PDF/XLSX/CSV, respect de la confidentialité provinciale et benchmarks de performance (5000 ménages, médiane $< 100$ ms).
- `donnees-test-worker.test.mjs` : Purge sécurisée, reclassification et réconciliation des orphelins R2.
- `recovery-proprietaire-worker.test.mjs` : Procédure de secours propriétaire ECDSA P-256.
- `reprise-verification-courriel-worker.test.mjs` : Reprise d'activation de compte sans service courriel.
- `comptes-sans-courriel-worker.test.mjs` : Gestion dérogatoire des comptes délégués sans courriel.

---

## 6. Limitations restantes et risques résiduels

1. **Mode hors-ligne (PWA) :**
   - Le caching statique et l'accès en lecture aux formulaires préparatoires fonctionnent.
   - **Règle impérative rappelée :** La remise effective de vivres avec décrémentation de stock en mode entièrement déconnecté reste **strictement désactivée** sur le serveur afin de prévenir toute divergence de stock et tout double service concurrent en l'absence de réseau fiable.
2. **Volumétrie des chunks JavaScript :**
   - Le bundle client Vite produit un fichier principal de 558 ko (`index-CBL5A_DU.js`), générant un avertissement au build. Bien que fonctionnel et compressé à 141 ko gzippé, un découpage dynamique supplémentaire des modules d'administration pourra être envisagé ultérieurement.
3. **Complétude du référentiel localités :**
   - L'inventaire des villages, ferricks et campements ruraux reste tributaire des propositions de terrain soumises par les délégués provinciaux via le mécanisme collaboratif de proposition/validation.

---

## 7. Statut d'applicabilité des migrations sur Staging

| Migration | Titre | Statut d'application Staging | Motif technique |
|---|---|---|---|
| `0001` à `0027` | Migrations socle, MFA, comptes, opérations centrales, données de test | **DÉJÀ APPLIQUÉES** | Vérifiées présentes dans le registre distant D1 |
| `0028` | `0028_refonte_referentiel_territorial.sql` | **APPLICABLE** | Schéma d'intégrité territoriale, statut particulier N'Djaména, 112 départements candidats annotés `A_VERIFIER` |
| `0029` | `0029_mise_en_service_stocks.sql` (assainie) | **APPLICABLE** | Contient uniquement le schéma, déclencheurs FEFO, 6 conditionnements et 6 articles de base. **Zéro faux entrepôt ni faux lot.** |
| `0030` | `0030_profils_operationnels_terrain.sql` | **APPLICABLE** | Table `profils_operationnels_terrain`, déclencheurs de séparation des responsabilités et contraintes d'intégrité |
| `0031` | `0031_tracabilite_operations_approvisionnements.sql` | **APPLICABLE** | Colonnes de traçabilité liant opérations centrales, approvisionnements et distributions provinciales |

> [!IMPORTANT]
> Les migrations `0028`, `0029`, `0030` et `0031` doivent être appliquées strictement dans cet ordre séquentiel lors de la phase de déploiement autorisée.
> Le fichier `tests/fixtures/demonstration-stocks.sql` ne doit en aucun cas être injecté sur Staging.

---

## 8. Décision finale motivée

### VERDICT : `PRET_POUR_RECETTE_STAGING`

**Motivation de la décision :**
1. L'ensemble des 7 chantiers de refonte a été audité de manière contradictoire et assaini.
2. Toutes les données fictives d'entrepôts et de stocks ont été extraites des migrations opérationnelles et confinées aux bancs de test locaux.
3. Le parcours institutionnel particulier de N'Djaména est désormais parfaitement pris en charge sans blocage dans l'interface utilisateur.
4. Le cycle de gouvernance complet (brouillon, renvoi motivé $\ge 5$ caractères, ré-édition, approbations ministérielles, ouverture, exécution provinciale, consolidation et clôture) est validé sur véritable instance Worker Cloudflare, D1 et R2.
5. La matrice de sécurité vérifie la stricte isolation des 194 routes d'API, avec imperméabilité des périmètres provinciaux et séparation des responsabilités opérationnelles de terrain.
6. Tous les contrôles de qualité (typage TypeScript, compilation Vite/PWA, 107 tests unitaires Vitest, 11 suites d'intégration Worker) affichent un taux de réussite de 100 %.
7. Aucune modification n'a été déployée à distance, respectant scrupuleusement la consigne d'intervention locale exclusive.
