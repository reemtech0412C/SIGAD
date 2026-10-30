# 00 — Journal des décisions d'architecture et du progrès

> **Fichier vivant.** À mettre à jour à la fin de chaque lot. Permet de reprendre le travail dans une session vierge : lire d'abord `README.md`, puis ce journal, puis le lot suivant dans `04-feuille-de-route.md`.

## 1. Tableau d'avancement

| Phase / Lot | Statut | Date | Preuve | Commit |
|---|---|---|---|---|
| Phase 0 — Audit de référence | **Terminé (documents)** | 2026-10-26 | `01-audit-baseline.md`, `evidence/` | non versionné (voir F-01) |
| Phase 0 — Audit du code mort | **Terminé (documents)** | 2026-10-26 | `02-audit-code-mort.md`, `evidence/analyse-code-mort.json` | — |
| Phase 1 — Architecture cible + feuille de route | **Terminé; orientations D-01/02/03/04/13 approuvées, D-12 ouverte** | 2026-10-26 | `03`, `04`, `05`, `07` | `b7bf0b2`, `6cc8ffd` |
| B0.1 Versionner l'existant | **Terminé localement** | 2026-10-26 | `07-readiness-for-phase-2.md`, preuves baseline | branche `baseline/2026-10-26-etat-actuel` |
| B0.2 `npm run verify` | **Terminé** | 2026-10-26 | `evidence/verify-20261026T153504120Z.txt` | baseline + B1 local |
| B1.1 Characterization of Permissions | **Terminé — 7×216** | 2026-10-26 | snapshots/diff classés dans `07` | `1081fad`, `b7bf0b2` |
| B1.2 Household Rejection Defect | **Terminé — D-01 approuvée** | 2026-10-26 | preuves avant/après et verify complète | `6cc8ffd` |
| B1.3 Approval Workflow Verification | **تتبع مكتمل؛ D-12 تمنع تغيير القاعدة** | 2026-10-26 | مصفوفة التتبع والاختصاص في `07` | `b7bf0b2` |
| B2.3-B — préparation d'import géographique | **PARTIAL** — planificateur dry-run, intégrité, idempotence et version source; aucun import/déploiement/API v1 | 2026-10-29 | `evidence/b2-3-b-technical-preparation-20261029.md` | `8d235fd` |
| B2.6 — réconciliation/comparateur Shadow | **Socle TECHNICALLY COMPLETE / POLICY PENDING**; Legacy reste seul décideur; readiness Enforcement non acquise | 2026-10-29 | `evidence/roadmap-readiness-20261029.md`, addendum B2.6 final | `8d235fd` + preuves antérieures |
| B2.7 — rattachements géographiques datés | **BLOCKED** — référence et autorité D-03/D-13, plus accord D-02/D-04 manquants | — | `evidence/roadmap-readiness-20261029.md` | — |
| B2.8 — rôles personnalisés | **BLOCKED** — dépendances B2.6/B2.7 et catalogue sensible/délégable non défini | — | `evidence/roadmap-readiness-20261029.md` | — |
| Phase 3 | **PHASE 3 BLOCKED** — B2.7/B2.8 et readiness Enforcement inachevés | — | `evidence/roadmap-readiness-20261029.md` | — |

## 2. Registre des décisions (format ADR)

### ADR-001 — Approche *strangler* et migrations additives uniquement
* **Contexte** : D1 sans `foreign_keys=OFF` effectif, migrations déjà immuables, deux refontes de tables (0028, 0035) ayant introduit une régression (F-02) et une suppression de données de référence (F-09).
* **Décision** : toute fondation nouvelle est ajoutée à côté de l'existant ; aucune reconstruction de table centrale sans essai sur copie et accord ; retrait seulement en Phase 5 après période d'équivalence.
* **Conséquences** : coexistence temporaire de deux modèles (géo, rôles, audit) avec double écriture/mode ombre ; complexité transitoire acceptée pour garantir la réversibilité.

