# Phase 11 — Audit du référentiel territorial INSEED et juridique

Consultation documentaire : 22–23 octobre 2026 · Vérification locale du schéma : 23 octobre 2026

| Indicateur | État |
|---|---|
| `INSEED_REFERENCE` | `PARTIAL` |
| `TERRITORIAL_ACTIVATION` | `BLOCKED` |
| `REMOTE_CHANGES` | `NONE` |

## Décision

Les nombres publiés par les sources ne décrivent pas tous le même état ni la même date. La loi organique n°015/CNT/2024 fournit la référence retenue pour le total des communes et leur rattachement à une province. L’Annuaire INSEED 2024 fournit un instantané attribué à l’ordonnance n°002/PR/2024, antérieur à l’entrée en vigueur indiquée par la loi n°015. OCHA/HDX est conservé uniquement comme référentiel cartographique humanitaire. Ces sources ne permettent pas de déclarer homologués les polygones OCHA ni de charger les départements, sous-préfectures, cantons ou villages avec des relations exhaustives et actuelles.

Les 500 communes transcrites restent soumises à relecture du fac-similé et en état `PROPOSE`; aucune commune n’est présentée comme vérifiée, approuvée ou active dans les choix opérationnels. Aucun nom n’a été supprimé et aucun identifiant historique n’a été remplacé. Cette phase n’a modifié ni les migrations ni D1.

## Matrice des sources et des décomptes

| Niveau | Source et millésime | Nombre affirmé par la source | État SIGAD vérifié | Rattachements établis |
|---|---|---:|---|---|
| Province | Loi organique n°015/CNT/2024, art. 3, pages imprimées 20–24; effet prévu à partir de la signature du 31/07/2024; décret n°0298/PR/2024 du 16/08/2024 | 23 | 23 lignes D1 et 23 correspondances de noms normalisés dans `matching-cod-ab-adm1-ui-map-1.csv`. Identifiants de rattachement SIGAD conservés. | Loi → noms des provinces; correspondance des codes OCHA documentée séparément. La comparaison des noms ne valide pas les frontières. |
| Commune urbaine | Loi n°015, art. 3, tableau imprimé pp. 20–24 | 125 au total : 114 communes urbaines provinciales et 11 communes d’arrondissement de N’Djaména dans la transcription contrôlée | 125 lignes comprises dans le CSV des 500 communes, `PROPOSE`; relecture visuelle exhaustive des graphies non terminée : 0/125 approuvée. | Commune → province d’après le tableau. Aucun lien vers département ou sous-préfecture créé. |
| Commune rurale | Loi n°015, art. 3, tableau imprimé pp. 20–23 | 375 | 375 lignes comprises dans le CSV des 500 communes, `PROPOSE`; relecture visuelle exhaustive des graphies non terminée : 0/375 approuvée. | Commune → province d’après le tableau. Le nom rural n’est pas utilisé comme nom de département ou de sous-préfecture. |
| Département | INSEED, *Annuaire statistique national du Tchad 2024*, tableau 1, p. imprimée 18; OCHA/HDX COD-AB Chad | INSEED rapporte historiquement 124 (ordonnance n°002/PR/2024); l’édition OCHA consultée contient 70 entités ADM2 | 0 nom de département importé et vérifié dans SIGAD. Aucun décompte légal postérieur reconstitué. | Aucun mapping nominatif actuel validé entre ces décomptes et les communes de la loi n°015. |
| Sous-préfecture | Loi organique n°014/CNT/2024, dispositions sur les communes rurales; Annuaire INSEED 2024, tableau 2 et pages suivantes | Aucun total actuel confirmé par une liste juridique et un millésime concordants dans les pièces examinées | 0 importée, 0 vérifiée | La loi n°014 décrit la relation structurelle entre commune rurale et sous-préfecture; aucune table de correspondance nominative complète n’a été validée pour les lignes SIGAD. |
| Canton | Loi n°014/CNT/2024 pour la structure des collectivités rurales; listes nominatives non établies dans les sources contrôlées | Aucun décompte nominatif vérifiable | 0 importé, 0 vérifié | Aucun canton ni rattachement de canton n’a été inventé. |
| Village, ferrick, campement, quartier, carré, site humanitaire | Loi n°014 pour les catégories rurales/urbaines; textes locaux ou listes INSEED actuelles exhaustives non réunis | Aucun inventaire actuel exhaustif vérifié | 0 importé au titre de cette revue | Aucun rattachement créé. Les listes de quartiers issues de l’ordonnance de 2011 restent historiques. |

