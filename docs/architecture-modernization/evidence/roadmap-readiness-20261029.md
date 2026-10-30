# SIGAD — état B2 et readiness, 2026-10-29

Référence de départ: `37b31ca`; B2.3-B technique est enregistré en `8d235fd`. Évaluations locales seulement. Ce document distingue la préparation Shadow de l'application effective des permissions.

## Statut des lots

| Lot | Verdict | Fait / restant |
|---|---|---|
| B2.3-B | **PARTIAL** | Planificateur d'import jaugé et tests d'intégrité ajoutés; aucun import, write adapter ou endpoint v1 n'est activé. Source/annexes officielles et autorité D-03/D-13 non approuvées; politique des routes v1 à enregistrer avant exposition. |
| B2.6 — socle réconciliation/comparaison | **TECHNICALLY COMPLETE / POLICY PENDING** | Réconciliation, comparateur indépendant, classification et essais locaux en place. Legacy reste seul décideur. Aucune bascule effectuée. Les indéterminés et leur cause sont détaillés ci-dessous. |
| B2.7 | **BLOCKED** | Aucun changement d'affectation ou double écriture entrepris: graphe officiel/autorité de validation manquent, et les règles géographiques D-02/D-04 restent à approuver. |
| B2.8 | **BLOCKED** | N'a pas commencé: B2.7 n'est pas achevé; l'inventaire des permissions n'a pas encore de métadonnées approuvées `sensible`/`delegable`, et les limites D-02/D-04/D-06 ne sont pas arbitrées. |
| Phase 3 | **PHASE 3 BLOCKED** | Dépendances B2.6/B2.7 non prêtes; aucune console Phase 3 commencée. |

## B2.6 — portée prouvée et zones indéterminées

Les comptes ci-dessous proviennent du test `shadow-authz-comparator.test.mjs`, sur des fixtures SQLite locales; ils ne sont ni une relance de 1 603 requêtes HTTP ni une observation de comptes réels.

| Niveau | Résultat / dénominateur | Lecture correcte |
|---|---|---|
| Porte de route | 1 581 `MATCH`, 0 `MISMATCH`, 22 `INDETERMINATE`, 0 `ERROR` / 1 603 = 229 routes × 7 rôles (mis à jour 30/10 après migration 0043) | Les 22 sont des déclarations Legacy conditionnelles; les 13 routes sans politique (91 combinaisons) sont couvertes par 0043. Aucune règle par défaut n'a été inventée. |
| Autorisation complète | 0 `MATCH`, 0 `MISMATCH`, 1 603 `INDETERMINATE`, 0 `ERROR` / mêmes 1 603 combinaisons | Les snapshots n'ont pas toutes les ressources et contextes nécessaires; ce résultat ne prouve ni parité ni divergence d'accès complète. |
| Statuts HTTP historisés | 336 `ALLOW`, 917 `DENY`, 350 `INDETERMINATE`, 0 `ERROR` / 1 603 statuts | Ce sont des statuts de snapshots historiques, pas des tests redémarrés. Les 13 sondes ciblées ayant rendu `400` restent des preuves non concluantes; 211 statuts `400` apparaissent dans l'ensemble plus large. |
| Différences historiques D-02/D-04 | 80 couples rôle-route | Ce ne sont pas 80 `MISMATCH` Shadow: 70 décrivent une cible proposée plus étroite que l'accès observé; 10 un ancien attendu documentaire plus large que le refus actuel. Chaque ligne attend sa décision. |

| Dimension | Ce qui est prouvé | Cause des indéterminés / reste requis |
|---|---|---|
| Rôle/action/ressource de route | La porte Shadow calcule indépendamment depuis les tables B2.2; résultats de route ci-dessus. | 22 politiques Legacy conditionnelles (13 routes couvertes par 0043); aucune règle à créer sans arbitrage. |
| Propriété du resource | Fixtures: propriétaire exact `ALLOW`, autre propriétaire `DENY`, propriétaire absent `INDETERMINATE`. | Les snapshots 229×7 n'incluent pas le contexte de propriété par route; vérifier les exigences par ressource après matrice détaillée. |
| Portée géographique | Fixture: même GID au même niveau `ALLOW`, autre GID même niveau `DENY`. | Relation parent/enfant `INDETERMINATE`: référentiel officiel et règles parentales approuvées manquent; l'inclusion organisationnelle n'est pas modélisée. |
| Compte/session/appareil | Tests synthétiques couvrent compte actif/suspendu, session révoquée/expirée, appareil lié autorisé/révoqué et invalidation après changement d'affectation. B2.6-R1 a réparé le scénario Worker: la session d'activation à TTL 15 min est remplacée par une réauthentification normale/MFA; `npm run verify` passe. | Ces cas démontrent le cycle de vie sur les tests concernés, pas l'équivalence Shadow/Legacy complète pour chacune des 1 603 lignes. |

La réconciliation est reproduite sur 25 comptes synthétiques: 25/25 alignés, zéro écart dans ce seed. Les mutations de rôle/portée, suspension/réactivation, invalidation, idempotence, concurrence D1 et rollback si la projection Shadow échoue sont couvertes. Aucun compte réel n'a été comparé.

## Portes préalables à tout Enforcement

