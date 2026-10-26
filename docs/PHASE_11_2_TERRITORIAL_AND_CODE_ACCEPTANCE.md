# Phase 11.2 — Vérification territoriale indépendante et audit définitif du code

**Date de contrôle :** 23 octobre 2026

**Branche observée :** `ui/phase-11-harmonisation`

**Référence locale :** `371f0be`
**Statut global : `PARTIAL`**

## Décision

Le tableau communal de l’article 3 de la Loi organique n°015/CNT/2024 a été contrôlé sur le fac-similé du *Journal officiel*, pages imprimées 20 à 24. La revue couvre **500 entrées SIGAD : 489 correspondances relues directement dans le tableau et 11 entités de N’Djaména rapprochées avec la Loi n°022/CNT/2024**. Aucune commune n’est classée en désaccord ou non vérifiable après ce rapprochement. Une anomalie indépendante de transcription du numéro de ligne de BODO est signalée ci-dessous.

La vérification des communes ne constitue pas une validation des listes infra-provinciales actuelles. Les décomptes disponibles pour les départements, sous-préfectures et cantons proviennent de millésimes ou de textes différents et ne forment pas encore un inventaire courant, nominatif et juridiquement réconcilié. **Aucune activation opérationnelle n’est recommandée.**

## A. Revue indépendante des 500 communes

### Méthode et résultat

Le fac-similé du *Journal officiel de la République du Tchad*, édition spéciale « Lois organiques », juillet 2024, a été ouvert dans Chrome et relu à l’écran sur les pages imprimées 20 à 24. Le nom, la province et la classe ont été rapprochés des 500 lignes SIGAD. Le CSV antérieur et la migration n’ont servi qu’à identifier les libellés enregistrés dans SIGAD; ils ne sont pas utilisés comme preuve juridique.

La loi énonce à l’article 3 **23 provinces et 500 communes, dont 125 urbaines et 375 rurales**. Le tableau comporte 114 communes urbaines provinciales nommées, 375 communes rurales et, à la ligne n°125 de N’Djaména, la Ville et les 1er à 10e arrondissements. Les articles 2 et 3 de la Loi n°022/CNT/2024 confirment que la Ville et les communes d’arrondissement sont des entités communales juridiquement distinctes. Les onze libellés SIGAD correspondants sont donc classés comme rapprochements de sources, avec le libellé développé de SIGAD conservé en regard de la formulation du tableau.

| Résultat de la revue | Nombre | Portée |
|---|---:|---|
| Entrées communales SIGAD examinées | 500 | 125 urbaines et 375 rurales selon la structure publiée |
| Concordances relues directement sur les pages de la Loi n°015 | 489 | 114 communes urbaines provinciales et 375 communes rurales |
| Entités de N’Djaména corroborées par les Lois n°015 et n°022 | 11 | Ville et dix arrondissements; le préfixe descriptif SIGAD est explicité dans la matrice |
| Désaccords sur le nom, la province ou la classe | 0 | Aucun écart de fond relevé dans la revue du fac-similé |
| Entrées communales non vérifiables après rapprochement | 0 | Les 11 lignes de N’Djaména sont corroborées par la Loi n°022 |
| Activation dans D1 | 0 / 500 | Les 500 communes restent proposées; aucune activation effectuée |

La colonne « unité supérieure documentée » de la matrice contient uniquement la province. L’article 3 ne prouve pas le rattachement d’une commune donnée à un département ou à une sous-préfecture; ces colonnes sont explicitement marquées `NON_INDIQUE_DANS_LA_SOURCE`. Aucun rattachement inférieur n’est inféré depuis l’alignement graphique des colonnes.

### Anomalie de transcription non communale

À la ligne de BODO, page imprimée 22, le numéro de séquence apparaît comme « 6 » dans l’extraction textuelle et le dernier chiffre n’est pas suffisamment lisible sur le fac-similé pour confirmer s’il s’agit de « 6 » ou de « 61 ». Le nom BODO, sa province du Logone Oriental et sa classe urbaine sont lisibles. Cette incertitude porte sur le numéro de séquence, pas sur l’identité de la commune; le numéro n’est donc pas utilisé comme identifiant SIGAD. Elle reste signalée sans reconstituer une valeur juridique par déduction.

