# SIGAD — Phase 12.1 : déblocage de la publication et préparation du staging

Date du contrôle : 24 octobre 2026 (Africa/Ndjamena)  
Commit local de référence : `371f0bedae975fca49dd4e40782080b1527e29ae`  
Branche : `ui/phase-11-harmonisation`

## Décision

**PHASE_12_1 : BLOCKED**  
**CLOUD_CHANGES : NONE**

La correction de l’export CSV a passé le test Worker/D1 ciblé, mais son enregistrement effectif par Chrome n’a pas été validé de bout en bout. La session Cloudflare n’a pas pu être vérifiée à cause d’une résolution DNS impossible vers l’API Cloudflare. L’identité de l’intégration GitHub connectée ne dispose pas du droit `push`; l’identité GCM cible est présente localement, mais un essai non destructif n’a pas confirmé l’écriture. Aucun commit, push, création de ressource, secret, migration distante ou déploiement n’a été effectué.

## Authentification et ressources

| Contrôle | Résultat | Preuve |
|---|---|---|
| GitHub — compte GCM cible | **PARTIAL** | `git credential-manager github list` a listé `reemtech0412C`; aucun secret n’a été affiché. |
| GitHub — identité de l’intégration | **VERIFIED, distincte** | `github_get_user_login` retourne `sihhaapp`, et non le propriétaire du dépôt. |
| GitHub — dépôt cible | **VERIFIED** | `reemtech0412C/SIGAD`, public, vide (`size: 0`), branche par défaut `main`. |
| GitHub — droit d’écriture | **BLOCKED** | Les métadonnées de l’intégration indiquent `push: false`; l’API des permissions répond `403 Resource not accessible by integration`. Le `git push --dry-run` a été interrompu après attente sans résultat exploitable; aucune écriture n’a été faite. |
| Wrangler — version | **PASS** | Wrangler `4.151.3`. |
| Wrangler — session et compte | **BLOCKED / NOT_VERIFIED** | `npx wrangler whoami` échoue avant identification : `Unable to resolve Cloudflare's API hostname (api.cloudflare.com or dash.cloudflare.com)`. |
| Wrangler — journal local | **ENVIRONMENT ISSUE** | Le même appel signale `EPERM` en ouvrant un fichier sous `C:\Users\Lenovo\AppData\Roaming\xdg.config\.wrangler\logs`. Cela n’a pas permis de valider l’identité. |
| Inventaire Cloudflare SIGAD | **BLOCKED** | Le dernier inventaire en lecture seule, réalisé dans un compte qui n’est pas confirmé comme le compte SIGAD attendu, ne trouvait pas les ressources configurées. Le contrôle actuel est impossible tant que le DNS/API reste inaccessible. |
| Ressources Staging SIGAD | **MISSING / NON CRÉÉES** | Aucun Worker, D1 ou bucket R2 Staging n’a été créé. Les identifiants de production de `wrangler.toml` n’ont pas été utilisés. |

Le dépôt local ne possède aucun remote Git (`git remote -v` ne retourne rien). La branche n’a pas été remplacée et le commit de référence est inchangé. La copie de travail contient déjà un ensemble important de modifications et de fichiers non suivis provenant des phases antérieures; ils n’ont pas été ajoutés en bloc à l’index ni publiés.

## Correction de l’export CSV

Le parcours précédent utilisait une réponse `fetch` transformée en Blob puis un lien `blob:`. Le test Worker confirmait la réponse CSV, mais Chrome annulait `download.saveAs()`. Le parcours d’export a été adapté pour soumettre les filtres au même endpoint via un formulaire same-origin et une iframe masquée, afin de laisser la réponse `Content-Disposition` être traitée par le gestionnaire de téléchargement du navigateur. Le middleware CSRF ne reconnaît le jeton de formulaire que pour la route d’export prévue et le compare à la session/cookie. Les autres routes mutantes conservent leur contrôle existant.

Résultat : l’intégration CSV ciblée a réussi, y compris l’encodage, le séparateur et le périmètre provincial; le refus CSRF n’a entraîné aucune mutation additionnelle. En revanche, la sauvegarde du fichier par Chrome n’est pas encore prouvée : le premier parcours E2E n’a pas pu lancer le Chromium fourni par Playwright; lors du nouvel essai avec Chrome installé, le Worker local n’a pas démarré avant le délai du harnais. Le scénario E2E de téléchargement reste donc **BLOCKED**, et non PASS.

## Vérifications locales

