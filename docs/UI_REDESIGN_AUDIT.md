# SIGAD — Audit préalable à la refonte UI/UX

**Date de l’audit :** 22 octobre 2026<br>
**Projet examiné :** SIGAD v3.0 — React 19, TypeScript, Vite 8, Cloudflare Workers, D1 et R2<br>
**Décision :** `AUDIT COMPLETED` — conception documentée; aucune refonte n’a été appliquée.<br>
**Périmètre de preuve :** inspection statique du dépôt et des tests présents. Aucun test, serveur, migration ou déploiement n’a été lancé pendant cette mission.

## Résumé

La base technique convient à une modernisation progressive : l’application est déjà écrite en React et TypeScript, les modules métier existent, l’API de rapports renvoie des indicateurs réels, et les vues utilisent déjà plusieurs états de chargement, erreurs et listes paginées. Tabler peut fournir une base visuelle cohérente sans changer de framework.

La refonte ne doit pas démarrer par une conversion globale des pages. Les principaux points à traiter sont l’absence de shell et de composants visuels partagés, l’identité SIGAD actuellement représentée par une lettre, l’absence de graphiques et de carte, le manque d’internationalisation, et le chevauchement potentiel entre Tailwind et les styles de Tabler.

Le logo joint est un logotype horizontal bleu marine sur fond transparent. Il ne contient pas de slogan. L’application affiche actuellement le descriptif « Système intégré de gestion des aides et des distributions » sous le nom SIGAD. Ce descriptif peut être conservé comme sous-titre de produit dans la proposition; il ne doit pas être présenté comme faisant partie du fichier logo ni être remplacé par un slogan inventé. Le logo foncé doit d’abord être utilisé sur une surface claire; un visuel inversé exige une variante approuvée.

## État constaté

| Domaine | État dans le dépôt | Conséquence pour la refonte |
| --- | --- | --- |
| Client | `frontend/src/App.tsx`, composants React par module, styles dans `frontend/src/styles.css` | Conserver React, TypeScript et les composants métier existants. |
| Navigation | État local dans `App.tsx`; les boutons changent de module sans routeur de pages | Extraire le shell et la navigation en composants sans modifier les autorisations ni les transitions métier. |
| Shell partagé | Pas de composant `AppShell`; en-tête et barre latérale répétés pour les vues du propriétaire et des autres rôles | Créer une seule structure visuelle alimentée par le rôle et les modules autorisés. |
| Marque | Le formulaire de connexion et la barre latérale affichent une lettre « S »; `frontend/public/sigad.svg` contient un emblème distinct | Remplacer ces emplacements par le logotype fourni après validation de la maquette; ne pas écraser l’actif fourni. |
| Couleurs et typographie | Fond `#F8FAFC`, bleu `#0F3D6E`, accent `#1E56A0`, pile Inter/Public Sans/Arial | Les valeurs diffèrent du système demandé (`#F6F8FB`, `#1D3557`, `#3B82B8`); organiser une migration par variables CSS. |
| Styles | Tailwind CSS 4 est importé; les composants visibles reposent surtout sur des classes CSS métier | Tabler apporte une seconde base CSS. Vérifier les collisions de préflight et les dépendances réelles avant de garder les deux bases à long terme. |
| Vues | Bénéficiaires, distributions, stocks, approvisionnements, contrôle, rapports et comptes | Le périmètre fonctionnel existe déjà; le travail doit rester visuel et préserver les appels et contrôles. |
| Rapports | 15 types de rapport, catalogue, filtres, aperçu paginé, export et archives | Les données et le parcours de rapport peuvent alimenter le pilote de tableau de bord. |
| Graphiques et carte | Aucun paquet de visualisation ou de cartographie n’est déclaré; le tableau de bord affiche des cartes KPI et des tableaux | Les graphiques et la carte sont des ajouts; ils ne doivent pas être dessinés avec des données d’exemple présentées comme réelles. |
| Internationalisation | Le document HTML fixe `lang="fr"` et `dir="ltr"`; les chaînes de l’interface sont intégrées aux composants | Aucun catalogue français/arabe ni changement dynamique de direction n’a été trouvé. |
| Responsive | Règles aux seuils 900, 800 et 560 px; la barre latérale devient une rangée de navigation sur petit écran | Une base responsive existe, mais aucune preuve de test visuel n’a été produite ici. La rangée doit être revue pour les libellés longs. |
| PWA et API | Vite PWA met en cache les ressources de l’application; les appels API utilisent des chemins relatifs et `same-origin` | Conserver l’API sur l’origine de l’application et ne pas mettre en cache les données métier avec le shell statique. |
| Tests existants | Fichiers Vitest, intégration Worker/D1 et scénarios Playwright présents | Leur présence ne prouve pas leur réussite dans cette mission; les nouveaux critères UI doivent être ajoutés à la phase de validation. |

Fichiers examinés notamment : `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/src/services/api.ts`, `frontend/src/components/gestion/TableauRapports.tsx`, `frontend/vite.config.ts`, `tailwind.config.js`, `package.json`, `backend/src/routes/rapports.routes.ts`, `backend/src/services/rapports.service.ts`, `shared/validations/rapports.ts` et les tests sous `tests/`.

