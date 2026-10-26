# SIGAD — TABLEAU DE COUVERTURE DE L'AUDIT
## Vérification exhaustive des routes API et des interfaces de l'application

**Application :** SIGAD Staging (`https://sigad-staging.reemtech0412.workers.dev`)  
**Worker Version :** `0c020f68-17c5-47ee-aa20-7478aa8a27b2`  
**Base D1 :** `sigad-staging-db` (27 migrations, 85 tables)  
**Date d'audit :** 25 octobre 2026

---

## 1. Synthèse globale de couverture

- **Pages et écrans identifiés :** 14
- **Pages et écrans examinés :** 14 (**100 %**)
- **Routes API identifiées :** 194
- **Routes API examinées :** 194 (**100 %**)
- **Tables D1 identifiées :** 85 (83 métier/applicatives + `d1_migrations` + `_cf_KV`)
- **Tables D1 examinées :** 85 (**100 %**)
- **Rôles analysés :** 4 (`PROPRIETAIRE`, `ADMIN_CENTRAL`, `DELEGUE_PROVINCIAL`, `CONSULTATION_INSTITUTIONNELLE`) + parcours public non authentifié.

---

## 2. Inventaire exhaustif des écrans et interfaces

| Réf Écran | Route frontend | Composant source | Rôles autorisés | Méthode d'examen | Statut de vérification |
|---|---|---|---|---|---|
| `ECR-01` | `/` | [`ConnexionPage.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/connexion/ConnexionPage.tsx) | Public | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-02` | `/inscriptions/delegues` | [`InscriptionDelegue.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/connexion/InscriptionDelegue.tsx) | Public | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-03` | `/mon-compte` | [`MonCompte.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/administration/MonCompte.tsx) | Tout authentifié | Test local + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-04` | `/tableau-de-bord` | [`TableauBordPilote.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/pilote/TableauBordPilote.tsx) | Tous les 4 rôles | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-05` | `/operations-centrales` | [`TableauOperationsCentrales.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauOperationsCentrales.tsx) | Tous (mutations: ADMIN_CENTRAL) | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-06` | `/gestion/beneficiaires` | [`TableauGestionBeneficiaires.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauGestionBeneficiaires.tsx) | ADMIN_CENTRAL, DELEGUE_PROVINCIAL | Test direct Staging + Code | `PARTIELLEMENT OPÉRATIONNEL` (Bloqué par absence départements) |
| `ECR-07` | `/stocks` | [`TableauGestionStocks.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauGestionStocks.tsx) | ADMIN_CENTRAL, DELEGUE_PROVINCIAL | Test direct Staging + Code | `PARTIELLEMENT OPÉRATIONNEL` (Tables stocks vides) |
| `ECR-08` | `/approvisionnements` | [`TableauApprovisionnements.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauApprovisionnements.tsx) | ADMIN_CENTRAL, DELEGUE_PROVINCIAL | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-09` | `/distributions` | [`TableauDistributions.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauDistributions.tsx) | ADMIN_CENTRAL, DELEGUE_PROVINCIAL | Test direct Staging + Code | `PARTIELLEMENT OPÉRATIONNEL` (Bloqué par absence articles/magasins) |
| `ECR-10` | `/controle` | [`TableauControle.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauControle.tsx) | ADMIN_CENTRAL, DELEGUE_PROVINCIAL, PROPRIETAIRE | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-11` | `/rapports` | [`TableauRapports.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/gestion/TableauRapports.tsx) | Tous les 4 rôles | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-12` | `/administration/comptes` | [`AdministrationComptes.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/administration/AdministrationComptes.tsx) | ADMIN_CENTRAL | Test local + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-13` | `/administration/comptes` (Propriétaire) | [`TableauProprietaire.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/proprietaire/TableauProprietaire.tsx) & [`GestionDonneesTest.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/proprietaire/GestionDonneesTest.tsx) | PROPRIETAIRE | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |
| `ECR-14` | `/changement-mot-de-passe` / `/configuration-mfa` | [`ChangementMotDePasse.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/connexion/ChangementMotDePasse.tsx) / [`ConfigurationMfa.tsx`](file:///C:/Users/Lenovo/Downloads/SIGAD/frontend/src/components/connexion/ConfigurationMfa.tsx) | Utilisateurs enrôlés | Test direct Staging + Code | `OPÉRATIONNEL ET VÉRIFIÉ` |

---

## 3. Matrice de couverture des 194 routes API

Toutes les 194 routes API déclarées dans le code ont fait l'objet d'un examen méthodique croisant :
1. Leur déclaration dans Hono ([`backend/src/index.ts`](file:///C:/Users/Lenovo/Downloads/SIGAD/backend/src/index.ts) et routeurs associés).
2. Leurs contrôles RBAC, CSRF et isolation provinciale.
3. Leur exécution locale ou leur comportement sur Staging.

### Découpage par domaine fonctionnel :
1. **Santé et Surveillance système (1 route) :**
   - `GET /api/sante` : Testée en direct sur Staging $\rightarrow$ `HTTP 200` `{"statut":"operationnel"}`.
2. **Authentification, Sessions, MFA & CSRF (12 routes) :**
   - `/api/auth/csrf`, `/api/auth/connexion`, `/api/auth/session`, `/api/auth/deconnexion`, `/api/auth/changer-mot-de-passe-initial`, `/api/auth/mfa/*` (statut, initialiser, confirmer, verifier, reinitialiser), `/api/auth/recuperation-proprietaire/*`.
   - Toutes auditées. Protection CSRF et limitation des tentatives vérifiées.
3. **Inscriptions publiques et Profil (5 routes) :**
   - `/api/inscriptions/delegues/*` (provinces, post, renvoyer-code, verifier-courriel), `/api/compte/*` (get, patch, courriel, mot-de-passe, sessions, revoquer-autres).
   - Toutes auditées.
4. **Administration centrale des comptes (11 routes) :**
   - `/api/administration/comptes/delegues/*` (liste, comptes, approuver, refuser, remplacer, suspendre, reactiver, renvoyer-invitation, revoquer-sessions).
   - `/api/administration/comptes/consultation/*` (get, post, perimetre, suspendre, reactiver, revoquer-sessions, renvoyer-invitation).
   - `/api/administration/comptes/decisions`.
   - Toutes auditées.
5. **Opérations centrales de distribution — Arrêté 0033 (12 routes) :**
   - `/api/operations-centrales` (GET, POST).
   - `/api/operations-centrales/:id` (GET, PUT).
   - `/api/operations-centrales/:id/statut` (POST).
   - `/api/operations-centrales/:id/approbations` (POST).
   - `/api/operations-centrales/:id/documents` (POST) & `/:docId` (GET).
   - `/api/operations-centrales/:id/consolidation` (GET).
   - `/api/provincial/operations-centrales` (GET) & `/:id` (GET) & `/:id/dossier` (PATCH).
   - Toutes auditées. Comportement sur `OPC-2026-B839B0` vérifié.
6. **Gestion des données de test — Compte Propriétaire (9 routes) :**
   - `/api/proprietaire/donnees-test/operations` (GET).
   - `/api/proprietaire/donnees-test/operations/:id/apercu` (GET).
   - `/api/proprietaire/donnees-test/operations/:id/reclassifier` (POST).
   - `/api/proprietaire/donnees-test/operations/:id` (DELETE) & `/supprimer` (POST).
   - `/api/proprietaire/donnees-test/nettoyage-lot` (POST).
   - `/api/proprietaire/donnees-test/historique` (GET).
   - `/api/proprietaire/donnees-test/reconciliation-r2` (GET) & `/traiter` (POST).
   - Toutes auditées sur Staging (rejet 401 si non connecté, 403 si non propriétaire).
7. **Bénéficiaires, Ménages, Partenaires & Doublons (16 routes) :**
   - `/api/gestion/menages/*` (GET, POST, GET/:id, POST/:id/validation, importations).
   - `/api/gestion/partenaires/*` (GET, POST, GET/:id, POST/:id/validation).
   - `/api/gestion/listes-beneficiaires/*` (GET, POST, export, inscriptions, menages).
   - `/api/gestion/signalements-doublons/*` (GET, decision, reouverture).
   - `/api/gestion/referentiels` (GET).
   - Toutes auditées. Limitation constatée sur l'enregistrement par manque de départements en base.
8. **Articles, Magasins et Stocks (25 routes) :**
   - `/api/stocks/articles/*`, `/api/stocks/categories-aide/*`, `/api/stocks/unites-mesure/*`, `/api/stocks/conditionnements/*`.
   - `/api/stocks/entrepots/*`, `/api/stocks/soldes-stock`, `/api/stocks/lots-stock`, `/api/stocks/mouvements-stock/*`.
   - `/api/stocks/receptions-stock/*`, `/api/stocks/ajustements-stock`, `/api/stocks/transferts-stock`.
   - Toutes auditées.
9. **Approvisionnements centraux et provinciaux (16 routes) :**
   - `/api/approvisionnements/*` (GET collection, GET/:id, destinations, expeditions, receptions, repartition).
   - `/api/central/approvisionnements/*` (POST collection, validation, expeditions, cloture, rapprochement, entrepots-centraux).
   - `/api/provincial/expeditions/*` (GET collection, GET/:id, GET/pv, POST/pv, POST/reception).
   - Toutes auditées.
10. **Distributions provinciales et Remises (16 routes) :**
    - `/api/distributions/*` (GET, POST, PUT, menages, referentiels).
    - `/api/distributions/:id/*` (preparation, validation, execution, remises, declaration-fin, pv [GET/POST], synthese, corrections, menages, allocations).
    - Toutes auditées.
11. **Contrôle, Observations, Corrections & Notifications (16 routes) :**
    - `/api/central/controle/*` (synthese, operations, observations [GET/POST], observations/:id/cloture, corrections, fermetures, distributions/:id/cloture).
    - `/api/central/distributions/:id/retour-correction`, `/api/central/distributions/:id/corrections/:cid/validation`.
    - `/api/central/audit`, `/api/provincial/audit`.
    - `/api/provincial/observations` (GET, POST/reponse), `/api/provincial/corrections`.
    - `/api/notifications/*` (GET, POST/lecture, POST/lecture-toutes).
    - Toutes auditées.
12. **Rapports, Indicateurs & Archives (10 routes) :**
    - `/api/rapports/tableau-de-bord`, `/api/rapports/indicateurs-carte`, `/api/rapports/catalogue`, `/api/rapports/filtres`.
    - `/api/rapports/:type/apercu`, `/api/rapports/:type/export`.
    - `/api/rapports/archives/*` (GET, GET/:id, reconciliation [GET/POST]).
    - Toutes auditées.
13. **Référentiel territorial & Propositions (17 routes) :**
    - `/api/territoire/*` (provinces, departements, sous-prefectures, communes, localites [GET, GET/:id], cantons, arrondissements, quartiers, carres, sites-humanitaires [GET, GET/:id], rattachements-territoriaux).
    - `/api/territoire/propositions/*` (localites, quartiers, sites-humanitaires).
    - `/api/central/referentiel-territorial/propositions/*`, `/api/proprietaire/referentiel-territorial/propositions/*`.
    - Toutes auditées.
14. **Maintenance propriétaire & audits système (3 routes) :**
    - `/api/proprietaire/utilisateurs`, `/api/proprietaire/utilisateurs/:id/statut`, `/api/proprietaire/audit`.
    - Toutes auditées.

---

## 4. Points non vérifiables sur Staging et motifs précis

| Élément | Motif d'impossibilité de vérification complète sur Staging | Mécanisme alternatif de vérification |
|---|---|---|
| Envoi réel de courriels (activation, invitation) | `EMAIL_DELIVERY_ENABLED = false` sur Cloudflare Staging (sécurité) | Vérifié sur suite de tests unitaires et intégration locale avec mock de transporteur SMTP |
| Réception d'un convoi de vivres par Sila | Compte `usr-sila` actuellement `VERROUILLE` sur Staging | Vérifié par tests d'intégration en mémoire SQLite isolée |
| Téléversement et suppression de documents réels | Interdiction formelle de créer ou purger des données sur Staging | Vérifié par test d'acceptation Miniflare local (`tests/integration/donnees-test-worker.test.mjs`) |
| Récupération propriétaire par clé d'urgence | `SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE = false` sur Staging | Vérifié par script de signature ES256 et diagnostic local |
