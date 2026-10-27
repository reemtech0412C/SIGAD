# B2.6 — Matrice D-02 / D-04 proposée pour approbation

**Statut : proposition non approuvée.** Aucun droit opérationnel n’a été changé dans cette revue. Les principes D-02 et D-04 sont approuvés, mais la matrice détaillée demeure à décider. Cette matrice ne confère aucune autorisation.

## État de preuve et limite de B2.6

- La caractérisation B1.1 contient 216 routes × 7 rôles = 1 512 cas. Les snapshots et le registre sont contrôlés par tests; les 80 écarts et les 13 sondes initialement en HTTP 400 sont répertoriés ci-dessous.
- Le catalogue actuel couvre 229 routes. Les 13 routes d’identité/appareils ajoutées depuis B1.1 ne sont pas dans les snapshots 7 × 216; les tests B2.5 de cycle de vie ne remplacent pas une caractérisation rôle × route complète.
- Le registre de backend évalue les politiques en observation; il n’est pas la source de décision. L’accès continue d’être décidé par le middleware et les contrôles de services existants. Les tables B2.2 restent en mode ombre.
- D-02/D-04 détaillés non approuvés ⇒ aucun basculement de exigerPermission, aucune nouvelle permission, aucun changement à D-12.

## Matrice des rôles et des domaines

Les cibles ci-dessous sont des recommandations à approuver. « Portée » décrit la source attendue de l’autorisation et non un champ supposé déjà disponible dans le modèle.

| Rôle | Comportement actuel observé | Cible recommandée | Portée et données | Décision nécessaire |
|---|---|---|---|---|
| PROPRIETAIRE | Administration plateforme; GET distributions/menages est refusé par le service. | Administrer comptes, rôles, permissions, fonctionnalités et santé technique; aucun accès nominatif aux ménages. Utiliser des agrégats pour le suivi. | Portée plateforme; aucune PII bénéficiaire par défaut. | Approuver la liste des permissions techniques; toute exception nominative requiert une décision distincte, motivée et auditée (D-02). |
| ADMIN_CENTRAL | Accès national selon les routes; GET distributions/menages est actuellement refusé par le service. | Opérations nationales dans les compétences attribuées; permissions distinctes par action; accès aux PII au cas par cas, non implicite. | Portée nationale ou province explicitement ciblée par l’opération; données opérationnelles et parfois PII. | Définir quelles fonctions centrales peuvent lire, modifier, vérifier ou approuver chaque classe de données (D-02/D-04); aucune modification D-12. |
| DELEGUE_PROVINCIAL | Plusieurs lectures et opérations sont bornées par province de session; GET consolidation est refusé. | Opérations, comptes et ressources explicitement délégués; une province ne donne pas automatiquement tous ses sous-niveaux. | Identité/session + affectation géographique ou relation de ressource vérifiée en base; pas de portée fournie par le client. | Nommer les niveaux d’affectation et les actions autorisées; consolidation reste refusée en attendant D-04 et, si elle influe sur l’approbation, D-12. |
| RESPONSABLE_STOCK | Les 10 lectures de stock concernées répondent 200; des lectures d’approvisionnements, distributions, opérations centrales et référentiels géographiques répondent aussi 200. | Lecture/gestion de stock seulement pour les entrepôts et opérations attribués; aucun accès automatique aux ménages ou aux opérations nationales. | Relation entre compte, entrepôt et opération vérifiée côté serveur; inventaire = données opérationnelles sensibles. | Approuver rôle × action × entrepôt; confirmer si la portée actuelle existe pour chaque route (D-04). |
| SUPERVISEUR_TERRAIN | Les mêmes 10 lectures de stock et les 15 lectures communes des rôles terrain répondent 200. | Vérification dans la zone et sur les dossiers assignés; séparation collecte / vérification / approbation; accès stock seulement si une affectation le justifie. | Affectation explicite, sans élargissement à toute une province; données terrain possiblement nominatives. | Définir les actions et niveaux assignés; confirmer si toute lecture stock est nécessaire (D-04). |
| AGENT_DISTRIBUTION | Les 15 lectures communes répondent 200; référentiels distributions refusés (403). | Collecte/exécution uniquement sur distribution assignée; pas de validation finale de ses propres saisies ni de lecture de flux centraux non assignés. | Distribution et zone assignées, dérivées des relations en base; données de distribution potentiellement nominatives. | Définir les opérations de collecte et le périmètre assigné; conserver le refus des mutations non approuvées (D-04). |
| CONSULTATION_INSTITUTIONNELLE | Cinq lectures de rapports non sensibles répondent 200; export non sensible fonctionne sous condition. Notifications et lectures des opérations centrales sont refusées (403). | Lecture seule d’agrégats et rapports non sensibles dans le périmètre de l’institution; aucun accès nominatif. Une notification personnelle n’est pas une modification métier, mais doit être décidée explicitement. | Périmètre institutionnel; PII et détails opérationnels sensibles exclus par défaut. | Approuver les rapports exacts, le périmètre institutionnel, les filtres et l’exception éventuelle pour marquer ses propres notifications (D-02). |