### Matrice de contrôle

La matrice détaillée, une ligne par entrée SIGAD, est disponible dans [`controle-independant-facsimile-loi-015-2024.csv`](../sources/referentiel-territorial/controle-independant-facsimile-loi-015-2024.csv). Elle contient le nom relu, la page et le tableau, la province, l’unité supérieure effectivement prouvée, l’absence de rattachement départemental dans la source, la classe urbaine/rurale, le nom actuel SIGAD, le résultat et le motif. Les onze lignes de N’Djaména portent la référence juridique complémentaire.

## B. Départements, sous-préfectures et cantons

Les textes de ratification et les tableaux statistiques disponibles n’établissent pas, à eux seuls, un inventaire nominatif courant complet. Leurs nombres ne sont pas combinés ni transposés en enregistrements SIGAD.

| Niveau | Information officielle datée retrouvée | État du rapprochement courant SIGAD |
|---|---|---|
| Départements | L’Annuaire statistique national INSEED 2024, publié en septembre 2025, tableau 1, indique **124 départements** selon l’ordonnance n°002/PR/2024. Le tableau 2 est intitulé « Circonscriptions administratives » et fournit une piste nominative, mais ses rattachements n’ont pas été réconciliés ligne à ligne avec un annexe légal consolidé postérieur. | **0 département importé et 0 relation déclarée vérifiée pour activation.** Le total 124 est un instantané statistique daté, pas une preuve qu’une liste actuelle de 124 unités est complète. |
| Sous-préfectures / communes administratives | Le même tableau 1 INSEED indique **489 communes** dans l’instantané de l’ordonnance n°002/PR/2024. Ce nombre n’est pas assimilé aux 500 communes autonomes de la Loi organique n°015, ni à un inventaire actuel de sous-préfectures distinctes. | **0 sous-préfecture importée et 0 relation infra-provinciale validée.** Inventaire autonome actuel non établi. |
| Cantons | L’INSEED publie un chiffre **historique de 747 cantons pour 2020**. Le *Journal officiel* d’octobre 2025 documente le cas précis du canton renommé **Donza Galala à Miski**, dans le département de l’Emi-Koussi, province du Tibesti, par le décret n°2681/PR/PM/MATD/2025; le décret n°2680/PR/PM/MATD/2025 traite l’annulation antérieure. | **0 inventaire complet importé; 1 changement nominatif/rattachement documenté.** Le chiffre de 2020 ne représente pas un total actuel. |

Le *Journal officiel* de janvier 2026, décret n°026/PR/2026, promulgue la Loi n°017/AN-SENAT/2025 ratifiant l’ordonnance n°002/PR/2024 sur la restructuration des unités administratives. Le même journal, décret n°036/PR/2026, promulgue la Loi n°014/AN-SENAT/2025 ratifiant l’ordonnance n°005/PR/2025 sur les principes d’organisation administrative. Ces actes confirment le cadre et sa ratification; ils ne remplacent pas les annexes nominatives manquantes ou non réconciliées.

**Données manquantes explicitement :** annexe actuelle et consolidée listant tous les départements, toutes les sous-préfectures et tous les cantons, avec leurs rattachements, codes éventuels, actes modificatifs et dates d’effet. Les données historiques INSEED de 2009/2020 restent historiques. Aucun enregistrement administratif supplémentaire n’a été créé.

## C. Audit final du code

### Périmètre et constats

