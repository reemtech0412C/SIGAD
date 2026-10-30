# B2.6 — couverture Shadow des 13 routes appareils/sessions (2026-10-30)

**Statut : TECHNIQUE — politique D-02/D-04 toujours en attente.**

Les 13 routes sans politique Shadow (appareils et sessions, postérieures à la migration 0036) ont été comparées à la politique Legacy du catalogue partagé (`shared/permissions/catalogue.ts`). Elles sont reprises à l'identique par la migration `0043_politiques_ombre_appareils_sessions.sql`: 13 permissions et 49 liaisons rôle-permission.

| Routes | Mode Legacy | Rôles | Liaisons |
|---|---|---|---:|
| 4 routes `/api/administration/comptes/appareils[...]` | ROLE | ADMIN_CENTRAL | 4 |
| 3 routes `/api/proprietaire/{appareils,appareils/:id/revoquer,utilisateurs/:id/revoquer}` | ROLE | PROPRIETAIRE | 3 |
| 6 routes `/api/compte/{appareils,appareils,appareils/:id/revoquer,appareils/defis,sessions/:id/revoquer,sessions/revoquer-toutes}` | SESSION | 7 rôles | 42 |

Aucune permission opérationnelle ni règle D-12 n'est modifiée; Legacy reste décideur, le comparateur reste diagnostique. Aucune nouvelle règle n'a été inventée: chaque ligne copie le catalogue.

## Résultat

- Porte de route : **1 581 MATCH, 0 MISMATCH, 22 INDETERMINATE, 0 ERROR** (avant: 1 490 / 0 / 113 / 0). Les 22 restantes sont les déclarations Legacy conditionnelles; plus aucune `POLITIQUE_SHADOW_ABSENTE`.
- Autorisation runtime complète: inchangée (1 603 INDETERMINATE), aucun contexte de ressource/géographie/organisation ajouté.
- `npm run verify:rapide` PASS (197 tests, 229 routes, 43 migrations); Worker ciblé `b26-shadow-reconciliation-worker` PASS. Preuves: `verify-20261030T204850028Z.txt`, `verify-20261030T204912984Z.txt`. Le `npm run verify` complet n'a pas été relancé.
- Reste ouvert: approbation D-02/D-04 (80 couples), 22 cas conditionnels, contextes ressource/géographie/organisation.