## Inventaire des permissions sensibles

| Classe | Exemples existants | Portée requise | Garde-fous et décision |
|---|---|---|---|
| Administration et escalade | création/suspension/révocation de comptes, affectation de rôles et portées, permissions, MFA, appareils et sessions | Compte cible et compétence de l’acteur; compte de l’acteur interdit comme cible pour les actions auto-approuvées | Motif, audit unifié, révocation des sessions; empêcher attribution d’un droit que l’acteur ne détient pas. B2.5 couvre le cycle de vie, mais ses 13 routes manquent encore à la matrice de caractérisation B1.1. |
| Données bénéficiaires | listes/détails ménages, validation/rejet, doublons, export nominatif | Province et ressource vérifiées en base; portée tirée de la session et des affectations | PII élevée; aucune permission propriétaire par défaut; audit des lectures/exportations sensibles et décision D-02 pour les exceptions. |
| Stocks et distributions | inventaire, réceptions, lots, ménages servis, distributions | Entrepôt, opération et dossier parent assignés | Pas de confiance au province_id, identifiant de ressource ou filtre fourni par le client; pagination et totaux doivent être filtrés en SQL. D-04 pour chaque rôle. |
| Référentiel géographique | lecture de référentiels, création/proposition et validation | Ressource dans le niveau autorisé; référentiels publics séparés de la portée d’accès aux données métier | Pas d’approbation personnelle; D-03/D-13 gouvernent les unités, D-04 la lecture par rôle. Aucune donnée officielle nouvelle ni autorité de validation n’est présumée. |
| Opérations centrales et approbations | décisions, consolidation, pièces et clôture | Autorité centrale et provinces concernées | Conserver le comportement existant; D-12 reste ouvert et interdit toute modification de la chaîne. |
| Audit, drapeaux et opérations de plateforme | consultation/export audit, activation de drapeau, révocation massive | Portée plateforme/nationale étroitement définie | Événements audit avec acteur, cible, request_id et résultat; actions critiques motivées et à double contrôle selon la politique approuvée. |

## Registre exact des 80 écarts B1.1

Pour chaque couple rôle-route ci-dessous, l’état actuel provient des snapshots B1.1; le test attendu est un appel Worker avec un compte synthétique et une base locale. La cible proposée n’autorise aucun accès par héritage de rôle seul.

