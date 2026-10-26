# Phase 11.3 — Restauration des tests Windows et préparation de l’activation territoriale

**Projet :** SIGAD v3.0  
**Référence :** Phase 11.2 — PARTIAL  
**Branche / commit examinés :** `ui/phase-11-harmonisation` / `371f0be`  
**Périmètre :** Windows local, D1/R2 locales et données territoriales de test uniquement.

## Décision

```text
WINDOWS_WORKER: PASS
INTEGRATION_TESTS: PASS
PLAYWRIGHT: PASS
COMMUNES_VALIDATION: PASS
COMMUNES_ACTIVATION: READY_FOR_APPROVAL
OTHER_TERRITORIAL_LEVELS: PARTIAL
OVERALL: PARTIAL
```

Les tests complets réussissent dans PowerShell hors Sandbox avec `%TEMP%` Windows et Chrome déjà installé. Le Sandbox Codex échoue lors de l’ouverture SQLite par `workerd`. Les processus locaux préexistants sur 8787/8790 sont sains pour `/api/sante`, mais servent actuellement `text/html` pour le nouveau fichier JavaScript de l’application : ils n’ont pas été arrêtés ni redémarrés. Cette anomalie de processus ancien maintient le résultat global à PARTIAL.

## A. Diagnostic Windows

| Contrôle | Résultat observé |
|---|---|
| Identité dans PowerShell hors Sandbox | `YAMI\YAMI` |
| PowerShell / Node / npm | PowerShell 7.6.5, Node v24.19.0, npm 11.17.0 |
| TEMP hors Sandbox | `C:\Users\Lenovo\AppData\Local\Temp`; ACL en lecture seule : contrôle total pour `YAMI\YAMI` |
| TEMP dans le Sandbox | `C:\Users\Lenovo\AppData\Local\Packages\sandbox.{…}\AC\Temp` |
| `.wrangler/state` existant du projet | Présent avant les essais, avec des bases SQLite locales. Non utilisé pour les tests isolés et non modifié volontairement. |
| Ports 5173, 8787, 8790 | Occupés par des processus Node/Vite ou Wrangler/workerd préexistants, tous sous l’identité utilisateur. Aucun processus n’a été arrêté. |

Dans le Sandbox, `npm run test:integration` avec un `--persist-to` distinct sous l’espace de visualisation échoue avant les tests :

```text
workerd/util/sqlite.c++:378: failed: GetFinalPathNameByHandleW: #5 Accès refusé.
The Workers runtime failed to start.
```

La même suite lancée depuis PowerShell hors Sandbox, avec des répertoires neufs sous `%TEMP%`, applique les migrations et démarre le Worker. Les migrations Wrangler directes réussissent également avec un `--persist-to` neuf. Les éléments établissent une différence de contexte d’exécution et de stockage entre Sandbox et PowerShell utilisateur ; ils ne justifient aucune modification du code SIGAD ni des ACL Windows. Aucune protection Windows n’a été désactivée.

### Processus locaux déjà présents

- `5173` : Vite (`node.exe` lancé par `cmd.exe`).
- `8787` et `8790` : Workers locaux Wrangler (`workerd.exe` et leurs processus Node parents), démarrés le 22/10/2026.
- `GET /api/sante` sur 8787 et 8790 : HTTP 200, JSON `{"statut":"operationnel"}`.
- `GET /` sur ces deux Workers : HTTP 200, `text/html`.
- La page servie référence `/assets/index-BpbJgAjr.js`; l’URL de cet asset renvoie HTTP 200 avec `text/html; charset=utf-8`, c’est-à-dire le fallback SPA, et non du JavaScript. Le fichier de ce nom existe dans le build actuel. Les Workers préexistants sont antérieurs au build du 23/10 : un manifeste d’assets périmé est l’explication la plus probable, sans être prouvée par inspection interne de leur processus.
- Vite sur 5173 : `/src/main.tsx` et `/@vite/client` renvoient HTTP 200 avec `text/javascript`; `/api/sante` via le proxy Vite renvoie HTTP 200 avec `application/json`.
- Une instance Wrangler fraîche, créée par le test E2E sur un port temporaire, sert l’application utilisée par les 12 parcours Chrome réussis. Cela confirme le fonctionnement du bundle fraîchement construit.

La correction d’exploitation pour les ports 8787/8790 est de redémarrer les Workers après le build afin qu’ils rechargent le manifeste d’assets. Le redémarrage n’a pas été effectué : les processus et leur état local préexistaient à cette tâche et pouvaient être utilisés. La configuration SPA qui renvoie un document HTML pour une ressource absente reste inchangée.

## B. Migrations et vérification de D1

Les migrations `0001` à `0022` ont été appliquées à des bases D1 locales neuves avec `--local` et un `--persist-to` temporaire isolé. Aucune commande `--remote` n’a été utilisée.

Résultats de `npm run db:verifier` et du contrôle en lecture seule de la D1 Wrangler isolée :