| Vérification | Commande | Résultat constaté |
|---|---|---|
| Dépendances directes | `npm ls --depth=0` | **PASS** — toutes les dépendances directes sont résolues. |
| TypeScript | `npm run typecheck` | **PASS** — code de sortie 0; avertissement Wrangler non fatal d’écriture du journal hors workspace. |
| Build frontend | `npm run build` | **PASS** — Vite et génération PWA terminés. |
| Tests unitaires | `npm run test:unit` | **PASS** — 12 fichiers, 48 tests. |
| Tests Worker/D1/R2 | `npm run test:e2e` — phase intégration du harnais | **PASS sur l’exécution ayant atteint les suites** — les suites d’intégration, dont le rapport ciblé 8/8, ont terminé sans échec. Lors de la relance, le Worker local a expiré avant le démarrage de Playwright. |
| Export CSV / CSRF | `tests/integration/rapports-worker.test.mjs` via le harnais local | **PASS** — réponse CSV, données limitées à Sila et rejet CSRF sans écriture supplémentaire. |
| Playwright / Chrome | `npm run test:e2e` | **BLOCKED** — première tentative : exécutable `chromium_headless_shell` absent; seconde tentative avec `C:\Program Files\Google\Chrome\Application\chrome.exe` : délai d’attente du Worker (`Le Worker local n’a pas démarré à temps: The operation was aborted due to timeout`). Playwright n’a pas démarré sur cette seconde tentative. |
| Matrice de sécurité | `npm run test:security-matrix` | **PASS** — 143 routes répertoriées. |
| Schéma local | `npm run db:verifier` | **PASS** — 22 migrations locales, 65 tables (62 métier + 3 MFA), 86 index, 74 déclencheurs, 23 provinces, 500 communes en revue et aucune violation de clé étrangère. |
| Audit de dépendances | `npm audit --omit=dev` et `npm audit` | **BLOCKED** — les deux commandes ne peuvent joindre `registry.npmjs.org` : `getaddrinfo ENOTFOUND registry.npmjs.org`. TLS n’a pas été désactivé et aucun registre alternatif n’a été utilisé. |
| Vérification whitespace | `git diff --check` | **PASS** — aucune erreur de whitespace; Git signale seulement des conversions CRLF/LF possibles. |

Un scan heuristique antérieur des blobs Git accessibles et des fichiers présents n’a pas trouvé les signatures de secrets recherchées. Ce contrôle n’est pas un audit exhaustif de type Gitleaks/TruffleHog et ne constitue pas une garantie absolue. Aucun secret de compte, jeton ou secret MFA n’est inclus dans ce document.

## Configuration et décision de staging

La configuration Wrangler par défaut reste orientée production (`ENVIRONMENT=production`) et référence `sigad-tchad`, `sigad-base` et `sigad-documents`. Elle n’a pas été modifiée ni utilisée pour un déploiement. Aucun identifiant fictif de Staging n’a été écrit dans le dépôt.

| Porte de déploiement | État |
|---|---|
| Compte Cloudflare SIGAD vérifié par `whoami` | **BLOCKED** |
| Inventaire distant SIGAD complet et rapproché avec Wrangler | **BLOCKED** |
| Configuration Staging dédiée avec identifiants réels vérifiés | **NOT PREPARED** |
| Revue des 22 migrations pour la cible Staging | **NOT APPROVED / NOT APPLIED** |
| Sauvegarde/restauration D1 et R2 testée sur ressources Staging | **NOT TESTED** |
| Déploiement Staging | **BLOCKED** |
| Production | **AUCUNE ACTION** |

Il faut d’abord rétablir la résolution réseau vers Cloudflare, puis vérifier que Wrangler identifie bien le compte SIGAD attendu et inventorier ses ressources en lecture seule. Il faut aussi obtenir une identité GitHub disposant explicitement du droit d’écriture et relire/classer les changements locaux avant tout commit public. La suite Playwright doit démarrer et valider le fichier réellement enregistré avant de lever la réserve CSV. Aucun contournement par désactivation de TLS, token saisi dans la conversation, `--remote`, ou modification des ressources de production n’a été tenté.

## État des changements distants

| Action | Résultat |
|---|---|
| Commit local de Phase 12.1 | Aucun |
| Push GitHub | Aucun |
| Pull request | Aucune |
| Création ou modification de ressources Cloudflare | Aucune |
| Migration sur D1 distante | Aucune |
| Secret Cloudflare modifié | Aucun |
| Déploiement Worker | Aucun |
| Modification de Production | Aucune |

**Conclusion :** la correction applicative CSV est couverte par l’intégration locale, mais l’acceptation navigateur est suspendue. Les identités et permissions distantes ne sont pas suffisamment vérifiées pour une publication ou un déploiement. Phase 12.1 reste **BLOCKED**.
