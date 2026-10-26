# UI-MAP 1.8 — Résolution des doublons et acceptation opérationnelle

**DUPLICATE_REVIEW : PARTIAL**  
**IMPORT_IDEMPOTENCY : PASS**  
**PROVINCIAL_ISOLATION : PASS**  
**KPI_REGRESSION : PASS**  
**OPERATIONAL_MAP : PARTIAL**  
**LEGAL_BOUNDARIES : NOT_APPROVED**  
**OVERALL : PARTIAL**

## Périmètre et décision

Les vérifications ont été exécutées localement avec Wrangler, le Worker Cloudflare, D1/R2 de test et des données synthétiques. Aucune migration n’a été ajoutée ou appliquée à distance; aucune donnée réelle, publication, mise en production ou opération Git distante n’a été utilisée.

La protection d’idempotence des créations et imports de ménages est mise en œuvre et testée avec la table D1 `cles_idempotence` déjà présente. Les décisions de revue des doublons restent auditables et non destructives. En revanche, le schéma ne définit pas de transition autorisée qui retire `DOUBLON_SUSPECTE` après `CONFIRME_DISTINCT`. Le déclencheur peut aussi remettre des enregistrements en suspicion lors d’une nouvelle saisie portant les mêmes critères. Cette partie demeure donc **PARTIAL** et ne doit pas être corrigée par une modification implicite des statuts.

## États et cycle de revue constatés

`menages.statut` autorise `ACTIF`, `INACTIF`, `DOUBLON_SUSPECTE` et `ARCHIVE`. `signalements_doublons.statut_traitement` autorise `EN_ATTENTE`, `CONFIRME_DISTINCT` et `CONFIRME_DOUBLON`. La table conserve l’auteur et l’observation de décision; la route écrit également un événement dans `journaux_audit`.

Le déclencheur de `migrations/0021_reconciliation_doublons_concurrents.sql` marque les deux ménages correspondants `DOUBLON_SUSPECTE`, puis insère un signalement. L’index unique de `migrations/0013_unicite_signalements_doublons.sql` empêche une seconde ligne de signalement pour une même paire, mais il ne neutralise pas le déclencheur : une nouvelle saisie peut néanmoins réappliquer le statut suspect et créer un signalement avec une nouvelle paire.

La route existante traite une décision `CONFIRME_DISTINCT` ou `CONFIRME_DOUBLON` une seule fois. Une justification non vide d’au moins huit caractères est désormais exigée. L’audit contient l’identifiant de l’utilisateur, l’horodatage et la justification. Pour `CONFIRME_DOUBLON`, les dossiers ne sont ni fusionnés ni supprimés : ils restent marqués suspects. Pour `CONFIRME_DISTINCT`, le signalement reçoit sa décision, mais les deux ménages restent également `DOUBLON_SUSPECTE`, puisqu’aucune transition de retour n’est définie.

### Résolution distincte — résultats observés

| Contrôle | Attendu | Observé | Résultat |
|---|---|---|---|
| Deux dossiers distincts conservés | 2 lignes indépendantes | 2 lignes conservées | PASS |
| Signalement traité | `CONFIRME_DISTINCT` | `CONFIRME_DISTINCT` | PASS |
| Justification, auteur et date | Présents dans l’audit | Présents (`usr-central`, date, justification) | PASS |
| Retrait du statut suspect des deux dossiers | Selon la demande | 2 dossiers restent `DOUBLON_SUSPECTE` | BLOCKED par le modèle actuel |
| Réactivation sans approbation finale | Aucune approbation implicite | Aucun statut modifié | PASS pour la non-réactivation; objectif de levée du soupçon non atteint |
| Réapparition sans nouvelle preuve | Même paire non re-signalée | Index unique sur la paire; le déclencheur reste actif et peut marquer les lignes ou créer une nouvelle paire | PARTIAL |

L’index actuel évite la duplication du même signalement exact, mais ne suffit pas à garantir l’absence de nouvelle suspicion après la confirmation de deux dossiers distincts. Aucun changement de trigger ou d’état n’a été fait sans accord sur la transition métier.

### Doublon confirmé — traitement conservateur

Le test synthétique de confirmation conserve les deux ménages, leur membre, l’inscription à une liste de bénéficiaires et les compteurs contrôlés de remises et de mouvements de stock. Aucun rapprochement ne supprime un dossier, ne transfère automatiquement ses relations ou ne modifie les stocks. Les deux lignes restent `DOUBLON_SUSPECTE` et la décision est auditée.