## Compatibilité de Tabler

Tabler est un kit d’interface HTML/CSS construit sur Bootstrap 5. Il fournit des motifs de tableaux de bord, de navigation, de formulaires et de tableaux; la documentation présente des variantes RTL et sombre. Le cœur est sous licence MIT. [Documentation Tabler](https://docs.tabler.io/ui/getting-started), [composants](https://docs.tabler.io/ui/components), [dépôt officiel](https://github.com/tabler/tabler).

**Recommandation :** intégrer les styles de Tabler de façon locale et progressive, tout en gardant les vues SIGAD comme composants React écrits en TypeScript. Construire des composants SIGAD autour des classes visuelles retenues. Ne pas migrer vers un autre framework, ne pas convertir tout Tabler en une nouvelle bibliothèque de composants, et ne pas charger son JavaScript global pour les interactions que React gère déjà.

Le dépôt utilise Tailwind CSS 4 et son préflight. Une importation globale complète de Tabler peut redéfinir des styles de base, notamment les contrôles de formulaire, les tables, les polices et les marges. Il faut comparer le CSS produit et tester l’ordre des imports dans une prévisualisation isolée avant de choisir entre une couche Tabler limitée et le remplacement progressif des utilitaires. Aucun changement de dépendance n’est autorisé par le présent audit.

Pour les icônes, préférer un seul jeu SVG cohérent; Tabler Icons est sous licence MIT et propose des paquets React. Éviter l’ajout simultané de plusieurs familles d’icônes. Les plugins Tabler sont facultatifs; chaque dépendance conserve sa licence propre. Examiner en particulier la licence du paquet de graphique retenu avant intégration. [Références des dépendances Tabler](https://docs.tabler.io/ui/getting-started/references), [Tabler Icons](https://github.com/tabler/tabler-icons).

## Indicateurs : données et règles réellement disponibles

`GET /api/rapports/tableau-de-bord` appelle `lireTableauDeBordRapports`. Les filtres admis sont `province_id`, `date_debut`, `date_fin`, `partenaire_id`, `nature_aide`, `statut`, `localite_id` et `distribution_id`. Le service applique le périmètre de l’utilisateur avant les requêtes; le rôle et l’isolation restent côté Worker. Le tableau de bord retourne des indicateurs, une évolution mensuelle, des lignes provinciales et des mesures D1. Les résultats mensuels sont plafonnés à 12 mois et la comparaison provinciale à 100 lignes, alors que le référentiel actif attendu compte 23 provinces.

| KPI demandé | Définition et unité | Source et calcul actuels | Périmètre / disponibilité |
| --- | --- | --- | --- |
| Nombre d’approvisionnements | Opérations centrales distinctes | `approvisionnements_centraux`, filtrés par leurs destinations et les filtres communs | API existante; national pour l’administration centrale, borné par destination pour un délégué. |
| Nombre de distributions | Opérations provinciales distinctes | `distributions_provinciales` selon la période, la province, l’état et les autres filtres | API existante; bornée au rôle et à la province de session. La période repose sur `date_prevue`. |
| Ménages ciblés | Nombre de ménages distincts sur l’ensemble des distributions filtrées | `menages_distribution`, `menages`, `COUNT(DISTINCT menage_id)` | API existante; dédoublonnage entre opérations. |
| Ménages servis | Ménages distincts ayant au moins un état `SERVI` dans le périmètre | Agrégation par ménage et indicateur maximal de service | API existante; l’état servi prévaut sur un état partiel observé ailleurs dans la sélection. |
| Ménages partiellement servis | Ménages sans état `SERVI`, avec au moins un état `PARTIELLEMENT_SERVI` | Agrégation par ménage dans `menages_distribution` | API existante; catégorie distincte du nombre de ménages servis. |
| Personnes assistées — ménages uniques | Somme des personnes enregistrées dans les ménages uniques servis ou partiellement servis | `menages.nombre_personnes` après regroupement par ménage | Disponible; mesure un nombre de personnes déclarées dans les ménages concernés, pas nécessairement des personnes individuelles dédupliquées. |
| Personnes assistées — occurrences | Nombre de lignes ménage-distribution avec un service complet ou partiel, et somme correspondante des `nombre_personnes` | `menages_distribution` joint à `menages` | Disponible comme cumul d’interventions; un ménage aidé lors de plusieurs opérations est compté plusieurs fois. L’étiquette doit l’expliciter. |
| Quantités expédiées | Somme des quantités d’articles expédiées | `lignes_expedition.quantite_expediee` | API existante; afficher l’unité ou séparer les articles, car additionner des unités hétérogènes n’est pas un volume métier interprétable. |
| Quantités réceptionnées | Somme des quantités acceptées | `lignes_reception_provinciale.quantite_acceptee` | API existante; distincte de la quantité physiquement reçue, endommagée ou manquante. |
| Quantités distribuées | Somme des quantités remises | `lignes_remise.quantite_remise` | API existante; somme brute multi-articles à contextualiser par article/unité dans les rapports détaillés. |
| Stocks disponibles | Quantités bonnes, non périmées et non réservées liées aux soldes | `soldes_stock` et `lots_stock`, qualité `BON`, date d’expiration et réservations déduites | API existante. L’agrégat global mélange des unités différentes; préférer un détail par article et unité pour la décision opérationnelle. |
| Opérations clôturées | Distributions `CLOTUREE_CENTRAL` et approvisionnements `CLOTUREE` | Tables d’opérations réelles | API existante; les types restent mêlés dans le KPI agrégé. |
| Opérations en attente | Distributions et approvisionnements dont l’état n’est pas l’état de clôture | Tables d’opérations réelles | API existante; une segmentation par type et état améliore l’interprétation. |
| Écarts non résolus | Réceptions avec rapprochement `ECART_OUVERT` | `receptions_provinciales.statut_rapprochement` | API existante, soumise aux filtres et au rôle. |
| Activités récentes | Flux chronologique transverse des actions et événements | Aucun endpoint de flux unifié identifié dans le tableau de bord | Écart à enregistrer si le tableau de bord doit afficher une activité récente consolidée; ne pas inventer de flux. Les journaux d’audit ne sont pas automatiquement un flux métier utilisateur. |
| Évolution des distributions | Distributions mensuelles et ménages/personnes associés | `date_prevue` et `menages_distribution`; groupe par mois | API renvoie 12 points au plus. Les dates de remise réelle doivent être distinguées de la date prévue avant d’intituler la série « distributions réalisées ». |
| Validations en attente | Nombre de validations de bénéficiaires, référentiels ou opérations ouvertes | Plusieurs tables de validation existent, mais aucun compteur unifié de dashboard n’a été identifié | Écart pour un indicateur global; ne pas additionner des états différents sans définition métier approuvée. |

**Limite d’interprétation :** le dashboard renvoie certaines provinces sans opération via `COALESCE(..., 0)`. Cette valeur ne distingue pas encore, dans le contrat de réponse, une absence de données d’une activité véritablement égale à zéro. Le tableau cartographique doit avoir un état explicite « données indisponibles » avant mise en service.

## Sécurité et risques à préserver

- Garder l’authentification, MFA/TOTP, CSRF, RBAC, les filtres d’isolation et les appels existants aux services. Toute refonte de navigation doit conserver la vérification serveur, même si elle masque des modules visuellement.
- Les rapports de bénéficiaires et les listes d’émargement sont marqués sensibles dans les définitions de rapport. Éviter les noms de bénéficiaires sur le dashboard ou la carte; conserver les permissions d’export et de téléchargement côté API.
- Les filtres de province visibles dans React ne sont pas une barrière de sécurité. L’API doit continuer à dériver le périmètre provincial de la session.
- Ne pas mettre les réponses `/api/*` dans Workbox. Le cache PWA actuellement configuré porte sur les ressources statiques du build; garder ce comportement.
- Les fonctions d’export et les opérations de stock/distribution ne doivent pas être réécrites dans le cadre d’un changement de présentation.
- La demande d’un support arabe RTL complet entre en conflit avec la règle de produit précédemment approuvée, qui réservait l’interface au français. Le présent audit décrit la faisabilité; aucune chaîne ni comportement de langue n’est changé. La portée linguistique devra être confirmée avant l’étape B.

## Décisions proposées et limites

1. Confirmer Tabler comme référence de présentation, pas comme migration de framework.
2. Utiliser le logotype joint comme marque officielle sur les surfaces claires. Conserver provisoirement le descriptif déjà présent en sous-titre; demander séparément un texte de slogan si une signature différente est souhaitée.
3. Conserver les opérations, filtres et permissions actuels; traiter les KPI sans endpoint comme écarts backend distincts.
4. Ne pas mettre en œuvre la carte tant que la géométrie, les codes provinciaux et le statut des données ne sont pas validés.
5. Aucun code, dépendance, migration D1, permission ou ressource Cloudflare n’a été modifié par cet audit.

## Sources techniques

- [Documentation Tabler UI](https://docs.tabler.io/ui/getting-started) — architecture Bootstrap, thème, composants.
- [Composants Tabler](https://docs.tabler.io/ui/components) — exemples HTML/CSS destinés à être réutilisés dans un front-end.
- [Références de licences Tabler](https://docs.tabler.io/ui/getting-started/references) — licences distinctes des bibliothèques tierces.
- [Tabler Icons](https://github.com/tabler/tabler-icons) — jeu d’icônes SVG.
- [DM Sans, source Google Fonts](https://github.com/google/fonts/tree/main/ofl/dmsans) — métadonnées et licence de la famille.
- [IBM Plex Sans Arabic, dépôt IBM](https://github.com/IBM/plex/tree/master/packages/plex-sans-arabic) — fichiers web, poids et conditions de redistribution.
- [React Leaflet](https://react-leaflet.js.org/docs/start-introduction/) — liaisons React au moteur Leaflet.
- [OCHA COD-AB](https://github.com/OCHA-DAP/hdx-cod-ab-spec) — spécification des niveaux et des identifiants de jeux de frontières humanitaires.

