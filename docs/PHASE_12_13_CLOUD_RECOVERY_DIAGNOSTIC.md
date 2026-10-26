# SIGAD — Phase 12.13 — Diagnostic ciblé Cloudflare et sécurité des journaux

Date : 24 octobre 2026 (Africa/Ndjamena)
Périmètre : revue locale du code et de la configuration Staging, éléments Cloudflare déjà vérifiés dans le rapport Phase 12.12, documentation Cloudflare actuelle. Aucune écriture distante n’a été effectuée.

```text
HISTORICAL_LOG_SECURITY: PARTIAL
STAGING_CONFIGURATION: PARTIAL
ROOT_CAUSE_HTTP500: UNDETERMINED
SAFE_CLOUD_DIAGNOSTIC: NOT_POSSIBLE
RECOVERY_DISABLED: PASS
TOKEN_ISSUED: NO
NEXT_ACTION: CONTROLLED_ATTEMPT_REQUIRES_APPROVAL
OVERALL: PARTIAL
```

## Décision

**B — ROOT_CAUSE_UNDETERMINED.** L’invocation historique confirme un HTTP 500, mais ne contient ni étape, ni code d’erreur interne, ni identifiant de corrélation exploitable. Le diagnostic déployé ultérieurement ne peut pas reconstruire rétroactivement ces éléments. La route est actuellement fermée avant la vérification de la preuve et avant toute requête D1 : aucune sonde non destructive ne peut donc atteindre les étapes qui ont pu produire le 500.

Aucun jeton n’a été émis. Aucun compte, D1, R2, Worker ou environnement Production n’a été modifié. Aucun déploiement et aucun Git push n’ont été effectués.

## 1. Journaux historiques et exposition

Le rapport de Phase 12.12 documente l’événement consulté dans le tableau de bord Cloudflare : le 24/10/2026 vers 10:30:30 (Africa/Ndjamena), sous la version `97c49e9e-b1a5-49eb-876f-fea59d23c9a7`, avec statut HTTP 500 et message générique « Échec du traitement de la requête ». L’événement ne porte pas de code diagnostique de Phase 12.10/12.12. La preuve opérateur signée figurait dans un champ d’en-tête de la requête historique. Sa valeur n’est reprise ni ici ni ailleurs dans ce rapport. Le rapport consulté n’a pas relevé de clé privée ni de jeton d’activation.

La preuve est conçue avec une durée maximale de cinq minutes. Elle est maintenant expirée. Les éléments disponibles ne démontrent pas que la clé privée a été exposée; une rotation n’est donc **pas justifiée par une fuite de clé établie**. Elle devient indiquée si l’opérateur constate une compromission du poste/coffre DPAPI, une exposition de la clé privée ou un accès non autorisé au journal pendant la fenêtre de validité. Aucune rotation n’a été tentée.

| Point demandé | Résultat vérifiable |
|---|---|
| Rétention effective de cet événement | L’événement était consultable au moment de la vérification Phase 12.12. Le plan effectif du compte et sa durée configurée n’ont pas été établis dans cette session. La documentation Workers Logs distingue 3 jours sur Workers Free et 7 jours sur Workers Paid; elle fixe une limite maximale de 7 jours. Les traces Workers ont une rétention documentée de 7 jours. Ces valeurs documentaires ne prouvent pas le plan du compte SIGAD. |
| Qui peut lire les journaux | La session du tableau de bord utilisée lors de Phase 12.12 pouvait consulter l’événement. Cloudflare documente l’accès Observability pour le rôle `Metadata Read-Only` au périmètre Worker ou produit; `Content Read-Only`, `Editor` et `Admin` incluent également les droits de lecture décrits. La liste réelle des membres et de leurs attributions n’a pas été vérifiée ici. |
| Suppression d’un événement / restriction | La documentation consultée ne décrit pas de suppression à l’unité d’un événement Workers Logs. La suppression d’une requête enregistrée dans Query Builder concerne la requête sauvegardée, pas les événements de télémétrie. Aucun événement n’a été supprimé. L’accès peut être réduit par les rôles et périmètres Workers, mais aucun rôle n’a été changé. Une éventuelle purge exceptionnelle doit être confirmée par Cloudflare Support; elle n’est pas présumée possible. |
| Persistance | Phase 12.12 a relevé « Persist logs » activé, avec les journaux d’invocation désactivés dans la configuration Staging. Désactiver ou limiter une collecte future ne retire pas un événement déjà retenu. |

