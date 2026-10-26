# SIGAD — Faisabilité de la carte du Tchad

**Statut :** faisabilité conditionnelle; aucune géométrie ni donnée n’a été importée.<br>
**Date d’examen :** 22 octobre 2026.<br>
**Décision proposée :** ne pas activer la carte en production avant validation de la source, des codes et du contrat de disponibilité statistique.

## État du dépôt

- Les tables et le seed portent 23 provinces. Le tableau de bord peut retourner des statistiques regroupées par province via `GET /api/rapports/tableau-de-bord`.
- Le tableau de bord affiche actuellement une comparaison provinciale sous forme de tableau; aucun composant cartographique ni paquet GeoJSON/Leaflet/MapLibre n’est présent dans `frontend/src` ou `package.json`.
- Le dépôt contient `sources/referentiel-territorial/communes-loi-015-2024.csv` et la migration d’import des communes. Le README du dossier source documente 500 communes (125 urbaines et 375 rurales) en état `PROPOSE`, avec 0 commune activée. Elles doivent rester exclues des choix opérationnels et de toute représentation laissant croire que le découpage est validé.
- Les sources locales précisent aussi que les départements, sous-préfectures, cantons, localités, quartiers, carrés et sites humanitaires ne sont pas encore importés et vérifiés. Ne pas fabriquer ces unités à partir des noms de communes rurales.
- Aucun fichier de frontières GeoJSON du Tchad n’a été trouvé dans les sources frontales examinées.

## Sources de géométrie candidates

