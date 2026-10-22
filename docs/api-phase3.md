# API de gestion des partenaires et des bénéficiaires

Toutes les routes sont sous `/api/gestion`. Elles exigent une session authentifiée; les opérations qui changent des données exigent `X-CSRF-Token`. Les listes sont paginées avec `limite` (1 à 100) et `decalage` (0 ou plus).

## Référentiels

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/referentiels` | Catégories de population et critères de vulnérabilité de référence. |

## Partenaires

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/partenaires?limite=25&decalage=0` | Recherche paginée. Une délégation voit les partenaires validés et ses propres propositions. |
| `GET` | `/partenaires/:partenaireId` | Détail et rôles du partenaire; une proposition d’une autre province est masquée. |
| `POST` | `/partenaires` | Création centrale ou proposition provinciale avec au moins un rôle. Le nom est unique. |
| `POST` | `/partenaires/:partenaireId/validation` | Décision centrale `VALIDE` ou `INACTIF`; refusée aux délégués. |

## Ménages

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/menages?limite=25&decalage=0` | Registre paginé et filtrable; pour un délégué, la province vient de sa session. |
| `GET` | `/menages/:menageId?limite=25&decalage=0` | Détail et page de membres; un ménage hors province est masqué. |
| `POST` | `/menages` | Enregistrement d’un ménage avec vérification de ses relations territoriales. |
| `POST` | `/menages/importations` | Import JSON (`{ "menages": [...] }`), fichier CSV UTF-8 ou classeur Excel `.xlsx` en champ multipart `fichier`; 500 ménages et 1 Mo au maximum. Pour Excel, seul le premier onglet est lu, les formules sont refusées et les dates Excel numériques sont converties. |

Colonnes CSV prises en charge : `province_id`, `departement_id`, `sous_prefecture_id`, `commune_id`, `localite_id`, `arrondissement_id`, `quartier_id`, `carre_id`, `site_humanitaire_id`, `nom_chef_menage`, `sexe_chef`, `nombre_personnes`, `telephone`, `categorie_population_code`, `criteres_vulnerabilite`, `date_enregistrement`. Les six colonnes `departement_id`, `nom_chef_menage`, `sexe_chef`, `nombre_personnes`, `categorie_population_code` et `date_enregistrement` sont obligatoires. Les valeurs de `criteres_vulnerabilite` sont séparées par `|`. Les colonnes inconnues et les en-têtes répétés sont refusés. Une délégation ne transmet pas `province_id`; le serveur prend la province de sa session.

Les doublons possibles sont signalés dans `signalements_doublons` et ne sont jamais fusionnés automatiquement. Un déclencheur D1 signale aussi un doublon qui apparaît entre deux imports concurrents; les ménages impliqués restent en vérification et une paire ne produit qu’un signalement. Chaque importation est écrite en un lot atomique avec son journal d’audit.

## Listes bénéficiaires

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/listes-beneficiaires?limite=25&decalage=0` | Listes paginées, limitées à la province de session pour un délégué. |
| `POST` | `/listes-beneficiaires` | Création en état `BROUILLON`; un délégué ne peut pas fournir une province. |
| `GET` | `/listes-beneficiaires/:listeId/menages?limite=25&decalage=0` | Ménages inscrits, avec contrôle du périmètre de la liste. |
| `POST` | `/listes-beneficiaires/:listeId/inscriptions` | Ajout de ménages actifs de la même province; les doublons d’inscription sont refusés. |
| `GET` | `/listes-beneficiaires/:listeId/export` | Export CSV en français, émis par pages de 100 lignes et limité à la province de session d’un délégué. |

## Signalements de doublons

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/signalements-doublons?limite=25&decalage=0` | File paginée; un délégué ne voit que sa province. |
| `POST` | `/signalements-doublons/:signalementId/decision` | Décision `CONFIRME_DISTINCT` ou `CONFIRME_DOUBLON`; l’action est auditée. |

Les contrôles de province sont effectués dans chaque gestionnaire et dans les déclencheurs D1 qui protègent les relations ménage–territoire, ménage–liste, partenaire–rôle et signalement–ménage. Les réponses d’erreur applicatives sont en français.
