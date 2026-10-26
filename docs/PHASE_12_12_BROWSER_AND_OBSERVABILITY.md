# SIGAD — Phase 12.12 — Réparation Playwright et observabilité sécurisée

Date : 24 octobre 2026 (Africa/Ndjamena)
Projet : `C:\Users\Lenovo\Downloads\SIGAD`
Cible : Worker Cloudflare Staging `sigad-staging`

```text
PLAYWRIGHT: PARTIAL
HISTORICAL_LOGS: AVAILABLE
DIAGNOSTIC_DEPLOYMENT: PASS
RECOVERY_DISABLED: PASS
ROOT_CAUSE_HTTP500: UNDETERMINED
OVERALL: PARTIAL
```

## Synthèse

La suite navigateur a été relancée depuis PowerShell Windows normal, contre un Worker Wrangler local et une D1 synthétique isolée. Elle termine avec 12 tests Playwright réussis, 2 tests territoriaux ignorés conformément à leur état antérieur, et aucun échec. Les sept fichiers de tests Worker/D1 totalisent 24 tests réussis.

Le déploiement diagnostique a ensuite été publié sur le Worker Staging existant. La version `7806bf39-6e46-460a-80ec-6a5679823921` est active à 100 %. Le mécanisme de récupération reste désactivé : le nouveau Worker ne reçoit pas de variable d’activation et une requête de sonde sans preuve opérateur répond HTTP 404 avant toute lecture ou écriture D1.

Le HTTP 500 historique est visible dans l’Observability Cloudflare, mais ne contient qu’un message générique sans étape ni code diagnostique. Sa cause demeure donc indéterminée.

## A. Réparation et recette Playwright

### Cause des refus d’authentification dans les fixtures

La fixture d’intégration d’un compte exigeant le changement de mot de passe initial ne reflétait pas le contrat de connexion : elle définissait `doit_changer_mot_de_passe = 1` sans empreinte de code d’activation. L’API refusait correctement la connexion avant l’écran attendu. La fixture fournit désormais une empreinte synthétique valide, une échéance future et un état actif.

Le parcours navigateur utilise les libellés exacts des deux champs de nouveau mot de passe, attend la réponse réelle de `/api/auth/connexion` et efface le champ du mot de passe temporaire après la soumission. Aucun délai d’attente n’a été augmenté pour masquer un défaut.

### Exécution Windows normale

Commande : `npm run test:e2e`
Environnement : PowerShell Windows normal, Chrome installé, répertoire temporaire propre, `--persist-to` isolé, Worker Wrangler local et migrations locales 0001–0023.

| Vérification | Résultat |
|---|---|
| Playwright Chrome | 12 réussis, 2 ignorés, 0 échec (1 min 42 s) |
| Tests ignorés | Les deux parcours de sélection/enregistrement des communes restent ignorés à cause du rattachement départemental incomplet; leur classification n’a pas été changée. |
| Worker/D1 d’intégration | 24 réussis, 0 échec, 0 ignoré, répartis sur 7 fichiers de test. |
| Données de test | Compte et mots de passe synthétiques temporaires; aucun compte Staging n’a été utilisé. |
| État temporaire | D1 et fixtures séparées du dépôt; les fichiers de mots de passe générés sont supprimés par le runner. |

### Contrôles locaux complémentaires

| Commande ou contrôle | Résultat réel |
|---|---|
| `npm run typecheck` | PASS, code retour 0. |
| `npm run build` | PASS, Vite et génération PWA terminés. |
| `npm run test:unit` | PASS, 62 tests. |
| `npm run test:e2e` — intégration incluse | PASS, 24 tests Worker/D1; sécurité et opérations stock/distribution incluses. |
| Matrice de sécurité dans l’intégration | 145 routes recensées, 142 essais anonymes et 128 refus RBAC; aucune modification détectée dans l’empreinte contrôlée après les refus. |
| Vérification du schéma local | PASS : migrations 0001–0023, 67 tables, 91 index, 74 déclencheurs, 25 comptes synthétiques, aucune violation de clé étrangère. |
| `git diff --check` | PASS, code retour 0. |
| `npx wrangler deploy --dry-run --config wrangler.staging.toml` | PASS, code retour 0; Worker et bindings Staging attendus, 20 assets lus, aucun fichier statique à téléverser. |

Le premier essai d’intégration dans le Sandbox avait échoué avant le lancement de `workerd` (`GetFinalPathNameByHandleW: #5 Accès refusé`). La relance demandée dans l’environnement Windows normal a réussi; aucune permission Windows ni protection Defender n’a été modifiée.

## B. Journaux historiques et cause du HTTP 500

Les journaux historiques étaient accessibles dans le tableau de bord Cloudflare du compte Staging vérifié. L’invocation en erreur date du 24/10/2026 à 10:30:30 (Africa/Ndjamena), sous la version `97c49e9e-b1a5-49eb-876f-fea59d23c9a7`. Elle contient le statut HTTP 500 et le message applicatif générique « Échec du traitement de la requête », sans étape, code interne ni corrélateur. Aucun élément ne permet d’attribuer le 500 à D1, à Web Crypto, à la preuve opérateur ou à une autre sous-étape.

