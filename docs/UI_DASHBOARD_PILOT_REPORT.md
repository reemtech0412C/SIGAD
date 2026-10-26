# SIGAD — Rapport du pilote UI du tableau de bord

**Date :** 22 octobre 2026  
**Statut : PARTIAL**  
**Périmètre :** pilote protégé `/ui-preview`; aucune publication Cloudflare et aucun changement d’API ou de schéma.

## Résultat

Le nouveau tableau de bord est accessible après authentification, changement obligatoire du mot de passe initial et, pour les comptes centraux, activation préalable du MFA. L’interface existante reste accessible sur `/`. Les statistiques et filtres du pilote utilisent les réponses des API SIGAD existantes.

Le statut reste **PARTIAL** pour deux raisons visibles : la police DM Sans n’est pas distribuable localement dans l’environnement actuel et aucune géométrie provinciale accompagnée d’une correspondance SIGAD vérifiée n’est disponible. La carte affiche donc l’état de validation et ne présente ni polygones ni chiffres géographiques.

## Travaux réalisés

- Ajout du tableau de bord React différé dans `frontend/src/components/pilote/TableauBordPilote.tsx` et de ses styles isolés dans `frontend/src/components/pilote/tableau-bord-pilote.css`.
- Ajout de la route de prévisualisation `/ui-preview` après les contrôles d’authentification existants. La route conserve les exigences de changement de mot de passe et de MFA de `App.tsx`.
- Ajout d’un lien vers le pilote dans les deux navigations historiques; la route `/` et les modules existants restent accessibles.
- Remplacement de la marque typographique de connexion et de la marque latérale par le logo SIGAD original, copié sans modification dans `frontend/public/images/sigad-logo.png`. La somme SHA-256 du fichier fourni et de la copie est identique.
- Construction de la présentation avec des composants React et des règles Tabler inspirées, sans ajouter Tabler, Bootstrap ni nouvelle dépendance. Les nouvelles règles sont limitées à `.sigad-preview`; aucune feuille Tabler globale n’est chargée.
- Mise en place d’une barre latérale repliable, d’un menu mobile, d’un en-tête, d’un fil d’Ariane, de filtres, d’un thème sombre optionnel, de cartes KPI, d’un graphique mensuel et d’états de chargement, d’erreur et d’indisponibilité.

### Données et API utilisées

- `GET /api/rapports/filtres` fournit les choix de période, partenaire, nature d’aide, statut et province autorisés.
- `GET /api/rapports/tableau-de-bord` fournit les agrégats et l’évolution mensuelle. Le serveur applique le périmètre de session; le navigateur ne constitue pas une frontière de sécurité.
- Les indicateurs couvrent les ménages ciblés et servis uniques, les personnes assistées dans ces ménages, les distributions, les approvisionnements, les opérations en attente, les écarts non résolus, le stock agrégé et les quantités distribuées.
- Les panneaux « Validations » et « Activités récentes » indiquent explicitement l’absence d’API source fiable au lieu d’afficher des valeurs fabriquées.
- L’agrégat de stock est accompagné d’une note signalant que les unités de mesure peuvent différer.

### Carte et référentiel géographique

Aucun fichier GeoJSON local ne passe les contrôles de version, de licence, de géométrie et de correspondance avec les identifiants des 23 provinces SIGAD. Le pilote affiche donc une carte d’attente sans géométrie. Il ne lie aucune statistique opérationnelle à des frontières non vérifiées et ne présente aucune des 500 communes en relecture.

