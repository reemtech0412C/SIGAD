# SIGAD — PARCOURS OPÉRATIONNELS ET FLUX FONCTIONNELS
## Modélisation des processus métier du Système Intégré de Gestion des Aides et des Distributions

**Environnement audité :** Cloudflare Staging (`https://sigad-staging.reemtech0412.workers.dev`)  
**Version Worker active :** `0c020f68-17c5-47ee-aa20-7478aa8a27b2`  
**Base D1 :** `sigad-staging-db` (27 migrations, 85 tables)  
**Date d'audit :** 25 octobre 2026  
**Référence réglementaire :** Arrêté n°0033/PR/PM/MASSNAH/SG/2026 du 7 octobre 2026

---

## 1. Création et validation d'une opération centrale

Ce flux décrit la création administrative d'une opération centrale par le Ministère de l'Action Sociale (MASSNAH), sa soumission pour examen, son approbation formelle et son ouverture opérationnelle.

```mermaid
sequenceDiagram
    autonumber
    actor AC as Administrateur Central (MASSNAH)
    actor CP as Comité de Pilotage / Ministre
    participant UI as Interface Web SIGAD
    participant API as Worker API (/api/operations-centrales)
    participant D1 as Cloudflare D1 (sigad-staging-db)

    Note over AC,UI: 1. Initialisation en Brouillon
    AC->>UI: Saisir intitulé, référence, campagne, dates, ciblage, sélection provinces
    UI->>API: POST /api/operations-centrales (idempotent)
    API->>D1: INSERT operations_centrales_distribution (statut: BROUILLON, nature: REEL)
    API->>D1: INSERT operations_centrales_provinces (liaisons territoriales)
    API->>D1: INSERT historique_operations_centrales (BROUILLON)
    API-->>UI: Opération créée (ex: OPC-2026-B839B0)

    Note over AC,UI: 2. Soumission à approbation
    AC->>UI: Cliquer sur « Soumettre à approbation »
    UI->>API: POST /api/operations-centrales/{id}/statut (nouveau_statut: SOUMISE_A_APPROBATION)
    API->>D1: UPDATE operations_centrales_distribution (statut: SOUMISE_A_APPROBATION)
    API->>D1: INSERT historique_operations_centrales
    API-->>UI: Statut mis à jour

    Note over CP,AC: 3. Décision administrative formelle
    CP-->>AC: Arrêté ministériel ou Résolution du Comité de pilotage
    AC->>UI: Enregistrer acte (référence, instance, date, signataire, décision)
    UI->>API: POST /api/operations-centrales/{id}/approbations
    API->>D1: INSERT approbations_operations (type, reference, decision)
    API->>D1: INSERT journaux_audit
    API-->>UI: Approbation enregistrée

    Note over AC,UI: 4. Approbation et Ouverture
    AC->>UI: Changer statut vers « APPROUVEE »
    UI->>API: POST /api/operations-centrales/{id}/statut (nouveau_statut: APPROUVEE)
    API->>D1: Vérifier nb_approbations >= 1
    API->>D1: UPDATE operations_centrales_distribution (statut: APPROUVEE)
    API-->>UI: Opération approuvée

    AC->>UI: Déclencher « Ouvrir aux provinces »
    UI->>API: POST /api/operations-centrales/{id}/statut (nouveau_statut: OUVERTE)
    API->>D1: UPDATE operations_centrales_distribution (statut: OUVERTE)
    loop Pour chaque province ciblée
        API->>D1: INSERT dossiers_execution_provinciaux (ref: DEX-PROV-2026-XXXX, statut: ASSIGNE)
    end
    API-->>UI: Opération ouverte, dossiers provinciaux générés
```

---

## 2. Choix et affectation territoriale des provinces

Ce flux détaille la répartition des prévisions nationales et des consignes par délégation provinciale.

