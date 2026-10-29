# B2.6 — revue finale des preuves (2026-10-29)

## Verdict

**B2.6 PARTIAL — pas prête pour l'Enforcement.** Le comparateur Shadow est autonome pour calculer sa décision à partir des tables B2.2, la réconciliation a une couverture utile et les vérifications rapides passent. La parité complète n'est toutefois pas établie; la dernière vérification complète a échoué dans un test Worker de session/appareil, et D-02/D-04 détaillés restent à approuver.

Aucune autorisation opérationnelle, règle D-12, migration ou donnée réelle n'a été changée dans cette revue. Le comparateur reste diagnostique.

## Exécutions et portée

| Preuve | Portée et résultat |
|---|---|
| [`verify-20261027T112606191Z.txt`](verify-20261027T112606191Z.txt), HEAD `7b39655` | Dernier `npm run verify` complet disponible; **FAIL**, 6 993,7 s. TypeScript, 190 tests unitaires/38 fichiers, contrôle des 229 routes, schéma/migrations (42 migrations) et migration 0022 ont terminé avec exit 0. L'intégration Wrangler a démarré (`Ready`) puis échoué dans `auth-worker.test.mjs:2120`: `/api/auth/session` a retourné 401 au lieu de 200 pour une session liée à un appareil approuvé. Le test affiche aussi une requête de révocation d'un appareil tiers en 404 après 6 864 446 ms; le lien causal avec le 401 n'est pas démontré. Il faut traiter ce résultat comme un échec fonctionnel à diagnostiquer, pas comme un succès ni comme une erreur réseau prouvée. L'intégration complète s'est arrêtée à ce premier fichier. |
| [`verify-20261029T162804196Z.txt`](verify-20261029T162804196Z.txt), HEAD `7b39655` | Dernier `npm run verify:rapide`; **PASS**, 25,6 s: TypeScript exit 0; 191 tests/38 fichiers exit 0; matrice de 229 routes exit 0; 42 migrations en mémoire, schéma et migration 0022 exit 0; empreinte des fichiers projet: 0 modification non prévue. Ce mode ne lance pas Worker. [`verify-20261029T162407631Z.txt`](verify-20261029T162407631Z.txt) est le premier rapide, avant les dernières assertions ajoutées. |
| Exécution ciblée du 29/10, 17:27 Africa/Ndjamena | `npm run test:unit -- tests/unit/shadow-authz-comparator.test.mjs tests/unit/b26-reconciliation-ombre.test.mjs --reporter=verbose`; **12/12 tests PASS** en 1,71 s. Le résumé de comparaison est reproduit ci-dessous. |
| [`verify-20261027T112453454Z.txt`](verify-20261027T112453454Z.txt), HEAD `7b39655` | Intégration Worker B2.6 ciblée; **1/1 PASS**, exit 0, 53,8 s. Elle vérifie l'écriture D1 concurrente, la réconciliation finale et le maintien de Legacy comme décideur. |
| [`verify-20261027T091622530Z.txt`](verify-20261027T091622530Z.txt), HEAD `6a33c68` | Ancienne vérification complète **PASS**: 184 tests et test HTTP des 7 rôles × 229 routes réussi (94,5 s). Cette exécution précède la migration 0042; elle ne remplace donc pas une preuve Worker équivalente sur l'état courant. |
| [`verify-20261029T162234730Z.txt`](verify-20261029T162234730Z.txt) et [`verify-20261029T162318907Z.txt`](verify-20261029T162318907Z.txt) | Deux tentatives isolées de `caracterisation-roles-worker.test.mjs` avec `TEMP`/`TMP=C:\Users\Lenovo\AppData\Local\Temp`; exit 1 avant affichage des migrations ou démarrage du Worker. La seconde, avec `WRANGLER_LOG=debug`, localise l'échec à `wrangler d1 migrations apply --local`: `undici TypeError: fetch failed`, pile `[worker eval]:35`; aucune cible réseau ni errno inférieur n'est enregistrée. Configuration Wrangler `local`, ID D1 factice, aucun `account_id`, route ou binding distant. La cause exacte de ce fetch n'est pas démontrée; les tests HTTP de caractérisation n'ont pas commencé. |