- 22 migrations appliquées ; 65 tables (62 métier et 3 techniques MFA).
- 86 index et 74 déclencheurs de validation.
- 23 provinces, 25 comptes de test (1 propriétaire, 1 administrateur central, 23 délégués).
- 500 communes ; 500 en `PROPOSE` ; 0 avec le couple `actif = 1` et `statut_validation = 'VALIDE'`.
- 0 violation de clé étrangère.
- Les contraintes de schéma et les plans indexés des listes paginées ont été vérifiés. Le test du schéma vierge a également vérifié les rejets CHECK et UNIQUE.

Les migrations, la D1 isolée et les scripts de test n’ont pas activé de commune. Les bases `.wrangler/state` préexistantes n’ont pas été utilisées comme base destructive de test.

## C. Validation des 500 communes

Le contrôle a porté sur la matrice demandée `sources/referentiel-territorial/controle-independant-facsimile-loi-015-2024.csv`, comparée au CSV source `sources/referentiel-territorial/communes-loi-015-2024.csv`, puis aux 500 lignes de la D1 locale nouvellement migrée.

| Contrôle | Résultat |
|---|---:|
| Lignes de la matrice | 500 |
| Relues sur le fac-similé de la loi 015/CNT/2024 | 489 |
| N’Djamena corroborées par la loi 022/CNT/2024 | 11 |
| Urbaines / rurales | 125 / 375 |
| Codes communaux internes uniques | 500 / 500 |
| Codes source absents de la matrice ou de D1 | 0 |
| Écarts normalisés province source ↔ matrice | 0 |
| Écarts d’identifiant provincial source ↔ D1 | 0 |
| Écarts de classe urbaine/rurale source ↔ matrice ↔ D1 | 0 |
| Écarts de nom après normalisation contrôlée matrice ↔ D1 | 0 |
| Liens département/sous-préfecture non documentés renseignés | 0 |

La normalisation n’a servi qu’à détecter des écarts de casse, d’accentuation ou de ponctuation ; elle n’a pas constitué une preuve de légalité. Les preuves et états de vérification demeurent ceux consignés dans la matrice. Cette phase n’a pas relu une nouvelle fois les 500 lignes du PDF original.

Quatre noms identiques apparaissent dans deux provinces et restent des communes distinctes, avec des codes et rattachements provinciaux différents : **Aradib** (Batha/Sila), **Bao** (Ennedi-Est/Logone Occidental), **Bekamba** (Mandoul/Moyen-Chari) et **Haraze** (Batha/Salamat). Aucun de ces cas n’a été fusionné. La ligne **BODO** (code interne `LO015-COM-250`, page imprimée 22) conserve l’incertitude de transcription du numéro de séquence (`6` ou `61`) ; ce numéro n’est pas l’identifiant SIGAD et la commune reste identifiable dans la matrice.

Le lien administratif établi et vérifié pour le choix d’une commune est `communes.province_id`. La table n’impose pas de rattachement à un département ou à une sous-préfecture. Aucun rattachement à ces niveaux ni à un canton n’a été inventé ou ajouté.

## D. Préparation de l’activation — aucune activation exécutée

**500 lignes correspondent aux preuves et aux relations province/classe contrôlées ; 500 restent proposées et 0 sont opérationnellement validées.** Les 11 lignes de N’Djamena sont documentées par sources croisées. Aucun écart d’identité, de province ou de classe ne bloque techniquement le lot ; le numéro de séquence de BODO reste une réserve documentaire distincte.

L’activation doit rester subordonnée à une décision explicite. Plan proposé :

1. Geler et relire un manifeste des 500 codes, identifiants, provinces, noms et classes ; calculer son empreinte et vérifier l’absence de changement depuis le présent contrôle.
2. Précontrôler dans D1 le nombre attendu, l’unicité des codes, les 23 provinces, les classes et l’état `PROPOSE` de chaque ligne ; annuler avant écriture si une seule assertion échoue.
3. Après autorisation, exécuter dans une transaction D1 unique l’UPDATE conditionnel des seuls codes du manifeste et l’écriture de l’événement d’audit associé ; vérifier que le nombre de lignes affectées est exactement 500 et relire les relations. Ne jamais inclure départements, sous-préfectures ou cantons.
4. Conserver avant/après la liste des valeurs modifiées. En cas d’échec de la transaction, aucune activation partielle ne doit persister. Un retour arrière avant toute utilisation opérationnelle rétablit les valeurs antérieures uniquement pour ces codes, avec un nouvel événement d’audit ; après création de références métier, une désactivation doit être évaluée selon ces références plutôt qu’effectuée à l’aveugle.

Effet attendu : les communes validées et actives deviennent éligibles aux sélecteurs qui appliquent ces deux critères. Cette bascule seule ne crée ni ménage, ni distribution, ni mouvement de stock, et ne modifie pas les soldes ou les opérations historiques. Les opérations futures pourront naturellement utiliser ces localisations et apparaître dans les rapports. Les règles de filtre effectives devront être contrôlées avant toute activation.