- **103 fichiers TypeScript, TSX et MJS** des dossiers Frontend, Backend, `shared`, scripts et tests ont été parcourus avec recherche de références, revue des points d’entrée et examen des imports dynamiques.
- `tsconfig.base.json` impose `strict`, `noUnusedLocals` et `noUnusedParameters`; le contrôle TypeScript complet a réussi.
- L’import dynamique de production identifié est le chargement différé de `TableauBordPilote` dans `frontend/src/App.tsx`. Les autres imports dynamiques relevés sont liés aux tests ou aux vérificateurs et ont été conservés.
- Une recherche heuristique par nom de fichier a signalé 24 candidats sans référence externe apparente. La revue manuelle les a classés comme déclaration ambiante incluse par TypeScript, entrées de scripts/tests exécutées par `package.json` ou les configurations de test, ou outils documentés de validation géographique. Aucun de ces candidats ne justifie une suppression.
- Les dépendances directes sont présentes selon `npm ls --depth=0` et leurs utilisations sont visibles dans le code ou les configurations. `ESLint` et `Knip` ne sont pas installés. Aucune dépendance d’analyse n’a été ajoutée; l’installation précédente de ces outils était bloquée par l’échec DNS du registre npm, consigné dans le rapport Phase 11.1.
- Aucun CSS, route, migration historique, jeu géographique, test, licence ou fichier documentaire n’a été supprimé. Les sélecteurs CSS dont l’usage dépend d’états et de classes construits dynamiquement ne sont pas déclarés morts sur la seule base d’une recherche textuelle.

### Fichiers supprimés et preuves

| Période | Retrait | Preuve / décision |
|---|---|---|
| Phase 11.2 | **Aucun fichier supprimé** | Aucun élément supplémentaire n’a satisfait le critère de suppression sûre après revue des entrées statiques, imports dynamiques, scripts, tests et configurations. |
| Nettoyage antérieur Phase 11.1, déjà présent dans l’arbre de travail | `shared/constantes/catalogue.ts` et 14 déclarations inutilisées réparties dans les fichiers listés au rapport Phase 11.1 | Références vérifiées absentes; `noUnusedLocals`/`noUnusedParameters` et suites antérieures passantes. Détails et noms exacts dans [`PHASE_11_CODE_CLEANUP.md`](PHASE_11_CODE_CLEANUP.md). Ces suppressions ne sont pas de nouvelles modifications de cette Phase 11.2. |

## D. Vérifications exécutées

| Vérification | Résultat observé | Détail |
|---|---|---|
| Matrice communale | **PASS** | 500 lignes; 489 relues directement et 11 rapprochées avec la Loi n°022; 0 code local dupliqué, 0 ligne incomplète. |
| `npm ls --depth=0` | **PASS** | Toutes les dépendances déclarées sont résolues au niveau racine. |
| `npm run typecheck` | **PASS** | Wrangler a généré les types et `tsc --noEmit -p tsconfig.json` a terminé avec code 0. Wrangler a affiché un avertissement `EPERM` en écrivant son journal dans AppData; cela n’a pas interrompu le contrôle des types. |
| `npm run build` | **PASS** | Vite 8.3.5; 140 modules transformés; build PWA généré. |
| `npm run test:unit` | **PASS** | 11 fichiers, 45 tests réussis. |
| `npm run db:verifier` | **PASS** | Base SQLite locale vierge : 22 migrations versionnées, 65 tables (62 métier + 3 MFA), 86 index, 74 déclencheurs, 23 provinces, 500 communes `PROPOSE`, 0 activée, 25 comptes, aucune violation FK; contraintes `CHECK` et `UNIQUE` contrôlées. |
| `npm run test:security-matrix` | **PASS** | Catalogue synchronisé avec 143 routes API. Cela valide la synchronisation de la matrice; les parcours Worker complets ne sont pas certifiés par ce contrôle seul. |
| `npm run test:integration` | **BLOCKED** | Le runner confirme `Resource location: local`, puis `workerd` s’arrête avant les tests : `workerd/util/sqlite.c++:378: failed: GetFinalPathNameByHandleW: #5 Accès refusé.` Le même refus est survenu avec un répertoire temporaire de test situé dans un emplacement de travail autorisé. Aucun changement de Windows Defender ou de sécurité système n’a été effectué. Une tentative dans un chemin temporaire interne au dépôt a été rejetée par le garde-fou du générateur de secrets avant le démarrage du Worker. |
| Tests Playwright | **BLOCKED / non atteints** | Les tests navigateur partagent le runner Worker local; celui-ci échoue avant son démarrage. Aucun résultat Playwright n’est revendiqué pour cette phase. |
| `git diff --check` | **PASS** | Code de sortie 0; avertissements de conversion LF/CRLF uniquement. |

