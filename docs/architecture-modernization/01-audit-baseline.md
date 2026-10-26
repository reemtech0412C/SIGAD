# 01 — Phase 0 : Audit de référence (baseline)

> Date : 2026-10-26 · Périmètre : dépôt local `SIGAD` (aucune base distante, aucun déploiement, aucun push).
> Méthode : lecture ciblée + outils reproductibles (`tools/`) + exécution des suites de tests existantes.
> Les éléments **déjà documentés** dans `docs/` (≈ 310 fichiers) ne sont pas ré-analysés ; ils sont cités quand une affirmation a été **re-vérifiée contre le code** (c'est là que les écarts sont apparus).

Légende **Confiance** : `Confirmé` = reproduit par exécution ou lecture directe du code/DDL · `Lecture` = déduit de la lecture du code, test à écrire pour confirmer · `À vérifier` = hypothèse non prouvée.
Légende **Gravité** : `Critique` · `Haute` · `Moyenne` · `Basse`.

---

## 1. État factuel du système

| Élément | Constat |
|---|---|
| Stack | Cloudflare Workers + Hono 4.13 + D1 (SQLite) + R2 · React 19 · Vite 8 · Tailwind 4 · PWA (`vite-plugin-pwa`) · TypeScript 7.0.2 · Zod 4 · Vitest 4 · Playwright |
| Taille | `backend/` 45 fichiers (~1 Mo) · `frontend/` 91 fichiers · `shared/` 19 · `migrations/` 35 · `scripts/` 52 · `tests/` 313 fichiers (253 fixtures) · `docs/` 310 fichiers (28 Mo) |
| Backend | 14 modules de routes (≈ 216 routes déclarées, matrice générée `docs/matrice-securite-api-phase9.md`), 28 services |
| Schéma | **86 tables, 133 triggers, 134 index, 0 vue** (les 35 migrations s'appliquent sans erreur sur SQLite en mémoire — `evidence/inventaire-schema.json`) |
| Données de référence après migrations | 23 provinces · 112 départements · N'Djaména : 10 arrondissements + 19 quartiers · **1 seule localité** · 25 comptes (voir F-17) |
| Rôles applicatifs | 7 : `PROPRIETAIRE`, `ADMIN_CENTRAL`, `DELEGUE_PROVINCIAL`, `CONSULTATION_INSTITUTIONNELLE`, `RESPONSABLE_STOCK`, `SUPERVISEUR_TERRAIN`, `AGENT_DISTRIBUTION` |
| Frontend | SPA unique, un seul `SIGADAppShell`, navigation par module filtrée par rôle (`App.tsx`, `navigation-config.ts`), 9 composants de module « Tableau* » + écrans territoire/comptes, de 15 à 70 Ko |
| Environnements | `wrangler.toml` (production, **suivi par git**), `wrangler.staging.toml` et `wrangler.integration.toml` (**non suivis**) |

### 1.1 État Git (risque majeur)

* HEAD : `371f0be fix(security): close Phase 9 acceptance gaps`.
* **67 fichiers modifiés, 1 supprimé, 302 non suivis.** Seuls **128 fichiers sont suivis** (dont 3 sur 310 dans `docs/`).
* Non suivis : **migrations 0022 → 0035 (14 fichiers)**, `wrangler.staging.toml`, `wrangler.integration.toml`, 15 fichiers backend (routes/services), 36 fichiers frontend, 23 tests unitaires, 6 tests d'intégration, `sources/referentiel-territorial/`, toute la documentation de phases 10–12.
* Conséquence : tout l'historique de gouvernance des comptes, du référentiel territorial dynamique et des opérations centrales **n'existe que sur ce disque**.

### 1.2 Résultats des tests de référence (exécutés dans cette session)

| Suite | Commande | Résultat | Preuve |
|---|---|---|---|
| Typage | `npx tsc --noEmit -p tsconfig.json` | **exit 0, 0 erreur** | `evidence/baseline-tsc.txt` (vide) |
| Unitaires | `vitest run` (pool threads, 1 worker) | **31 fichiers, 151 tests, 151 OK** (11 s) | `evidence/baseline-unit.txt` |
| Matrice sécurité API | `generer-matrice-securite-phase9.mjs --check` | **PASS — 216 routes** | `evidence/baseline-secmatrix.txt` |
| Intégration (Wrangler local, D1 temporaire isolée, `wrangler.integration.toml`) | `node tests/integration/run-auth-worker.mjs` | **18 tests : 17 OK, 0 échec, 1 ignoré** (191 s) | `evidence/baseline-integration-resume.txt (journal condensé)` |
| Migrations | `tools/inventaire-schema-memoire.mjs` | **35/35 appliquées, 0 échec** (SQLite mémoire) | `evidence/inventaire-schema.json` |
| E2E Playwright | — | **Non exécuté** (nécessite build + navigateurs ; hors périmètre Phase 0) | — |

Notes : le test ignoré (« Inscription… sans fournisseur d'e-mail ») est volontairement exécuté à part avec `EMAIL_DELIVERY_ENABLED=false`. Le journal d'intégration montre un `POST /api/stocks/receptions-stock → 500` alors que la suite passe : très probablement une **injection de panne volontaire** (tests de rollback) — **À vérifier** en Batch 1.1.
Aucune base réelle n'a été touchée : la persistance D1 des tests est créée dans un dossier temporaire dédié par le runner.

---

## 2. Constats

### F-01 — Travail non versionné · **Critique** · Confirmé
Voir §1.1. Un `git clean`, une panne disque ou un mauvais `checkout` détruirait 14 migrations et le code associé.
**Action (Batch 0.1)** : commit(s) de point de référence sur une branche locale dédiée, après arbitrage de ce qui est versionné (captures d'écran, `sources/`, rapports de phases). Aucun push.

### F-02 — Régression de contrainte : refus d'un ménage impossible · **Haute** · Confirmé (schéma) / reproduction HTTP à écrire
* `0022` définit `menages.statut_validation IN ('A_VERIFIER','VALIDE','REFUSE')`.
* `0028` (L.106) reconstruit `menages` avec `IN ('VALIDE','A_VERIFIER','REJETE')` mais **conserve des triggers qui testent encore `'REFUSE'`** (L.714, 723).
* `backend/src/routes/gestion.routes.ts` (L.1414) écrit `'REFUSE'` quand la décision est `REFUSER` ; le type TS (L.92, L.171) déclare aussi `REFUSE`.
* Test reproductible : sur le schéma final, `UPDATE menages SET statut_validation='REFUSE'` → `CHECK constraint failed: statut_validation IN ('VALIDE','A_VERIFIER','REJETE')` (`evidence/inventaire-schema.json`, clé `test_ecriture_statut_REFUSE_sur_menages`).
* Les tests existants n'exercent que la branche `VALIDER` (`auth-worker.test.mjs` L.1141-1151).
* Effet probable : la décision « refuser un ménage » renvoie une erreur 500 en environnement migré 0028+.
**Action (Batch 1.2)** : écrire d'abord le test d'intégration rouge, puis trancher la valeur canonique (recommandation : `REJETE`, cohérente avec toutes les autres tables) via une **nouvelle migration** (les migrations existantes restent immuables) et alignement API/types/UI.

### F-03 — Rôles terrain largement inopérants côté API et contredisant la documentation · **Haute** · Lecture
`docs/MATRICE_RESPONSABILITES_ET_PERMISSIONS_SIGAD.md` (statut « PASS ») attribue des droits d'écriture à `SUPERVISEUR_TERRAIN` (enregistrer un ménage), `RESPONSABLE_STOCK` (réceptions, inventaire, sorties) et `AGENT_DISTRIBUTION` (émargement). Or, d'après `backend/src/index.ts` :

| Zone | Contrôle effectif en écriture | Conséquence pour les rôles terrain |
|---|---|---|
| `/api/gestion/*` (ménages, listes…) | `limiterMutationsGestion` : `ADMIN_CENTRAL` + `DELEGUE_PROVINCIAL` ; handlers : `ROLES_LECTURE`/`ROLES_OPERATIONNELS` sans rôles terrain | Aucun accès bénéficiaires |
| `/api/stocks/*` | `limiterMutationsStocks` : `ADMIN_CENTRAL` + `DELEGUE_PROVINCIAL` (la liste interne `ROLES_OPERATIONNELS` de `stocks.routes.ts` contient `RESPONSABLE_STOCK` mais est **inatteignable** en écriture) | `RESPONSABLE_STOCK` ne peut pas écrire |
| `/api/distributions/*` | écriture : `DELEGUE_PROVINCIAL` uniquement | `AGENT_DISTRIBUTION` ne peut pas émarger |
| `/api/provincial/*` | `exigerRoles("DELEGUE_PROVINCIAL")` | Réceptions provinciales fermées aux magasiniers |
| `/api/territoire/unites-dynamiques` | `ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE` **inclut les 3 rôles terrain** | Seule écriture métier ouverte aux rôles terrain |

En parallèle, le frontend (`App.tsx` › `autorise()`) laisse ces rôles ouvrir les modules stocks/distributions/approvisionnements.
Interprétation : le modèle « rôles terrain » (migration 0030) a été ajouté en surcouche sans que la couche d'autorisation d'entrée (`index.ts`) soit mise à jour, et la documentation « PASS » décrit l'intention, pas le comportement.
**Action (Batch 2.1)** : test paramétré rôle × route (généré depuis la matrice) qui fige le comportement **actuel**, puis décision métier explicite sur le comportement **cible** (cf. `03-architecture-cible.md` §3). Ne rien élargir avant ce test.

### F-04 — Le propriétaire accède aux données opérationnelles et bénéficiaires · **Haute** · Confirmé (code)
`ROLES_LECTURE` de `gestion.routes.ts` = `PROPRIETAIRE, ADMIN_CENTRAL, DELEGUE_PROVINCIAL` ; `/api/rapports/*` et les lectures de stocks incluent `PROPRIETAIRE`. Le frontend masque le module « bénéficiaires » au propriétaire (`autorise`), mais **l'API reste ouverte**. Contredit l'exigence « console propriétaire indépendante des opérations quotidiennes » et le principe de moindre privilège pour des données sensibles.

### F-05 — Autorisation dispersée, non déclarative · **Moyenne** · Confirmé
Trois mécanismes superposés : (1) `exigerRoles` par préfixe dans `index.ts`, (2) 6 limiteurs en ligne + 1 refus global « consultation » (`limiterMutationsGestion/Stocks/Distributions/OperationsCentrales`, `limiterRapportsConsultation`, `limiterPropositionsTerritoriales`) avec des regex de chemin, (3) constantes `ROLES_*` redéfinies dans chaque fichier de routes. Aucun catalogue de permissions ; l'ajout d'un rôle exige de toucher 6+ fichiers (cause directe de F-03). Le contrôle d'isolation provinciale (`isolationProvinciale`) repose sur l'inspection du chemin (`/prov-…`), de la query et du corps JSON : fragile et contournable par toute nouvelle route qui n'utiliserait pas ces noms de paramètres.

### F-06 — Stockage des rôles éclaté · **Moyenne** · Confirmé
`utilisateurs.role` n'accepte que 3 valeurs (`CHECK` de 0001, jamais étendu) alors que le type TS en compte 7. Le rôle effectif est recalculé **à chaque requête** par un `CASE` sur 3 tables (`utilisateurs`, `comptes_consultation`, `profils_operationnels_terrain`) dans `auth.middleware.ts`. Un compte unique ne peut avoir qu'un rôle effectif ; aucun rôle multiple, aucune portée au niveau département/site, aucune permission fine. `province_id` est un scalaire (sauf consultation : table de périmètre provincial).

### F-07 — Audit fragmenté, « inaltérabilité » non appliquée · **Moyenne/Haute** · Confirmé
* `journaux_audit` n'est alimenté que par 3 emplacements (`audit.middleware.ts`, `auth.routes.ts`, `validation-territoire.routes.ts`). Chaque domaine a son journal propre : `audits_territoire`, `historique_statuts`, `historique_operations_centrales`, `decisions_comptes`, `journaux_inscriptions`, `audits_suppression_donnees_test`, `historique_decoupages` (une seule écriture, aucune lecture).
* Les docs affirment « journal inaltérable ». Les seuls triggers d'immutabilité trouvés visent `historique_statuts` (0016) et l'historique des signalements (0022). **Aucun** sur `journaux_audit`, `audits_territoire`, `decisions_comptes`.
**Action** : journal d'audit unifié append-only (cible §3.5) ; migration des écritures par adaptateur, sans supprimer les journaux existants.

### F-08 — Modèle géographique : tables par niveau, ménage à 9 clés géographiques · **Moyenne/Haute** · Confirmé
* Tables distinctes : `provinces`, `departements`, `sous_prefectures`, `communes`, `cantons`, `localites`, `arrondissements`, `quartiers`, `carres`, `sites_humanitaires`.
* `menages` porte `province_id`, `departement_id`, `sous_prefecture_id`, `commune_id`, `localite_id`, `arrondissement_id`, `quartier_id`, `carre_id`, `site_humanitaire_id` (tous nullables sauf province) ; la cohérence repose sur des triggers (133 dans le schéma ; supprimés et recréés à chaque refonte : 0028 en supprime et recrée 33, 0035 en supprime 38 et en recrée 36).
* Identifiants = slugs textuels (`prov-…`) ; pas de code stable externe (p-code OCHA/INSEED) en colonne ; le rapprochement `matching-cod-ab-adm1-ui-map-1.csv` existe seulement comme source.
* Historique des rattachements : trois mécanismes parallèles (`historique_decoupages`, `correspondances_fusions_territoriales`, `audits_territoire`), sans période de validité (« rattachement valable du… au… »).
* Isolation par province uniquement (aucune portée département/site).

### F-09 — Migration 0035 destructive et code encore dépendant des communes · **Haute** · Confirmé
`0035` exécute `DELETE FROM rattachements_territoriaux; DELETE FROM communes;` (500 communes de la Loi 015), met à NULL `commune_id` dans `localites`, `arrondissements`, `sites_humanitaires`, `menages`, `distributions_provinciales`, supprime 38 triggers (36 recréés) et reconstruit `localites`/`cantons` (le commentaire de la migration reconnaît que `PRAGMA foreign_keys = OFF` est sans effet sous D1). Les CSV sources sont conservés (`sources/referentiel-territorial/`), donc la perte est récupérable **si** ces sources sont versionnées (F-01).
Le code lit toujours `communes`/`rattachements_territoriaux` (`territoire.routes.ts` L.188-229, 570, 687 ; `territoire.service.ts` L.93 ; `administration-territoriale.service.ts` L.1614) : chemins devenus vides après 0035 → code hérité (voir `02-audit-code-mort.md`).
Le statut de déploiement staging de 0028–0035 **n'a pas été vérifié ici** (voir `docs/PLAN_DEPLOIEMENT_STAGING_MIGRATIONS_0028_0034.md`).

### F-10 — Unités territoriales dynamiques créées « VALIDE » · **Moyenne** · Confirmé (code)
`POST /api/territoire/unites-dynamiques` appelle `creerUniteTerritorialeDynamique`. Les rôles `RESPONSABLE_STOCK`, `SUPERVISEUR_TERRAIN` et `AGENT_DISTRIBUTION` sont autorisés par `ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE`; le service écrit les unités dynamiques à l'état `VALIDE` (pour les sous-préfectures, le champ omis reprend le défaut `VALIDE` défini en migration 0035). La création d'un département est une exception, limitée au propriétaire et à l'administration centrale. Références : `backend/src/index.ts` (limiteur d'écriture), `shared/constantes/roles.ts` (rôles), `backend/src/routes/territoire.routes.ts` (route), `backend/src/services/territoire.service.ts` (insertions) et `migrations/0035_refonte_territoriale_dynamique_sans_communes.sql` (défaut). Le risque métier demeure : une unité peut être marquée valide sans certification administrative officielle, contrairement au principe « ne pas inventer de découpage ».

### F-11 — Enregistrement des bénéficiaires : bonne base, non prête pour Android · **Haute** · Confirmé
Existant solide : ménage + membres, détection de doublons **par signalement sans fusion automatique** (`signalements_doublons`, revue `CONFIRME_DISTINCT/DOUBLON`), `X-Idempotency-Key` obligatoire sur l'import avec hachage du contenu (409 si clé réutilisée avec un autre contenu), clé stockée par utilisateur+route (`creerCleStockee`), validation centrale `A_VERIFIER → VALIDE`, trigger d'immuabilité des ménages figés dans une distribution.
Manques pour un client mobile : aucun `device_id` / `client_local_id` ; pas de numéro de version ni d'ETag par enregistrement ; pas de journal de synchronisation ni de file de conflits ; API non versionnée (`/api/...`), erreurs sans code machine (`{ erreur: string }`), pas d'OpenAPI ; authentification cookie + CSRF + MFA (inadaptée à un client natif) ; pas de pièces jointes bénéficiaires (les `pieces_jointes` servent au contrôle) ; `DEFAULT 'VALIDE'` sur `menages.statut_validation` (toute insertion qui omet le champ est auto-validée — le code applicatif le fixe explicitement à `A_VERIFIER` pour les doublons, à vérifier pour les autres chemins).

### F-12 — Pas de registre d'appareils ni de jetons non-cookie · **Moyenne** · Confirmé
Table `sessions` (jeton haché, `revoquee`, IP, user-agent) ; listing + « révoquer les autres » (`/api/compte/sessions`), révocation par compte pour délégués et consultation (`/delegues/:id/revoquer-sessions`, `/consultation/:id/revoquer-sessions`). Aucun concept d'appareil (`grep appareil|device_id` → 0 résultat).

### F-13 — Pas de feature flags ; tables mortes · **Basse** · Confirmé
`parametres_systeme` (0001) et `affectations_partenaires` (0003) n'ont **aucune référence** dans `backend/`, `shared/` ou `frontend/src/` (`evidence/inventaire-schema.json`). Aucune infrastructure de drapeaux de fonctionnalités.

### F-14 — Mode hors-ligne : prototype non branché · **Moyenne** · Confirmé
`frontend/src/services/hors-ligne.service.ts` n'est importé par **aucun** module frontend (seul son test l'utilise). `ARCHITECTURE_MODE_HORS_LIGNE_SIGAD.md` le déclare « PASS ». L'architecture décrite (file d'idempotence, `CONFLIT_A_ARBITRER`) n'existe pas côté serveur. Elle doit être reprise pour Android (cible §5), pas pour la PWA.

### F-15 — Frontend : un seul shell, mêmes écrans pour tous, pas d'i18n · **Moyenne/Haute** · Confirmé
* Un seul `TableauBordPilote` et un seul `SIGADAppShell` pour les trois profils (propriétaire / central / délégué) ; seule la liste des entrées de menu change. Le propriétaire a un composant dédié (`TableauProprietaire`), le central et le délégué partagent presque tout.
* Textes français codés en dur ; `index.html` = `lang="fr" dir="ltr"` statique ; aucune couche i18n, aucune gestion RTL.
* Composants volumineux : `AdministrationTerritoriale` 69 Ko, `TableauDistributions` 63 Ko, `TableauOperationsCentrales` 59 Ko, `SelecteurLocalisationDynamique` 59 Ko, `TableauApprovisionnements` 49 Ko.
* Quatre feuilles de style de conception (`styles.css` 34 Ko, `design-tokens.css` 30 Ko, `sigad-app-shell.css` 31 Ko, `tableau-bord-pilote.css` 41 Ko) + `tailwind.config.js` chargé via `@config` : empilement à rationaliser, sans urgence.

### F-16 — Backend : gros modules mêlant routage, SQL et règles · **Moyenne** · Confirmé
`distribution.service.ts` 108 Ko, `administration-territoriale.service.ts` 98 Ko, `rapports.service.ts` 78 Ko, `gestion.routes.ts` 70 Ko (1 433 lignes, SQL en ligne), `comptes.routes.ts` 67 Ko, `auth.routes.ts` 61 Ko (1 122 lignes). Pas de couche d'accès aux données ; middlewares métier déclarés dans `index.ts`. À découper **uniquement derrière les tests de non-régression existants** (Batch 5).

### F-17 — Comptes initiaux semés par migration · **Moyenne** · À vérifier
`0008_seed_initial_data.sql` insère 25 comptes (propriétaire, central, 23 provinciaux) avec empreintes PBKDF2 de codes d'activation. Le README affirme que les codes de production sont générés hors dépôt. À confirmer : que staging/production n'utilisent pas les empreintes de la migration (rotation ou invalidation des codes) et que `doit_changer_mot_de_passe` est bien forcé. **Aucun secret n'a été lu ni reproduit dans ce rapport.**

### F-18 — Configuration et hygiène · **Basse/Moyenne** · Confirmé
* `wrangler.toml` (suivi) contient l'identifiant D1 de production — non secret mais à retirer du suivi au profit d'un modèle (`wrangler.toml.example`) afin d'éviter toute commande distante accidentelle.
* `worker-configuration.d.ts` (626 Ko) est suivi et **régénéré par `npm run typecheck`** (`wrangler types`) : le script de typage modifie un fichier suivi ; le baseline utilise donc `tsc` directement.
* Scripts : 52 fichiers dont 35 non référencés par `package.json` ni par d'autres fichiers (opérations ponctuelles de staging liées à des migrations précises, recettes, inspections, 5 scripts Python dans un projet Node).
* Documentation : 310 fichiers / 28 Mo (125 captures) dont 3 suivis ; nombreux rapports de phases successifs qui se recoupent.

### F-19 — Pyramide de tests · **Moyenne** · Confirmé
Forces : intégration réelle sous Wrangler avec D1 isolée, matrice de sécurité 216 routes, tests de rollback/concurrence. Lacunes : pas de couverture mesurée ; pas de test de non-régression des rôles terrain (cf. F-03) ; pas de test du refus de ménage (F-02) ; pas de test d'isolation **inter-départements/sites** (n'existe pas encore) ; e2e non rejoués dans cette session ; le runner d'intégration est un script maison de 3 min sans exécution partielle.

---

## 3. Synthèse des priorités issues de l'audit

| # | Constats | Pourquoi d'abord |
|---|---|---|
| 1 | F-01 | Aucune autre action n'est réversible tant que le travail n'est pas versionné |
| 2 | F-02, F-03 | Défauts fonctionnels/sécurité confirmés ; tests à écrire avant toute évolution |
| 3 | F-05, F-06, F-07 | Fondation identité/permissions/audit (Phase 2) |
| 4 | F-08, F-09, F-10 | Fondation géographique (Phase 2), dépend d'une décision sur les communes et d'une référence administrative fiable |
| 5 | F-04, F-15 | Séparation des consoles (Phase 3) |
| 6 | F-11, F-12, F-14 | Backend Android (Phase 4) |
| 7 | F-13, F-16, F-18 | Nettoyage et dette (Phase 5) |

## 4. Limites de cet audit
Pas d'accès aux données réelles ni au staging ; E2E non rejoués ; analyse statique d'imports (`tools/analyse-code-mort.mjs`) sans résolution des imports dynamiques par variable ; les règles métier de l'Arrêté n°0033/PR/PM/MASSNAH/SG/2026 citées par les docs n'ont pas été re-vérifiées (aucun texte officiel dans le dépôt).