Ce comportement protège l’historique, mais il ne constitue pas une procédure complète de consolidation des bénéficiaires. Le scénario dédié n’a pas créé de remise historique associée à ces deux ménages; la conservation des remises a été vérifiée par comparaison des compteurs avant/après, sans démontrer un rapprochement opérationnel de ces remises. La confirmation réelle d’un doublon ne doit donc pas déclencher de fusion ou d’archivage automatique.

## Proposition à faire approuver avant toute migration

Une migration corrective `0022_revue_doublons_distincts.sql` et une adaptation de la détection sont nécessaires pour fermer la réserve. Elles ne sont **pas créées ni appliquées** dans cette livraison.

La décision métier préalable doit préciser :

1. Le statut à appliquer aux deux ménages après `CONFIRME_DISTINCT`. Le modèle ne conserve pas, sur le signalement, les statuts antérieurs de chaque membre de la paire. Restaurer `ACTIF` sans preuve fiable de l’état précédent pourrait réactiver un dossier; choisir `INACTIF` empêcherait une approbation implicite mais le rendrait indisponible au circuit opérationnel.
2. La règle permettant de distinguer une preuve réellement nouvelle d’une répétition du même rapprochement. Le schéma actuel ne conserve pas de référence versionnée à la preuve utilisée pour le rapprochement.
3. Le traitement des signalements historiques déjà confirmés, pour lesquels le statut antérieur des deux ménages peut ne pas être reconstructible.
4. La procédure du doublon confirmé qui préserve les références des listes, membres, distributions, remises et historiques sans fusion destructive ni effet implicite sur le stock.

Après décision, la migration devra remplacer le déclencheur sans toucher aux migrations déjà appliquées, encadrer les paires déjà résolues, tracer la preuve et l’auteur des décisions, et inclure des tests de migration sur une base locale propre et une copie locale de schéma. Tant que cette décision n’est pas prise, `DUPLICATE_REVIEW` reste `PARTIAL`.

## Idempotence des imports

Le service nouveau `backend/src/services/idempotence-import.service.ts` réutilise `cles_idempotence` sans migration. Il exige `X-Idempotency-Key`, valide une clé imprimable de 16 à 200 caractères, la hache avec SHA-256 en la liant à l’utilisateur et à la route, puis compare une empreinte SHA-256 du contenu JSON normalisé. La clé brute et les données personnelles ne sont pas utilisées comme clé D1 ni écrites dans les journaux techniques. La réponse mémorisée ne contient que le message, les nombres et les codes des ménages; elle est rejouée pendant 48 heures.

L’enregistrement de la clé, les ménages, les membres, les signalements, la réconciliation des statuts et l’audit sont inclus dans un même `db.batch`. Une collision concurrente gagnante est relue et rejouée; un contenu différent avec la même clé reçoit `409`. En cas d’échec du lot, la clé n’est pas conservée et la requête peut être retentée. Un nouvel import volontaire doit porter une clé différente. La page d’import garde la même clé pendant une nouvelle tentative du même formulaire/fichier et en crée une autre après succès ou changement de contenu.

| Scénario | Résultat attendu | Résultat observé | Résultat |
|---|---|---|---|
| Même clé et même contenu, répétition | Même statut/réponse, aucune nouvelle ligne | Réponse `201` rejouée, 1 ménage et 1 audit | PASS |
| Même clé et contenu différent | Refus sans mutation | `409`, aucune insertion supplémentaire | PASS |
| Deux requêtes simultanées, même clé et contenu | Un seul import, réponse stable pour les deux | Deux réponses identiques, 1 ménage et 1 audit | PASS |
| Même contenu, nouvelle clé | Nouvel import intentionnel | 2e dossier créé et signalement de similarité | PASS |
| Échec de l’audit dans le lot, puis nouvel essai avec la même clé | Rollback intégral puis réussite | `500`, aucun ménage/signalement/audit partiel; nouvel essai `201` | PASS |
| Ménage avec correspondance potentielle | Pas de fusion automatique | Signalement conservé pour décision humaine | PASS |

La politique de rejeu est de 48 heures, comme pour le mécanisme de stock existant. Les lignes expirées sont retirées lorsqu’une clé identique est réutilisée; aucun nettoyage global périodique n’a été ajouté dans cette phase.

## Régression des KPI et isolation

Le test d’import/revue interroge le vrai endpoint local `GET /api/rapports/indicateurs-carte` avant et après une décision distincte. Le scénario dédié ne contient ni distribution ni entrepôt actif; `null / INDISPONIBLE` pour le stock est donc attendu, et non un zéro artificiel.

| KPI, Sila — scénario de revue synthétique | Valeur attendue avant/après | Valeur observée avant/après | Résultat |
|---|---:|---:|---|
| Distributions réalisées | 0 / 0 | 0 / 0 | PASS |
| Distributions en cours | 0 / 0 | 0 / 0 | PASS |
| Ménages servis | 0 / 0 | 0 / 0 | PASS |
| Stocks disponibles | Indisponible / Indisponible (aucun entrepôt actif) | `null`, `INDISPONIBLE` / `null`, `INDISPONIBLE` | PASS |