| Profil / nombre | Couples exacts (la liste de rôles s’applique à chaque route) | Actuel | Cible recommandée / décision | Sensibilité, portée et test d’acceptation |
|---|---|---|---|---|
| A1 / 21 | Rôles AGENT_DISTRIBUTION, RESPONSABLE_STOCK, SUPERVISEUR_TERRAIN × GET: /api/approvisionnements; /api/approvisionnements/:id/destinations; /api/approvisionnements/:id/expeditions; /api/approvisionnements/:id/receptions; /api/approvisionnements/:id/repartition; /api/distributions; /api/operations-centrales | Les 21 répondent 200, tandis que la politique B1.1 les déclarait refusés. | Pas de permission générique terrain. Recommander refus par défaut, puis autorisation route par route uniquement si responsabilité et ressource assignée sont approuvées (D-04). | Données opérationnelles, potentiellement PII via distributions. Tester ressource assignée autorisée seulement si approuvée, ressource hors affectation refusée sans fuite de ligne, compte, total ou page. |
| A2 / 24 | Rôles AGENT_DISTRIBUTION, RESPONSABLE_STOCK, SUPERVISEUR_TERRAIN × GET: /api/territoire/cantons; /api/territoire/communes; /api/territoire/departements; /api/territoire/localites; /api/territoire/provinces; /api/territoire/rattachements-territoriaux; /api/territoire/sites-humanitaires; /api/territoire/sous-prefectures | Les 24 répondent 200, tandis que la politique B1.1 les déclarait refusés. | Distinguer catalogue de référence non sensible et portée d’accès aux données. Recommander seules les valeurs nécessaires au travail assigné; l’affichage national ne doit jamais élargir la portée opérationnelle (D-04). | Référence géographique faible à moyenne; sites humanitaires et rattachements plus sensibles. Tester filtres SQL, query/id forgés, absence de confusion entre visibilité du référentiel et droit sur un ménage/stock. |
| A3 / 20 | Rôles RESPONSABLE_STOCK, SUPERVISEUR_TERRAIN × GET: /api/stocks/ajustements-stock; /api/stocks/articles; /api/stocks/categories-aide; /api/stocks/conditionnements; /api/stocks/entrepots; /api/stocks/lots-stock; /api/stocks/mouvements-stock; /api/stocks/receptions-stock; /api/stocks/soldes-stock; /api/stocks/unites-mesure | Les 20 répondent 200, alors que le snapshot déclare refus. | RESPONSABLE_STOCK: lecture en lecture seule limitée aux entrepôts/opérations assignés (à approuver). SUPERVISEUR_TERRAIN: refuser par défaut jusqu’à justification/affectation explicite (D-04). | Inventaire/opérations sensibles; tester entrepôt assigné/non assigné, identifiant direct, filtres, pagination et totaux; aucun accès aux PII par ces lectures. |
| A4 / 5 | CONSULTATION_INSTITUTIONNELLE × GET: /api/rapports/:type/apercu; /api/rapports/catalogue; /api/rapports/filtres; /api/rapports/indicateurs-carte; /api/rapports/tableau-de-bord | Les 5 répondent 200, tandis que le snapshot les déclarait refusés; la limitation de rapports non sensibles est déjà codée. | Recommander lecture agrégée/non sensible seulement, périmètre institutionnel et suppression des identifiants; ne pas élargir les types de rapport (D-02 à valider). | Agrégats faibles; aperçu peut porter PII selon le type. Tester rapports sensibles refusés, non sensibles permis, aucun identifiant/compte individuel et filtres institutionnels. |
| B1 / 1 | ADMIN_CENTRAL × GET /api/distributions/menages | 403 réel, alors que le snapshot le déclarait permis; le service exige DELEGUE_PROVINCIAL. | Garder la liste nominative refusée par défaut; préférer agrégats nationaux. Tout accès central nominatif exige compétence, périmètre et justification explicites (D-02). | PII élevée. Tester que 403 ne divulgue ni lignes ni compteurs; une éventuelle exception doit être explicitement autorisée et auditée. |
| B2 / 1 | PROPRIETAIRE × GET /api/distributions/menages | 403 réel, alors que le snapshot le déclarait permis. | Conserver le refus nominatif conformément au principe D-02; seuls agrégats non identifiants sont recommandés. | PII élevée. Test propriétaire: aucune donnée ménage, aucun total différentiel; test agrégat distinct si sa route existe. |
| B3 / 7 | CONSULTATION_INSTITUTIONNELLE × GET /api/notifications; POST /api/notifications/:id/lecture; POST /api/notifications/lecture-toutes; GET /api/operations-centrales; GET /api/operations-centrales/:id; GET /api/operations-centrales/:id/consolidation; GET /api/operations-centrales/:id/documents/:docId | Les 7 sont refusés 403 malgré un descriptif B1.1 permissif. | Recommander de garder les lectures d’opérations centrales refusées ou de définir des vues agrégées explicitement; éventuel accès aux notifications strictement personnelles et changement de leur seul état d’affichage à décider (D-02). | Documents et opérations sensibles; notifications de compte. Tester propriété du destinataire, aucun détail PII, aucune ressource d’une autre institution; pas d’écriture métier. |
| B4 / 1 | DELEGUE_PROVINCIAL × GET /api/operations-centrales/:id/consolidation | 403 réel, snapshot permissif; route refuse explicitement ce rôle. | Garder le refus jusqu’à définition du rôle dans la consolidation; si autorisé plus tard, lecture limitée aux provinces assignées et sans acte d’approbation (D-04; D-12 si effet sur workflow). | Données opérationnelles/agrégats provinciaux. Tester province assignée/hors portée et séparation stricte lecture/décision. |

Total vérifié : A1 21 + A2 24 + A3 20 + A4 5 + B1 1 + B2 1 + B3 7 + B4 1 = **80 couples rôle-route**.

Le correctif B2.1 d’isolation des lectures géographiques reste la règle approuvée: aucune requête ou ressource ne peut élargir la portée dérivée de la session/affectation. La décision A2 porte seulement sur la visibilité des catalogues de référence, jamais sur l’accès aux données opérationnelles.

## Sondes initialement non concluantes et preuve

