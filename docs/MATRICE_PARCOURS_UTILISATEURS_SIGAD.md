# SIGAD — MATRICE EXHAUSTIVE DES PARCOURS UTILISATEURS
## Cartographie de bout en bout des circuits administratifs et opérationnels

**Système :** SIGAD (Système Intégré de Gestion des Aides et des Distributions)  
**Plateforme auditée :** Cloudflare Workers & D1 Staging (`https://sigad-staging.reemtech0412.workers.dev`)  
**Version Worker :** `0c020f68-17c5-47ee-aa20-7478aa8a27b2` | **Base D1 :** 27 migrations, 85 tables  
**Date d'audit :** 25 octobre 2026

---

## Format d'analyse standardisé

Chaque parcours est rigoureusement décrit selon le modèle d'enchaînement exigé :
`Rôle → Menu → Écran → Action → Validation → API → D1/R2 → Résultat → État suivant → Erreurs possibles`

---

## 1. Parcours Publics et Pré-authentifiés

### P-01 : Connexion au système avec mot de passe et MFA
- **Rôle :** Public / Tout utilisateur disposant d'un compte.
- **Menu :** Écran d'accueil `/`.
- **Écran :** Page de connexion ([`ConnexionPage.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/connexion/ConnexionPage.tsx)).
- **Action :** Saisir identifiant et mot de passe, puis valider.
- **Validation :** Jeton CSRF pré-authentification obligatoire, vérification du format, limitation des tentatives échouées (max 5 tentatives consécutives).
- **API :** `POST /api/auth/connexion`.
- **D1/R2 :** 
  - Lecture `utilisateurs` WHERE `identifiant = ?`.
  - Vérification hash PBKDF2-SHA256.
  - Insertion `evenements_connexion`.
  - Si compte central (`ADMIN_CENTRAL`, `PROPRIETAIRE`, `CONSULTATION_INSTITUTIONNELLE`) : génération défi dans `defis_mfa` et émission cookie temporaire HttpOnly `sigad_mfa_challenge`.
- **Résultat :** 
  - Si délégué provincial sans MFA : Session complète générée (`sigad_session_id`), redirection vers `/gestion/beneficiaires`.
  - Si compte central : Écran du défi TOTP affiché.
- **État suivant :** Authentifié OU Écran de défi MFA.
- **Erreurs possibles :** `Identifiants incorrects` (401), `Compte suspendu ou verrouillé` (403), `Trop de tentatives échouées` (429).

### P-02 : Validation du second facteur (MFA TOTP)
- **Rôle :** `ADMIN_CENTRAL`, `PROPRIETAIRE`, `CONSULTATION_INSTITUTIONNELLE`.
- **Menu :** Modal de défi TOTP.
- **Écran :** Saisie du code à 6 chiffres.
- **Action :** Saisie du code TOTP issu de l'application d'authentification (RFC 6238).
- **Validation :** Vérification HMAC-SHA1 temporelle (fenêtre ±1 pas de 30s), contrôle anti-rejeu dans `compteurs_totp_utilises`.
- **API :** `POST /api/auth/mfa/verifier`.
- **D1/R2 :** 
  - Lecture `defis_mfa` et secret dans `utilisateurs`.
  - Insertion `compteurs_totp_utilises` (protection anti-rejeu).
  - Insertion `sessions` (token cryptographique de 32 octets).
- **Résultat :** Session établie, émission du cookie sécurisé `sigad_session_id`.
- **État suivant :** Redirection vers `/tableau-de-bord` ou `/administration/comptes`.
- **Erreurs possibles :** `Code d’authentification incorrect ou déjà utilisé` (401), `Défi expiré` (401).

### P-03 : Candidature publique d'un délégué provincial
- **Rôle :** Public (candidat délégué).
- **Menu :** Lien « Inscription délégué » sur la page de connexion.
- **Écran :** [`InscriptionDelegue.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/connexion/InscriptionDelegue.tsx).
- **Action :** Renseigner nom complet, téléphone, courriel officiel, et choisir sa province parmi les 23 provinces disponibles.
- **Validation :** Format du numéro tchadien, validation e-mail, CSRF pré-authentification, vérification qu'aucun compte actif n'est déjà en poste sur cette province.
- **API :** `POST /api/inscriptions/delegues`.
- **D1/R2 :** Insertion dans `inscriptions_delegues` (statut: `EN_ATTENTE`).
- **Résultat :** Message de confirmation informant que la demande sera examinée par l'Administration Centrale.
- **État suivant :** Attente d'approbation administrative centrale.
- **Erreurs possibles :** `Un délégué est déjà en fonction pour cette province` (400), `Email déjà enregistré` (400).

---

## 2. Parcours du Compte PROPRIETAIRE

### P-04 : Consultation de l'annuaire des 25 comptes et statuts
- **Rôle :** `PROPRIETAIRE`.
- **Menu :** Administration des comptes $\rightarrow$ Onglet Comptes.
- **Écran :** [`TableauProprietaire.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/proprietaire/TableauProprietaire.tsx).
- **Action :** Parcourir la liste paginée des 25 comptes nationaux et provinciaux.
- **Validation :** Rôle `PROPRIETAIRE` dans le cookie de session vérifié par `authMiddleware` et `exigerRoles("PROPRIETAIRE")`.
- **API :** `GET /api/proprietaire/utilisateurs?limite=20&decalage=0`.
- **D1/R2 :** `SELECT id, identifiant, nom_complet, role, statut, province_id, double_facteur_actif FROM utilisateurs ORDER BY id ASC`.
- **Résultat :** Tableau complet avec indicateurs d'activation MFA, statut (`ACTIF`, `VERROUILLE`, `SUSPENDU`) et actions.
- **État suivant :** Consultation ou déclenchement d'une action de maintenance.
- **Erreurs possibles :** `Session expirée` (401), `Accès réservé au propriétaire` (403).

### P-05 : Suspension / Réactivation d'un compte utilisateur
- **Rôle :** `PROPRIETAIRE`.
- **Menu :** Administration des comptes $\rightarrow$ Liste des comptes $\rightarrow$ Bouton « Suspendre / Réactiver ».
- **Écran :** Ligne utilisateur concernée.
- **Action :** Cliquer sur le bouton d'inversion du statut.
- **Validation :** Jeton CSRF de session, interdiction absolue d'auto-suspension du compte propriétaire.
- **API :** `PATCH /api/proprietaire/utilisateurs/{id}/statut`.
- **D1/R2 :** 
  - `UPDATE utilisateurs SET statut = ?, modifie_le = datetime('now') WHERE id = ?`.
  - Si suspension : `DELETE FROM sessions WHERE utilisateur_id = ?` (révocation immédiate des sessions actives).
  - Insertion `journaux_audit`.
- **Résultat :** Statut basculé en base et actualisation de la vue.
- **État suivant :** Compte suspendu ou réactivé.
- **Erreurs possibles :** `Impossible de suspendre le compte propriétaire` (400).

### P-06 : Réinitialisation d'accès d'un compte bloqué
- **Rôle :** `PROPRIETAIRE`.
- **Menu :** Administration des comptes $\rightarrow$ Bouton « Réinitialiser l'accès ».
- **Écran :** Boîte de dialogue de confirmation.
- **Action :** Déclencher la génération d'un nouveau code d'activation pour un délégué ayant oublié ses identifiants.
- **Validation :** Jeton CSRF, rôle propriétaire.
- **API :** `POST /api/proprietaire/utilisateurs/{id}/reinitialiser-acces`.
- **D1/R2 :** 
  - Génération d'un code temporaire aléatoire (ex: `SIGAD-ACT-XXXX-XXXX`).
  - Hachage PBKDF2 et `UPDATE utilisateurs SET code_activation_hash = ?, doit_changer_mot_de_passe = 1, statut = 'ACTIF'`.
  - Insertion `journaux_audit`.
- **Résultat :** Code d'activation affiché dans une alerte sécurisée pour remise manuelle au délégué.
- **État suivant :** Délégué habilité à se reconnecter avec le code temporaire.
- **Erreurs possibles :** `Utilisateur introuvable` (404).

### P-07 : Inspection de la gouvernance des données de test
- **Rôle :** `PROPRIETAIRE`.
- **Menu :** Administration des comptes $\rightarrow$ Onglet « Données de test ».
- **Écran :** [`GestionDonneesTest.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/proprietaire/GestionDonneesTest.tsx).
- **Action :** Visualiser les opérations centrales classifiées selon leur nature (`REEL`, `TEST`, `INDETERMINE`).
- **Validation :** Rôle `PROPRIETAIRE`.
- **API :** `GET /api/proprietaire/donnees-test/operations?limite=15&nature=TOUTES`.
- **D1/R2 :** `SELECT ocd.*, COUNT(dp.id) AS nb_distributions FROM operations_centrales_distribution ocd LEFT JOIN distributions_provinciales dp ON dp.operation_centrale_id = ocd.id GROUP BY ocd.id`.
- **Résultat :** Liste affichant les badges de nature et le bouton « Inspecter l'éligibilité ».
- **État suivant :** Sélection d'une opération pour audit d'éligibilité.
- **Erreurs possibles :** `403 Forbidden` si appelé par un administrateur central.

### P-08 : Reclassification administrative d'une opération
- **Rôle :** `PROPRIETAIRE`.
- **Menu :** Gestion des données de test $\rightarrow$ Action « Reclassifier ».
- **Écran :** Modal de reclassification administrative.
- **Action :** Sélectionner la nature cible (`TEST` ou `REEL`), saisir le motif détaillé (min 10 caractères), les références de preuves, et le mot de passe actuel du propriétaire.
- **Validation :** Vérification du mot de passe propriétaire par PBKDF2 en temps constant, validation Zod des justifications.
- **API :** `POST /api/proprietaire/donnees-test/operations/{id}/reclassifier`.
- **D1/R2 :** 
  - `INSERT INTO demandes_reclassification_donnees (nature_initiale, nature_cible, motif, preuves, statut='APPROUVEE')`.
  - `UPDATE operations_centrales_distribution SET nature_donnees = ? WHERE id = ?`.
  - `INSERT INTO journaux_audit`.
- **Résultat :** Notification de reclassification réussie avec horodatage immuable.
- **État suivant :** Opération qualifiée (permettant la suppression si `TEST`).
- **Erreurs possibles :** `Mot de passe administrateur incorrect` (401), `Motif insuffisant` (400).

### P-09 : Suppression définitive et purge d'une opération de test
- **Rôle :** `PROPRIETAIRE`.
- **Menu :** Gestion des données de test $\rightarrow$ Action « Supprimer définitivement ».
- **Écran :** Modal de suppression irréversible.
- **Action :** Saisir le code exact de l'opération (ex: `OPC-2026-XXXX`), le motif de suppression et le mot de passe du propriétaire.
- **Validation :** 
  - Code opération rigoureusement identique.
  - Nature de l'opération = `TEST` (refus absolu sur `REEL` ou `INDETERMINE`).
  - Absence totale de distributions provinciales liées avec remises réelles ou mouvements de stock.
- **API :** `POST /api/proprietaire/donnees-test/operations/{id}/supprimer`.
- **D1/R2 :** 
  - Purge des documents R2 attachés dans le bucket `sigad-staging-documents`.
  - Transaction atomique `db.batch()` :
    - `INSERT INTO audits_suppression_donnees_test` (audit immuable avec perimètre JSON).
    - `DELETE FROM dossiers_execution_provinciaux WHERE operation_id = ?`.
    - `DELETE FROM operations_centrales_provinces WHERE operation_id = ?`.
    - `DELETE FROM approbations_operations WHERE operation_id = ?`.
    - `DELETE FROM documents_operations WHERE operation_id = ?`.
    - `DELETE FROM historique_operations_centrales WHERE operation_id = ?`.
    - `DELETE FROM operations_centrales_distribution WHERE id = ?`.
    - Si échec R2 : insertion dans `file_reconciliation_r2_orphelins`.
- **Résultat :** Suppression complète sans laisser d'orphelins en base.
- **État suivant :** Opération disparue de l'ensemble des modules opérationnels.
- **Erreurs possibles :** `L’opération contient des mouvements de stock réels : suppression interdite` (409), `Seule une opération classifiée TEST peut être supprimée` (400).

---

## 3. Parcours de l'Administration Centrale (ADMIN_CENTRAL)

### P-10 : Consultation du Tableau de Bord Pilote et de la Carte Interactive
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Menu principal $\rightarrow$ « Tableau de bord » (`/tableau-de-bord`).
- **Écran :** [`TableauBordPilote.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/pilote/TableauBordPilote.tsx) & [`CarteProvincesTchad.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/pilote/CarteProvincesTchad.tsx).
- **Action :** Visualiser les KPI nationaux, filtrer par période ou nature d'aide, et explorer la carte interactive des 23 provinces.
- **Validation :** Rôle `ADMIN_CENTRAL` (ou `PROPRIETAIRE`).
- **API :** 
  - `GET /api/rapports/tableau-de-bord`.
  - `GET /api/rapports/indicateurs-carte`.
- **D1/R2 :** Requêtes d'agrégation SQL sur `menages_distribution`, `remises_distribution`, `soldes_stock`, `operations_centrales_provinces`.
- **Résultat :** Affichage des compteurs de ménages ciblés/servis, quantités de vivres distribuées, et carte du Tchad colorée par niveau d'activité provinciale.
- **État suivant :** Clic sur une province pour filtrer ou passage aux opérations.
- **Erreurs possibles :** `401 Unauthorized` si session expirée.

### P-11 : Création d'une nouvelle Opération Centrale de Distribution
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Opérations centrales $\rightarrow$ Bouton « + Nouvelle opération ».
- **Écran :** Formulaire de cadrage national ([`TableauOperationsCentrales.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauOperationsCentrales.tsx)).
- **Action :** 
  - Renseigner l'intitulé, référence administrative, année de campagne (`2026-2027`), institution (`MASSNAH`), base juridique (`Arrêté n°0033/2026`).
  - Définir les critères d'éligibilité, prévisions nationales de ménages/personnes, calendrier.
  - Sélectionner les provinces ciblées (ex: Sila, Ouaddaï, Wadi-Fira ou l'ensemble des 23 provinces).
- **Validation :** Validateur Zod [`schemaCreationOperationCentrale`](file:///C:/Users/Lenovo/Downloads/SIGAD/shared/validations/operations-centrales.ts#L22), au moins une province obligatoire, clé d'idempotence UUID transmise.
- **API :** `POST /api/operations-centrales`.
- **D1/R2 :** 
  - `INSERT INTO operations_centrales_distribution` (statut: `BROUILLON`, nature: `REEL`).
  - `INSERT INTO operations_centrales_provinces` (liaisons territoriales).
  - `INSERT INTO historique_operations_centrales` (historique initial).
- **Résultat :** Code officiel généré automatiquement (ex: `OPC-2026-A1B2C3`), redirection vers l'écran de détail de l'opération.
- **État suivant :** Opération en statut `BROUILLON`.
- **Erreurs possibles :** `Sélectionnez au moins une province` (400), `Clé d’idempotence manquante` (400).

### P-12 : Soumission de l'opération pour approbation ministérielle
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Détail de l'opération centrale $\rightarrow$ Bouton « Soumettre à approbation ».
- **Écran :** Fiche synthétique de l'opération en statut `BROUILLON`.
- **Action :** Cliquer sur le bouton de soumission après vérification des prévisions.
- **Validation :** L'opération doit avoir au moins une province rattachée et être en statut `BROUILLON`.
- **API :** `POST /api/operations-centrales/{id}/statut`.
- **D1/R2 :** 
  - `UPDATE operations_centrales_distribution SET statut = 'SOUMISE_A_APPROBATION' WHERE id = ?`.
  - `INSERT INTO historique_operations_centrales (statut_precedent: 'BROUILLON', nouveau_statut: 'SOUMISE_A_APPROBATION')`.
- **Résultat :** Statut basculé, l'opération devient non modifiable pour préserver l'intégrité du dossier soumis.
- **État suivant :** Opération en statut `SOUMISE_A_APPROBATION`.
- **Erreurs possibles :** `Seul un brouillon peut être soumis à approbation` (409).

### P-13 : Enregistrement d'un acte formel d'approbation et téléversement de l'arrêté
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Détail opération $\rightarrow$ Onglet « Gouvernance & Approbations ».
- **Écran :** Formulaire d'acte de décision et zone de dépôt de documents.
- **Action :** 
  - Saisir type d'approbation (`COMITE_PILOTAGE` ou `VALIDATION_MINISTERIELLE`), instance décisionnaire, référence de l'acte, signataire et date.
  - Téléverser le document scanné de l'arrêté en PDF (via l'onglet Documents officiels).
- **Validation :** Référence obligatoire, type MIME vérifié par signature magique (`application/pdf`), taille maximale 10 Mo.
- **API :** 
  - `POST /api/operations-centrales/{id}/approbations`.
  - `POST /api/operations-centrales/{id}/documents` (multipart/form-data).
- **D1/R2 :** 
  - `INSERT INTO approbations_operations`.
  - `PUT` vers le bucket R2 `sigad-staging-documents/operations-centrales/{id}/{uuid}.pdf`.
  - `INSERT INTO documents_operations` (référencement de la clé R2).
- **Résultat :** Acte d'approbation visible dans le registre, document téléchargeable par lien sécurisé signé.
- **État suivant :** Opération prête pour approbation technique.
- **Erreurs possibles :** `Format de document invalide` (400).

### P-14 : Validation formelle et Ouverture de l'opération aux provinces
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Détail opération $\rightarrow$ Boutons d'avancement de statut.
- **Écran :** Fiche opération.
- **Action :** 
  1. Cliquer sur « Approuver l'opération » (passage à `APPROUVEE`).
  2. Cliquer sur « Ouvrir aux délégations provinciales » (passage à `OUVERTE`).
- **Validation :** 
  - Vérification automatique qu'au moins un acte d'approbation (`nb_approbations >= 1`) figure en base.
  - L'opération doit être `APPROUVEE` avant de pouvoir être `OUVERTE`.
- **API :** `POST /api/operations-centrales/{id}/statut`.
- **D1/R2 :** 
  - `UPDATE operations_centrales_distribution SET statut = 'OUVERTE'`.
  - Création automatique et atomique d'un dossier provincial d'exécution par province cible :
    `INSERT INTO dossiers_execution_provinciaux (id, operation_id, province_id, reference_dossier, statut_execution='ASSIGNE')`.
- **Résultat :** Les dossiers d'exécution provinciaux apparaissent instantanément dans les espaces des délégués provinciaux concernés.
- **État suivant :** Opération en statut `OUVERTE`.
- **Erreurs possibles :** `Au moins un acte formel d'approbation doit être enregistré` (400).

### P-15 : Création et expédition d'un approvisionnement central
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Logistique $\rightarrow$ Approvisionnements (`/approvisionnements`).
- **Écran :** [`TableauApprovisionnements.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauApprovisionnements.tsx).
- **Action :** 
  - Créer un lot d'approvisionnement (source: ONASA/Partenaire, référence, date).
  - Ajouter les provinces destinataires et affecter les quantités d'articles.
  - Valider l'approvisionnement et enregistrer une expédition avec référence de bordereau transporteur.
- **Validation :** Validations Zod, entrepôt central source valide, quantités positives.
- **API :** 
  - `POST /api/central/approvisionnements`.
  - `POST /api/central/approvisionnements/{id}/validation`.
  - `POST /api/central/approvisionnements/{id}/expeditions`.
- **D1/R2 :** 
  - `INSERT INTO approvisionnements_centraux`.
  - `INSERT INTO destinations_approvisionnement`.
  - `INSERT INTO expeditions (statut: 'EN_TRANSIT')`.
  - `INSERT INTO mouvements_stock (type: 'SORTIE_EXPEDITION')`.
- **Résultat :** Expédition marquée en transit, visible par le délégué provincial destinataire pour réception.
- **État suivant :** En attente de réception provinciale.
- **Erreurs possibles :** `Stock insuffisant dans l'entrepôt central` (400).

### P-16 : Clôture nationale et libération des stocks
- **Rôle :** `ADMIN_CENTRAL`.
- **Menu :** Contrôle et notifications $\rightarrow$ Onglet Fermetures.
- **Écran :** [`TableauControle.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauControle.tsx).
- **Action :** Examiner une distribution provinciale terminée (`TERMINEE_PROVINCE`), contrôler l'absence d'écarts ou approuver les justifications, puis clôturer.
- **Validation :** Procès-verbal obligatoire, réconciliation des lots de stocks.
- **API :** `POST /api/central/distributions/{id}/cloture`.
- **D1/R2 :** 
  - `UPDATE distributions_provinciales SET statut = 'CLOTUREE_CENTRAL'`.
  - Calcul du reliquat de stock réservé non distribué.
  - `INSERT INTO mouvements_stock (type: 'LIBERATION_RESERVATION')` (remise dans le solde disponible).
- **Résultat :** Distribution clôturée définitivement, stocks résiduels libérés pour la province.
- **État suivant :** Clôture archivée.
- **Erreurs possibles :** `Le procès-verbal de distribution est obligatoire pour clôturer` (400).

---

## 4. Parcours du Délégué Provincial (DELEGUE_PROVINCIAL)

### P-17 : Prise en charge d'un dossier d'exécution central
- **Rôle :** `DELEGUE_PROVINCIAL`.
- **Menu :** Opérations centrales $\rightarrow$ Vue provinciale.
- **Écran :** [`TableauOperationsCentrales.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauOperationsCentrales.tsx).
- **Action :** Consulter l'opération centrale ouverte à sa province et renseigner les éléments préparatoires locaux.
- **Validation :** Isolation provinciale stricte (`isolationProvinciale` vérifie que `province_id` correspond au compte session).
- **API :** 
  - `GET /api/provincial/operations-centrales`.
  - `PATCH /api/provincial/operations-centrales/{id}/dossier`.
- **D1/R2 :** `UPDATE dossiers_execution_provinciaux SET plan_operationnel_local = ?, observations_delegue = ?, statut_execution = 'EN_PREPARATION'`.
- **Résultat :** Dossier provincial enrichi, prêt pour le rattachement de la distribution locale.
- **État suivant :** Dossier provincial en statut `EN_PREPARATION`.
- **Erreurs possibles :** `Accès refusé aux données d’une autre délégation provinciale` (403).

### P-18 : Réception d'une expédition de vivres au magasin provincial
- **Rôle :** `DELEGUE_PROVINCIAL`.
- **Menu :** Approvisionnements $\rightarrow$ Expéditions provinciales.
- **Écran :** Formulaire de réception de convoi ([`TableauApprovisionnements.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauApprovisionnements.tsx)).
- **Action :** 
  - Pointer les articles reçus par rapport au bordereau d'expédition.
  - Renseigner les quantités physiques acceptées, endommagées et manquantes.
  - Joindre le scan du PV de réception contradictoire signé avec le transporteur.
- **Validation :** Somme des quantités (acceptée + avarie + manque = reçue), fichier PV PDF/image obligatoire si écart constaté.
- **API :** 
  - `POST /api/provincial/expeditions/{id}/reception`.
  - `POST /api/provincial/expeditions/{id}/pv`.
- **D1/R2 :** 
  - `INSERT INTO receptions_provinciales`.
  - `INSERT INTO lignes_reception_provinciale`.
  - `INSERT INTO mouvements_stock (type: 'RECEPTION', entrepot_id: entrepot_provincial)`.
  - `UPDATE soldes_stock` (incrément du stock physique provincial).
  - Stockage PV dans R2 et liaison dans `pieces_jointes`.
- **Résultat :** Stock disponible provincial incrémenté, alerte envoyée à l'administration centrale en cas d'avarie.
- **État suivant :** Expédition réceptionnée.
- **Erreurs possibles :** `La justification et le PV sont obligatoires en présence d'écarts` (400).

### P-19 : Enregistrement d'un ménage bénéficiaire
- **Rôle :** `DELEGUE_PROVINCIAL`.
- **Menu :** Gestion des bénéficiaires $\rightarrow$ Onglet Ménages $\rightarrow$ « + Nouveau ménage ».
- **Écran :** Formulaire de recensement ([`TableauGestionBeneficiaires.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauGestionBeneficiaires.tsx)).
- **Action :** 
  - Localiser le ménage (Province, Département, Sous-préfecture/Commune, Localité ou Site humanitaire).
  - Saisir le chef de ménage (nom, sexe, téléphone, catégorie de population, vulnérabilités).
  - Ajouter la composition familiale (membres, liens de parenté, âge).
- **Validation :** 
  - Schéma Zod `schemaMenage`.
  - Détection automatique de doublon sur (nom_chef + telephone) ou (nom_chef + departement).
- **API :** `POST /api/gestion/menages`.
- **D1/R2 :** 
  - `INSERT INTO menages (statut: 'ACTIF', statut_validation: 'A_VERIFIER')`.
  - `INSERT INTO membres_menage`.
  - Si risque de doublon détecté : `INSERT INTO signalements_doublons` et `statut = 'DOUBLON_SUSPECTE'`.
- **Résultat :** Code ménage unique généré (ex: `MEN-SI-2026-0045`), fiche enregistrée.
- **État suivant :** Ménage en attente de validation centrale.
- **Erreurs possibles :** `L’identifiant du département est invalide` (400 si la table département est vide).

### P-20 : Planification et exécution d'une distribution provinciale
- **Rôle :** `DELEGUE_PROVINCIAL`.
- **Menu :** Distributions provinciales $\rightarrow$ « + Nouvelle distribution ».
- **Écran :** [`TableauDistributions.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauDistributions.tsx).
- **Action :** 
  - Lier éventuellement au dossier d'exécution de l'opération centrale (`dossier_execution_id`).
  - Sélectionner la zone (sites de distribution), l'entrepôt de départ et les articles avec ration par ménage.
  - Sélectionner la liste de ménages bénéficiaires éligibles.
  - Valider le plan (réservation des stocks) et passer en exécution.
  - Saisir les émargements au fur et à mesure des remises (statuts: `SERVI`, `PARTIELLEMENT_SERVI`, `ABSENT`).
  - Téléverser le procès-verbal de clôture et déclarer la fin des opérations.
- **Validation :** Stocks suffisants dans l'entrepôt pour couvrir les rations prévues, émargement signé.
- **API :** 
  - `POST /api/distributions`.
  - `POST /api/distributions/{id}/preparation`.
  - `POST /api/distributions/{id}/validation`.
  - `POST /api/distributions/{id}/execution`.
  - `POST /api/distributions/{id}/remises`.
  - `POST /api/distributions/{id}/pv`.
  - `POST /api/distributions/{id}/declaration-fin`.
- **D1/R2 :** 
  - `INSERT INTO distributions_provinciales`.
  - `INSERT INTO reservations_stock` et `INSERT INTO mouvements_stock (type: 'RESERVATION')`.
  - `INSERT INTO remises_distribution` et `INSERT INTO mouvements_stock (type: 'SORTIE_DISTRIBUTION')`.
  - `UPDATE distributions_provinciales SET statut = 'TERMINEE_PROVINCE'`.
- **Résultat :** Distribution exécutée, stock débité, dossier transmis à l'administration centrale pour contrôle et clôture.
- **État suivant :** En attente de clôture centrale.
- **Erreurs possibles :** `Stock non réservé insuffisant pour valider cette distribution` (409).

---

## 5. Parcours du Compte de Consultation Institutionnelle (CONSULTATION_INSTITUTIONNELLE)

### P-21 : Consultation des rapports agrégés et exports autorisés
- **Rôle :** `CONSULTATION_INSTITUTIONNELLE` (Partenaires, Bailleurs, Observateurs).
- **Menu :** Rapports et tableaux de bord (`/rapports`).
- **Écran :** [`TableauRapports.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauRapports.tsx).
- **Action :** Sélectionner un rapport non sensible (ex: `RAPPORT_NATIONAL_CONSOLIDE`, `ETAT_STOCKS`, `RAPPORT_COUVERTURE_GEOGRAPHIQUE`), visualiser l'aperçu et exporter en PDF, Excel ou CSV.
- **Validation :** 
  - Middleware `limiterRapportsConsultation` interdisant formellement l'accès aux rapports nominatifs (`LISTE_BENEFICIAIRES`, `LISTE_EMARGEMENT`).
  - Toutes les routes de mutation (`POST`, `PUT`, `DELETE`) sont strictement bloquées par `refuserAccesOperationnelConsultation`.
- **API :** 
  - `GET /api/rapports/catalogue`.
  - `GET /api/rapports/{type}/apercu`.
  - `POST /api/rapports/{type}/export` (form-data).
- **D1/R2 :** Requêtes en lecture seule sur les tables consolidées, génération du document dans le Worker.
- **Résultat :** Téléchargement du fichier chiffré sans fuite de données personnelles de ménages.
- **État suivant :** Écran de consultation inchangé.
- **Erreurs possibles :** `Cette ressource n’est pas autorisée pour un compte de consultation` (403 si tentative d'accès à des données nominatives).