| Porte | État | Condition avant activation |
|---|---|---|
| Legacy/Shadow sync et réconciliation | **PASS local / non prouvé sur données réelles** | Garder Legacy comme source; mesurer les écarts uniquement sur un jeu autorisé et anonymisé. |
| Expiration des sessions et révocation compte/appareil | **PASS sur chemins ciblés locaux** | Ne pas assimiler cela à l'équivalence complète du moteur Shadow. |
| Matrice des 229×7 portes | **PARTIAL** | Arbitrer les 80 lignes, 13 policies manquantes et 22 cas conditionnels; retester les 13 sondes avec charges valides sans réinterpréter les anciens `400`. |
| Ressource, géographie, organisation | **NOT READY** | Ajouter les contextes après approbation D-02/D-04, référentiel D-03/D-13 et modèle institutionnel applicable. |
| Activation progressive par module | **NOT READY** | Le code consulté ne fournit pas de bascule d'application RBAC par module. Toute implémentation future doit être inactive par défaut et suivie d'une preuve par module. |
| Rollback Enforcement | **NOT READY** | Le rollback de projection Shadow n'est pas le rollback d'une décision d'accès. Définir et tester la remise en observation / retour Legacy avant lancement. |
| Failure modes / audit | **PARTIAL** | Les erreurs de projection annulent la mutation source; le comparateur garde `INDETERMINATE` distinct. B2.4 audite les opérations existantes, mais aucun événement de bascule RBAC n'existe tant qu'aucune bascule n'est construite. |
| Migrations | **PASS local** | Les 42 migrations s'appliquent en mémoire et au D1 temporaire; aucune migration distante. |

**Conclusion d'activation:** pas d'Enforcement prêt et pas de bascule autorisée. Le verdict du socle B2.6 ne vaut pas autorisation ni readiness opérationnelle.

## D-12 — workflows des opérations centrales (sans changement)

Les routes et `operation-centrale.service.ts` utilisent actuellement `ADMIN_CENTRAL` pour créer/modifier, envoyer, enregistrer les actes, approuver/ouvrir et exécuter la consolidation/clôture. La transition vers `APPROUVEE` accepte actuellement au moins un acte opérationnel accepté provenant de la commission **ou** du ministère; les tests existants enregistrent les deux actes et ne prouvent pas la suffisance de chacun isolément. La matrice documentaire donne par ailleurs au propriétaire certains actes d'édition/fermeture et ne tranche ni la lecture de consultation, ni la vérification juridique/signature des actes.

| Arbitrage D-12 | Effet sur le workflow actuel |
|---|---|
| Garder la règle actuelle « commission OU ministère » | Pas de changement de séquence; ajouter les tests d'acceptation par chaque acte isolé après décision. |
| Exiger « commission ET ministère » | Changement fonctionnel: la deuxième pièce devient préalable à `APPROUVEE`; définir l'effet sur les opérations en cours et les actes déjà déposés. |
| Choisir une autorité ou séquence différente | Définir autorité signataire, validateur, ordre, actes admissibles et effets sur édition/consultation/clôture avant tout code. |

Aucune de ces options n'est retenue ici; pas de changement D-12 ni de comportement.

## B2.7, B2.8 et Phase 3

- **B2.7 — blocker légal/structurel:** les tables `geo_*` restent sans données réelles. Il manque l'édition complète vérifiée des textes et annexes, les relations/dates d'effet approuvées, et l'autorité chargée de valider. Les modules d'isolation existants demeurent sur Legacy; pas de double écriture vers un graphe vide, pas de changement des rattachements opérationnels.
- **B2.8 — blocker de dépendance et de contrat:** en plus de B2.7 et des approbations D-02/D-04, `permissions` ne porte que les champs de route/mode/CSRF et `roles_permissions.source` est limité au baseline. On ne peut pas appliquer I1/I6 (permissions délégables et non sensibles) de façon sûre sans catalogue et métadonnées approuvés. Aucune migration, API ou rôle personnalisé n'est ajouté.
- **Phase 3 — BLOCKED:** B2.7/B2.8 ne sont pas livrés, les règles d'accès détaillées ne sont pas signées, et le rollback d'Enforcement n'est pas prêt.

## Vérification de ce checkpoint

| Commande / preuve | Résultat |
|---|---|
| `npm run test:unit -- tests/unit/b2-3-geo-import-plan.test.mjs` | PASS, 6/6. |
| `npm run verify:rapide` | PASS, exit 0; 39 fichiers / 197 tests, matrice 229 routes, 42 migrations, fichiers auto-modifiés 0; dernière preuve `evidence/verify-20261029T172452114Z.txt` (précédent run: `171026595Z`). |
| `npm run verify` sans ajustement Temp | FAIL avant le Worker (`fetch failed`, puis `EPERM` au nettoyage); preuve gardée, pas comptée comme PASS: `evidence/verify-20261029T171208952Z.txt`. |
| `npm run verify` avec `TEMP=TMP=C:\Users\Lenovo\AppData\Local\Temp` | PASS, exit 0; 39 fichiers / 197 tests; matrice 229 routes; 42 migrations; intégration Worker + D1 temporaires locale exit 0; fichiers auto-modifiés 0. Dernière preuve `evidence/verify-20261029T172553044Z.txt` (run antérieur également passé: `171321406Z`). |

Pas de données réelles, d'Enforcement, de migration distante, de déploiement ou de push.
