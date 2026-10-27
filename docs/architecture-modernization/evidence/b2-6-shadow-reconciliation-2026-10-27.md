# B2.6 — preuve de synchronisation Shadow

Date des exécutions: 2026-10-27, heure `Africa/Ndjamena`. Exécutions locales seulement; aucune base réelle, publication ou bascule d’accès n’a été utilisée.

## Résultat

- `migrations/0042_reconciliation_roles_portees_ombre.sql`: journal des événements et état courant; projections des rôles et portées issues de Legacy; triggers transactionnels pour comptes, profils terrain, consultation, périmètres et entrepôts. La reprojection répétée produit le même état; les erreurs de projection annulent l’écriture source.
- Fixture SQLite/D1 locale: 25 comptes sur 25 rapprochés, zéro différence de rôle/portée. Ce nombre décrit le seed local, pas les comptes d’un environnement réel.
- Une mutation de rôle ou de portée invalide les sessions ouvertes. Les états d’invitation consultative restent suspendus en Shadow jusqu’à l’activation; l’activation initiale conserve la session MFA. L’invalidation de suspension garde le motif Legacy `COMPTE_NON_ACTIF`.
- Legacy reste seul arbitre d’accès. Une divergence Shadow volontaire `PROPRIETAIRE` n’a pas permis l’accès à `/api/proprietaire/audit` (403). Les divergences `ROLE_EFFECTIF`/`PROVINCE_EFFECTIVE` affichées dans les tests sont des injections ou sondes locales, pas des divergences résiduelles des 25 comptes.
- Les tables Shadow ne fournissent pas encore une décision complète par action et propriété du resource; l’équivalence session/appareil est vérifiée par le chemin Legacy, pas calculée par Shadow. Aucune donnée de ce test ne doit être interprétée comme approbation des 80 écarts D-02/D-04 ou des 13 cas HTTP `400`.

## Exécutions vérifiables

| Commande | Résultat constaté | Preuve |
|---|---|---|
| `npm run test:unit -- tests/unit/b26-reconciliation-ombre.test.mjs` | 5 tests réussis; code 0. | Inclus à nouveau dans la vérification complète ci-dessous. |
| PowerShell: `$env:SIGAD_INTEGRATION_TESTS='securite-matrice-worker.test.mjs,b26-shadow-reconciliation-worker.test.mjs'; npm run test:integration` | Worker local ciblé réussi; code 0; intégrité des fichiers: 0 changement. | [`verify-20261027T091345721Z.txt`](verify-20261027T091345721Z.txt) |
| `npm run verify` | TypeScript 0; 37 fichiers de tests unitaires / 184 tests réussis; 229 routes couvertes; 42 migrations jusqu’à 0042; Worker/D1 local réussi; intégrité des fichiers: 0 changement; code global 0. | [`verify-20261027T091622530Z.txt`](verify-20261027T091622530Z.txt) |

Le test d’intégration du Worker exerce deux connexions SQLite indépendantes et des mutations concurrentes; la projection finale suit la source Legacy et la session précédente est révoquée. Le test de sécurité couvre également la réauthentification requise après changement d’affectation.

## Limite de préparation

La synchronisation et les tests de non-élargissement sont prêts. L’enforcement B2.6 reste bloqué par l’approbation détaillée des règles D-02/D-04, puis par un comparateur en lecture seule couvrant action, ressource/ownership, géographie et état d’identité. Aucun changement opérationnel de permission n’est inclus.