Le scénario distribution de régression a aussi vérifié les valeurs opérationnelles après réservation et clôture : Sila `1 réalisée / 0 en cours / 2 ménages servis / 59 kg`; Ouaddaï `0 / 0 / 0 / 20 kg`. Les valeurs retournées par l’API correspondaient aux attentes. Ces résultats proviennent du test local de distribution; ils ne sont pas attribués à une décision de doublon.

Les appels provinciaux au KPI sont limités à la province dérivée de la session. Le test Sila→Ouaddaï est refusé (`403`) et les réponses provinciales ne contiennent ni données personnelles ni agrégats d’une autre province. La matrice de sécurité globale a comparé l’empreinte des 65 tables avant/après les requêtes interdites : aucune mutation.

## Modifications de cette livraison

Modifications directement liées à UI-MAP 1.8 :

- `backend/src/services/idempotence-import.service.ts` — clé persistée et hachée, empreinte du contenu, rejeu, conflit et coordination concurrente.
- `backend/src/routes/gestion.routes.ts` — clé obligatoire pour les deux routes d’import/création de ménage, écritures atomiques, justification de décision distincte et réponse de rejeu.
- `frontend/src/components/gestion/TableauGestionBeneficiaires.tsx` — conservation d’une clé stable pendant les nouvelles tentatives du même contenu.
- `tests/integration/auth-worker.test.mjs` — tests de rejeu, concurrence, contenu conflictuel, rollback, audit, doublons, KPI et périmètre provincial.
- `docs/UI_MAP_1_8_DUPLICATE_REVIEW_ACCEPTANCE.md` — présent rapport.

Les autres modifications visibles dans l’arbre Git couvrent des travaux antérieurs du dépôt; elles n’ont pas été réattribuées à UI-MAP 1.8. Aucun commit n’a été créé.

## Commandes et résultats des validations locales

| Commande / contrôle | Résultat réel |
|---|---|
| `npm run typecheck` | PASS — code de sortie 0 |
| `npm run build` | PASS — Vite, code de sortie 0 |
| `npm run test:unit` | PASS — 10 fichiers, 42 tests réussis |
| `npm run test:integration` | PASS final — 22 tests : auth/import 2, matrice sécurité 1, stocks 1, approvisionnements 1, distributions 10, rapports/KPI 7. Un premier passage a révélé une régression de rôle (`403` attendu, `400` obtenu); le changement fautif a été retiré et la suite complète a ensuite réussi. |
| `npm run test:e2e` | PASS — 11/11 tests Chrome sur Wrangler/Worker/D1/R2 locaux, dont le parcours réception, distribution, remise partielle/complète, correction, clôture et notification |
| `npm run test:security-matrix` | PASS — 141 routes cataloguées, 138 essais anonymes, 123 refus RBAC; empreinte des 65 tables inchangée après refus |
| `npm run db:verifier` | PASS — 21 migrations, 65 tables (62 tables métier et 3 MFA), 83 index, 68 triggers, 23 provinces, 500 communes en revue, 0 commune activée, 25 comptes de test, aucune violation de clé étrangère |
| `git diff --check` | PASS — aucune erreur d’espacement; avertissements Git LF→CRLF seulement |

Les commandes d’intégration et E2E utilisent des états Wrangler/D1 temporaires locaux. Ces mesures ne constituent pas des mesures de performance Cloudflare distant. Aucun accès ni changement distant n’a été effectué.

## Éléments restants

- Faire approuver la règle de statut après `CONFIRME_DISTINCT` et le traitement des anciens signalements sans état antérieur reconstructible.
- Définir la preuve nouvelle qui autoriserait éventuellement une nouvelle revue de la même paire, puis mettre à jour le déclencheur et son index dans une migration additive.
- Définir la procédure non destructive de gestion des doublons confirmés reliés à des distributions/remises historiques, sans déplacer ni recalculer le stock.
- Ajouter des tests dédiés de remise historique sur les dossiers du scénario de doublon, en plus des assertions de conservation existantes.
- Rejouer les tests de migration, d’intégration, d’isolation et de KPI après approbation de la migration 0022.

**Décision finale :** l’idempotence d’import, l’isolation provinciale et la non-régression des KPI sont `PASS` en local. La levée sûre du statut suspect et la prévention complète de sa réapparition exigent une décision de modèle et une migration corrective; `OPERATIONAL_MAP` et `OVERALL` restent donc `PARTIAL`. Les limites géographiques restent `NOT_APPROVED`.
