# B2.6 — Matrice D-02 / D-04 proposée pour approbation

**Statut : principes approuvés, règles opérationnelles détaillées en attente.** Aucun droit opérationnel n’a été changé. Les recommandations ci-dessous ne confèrent aucune autorisation.

## État de preuve et limite de B2.6

- La caractérisation B1.1 reste inchangée: 216 routes × 7 rôles = 1 512 cas. Les 13 routes d’identité/appareils sont maintenant caractérisées séparément: 7 × 13 = 91 cas; total vérifié: 229 × 7 = 1 603.
- Les 13 réponses HTTP 400 de l’ancienne sonde demeurent enregistrées comme non concluantes. Les tests Worker valides sur les mêmes domaines contrôlent les décisions, sans requalifier ces 400 comme preuve d’autorisation.
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

La matrice actuelle réserve les décisions centrales d’appareils à ADMIN_CENTRAL; l’approbation personnelle est refusée et l’autorité provinciale demeure désactivée (D-04). Les 13 routes sont désormais caractérisées sur le Worker local; les résultats ci-dessous remplacent le statut antérieur « à caractériser ».

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
| Baseline de routes | **Complète: 229/229, 1 603 cas** | Les 216 snapshots B1.1 sont inchangés; 91 cas sont dans un répertoire B2.6 séparé et contrôlés par test. |
| Couverture des 80 écarts | **Classés, aucune cible autorisée** | Approbation route par route/profil des 80 couples; l’option de refus doit être explicite pour les routes maintenues fermées. |
| Sondes 400 | **13 anciennes réponses restent non concluantes** | Les sondes Worker valides actuelles établissent les contrôles correspondants; garder les anciennes 400 comme historique, jamais comme preuve d’autorisation. |
| Couverture technique | **Fichiers disponibles** | Tests de non-authentifié, rôle manquant, affectation, propriété, état compte/session/appareil, auto-approbation, audit, pagination/compteurs et stabilité des 1 512 cas. |
| Bascule par module | **Non commencée** | Activer un module à la fois dans l’ordre de la feuille de route, tests caractérisation/intégration/e2e verts, drapeau de retour en observation démontré. |
| Vérification complète | **PASS le 27-10-2026** | `npm run verify` exit 0; voir `evidence/verify-20261027T062431172Z.txt`. |

## Tentatives initiales sur HEAD e4feae4 (historique)

| Commande | Résultat |
|---|---|
| npx vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 tests/unit/authz-policy.test.mjs | Exit 0; 1 fichier, 3 tests réussis. |
| npx vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 tests/unit/b22-roles-portees-ombre.test.mjs tests/unit/recherche-territoire.test.mjs | Exit 0; 2 fichiers, 5 tests réussis. |
| npm run test:security-matrix | Exit 0; 229 routes synchronisées. |
| SIGAD_INTEGRATION_TESTS=caracterisation-roles-worker.test.mjs npm run test:integration — deux tentatives | Toutes deux exit 1 قبل تشغيل الاختبار: Wrangler 4.151.3 يطبع Resource location: local ثم fetch failed؛ لا يوجد سجل جاهزية Worker. التنظيف يتعثر كذلك بـEPERM عند unlink لملف codes-activation.json المؤقت في run-auth-worker.mjs. الدليلان: verify-20261027T051713405Z.txt وverify-20261027T051816731Z.txt. لم يحدث تعديل على ملفات المنتج؛ محاولة الغلاف الأولى كتبت سجلها قبل فحص البصمات، لذلك أبلغ ذلك التشغيل عن هذا السجل وحده. |

Les journaux de cette section sont historiques: le Temp utilisateur documenté en B2.3-A a permis ensuite de lancer Wrangler localement; aucune ressource Staging/Production n’a été visée.

## الحكم

**B2.6 techniquement caractérisée, mais non clôturée pour l’enforcement.** Les 91 nouveaux cas, les 1 512 cas de référence, les contrôles géographiques/appareils et `npm run verify` sont vérifiés. Les 80 écarts restent à arbitrer par règle; aucun droit n’a changé. Pas de basculement B2.2, Phase 3 ni changement D-12.

## Caractérisation finale et préparation (27-10-2026)

Le run complet `evidence/verify-20261027T062431172Z.txt` a réussi en 463 s sur Worker/D1 Wrangler locaux. Résultats: TypeScript 0; 179 tests unitaires 0; matrice 229 routes 0; schéma 41 migrations jusqu’à 0041 et migration 0022 en mémoire 0; intégration Worker 0; empreintes des fichiers avant/après 0 changement automatique. Les tables B2.2 sont restées en mode ombre.

