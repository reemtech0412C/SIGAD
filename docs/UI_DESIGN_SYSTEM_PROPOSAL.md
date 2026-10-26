# SIGAD — Proposition de système de design

**Statut :** proposition d’audit, non implémentée.<br>
**Référence :** audit UI/UX du 22 octobre 2026.<br>
**But :** définir les choix visuels et les composants à valider avant toute modification du client.

## Direction visuelle

Adopter la clarté de Tabler pour les écrans administratifs sans reproduire son thème par défaut. Le rendu SIGAD doit rester institutionnel, lisible en environnement de terrain, sobre en animation, et identifiable par son logotype bleu marine.

Le fichier fourni est un logotype horizontal transparent, sans phrase de signature. Le proposer dans l’en-tête clair, la connexion et les documents. Le fond clair assure le contraste naturel du bleu marine. Dans une barre latérale sombre, réserver un espace clair au logo; ne pas appliquer un filtre CSS destructif ni fabriquer une version blanche. Le descriptif déjà utilisé sous SIGAD est « Système intégré de gestion des aides et des distributions »; il peut rester une description de produit jusqu’à validation d’un slogan distinct.

## Tokens proposés

| Token | Valeur / règle | Usage |
| --- | --- | --- |
| `--sigad-fond` | `#F6F8FB` | Fond général de l’espace sécurisé. |
| `--sigad-surface` | `#FFFFFF` | Cartes, menus et panneaux. |
| `--sigad-principal` | `#1D3557` | Navigation, titres principaux, actions primaires. |
| `--sigad-secondaire` | `#3B82B8` | Liens, accent, sélection et graphiques. |
| `--sigad-succes` | `#15803D` | Validation réussie; vérifier le contraste avec le blanc. |
| `--sigad-attente` | `#B45309` | Action ou traitement en attente. |
| `--sigad-erreur` | `#B91C1C` | Erreur et alerte critique uniquement. |
| Bordure | `#DDE5EE`, 1 px | Séparateurs et contours légers. |
| Rayon | 6 px champs, 10 px cartes, 14 px surfaces de connexion | Coins modérés et cohérents. |
| Ombre | Ombre de survol minimale; aucune ombre décorative permanente forte | Priorité à la séparation par surfaces et bordures. |
| Espacement | Échelle de 4, 8, 12, 16, 24, 32 et 40 px | Grille prévisible entre champs et sections. |
| Largeur de contenu | Maximum indicatif 1 440 px; largeur fluide en dessous | Tables et formulaires sur grands écrans. |
| Seuils | 560 px, 800 px, 1 024 px et 1 280 px | Mobile, tablette, petit bureau et bureau large; ajuster par contenu. |
| Mouvement | 120–180 ms pour changement d’état; aucun mouvement indispensable | Respecter `prefers-reduced-motion`. |
| Couches | menu 10, barre fixe 20, dialogue 40, notification 50 | Éviter les superpositions concurrentes. |

Les états doivent combiner texte, icône et couleur. Le rouge ne sert pas à décorer un KPI ordinaire. Les graphiques utilisent une palette accessible qui reste distincte en niveaux de gris et ne dépend pas uniquement de la couleur.

## Typographie et langues

### Français

- DM Sans : corps 400, navigation 500, titres de cartes 600, titre de page 600–700.
- Corps de référence : 14–15 px, interligne 1,5; tables denses sans descendre sous une taille lisible sur mobile.
- Fallback : `Arial, sans-serif` ou pile système maîtrisée.

### Arabe, si la portée linguistique est validée

- IBM Plex Sans Arabic : corps 400, navigation et boutons 500, titres 600.
- Fallback : Noto Sans Arabic puis pile système.
- Mettre à jour `lang` et `dir` sur le document au changement de langue; préférer les propriétés CSS logiques (`margin-inline`, `padding-inline`, `inset-inline-start`) aux règles gauche/droite.
- Garder en LTR les identifiants, codes, nombres techniques, mots de passe et références de document au moyen d’attributs ciblés `dir="ltr"`.
- Vérifier les séparateurs décimaux, dates, filtres, graphiques et cellules de tableau dans les deux directions.