**ROOT_CAUSE_HTTP500: UNDETERMINED.** La sonde de cette phase n’a pas répété l’émission et n’a produit aucun jeton.

L’invocation historique contenait des en-têtes de requête incluant la preuve opérateur signée. Sa valeur n’est reproduite dans aucun livrable. Cette preuve temporaire a dépassé sa fenêtre de validité; aucune clé privée de signature ni aucun jeton d’activation n’a été relevé dans l’enregistrement consulté. Le journal historique reste soumis à la rétention et aux contrôles d’accès du compte.

La configuration déployée désactive les journaux automatiques d’invocation, qui incluent les détails Request/Response et leurs métadonnées, tout en conservant les journaux applicatifs structurés. Cloudflare indique également que ses traces capturent les noms d’en-tête mais pas leurs valeurs. Les journaux et traces restent activés; les traces sont échantillonnées à 10 %. Sources officielles : [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) et [Workers Tracing](https://developers.cloudflare.com/observability/traces/workers-tracing/).

## C. Instrumentation et sécurité observées

L’instrumentation utilise un UUID généré par le Worker, des étapes et codes internes fermés et un type d’exception limité à une liste autorisée. La valeur `X-Correlation-ID` fournie par le client n’est pas reprise. Le journal d’erreur ne reçoit ni message ou pile d’exception, ni corps, preuve, cookie, mot de passe, secret MFA, valeur D1 ou jeton d’activation. La réponse client conserve le message générique.

Le tableau de bord après déploiement affiche les journaux activés, « Include Invocation logs » décoché, la persistance des journaux activée et les traces activées avec un échantillonnage de 10 %. Aucun paramètre n’a été modifié ou enregistré depuis l’interface Cloudflare.

Après actualisation, la page a brièvement affiché « Unsaved changes ». Aucun bouton « Save » ou « Discard » n’a été utilisé; l’indicateur a disparu lors de la navigation vers Observability. La configuration rapportée est celle de la version Wrangler active.

| Vérification distante non destructive | Résultat |
|---|---|
| Version active à 100 % | `7806bf39-6e46-460a-80ec-6a5679823921`. |
| Version précédente de retour | `04ceb607-ca62-4893-b626-eddfb93280c5`. |
| Binding D1 | `DB` → `sigad-staging-db`, ID `a54e1ea9-c49a-4729-ad06-a40ceb421127`. |
| Binding R2 | `BUCKET` → `sigad-staging-documents`. |
| Binding Assets | `ASSETS` présent. |
| Environnement | `ENVIRONMENT=staging`. |
| Indicateur de récupération | Absent de la version déployée; le contrôle de l’environnement échoue fermé. |
| `GET /api/sante` | HTTP 200, `application/json`. |
| `GET /` | HTTP 200. |
| Bundle JavaScript | HTTP 200, `text/javascript`. |
| Feuille CSS | HTTP 200, `text/css`. |
| `/sw.js` | HTTP 200, `text/javascript`. |
| Sonde `POST /api/auth/recuperation-proprietaire` | HTTP 404 sans preuve opérateur; l’identifiant de corrélation est un UUID généré côté serveur et ne reprend pas la valeur de sonde fournie par le client. Aucun marqueur sensible dans la réponse. Le chemin vérifié retourne 404 avant tout accès D1. |

Une tentative initiale de commande Wrangler a échoué parce qu’un profil XDG temporaire masquait le profil OAuth Windows. Elle n’a effectué aucune opération distante. La commande a réussi ensuite avec le profil Windows normal; compte et ressources Staging concordaient.

## D. Périmètre publié et retour arrière

Le contrôle des dates de modification depuis la version Staging précédente a trouvé uniquement les quatre fichiers runtime du diagnostic : `backend/src/bindings.ts`, `backend/src/index.ts`, `backend/src/routes/auth.routes.ts` et `backend/src/services/diagnostic-recuperation.service.ts`. Les sources frontend n’avaient pas changé depuis cette version et Wrangler n’a téléversé aucun asset mis à jour. La configuration cible explicitement `sigad-staging` et les bindings Staging vérifiés.

Aucune migration D1, opération R2, modification de compte ou opération Production n’a été réalisée. Aucun jeton n’a été émis. Aucun Git push n’a été exécuté.

En cas de régression, la commande de retour préparée, non exécutée, est :

```powershell
npx wrangler rollback 04ceb607-ca62-4893-b626-eddfb93280c5 --name sigad-staging --config wrangler.staging.toml
```

## E. Conclusion

Le diagnostic sécurisé est déployé et vérifié sur Staging, avec récupération désactivée. La réparation du parcours principal Playwright est validée; deux tests territoriaux restent en attente du référentiel départemental complet. Le HTTP 500 historique est confirmé, mais sa cause n’est pas établie. Pour cette raison, le résultat global demeure **PARTIAL**.

```text
PLAYWRIGHT: PARTIAL
HISTORICAL_LOGS: AVAILABLE
DIAGNOSTIC_DEPLOYMENT: PASS
RECOVERY_DISABLED: PASS
ROOT_CAUSE_HTTP500: UNDETERMINED
OVERALL: PARTIAL
```