### État de la transcription et des contrôles D1

| Contrôle | Résultat |
|---|---:|
| Provinces de la loi comparées aux identifiants SIGAD | 23/23 correspondances de nom |
| Codes `P-code` OCHA comparés aux clés de carte | 23/23 dans le fichier de rapprochement; ce sont des codes OCHA, pas des codes promulgués |
| Communes transcrites de l’article 3 dans `communes-loi-015-2024.csv` et migration 0011 | 500 |
| Communes rattachées uniquement à la province indiquée dans le tableau | 500 |
| Communes dont la graphie a reçu la relecture visuelle complète du PDF | 0/500 |
| Communes approuvées ou offertes par le sélecteur opérationnel | 0/500 |
| Départements, sous-préfectures, cantons, villages/quartiers/squares validés dans cette revue | 0 |

La migration existante 0011 stocke les communes avec `statut_validation='PROPOSE'`. Son indicateur `actif=1` ne suffit pas à les rendre sélectionnables : le endpoint de référence exige aussi `statut_validation='VALIDE'`. Les tests de schéma rapportent 500 propositions et aucune commune opérationnellement activée. Le modèle actuel ne représente pas les quatre états distincts `IMPORTÉ → VÉRIFIÉ → APPROUVÉ → ACTIF`; il distingue le statut de validation existant et un indicateur d’activité. Il n’est pas étendu sans conception et approbation séparées.

## Écarts, millésimes et limites

1. **489 contre 500 communes.** Le tableau 1 de l’Annuaire INSEED 2024 attribue 489 unités communales à la restructuration de l’ordonnance n°002/PR/2024. La loi organique n°015 postérieure annonce 500 communes (125 urbaines et 375 rurales). Les totaux ne doivent pas être fusionnés; l’écart de 11 n’est pas résolu en ajoutant ou retirant des lignes.
2. **124 contre 70 départements.** INSEED indique 124 départements dans son instantané statistique. La notice COD-AB consultée indique 70 entités ADM2. Le paquet OCHA précise que les frontières ADM ont été créées/éditées le 04/09/2012, que les données ont été déclarées valables pour l’usage humanitaire le 12/02/2025 et relues le 30/10/2025. Cela ne fournit pas une liste de 124 départements et ne tranche pas leur statut juridique actuel.
3. **OCR de l’article 3.** Le CSV conserve 500 clés locales `LO015-COM-001` à `LO015-COM-500`, qui ne sont pas des codes officiels. Les différences d’accents, de graphie et quelques ambiguïtés d’extraction exigent une comparaison visuelle ligne par ligne.
4. **Rattachements infra-provinciaux.** Le tableau de la loi n°015 permet le lien commune → province; il ne justifie pas les associations à un département ou à une sous-préfecture simplement d’après l’ordre des colonnes ou le nom.
5. **N’Djaména.** La loi n°022/CNT/2024 du 14/10/2024 précise le statut de la ville et ses communes d’arrondissement. Les quartiers de la liste de 2011 ne sont pas réputés actuels sans texte ou source récente.
6. **Limites géographiques.** Les 23 noms et les codes OCHA sont comparables; les polygones ne sont pas homologués par la revue. La licence HDX fournie dans les métadonnées est CC BY-IGO; elle ne constitue pas une approbation juridique tchadienne.

## Fichiers de preuve utilisés

- `sources/referentiel-territorial/README.md` : provenance, décomptes et limites.
- `sources/referentiel-territorial/communes-loi-015-2024.csv` : transcription des 500 lignes et statuts de relecture.
- `sources/referentiel-territorial/matching-cod-ab-adm1-ui-map-1.csv` : rapprochement des 23 provinces et identifiants OCHA; aucune validation de frontières.
- `sources/referentiel-territorial/ocha-cod-ab/metadata-hdx-package.json` et les ressources conservées du paquet COD-AB.
- `migrations/0011_import_communes_loi_015.sql` : import historique des propositions; non modifiée pendant Phase 11.

## Plan de validation et de migration