```mermaid
flowchart TD
    A["Définition du cadre d'intervention national"] --> B["Sélection des provinces parmi les 23 provinces"]
    B --> C{"Toutes les 23 provinces ?"}
    C -- Oui --> D["Bouton 'Tout sélectionner' (couverture 100% nationale)"]
    C -- Non --> E["Sélection unitaire ou multi-provinces ciblées"]
    D --> F["Attribution des quotas prévisionnels"]
    E --> F
    F --> G["Quantités allouées prévues (tonnes/sacs)"]
    F --> H["Nombre prévisionnel de ménages par province"]
    F --> I["Instructions spécifiques et calendrier provincial"]
    G & H & I --> J["Contrôle d'unicité et contrainte de clé étrangère D1"]
    J --> K["Enregistrement dans operations_centrales_provinces"]
```

---

## 3. Prise en charge et exécution provinciale

Ce flux illustre comment le délégué provincial accède à l'opération centrale et instruit son dossier local.

```mermaid
sequenceDiagram
    autonumber
    actor DP as Délégué Provincial
    participant UI as Interface Web SIGAD
    participant API as Worker API (/api/provincial)
    participant D1 as Base D1

    DP->>UI: Connexion sécurisée (usr-{province})
    UI->>API: GET /api/provincial/operations-centrales
    API->>D1: Filtrer operations_centrales_provinces WHERE province_id = session.province_id
    API-->>UI: Liste des opérations ouvertes à la province

    DP->>UI: Sélectionner le dossier d'exécution (DEX-...)
    UI->>API: GET /api/provincial/operations-centrales/{id}
    API->>D1: SELECT dossiers_execution_provinciaux WHERE operation_id = ? AND province_id = ?
    API-->>UI: Détail du dossier local

    DP->>UI: Renseigner le plan opérationnel local et les observations
    UI->>API: PATCH /api/provincial/operations-centrales/{id}/dossier
    API->>D1: UPDATE dossiers_execution_provinciaux (plan_local, observations, statut: EN_PREPARATION)
    API-->>UI: Dossier provincial prêt pour la phase de distribution
```

---

## 4. Cycle complet d'une distribution effective

Ce flux montre la mise en œuvre d'une distribution provinciale, de sa préparation à sa clôture administrative.

```mermaid
stateDiagram-v2
    [*] --> BROUILLON: Création par le délégué
    BROUILLON --> EN_PREPARATION: Affectation zones, articles, rations, ménages
    EN_PREPARATION --> VALIDEE_PROVINCE: Validation locale par le délégué
    VALIDEE_PROVINCE --> EN_EXECUTION: Lancement sur le terrain
    EN_EXECUTION --> TERMINEE_PROVINCE: Saisie des remises, PV téléversé, fin déclarée
    TERMINEE_PROVINCE --> RETOURNEE_POUR_CORRECTION: Contrôle central rejette des pièces
    RETOURNEE_POUR_CORRECTION --> TERMINEE_PROVINCE: Délégué corrige et resoumet
    TERMINEE_PROVINCE --> CLOTUREE_CENTRAL: Approbation centrale définitive et libération des stocks
    CLOTUREE_CENTRAL --> [*]
```

---

## 5. Approvisionnement central et gestion des stocks

Ce flux décrit le circuit logistique amont entre l'ONASA/Partenaires et les entrepôts provinciaux.

```mermaid
sequenceDiagram
    autonumber
    actor AC as Administration Centrale
    actor DP as Délégué Provincial
    participant API as Worker API
    participant D1 as Base D1

    AC->>API: POST /api/central/approvisionnements (création lot d'approvisionnement)
    API->>D1: INSERT approvisionnements_centraux (statut: BROUILLON)
    AC->>API: Affecter destinations et quantités par province
    AC->>API: POST /api/central/approvisionnements/{id}/validation
    API->>D1: UPDATE approvisionnements_centraux (statut: VALIDE)

    AC->>API: POST /api/central/approvisionnements/{id}/expeditions (saisie bordereau transporteur)
    API->>D1: INSERT expeditions (statut: EN_TRANSIT)
    API->>D1: INSERT mouvements_stock (type: SORTIE_EXPEDITION)

    Note over DP: Réception physique au magasin provincial
    DP->>API: POST /api/provincial/expeditions/{id}/reception (quantités conformes, avaries, manquants)
    DP->>API: POST /api/provincial/expeditions/{id}/pv (téléversement PV scanné)
    API->>D1: INSERT receptions_provinciales
    API->>D1: INSERT mouvements_stock (type: RECEPTION, entrepot_provincial)

    Note over AC: Rapprochement central
    AC->>API: POST /api/central/approvisionnements/{id}/receptions/{recId}/rapprochement
    API->>D1: Clôture de l'expédition ou émission d'une alerte d'écart
```