Les 13 HTTP 400 initiaux ne prouvaient ni autorisation ni refus. Le run local complet `verify-20261027T002707166Z.txt` (révision ed37a9b, après le correctif B2.1) contient des sondes valides: pour chacun des trois rôles de terrain, référentiels distributions = 403; arrondissements/quartiers/carrés hors portée = 404, alors que les lectures locales assignées restent 200. Pour CONSULTATION_INSTITUTIONNELLE, export non sensible = 200 et export sensible = 403 selon limiterRapportsConsultation. Il s’agit de preuve sur cette révision; le Worker n’a pas pu être redémarré sur HEAD e4feae4 lors de cette revue.

## Routes ajoutées après la baseline B1.1

Ces 13 routes existent dans le catalogue 229, mais ne figurent pas dans les snapshots 216. Les tests B2.5 de cas d’usage ne fournissent pas, à eux seuls, les 91 décisions rôle × route attendues pour sept rôles. Elles doivent être ajoutées à une caractérisation explicitement revue avant l’application B2.6:

| Groupe | Routes |
|---|---|
| Lecture appareils | GET /api/administration/comptes/appareils; GET /api/compte/appareils; GET /api/proprietaire/appareils |
| Décisions administratives appareils | POST /api/administration/comptes/appareils/:id/approuver; POST /api/administration/comptes/appareils/:id/revoquer; POST /api/administration/comptes/appareils/:id/suspendre |
| Appareils personnels | POST /api/compte/appareils; POST /api/compte/appareils/:id/revoquer; POST /api/compte/appareils/defis |
| Sessions personnelles | POST /api/compte/sessions/:id/revoquer; POST /api/compte/sessions/revoquer-toutes |
| Révocation plateforme | POST /api/proprietaire/appareils/:id/revoquer; POST /api/proprietaire/utilisateurs/:id/revoquer |

| Groupe | Politique actuelle du registre | Cible recommandée | Test requis avant enforcement |
|---|---|---|---|
| Administration appareils (4 routes) | ADMIN_CENTRAL uniquement; portée nationale; l’appareil et son propriétaire sont relus en base. | Conserver l’autorité centrale D-07, sans approbation personnelle; journaliser approbation, suspension et révocation. Ne pas activer de délégation provinciale avant accord D-04. | ADMIN_CENTRAL autorisé selon compétence; autres rôles refusés; auto-approbation, changement de cible et ressource hors portée refusés; audit lié à acteur, cible et request_id. |
| Appareils et sessions du compte (6 routes) | Les sept rôles sont déclarés; la portée annoncée provient de la session et de D1. | Conserver l’auto-service uniquement sur appareils/sessions appartenant au compte authentifié; preuve de possession exigée à l’enregistrement; révocation n’agit que sur la propre session/appareil. | Tester les sept rôles sur leurs propres ressources puis usurpation d’identifiant, appareil non approuvé, session révoquée et rejeu; aucun secret ni métadonnée d’un autre compte. |
| Administration technique Propriétaire (3 routes) | PROPRIETAIRE uniquement; portée technique nationale. | Conservation recommandée pour inventaire et révocation de comptes/appareils, dans le pouvoir d’administration de D-02; l’API ne doit exposer ni ménages ni coordonnées personnelles superflues. | Tester absence de PII bénéficiaire, audit des révocations, interdiction d’auto-approuver un appareil et effet immédiat sur sessions/appareils. |

La matrice actuelle documente ADMIN_CENTRAL comme approbateur des appareils et empêche l’approbation de soi-même; l’autorité provinciale est préparée mais demeure désactivée (D-04). Ces 13 routes restent à caractériser rôle × route sur HEAD avant enforcement, même si leurs tests B2.5 ciblés existent.

## Décisions à approuver

