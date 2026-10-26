# SIGAD — Matrice de responsabilités, gouvernance et contrôle des habilitations (RBAC)

**Référence :** Chantier 04 — Programme intégral de refonte SIGAD  
**Statut :** PASS (Implémenté et vérifié localement)  
**Date :** 25 octobre 2026  
**Environnement :** Local Cloudflare Worker / D1 / SQLite  

---

## 1. Principes cardinaux de sécurité et de gouvernance

Conformément à l'Arrêté n°0033/PR/PM/MASSNAH/SG/2026 et aux normes de contrôle interne des aides publiques :

1. **Séparation stricte des compétences :** Les fonctions d'ordonnancement administratif (décisions d'aide, approbations ministérielles), de gestion physique et comptable des stocks (magasiniers), et d'exécution terrain (distribution et émargement) sont mutuellement exclusives sur un même acte.
2. **Cloisonnement territorial étanche :** Tout acteur provincial ou de terrain est strictement confiné à sa province administrative (`province_id`). Aucun accès en écriture ni en consultation interprovinciale non autorisée n'est toléré.
3. **Immutabilité des audits :** Toute transition de statut d'opération, tout mouvement de stock, toute décision d'approbation et tout émargement fait l'objet d'un journal inaltérable horodaté avec identité de l'acteur et adresse IP.
4. **Consultation institutionnelle strictement passive :** Les comptes de contrôle externe, partenaires et bailleurs disposent d'un accès strictement en lecture seule (`GET`), avec interdiction formelle de toute mutation d'état.

---

## 2. Définition et ressorts des 7 rôles applicatifs

| Identifiant du rôle | Intitulé fonctionnel | Périmètre géographique | Ressort métier principal |
| :--- | :--- | :--- | :--- |
| **`PROPRIETAIRE`** | Administrateur Système & Gouvernance | National | Gestion des utilisateurs racine, purges de données test, maintenance technique globale, diagnostics. |
| **`ADMIN_CENTRAL`** | Pilote National (MASSNAH / DGA) | National | Création des opérations centrales, enregistrement des actes de gouvernance, planification des approvisionnements, consolidation nationale. |
| **`DELEGUE_PROVINCIAL`** | Délégué Provincial MASSNAH | Provincial unique | Coordination provinciale, validation légale des listes de ciblage, ordonnancement des distributions de sa province. |
| **`RESPONSABLE_STOCK`** | Gestionnaire de Magasin / Entrepôt | Entrepôt & Province | Constat des réceptions physiques, tenue du registre d'inventaire, sorties de stock sur bordereau justifié, respect de la règle FEFO. |
| **`SUPERVISEUR_TERRAIN`** | Superviseur Opérationnel Terrain | Province / Départements | Contrôle de la conformité du ciblage des ménages, surveillance de l'organisation des sites de distribution, détection des anomalies. |
| **`AGENT_DISTRIBUTION`** | Agent d'Émargement et Remise | Site de distribution | Pointage de la présence des ménages bénéficiaires, remise effective des rations alimentaires, émargement biométrique ou signé. |
| **`CONSULTATION_INSTITUTIONNELLE`** | Observateur / Partenaire / Bailleur | Défini (National ou multi-provincial) | Consultation passive des tableaux de bord, suivi des indicateurs, audit des réalisations (Strictement GET). |

---

## 3. Matrice détaillée des permissions par domaine opérationnel

### Légende :
- **E** : Exécution / Écriture autorisée
- **V** : Validation formelle requise
- **L** : Lecture seule
- **-** : Accès formellement refusé (HTTP 403 Forbidden)

