# SIGAD — REGISTRE DES ANOMALIES, INSUFFISANCES ET AMÉLIORATIONS
## Analyse critique de la version Cloudflare Staging (Arrêté n°0033/2026)

**Application auditée :** `https://sigad-staging.reemtech0412.workers.dev`  
**Worker Version :** `0c020f68-17c5-47ee-aa20-7478aa8a27b2`  
**Base D1 :** `sigad-staging-db` (27 migrations, 85 tables)  
**Date d'établissement :** 25 octobre 2026  
**Auteur :** Antigravity — Expert Agentic Architect

---

## 1. Typologie de classification

- **P0 — Risque critique / Blocage majeur :** Empêche l'exécution d'un processus fondamental (données, sécurité, intégrité, blocage complet d'un module).
- **P1 — Dysfonctionnement métier majeur :** Anomalie ou rupture de cohérence administrative altérant la fiabilité ou la traçabilité.
- **P2 — Amélioration fonctionnelle significative :** Fonctionnalité manquante, adaptation aux réalités de terrain ou renforcement de la gouvernance.
- **P3 — Ergonomie, confort et qualité rédactionnelle :** Lisibilité, fluidité mobile, harmonisation des libellés et accessibilité.

---

## 2. Tableau récapitulatif du registre

| Code | Priorité | Module concerné | Intitulé synthétique | Statut actuel |
|---|---|---|---|---|
| `SIGAD-AUD-001` | **P0** | Référentiel territorial | Absence totale des départements et sous-préfectures sur Staging | Bloquant |
| `SIGAD-AUD-002` | **P0** | Référentiel territorial | 500 communes Loi 015 bloquées en statut `PROPOSE` | Bloquant |
| `SIGAD-AUD-003` | **P0** | Bénéficiaires & Ménages | Blocage de l'enregistrement des ménages dû au `departement_id` obligatoire | Bloquant |
| `SIGAD-AUD-004` | **P1** | Approbations & Gouvernance | Approbation d'opération sans obligation de pièce jointe R2 | Risque légal |
| `SIGAD-AUD-005` | **P1** | Logistique & Stocks | Absence de catalogue d'articles et d'entrepôts sur Staging | Bloquant tests |
| `SIGAD-AUD-006` | **P1** | Sécurité des rôles | Absence de rôle métier dédié pour le Responsable des stocks | Confusion des devoirs |
| `SIGAD-AUD-007` | **P1** | Accès délégués | Verrouillage persistant du compte du délégué de Sila (`usr-sila`) | Bloquant pilote |
| `SIGAD-AUD-008` | **P2** | Approvisionnements | Déconnexion structurelle entre Approvisionnement central et Opération de distribution | Risque double comptabilité |
| `SIGAD-AUD-009` | **P2** | Exécution terrain | Absence de mode de saisie déconnecté (PWA Offline) pour le ciblage rural | Non adapté au terrain |
| `SIGAD-AUD-010` | **P2** | Cycle de vie opération | Rigidité du statut `SOUMISE_A_APPROBATION` interdisant les corrections mineures | Inflexibilité |
| `SIGAD-AUD-011` | **P2** | Gestion des comptes | Dépendance aux invitations e-mail alors que le service d'envoi est désactivé | Contournement requis |
| `SIGAD-AUD-012` | **P2** | Gouvernance système | Cumul excessif des pouvoirs techniques et d'audit sur le compte PROPRIETAIRE | Séparation des tâches |
| `SIGAD-AUD-013` | **P3** | UX / Ergonomie mobile | Débordement horizontal des tables de consolidation et de remises sur smartphone | Inconfort mobile |
| `SIGAD-AUD-014` | **P3** | Qualité rédactionnelle | Termes techniques internes exposés dans l'interface administrative | Clarté administrative |
| `SIGAD-AUD-015` | **P3** | Tableaux de bord | Indicateurs de stock comptable non distingués des stocks physiques réservés | Lisibilité financière |

---

## 3. Fiches détaillées des observations

---

### `SIGAD-AUD-001` — Absence des départements et sous-préfectures dans la base Staging
- **Module :** Référentiel territorial / Base D1
- **Parcours :** Territoire $\rightarrow$ Sélection départementale
- **Fonctionnement actuel :** La table `provinces` contient 23 enregistrements, mais `departements` et `sous_prefectures` contiennent **0 enregistrement** dans `sigad-staging-db`.
- **Problème / Limitation :** Aucune division administrative intermédiaire n'existe entre la province et les communes.
- **Conséquence opérationnelle :** Tout formulaire dépendant d'un département (notamment l'enregistrement d'un ménage ou la création d'une distribution provinciale) affiche une liste déroulante vide.
- **Gravité :** `P0`
- **Recommandation fonctionnelle :** Intégrer le découpage officiel du Tchad en 23 provinces, 107 départements et 378 sous-préfectures issu des décrets d'application territoriaux.
- **Recommandation technique :** Rédiger un script de seed ou de migration territoriale référençant les codes géographiques ISO/INSEED.
- **Fichiers concernés :** [migrations/0002_referentiel_territorial.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0002_referentiel_territorial.sql), [backend/src/services/territoire.service.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/territoire.service.ts).
- **Risques de régression :** Faible (ajout de données référentielles pures).
- **Effort estimatif :** 2 jours.
- **Priorité :** `P0`

