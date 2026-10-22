# Dossier de preuve du référentiel territorial

## Transcription communale en relecture

Le fichier `communes-loi-015-2024.csv` est la transcription contrôlable de l’article 3 de la Loi organique n°015/CNT/2024, publiée au *Journal officiel de la République du Tchad*, édition spéciale « Lois organiques », juillet 2024, 65e année, n°07. La copie consultée porte le décret de promulgation n°0298/PR/2024 du 16 août 2024.

| Élément | Preuve retenue |
| --- | --- |
| Provinces | Tableau de l’article 3, pages imprimées 20 à 24; l’article annonce 23 provinces. |
| Communes urbaines provinciales | Les 114 entrées urbaines numérotées 1 à 114, tableau de l’article 3, pages imprimées 20 à 24. |
| Communes rurales | Les 375 noms de la colonne « Commune rurale », tableau de l’article 3, pages imprimées 20 à 23. |
| N’Djaména | La ligne 125 de la page imprimée 24 désigne la Ville et les 1er à 10e arrondissements; la loi n°022/CNT/2024 du 14 octobre 2024, article 2, confirme une commune de la ville et des communes d’arrondissement. |
| Date d’effet | 31 juillet 2024, date de signature prévue à l’article 9. La promulgation est datée du 16 août 2024. |
| Rattachement stocké | Chaque commune est reliée uniquement à la province qui l’encadre dans le tableau. Aucun département ni aucune sous-préfecture n’est inféré de l’alignement des colonnes. |

Le décompte obtenu est 114 communes urbaines provinciales + 11 communes urbaines de N’Djaména + 375 communes rurales = 500. Il concorde avec le total légal de 125 communes urbaines et 375 communes rurales. Les identifiants D1 des 23 provinces ont été comparés au seed : 23 correspondances trouvées. Les formes publiées « MAYO-KEDBI EST/OUEST » sont conservées et rapprochées des provinces D1 « Mayo-Kebbi-Est/Ouest » sans réécriture du texte juridique. Les codes `LO015-COM-001` à `LO015-COM-500` sont des clés locales de transcription, pas des codes promulgués.

La transcription normalise la casse et les espaces pour l’affichage. L’extraction PDF présente des ambiguïtés OCR dans certaines graphies; le CSV demande une relecture visuelle du fac-similé avant activation. Les 500 lignes sont importées dans D1 en état `PROPOSE` : aucun nom de commune n’est exposé dans les choix opérationnels avant validation centrale. Chaque ligne conserve sa source, son article, sa page imprimée, sa date d’effet, le rattachement provincial documenté et son état de relecture.

## Références pour les autres niveaux

1. **INSEED, Annuaire statistique national du Tchad 2024**, publié en septembre 2025, tableau 1, page imprimée 18. Il récapitule les chiffres attribués au Ministère de l’Intérieur pour l’ordonnance n°002/PR/2024 : 23 provinces, 124 départements et 489 unités communales. C’est un instantané de la restructuration de 2024; il précède la date d’effet de la Loi organique n°015/CNT/2024. Il sert de piste de rapprochement, pas de preuve de noms ou de rattachements actifs après cette loi.
2. **INSEED, Annuaire statistique national du Tchad 2024**, tableau 2 « Circonscriptions administratives », page imprimée 18 et pages suivantes. Le tableau est attribué à une compilation du Ministère de l’Intérieur. Les lignes et leurs éventuels rattachements doivent être relus dans le PDF source et rapprochés des textes applicables avant tout chargement opérationnel.
3. **Loi n°022/CNT/2024 du 14 octobre 2024 portant statut particulier de la ville de N’Djaména**, articles 1 et 2. La loi établit le statut particulier de la ville et la structure composée de la commune de la ville et des communes d’arrondissement; elle ne fournit pas dans les pages examinées les noms des quartiers par arrondissement.
4. **Ordonnance n°11-005 du 10 février 2011** relative aux communes d’arrondissement de N’Djaména. Ses listes de quartiers sont historiques; elles ne sont pas chargées dans le référentiel opérationnel sans vérification de leur maintien après la loi de 2024.

### Limites documentaires et décision d’import

- La base D1 initiale contient 23 provinces, mais aucune commune, aucun département, aucune sous-préfecture ni aucune localité.
- La migration `0011_import_communes_loi_015.sql` importe les 500 communes en état de relecture, avec les seules relations de province explicitement portées par le tableau légal. Les communes rurales restent du type `RURALE`; aucun nom rural n’est transformé en département ou sous-préfecture.
- État du référentiel : provinces 23 importées et 23 rapprochées; communes 500 importées et 500 liées à la province documentée, 0 activée avant relecture visuelle; départements 0 importé et 0 nom vérifié (l’INSEED donne un total historique de 124); sous-préfectures 0; cantons 0; localités 0; quartiers 0; carrés 0; sites humanitaires 0.
- Aucun département, aucune sous-préfecture, aucun canton, aucune localité, aucun quartier ni aucun site humanitaire n’est activé par ce dossier. Ces niveaux restent « non vérifiés/importés : 0 » jusqu’à la confrontation de leurs noms et rattachements aux textes primaires en vigueur.
- L’Annuaire INSEED 2024 mentionne une restructuration ultérieure des unités administratives par l’ordonnance n°002/PR/2024. Les versions, la ratification, les rectificatifs éventuels et la date d’effet de chaque liste infra-provinciale doivent être établis avant migration. Le chiffre de 489 ne remplace pas le décompte communal de 500 imposé par la loi organique postérieure.
- Les quartiers de N’Djaména publiés en 2011 sont exclus des choix opérationnels tant que leur actualité n’est pas confirmée.

## Sources consultées

- Journal officiel, Loi organique n°015/CNT/2024, décret n°0298/PR/2024 : https://transitionautchad.online/wp-content/uploads/2025/07/Journal-Special-Lois-Organiques-Juillet-2024.pdf
- INSEED, Annuaire statistique national du Tchad 2024 : https://www.inseed.td/index.php/component/jdownloads/send/42-annuaires-statistiques-nationales/598-annuaire-statistique-national-du-tchad-2024
- Loi n°022/CNT/2024, copie FAOLEX : https://faolex.fao.org/docs/pdf/Cha231669.pdf
- Ordonnance n°11-005 du 10 février 2011, notice et texte : https://legitchad.org/textes/ordonnances/ordonnance-11-005-2011-02-10-pr/

Consultation documentaire effectuée le 22 octobre 2026. Les sources statistiques et légales sont citées avec leur date propre afin de ne pas mélanger les découpages successifs. Le total de 124 départements est un chiffre statistique de l’instantané antérieur; il ne représente ni 124 noms vérifiés ni 124 lignes importées.