Sources Cloudflare : [Workers Logs — rétention, invocations et plans](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [rôles et permissions Workers](https://developers.cloudflare.com/workers/authorization/workers/), [Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/), [Workers Tracing](https://developers.cloudflare.com/observability/traces/workers-tracing/).

## 2. Configuration Staging et limites de vérification

La configuration locale `wrangler.staging.toml` cible `sigad-staging`, déclare `ENVIRONMENT = "staging"`, le binding D1 `DB` vers `sigad-staging-db` et le binding R2 `BUCKET` vers `sigad-staging-documents`, avec `ASSETS`. Elle active les logs applicatifs à 100 %, désactive les journaux d’invocation et échantillonne les traces à 10 %. Elle ne contient pas le drapeau d’activation de récupération.

Le code n’autorise la récupération que si `ENVIRONMENT === "staging"` **et** `SIGAD_RECUPERATION_PROPRIETAIRE_ACTIVE === "true"`. L’absence du second réglage dans le fichier versionné est fail-closed; le précédent contrôle HTTP distant de la version `7806bf39-6e46-460a-80ec-6a5679823921` a reçu 404 pour la route désactivée. Aucun changement de Worker n’a eu lieu depuis ce contrôle selon les éléments disponibles. Le statut `RECOVERY_DISABLED: PASS` se rapporte à ce dernier contrôle et à la configuration/code examinés; il n’a pas été reprobé dans cette phase.

Une commande Wrangler de lecture seule, `deployments list`, n’a pas pu rafraîchir l’état distant : l’environnement courant a retourné une erreur de résolution DNS pour `api.cloudflare.com`/`dash.cloudflare.com` ainsi qu’un `EPERM` lors de l’écriture du fichier de journal Wrangler. Aucun résultat d’API n’a été reçu. La page de détails Worker ouverte dans Chrome est restée sur « Loading »; elle n’a fourni aucune donnée supplémentaire. Par conséquent :

- la version active et les bindings restent ceux consignés dans le dernier contrôle Phase 12.12 et indiqués dans la demande;
- la présence actuelle des réglages opérateur/public ES256 dans la configuration distante, et leur correspondance avec la clé locale, n’ont pas été revalidées;
- aucune valeur de secret n’a été demandée, lue ou affichée;
- aucune requête D1 distante n’a été effectuée.

La configuration locale ne définit pas `redact_query_string = true`. Cloudflare précise que les valeurs d’en-tête ne sont pas enregistrées dans les spans de tracing, mais que les URL et chaînes de requête le sont. Aucun secret n’est placé dans l’URL de récupération d’après le code revu; toutefois, l’absence de redaction est un risque de journalisation général à corriger dans un futur changement Staging autorisé. Cette configuration n’a pas été modifiée ici.

## 3. Instrumentation du parcours d’émission

Le code local relu comprend les protections suivantes :

- UUID généré côté Worker; l’en-tête de corrélation fourni par le client n’est pas repris.
- Étapes fermées : contrôle CSRF, configuration, lecture du corps, vérification de preuve, lecture du compte, génération et hachage du jeton, préparation D1, transaction, préparation de réponse.
- Codes d’erreur internes constants et classe d’exception filtrée; ni message, ni pile, ni corps de requête, ni cookie, ni mot de passe, ni donnée MFA, ni valeur D1 ne sont ajoutés au journal dédié.
- La réponse d’erreur au client reste générique et peut exposer uniquement l’UUID généré comme référence.
- Le gestionnaire global Hono utilise un type d’erreur filtré et un chemin; il ne journalise pas le message brut de l’exception.

Les rejets ordinaires ne sont pas tous instrumentés : CSRF invalide, corps invalide ou preuve rejetée retournent leurs statuts attendus; ils ne créent pas nécessairement un événement de diagnostic d’échec. Les erreurs D1 de `batch` sont capturées et journalisées avec un code constant, puis renvoyées en 409. Les exceptions non capturées, notamment pendant une lecture `first()`, un appel cryptographique, une préparation/bind ou la construction de réponse, sont converties en 500 par le gestionnaire global et donnent l’étape alors active.

Le 500 historique provient d’une version antérieure à cette instrumentation et ne possède aucun corrélateur permettant de l’associer à une phase. Aucune cause parmi D1, Web Crypto, préparation SQL, preuve, CSRF ou réponse ne peut être confirmée à partir du message générique.

## 4. Diagnostic Cloud non destructif

La sonde déjà effectuée dans la phase précédente a envoyé un corps synthétique sans preuve pendant que le mécanisme était désactivé. Le Worker a répondu 404 au garde d’environnement avant la lecture du corps et avant toute lecture/écriture D1. Ce résultat prouve le refus fermé, mais ne teste ni ES256, ni l’identité/nonce, ni le compte cible, ni la transaction D1.

Il n’existe pas de requête actuellement autorisée qui puisse traverser ce garde tout en gardant la récupération désactivée. Une preuve invalide exigerait déjà de réactiver le mécanisme pour atteindre les validations; elle ne diagnostiquerait pas les étapes D1. Une preuve valide pour l’émission exécuterait une véritable mutation du compte propriétaire et pourrait produire un jeton réel. Conformément aux restrictions, aucune requête supplémentaire n’a été envoyée.

## 5. Données exactes manquantes et prochaine procédure

Pour attribuer un nouvel échec au bon sous-système, il faut l’événement de diagnostic corrélé émis par le Worker actuel : `correlation_id`, `etape`, `code_erreur`, `type_exception` filtré, statut HTTP, horodatage et version Worker. Il ne faut collecter aucun corps, en-tête, cookie, preuve, code, valeur D1 ou détail d’exception brut. La trace à 10 % ne peut pas prouver l’absence d’un événement; l’observation doit s’appuyer sur les Workers Logs structurés, avec l’échantillonnage configuré, et pas sur une absence de trace.

Une tentative valide n’est pas sans effet. Le chemin d’émission met à jour l’empreinte et l’expiration d’activation du propriétaire, ferme les sessions et défis MFA pertinents, et crée des enregistrements de récupération. Le chemin de révocation ferme cette récupération et efface les champs d’activation courants; il ne restaure pas automatiquement les anciennes valeurs d’activation. Un 500 après validation de la transaction pourrait donc laisser un état à examiner. Une sauvegarde seule ne constitue pas un retour arrière distant autorisé.

La prochaine étape nécessite une **nouvelle approbation explicite**, car elle implique de changer la configuration Staging et peut modifier le compte :

1. Dans une session Windows normale autorisée, vérifier l’identité Cloudflare, le Worker, les bindings, les noms de réglages présents, l’absence de récupération active et l’état agrégé du compte; produire puis restaurer une sauvegarde chiffrée vérifiée avant toute mutation.
2. Préparer un plan de retour validé qui reconnaît que la révocation actuelle ne restaure pas l’activation antérieure; ne pas lancer si l’état antérieur ne peut être préservé ou si l’opérateur n’accepte pas explicitement cette limite.
3. Après approbation seulement, ouvrir une fenêtre Staging courte avec le drapeau Recovery temporaire, opérateur et clé publique vérifiés, invocation logs désactivés, secrets exclus de l’URL et redaction des query strings activée dans les paramètres logs/traces. Ne pas élargir les rôles Cloudflare.
4. Avec l’opérateur présent et prêt, effectuer au plus une demande signée, fraîche, à nonce unique. Le script doit conserver tout code d’activation uniquement dans le coffre DPAPI CurrentUser. En cas de statut inattendu ou de délai dépassé : aucune nouvelle tentative; relever seulement le statut et la référence, consulter le diagnostic filtré, déterminer l’état par lecture agrégée, puis appliquer une révocation uniquement sous autorisation et selon le plan approuvé.
5. En cas de succès, remettre immédiatement le code d’activation à l’opérateur par le coffre DPAPI, laisser celui-ci définir son mot de passe et enrôler MFA, puis désactiver le drapeau, redéployer la configuration sécurisée et vérifier HTTP 404. Confirmer les agrégats de récupération et ne pas communiquer de secret.

Ces étapes constituent un plan conditionnel, pas une autorisation d’activer la récupération, d’émettre un jeton, de toucher D1 ou de déployer.

## 6. Vérifications et changements de cette phase

| Vérification | Résultat |
|---|---|
| Revue de l’instrumentation et des gardes de récupération | PASS, inspection statique des sources locales et comparaison avec le rapport précédent. |
| Wrangler `deployments list` — lecture seule | BLOCKED, résolution DNS Cloudflare et `EPERM` du journal Wrangler; aucune mutation distante. |
| Contrôle Cloudflare de la configuration/secrets distants | BLOCKED, les valeurs et noms distants n’ont pas été rafraîchis dans cette session. |
| Sonde Worker | Non répétée; le dernier contrôle enregistré était 404 avant D1. |
| Typecheck/build/unit/integration/E2E | Non relancés : aucun code n’a été modifié dans cette phase et la demande exclut de répéter les contrôles précédents sans changement pertinent. |
| Fichiers modifiés | Ce rapport uniquement. |

Fin de la Phase 12.13 : cause non déterminée; récupération maintenue désactivée; aucun jeton émis.