| Décision | Options | Recommandation et effets |
|---|---|---|
| D-02 — Console du Propriétaire | A. Permissions plateforme seulement, aucun accès nominatif bénéficiaire; B. exceptions opérationnelles route par route, motivées et auditées. | **A.** Conforme au principe D-02, réduit l’exposition PII; les exceptions demandent une approbation explicite et ne sont pas incluses ici. |
| D-02 — Administration centrale | A. Droits nationaux par compétence, accès PII spécifique à la route/action; B. accès nominatif national général. | **A.** Permet les opérations nationales sans accès indu; exige tests de ressource et d’audit pour chaque permission nominative. |
| D-04 — Portée des rôles terrain | A. rôle × action × affectation explicite; B. rôle donnant toute la province; C. refus des routes dont l’affectation n’est pas représentée. | **A**, avec C comme comportement de repli. B est déconseillé car il élargit aux sous-zones et ressources non attribuées. |
| D-04 — Stock, supervision, distribution | A. RESPONSABLE_STOCK limité aux entrepôts; SUPERVISEUR vérifie les dossiers assignés; AGENT collecte/exécute les distributions assignées; B. conserver les lectures actuelles plus larges. | **A** sous réserve que chaque relation d’affectation existe et soit testée. B préserve le comportement mais conserve les écarts non justifiés. |
| D-02 — Consultation | A. rapports agrégés/non sensibles et périmètre institutionnel; notifications propres seulement si explicitement approuvées; B. lecture détaillée des opérations/documents. | **A.** Réduit le risque de PII et d’exposition opérationnelle; B demande une décision distincte et filtres vérifiables. |
| D-12 — Workflow central | Laisser le comportement en place; ou choisir une règle de consolidation/approbation différente. | Ne rien modifier dans B2.6. Toute modification de la chaîne attend l’arbitrage D-12. |

## Barrières avant application de B2.6

| Condition | État | Preuve exigée pour fermeture |
|---|---|---|
| Approbation détaillée D-02/D-04 | **En attente** | Choix explicite des options ci-dessus et approbation des listes rôle × action × ressource, y compris exceptions PII. |
| Baseline de routes | **Partielle: 216/229** | Caractériser et faire réviser les 13 routes nouvelles pour les sept rôles (91 cas), sans mise à jour globale aveugle des snapshots. |
| Couverture des 80 écarts | **Classés, aucune cible autorisée** | Approbation route par route/profil des 80 couples; l’option de refus doit être explicite pour les routes maintenues fermées. |
| Sondes 400 | **Résultats valides antérieurs disponibles** | Réexécuter les sondes Worker sur HEAD après rétablissement du runner local; conserver leurs statuts et assertions de contenu. |
| Couverture technique | **Fichiers disponibles** | Tests de non-authentifié, rôle manquant, affectation, propriété, état compte/session/appareil, auto-approbation, audit, pagination/compteurs et stabilité des 1 512 cas. |
| Bascule par module | **Non commencée** | Activer un module à la fois dans l’ordre de la feuille de route, tests caractérisation/intégration/e2e verts, drapeau de retour en observation démontré. |
| Vérification complète | **Non exécutée dans cette revue** | Après tout changement de code autorisé: tests ciblés puis npm run verify complet et enregistrement du code de sortie. |

## Vérifications exécutées sur HEAD e4feae4 (2026-10-27)

| Commande | Résultat |
|---|---|
| npx vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 tests/unit/authz-policy.test.mjs | Exit 0; 1 fichier, 3 tests réussis. |
| npx vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 tests/unit/b22-roles-portees-ombre.test.mjs tests/unit/recherche-territoire.test.mjs | Exit 0; 2 fichiers, 5 tests réussis. |
| npm run test:security-matrix | Exit 0; 229 routes synchronisées. |
| SIGAD_INTEGRATION_TESTS=caracterisation-roles-worker.test.mjs npm run test:integration — deux tentatives | Toutes deux exit 1 قبل تشغيل الاختبار: Wrangler 4.151.3 يطبع Resource location: local ثم fetch failed؛ لا يوجد سجل جاهزية Worker. التنظيف يتعثر كذلك بـEPERM عند unlink لملف codes-activation.json المؤقت في run-auth-worker.mjs. الدليلان: verify-20261027T051713405Z.txt وverify-20261027T051816731Z.txt. لم يحدث تعديل على ملفات المنتج؛ محاولة الغلاف الأولى كتبت سجلها قبل فحص البصمات، لذلك أبلغ ذلك التشغيل عن هذا السجل وحده. |

السبب الدقيق لفشل fetch وسبب رفض Windows unlink غير مثبتين؛ السجلات تثبت فقط فشل بدء Wrangler المحلي وخطأ التنظيف. لم تُجرَ محاولة ثالثة أو تعديل للتهيئة. لم يُشغّل npm run verify كاملًا لعدم وجود تعديل برمجي، كما أن تكامل Worker لم يبدأ.

## الحكم

**B2.6 غير مكتملة ومحجوبة قبل enforcement.** أُنجزت مصفوفة القرار ونجحت فحوص الوحدة والكتالوج، ولم تتغير أي صلاحية. قبل التنفيذ يلزم اعتماد D-02/D-04 بالتفصيل، استكمال characterization للـ13 مسارًا الجديد، ثم تكرار اختبارات Worker والبوابة الكاملة في بيئة Wrangler محلية سليمة. لا انتقال إلى Phase 3 ولا تغيير في D-12.