Les deux familles sont disponibles sous la licence SIL Open Font License 1.1 dans leurs sources officielles. Une distribution locale des WOFF2 est possible avec le texte de licence et l’avis d’auteur. Déclarer les graisses réellement utilisées, les sous-ensembles Unicode adaptés et `font-display: swap`; fournir un fallback système afin qu’une police non chargée ne bloque pas l’interface. [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans), [IBM Plex Sans Arabic](https://github.com/IBM/plex/tree/master/packages/plex-sans-arabic).

Le paquet npm IBM Plex Sans Arabic documente la télémétrie IBM. Éviter d’ajouter ce paquet sans décision de confidentialité et de conformité; préférer des fichiers web officiels auto-hébergés avec leur licence, si la distribution locale est confirmée. Le présent document ne télécharge pas ces polices.

**Point d’arbitrage :** le support arabe/RTL proposé ici est en conflit avec la règle antérieure d’interface strictement française. Il reste une option de conception tant que le propriétaire du produit n’a pas explicitement modifié cette règle.

## Architecture de composants

| Composant | Responsabilité proposée | Limites à préserver |
| --- | --- | --- |
| `AppShell` | Barre latérale, en-tête, zone principale et états de navigation | Ne décide pas des permissions serveur; masque uniquement les fonctions déjà autorisées par rôle. |
| `Sidebar` | Navigation des modules autorisés, repliable sur bureau, tiroir clavier sur mobile | État accessible avec `aria-expanded`, libellés et focus conservé. |
| `Header` | Logotype, titre de module, compte actif et déconnexion | Aucun secret MFA ou jeton visible. |
| `Breadcrumbs` | Repère de module et de sous-vue | N’introduit pas une route métier nouvelle. |
| `KpiCard` | Valeur, unité, période, état de disponibilité et définition courte | Source toujours liée à un champ API réel; absence distincte de zéro. |
| `DataTable` | En-têtes, tri explicitement disponible, lignes, états vide/chargement/erreur | Pagination reste serveur; listes sensibles restent minimales. |
| `FilterBar` | Filtres de période, province, partenaire, aide, statut et localité | Une province envoyée par le navigateur ne remplace jamais le périmètre de session. |
| `FormField` | Libellé visible, contrôle, aide, erreur de validation | Association `label`/`id`, erreurs annoncées et valeurs non perdues. |
| `Dialog` | Confirmation d’action réversible ou affichage secondaire | Focus piégé et rendu accessible; confirmer les mutations sensibles. |
| `Notification` | Succès, avertissement et erreur | `role="status"` ou `role="alert"` selon gravité; aucun message métier fictif. |
| `StatusBadge` | État d’opération et sévérité | Texte et forme toujours présents, couleur secondaire. |
| `Chart` | Séries agrégées explicitement définies | Légende, résumé tabulaire, périodes et unités affichés. |
| `ProvinceMap` | Géométrie approuvée et statistiques agrégées | Pas de nom de ménage, de coordonnées de bénéficiaire ni d’appel national depuis un rôle provincial. |
| `LoadingEmptyError` | États cohérents de chargement, absence de résultat et erreur | Distinguer « aucune opération » de « données non disponibles ». |

Construire ces composants à l’intérieur de l’application existante. Les écrans actuels gardent les services API, fonctions de validation et contrôles CSRF. Aucune dépendance de routeur n’est nécessaire pour extraire le shell; si les chemins profonds sont souhaités plus tard, traiter leur impact comme une décision séparée.

## Recommandation d’intégration Tabler

1. Ajouter Tabler en local seulement dans une prévisualisation de design, sans CDN ni JavaScript global.
2. Importer le CSS Tabler retenu et comparer son préflight au Tailwind v4 existant. Encadrer les règles de l’application avec des noms de composants SIGAD, éviter les mêmes classes utilitaires pour deux systèmes différents, et ne retirer Tailwind qu’après inventaire des usages.
3. Utiliser React/TypeScript pour l’état, les dialogues, la navigation et les formulaires; prendre dans Tabler les motifs visuels et les classes qui restent compréhensibles.
4. Choisir un seul jeu d’icônes SVG — Tabler Icons est le choix naturel — et charger uniquement les icônes utilisées.
5. Charger les modules de carte et de graphique de manière différée. Éviter les plugins de démonstration qui embarquent des bibliothèques non utilisées.
6. Vérifier les licences transitives de tout module ajouté. Tabler core et Tabler Icons sont MIT; cela ne transfère pas automatiquement la licence de chaque plugin tiers. [Références Tabler](https://docs.tabler.io/ui/getting-started/references).

## Critères visuels et d’accessibilité

- Navigation complète au clavier, focus visible, ordre de tabulation prévisible, intitulés explicites pour les icônes seules.
- Contraste vérifié pour le texte normal, les badges, les placeholders et les états désactivés; les placeholders ne remplacent pas les libellés.
- Tables lisibles à 320 px par défilement horizontal local ou présentation adaptée, sans faire défiler toute la page latéralement.
- Formulaires utilisables par clavier et lecteur d’écran; erreurs reliées aux champs.
- Réduction des animations avec `prefers-reduced-motion`.
- Tests manuels sur 320, 390, 768, 1 024 et 1 440 px; thèmes clair puis sombre si le thème sombre est retenu.
- Pas de nom de bénéficiaire dans les cartes, graphiques ou info-bulles de la carte.
- Captures de référence des parcours, puis régression visuelle sur connexion, rapport, stock et distribution.