| Rôle | Action et ressource (routes caractérisées) | Portée géographique et sensibilité | Comportement actuel observé (7 × 13) | Cible / effet d’approbation | Test d’acceptation |
|---|---|---|---|---|---|
| ADMIN_CENTRAL; autres rôles refusés | Lire/approuver/suspendre/révoquer un appareil (4 routes `/api/administration/comptes/appareils…`) | Compétence centrale nationale; appareil et compte relus en D1; métadonnées de compte/appareil sensibles, aucune PII bénéficiaire | Central: 200; autres rôles: 403 sur ces routes | Conserver l’autorité centrale; aucune délégation provinciale activée; pas de droit nouveau | Test Worker valide, approbation personnelle refusée, délégué refusé, événements audités |
| Les 7 rôles | Défi/enregistrement/liste/révocation d’appareil et révocation de session (6 routes `/api/compte/appareils…`, `/api/compte/sessions…`) | Compte authentifié et propriété D1; sans extension géographique; données de sécurité personnelles | Tous: 200, sauf inscription: 201 | Conserver l’auto-service limité au compte propre | Clé/signature valide, appareil en attente, seconde session, refus d’usurpation; aucun 400 |
| PROPRIETAIRE; autres rôles refusés | Inventaire/révocation technique d’appareil et révocation de compte (3 routes `/api/proprietaire/…`) | Portée technique plateforme; compte cible relu en D1; aucun accès bénéficiaire implicite | Propriétaire: 200; autres rôles: 403 | Conserver les fonctions de plateforme; aucune dérogation à une approbation métier | Fixtures locales, contrôle des rôles, événement d’audit et invalidation attendue |

Les sept snapshots d’extension contiennent chacun 13 résultats; aucune des 91 requêtes ne retourne 400. Le test unitaire vérifie la correspondance politique/résultat et l’intégrité séparée des snapshots B1.1. La suite Worker répète l’isolation géographique: les lectures de terrain autorisées retournent seulement les lignes/comptes dans l’affectation; les identifiants hors portée retournent 404 sans lignes ni total; l’administration centrale garde son périmètre national. Les sondes valides renvoient 403 pour les référentiels de distribution interdits, 404 pour les ressources géographiques hors portée, 200 pour export consultatif non sensible et 403 pour export sensible. Les 13 anciens 400 sont: pour chacun des trois rôles terrain, `GET /api/distributions/referentiels`, `GET /api/territoire/arrondissements`, `GET /api/territoire/carres`, `GET /api/territoire/quartiers`, plus `CONSULTATION_INSTITUTIONNELLE POST /api/rapports/:type/export`; ils restent étiquetés non concluants dans les snapshots. Les 80 écarts B1.1 demeurent ouverts et aucune permission n’a changé.

Le premier run complet a révélé une assertion non déterministe dans le test de concurrence d’approbation: l’événement doit reprendre le motif de la requête qui gagne, laquelle n’est pas nécessairement la première. Le test vérifie maintenant le motif associé à la réponse 200. Le run Worker ciblé et le run complet suivants ont réussi. Aucun code d’application, politique d’accès, migration ou donnée réelle n’a été modifié.

### Décisions encore à approuver

| Principe déjà approuvé, applicable sans ouverture de droit | Garde-fou vérifiable |
|---|---|
| Le propriétaire gère la plateforme sans accès nominatif bénéficiaire par défaut; l’accès central aux PII est explicite par action/ressource/but. | Refus par défaut et tests négatifs dédiés; toute exception nécessite une ligne approuvée et un audit. |
| Les rôles terrain, stocks et délégations restent bornés à l’affectation réelle; le client ne peut pas élargir la province. | Source de portée issue de la session et des relations D1; tests de propriété, query forgée, compteurs et pagination. |
| Collecte, vérification et approbation sont séparées; aucun acteur ne s’auto-approuve. | Tests d’auto-approbation et séparation d’acteur, sans changement de circuit D-12. |
| Consultation reste en lecture seule et exclut les rapports sensibles sans autorisation distincte. | Export non sensible permis; export bénéficiaire sensible refusé; aucune permission de mutation métier. |
| Toute action sensible doit rester auditable. | Acteur/cible/request_id et événement vérifiés pour les mutations de compte/appareil existantes. |

