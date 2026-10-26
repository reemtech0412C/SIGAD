# SIGAD — UI-MAP 1.9 : clôture de la revue des doublons

Date de vérification : 23 octobre 2026
Environnement : Worker Cloudflare, D1 et R2 locaux éphémères, données synthétiques.
Changements distants : aucun.
Publication : aucune.

## Décision

```text
DUPLICATE_REVIEW: PASS
IMPORT_IDEMPOTENCY: PASS
REOPEN_ON_NEW_EVIDENCE: PASS
PROVINCIAL_ISOLATION: PASS
KPI_REGRESSION: PASS
OPERATIONAL_MAP: PASS
LEGAL_BOUNDARIES: NOT_APPROVED
OVERALL: PARTIAL
```

La revue centrale `CONFIRME_DISTINCT` clôt maintenant fonctionnellement le dossier de rapprochement. Les deux ménages restent distincts et sont placés en vérification individuelle. La carte et ses statistiques sont acceptées sur le plan opérationnel; les limites OCHA demeurent indicatives et non homologuées juridiquement, d’où le statut global `PARTIAL`.

## Cycle de décision

| Événement | État du signalement | État des ménages | Conséquence |
|---|---|---|---|
| Import sans rapprochement identifié | Aucun | `ACTIF / VALIDE` selon le flux d’import existant | Pas de signalement créé |
| Rapprochement nécessitant une revue | `EN_ATTENTE` | `DOUBLON_SUSPECTE / A_VERIFIER` | Aucune fusion ni suppression |
| Décision centrale `CONFIRME_DISTINCT` | Décision clôturée et immuable | Les deux dossiers deviennent `INACTIF / A_VERIFIER` | Aucune activation automatique; chaque dossier exige une validation centrale individuelle |
| Validation centrale individuelle | Historique antérieur conservé | `ACTIF / VALIDE` ou `INACTIF / REFUSE` | Décision, auteur, date et motif audités |
| Réimport avec les mêmes critères | Aucun nouveau dossier | État de revue conservé | Pas de réouverture sur la seule répétition de l’import |
| Nouvelle empreinte de rapprochement | Nouveau signalement lié au précédent | `DOUBLON_SUSPECTE / A_VERIFIER` | Le dossier précédent reste conservé |
| Réouverture manuelle sur référence documentaire nouvelle | Nouveau signalement lié au précédent | `DOUBLON_SUSPECTE / A_VERIFIER` | Référence protégée par HMAC; l’original n’est pas stocké |

L’état antérieur à la suspicion n’étant pas conservé, il n’est jamais reconstitué par supposition. Les signalements historiques explicitement enregistrés `CONFIRME_DISTINCT` sont migrés vers la revue individuelle `INACTIF / A_VERIFIER`; cela peut nécessiter une validation centrale des dossiers concernés.

## Modèle de données

La migration additive `0022_cloture_revue_doublons.sql` conserve les migrations `0001` à `0021` inchangées. Elle ajoute à `menages` l’état de validation (`A_VERIFIER`, `VALIDE`, `REFUSE`), l’auteur, la date et le motif de décision. Elle ajoute à `signalements_doublons` les empreintes HMAC, le résumé de comparaison, l’empreinte de référence documentaire, le lien `reouverture_de_id`, l’auteur et le motif de réouverture ainsi que la date de traitement.

Les décisions clôturées sont protégées contre la modification et la suppression. L’unicité porte sur les signalements `EN_ATTENTE`, ce qui autorise une nouvelle revue liée sans effacer l’historique. Des déclencheurs empêchent l’ouverture d’une revue si les deux dossiers ne sont pas dans l’état attendu, appliquent la transition de confirmation distincte et inscrivent l’audit dans la même opération D1. L’échec forcé de l’écriture d’audit a été vérifié : l’opération entière est annulée.

Les empreintes sont des HMAC-SHA-256 dérivés par HKDF d’un secret applicatif. Le numéro de téléphone, le nom et la référence documentaire en clair ne sont pas ajoutés aux données de preuve. Le résumé conserve uniquement les critères de comparaison et, si nécessaire, l’identifiant de localité.

### Routes concernées

| Méthode | Route | Autorité |
|---|---|---|
| `POST` | `/api/gestion/menages/importations` | Délégué provincial dans la province de session; clé d’idempotence obligatoire |
| `POST` | `/api/gestion/signalements-doublons/:signalementId/decision` | `ADMIN_CENTRAL` |
| `POST` | `/api/gestion/menages/:menageId/validation` | `ADMIN_CENTRAL` |
| `POST` | `/api/gestion/signalements-doublons/:signalementId/reouverture` | `ADMIN_CENTRAL`, référence documentaire nouvelle requise |

La province d’import reste dérivée de la session. Le corps de requête ne peut pas substituer une autre province. Aucune autorité ni règle RBAC n’a été élargie.

## Idempotence et preuves nouvelles

- Une répétition avec la même clé et le même contenu restitue la réponse enregistrée sans créer un second import.
- La réutilisation d’une clé avec un contenu différent est rejetée.
- Un nouvel import intentionnel avec une clé différente et les mêmes critères ne rouvre pas une affaire `CONFIRME_DISTINCT`.
- Les importations simultanées et l’échec transactionnel sont couverts par les tests Worker/D1.
- Une empreinte de critère nouvelle ou une référence documentaire inédite ouvre un dossier lié; la même référence documentaire ne peut pas être rejouée.
- Une modification d’horodatage ou de clé d’idempotence ne constitue pas une preuve nouvelle.

