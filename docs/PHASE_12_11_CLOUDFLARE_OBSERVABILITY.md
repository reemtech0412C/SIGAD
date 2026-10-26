# SIGAD — Phase 12.11 : observabilité Cloudflare

Date de vérification : 24 octobre 2026 (Africa/Ndjamena)

```text
HISTORICAL_LOGS: ACCESS_DENIED
ROOT_CAUSE: UNDETERMINED
DIAGNOSTIC_BUILD: PASS
RECOVERY_DISABLED: PASS
TOKEN_ISSUED: NO
NEXT_ACTION: BLOCKED
```

## Conclusion

La cause du HTTP 500 historique de l’activation du compte propriétaire n’est pas établie. Les journaux de cette requête n’ont pas pu être consultés. Aucun nouvel essai d’émission n’a été effectué. Aucun jeton n’a été émis, aucun compte ni aucune base distante n’a été modifié, et aucun Worker n’a été déployé.

Le refus HTTP 403 observé pendant cette vérification concerne **la requête de consultation de l’API Observability**, pas l’ancienne route de récupération. Il ne constitue donc pas une preuve sur la cause du HTTP 500 historique.

## Accès aux journaux historiques

| Contrôle | Résultat |
|---|---|
| `npx wrangler whoami` | PASS ; l’identifiant de compte retourné correspond au compte Staging attendu. |
| Session du tableau de bord | Non disponible dans le navigateur courant : la page Cloudflare affiche l’écran de connexion. Aucun profil ou compte enregistré n’a été sélectionné. |
| Vérification du bearer Wrangler via l’API de vérification de jeton | HTTP 401 ; le jeton CLI n’a pas été validé par cet endpoint. |
| Requête de test à blanc Observability, fenêtre récente et filtre sur la route concernée | HTTP 403, code Cloudflare `10000` ; aucune donnée de télémétrie n’a été retournée. |
| Conclusion sur la permission | Indéterminée. Le compte associé à `whoami` est le bon, mais le résultat ne distingue pas un jeton OAuth Wrangler non accepté par cet endpoint d’une permission API insuffisante. Il ne prouve pas une absence de journaux ni une absence du service Observability. |

La documentation Cloudflare indique que l’API de requête Observability utilise la permission `Workers Observability Write`, y compris pour une requête de lecture. La permission requise et le type de justificatif doivent être vérifiés dans le compte autorisé avant toute nouvelle tentative. Aucun droit n’a été modifié. Les journaux Workers ont une rétention documentée de sept jours ; si la requête ancienne est hors de cette fenêtre ou si les journaux n’étaient pas activés à ce moment-là, ils peuvent ne plus être disponibles.

