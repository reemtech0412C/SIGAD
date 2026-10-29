# B2.3-B — préparation technique sans import officiel

Date: 2026-10-29, `Africa/Ndjamena`. Base: `37b31ca` avant ce lot. Exécution locale seulement.

## Livré

- `backend/src/modules/geo/import-plan.ts` expose `planifierImportGeo`, un planificateur immuable en lecture seule. Il contrôle l'empreinte/version du source, le type de source par famille, les identifiants stables, les références Legacy, les types, règles parentales approuvées, parents manquants, doublons de GID et de noms normalisés sous le même parent, cycles et métadonnées de date/source.
- Les rejouements identiques donnent `UNCHANGED` sans incrément; un changement conserve le GID et propose un candidat de version suivante. Une création est seulement `CREATE_PROPOSED` (`PROPOSE`/`INACTIF`). Le résultat déclare explicitement `persistentWrites: 0`; aucune API d'application ni transaction d'import n'est exposée.
- Les scénarios utilisent uniquement des valeurs `TEST_ONLY`; aucune liste réelle n'a été chargée. Aucun changement de migration ou de table n'est requis.
- Les fonctions internes de lecture paginée et filtrée par portée de session sont dans `backend/src/modules/geo/lecture.ts`. Aucune nouvelle route HTTP v1 n'est exposée par ce lot: la route v1 et sa politique par rôle doivent être inscrites et approuvées avant qu'un nouveau point d'accès puisse lire de futures données officielles.

## Tests du lot

| Contrôle | Résultat |
|---|---|
| `npm run test:unit -- tests/unit/b2-3-geo-import-plan.test.mjs` | PASS, 6/6; après correction d'un cas de collision d'identité Legacy découvert par le test. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run verify:rapide` | PASS, exit 0; 39 fichiers / 197 tests, matrice 229 routes, 42 migrations jusqu'à 0042, aucune modification automatique détectée. `evidence/verify-20261029T171026595Z.txt`. |
| `npm run verify` par défaut | FAIL avant démarrage du Worker; le Temp isolé du sandbox a produit `fetch failed` et `EPERM` au nettoyage. Aucun test n'a été déclaré réussi sur cette tentative. `evidence/verify-20261029T171208952Z.txt`. |
| `npm run verify` avec `TEMP=TMP=C:\Users\Lenovo\AppData\Local\Temp` | PASS, exit 0; Worker/D1 local terminé; TypeScript, 39 fichiers / 197 tests, 229 routes et 42 migrations réussis; fichiers de projet modifiés automatiquement: 0. `evidence/verify-20261029T171321406Z.txt`. |

## Limites / décisions requises

- B2.3-B reste **PARTIAL**: il n'y a pas de chargeur qui écrit dans D1, pas de route v1 publiée, ni d'import officiel. Ces limites empêchent une exposition ou une mutation avant validation des permissions et du référentiel.
- L'import des unités officielles reste bloqué jusqu'à obtention, vérification et approbation des textes/annexes applicables (Ord. 002/2024, Loi 017/2025, Décret 026/2026), d'une extraction complète avec dates d'effet/relations, et désignation de l'autorité compétente au titre de D-03/D-13. L'Annuaire INSEED 2024 et OCHA restent des sources comparatives, non une autorisation d'import.
- Les règles de parenté de données réelles ne sont pas préremplies ou approuvées. L'outil refuse de rendre un plan applicable sans source complet/vérifié/approuvé et sans règle de parenté approuvée.

## Décision de progression

Le blocage des données est administratif; le planificateur et les validations indépendants sont livrés. La phase B2.6 peut donc être clôturée **TECHNICALLY COMPLETE / POLICY PENDING** selon le comparateur déjà présent, sans activer Shadow. B2.7 ne peut pas modifier les rattachements opérationnels tant que ses références/autorité et D-02/D-04 ne sont pas disponibles; son blocage sera enregistré, puis les travaux indépendants suivants seront évalués.