Les principes ci-dessus sont approuvés comme contraintes de conception; ils ne changent pas les décisions des routes existantes. Les options de la table suivante sont les arbitrages opérationnels encore attendus.

| Sujet et état actuel | Option recommandée | Effet précis si approuvée | Décideur |
|---|---|---|---|
| 21 lectures A1: 3 rôles terrain × 7 routes opérationnelles; actuel 200 | Autoriser par rôle/action et ressource/dossier assigné; refuser si affectation absente | Retirer les lectures génériques; seuls les dossiers assignés peuvent rester accessibles | Propriétaire fonctionnel D-04 |
| 24 lectures A2: 3 rôles terrain × 8 référentiels; actuel 200 | Référentiels minimum utiles; séparation de la permission d’accès aux ménages/stocks | Peut réduire la visibilité du catalogue; n’élargit jamais la portée opérationnelle | Propriétaire fonctionnel D-04 |
| 20 lectures A3: stock × RESPONSABLE_STOCK/SUPERVISEUR; actuel 200 | Responsable stock sur entrepôt/opération affectés; superviseur seulement avec affectation explicite | Peut fermer des lectures générales; ne crée aucun accès nominatif | Propriétaire fonctionnel D-04 |
| 5 rapports A4 consultation; actuel 200 | Rapports agrégés/non sensibles, portée institutionnelle | Maintient les vues non sensibles; refuse les rapports individuels par défaut | Propriétaire fonctionnel D-02 |
| 2 lectures ménages B1/B2; actuel 403 malgré l’attente historique | Maintenir le refus; toute exception nominative doit nommer route/action/ressource/but et audit | Aucun accès nouveau; une exception approuvée serait un changement de permission explicite | Propriétaire fonctionnel D-02 |
| 7 notifications/opérations B3 consultation; actuel 403 | Garder opérations/documents refusés; décider séparément des notifications propres | Pas d’accès opérationnel; notification propre en lecture/accusé seulement si approuvée | Propriétaire fonctionnel D-02 |
| Consolidation B4 délégué; actuel 403 | Maintenir refus jusqu’à définition du rôle provincial, sans acte d’approbation | Une éventuelle ouverture est lecture seule, limitée à sa province; D-12 reste inchangé | Propriétaires fonctionnels D-04; D-12 si workflow concerné |
| 13 anciennes sondes 400; décision non prouvée par ces codes | S’appuyer sur les sondes Worker valides; garder les 400 historiques | Aucun changement de droit; toute exception nouvelle exige une requête valide et une réponse déterminante | Propriétaires fonctionnels de chaque règle |

**Changement de permissions autorisé dans ce travail: aucun.** Les recommandations des lignes A1–B4 décrivent des réductions ou limites proposées, pas des ordres de modification. Aucun chemin bloqué n’est ouvert par la seule présence d’une ancienne documentation permissive.

### Conditions de transfert de B2.2 vers l’enforcement

| Porte | État | Preuve exigée avant bascule |
|---|---|---|
| Matrice D-02/D-04 détaillée | Ouverte | Approbation par rôle × action × ressource × portée, couvrant les 80 écarts, les exceptions de PII et les refus à conserver. |
| Réconciliation de comptes/affectations | Ouverte | Stratégie pour comptes historiques, créations et modifications; divergences shadow/legacy expliquées et corrigées ou explicitement acceptées; aucune divergence d’autorité non expliquée. |
| Comparaison legacy/shadow | Pas une source d’accès actuellement | Rejouer les 1 603 décisions, tests de propriété, géographie, état compte/session/appareil; examiner chaque écart et prouver zéro élargissement non autorisé. |
| Mise à jour synchronisée | À concevoir avant transition | Changements de rôle/niveau écrits et réconciliés sans fenêtre d’accès stale; événement d’audit acteur/cible/request_id. |
| Bascule et retour | Non commencés | Activation module par module, désactivée par défaut, résultat différentiel surveillé et retour au moteur historique testé avant progression. |
| D-12 et référentiel B2.3-B | Inchangés / bloqué pour import officiel | Aucun changement de workflow; référence juridique et autorité géographique approuvées avant d’utiliser le nouveau référentiel pour les décisions d’accès. |

**Conclusion:** la caractérisation B2.6 est techniquement prête pour arbitrage de la matrice, mais B2.6 n’est pas close pour enforcement. Les tables B2.2 ne sont toujours pas une source d’autorisation. La Phase 3 n’est pas commencée.