### ADR-002 — Aucune dépendance runtime supplémentaire
* **Contexte** : aucune dépendance npm inutilisée (`02` classe E) ; la contrainte « réduire les dépendances » n'a donc pas de gain par retrait.
* **Décision** : OpenAPI généré depuis Zod 4 (`z.toJSONSchema`), i18n légère maison, jetons mobiles opaques en D1 (pas de JWT), identifiants via `crypto.randomUUID`.

### ADR-003 — Ordre des phases ajusté
* **Décision** : insertion de **B0.1/B0.2** et des **lots 1.x** (stabilisation) avant la Phase 2 ; audit unifié et appareils placés en Phase 2 ; Phase 5 entrelacée (on retire ce qu'un lot remplace). **Raison** : F-01 (travail non versionné), F-02/F-03 (défauts confirmés) et besoin d'un oracle de non-régression. Détails : `04-feuille-de-route.md` §1.

### ADR-004 — Identifiants géographiques stables
* **Décision** : `gid` = identifiant existant pour les unités existantes (aucune réécriture de clés étrangères) ; UUID aléatoire pour les nouvelles ; jamais dérivé d'un nom. Codes externes (OCHA/INSEED/Loi 015) en table dédiée.

### ADR-005 — Rattachements datés, jamais mis à jour en place
* **Décision** : changer le parent d'une unité = fermer la ligne courante (`valide_au`) et en ouvrir une nouvelle ; la fermeture transitive courante est dérivée et reconstruisible.

### ADR-006 — La synchronisation mobile n'écrit que dans la collecte
* **Décision** : canal mobile sans permission sur `menages`, listes ou distributions ; `menages` n'est alimenté qu'à l'approbation (acteur ≠ collecteur) ; défense en profondeur par trigger. Garantit « la synchronisation ne contourne pas la chaîne d'approbation ».

### ADR-007 — Authentification mobile
* **Décision** : jetons opaques hachés avec rotation et détection de réutilisation, liés à un appareil autorisé ; cookies + CSRF conservés pour le web.

### Décisions et orientations

D-01/02/03/04/13 ont été approuvées le 2026-10-26; D-02/03/04/13 fixent le sens d'architecture mais leurs matrices/autorités restent à détailler avant enforcement ou géographie. D-07 est approuvée partiellement le 2026-10-27 pour le cycle de vie des appareils : enregistrement avec preuve cryptographique en attente, approbation centrale sans auto-approbation, suspension/révocation auditées et quarantaine des opérations tardives; l'approbation provinciale reste désactivée jusqu'à la matrice D-04. MFA/PIN et tolérance d'horloge demeurent ouverts pour B4.5/B4.6. D-12 reste ouverte; D-05/06/08/09/10/11/14 gardent le statut indiqué dans `05-decisions-a-valider.md`.

## 3. Journal des commandes et résultats (preuves — session du 2026-10-26)

| Commande | Résultat |
|---|---|
| `git status --short` | 67 modifiés, 1 supprimé, 302 non suivis (HEAD `371f0be`) |
| `npx tsc --noEmit -p tsconfig.json` | exit 0, aucune sortie |
| `npx vitest run --config vitest.config.ts --pool=threads --maxWorkers=1` | 31 fichiers, 151 tests OK |
| `node scripts/generer-matrice-securite-phase9.mjs --check` | PASS, 216 routes |
| `node tests/integration/run-auth-worker.mjs` | exit 0 ; 18 tests : 17 OK, 1 ignoré (voulu), 0 échec ; 191 s |
| `node docs/architecture-modernization/tools/inventaire-schema-memoire.mjs` | 35/35 migrations OK en mémoire ; 86 tables, 133 triggers, 134 index ; `UPDATE menages SET statut_validation='REFUSE'` → CHECK constraint failed |
| `node docs/architecture-modernization/tools/inventaire-geo-memoire.mjs` | 112 départements : 80 `VALIDE` / 32 `A_VERIFIER` ; 0 sous-préfecture/commune/canton ; coordonnées `NON_RENSEIGNE` ×112 |
| `node docs/architecture-modernization/tools/analyse-code-mort.mjs` | 225 fichiers ; orphelins applicatifs = points d'entrée + `hors-ligne.service.ts` ; 121 exports non référencés (23 sans aucun usage) ; 0 dépendance npm inutilisée ; 35 scripts non référencés |

## 4. Modifications effectuées dans le dépôt pendant la Phase 0/1

Uniquement **ajout de fichiers** sous `docs/architecture-modernization/` (documents, `tools/` en lecture seule, `evidence/`). Aucun fichier de code applicatif, de migration, de configuration ou de test n'a été modifié. Aucune base distante ni locale persistante n'a été touchée (les tests d'intégration utilisent un dossier temporaire jeté par le runner). Aucun push, aucun déploiement.

## 5. Reprise de travail (checklist de session vierge)
1. `git status` et lire `README.md` + ce journal.
2. Lire `05-decisions-a-valider.md` : quelles décisions ont été tranchées ?
3. Utiliser le dernier `verify` archivé dans `evidence/`; sous Windows, si Wrangler échoue avant le Worker avec le Temp isolé du sandbox, relancer avec `TEMP=TMP=C:\Users\Lenovo\AppData\Local\Temp` et garder les deux résultats.
4. Prendre le **premier lot non terminé** de `04-feuille-de-route.md` dont les dépendances sont satisfaites ; respecter ses critères d'acceptation et sa section retour arrière.
5. Clore le lot : mettre à jour §1 et §2 de ce journal, régénérer la matrice de sécurité, noter les commandes/résultats en §3.

## 6. Revue de complétude documentaire (26-10-2026)

* **Phase 0 — audit documentaire : complet.** `01-audit-baseline.md`, `02-audit-code-mort.md` et les preuves référencées sont présents. `baseline-tsc.txt`, auparavant vide, consigne maintenant la commande, le code de sortie 0 et l'absence attendue de diagnostics ; aucun test n'a été relancé.
* **Phase 1 — dossier de conception : complet pour revue.** `03-architecture-cible.md`, `04-feuille-de-route.md` et `05-decisions-a-valider.md` sont présents ; les décisions D-01 à D-14 sont listées, ouvertes ou conditionnelles. Les deux références erronées à un fichier `06` ont été corrigées vers `05`. Aucun document `06` n'est attendu.
* **Correction étayée par le code (F-10)** : `POST /api/territoire/unites-dynamiques` appelle `creerUniteTerritorialeDynamique`; les rôles terrain `RESPONSABLE_STOCK`, `SUPERVISEUR_TERRAIN` et `AGENT_DISTRIBUTION` figurent dans `ROLES_CREATION_DIRECTE_UNITE_TERRITORIALE`. Le service écrit les unités dynamiques à l'état `VALIDE` (ou utilise ce défaut pour les sous-préfectures) ; la création d'un département reste réservée au propriétaire ou à l'administration centrale. Voir `backend/src/index.ts`, `shared/constantes/roles.ts`, `backend/src/routes/territoire.routes.ts`, `backend/src/services/territoire.service.ts` et `migrations/0035_refonte_territoriale_dynamique_sans_communes.sql`. L'incertitude de F-10 est donc levée sans prétendre certifier l'exactitude administrative des unités.
* **État Git au début de cette revue** : HEAD `371f0be`, 67 fichiers modifiés, 1 supprimé et 235 non suivis (`git status --short`). Le compte 302 non suivis noté en §3 est la capture antérieure, pas l'état actuel ; aucun changement local n'a été supprimé ni réinitialisé.
* **Clôture de cette revue initiale :** le statut ci-dessus décrit l'état à la date de l'audit. L'exécution ultérieure B0/B1 est enregistrée dans la mise à jour courante au §7; les faits historiques de cette section ne sont pas réécrits.

## 7. Mise à jour de clôture B1 — 2026-10-26

* **D-01 approuvée:** `REJETE` est l'état interne officiel; `REFUSER` reste accepté en entrée et est normalisé avant persistance.
* **B1.2 commit local:** `6cc8ffd fix: persist household rejection as REJETE`. Changement limité au mapping du refus, types/filtre de statut et test d'intégration; aucune migration, migration historique, permission ou règle d'approbation modifiée.
* **Preuve avant/après:** `evidence/verify-20261026T152612652Z.txt` reproduit le comportement HTTP 500 attendu avant le correctif (commande terminée 0 car l'assertion décrivait le bug). `evidence/verify-20261026T153257468Z.txt` après correctif: 2 tests pass, 0 fail, exit 0; Worker/D1 local; la comparaison de chaque ligne (`id`, `code_menage`, `statut`, `statut_validation`) montre que seul le statut du ménage ciblé passe à `REJETE`, sans ajout/suppression ni modification d'autres lignes.
* **Vérification complète:** `npm run verify`, 332.8 s, exit 0 (`evidence/verify-20261026T153504120Z.txt`): TypeScript 0; Vitest 31 fichiers/151 tests pass; matrice 216 routes pass; SQLite mémoire 35 migrations jusqu'à 0035; intégration Worker/D1 locale pass; fichiers suivis/non-ignorés modifiés automatiquement = 0. Harness local temporaire, identifiant D1 fictif, aucune commande distante ni connexion en écriture à Staging/Production.
* **قرارات التصميم المعتمدة:** D-02/D-03/D-04/D-13 هي مبادئ معتمدة، لكن التعيينات التفصيلية ومرجع/جهة التصديق الجغرافي لم تُحسم. D-12 مفتوحة؛ لا تغيير لسير الموافقات.
* **الحالة التاريخية وقتها:** B1.1 وB1.2 وB1.3 مكتملة تقنيًا؛ Phase 2 لم تكن قد بدأت في 2026-10-26. الحالة الجارية محدثة في §9 أدناه.

## 8. B2.1 — تثبيت سياسات RBAC (2026-10-26)

* أضيف `shared/permissions/catalogue.ts` و`backend/src/core/authz/registre.ts` كمرجع وفاحص قراءة فقط، مع توليد الكتالوج من مولّد مصفوفة Phase 9. يرفض الفاحص سياسة مفقودة افتراضيًا؛ `--check` يوقف التحقق عند اختلاف المسارات أو السياسات. أضيف اختبار يقارن سياسات الأدوار السبعة بالـ1512 سجل B1.1، واختبار إغلاق غياب السياسة. لم تتغير snapshots أو سلوك middleware/routes.
* حُسمت 13 حالة HTTP 400 بمدخلات صالحة على Worker وD1 مؤقتين: 3 أدوار ميدانية × `GET /api/territoire/arrondissements` و`GET /api/territoire/quartiers` أعادت HTTP 200 وبيانات N’Djamena (10 دوائر وحيّان) رغم أن حسابات الاختبار مقيدة بمقاطعة أخرى؛ `GET /api/territoire/carres` أخفى المورد خارج النطاق بـ404؛ ومراجع التوزيع رفضت الأدوار الميدانية بـ403. Export التقرير غير الحساس متاح لحساب الاستشارة (200) والحساس مرفوض (403)، والشرط موثق في الكتالوج والمصفوفة من `limiterRapportsConsultation`.
* **مانع أمني مثبت:** مرشح النطاق في `backend/src/services/territoire.service.ts` يقيد الدور `DELEGUE_PROVINCIAL` فقط، فيما استعلاما الدوائر والأحياء لا يضيفان شرط مقاطعة إلا لذلك الدور. بذلك تتجاوز الأدوار `RESPONSABLE_STOCK`, `SUPERVISEUR_TERRAIN`, `AGENT_DISTRIBUTION` النطاق وتقرأ بيانات جغرافية خارج مقاطعتها. لا إصلاح هنا: تعديل السماح الفعلي يتجاوز شرط الحفاظ على الصلاحيات ويتطلب اعتماد مصفوفة D-04 التفصيلية.
* `npm run verify` على التعديلات: TypeScript 0؛ Vitest 32 ملفًا / 154 اختبارًا ناجحًا؛ فحص الكتالوج 216/216؛ SQLite و35 migration في الذاكرة ناجحة؛ تكامل Worker المحلي **exit 1 عمدًا** عند اختبار الرفض الذي كشف التسرب. فحص عدم التعديل التلقائي: 0 ملفات. الدليل الكامل: `evidence/verify-20261026T163052438Z.txt`؛ لم تُستخدم قاعدة أو بيئة بعيدة.
* **الحالة:** B2.1 غير مغلقة؛ لا انتقال إلى B2.2 أو Phase 2 حتى اعتماد مصفوفة D-04، إصلاح نطاق القراءة في دفعة مصرح بها، ثم اجتياز اختبار الانحدار و`npm run verify` كاملًا.

## 9. متابعة خارطة الطريق — 2026-10-29

* **B2.3-B:** أضيف `backend/src/modules/geo/import-plan.ts` و6 اختبارات جافة؛ فحص المصدر، الهوية المستقرة، الآباء، الدورات، الأسماء المتعارضة، الإصدار وإعادة التشغيل. لا يكتب D1 ولا يستورد بيانات رسمية. المصدر/الملحق القانوني الكامل، جهة اعتماد D-03/D-13، وقواعد المسارات قبل نشر API v1 ما زالت مطلوبة. الدليل: `evidence/b2-3-b-technical-preparation-20261029.md`.
* **B2.6:** المقارنة 229×7: route gate 1490 MATCH / 0 MISMATCH / 113 INDETERMINATE / 0 ERROR؛ القرار الكامل 1603 INDETERMINATE لأن سياقات المورد والجغرافيا والمؤسسة غير مكتملة، لا لأنه 1603 اختلافًا. الـ80 فرقًا بين الواقع والهدف المقترح؛ والـ13 استجابة 400 تاريخية تبقى غير حاسمة. المزامنة المحلية 25/25، لا بيانات حقيقية. الوضع **TECHNICALLY COMPLETE / POLICY PENDING** لنظام المقارنة فقط؛ لا Enforcement، progressive activation أو rollback ليست جاهزة.
* **B2.6-R1:** إعادة المصادقة بعد انتهاء جلسة التفعيل الأولي (15 دقيقة) جعلت سيناريو Worker حتميًا دون تغيير سياسة الجهاز/الجلسة؛ نجاح `verify:rapide` و`verify` الكامل على D1/Worker محلي بعد ضبط `TEMP`/`TMP`; الأدلة في `b2.6-r1-auth-worker-diagnosis-20261029.md` و`verify-20261029T171321406Z.txt`.
* **D-12:** لم يتغير سير الموافقات. الخدمة تقبل حاليًا قرارًا واحدًا مقبولًا من اللجنة **أو** الوزارة؛ الاختبارات القائمة تسجل الاثنين معًا ولا تحسم كفاية كل منهما. الخيارات والأثر موثقة في `evidence/roadmap-readiness-20261029.md`.
* **B2.7/B2.8/Phase 3:** B2.7 ينتظر المرجع والجهة الجغرافية والمصفوفة، B2.8 ينتظر تبعياته وبيانات `sensible/delegable` المعتمدة، وPhase 3 **BLOCKED**. لا تغيير على جداول B2.2 كمصدر وصول، ولا استيراد أو migrations بعيدة أو push أو نشر.
* **Vérification du checkpoint بعد توثيقه:** `npm run verify:rapide` PASS exit 0 (39 fichiers / 197 tests, matrice 229 routes, 42 migrations), preuve `evidence/verify-20261029T172452114Z.txt`. `npm run verify` PASS exit 0 avec `TEMP=TMP=C:\Users\Lenovo\AppData\Local\Temp`; Worker/D1 locaux, 39 fichiers / 197 tests, 229 routes, 42 migrations, aucun fichier auto-modifié; preuve `evidence/verify-20261029T172553044Z.txt`. Le run complet par défaut de 17:12, arrêté avant Worker (`fetch failed`/`EPERM`), reste archivé et explicitement classé FAIL.

## 10. B2.6 — couverture Shadow des 13 routes (2026-10-30)

* **Technique — COMPLÈTE:** la migration `0043_politiques_ombre_appareils_sessions.sql` (commit `087c287`) ajoute au Shadow les 13 routes appareils/sessions, copiées du catalogue Legacy (13 permissions, 49 liaisons). Porte de route: **1 581 MATCH / 0 MISMATCH / 22 INDETERMINATE / 0 ERROR**; plus aucune `POLITIQUE_SHADOW_ABSENTE`.
* **Politique — EN ATTENTE:** D-02/D-04 (80 couples), 22 déclarations Legacy conditionnelles, contextes ressource/géographie/organisation; autorisation complète toujours 1 603 INDETERMINATE. Aucune permission, Legacy ni D-12 modifiés; Enforcement non autorisé.
* **Vérification:** `npm run verify` complet PASS exit 0 (TEMP/TMP documentés, Worker + D1 locaux, 43 migrations, 229 routes, 0 fichier auto-modifié): `evidence/verify-20261030T212207438Z.txt`. Détail: `evidence/b2-6-shadow-13-routes-20261030.md`.

## 11. D-02/D-04 approuvées en principe, Shadow et B3.1 amorcé (2026-10-30)

* **Décisions:** option A (rôle × action × ressource assignée × portée) approuvée avec neuf garde-fous; détail dans `08-matrice-d02-d04-a-approuver.md`. Aucun enforcement, aucune politique Legacy modifiée, D-12 inchangé.
* **Shadow:** `politique-d02-d04-ombre.ts` (registre des 80 couples, règles candidates, lecteurs d’affectation entrepôt/distribution) et migration additive `0044_affectations_terrain_distributions_ombre.sql` (non déployée; Staging à 0043). Staging a reçu 0036–0043 et le Worker le 30-10-2026 (`sigad-staging`, version 71188df3).
* **B3.1 amorcé (drapeau `consoles_v2`, désactivé par défaut):** `frontend/src/consoles/consoles-config.ts` + intégration minimale dans `App.tsx`: préfixes `/plateforme`, `/national`, `/provincial`, `/institution`, redirection des URL historiques, console étrangère remplacée. Les composants métier ne sont pas modifiés; les rôles terrain atterrissent dans « provincial » et la consultation dans « institution » (écart par rapport aux trois consoles de la feuille de route, **approuvé le 30-10-2026**: quatre consoles — plateforme, national, provincial, institution). Reste: coque visuelle par console, chunks par console, e2e par rôle avec le drapeau actif.
* **B3.1 e2e (30-10-2026):** `tests/e2e/consoles-v2.spec.ts` PASS 4/4 sur Chrome et Worker/D1 locaux (propriétaire→plateforme, central→national, délégué→provincial, drapeau désactivé sans préfixe; redirection des anciennes URL, console étrangère remplacée, rechargement). Commande: `SIGAD_INTEGRATION_TESTS=donnees-test-worker.test.mjs SIGAD_PLAYWRIGHT_GREP=\"Consoles v2\" node scripts/verify.mjs --e2e` (nouvelle option `--e2e`; `run-auth-worker.mjs` copie `frontend/dist` dans son dossier assets temporaire quand Playwright est actif). Non couverts: rôles terrain/consultation en e2e, coque visuelle par console, chunks par console.