1. Relire à deux personnes la transcription des 500 entrées sur les pages imprimées du Journal officiel et consigner chaque correction avec page, ligne et source; ne pas remplacer les clés locales déjà référencées.
2. Obtenir les listes officielles datées et les actes applicables pour départements, sous-préfectures et cantons; établir les liens uniquement à partir de ces preuves.
3. Comparer les modèles de référence avant d’implémenter une machine d’état en quatre étapes. Préparer alors, si nécessaire, une migration additive, des index et des contrôles de non-régression; ne pas réécrire 0001–0022.
4. Tester l’import et les contraintes sur D1 locale neuve et sur une copie locale de schéma antérieur; vérifier les clés historiques, l’isolation provinciale et la visibilité des seuls enregistrements validés.
5. Soumettre séparément l’approbation des noms/relations et celle des frontières. Aucun changement distant ni activation n’est inclus dans ce rapport.

## Sources

- INSEED, [Annuaire statistique national du Tchad 2024](https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024), publié en septembre 2025; tableaux 1 et 2, page imprimée 18 et suivantes.
- Journal officiel, copie consultée de l’édition spéciale « Lois organiques », juillet 2024, 65e année, n°07 : [PDF contenant les lois organiques n°014 et n°015/CNT/2024](https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf). Les pages de l’édition portent le décret de promulgation n°0298/PR/2024 du 16 août 2024. Le portail du Journal officiel n’a pas fourni une copie exploitable pendant la consultation; la provenance de la copie est donc indiquée.
- [Loi n°022/CNT/2024 du 14 octobre 2024 sur la ville de N’Djaména](https://faolex.fao.org/docs/pdf/Cha231669.pdf), copie FAOLEX utilisée uniquement pour la structure de la ville.
- [OCHA/HDX — Chad Subnational Administrative Boundaries, COD-AB](https://data.humdata.org/dataset/cod-ab-tcd), métadonnées locales du paquet récupéré : version 01; ADM1=23, ADM2=70; licence CC BY-IGO; frontières créées/éditées le 4 septembre 2012; validité humanitaire déclarée le 12 février 2025; revue datée du 30 octobre 2025; métadonnées modifiées le 14 août 2026.
- Ordonnance n°11-005 du 10 février 2011, [notice et texte](https://legitchad.org/textes/ordonnances/ordonnance-11-005-2011-02-10-pr/), référence historique exclue de l’activation.

## Statut

| Décision finale | État | Motif |
|---|---|---|
| `INSEED_REFERENCE` | `PARTIAL` | Les 23 provinces et le total légal de 500 communes sont rapprochés, mais la transcription de chaque nom n’a pas été relue visuellement et les niveaux infra-provinciaux n’ont pas de liste actuelle et de liens suffisamment prouvés. |
| `TERRITORIAL_ACTIVATION` | `BLOCKED` | 0 commune approuvée/activée; départements, sous-préfectures et cantons non chargés. |
| `D1_REMOTE` | `NONE` | Aucune migration ou écriture distante effectuée; les migrations historiques restent inchangées. |

## Complément Phase 11.1 — contrôle ligne à ligne et textes récents

**Recherche documentaire arrêtée au 23 octobre 2026.** Cette revue distingue la concordance de transcription, la preuve juridique d’un rattachement et la validation nécessaire à l’activation. Aucun élément ci-dessous ne modifie D1.

### Comparaison des 500 communes

Les 500 lignes du CSV de preuve ont été comparées une à une aux insertions de `migrations/0011_import_communes_loi_015.sql`, en normalisant casse, accents Unicode, espaces et séparateurs sans écraser la graphie transcrite. Chaque ligne source contient une clé locale, la province citée, le type, la référence à l’article 3, la page imprimée, la date d’effet et l’état de relecture.

| Contrôle | Résultat | Interprétation |
|---|---:|---|
| Lignes CSV / communes proposées en migration | 500 / 500 | Concordance entre deux transcriptions, pas certification indépendante du fac-similé. |
| Codes locaux distincts | 500 / 500 | Aucun code interne dupliqué; les codes `LO015-COM-*` ne sont pas des codes administratifs promulgués. |
| Communes urbaines / rurales | 125 / 375 | Concorde avec les totaux de l’article 3. |
| Divergences après normalisation CSV ↔ migration | 0 | Pas de divergence mécanique de nom, province ou type entre les deux fichiers. |
| Relectures visuelles complètes du fac-similé dans cette phase | 0 / 500 | L’exactitude de chaque transcription reste à confirmer visuellement. |
| Communes approuvées ou activées dans SIGAD | 0 / 500 | Les choix opérationnels restent fermés. |

Quatre groupes d’homonymes interprovinciaux ont été vérifiés; ils ne sont ni des doublons de clé ni des erreurs de rattachement et restent séparés :

| Nom | Première entrée | Seconde entrée | Décision |
|---|---|---|---|
| Aradib | `LO015-COM-041`, Batha, rurale, p. 20 | `LO015-COM-417`, Sila, rurale, p. 23 | Homonymie interprovinciale; clés conservées. |
| Haraze | `LO015-COM-049`, Batha, urbaine, p. 20 | `LO015-COM-392`, Salamat, urbaine, p. 23 | Homonymie interprovinciale; clés conservées. |
| Bao | `LO015-COM-106`, Ennedi-Est, urbaine, p. 21 | `LO015-COM-225`, Logone-Occidental, rurale, p. 22 | Homonymie interprovinciale; types conservés. |
| Bekamba | `LO015-COM-267`, Mandoul, rurale, p. 22 | `LO015-COM-346`, Moyen-Chari, rurale, p. 23 | Homonymie interprovinciale; clés conservées. |

**Classement :** 500 concordances CSV/migration après normalisation; 0 divergence mécanique; 4 homonymies interprovinciales documentées; 0/500 validations visuelles indépendantes. La preuve de chaque ligne reste le tableau de l’article 3 de la Loi organique n°015/CNT/2024, avec la page imprimée enregistrée dans le CSV et la date d’effet transcrite au 31/07/2024. Les 500 lignes gardent l’état `A_RELIRE_VISUELLEMENT_AVANT_ACTIVATION`.

### Sources administratives les plus récentes repérées

| Niveau | Source / date | Décompte ou fait étayé | État et limite |
|---|---|---|---|
| Provinces et communes autonomes | Loi organique n°015/CNT/2024, art. 3, 31/07/2024; décret n°0298/PR/2024 du 16/08/2024 | 23 provinces; 500 communes, soit 125 urbaines et 375 rurales. | Base du décompte des collectivités autonomes. Elle ne donne pas les liens commune → département/sous-préfecture. Les graphies des 500 lignes restent à relire visuellement. |
| Réorganisation administrative | Loi n°017/AN-SENAT/2025 du 02/12/2025 ratifiant l’ordonnance n°002/PR/2024 du 05/07/2024; décret n°026/PR/2026 du 16/01/2026, *Journal officiel*, janvier 2026, p. imprimée 4 | La ratification de la restructuration des unités administratives est confirmée. | La copie consultée confirme le titre et la ratification, mais l’annexe nominative complète et les rattachements après restructuration n’ont pas été vérifiés ici. Aucune ligne n’est déduite. |
| Principes d’organisation administrative | Loi n°014/AN-SENAT/2025 du 19/12/2025 ratifiant l’ordonnance n°005/PR/2025 du 30/01/2025; décret n°036/PR/2026, janvier 2026, p. imprimée 4 | Cadre juridique des principes fondamentaux d’organisation administrative du territoire. | Le décret de ratification n’est pas un inventaire territorial. Le texte intégral et ses annexes doivent être obtenus et rapprochés avant import. |
| Départements | INSEED, *Annuaire statistique national du Tchad 2024*, publié en septembre 2025, tableau 1, p. imprimée 18 | 124 départements dans l’instantané attribué à l’ordonnance n°002/PR/2024. | Total statistique daté, non preuve de 124 noms actuels après ratification. SIGAD : 0 nom importé/vérifié. OCHA COD-AB indique 70 ADM2 historiques/humanitaires, pas 70 unités légales actuelles. |
| Sous-préfectures | Même annuaire, tableau 1, p. imprimée 18 | Formulation publiée : « 489 sous-préfectures érigées en communes (urbaines et rurales) ». | Ce n’est pas un total confirmé de sous-préfectures actuelles distinctes. Ne pas comparer comme unités homogènes aux 500 communes de la loi n°015 sans lire les définitions et annexes. SIGAD : 0 rattachement nominatif importé/vérifié. |
| Cantons | Décrets n°2680 et n°2681/PR/PM/MATD/2025, *Journal officiel*, octobre 2025, p. imprimée 7 | Le décret n°2680 abroge l’annulation antérieure de la création de Miski; le n°2681 retient « Donza Galala à Miski » dans le département de l’Emi-Koussi, province du Tibesti. | Changement nominatif/rattachement documenté, mais aucun total ni répertoire complet actuel n’a été établi. SIGAD : 0 canton importé/vérifié. |
| RGPH-3 | INSEED, collecte achevée le 06/08/2026; résultats préliminaires en préparation annoncés le 31/08/2026 | Collecte récente en cours de traitement. | Aucune liste territoriale exhaustive publiée n’a été vérifiée; des données de collecte ne remplacent pas un acte de délimitation. |

La recherche ciblée au 23/10/2026 n’a pas identifié d’Annuaire statistique national 2025 contenant un nouveau tableau complet des rattachements. L’Annuaire 2024 publié en septembre 2025 reste la plus récente publication annuelle INSEED repérée pour ces tableaux précis, et non nécessairement la publication INSEED la plus récente tous thèmes confondus.

### Relations administratives et écarts de définition

Les articles 82–84 de la Loi organique n°014/CNT/2024 définissent des relations structurelles : communes urbaines organisées notamment en arrondissements, quartiers et carrés; communes rurales correspondant à des sous-préfectures et structurées autour de cantons, villages ou ferricks selon les conditions du texte. Ils ne constituent ni une liste exhaustive datée des noms, ni une table complète de rattachement pour les 500 communes, 124 départements et sous-préfectures.

Le total INSEED `489` est décrit comme des « sous-préfectures érigées en communes » dans le contexte de l’ordonnance n°002; le total légal `500` décrit les communes autonomes dans la loi organique n°015. Les concepts et textes sont datés et distincts. L’écart reste à résoudre par la confrontation des textes et annexes; il ne justifie ni l’ajout ni le retrait de onze entrées.

### Sources ajoutées

- Loi organique n°015/CNT/2024 et loi organique n°014/CNT/2024, copie de l’édition spéciale du *Journal officiel*, juillet 2024, n°07 : [PDF consulté](https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf). Le portail officiel demeure l’autorité de publication.
- INSEED, [Annuaire statistique national du Tchad 2024](https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024), publié septembre 2025, tableaux 1–2.
- *Journal officiel*, janvier 2026, décrets n°026/PR/2026 et n°036/PR/2026, copie consultée : [PDF](https://transitionautchad.online/wp-content/uploads/2026/02/JOURNAL-OFFICIEL-DE-LA-REPUBLIQUE-JANVIER-2026.pdf). L’extraction confirme les ratifications; les annexes détaillées n’ont pas été validées dans cette revue.
- *Journal officiel*, octobre 2025, décrets n°2680 et n°2681/PR/PM/MATD/2025, pp. imprimées 7–8 : [édition sur le domaine du Journal officiel](https://journalofficiel.td/storage/v1/object/public/archiva/journaux/2025/10/1764959752502-0u0ckxfe65pr.pdf). L’index officiel confirme le renommage et le rattachement; l’ouverture directe du PDF a expiré lors de ce contrôle.
- [Portail officiel du Journal officiel tchadien](https://journalofficiel.td/fr), catalogue des éditions par année/mois.
- INSEED, [ANAD — variable département d’une enquête 2018/2019](https://anad.inseed.td/index.php/catalog/18/variable/F2/V3?name=departement) et [notice RGPH2 2008–2009](https://anad.inseed.td/index.php/catalog/26/study-description) : sources historiques, exclues de l’activation actuelle.

### Décision Phase 11.1 — référentiel

| Domaine | État |
|---|---|
| Rapprochement des communes | 500/500 comparées mécaniquement, 0 divergence normalisée, 4 homonymies interprovinciales documentées, 0/500 relectures visuelles : **PARTIAL**. |
| Provinces et limites | 23/23 noms rapprochés; cela n’homologue pas les polygones OCHA : **PARTIAL pour les frontières**. |
| Départements | Total INSEED de 124 daté, nomenclature/rattachements actuels non vérifiés, 0 importé : **PARTIAL**. |
| Sous-préfectures | 489 décrit dans l’instantané INSEED, sans liste actuelle autonome vérifiée, 0 importée : **PARTIAL**. |
| Cantons | Un changement juridique nominatif récent vérifié, répertoire complet non établi, 0 importé : **PARTIAL**. |
| Activation D1 | Aucune écriture, migration, validation ou activation; approbation administrative toujours requise : **BLOCKED**. |

**INSEED_REFERENCE : PARTIAL. TERRITORIAL_ACTIVATION : BLOCKED. REMOTE_CHANGES : NONE.** L’étape suivante nécessite les textes intégraux et annexes de l’ordonnance n°002/PR/2024 et de l’ordonnance n°005/PR/2025, puis la relecture indépendante des 500 noms. Toute modification de schéma ou activation sera soumise séparément à approbation.

