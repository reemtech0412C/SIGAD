# Sources et Traçabilité du Référentiel Territorial — SIGAD 2026

## 1. Inventaire des Sources Documentaires Officielles

Le référentiel territorial de SIGAD s'appuie sur une hiérarchie stricte de sources primaires et vérifiables :

| Source | Niveau territorial couvert | Réf. juridique / administrative | Statut dans SIGAD |
| :--- | :--- | :--- | :--- |
| **Journal Officiel de la République du Tchad** | 500 Communes (Urbaines et Rurales) | Loi Organique n°015/CNT/2024 du 31 juillet 2024 | Intégrées en table `communes`, statut `PROPOSE` pour revue et activation |
| **Arrêté Ministériel n°0033/PR/PM/MASSNAH/SG/2026** | Dispositif de distribution gratuite | Arrêté du 7 octobre 2026 | Cadre régissant le ciblage provincial et les délégations |
| **INSEED (Institut National de la Statistique, des Études Économiques et Démographiques)** | Provinces et Départements | Annuaire Statistique National du Tchad, Édition 2024 (Tableaux 1 et 2) | Référence pour la liste des 112 départements candidats |
| **INSEED — Section Sila** | Départements et communes de Sila | Annuaire 2024, Page 28 (texte indexé) | 5 départements de Sila (Abdi, Adé, Kimiti, Koukou-Angarana, Tissi) |
| **Décret n°002/PR/2024** | Organisation territoriale | Décret portant découpage administratif | Source de confrontation continue pour les départements candidats |

## 2. Distinction des Statuts de Validation

Pour garantir l'intégrité de la gouvernance républicaine et éviter toute prolifération d'unités administratives non certifiées, SIGAD impose un cloisonnement rigoureux par statut :

1. `VALIDE` :
   - Entités promulguées et validées par texte législatif ou réglementaire officiel sans ambiguïté.
   - Exemple : Les 23 provinces, la Ville de N'Djaména, ses 10 arrondissements municipaux.
2. `PROPOSE` / `A_VERIFIER` :
   - Données issues d'inventaires statistiques ou de textes récents en cours d'appropriation sur le terrain.
   - Exemple : Les 500 communes de la Loi 015/CNT/2024 et les 112 départements candidats issus de l'annuaire INSEED 2024.
   - Ces entités sont sélectionnables sous supervision mais ne sont pas présentées comme définitivement certifiées.
3. `REJETE` / `ARCHIVE` :
   - Anciennes circonscriptions redécoupées ou propositions de terrain écartées après contrôle contradictoire.

## 3. Fichiers Sources Disponibles dans le Répertoire de Projet
- `sources/referentiel-territorial/communes-loi-015-2024.csv` : Relecture intégrale des 500 communes.
- `sources/referentiel-territorial/controle-independant-facsimile-loi-015-2024.csv` : Contrôle qualité fac-similé JO.
- `sources/referentiel-territorial/departements-sila-inseed-2024.csv` : Rapprochement ciblé Sila INSEED 2024.
- `sources/referentiel-territorial/sigad_inventaire_territorial_provisoire_2026.csv` : 112 départements candidats.
