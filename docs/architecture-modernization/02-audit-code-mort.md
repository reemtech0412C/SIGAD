# 02 — Audit du code mort, dupliqué et hérité (classification et ordre de nettoyage)

> **Aucune suppression n'est effectuée à ce stade.** Ce document classe des *candidats*. Un candidat ne devient supprimable qu'après les vérifications listées pour sa classe.
> Outils : `tools/analyse-code-mort.mjs` (graphe d'imports statiques + exports non référencés + dépendances npm + scripts), `tools/inventaire-schema-memoire.mjs` (tables sans référence). Sorties brutes : `evidence/analyse-code-mort.json`, `evidence/inventaire-schema.json`.
> Une 1ʳᵉ campagne de nettoyage existe déjà (`docs/PHASE_11_CODE_CLEANUP.md`) ; la présente analyse confirme que le code source applicatif est **déjà peu encombré** : sur 225 fichiers analysés, les seuls modules `backend/`, `frontend/`, `shared/` sans importeur sont les points d'entrée (`index.ts`, `main.tsx`, `env.d.ts`) et `hors-ligne.service.ts`.

## 1. Protocole de preuve avant toute suppression

Un candidat doit passer **tous** ces contrôles ; le résultat est consigné dans `00-journal-decisions-et-progres.md` :

1. **Références statiques** : import, `import()`, `new URL()`, nom de fichier dans `package.json`, `vite.config.ts`, `playwright.config.ts`, `wrangler*.toml`.
2. **Références dynamiques / par chaîne** : recherche du nom, du chemin d'API, du nom de table et de l'identifiant d'action d'audit dans tout le dépôt (code, tests, scripts, fixtures, docs de procédures d'exploitation).
3. **Build** : `vite build` et `tsc --noEmit` identiques avant/après ; comparaison de la liste des chunks (`frontend/dist`).
4. **Tests** : unitaires + intégration + matrice sécurité (`--check`) verts avant ET après.
5. **Clients externes** : une route ou un champ de réponse n'est jamais retiré sans période de dépréciation (en-tête `Deprecation`/`Sunset` ou 410 documenté) ; aucun client Android n'existe encore, mais les e2e et scripts de recette en sont consommateurs.
6. **Données** : aucune table, colonne ou donnée n'est supprimée dans cette modernisation sans sauvegarde vérifiée et décision écrite ; la dépréciation d'un objet de schéma passe d'abord par un commentaire de migration et un test garantissant qu'il reste vide.
7. **Réversibilité** : un commit par lot de suppression, sans autre changement, pour `git revert` direct.

## 2. Classification

Échelle — **Confiance** (que le candidat est réellement inutilisé) : `Élevée` / `Moyenne` / `Faible`. **Risque** (conséquence d'une erreur de suppression) : `Très faible` / `Faible` / `Moyen` / `Élevé`.

### Classe A — Supprimable après contrôles standards (confiance élevée, risque très faible)

| Candidat | Preuve | Contrôles complémentaires | Lot |
|---|---|---|---|
| Exports UI sans aucun usage : `SIGADCardFooter`, `SIGADTableHead/Body/Row/HeaderCell/Cell`, type `SIGADConfirmModalProps` | 0 référence, y compris locale (`analyse-code-mort.json`) | Vérifier `components/ui/index.ts` (ré-exports) et la doc `MATRICE_COMPOSANTS_UI_SIGAD.md` (le design system peut les annoncer comme API) → **décision design** : garder si le design system les promet | 5.1 |
| Types/constantes partagés sans usage : `RoleTerrain`, `PaginationApprovisionnements`, `MilieuIntervention`, `CreationPartenaire`, `FiltresMenages`, `MILIEUX_RESIDENCE_TERRITORIALE`, `DonneesPropositionCorrectionTerritoriale`, `TypeUniteAdministrative` | 0 référence | `tsc` ; certains seront **réutilisés par la Phase 2/4** (ex. `RoleTerrain`) → ne pas supprimer ceux qui servent la cible | 5.1 |
| 98 exports « utilisés uniquement dans leur propre fichier » (surtout des `interface`/`type` de props) | `usage_local = true` | Retirer seulement le mot-clé `export` ; **gain nul sur le comportement** → faible priorité, ne pas le faire seul | 5.1 (optionnel) |

### Classe B — Probablement mort, mais intersection avec la logique métier (confiance moyenne, risque moyen)

| Candidat | Constat | Vérification obligatoire | Lot |
|---|---|---|---|
| `operation-centrale.service.ts` : `changerStatutOperation`, `enregistrerApprobationOperation`, `obtenirDetailOperation`, `calculerConsolidationNationale` | Exportés, **jamais appelés** (ni routes, ni tests). Soupçon de **logique dupliquée** : la chaîne d'approbation vivrait dans `operations-centrales.routes.ts`. | Comparer ligne à ligne avec les routes ; si les routes ne couvrent pas la même règle, c'est une **règle d'approbation non appliquée** (plus grave qu'un mort). Ne pas supprimer avant de savoir laquelle fait foi. | 5.2 (après 1.3) |
| `schemaSuppressionUniteTerritoriale` (shared) | Schéma de suppression d'unité non utilisé ; la suppression existe-t-elle encore en route ? | Rechercher `DELETE`/archivage dans `administration-territoriale.*` ; or `0035` rend la suppression sensible | 5.2 |
| Services/routes lisant `communes` et `rattachements_territoriaux` (`territoire.routes.ts` L.188-229, 570, 687 ; `territoire.service.ts` L.93 ; `administration-territoriale.service.ts` L.1614) | Vides si `0035` est appliquée (toutes les lignes supprimées) | Confirmer que **tous** les environnements ont 0035 ; décider du devenir des communes (voir `05-decisions-a-valider.md`, D-03) ; tests d'intégration territoriaux | 5.3 |
| `historique_decoupages` (table) | 1 écriture (`validation-territoire.routes.ts` L.165), 0 lecture | Données éventuelles en staging ; à fusionner dans le journal d'audit unifié, **pas à supprimer** | 2.4 |

### Classe C — Hérité à conserver pour l'instant (confiance élevée d'inutilisation runtime, risque élevé ou valeur de référence)

| Candidat | Raison de conserver | Décision recommandée |
|---|---|---|
| `frontend/src/services/hors-ligne.service.ts` (+ `tests/unit/ergonomie-hors-ligne-0032.test.mjs`) | Prototype non branché mais **référence de conception** pour la file d'idempotence Android ; supprimer le test casserait la suite sans bénéfice | Garder jusqu'à Batch 4.1 ; puis **déplacer** vers `docs/` (exemple) ou supprimer avec son test, selon la conception retenue |
| Tables `parametres_systeme`, `affectations_partenaires` | Aucune référence code, vides après migrations ; `parametres_systeme` est le support naturel des **feature flags** (cible §4) | `parametres_systeme` : **réutiliser**. `affectations_partenaires` : laisser en place, documenter « non utilisée », décider en Phase 5 |
| Migrations 0001 → 0035 | Les migrations appliquées sont immuables | Ne jamais supprimer ni éditer ; corriger par migrations additives |
| `tailwind.config.js` | Chargé par `@config` dans `styles.css` (Tailwind 4) → **utilisé**, simplement hérité de v3 | Garder ; migrer vers `@theme` CSS seulement avec le chantier design |

### Classe D — Scripts (hors build, 35 non référencés)

Les scripts ne sont pas du code mort au sens runtime : ce sont des **outils d'exploitation ponctuels**. Règle : *archiver, ne pas supprimer*.

| Groupe | Fichiers | Action recommandée |
|---|---|---|
| Sauvegardes/restaurations staging liées à une migration précise | `sauvegarder-d1-staging-pre-0026/0027/0028/0035.mjs`, `restaurer-d1-staging-depuis-backup.mjs`, `exporter-d1-staging-chiffree.mjs`, `tester-restauration-*.mjs` | Fusionner en **un** outil paramétré (`--migration NNNN`), garder l'ancien en `scripts/archive/` ; ils sont les **filets de sécurité** du plan de rollback |
| Recettes staging / navigateur | `recette-*.mjs` (8) | Déplacer dans `scripts/recette/` ; documenter dans un `scripts/README.md` |
| Inspections ad hoc | `inspecter-*.mjs` (5), `compter-donnees-territoire.mjs`, `diagnostiquer-menages.mjs`, `tester-stats-reelles.mjs`, `audit-contradictoire-volumes-reels.mjs` | Candidats d'archivage (classe A pour le périmètre « scripts ») après lecture individuelle |
| Générateurs | `generer-migration-0032.mjs` (41 Ko), `generer-referentiel-loi-015.mjs`, `generer-seed-initial.mjs` (référencé), `generer-matrice-securite-phase9.mjs` (référencé par `test:security-matrix`) | Les générateurs de migrations déjà appliquées → archive ; le générateur de référentiel reste lié aux sources |
| Python (5) | `lister-index.py`, `test-stocks-chantier02.py`, `test-trigger-recreation.py`, `tester-migration-0028.py`, `verifier-declencheurs.py` | Aucun runtime Python n'est requis par le projet : convertir en `.mjs` si utiles, sinon archive |

### Classe E — Dépendances npm

| Paquet | Usage constaté | Verdict |
|---|---|---|
| `fast-xml-parser`, `fflate` | `xlsx-menages.service.ts` (import Excel), `rapports-export.service.ts`, `administration-territoriale.service.ts` | **Nécessaires** (lecture/écriture XLSX sans dépendance lourde) |
| `qrcode-generator` | `ConfigurationMfa.tsx` (QR code TOTP) | Nécessaire |
| `hono`, `zod`, `react`, `react-dom` | cœur | Nécessaires |
| `concurrently`, `wrangler`, `typescript`, `@types/*`, `@playwright/test`, `vitest`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `vite-plugin-pwa` | outillage/scripts | Nécessaires |
| `allowScripts` (package.json) | déclare `esbuild`/`workerd` | Garder (exigence d'installation) |

**Conclusion : aucune dépendance npm inutilisée** détectée ; l'objectif « réduire les dépendances » se traduit donc par **ne pas en ajouter** (voir cible : OpenAPI généré depuis Zod sans nouvelle dépendance runtime ; i18n maison légère ; carte déjà en SVG/GeoJSON sans Leaflet).

### Classe F — Documentation

* 310 fichiers / 28 Mo, dont 3 suivis ; >60 rapports de phases se recoupent. **Ne pas supprimer** : créer un index `docs/INDEX.md` marquant chaque document `courant` / `historique`, déplacer l'historique dans `docs/archive/` (git mv, aucune perte) en lot dédié 5.5.
* Documents **contredits par le code** à marquer « à corriger » plutôt que supprimer : `MATRICE_RESPONSABILITES_ET_PERMISSIONS_SIGAD.md` (F-03), `ARCHITECTURE_MODE_HORS_LIGNE_SIGAD.md` (F-14), mentions « audit inaltérable » (F-07).

## 3. Doublons de composants et de pages

| Zone | Constat | Traitement |
|---|---|---|
| Dashboards | Un seul `TableauBordPilote` servi à tous les profils | Pas du code mort : **à scinder par console** (Batch 3.x), en partageant les atomes `components/ui` et `CarteProvincesTchad` |
| Provinces | `frontend/src/data/provinces-tchad.ts` (2,5 Ko) et `shared/constantes/provinces.ts` (2,9 Ko) + GeoJSON OCHA | Doublon probable de données de référence → unifier derrière l'API géographique (Batch 2.3) ; vérifier d'abord que les 23 entrées coïncident |
| Territoire | `AdministrationTerritoriale` (propriétaire, 69 Ko) vs `EspaceTerritorialOperationnel` (central/délégué, 17 Ko) | Deux UI pour un même référentiel : conserver la séparation d'accès, factoriser l'arborescence et la recherche |
| Rôles | Listes de rôles redéfinies dans 6+ fichiers backend, `navigation-config.ts`, `App.tsx` | Remplacées par le catalogue de permissions unique (Batch 2.1/2.2) |
| Idempotence | `lireCleIdempotence` copiée dans 5 fichiers de routes (`approvisionnements`, `controle`, `distributions`, `operations-centrales`, `stocks`) ; `validerCleIdempotence` copiée dans `distribution.service.ts` et `operation-centrale.service.ts` ; deux moteurs de stockage distincts (`stock.service.ts`, `idempotence-import.service.ts`) | Un service d'idempotence commun sur `cles_idempotence` (Batch 4.2) ; ne pas toucher avant tests de caractérisation |

## 4. Ordre de nettoyage sûr

1. **Versionner** l'existant (Batch 0.1) — prérequis absolu.
2. Figer les tests de caractérisation (Batches 1.1–1.3) — ils servent d'oracle de non-régression.
3. Nettoyages **avec** les refontes qui les rendent inutiles (code communes → après décision D-03 ; services d'idempotence → après Batch 4.2 ; listes de rôles → après Batch 2.1), jamais avant : on supprime ce qui est *remplacé*, pas ce qui est *supposé* inutile.
4. Lot 5.1 (classe A), puis 5.4 (scripts → archive), puis 5.5 (docs → archive), puis 5.2/5.3 (classe B), enfin éventuels retraits de schéma (migrations additives datées, avec sauvegarde).

> Chaque lot de la feuille de route (`04-feuille-de-route.md`, Phase 5) reprend ces classes avec critères d'acceptation et rollback.