---

## 6. Enregistrement, ciblage et contrôle des ménages bénéficiaires

Ce flux montre comment les bénéficiaires sont enregistrés, dédoublonnés et validés.

```mermaid
flowchart TD
    A["Saisie d'un ménage par le délégué provincial"] --> B["Sélection Province (automatique)"]
    B --> C["Sélection Département"]
    C --> D["Sélection Sous-préfecture / Commune"]
    D --> E["Sélection Localité (Village / Quartier / Site)"]
    E --> F["Saisie Chef de ménage + Membres + Vulnérabilités"]
    F --> G["Contrôle d'intégrité et détection de doublons"]
    G --> H{"Doublon suspecté ?"}
    H -- Oui --> I["Marquage DOUBLON_SUSPECTE dans menages"]
    I --> J["Création d'un signalements_doublons pour examen central"]
    H -- Non --> K["Statut ACTIF, validation A_VERIFIER"]
    K --> L["Examen et validation par l'Administration Centrale"]
    L --> M["Statut validation: VALIDE"]
    M --> N["Inscription possible dans une liste_beneficiaires"]
```

---

## 7. Rapprochement et libération des stocks en clôture

Ce flux illustre le contrôle strict des stocks avant la fermeture définitive d'une distribution.

```mermaid
flowchart TD
    A["Distribution en état TERMINEE_PROVINCE"] --> B["Administration Centrale examine le dossier de clôture"]
    B --> C["Vérification des remises saisies vs rations prévues"]
    C --> D["Contrôle du Procès-Verbal de distribution (PV)"]
    D --> E{"Reste-t-il des stocks réservés non distribués ?"}
    E -- Oui --> F["Calcul du reliquat de stock réservé"]
    F --> G["Génération d'un mouvement LIBERATION_RESERVATION"]
    G --> H["Réintégration au stock disponible provincial"]
    E -- Non --> H
    H --> I["Passage au statut CLOTUREE_CENTRAL"]
    I --> J["Immutabilité des écritures de distribution"]
```

---

## 8. Consolidation nationale d'une opération centrale

Ce flux montre comment les résultats de toutes les provinces ciblées sont synthétisés à l'échelle nationale.

```mermaid
sequenceDiagram
    autonumber
    actor AC as Administrateur Central
    participant UI as Interface Web SIGAD
    participant API as Worker API (/api/operations-centrales/{id}/consolidation)
    participant D1 as Base D1

    AC->>UI: Ouvrir onglet « Consolidation nationale »
    UI->>API: GET /api/operations-centrales/{id}/consolidation
    API->>D1: SELECT SUM(nombre_menages_cibles), SUM(nombre_personnes_cibles) FROM dossiers_execution_provinciaux
    API->>D1: SELECT COUNT(*) menages_servis FROM remises_distribution rd JOIN distributions_provinciales dp ON dp.id = rd.distribution_id WHERE dp.operation_centrale_id = ?
    API->>D1: SELECT SUM(lignes_remise.quantite) FROM lignes_remise
    API->>D1: Calculer taux de couverture global et taux d'avancement par province
    API-->>UI: Matrice consolidée nationale (cibles vs réalisations)
    UI-->>AC: Affichage graphiques, indicateurs clés et statut de consolidation
```

---

## 9. Gestion des comptes, habilitations et cycle MFA

Ce flux décrit l'enrôlement et la sécurisation des accès des délégués et administrateurs.