Un premier passage complet a révélé que deux ménages créés pendant la même seconde pouvaient être sélectionnés selon un ordre d’identifiant aléatoire. La sélection privilégie désormais le dossier source de la revue enregistrée, puis le dossier suspect, avant le départage stable. Le test ciblé et le passage complet sont ensuite passés.

## Résultats des vérifications

| Contrôle | Résultat | Preuve |
|---|---|---|
| TypeScript | PASS | `npm run typecheck` termine avec `tsc --noEmit` réussi. Wrangler signale séparément un `EPERM` non fatal en essayant d’écrire son journal dans le profil Windows hors du dépôt. |
| Build | PASS | `npm run build` — Vite et génération PWA réussis. |
| Tests unitaires | PASS | `npm run test:unit` — 11 fichiers, 45 tests réussis. |
| Tests d’intégration | PASS | `npm run test:integration` et la phase d’intégration de `npm run test:e2e` — 22 sous-tests : authentification/revue (2), matrice de sécurité (1), stocks (1), approvisionnements (1), distributions (10), rapports (7). |
| Playwright / Chrome | PASS | `npm run test:e2e` avec Chrome installé — 11 tests réussis, 0 échec; flux de réception, distribution, retours, clôture, notifications, rapports, rôles et vues adaptatives inclus. |
| Schéma vierge | PASS | `npm run db:verifier` — 22 migrations, 65 tables, 86 index, 74 déclencheurs de validation, 25 comptes synthétiques, 23 provinces, intégrité référentielle vérifiée. |
| Migration 0022 | PASS | `npm run db:verifier:migration-0022` — transition depuis le schéma 0021 et application sur schéma vierge vérifiées; historique, contraintes et clés étrangères contrôlés. |
| Matrice de sécurité | PASS | `npm run test:security-matrix` — 143 routes cataloguées. Le test Worker effectue 140 essais anonymes et 128 refus RBAC; l’empreinte des 65 tables reste inchangée après les requêtes interdites. |
| Isolation provinciale | PASS | Accès croisés Sila/Ouaddaï refusés; réponses KPI calculées selon la session; tests de refus sans modification de données. |
| Régression des KPI | PASS | Valeurs des quatre KPI comparées avant et après `CONFIRME_DISTINCT`; aucune variation sans mouvement de stock ni preuve de remise. |
| Vérification de patch | PASS | `git diff --check` — aucune erreur d’espacement; seuls des avertissements Git de conversion LF/CRLF sont affichés. |

Le premier lancement Playwright a été bloqué avant l’ouverture du navigateur, car le cache temporaire Playwright ne contenait pas Chromium. La relance a utilisé le Chrome déjà installé via `SIGAD_PLAYWRIGHT_EXECUTABLE`; aucune installation de navigateur ni modification système n’a été nécessaire. Le test E2E final a terminé avec `11 passed (2.6m)`. Le premier passage d’intégration, antérieur au correctif d’ordre du dossier source, avait échoué sur le scénario de preuve nouvelle; après le correctif, les tests ciblé et complet sont passés.

## Fichiers de la clôture UI-MAP 1.9

- `migrations/0022_cloture_revue_doublons.sql` — extension additive et transitions de revue.
- `backend/src/services/preuve-doublon.service.ts` — signatures HMAC des preuves de comparaison.
- `backend/src/routes/gestion.routes.ts` — import, décision distincte, validation individuelle et réouverture.
- `backend/src/services/distribution.service.ts` — exclusion des ménages non validés des opérations de distribution.
- `shared/validations/beneficiaires.ts` — contrats de décision et de réouverture.
- `frontend/src/components/gestion/TableauGestionBeneficiaires.tsx` — état de validation et actions centrales.
- `scripts/verifier-schema-local.mjs` et `scripts/verifier-migration-0022.mjs` — contrôles du schéma et du chemin de migration.
- `scripts/generer-matrice-securite-phase9.mjs` et `docs/matrice-securite-api-phase9.md` — synchronisation de la matrice des routes.
- `tests/integration/auth-worker.test.mjs`, `tests/integration/distributions-worker.test.mjs`, `tests/integration/securite-matrice-worker.test.mjs`, `tests/unit/preuve-doublon.test.mjs` — scénarios de décision, preuve, isolation, rollback et non-régression.
- `package.json` — commande de vérification ciblée de la migration 0022.

Le dépôt contenait déjà d’autres modifications liées aux travaux antérieurs UI/Map; elles n’ont pas été réinitialisées ni supprimées.

## Limites et suites nécessaires

1. Les limites OCHA restent indicatives : aucune homologation juridique des frontières n’est affirmée.
2. Les dossiers historiques `CONFIRME_DISTINCT` sans état antérieur nécessitent une revue individuelle; aucune restauration automatique de leur ancien statut n’est possible.
3. Les critères automatiques de preuve restent ceux du modèle SIGAD actuel (téléphone normalisé et nom/localité). Toute autre pièce doit suivre la réouverture centrale avec référence documentaire.
4. La migration est validée sur D1 locale éphémère et sur le schéma 0021 synthétique. Aucune migration n’a été appliquée à une base locale persistante ou distante. Aucun `down` n’est fourni; une restauration ultérieure doit s’appuyer sur sauvegarde vérifiée et procédure contrôlée.
5. Wrangler ne peut pas écrire son journal dans le répertoire utilisateur protégé de cette session (`EPERM`), mais la génération des types et `tsc` se terminent avec le code 0. Ce point d’environnement n’a pas été contourné en modifiant les permissions Windows.

## Périmètre des changements

- Migration distante : aucune.
- D1/R2 distantes : aucune lecture ni écriture.
- Publication Cloudflare : aucune.
- Git push : aucun.
- Activation des communes en relecture : aucune.