Références officielles : [API Workers Observability](https://developers.cloudflare.com/api/resources/workers/subresources/observability/), [endpoint Query](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/), [Query Builder et journaux Workers](https://developers.cloudflare.com/workers/observability/query-builder/).

**Aucun champ de journal ancien (étape, code interne, identifiant de corrélation, horodatage) n’a pu être extrait.** Par conséquent, aucun diagnostic spéculatif du `500` n’est présenté comme une cause confirmée.

## Revue de l’instrumentation

Le diagnostic de récupération déjà présent dans le code a été relu et testé :

- `X-Correlation-ID` est généré côté Worker avec un UUID ; une valeur fournie par le client est ignorée.
- Les étapes et codes internes proviennent d’ensembles fermés, et ne sont pas construits à partir de paramètres de requête ou d’en-têtes.
- Les journaux d’exception ne contiennent que l’événement, le corrélateur généré, l’étape, le code fixe et une classe d’erreur autorisée. Le message, la pile et les propriétés arbitraires de l’exception ne sont pas consignés.
- Les réponses d’erreur destinées au client restent génériques et peuvent renvoyer le corrélateur, sans détails d’authentification.
- Les essais couvrent les exceptions D1, les valeurs lancées qui ne sont pas des objets `Error`, une fausse valeur de corrélateur fournie par le client et des chaînes canaries. Ces chaînes n’apparaissent ni dans les journaux simulés ni dans les réponses contrôlées.
- Limite résiduelle : si la génération cryptographique du UUID échoue avant l’initialisation du contexte de diagnostic, le gestionnaire global reste générique et n’a pas de corrélateur. Ce cas ne journalise pas de secret.

Aucun changement de logique métier ou de récupération n’a été apporté. Cette phase a ajouté des vérifications unitaires au fichier de test existant `tests/unit/diagnostic-recuperation.test.mjs`.

## Configuration et état de récupération

- Le contrôle statique de `wrangler.staging.toml` confirme l’absence du drapeau d’activation de récupération ; le code exige ce drapeau explicitement et le laisse désactivé par défaut.
- Le contrôle live antérieur sur Staging avait obtenu `404` sur la route de récupération désactivée. Aucun déploiement n’a eu lieu depuis ce contrôle.
- Le dry-run Wrangler ciblé sur `wrangler.staging.toml` a abouti avec le Worker `sigad-staging` et les bindings attendus présents dans le paquet. Le drapeau de récupération est absent. Un dry-run valide le paquet et la configuration locale ; il ne valide pas un déploiement ni le comportement distant.
- Le dry-run n’a effectué aucun déploiement. Aucun appel d’émission n’a été fait.

## Tests exécutés

| Contrôle | Résultat réel |
|---|---|
| `npm run typecheck` | PASS, code retour 0 ; nouvelle exécution avec un répertoire `XDG_CONFIG_HOME` isolé, sans erreur d’écriture Wrangler. |
| `npm run build` | PASS ; Vite et génération PWA réussis. |
| `npm run test:unit` | PASS ; 16 fichiers, 62 tests. |
| `npm run test:integration` | PASS ; 7 fichiers Worker/D1 locaux, 24 tests. Le premier lancement depuis le sandbox a échoué avant le démarrage de workerd avec `GetFinalPathNameByHandleW: #5 Accès refusé`; la relance autorisée en environnement Windows a réussi. |
| Matrice sécurité exécutée dans l’intégration locale | PASS pour les contrôles rapportés : 145 routes recensées, 142 essais anonymes et 128 refus RBAC ; empreintes de données inchangées après les refus testés. |
| Vérification de schéma locale | PASS : migrations jusqu’à 0023, 67 tables, 91 index, 74 déclencheurs, 25 comptes synthétiques, aucune violation de clé étrangère. Les 500 communes restent en révision et aucune n’est active. |
| `npx wrangler deploy --dry-run --config wrangler.staging.toml` | PASS, code retour 0 ; cible `sigad-staging`, signaux de paquet présents, aucune erreur CLI, aucune erreur d’écriture de journal après isolation de `XDG_CONFIG_HOME`. Aucun déploiement. |
| `git diff --check` | PASS, code retour 0. Git a émis des avertissements CRLF/LF préexistants ; aucun défaut de whitespace bloquant. |
| Playwright Chrome via `node tests/e2e/run-local.mjs` | FAIL : 12 tests échoués, 2 ignorés. Chrome a été lancé ; plusieurs parcours ont échoué parce que l’assistant d’authentification ne trouvait pas l’écran attendu de changement initial de mot de passe/MFA/navigation. Aucun parcours n’est déclaré réussi. Le rapport Playwright local conserve les détails de ces assertions. |

Les tests d’intégration et la base D1 employés ici étaient locaux et synthétiques. Aucun résultat de performance locale n’est présenté comme une mesure Cloudflare.

## Préparation sûre de la prochaine validation

1. Un opérateur autorisé ouvre le tableau de bord du compte Staging exact, puis consulte Workers & Pages → `sigad-staging` → Logs/Observability. Il recherche la fenêtre historique encore retenue, avec l’horodatage et l’identifiant de corrélation déjà connus, sans exporter de données personnelles.
2. Si le tableau de bord n’expose pas les journaux, l’administrateur du compte vérifie le rôle effectif et la permission minimale documentée pour Observability. Il peut fournir un jeton de portée minimale dans son environnement sécurisé ; aucun jeton ne doit être transmis dans cette conversation.
3. Si les journaux historiques sont absents ou expirés, la prochaine observation nécessite un déploiement diagnostique temporaire de `sigad-staging`, **après autorisation distincte**. La configuration doit garder la récupération désactivée et conserver les bindings Staging vérifiés.
4. Le test observé doit utiliser une requête sans preuve opérateur et sans jeton d’activation ; il doit aboutir à un refus attendu. L’opérateur relève uniquement le corrélateur, l’étape fixe et le code fixe, puis remet la version sécurisée après validation.

Cette préparation ne constitue pas une autorisation de déployer. Avec l’échec Playwright non résolu et les journaux historiques toujours inaccessibles, la suite est bloquée avant le déploiement diagnostique. Aucun accès ou changement Production n’est prévu.