```mermaid
sequenceDiagram
    autonumber
    actor Cand as Candidat Délégué Provincial
    actor AC as Administrateur Central
    participant UI as Interface SIGAD
    participant API as Worker API
    participant D1 as Base D1

    Cand->>UI: Formulaire d'inscription délégué (/inscriptions/delegues)
    UI->>API: POST /api/inscriptions/delegues (nom, téléphone, province demandée)
    API->>D1: INSERT inscriptions_delegues (statut: EN_ATTENTE)
    API-->>Cand: Demande enregistrée sous réserve de validation ministérielle

    AC->>UI: Module Administration des comptes (/administration/comptes)
    UI->>API: GET /api/administration/comptes/delegues
    API-->>UI: Liste des candidatures en attente
    AC->>UI: Approuver le délégué
    UI->>API: POST /api/administration/comptes/delegues/{id}/approuver
    API->>D1: Vérifier unicité du délégué actif pour la province
    API->>D1: INSERT utilisateurs (statut: ACTIF, doit_changer_mot_de_passe: 1)
    API->>D1: UPDATE inscriptions_delegues (statut: APPROUVEE)
    API-->>AC: Compte créé, code d'activation initial généré

    Note over Cand: Première connexion
    Cand->>UI: Saisie identifiant et code initial
    UI-->>Cand: Écran obligatoire de changement de mot de passe
    Cand->>UI: Nouveau mot de passe fort (PBKDF2)
    UI->>API: POST /api/auth/changer-mot-de-passe-initial
    API->>D1: UPDATE utilisateurs (doit_changer_mot_de_passe: 0)
    UI-->>Cand: Accès au tableau de bord provincial
```

---

## 10. Gestion et purge sécurisée des données de test (Compte PROPRIÉTAIRE)

Ce flux détaille la nouvelle procédure rigoureuse de nettoyage réservée exclusivement au Propriétaire du système.

```mermaid
sequenceDiagram
    autonumber
    actor PROP as Compte PROPRIETAIRE
    participant UI as Interface SIGAD (#donnees-test)
    participant API as Worker API (/api/proprietaire/donnees-test)
    participant D1 as Base D1
    participant R2 as Cloudflare R2 Bucket
    participant REC as File Réconciliation R2

    PROP->>UI: Accéder à « Gestion des données de test »
    UI->>API: GET /api/proprietaire/donnees-test/operations
    API->>D1: SELECT operations_centrales_distribution WHERE nature_donnees IN ('TEST', 'INDETERMINE')
    API-->>UI: Tableau des opérations éligibles

    PROP->>UI: Cliquer sur « Inspecter l'éligibilité »
    UI->>API: GET /api/proprietaire/donnees-test/operations/{id}/apercu
    API->>D1: Vérifier absence de distributions réelles, absence de mouvements de stocks
    API-->>UI: Rapport d'éligibilité complet (bloqueurs éventuels)

    alt Si statut INDETERMINE
        PROP->>UI: Déclencher Reclassification administrative
        UI->>API: POST /api/proprietaire/donnees-test/operations/{id}/reclassifier (cible: TEST, motif, mdp)
        API->>D1: Vérifier mot de passe propriétaire (PBKDF2)
        API->>D1: INSERT demandes_reclassification_donnees (statut: APPROUVEE)
        API->>D1: UPDATE operations_centrales_distribution (nature_donnees: TEST)
        API-->>UI: Opération reclassifiée TEST
    end

    PROP->>UI: Confirmer suppression définitive (Saisie code exact + Mot de passe + Motif)
    UI->>API: POST /api/proprietaire/donnees-test/operations/{id}/supprimer
    API->>D1: Vérification stricte sécurité (mot de passe, éligibilité, nature=TEST)
    
    par Purge Cloudflare R2
        API->>R2: DELETE documents_operations/{id}/*
    and Purge en cascade D1 (Transaction unique db.batch)
        API->>D1: DELETE dossiers_execution_provinciaux
        API->>D1: DELETE operations_centrales_provinces
        API->>D1: DELETE approbations_operations
        API->>D1: DELETE documents_operations
        API->>D1: DELETE historique_operations_centrales
        API->>D1: DELETE operations_centrales_distribution
        API->>D1: INSERT audits_suppression_donnees_test (immuable)
    end

    opt En cas d'échec partiel R2
        API->>D1: INSERT file_reconciliation_r2_orphelins (cle_r2, statut: EN_ATTENTE)
        API->>D1: UPDATE audits_suppression_donnees_test (statut_resultat: ECHEC_PARTIEL)
    end

    API-->>UI: Confirmation de suppression irréversible et journalisée
```