---

### `SIGAD-AUD-002` — 500 communes de la Loi 015 bloquées en statut `PROPOSE`
- **Module :** Référentiel territorial
- **Parcours :** Délégué provincial / Sélection de commune
- **Fonctionnement actuel :** La migration `0011` a importé 500 communes avec la valeur `statut_validation = 'PROPOSE'` et aucun mécanisme n'a basculé ces communes vers `VALIDE`.
- **Problème / Limitation :** Les requêtes API filtrant sur `statut_validation = 'VALIDE'` ou les interfaces ignorant les communes non activées ne retournent aucune commune active.
- **Conséquence opérationnelle :** Les délégués ne peuvent pas rattacher formellement un ménage à sa commune de résidence.
- **Gravité :** `P0`
- **Recommandation fonctionnelle :** Activer par décision centrale le référentiel des communes conformes à la Loi Organique n°015/CNT/2024.
- **Recommandation technique :** Valider formellement les 500 communes par une requête `UPDATE communes SET statut_validation = 'VALIDE' WHERE source_officielle LIKE '%015/CNT/2024%';`.
- **Fichiers concernés :** [migrations/0011_import_communes_loi_015.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0011_import_communes_loi_015.sql).
- **Priorité :** `P0`

---

### `SIGAD-AUD-003` — Blocage de la saisie des ménages par la contrainte `departement_id`
- **Module :** Gestion des bénéficiaires
- **Parcours :** Gestion des bénéficiaires $\rightarrow$ Nouveau ménage
- **Fonctionnement actuel :** Le schéma de validation [schemaMenage](file:///C:/Users/Lenovo/Downloads/SIGAD/shared/validations/beneficiaires.ts#L70) impose `departement_id: identifiant` de façon obligatoire.
- **Problème / Limitation :** Combiné avec l'absence de départements en base (`SIGAD-AUD-001`), la soumission de tout nouveau ménage est systématiquement rejetée par le validateur Zod avec l'erreur `L’identifiant est invalide`.
- **Conséquence opérationnelle :** Impossibilité absolue d'enregistrer le moindre ménage bénéficiaire sur Staging.
- **Gravité :** `P0`
- **Recommandation fonctionnelle :** Rendre provisoirement le `departement_id` optionnel ou nullable si la commune ou la province est renseignée, ou peupler immédiatement les départements.
- **Recommandation technique :** Aligner `schemaMenage` pour accepter `departement_id: identifiant.nullable().optional()` tout en exigeant `province_id`.
- **Fichiers concernés :** [shared/validations/beneficiaires.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/shared/validations/beneficiaires.ts), [backend/src/services/gestion.service.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/gestion.service.ts).
- **Priorité :** `P0`

---

### `SIGAD-AUD-004` — Approbation d'opération sans pièce jointe officielle obligatoire
- **Module :** Gouvernance & Opérations centrales
- **Parcours :** Opérations centrales $\rightarrow$ Onglet Approbations $\rightarrow$ Enregistrer un acte
- **Fonctionnement actuel :** La méthode `ajouterApprobationOperation` permet d'enregistrer un acte avec une référence textuelle (ex: "Arrêté n°0033") sans exiger l'envoi d'un fichier PDF scanné.
- **Problème / Limitation :** Une opération peut passer au statut `APPROUVEE` puis `OUVERTE` sur la foi d'une simple déclaration administrative non documentée.
- **Conséquence opérationnelle :** Risque de contestation juridique et absence de force probante des décisions au sens du droit administratif tchadien.
- **Gravité :** `P1`
- **Recommandation fonctionnelle :** Rendre obligatoire le téléversement de l'arrêté ministériel ou du procès-verbal de décision signé avant de pouvoir changer le statut vers `APPROUVEE`.
- **Recommandation technique :** Dans `changerStatutOperationCentrale`, vérifier `SELECT COUNT(*) FROM documents_operations WHERE operation_id = ? AND categorie_document IN ('ARRETE_MINISTERIEL', 'DECISION_PILOTAGE') >= 1`.
- **Fichiers concernés :** [backend/src/services/operation-centrale.service.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/operation-centrale.service.ts).
- **Priorité :** `P1`

---

### `SIGAD-AUD-005` — Tables de stocks et articles vides sur Staging
- **Module :** Gestion des stocks
- **Parcours :** Stocks $\rightarrow$ Soldes / Mouvements / Réceptions
- **Fonctionnement actuel :** La table `articles` a 0 ligne, `entrepots` a 0 ligne, `mouvements_stock` a 0 ligne.
- **Problème / Limitation :** Lors de la création d'une distribution provinciale ou d'un approvisionnement, aucun article (céréales, huile, farines) ni aucun entrepôt ne peut être sélectionné.
- **Conséquence opérationnelle :** Les tests de bout en bout d'exécution de distribution et de gestion logistique ne peuvent pas aboutir sans saisie manuelle préalable d'un catalogue.
- **Gravité :** `P1`
- **Recommandation fonctionnelle :** Définir un catalogue d'articles standard de l'aide humanitaire tchadienne (ex: Sac de maïs 50 kg, Sac de sorgho 50 kg, Huile végétale 5 L, CSB+ 25 kg) et un réseau d'entrepôts ONASA/MASSNAH.
- **Recommandation technique :** Fournir un seed standard pour les articles et entrepôts centraux et provinciaux.
- **Fichiers concernés :** [migrations/0008_seed_initial_data.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0008_seed_initial_data.sql).
- **Priorité :** `P1`

---

### `SIGAD-AUD-006` — Absence de rôle métier pour le Responsable des stocks
- **Module :** RBAC & Sécurité
- **Parcours :** Authentification / Rôles
- **Fonctionnement actuel :** Les rôles existants sont strictement : `PROPRIETAIRE`, `ADMIN_CENTRAL`, `DELEGUE_PROVINCIAL`, `CONSULTATION_INSTITUTIONNELLE`.
- **Problème / Limitation :** Le délégué provincial cumule le pouvoir d'ordonner la distribution et de valider les entrées/sorties physiques du magasin.
- **Conséquence opérationnelle :** Violation du principe de séparation des devoirs logistiques et administratifs, propice aux coulagess ou aux manipulations d'inventaire sans contre-signature.
- **Gravité :** `P1`
- **Recommandation fonctionnelle :** Créer un profil provincial `RESPONSABLE_STOCK_PROVINCIAL` ou `GESTIONNAIRE_MAGASIN` dédié aux réceptions, inventaires et sorties physiques.
- **Recommandation technique :** Ajouter le rôle dans `ROLES_UTILISATEUR` et restreindre les routes `/api/stocks/*` en écriture à ce rôle sous visa du délégué.
- **Fichiers concernés :** [shared/constantes/roles.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/shared/constantes/roles.ts), [backend/src/middlewares/rbac.middleware.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/middlewares/rbac.middleware.ts).
- **Priorité :** `P1`

---

### `SIGAD-AUD-007` — Compte du délégué provincial de Sila verrouillé
- **Module :** Administration des comptes
- **Parcours :** Connexion délégué Sila (`usr-sila`)
- **Fonctionnement actuel :** Dans `sigad-staging-db`, `usr-sila` a `statut = 'VERROUILLE'`.
- **Problème / Limitation :** Impossible de se connecter en tant que délégué de Sila pour tester la réception des dossiers provinciaux de la province pilote visée par l'Arrêté n°0033.
- **Conséquence opérationnelle :** Blocage de la recette provinciale sur la province historique pilote.
- **Gravité :** `P1`
- **Recommandation fonctionnelle :** Réactiver ou réinitialiser le compte `usr-sila` via l'interface d'administration centrale ou propriétaire lors de la prochaine fenêtre de maintenance autorisée.
- **Recommandation technique :** Exécuter une procédure administrative de déverrouillage via `/api/administration/comptes/delegues/usr-sila/reactiver`.
- **Fichiers concernés :** [backend/src/routes/comptes.routes.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/routes/comptes.routes.ts).
- **Priorité :** `P1`

---

### `SIGAD-AUD-008` — Déconnexion structurelle entre Approvisionnement central et Opération de distribution
- **Module :** Approvisionnements & Opérations centrales
- **Parcours :** Approvisionnements $\rightarrow$ Opérations centrales
- **Fonctionnement actuel :** La table `approvisionnements_centraux` gère ses lots indépendamment de la table `operations_centrales_distribution`.
- **Problème / Limitation :** Rien n'indique formellement si un approvisionnement ONASA de 500 tonnes de sorgho est alloué au titre de l'Opération n°0033/2026 ou d'une autre campagne d'urgence.
- **Conséquence opérationnelle :** Risque de double affectation d'un même stock ou difficulté à consolider le coût et les volumes réels consommés par une opération centrale donnée.
- **Gravité :** `P2`
- **Recommandation fonctionnelle :** Permettre de lier un approvisionnement central à une opération centrale via un champ optionnel `operation_centrale_id`.
- **Recommandation technique :** Ajouter `ALTER TABLE approvisionnements_centraux ADD COLUMN operation_centrale_id TEXT REFERENCES operations_centrales_distribution(id);`.
- **Fichiers concernés :** [backend/src/routes/approvisionnements.routes.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/routes/approvisionnements.routes.ts).
- **Priorité :** `P2`

---

### `SIGAD-AUD-009` — Absence de mode hors ligne pour les équipes de ciblage sur le terrain
- **Module :** PWA & Exécution terrain
- **Parcours :** Saisie terrain des ménages et des remises de vivres
- **Fonctionnement actuel :** L'application est une SPA PWA avec Service Worker généré, mais les requêtes API d'enregistrement de ménages ou de remises exigent une connexion HTTP active en temps réel.
- **Problème / Limitation :** En zone rurale tchadienne (ferricks, villages isolés du Sila ou du Wadi Fira), la connectivité 3G/4G est fréquemment inexistante.
- **Conséquence opérationnelle :** Les agents de terrain sont contraints de travailler sur fiches papier, puis de ressaisir ultérieurement, générant retards, erreurs de retranscription et risque de doublons.
- **Gravité :** `P2`
- **Recommandation fonctionnelle :** Mettre en place un mode « Collecte hors ligne » permettant le stockage local sécurisé (IndexedDB chiffré) des fiches de ménages et des remises, avec synchronisation par lot lors du retour en zone couverte.
- **Recommandation technique :** Implémenter une file d'attente de synchronisation IndexedDB + protocole d'idempotence renforcé.
- **Fichiers concernés :** [frontend/src/App.tsx](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/App.tsx), [frontend/vite.config.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/vite.config.ts).
- **Priorité :** `P2`

---

### `SIGAD-AUD-010` — Rigidité du statut `SOUMISE_A_APPROBATION` interdisant les corrections mineures
- **Module :** Opérations centrales
- **Parcours :** Opérations centrales $\rightarrow$ Modification
- **Fonctionnement actuel :** Une fois qu'une opération est passée de `BROUILLON` à `SOUMISE_A_APPROBATION`, [modifierOperationCentrale](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/operation-centrale.service.ts#L220) refuse toute modification avec l'erreur `Seul un projet en statut BROUILLON peut être modifié`.
- **Problème / Limitation :** Si le Comité de pilotage demande une correction mineure sur le libellé, une date ou les critères de ciblage, l'administrateur est bloqué : il n'existe pas de bouton « Renvoyer en brouillon » sans passer par une annulation.
- **Conséquence opérationnelle :** Obligation d'annuler l'opération et de recréer l'ensemble des données, ou de forcer l'approbation malgré des erreurs de rédaction.
- **Gravité :** `P2`
- **Recommandation fonctionnelle :** Autoriser une transition `SOUMISE_A_APPROBATION` $\rightarrow$ `BROUILLON` motivée par une demande de retouche du Comité.
- **Recommandation technique :** Ajouter `cible === "BROUILLON" && statutActuel === "SOUMISE_A_APPROBATION"` dans la machine à états de `changerStatutOperationCentrale`.
- **Fichiers concernés :** [backend/src/services/operation-centrale.service.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/operation-centrale.service.ts).
- **Priorité :** `P2`

---

### `SIGAD-AUD-011` — Dépendance aux invitations e-mail avec passerelle e-mail inactive
- **Module :** Inscription & Comptes
- **Parcours :** Administration des comptes $\rightarrow$ Renvoyer invitation
- **Fonctionnement actuel :** La variable d'environnement `EMAIL_DELIVERY_ENABLED` est configurée à `"false"` sur Staging.
- **Problème / Limitation :** Lorsqu'un administrateur clique sur « Renvoyer invitation », le code d'activation ne peut pas être reçu par le délégué via e-mail.
- **Conséquence opérationnelle :** L'administrateur doit transmettre manuellement le code d'activation par canal alternatif (téléphone, SMS, courrier officiel).
- **Gravité :** `P2`
- **Recommandation fonctionnelle :** Afficher directement le code d'activation généré dans une fenêtre modale réservée à l'administrateur pour lui permettre de le consigner dans le bordereau de transmission officiel.
- **Recommandation technique :** Retourner le `code_activation` clair dans la réponse JSON de l'approbation de candidature réservée à l'administrateur central.
- **Fichiers concernés :** [backend/src/services/comptes.service.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/comptes.service.ts), [frontend/src/components/administration/AdministrationComptes.tsx](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/administration/AdministrationComptes.tsx).
- **Priorité :** `P2`

---

### `SIGAD-AUD-012` — Cumul de pouvoirs techniques et d'audit sur le compte PROPRIETAIRE
- **Module :** Gouvernance & Sécurité
- **Parcours :** Compte Propriétaire
- **Fonctionnement actuel :** Le compte `PROPRIETAIRE` peut à la fois suspendre des comptes, réinitialiser des accès, gérer des données de test et consulter/exporter les journaux d'audit.
- **Problème / Limitation :** Absence de contre-pouvoir indépendant d'inspection ou d'audit externe.
- **Conséquence opérationnelle :** Risque de concentration de l'autorité suprême sur un compte unique sans journalisation vers un tiers de confiance externe.
- **Gravité :** `P2`
- **Recommandation fonctionnelle :** Prévoir un profil d'auditeur externe (`AUDITEUR_INDEPENDANT` ou `INSPECTION_GENERALE_ETAT`) avec accès en lecture seule inaltérable aux journaux d'audit.
- **Recommandation technique :** Scinder les permissions d'audit de sécurité des privilèges de maintenance.
- **Fichiers concernés :** [shared/constantes/roles.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/shared/constantes/roles.ts).
- **Priorité :** `P2`

---

### `SIGAD-AUD-013` — Débordement horizontal des tables larges sur smartphone
- **Module :** Interface Utilisateur / Responsive CSS
- **Parcours :** Navigation mobile $\rightarrow$ Tableau des consolidations / Allocations
- **Fonctionnement actuel :** Sur écran étroit (< 480px), les tableaux de 8 à 12 colonnes provoquent un débordement horizontal qui tronque l'affichage sans ascenseur dédié visible.
- **Problème / Limitation :** Difficulté de lecture des totaux et des boutons d'actions pour les délégués utilisant des téléphones Android.
- **Conséquence opérationnelle :** Erreurs potentielles de saisie ou de validation en mobilité.
- **Gravité :** `P3`
- **Recommandation fonctionnelle :** Adopter un affichage sous forme de cartes empilées (cards view) sur smartphone pour les listes de ménages et d'allocations.
- **Recommandation technique :** Ajouter un conteneur `.sigad-table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }` et des media queries spécifiques `@media (max-width: 768px)`.
- **Fichiers concernés :** [frontend/src/styles.css](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/styles.css), [frontend/src/components/administration/sigad-app-shell.css](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/administration/sigad-app-shell.css).
- **Priorité :** `P3`

---

### `SIGAD-AUD-014` — Exposition de libellés techniques internes dans les écrans
- **Module :** Ergonomie & Rédaction
- **Parcours :** Tous écrans
- **Fonctionnement actuel :** Certains messages ou sélecteurs affichent des termes informatiques tels que `INDETERMINE`, `DEX-TD-...`, `D1_MIGRATIONS`, `CSRF`.
- **Problème / Limitation :** Confusion pour les agents administratifs non techniciens.
- **Conséquence opérationnelle :** Sentiment de complexité inutile et hésitations lors des manipulations.
- **Gravité :** `P3`
- **Recommandation fonctionnelle :** Traduire systématiquement en français administratif clair :
  - `INDETERMINE` $\rightarrow$ « Statut initial à qualifier »
  - `DEX-...` $\rightarrow$ « Dossier provincial n°... »
  - `BROUILLON` $\rightarrow$ « Projet en cours de rédaction »
- **Recommandation technique :** Enrichir les dictionnaires de formattage dans `formatters.ts`.
- **Fichiers concernés :** [frontend/src/utils/formatters.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/utils/formatters.ts).
- **Priorité :** `P3`

---

### `SIGAD-AUD-015` — Confusion possible entre stock disponible comptable et stock physique
- **Module :** Tableaux de bord
- **Parcours :** Tableau de bord pilote $\rightarrow$ Indicateur « Stocks disponibles »
- **Fonctionnement actuel :** L'indicateur affiche une valeur brute unique sans décomposer la part réservée aux opérations en cours de la part physiquement disponible pour de nouvelles allocations.
- **Problème / Limitation :** Un décideur peut croire disposer de 1 000 tonnes alors que 800 tonnes sont déjà réservées pour une distribution en cours.
- **Conséquence opérationnelle :** Risque de surallocation ou d'engagement de vivres déjà promis à une province.
- **Gravité :** `P3`
- **Recommandation fonctionnelle :** Exposer deux indicateurs distincts :
  1. « Stock physique total »
  2. « Stock net non réservé (immédiatement allouable) »
- **Recommandation technique :** Mettre à jour l'agrégation dans [rapports.service.ts](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/services/rapports.service.ts) et la carte KPI dans [TableauBordPilote.tsx](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/pilote/TableauBordPilote.tsx).
- **Priorité :** `P3`