| Source | Apport possible | Limite et contrôle obligatoire |
| --- | --- | --- |
| OCHA/HDX COD-AB « Chad » | Jeu de données administratif humanitaire avec Admin 1 annoncé à 23 provinces; métadonnées identifiant l’INSEED comme créateur; licence déclarée CC BY 3.0 IGO. [Fiche COD-AB Tchad](https://data.humdata.org/dataset/cod-ab-tcd) | Les métadonnées de la version consultée indiquent une géométrie initialement créée en 2012, revue le 7 janvier 2025 et considérée valable pour la communauté humanitaire au 12 février 2025; Admin 2 annonce 70 départements. Une revue récente ne signifie pas que le tracé ou la liste reflète le découpage légal de 2024. Télécharger la version exacte, lire sa note de méthode, vérifier son historique, ses P-codes, sa licence et chaque rattachement avant toute activation. |
| Loi organique n°015/CNT/2024 et décret de promulgation n°0298/PR/2024 | Source légale des 23 provinces et de la liste des communes décrite dans le dossier de transcription local | Le tableau de communes ne fournit pas à lui seul un polygone provincial. La loi et les noms d’entités ne prouvent pas une géométrie. Utiliser le texte pour contrôler les noms et l’organisation, pas pour inventer des coordonnées. [Journal officiel, juillet 2024](https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf). |
| INSEED, Annuaire statistique national 2024 | Référence de rapprochement statistique et piste vers les tableaux administratifs compilés par le ministère de l’Intérieur | Le tableau 1 mentionne un instantané antérieur à la loi organique postérieure; il n’établit pas à lui seul les noms/rattachements actuels. Le dossier local retient notamment 124 départements et 489 unités communales dans cet instantané, contre le décompte communal légal postérieur de 500. [Annuaire INSEED 2024](https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024). |
| Loi n°022/CNT/2024 du 14 octobre 2024, statut de N’Djaména | Source récente pour le statut particulier de la ville et les communes d’arrondissement | Ne fournit pas dans les pages examinées les limites ou la liste actuelle des quartiers; compléter avec les textes ou jeux officiels applicables. [Copie FAOLEX](https://faolex.fao.org/docs/pdf/Cha231669.pdf). |

La spécification OCHA décrit les niveaux administratifs, les codes et les obligations de métadonnées COD-AB; elle recommande une revue périodique de ces jeux. Un nombre égal de 23 provinces ne suffit donc pas à certifier la correspondance. [Spécification OCHA COD-AB](https://github.com/OCHA-DAP/hdx-cod-ab-spec), [guide de révision et diffusion OCHA](https://humanitarian.atlassian.net/wiki/spaces/imtoolbox/pages/2557378679/Administrative+Boundaries+COD-AB).

## Contrôle de correspondance requis

Avant l’emploi d’un GeoJSON, produire un manifeste versionné et révisable, conservant au minimum : fournisseur, titre, version, date de validité, date de téléchargement, licence, URL, empreinte SHA-256, CRS, niveau, code fournisseur, libellé source, identifiant SIGAD rapproché, règle de rapprochement et décision humaine.

Le contrôle doit établir :

1. 23 enregistrements Admin 1, univoques et sans doublon géométrique;
2. correspondance des noms du jeu avec les 23 noms et identifiants de `provinces`;
3. correspondance P-code vers code SIGAD explicitement documentée, ou absence reconnue de code compatible;
4. appartenance géométrique, validité des polygones, CRS et limites frontalières;
5. changements de découpage et dates d’effet comparés aux textes officiels;
6. licence et attribution affichables;
7. absence de commune `PROPOSE` et de donnée nominative dans le paquet client.

Le nom approximativement ressemblant ou l’ordre des lignes n’est jamais une clé de jointure acceptable. Si les codes ne correspondent pas, maintenir une table de correspondance revue, avec source et approbation; ne pas renommer les identifiants D1 pour faire entrer la carte.

## Bibliothèque et stratégie de rendu

| Choix | Avantages | Coûts et risques | Avis |
| --- | --- | --- | --- |
| React Leaflet + Leaflet | Liaison React documentée, GeoJSON et interactions cartographiques courantes; adapté à un petit nombre de polygones provinciaux | Leaflet est une dépendance distincte; ajouter ses types en TypeScript; gérer dimensions, CSS et cycle de vie; un TileLayer ajoute réseau, conditions d’utilisation et attribution | Choix adapté si les utilisateurs ont besoin de zoom, déplacement et info-bulles. Charger avec `React.lazy`; commencer par des polygones sans tuiles distantes. [Documentation React Leaflet](https://react-leaflet.js.org/docs/start-introduction/), [installation/types](https://react-leaflet.js.org/docs/start-installation/). |
| SVG contrôlé ou rendu D3-Geo | Aucune tuile, rendu local, légende et style directement contrôlables, petit domaine de 23 entités | Projection, zoom, gestion clavier et info-bulles à concevoir; coût d’implémentation et test d’accessibilité | Option la plus légère si le besoin se limite à une carte choroplèthe des provinces; évaluer un SVG accessible avant d’ajouter une carte interactive complète. |
| MapLibre/vector tiles | Bon potentiel si le besoin futur inclut de nombreuses couches, zooms et tuiles vectorielles | Complexité et poids non justifiés par 23 polygones; choix de serveur de tuiles et de licence à résoudre | Non recommandé pour le premier pilote. |

Un fond de carte raster n’est pas nécessaire pour comparer des indicateurs provinciaux. Éviter un fournisseur de tuiles externe au premier lancement : les appels révèlent des métadonnées d’usage, dépendent du réseau terrain et impliquent une attribution/conditions d’utilisation. Prévoir un rendu SVG statique de remplacement si le module différé ne charge pas.

## Statistiques, confidentialité et contrat API

L’API actuelle `/api/rapports/tableau-de-bord` calcule les lignes de province et limite les colonnes aux agrégats. Les rapports appliquent le périmètre utilisateur côté service; les délégués doivent recevoir uniquement leur province issue de leur session. L’administration centrale autorisée peut consulter l’agrégat national. Le filtrage React n’est jamais une mesure de sécurité.

**Écart de contrat :** pour les provinces sans opération, l’API produit des valeurs numériques nulles converties en zéro, sans indicateur distinct de disponibilité historique. Avant une carte, ajouter dans une évolution API ultérieure un état non ambigu (`DISPONIBLE`, `AUCUNE_OPERATION_SUR_PERIODE`, `DONNEES_NON_DISPONIBLES`) ou une sémantique équivalente approuvée. Une province vide ne doit pas être colorée comme si la donnée était observée et égale à zéro.

Les critères de calcul doivent indiquer l’unité et l’intervalle. Les totaux de stocks et de distributions tous articles confondus n’ont pas d’unité commune; utiliser des séries par article/unité et des résumés métier interprétables. Aucun nom de ménage, code de ménage, numéro personnel, lieu précis d’un bénéficiaire ou point de remise individuelle ne doit être transmis à la carte.

## Décision de faisabilité

**Carte de 23 provinces : faisabilité technique conditionnelle.** L’API fournit déjà des agrégats de province sécurisés pour les tableaux, mais ni géométrie locale approuvée ni contrat API séparant le zéro observé de l’absence de données ne sont établis. La carte ne peut donc pas être considérée prête à être activée.

**Communes et niveaux inférieurs : non activables.** Les 500 communes sont encore en état de proposition/relecture et les autres niveaux du dossier national restent non vérifiés. Ne pas les afficher comme référentiel opérationnel.

**Porte de sortie avant le pilote :** approuver le jeu géographique et sa licence; livrer le manifeste et la correspondance vérifiée; décider du contrat de disponibilité API; faire passer les essais RBAC/isolation; fournir attribution, fallback accessible et validation mobile. Aucune donnée ou migration n’est créée par la présente étude.