| Domaine opérationnel & Action | PROPRIETAIRE | ADMIN_CENTRAL | DELEGUE_PROVINCIAL | RESPONSABLE_STOCK | SUPERVISEUR_TERRAIN | AGENT_DISTRIBUTION | CONSULTATION |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gouvernance & Opérations centrales** | | | | | | | |
| - Création d'une opération centrale | E | E | - | - | - | - | L |
| - Modification d'une opération en Brouillon | E | E | - | - | - | - | L |
| - Soumission à approbation | - | E | - | - | - | - | L |
| - Demande de correction (retour Brouillon) | - | V | - | - | - | - | L |
| - Enregistrement acte Comité de pilotage | - | E | - | - | - | - | L |
| - Enregistrement Arrêté Ministériel | - | E | - | - | - | - | L |
| - Déclaration opération approuvée / ouverture | - | V | - | - | - | - | L |
| - Clôture nationale consolidée | E | V | - | - | - | - | L |
| **Gestion des Stocks & Entrepôts** | | | | | | | |
| - Création d'entrepôt et catalogue articles | E | E | - | - | - | - | L |
| - Constat de réception physique en magasin | - | - | - | E | - | - | L |
| - Enregistrement d'inventaire physique | - | - | L | E | - | - | L |
| - Déstockage / sortie pour distribution | - | - | V | E | - | - | L |
| - Consultation des stocks provinciaux | L | L | L | L (son entrepôt) | L | - | L |
| **Bénéficiaires & Ciblage territorial** | | | | | | | |
| - Enregistrement initial d'un ménage | - | - | E | - | E | - | L |
| - Détection et arbitrage des doublons | - | L | V | - | E | - | L |
| - Validation administrative de la liste ciblée | - | - | V | - | - | - | L |
| **Distributions de vivres** | | | | | | | |
| - Planification d'une distribution provinciale | - | - | E | - | - | - | L |
| - Affectation des vivres et lots FEFO | - | - | - | E | - | - | L |
| - Supervision et contrôle de site | - | - | L | - | E | - | L |
| - Émargement et remise effective de ration | - | - | - | - | - | E | L |
| - Transmission du PV de distribution | - | - | E | - | V | - | L |
| **Administration Système & Audit** | | | | | | | |
| - Gestion des comptes et révocations | E | E (terrain) | - | - | - | - | - |
| - Purge sécurisée des données de test | E | - | - | - | - | - | - |
| - Consultation des journaux d'audit | E | L | L (province) | - | - | - | L |

---

## 4. Règles de séparation des fonctions incompatibles (Segregation of Duties)

1. **Magasinier vs Distributeur :** L'agent qui gère physiquement l'entrepôt (`RESPONSABLE_STOCK`) ne peut pas être désigné comme opérateur de remise (`AGENT_DISTRIBUTION`) sur une même distribution. Cela prévient la sortie frauduleuse sans émargement contradictoire.
2. **Ciblage vs Approbation des listes :** Le superviseur terrain qui collecte et saisit les listes de ménages vulnérables ne peut pas valider administrativement la liste définitive : cette attribution revient exclusivement au `DELEGUE_PROVINCIAL`.
3. **Fourniture de vivres vs Réception contradictoire :** L'expéditeur central (`ADMIN_CENTRAL`) ne peut pas valider la réception physique en province ; seul le `RESPONSABLE_STOCK` de l'entrepôt récepteur établit le procès-verbal de réception avec constatation éventuelle des pertes et avaries.

---

## 5. Mécanisme technique d'implémentation D1 et Hono

- **Table support :** `profils_operationnels_terrain` introduite par [0030_profils_operationnels_terrain.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0030_profils_operationnels_terrain.sql).
- **Rattachement non destructif :** Préserve l'intégrité de la table racine `utilisateurs` et ses contraintes CHECK historiques.
- **Résolution dans le Middleware :** [auth.middleware.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/middlewares/auth.middleware.ts) dérive dynamiquement `role_effectif` et `province_id_effectif` au moment de la vérification de session.
- **Contrôle d'accès :** [rbac.middleware.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/middlewares/rbac.middleware.ts) applique `isolationProvinciale` à tous les rôles provinciaux et de terrain.
- **Tests unitaires d'acceptation :** [roles-responsabilites-0030.test.mjs](file:///C:/Users/Lenovo/Downloads/SIGAD/tests/unit/roles-responsabilites-0030.test.mjs) (2/2 validés avec succès).
