# SIGAD — Phase 12.10 — Diagnostic de récupération du compte propriétaire

Date du contrôle : 24/10/2026  
Périmètre : code local, Worker Wrangler/D1 locaux et vérifications Cloudflare Staging en lecture seule.

## Décision

```text
ROOT_CAUSE: NOT_CONFIRMED
ERROR_INSTRUMENTATION: PASS
LOCAL_SUCCESS_PATH: PASS
D1_COMPATIBILITY: PARTIAL
CLOUD_RECOVERY: DISABLED
TOKEN_ISSUED: NO
OVERALL: PARTIAL
```

Le HTTP 500 historique n’a pas pu être attribué à une cause précise. Le Worker local réussit le parcours synthétique d’émission, mais les journaux historiques Cloudflare n’étaient pas lisibles avec le jeton Wrangler disponible. Aucune hypothèse n’est présentée comme un fait et aucune nouvelle demande d’émission n’a été envoyée à Staging.

## Changements locaux

- `backend/src/services/diagnostic-recuperation.service.ts` ajoute un identifiant de corrélation UUID par requête d’émission, un jeu fermé d’étapes et de codes d’erreur, ainsi qu’un journal JSON limité à ces champs et à un type d’exception autorisé.
- `backend/src/bindings.ts` ajoute le type de contexte de diagnostic, sans modifier les bindings Cloudflare.
- `backend/src/routes/auth.routes.ts` marque les étapes de validation, de lecture D1, de génération et hachage du jeton, de préparation et d’exécution de la transaction et de préparation de la réponse. L’échec de `DB.batch` et les nombres de lignes inattendus reçoivent des codes internes sûrs.
- `backend/src/index.ts` intercepte les exceptions inattendues de cette route et conserve une réponse générique HTTP 500. `X-Correlation-ID` est renvoyé en en-tête et comme référence non sensible; aucune cause interne n’est donnée au client.
- `tests/unit/diagnostic-recuperation.test.mjs` vérifie que le message d’exception témoin n’apparaît ni dans le journal ni dans la réponse.
- `tests/integration/recovery-proprietaire-worker.test.mjs` vérifie les identifiants de corrélation et provoque désormais un échec tardif après les premières écritures de la transaction, puis vérifie le rollback complet.

Aucune migration n’a été créée ou appliquée. Aucun secret, preuve opérateur, cookie, mot de passe, code MFA, code d’activation, SQL paramétré ou donnée bénéficiaire n’est journalisé.

## Cartographie des échecs possibles avant instrumentation

| Étape | Comportement existant constaté | Peut produire le 500 historique ? |
|---|---|---|
| CSRF pré-authentification | Un refus normal renvoie 403. Une exception inattendue du comparateur cryptographique remonte à Hono. | Oui, uniquement en cas d’exception inattendue. |
| Environnement/récupération désactivée | Le refus normal renvoie 404. | Non par le chemin normal. |
| Configuration opérateur absente | Le refus normal renvoie 503. | Non par le chemin normal. |
| Lecture JSON | Le JSON invalide est capturé et renvoie 400. | Pas pour une erreur de parsing normale. |
| Vérification ES256, identité, nonce et expiration | Les erreurs du vérificateur sont capturées et renvoient 401. | Pas pour un rejet de preuve normal. |
| Lecture de `usr-proprietaire` dans D1 | `prepare().first()` n’a pas de capture locale. | Oui, une exception D1/Wrangler remonterait à Hono. |
| UUID, jeton et hachage PBKDF2 | Les appels cryptographiques ne sont pas capturés localement. | Oui, une exception Web Crypto/runtime peut remonter à Hono. |
| Préparation des requêtes D1 | La construction et les `bind()` du tableau se produisent avant le `try` de `DB.batch`. | Oui, une exception de préparation/bind remonterait à Hono. |
| `DB.batch` | Le rejet est capturé et renvoie 409; la divergence du nombre de lignes renvoie également 409. | Pas par les branches actuellement capturées, sauf exception dans la préparation du `Response`. |
| Construction de la réponse JSON | Elle suit la transaction et n’a pas de capture spécifique. | Théoriquement oui, sans preuve que cela se soit produit. |

Le gestionnaire global de Hono renvoie un 500 générique. Avant cette instrumentation, il ne conservait que le type d’erreur sécurisé et le chemin; ces informations ne suffisent pas à déterminer la sous-étape ni l’origine exacte.

## Instrumentation ajoutée

Chaque POST d’émission reçoit `X-Correlation-ID`. En cas d’exception non traitée, le Worker écrit uniquement :

```json
{
  "evenement": "echec_recuperation_proprietaire",
  "correlation_id": "<UUID>",
  "etape": "<étape contrôlée>",
  "code_erreur": "<code contrôlé>",
  "type_exception": "<type autorisé>"
}
```

Les messages, traces brutes, corps de requête, paramètres et valeurs D1 ne sont jamais copiés dans cet événement. Les exceptions du `DB.batch` déjà capturées sont aussi instrumentées, sans changer le statut public 409.

## Résultats locaux