La source candidate est le jeu [OCHA/HDX COD-AB Tchad](https://data.humdata.org/dataset/cod-ab-tcd), dont les métadonnées déclarent une licence CC BY 3.0 IGO. Cette déclaration et sa version doivent être revérifiées sur le fichier effectivement téléchargé; la géométrie candidate a été créée en 2012 puis revue en 2025. Le contrôle des P-codes, des rattachements et des limites de 2024 n’est pas établi. La carte interactive n’est donc pas livrée dans ce pilote.

## Captures Chrome

Les captures ont été produites par Playwright avec l’exécutable Google Chrome installé sur Windows. La vue mobile utilise un viewport Chrome de 390 × 844 px. Les données des captures viennent de bases D1 temporaires de test; elles ne représentent pas des données réelles. La capture de l’ancienne interface montre un jeu de ménages synthétique de test.

| Comparaison | Capture |
| --- | --- |
| Interface existante, avant | ![Interface existante](ui-dashboard-pilot/avant-interface-existante.png) |
| Nouveau tableau de bord, bureau 1440 px | ![Tableau de bord sur bureau](ui-dashboard-pilot/apres-tableau-bord-bureau.png) |
| Nouveau tableau de bord, mobile 390 px | ![Tableau de bord sur mobile](ui-dashboard-pilot/apres-tableau-bord-mobile.png) |

Les images originales pleine page sont conservées dans `docs/ui-dashboard-pilot/`.

## Vérifications effectuées

| Vérification | Résultat |
| --- | --- |
| `npm run typecheck` avec les chemins de configuration Wrangler isolés sous `.wrangler/` | **PASS** — code de sortie 0; `tsc --noEmit` réussi. |
| `npm run build` | **PASS** — Vite a généré le client et les chunks différés du pilote. |
| `npm run test:unit` | **PASS** — 8 fichiers, 32 tests. |
| `npm run test:security-matrix` | **PASS** — 140 routes cataloguées et matrice synchronisée. |
| `npm run test:e2e` complet sous Chrome | **PASS** — 21 tests Worker/D1/R2 et 6 tests Playwright, dont 3 nouveaux tests du pilote UI. Les tests d’export navigateur passent après activation explicite des téléchargements dans Playwright et attente de la confirmation d’export. |
| Vérification de schéma sur D1 locale vierge | **PASS** — migrations 0001–0021, 65 tables, 83 index, 68 déclencheurs, 25 comptes, 23 provinces, 500 communes en relecture et 0 commune activée; aucune violation de clé étrangère. |
| Périmètre Sila dans le pilote | **PASS** — réponse provinciale limitée à `prov-sila`; la requête directe avec `province_id=prov-ouaddai` est refusée en HTTP 403. Le test de matrice vérifie par ailleurs que les refus RBAC ne modifient aucune donnée. |
| Logo et ressources visuelles | **PASS** — deux images du logo chargées et dimensions non nulles; aucune déformation observée. |
| Mise en page 390 px | **PASS** — aucun débordement horizontal dans le test Chrome. |
| Chargement et erreur API | **PASS** — squelette visible pendant le chargement, alerte et action de nouvel essai après HTTP 503. |
| Régression fonctionnelle navigateur | **PASS** — les parcours bénéficiaire, rapports, opérationnel et les trois scénarios du pilote UI ont réussi. |
| `git diff --check` | **PASS** — aucune erreur d’espacement; seuls des avertissements Git indiquent une conversion de fins de ligne LF/CRLF à la prochaine réécriture. |

Les tests d’intégration finaux couvrent l’authentification, la matrice de sécurité, les stocks, les approvisionnements centraux, les distributions et les rapports. Les suites utilisent un Worker Wrangler local, une base D1 de test isolée et R2 local. Aucun `--remote`, déploiement ou changement de ressource distante n’a été effectué.

Une tentative initiale de `typecheck` a rencontré `EPERM` lors de l’écriture du journal Wrangler dans le profil utilisateur; la même commande a ensuite réussi avec `APPDATA`, `LOCALAPPDATA` et `XDG_CONFIG_HOME` dirigés vers un répertoire temporaire du dépôt. Une première exécution E2E a révélé un sélecteur Playwright ambigu; le test a été précisé. Le test d’export a aussi échoué une fois lorsque Playwright annulait le téléchargement; après configuration de `acceptDownloads` et attente de l’état de confirmation, le test ciblé puis les six tests Playwright de la suite complète ont réussi.

## Fichiers créés ou modifiés

**Créés :**

- `frontend/src/components/pilote/TableauBordPilote.tsx`
- `frontend/src/components/pilote/tableau-bord-pilote.css`
- `frontend/public/images/sigad-logo.png`
- `tests/e2e/ui-preview.spec.ts`
- `docs/UI_DASHBOARD_PILOT_REPORT.md`
- `docs/ui-dashboard-pilot/avant-interface-existante.png`
- `docs/ui-dashboard-pilot/apres-tableau-bord-bureau.png`
- `docs/ui-dashboard-pilot/apres-tableau-bord-mobile.png`

**Modifiés :**

- `frontend/src/App.tsx`
- `frontend/src/components/connexion/ConnexionPage.tsx`
- `frontend/src/styles.css` (styles limités à la marque de connexion, la marque latérale et au lien du pilote)
- `playwright.config.ts` (acceptation explicite des téléchargements dans le navigateur de test)
- `tests/e2e/rapports.spec.ts` (attente de l’état de confirmation avant vérification du fichier téléchargé)

Aucune migration, API, règle RBAC/CSRF/MFA, dépendance ou configuration Production n’a été modifiée. Aucun commit ni push n’a été réalisé.

## Écarts et risques restants

1. **Police DM Sans — PARTIAL.** Le CSS demande DM Sans et conserve une pile système de secours, mais le fichier de police n’est pas présent sur la machine. L’accès à `registry.npmjs.org` a échoué avec `ENOTFOUND`; aucune source de police alternative n’a été utilisée. La police affichée dépend donc du fallback système. La variable `--sp-font-arabe-futur` réserve une pile IBM Plex Sans Arabic pour un support futur; aucune interface arabe ni direction RTL n’a été ajoutée.
2. **Carte de Tchad — PARTIAL.** La géométrie et la jointure des codes ne sont pas validées; seule une explication sourcée est affichée. La licence du jeu candidat doit être reconfirmée lors de l’acquisition du fichier.
3. **Indicateurs de validation et activité — PARTIAL.** Les services existants ne fournissent pas de source fiable pour ces deux panneaux; la limitation est indiquée dans l’interface.
4. **D1 locale préexistante — PARTIAL.** Une vérification en lecture seule antérieure a trouvé 62 tables dans `.wrangler/state`, alors que les 3 tables MFA des migrations 0020–0021 y manquent. Cette base n’a pas été modifiée. Les tests et le serveur de prévisualisation utilisent des états D1 distincts, migrés localement jusqu’à 65 tables.
5. **Prévisualisation locale.** Le Worker de revue est disponible sur `http://127.0.0.1:8787/ui-preview`, relié à `.wrangler/ui-pilot-preview-state`. Il utilise une base locale isolée, des comptes de démonstration synthétiques et aucun service distant. L’identifiant `sila` dispose d’un code d’activation initial dans le fichier privé communiqué lors de la livraison; le mot de passe doit être changé au premier accès. Le rôle provincial n’exige pas le MFA selon les règles actuelles; les comptes centraux restent soumis à l’activation MFA.

## Décision

**Phase UI Dashboard Pilot : PARTIAL.** Le shell visuel, l’intégration protégée, les agrégats réels, les états d’interface, le logo, la réponse mobile et les tests locaux sont validés. L’approbation visuelle peut être faite à partir des captures et de la prévisualisation locale. Le passage à une carte interactive requiert un jeu géographique vérifié et une correspondance de codes approuvée. Le respect complet de la typographie DM Sans attend la disponibilité d’une distribution locale fiable de la police.
