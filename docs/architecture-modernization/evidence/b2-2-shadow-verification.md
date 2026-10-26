# B2.2 — Shadow roles and scopes: execution evidence

Date: 2026-10-26. Branch: `codex/b2-2-roles-scopes-shadow`, based on `d60b449`.

## Implemented

- Migration `0036_roles_permissions_affectations_portees_ombre.sql` adds the five B2.2 tables and backfills from the legacy account/profile/consultation tables without modifying their rows or columns. The seed contains 7 roles, 216 route permissions, and 452 role-permission relations.
- `auth.middleware.ts` continues to construct the authenticated session and enforce access from the legacy role calculation. It compares the shadow assignment/scope asynchronously with `waitUntil`; it never uses shadow data to grant or deny access. A session is sampled at most once per 5 seconds per Worker isolate; the in-memory throttle is capped at 4,096 session keys. Shadow read failures are logged without interrupting authentication.
- `ombre.ts` contains the comparison logic. `verifier-schema-local.mjs` compares the legacy and shadow role/scope values for both in-memory and local D1 seed databases.
- The route characterization test now bounds an unanswered local HTTP probe to 15 seconds and includes its role/method/path in the failure message.

## Results

| Run | Command / evidence | Result |
|---|---|---|
| Targeted Worker characterization | `SIGAD_INTEGRATION_TESTS=caracterisation-roles-worker.test.mjs npm run test:integration`; [verify-20261026T182607535Z.txt](verify-20261026T182607535Z.txt) | Exit 0; 156.2 s; 1,512 requests (7 roles × 216 routes); local Wrangler/D1 only; zero project-file changes. |
| Full gate | `npm run verify`; [verify-20261026T182853670Z.txt](verify-20261026T182853670Z.txt) | Exit 0; 367.7 s; TypeScript 0; 33 unit files / 162 tests passed; 216-route policy check passed; 36 migrations / 91 tables / 136 named indexes / 72 validation triggers; foreign-key check clean; Wrangler integration exit 0; zero project-file changes. |
| Seed comparison | Included in both schema checks | 25/25 seed accounts match legacy effective role/province/consultation scope; zero divergence. |

The integration route characterization reports 80 policy/runtime differences and 13 HTTP 400 probes that remain inconclusive; it recorded no access without an explicit role policy. These are B1.1 characterization observations, not changed authorization outcomes. The existing characterization test creates a synthetic consultation account after migration, so the one-time backfill does not yet contain it; two sanitized shadow warnings exposed this expected divergence. No token, request body, account identifier, or personal data is written to these warnings.

All Worker tests ran against temporary local Wrangler/D1/service bindings with remote credentials removed; no Staging or Production resource was targeted. The full raw execution record is in `verify-20261026T182853670Z.txt`.