| Contrôle | Résultat réel |
|---|---|
| `npm run typecheck` | PASS, code de sortie 0; Wrangler a affiché un avertissement local `EPERM` sur son fichier de journal, puis a généré les types et TypeScript s’est exécuté. |
| `npm run build` | PASS — Vite et génération PWA terminés. |
| `npm run test:unit` | PASS — 16 fichiers, 60 tests. |
| `npm run test:integration` dans le Sandbox | BLOCKED — `GetFinalPathNameByHandleW: #5 Accès refusé`, avant le démarrage de `workerd`. |
| `npm run test:integration` hors Sandbox autorisé | PASS — 7 fichiers d’intégration, 24 cas; Worker Wrangler local et D1 temporaire. |
| Récupération synthétique | PASS — preuve ES256, émission 201 en D1 locale, rejeu concurrent `[201, 409]`, preuve invalide, CSRF, session d’activation limitée, révocation, expiration et parcours mot de passe/MFA. Aucun jeton Staging n’a été utilisé. |
| Rollback tardif | PASS — une erreur injectée lors de la mise à jour du compte après insertion des premières lignes renvoie 409; les preuves, dossiers, empreintes d’activation et sessions restent identiques à l’état précédant la tentative. |
| `npm run test:security-matrix` | PASS — 145 routes; 142 requêtes anonymes et 128 refus RBAC, empreinte des 65 tables inchangée après refus. |
| `npm run db:verifier` | PASS — migrations locales 0001–0023, 67 tables, 91 index, 74 déclencheurs, `foreign_key_check` sans violation. |
| `git diff --check` | PASS — aucune erreur de whitespace; Git a seulement signalé les conversions LF/CRLF configurées sur des fichiers préexistants. |

Les migrations et données de test ont été créées dans l’espace local temporaire du test d’intégration. Aucune D1 distante n’a été modifiée.

## Vérifications Cloudflare Staging — lecture seule

| Contrôle | Résultat |
|---|---|
| Identité Wrangler | PASS — compte `a2c898e7e1fda02365b7d8a49809f7e9`. |
| Version active | PASS — `sigad-staging`, version active à 100 % : `04ceb607-ca62-4893-b626-eddfb93280c5`. |
| D1 | PASS — `sigad-staging-db`, ID `a54e1ea9-c49a-4729-ad06-a40ceb421127`. |
| Agrégats après les échecs | PASS — 25 comptes; propriétaire actif; changement initial du mot de passe requis; MFA non enrôlé; 0 récupération ouverte, 0 preuve opérateur et 0 liaison de récupération. Le contrôle D1 rapporte `rows_written=0` et `changed_db=false`. |
| Route sans preuve | PASS — GET CSRF 200, POST sans preuve opérateur 404. Aucun jeton n’a été présenté et la route n’a effectué aucune écriture. |
| Vérification historique des journaux | BLOCKED — `wrangler tail` est un flux temps réel et les essais antérieurs n’ont livré aucune exception exploitable. L’API officielle de requête des journaux a répondu HTTP 403 avec l’autorisation Wrangler actuelle; le corps d’erreur a été omis. |

Cloudflare documente une rétention de sept jours pour les journaux et une API d’interrogation Workers Observability. Le journal peut donc être consultable dans le tableau de bord si la rétention du Worker le couvre, mais l’identité API actuelle ne permet pas de l’interroger depuis cette session. Sources : [Workers Query Builder — rétention et requêtes](https://developers.cloudflare.com/workers/observability/query-builder/) et [API Workers Observability](https://developers.cloudflare.com/api/resources/workers/subresources/observability/).

## Compatibilité D1

La migration 0023 est appliquée au jeu local vierge et les tests d’intégration exécutent réellement le Worker sur l’émulateur D1 de Wrangler. Le rollback tardif est vérifié. La lecture Staging confirme l’état du schéma requis et l’absence de changement distant. Le chemin d’émission réussi n’a volontairement pas été exécuté sur D1 Staging; la compatibilité locale est donc PASS, tandis que la validation spécifique au service distant reste PARTIAL.

## Étapes pour établir la cause distante

1. Consulter dans Cloudflare Dashboard → Workers & Pages → `sigad-staging` → Observability, à la date du 24/10/2026 et autour des deux fenêtres d’activation temporaires. Examiner uniquement l’invocation HTTP 500 et son exception; ne pas exporter de corps de requête, d’en-tête, de cookie ni de valeur D1.
2. À défaut, obtenir l’accès Observability autorisé pour interroger ces journaux historiques. L’API officielle a refusé la requête en lecture seule avec HTTP 403; ne pas réutiliser un jeton plus privilégié sans autorisation.
3. Après accord distinct pour une modification Staging, déployer l’instrumentation avec le mécanisme toujours désactivé et vérifier que la route reste 404. L’instrumentation seule ne reproduit pas le chemin d’émission.
4. Une demande signée valide exécuterait l’émission et modifierait le compte. Elle exige donc une autorisation séparée et une disponibilité confirmée du propriétaire; elle n’est pas incluse dans cette phase. Si elle est ensuite autorisée, relever uniquement l’identifiant de corrélation et le code/étape contrôlés, puis désactiver la récupération et vérifier de nouveau le 404.

## Sécurité et changements distants

- Récupération Staging : désactivée; route vérifiée HTTP 404.
- Jeton réel : aucun émis.
- Compte propriétaire : aucune modification lors de cette phase.
- Migrations distantes : aucune.
- Déploiement Worker : aucun.
- Production et GitHub : aucun changement.