Le dernier échec complet et les deux erreurs de démarrage isolées sont distincts: le premier est une assertion HTTP après le démarrage du Worker; les secondes surviennent avant le démarrage. Aucun n'est assimilé à l'autre.

## Comparateur et dénominateurs

Le calcul Shadow de [`comparateur-ombre.ts`](../../backend/src/core/authz/comparateur-ombre.ts) lit directement, par un seul `SELECT`, `permissions`, `roles_permissions`, `roles`, affectations/portées, compte, réconciliation, session et appareil. Il ne rappelle pas l'évaluateur Legacy. Le catalogue partagé sert à identifier la route et ses métadonnées; le côté Legacy du test de matrice est une interprétation de cette déclaration (`legacyDeclare`), pas une nouvelle exécution du middleware et des contrôles métier Legacy. Les comparaisons ci-dessous ne prouvent donc pas la parité complète du runtime.

| Niveau évalué | Résultat | Dénominateur et interprétation |
|---|---:|---|
| Politique de porte de route | 1 490 MATCH; 0 MISMATCH; 113 INDETERMINATE; 0 ERROR | 1 603 combinaisons = 229 routes × 7 rôles. Les 113 indéterminées sont 91 combinaisons issues de 13 routes sans politique Shadow × 7 rôles, et 22 déclarations Legacy conditionnelles. Aucune politique par défaut n'a été ajoutée. |
| Autorisation runtime complète comparée aux observations HTTP | 0 MATCH; 0 MISMATCH; 1 603 INDETERMINATE; 0 ERROR | Même 1 603 lignes, mais l'observation historique HTTP n'est pas au niveau `AUTORISATION_COMPLETE`; ressources et contextes ne sont pas présents dans chaque snapshot. Le comparateur refuse justement de déclarer ces niveaux équivalents. |
| Classes des statuts historiques normalisés | 336 ALLOW; 917 DENY; 350 INDETERMINATE; 0 ERROR | 1 603 statuts des snapshots, pas une relance HTTP: 329×200 + 7×201; 7×401 + 910×403; 211×400 + 118×404 + 21×409. Tout 400/404/409 reste non concluant. |

### Séparation des dimensions d'autorisation

- **Porte de route:** comparée sur toute la matrice 229 × 7, avec 13 routes sans policy Shadow explicitement indéterminées.
- **Propriété du resource:** tests synthétiques: propriétaire exact → ALLOW; autre propriétaire → DENY; propriétaire absent → INDETERMINATE. Ce ne sont pas 1 603 évaluations de propriétés réelles.
- **Géographie:** province exactement assignée → ALLOW; autre province au même niveau → DENY; relation de niveau parent/enfant (par exemple province/localité) → INDETERMINATE, car aucun lien B2.3 approuvé ne permet de prouver l'inclusion. Une portée d'organisation est aussi INDETERMINATE, son modèle n'existant pas dans Shadow.
- **Compte/session/appareil:** cas synthétiques couvrent compte actif/suspendu, session active/révoquée/expirée, appareil lié autorisé puis révoqué, exigence MFA (0 refusé, 1 accepté) et invalidation de session après changement de rôle. Le chemin Worker d'une session réelle liée à l'appareil autorisé a échoué (401 au lieu de 200); le fonctionnement de bout en bout n'est donc pas prouvé. La matrice route × rôle n'implique pas la couverture exhaustive de chaque combinaison de ces états.
- Les tests de comparaison incluent des assertions MATCH/MISMATCH/INDETERMINATE/ERROR, HTTP 400, permission manquante, relation `roles_permissions` retirée en savepoint et affectation expirée. Ces changements sont limités à la base `:memory:` des tests.

Les **13 routes sans policy Shadow** sont: `GET /api/administration/comptes/appareils`, `GET /api/compte/appareils`, `GET /api/proprietaire/appareils`; les trois `POST /api/administration/comptes/appareils/:id/{approuver,revoquer,suspendre}`; `POST /api/compte/appareils`, `POST /api/compte/appareils/:id/revoquer`, `POST /api/compte/appareils/defis`; `POST /api/compte/sessions/:id/revoquer`, `POST /api/compte/sessions/revoquer-toutes`; `POST /api/proprietaire/appareils/:id/revoquer`, `POST /api/proprietaire/utilisateurs/:id/revoquer`.