Les départements, sous-préfectures et cantons restent hors activation faute d’un inventaire nominatif actuel complet et vérifié. Le présent rapport ne leur crée aucune relation.

## E. Tests exécutés

| Contrôle | Résultat réel |
|---|---|
| `npm run typecheck` (PowerShell utilisateur) | PASS — Wrangler types et `tsc --noEmit`, code de sortie 0. |
| `npm run build` | PASS — Vite, 140 modules ; le build inclus dans `npm run test:e2e` a également réussi. |
| `npm run test:unit` | PASS — 11 fichiers, 45 tests. |
| `npm run test:security-matrix` | PASS — catalogue synchronisé avec 143 routes API. |
| `npm run db:verifier` | PASS — 22 migrations sur SQLite vierge, schéma, données, contraintes, index et plans de requêtes. |
| `npm run test:integration` | PASS — sortie 0 sur PowerShell utilisateur et TEMP standard. 22 tests réussis : authentification/sécurité (2), matrice (1), stocks (1), approvisionnements/réception (1), distributions (10), rapports/KPI (7). La matrice a vérifié 140 essais anonymes et 128 refus RBAC sans changement de l’empreinte des tables. |
| `npm run test:e2e` | PASS — build et intégrations réussis, puis 12 parcours Playwright réussis sur Chrome stable, en 2,3 min. L’exécutable utilisé était le Chrome déjà installé, sans téléchargement. |
| D1 Wrangler fraîche | PASS — 22 migrations, 65 tables, 23 provinces, 25 comptes, 500 communes proposées, 0 activée, 0 violation FK. |
| HTTP local / MIME | PASS sur Vite 5173 (`text/javascript` pour les modules) ; PARTIAL sur les Workers préexistants 8787/8790 (fallback HTML pour le JS à empreinte récente). |
| `git diff --check` | PASS — aucune erreur d’espacement. Git affiche uniquement des avertissements de conversion LF/CRLF sur des fichiers déjà modifiés. |

Le premier essai Playwright a échoué parce que le runner redirige `LOCALAPPDATA` vers son dossier temporaire isolé, où le navigateur Playwright n’était pas installé. Les 12 tests ont ensuite été exécutés avec `SIGAD_PLAYWRIGHT_EXECUTABLE` pointant vers Chrome stable déjà présent. Un essai intermédiaire avec le seul test d’authentification a également échoué parce que ce test isolé ne génère pas les fichiers temporaires que les parcours E2E attendent ; l’exécution finale complète utilise la suite d’intégration entière, génère ces données hors dépôt et réussit. Aucun mot de passe, code d’activation ou secret MFA n’est inclus dans ce rapport.

## F. Fichiers et changements

- Créé : `docs/PHASE_11_3_WINDOWS_AND_TERRITORIAL_READINESS.md`.
- Aucun fichier source, migration, schéma D1, API ou configuration de production modifié par cette phase.
- `worker-configuration.d.ts` a été régénéré par Wrangler types, sans différence Git.
- Les builds et résultats Playwright restent dans les emplacements locaux ignorés par Git. Les fichiers de secrets temporaires générés par le runner sont hors du dépôt et son code les nettoie en fin d’exécution.
- Artefact de contrôle conservé hors dépôt : `C:\Users\Lenovo\.codex\visualizations\2026\10\22\01a1630d-9682-7c81-8426-48b39bd1cc35\sigad-phase113-manual-wrangler\state` contient la D1 isolée issue des migrations locales utilisée pour la lecture de vérification ; elle ne contient pas de données métier réelles et ne correspond pas à `.wrangler/state` du projet.
- Aucun processus préexistant n’a été arrêté ; aucune donnée de `.wrangler/state` préexistant n’a été supprimée ou migrée.
- Aucun changement Cloudflare distant, aucune activation territoriale, aucun déploiement et aucun push Git.

## Travail restant

1. Redémarrer de façon contrôlée les processus Wrangler déjà présents sur 8787/8790 après vérification par l’utilisateur qu’aucune session locale n’en dépend, puis recontrôler le MIME du bundle courant.
2. Faire approuver explicitement le manifeste et la transaction d’activation des communes avant toute modification locale ou distante de leur statut.
3. Compléter les sources actuelles des départements, sous-préfectures et cantons ; maintenir ces niveaux désactivés jusqu’à vérification.

**Conclusion :** Phase 11.3 est PARTIAL. Les tests Worker/D1, l’intégration et Playwright sont restaurés et PASS dans PowerShell utilisateur avec stockage temporaire séparé. La validation des 500 communes et le plan d’activation sont prêts pour décision, mais rien n’a été activé. Les anciens processus sur 8787/8790 et les niveaux territoriaux incomplets empêchent le PASS global.