La première tentative d’intégration dans le répertoire temporaire Windows par défaut a aussi empêché le nettoyage automatique du fichier de codes d’activation de test (`EPERM` sur `unlink`). Aucun contenu de secret n’a été affiché. Une seconde exécution avec un répertoire de travail autorisé a atteint le même refus `workerd`; son nettoyage s’est terminé sans erreur signalée. Aucune donnée réelle ou base distante n’a été utilisée.

## Fichiers créés ou modifiés dans cette phase

- Créé : [`controle-independant-facsimile-loi-015-2024.csv`](../sources/referentiel-territorial/controle-independant-facsimile-loi-015-2024.csv), matrice de 500 lignes.
- Créé : présent rapport.
- Aucun code applicatif, API, schéma, migration ou donnée D1 n’a été modifié pour Phase 11.2.
- Aucun commit, push, déploiement, activation géographique ou changement distant n’a été effectué.

## Sources officielles consultées

1. *Journal officiel de la République du Tchad*, édition spéciale « Lois organiques », juillet 2024, Loi organique n°015/CNT/2024, article 3, pages imprimées 20–24; décret n°0298/PR/2024 de promulgation : [fac-similé PDF](https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf).
2. Loi n°022/CNT/2024 du 14 octobre 2024, portant statut particulier de la ville de N’Djaména, articles 2–3 : [copie consultée](https://faolex.fao.org/docs/pdf/Cha231669.pdf).
3. INSEED, *Annuaire statistique national du Tchad 2024*, publié en septembre 2025, tableaux 1–2 : [publication INSEED](https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024).
4. *Journal officiel*, janvier 2026, décrets n°026/PR/2026 et n°036/PR/2026, ratifications des ordonnances n°002/PR/2024 et n°005/PR/2025 : [édition PDF](https://transitionautchad.online/wp-content/uploads/2026/02/JOURNAL-OFFICIEL-DE-LA-REPUBLIQUE-JANVIER-2026.pdf).
5. *Journal officiel*, octobre 2025, décrets n°2680 et n°2681/PR/PM/MATD/2025, concernant le canton de Miski : [édition officielle PDF](https://journalofficiel.td/storage/v1/object/public/archiva/journaux/2025/10/1764959752502-0u0ckxfe65pr.pdf).
6. INSEED, *Tableau de bord économique et social*, tableau 154, évolution administrative et traditionnelle 2010–2020; valeur 747 cantons pour 2020 : [publication INSEED](https://www.inseed.td/inseed/index.php/component/jdownloads/send/50-tableaux-de-bord/485-tableau-de-bord-economique-et-social-2023).

## Verdict

| Domaine | Verdict |
|---|---|
| Communes — noms, province et classe | **PASS pour les 500 lignes vérifiées**; les 500 restent proposées et non activées. |
| Départements, sous-préfectures et cantons — exhaustivité actuelle | **PARTIAL**; les inventaires et rattachements courants ne sont pas complets ou réconciliés. |
| Nettoyage du code | **PARTIAL**; aucune suppression nouvelle n’était justifiée; ESLint/Knip indisponibles et les analyses heuristiques ne remplacent pas une analyse dédiée. |
| Tests de code et de schéma | **PASS** pour typecheck, build, tests unitaires, schéma et synchronisation du catalogue API. |
| Intégration Worker / Playwright | **BLOCKED** par l’erreur d’accès Windows de `workerd`; aucune validation fonctionnelle de ces parcours n’est revendiquée. |
| Activation du référentiel | **NOT READY**; aucune commune, département, sous-préfecture ou canton ne doit être activé à partir de ce rapport. |
| **STATUS** | **PARTIAL** |