## Vérification des 13 sondes HTTP et des 80 écarts

Les 13 sondes HTTP initiales (`400`) sont un sous-ensemble nommé, non le total des 400 du snapshot. Elles sont: pour chacun de `SUPERVISEUR_TERRAIN`, `AGENT_DISTRIBUTION`, `RESPONSABLE_STOCK`, quatre lectures (`/api/distributions/referentiels`, `/api/territoire/arrondissements`, `/api/territoire/carres`, `/api/territoire/quartiers`), puis `CONSULTATION_INSTITUTIONNELLE × POST /api/rapports/:type/export`. Le comptage des 1 603 snapshots retrouve précisément 13/13 de ces lignes en 400; au total il existe 211 statuts 400. Les réponses 400 ne prouvent aucune autorisation ni aucun refus.

Les **80 couples rôle-route** du document D-02/D-04 se répartissent en A1 21 + A2 24 + A3 20 + A4 5 + B1 1 + B2 1 + B3 7 + B4 1. Les 70 lignes A1–A4 décrivent des lectures actuellement permises mais dont la cible proposée est plus étroite; les 10 lignes B1–B4 décrivent des refus actuels malgré une ancienne attente documentaire permissive. Ce sont des différences entre comportement observé et politique cible proposée, **pas** 80 MISMATCH Legacy/Shadow. Elles restent non approuvées et n'ont pas modifié de permission.

## Réconciliation et transitions d'accès

Les 5 tests unitaires de réconciliation couvrent: les 25 comptes de la fixture locale (25/25 réconciliés, 0 écart); création et changements rôle/portée; suspension/réactivation et invalidation de session; changements de profil, entrepôt et périmètres de consultation avec idempotence; rollback Legacy si la projection échoue; conflits de profils, retrait et compte supprimé avec résultat explicite. Le test Worker ciblé ajoute concurrence D1, vérifie la projection finale et démontre qu'une divergence Shadow n'accorde pas la route propriétaire: Legacy garde la décision.

La revue du code `meta.changes` confirme que les opérations d'état testent l'entrée de résultat correspondant à l'UPDATE/INSERT conditionnel concerné et exigent au moins une ligne source (`comptes.routes.ts:928,1208`, transitions de compte et profils). Les projections et triggers peuvent gonfler ce compteur; les gardes ne l'égalisent donc pas à un nombre total de sous-écritures. Les transitions unitaires de session/appareil qui ne subissent pas cette projection continuent d'exiger exactement une ligne. Aucun nouveau défaut `meta.changes` n'a été établi dans cette revue.

## Conditions restantes avant Enforcement

1. Diagnostiquer puis faire passer le scénario Worker « session d'un appareil autorisé » (401 observé vs 200 attendu) et obtenir une exécution complète verte sur l'état post-0042.
2. Obtenir l'approbation détaillée D-02/D-04 pour les 80 couples et leurs exceptions; aucun MISMATCH opérationnel ne peut être accepté par inférence.
3. Pour les 13 routes sans policy Shadow, faire approuver la règle de chaque route ou justifier leur exclusion; ne pas inventer de permissions.
4. Lever les 22 cas de déclaration Legacy conditionnelle avec contexte probant, puis fournir de vrais contextes de ressource, hiérarchie géographique et organisation pour comparer l'autorisation complète. Examiner chaque divergence et prouver l'absence d'élargissement.
5. Rejouer les 13 sondes avec charges valides et tests Worker actuels; conserver leurs anciens 400 comme non concluants.
6. Conserver B2.2 en ombre jusqu'à stratégie de bascule et de retour, tests de synchronisation sans fenêtre d'accès périmé, et approbations nécessaires. D-12 et B2.3-B ne sont pas modifiés ici.

**Conclusion:** comparer la politique de porte est désormais possible et limité par le refus par défaut; l'équivalence resource/géographie/organisation/runtime n'est pas établie. B2.6 reste partielle et l'Enforcement est bloqué par les éléments ci-dessus.
