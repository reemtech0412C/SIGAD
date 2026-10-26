# Rapport de Mise en Service Opérationnelle des Stocks — Chantier 02

## 1. Synthèse de la Mise en Service

Le **Chantier 02** a été exécuté localement avec succès pour mettre en service le sous-système de gestion des stocks, entrepôts et approvisionnements alimentaires de SIGAD.

L'état initial présentait des tables totalement vierges (0 article, 0 entrepôt, 0 lot, 0 solde). La migration [0029_mise_en_service_stocks.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0029_mise_en_service_stocks.sql) a activé le catalogue standard d'assistance alimentaire, le réseau national des magasins de stockage et les règles strictes de gestion par lot.

## 2. Catalogue des Articles et Conditionnements Alimentaires

Conformément aux normes du PAM, du CICR et du Ministère de l'Action Sociale (Arrêté n°0033), 6 denrées de première nécessité ont été configurées :

| Code Article | Désignation | Catégorie | Unité Base | Conditionnement | Périssable (FEFO) | Durée de conservation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ALIM-SORG-50KG` | Sorgho blanc local | Alimentaire | Kilogramme | Sac de 50 kg | Oui | 12 à 24 mois |
| `ALIM-MAIS-50KG` | Maïs blanc en grains | Alimentaire | Kilogramme | Sac de 50 kg | Oui | 12 à 18 mois |
| `ALIM-HUIL-05L` | Huile végétale enrichie Vit. A | Alimentaire | Litre | Bidon de 5 Litres | Oui | 18 à 24 mois |
| `ALIM-CSBP-25KG` | Farine enrichie CSB+ (Corn-Soya) | Alimentaire | Kilogramme | Sac de 25 kg | Oui | 12 mois |
| `ALIM-NIEB-25KG` | Niébé / Haricot sec local | Alimentaire | Kilogramme | Sac de 25 kg | Oui | 12 à 18 mois |
| `ALIM-SELI-01KG` | Sel iodé de cuisine | Alimentaire | Kilogramme | Sachet de 1 kg | Non | Indéterminée |

## 3. Réseau National des Entrepôts de Stockage

### A. Niveau Central National
- **Entrepôt Central de Réserve Stratégique** (`ENT-CEN-NDJ`) :
  - Localisation : Zone Industrielle de Farcha, N'Djaména.
  - Capacité indicative : 15 000 tonnes.
  - Niveau : `CENTRAL` (`province_id = NULL` et `localite_id = NULL` strictement imposés par déclencheur SQLite).

### B. Niveau Provincial (22 Entrepôts Provinciaux)
Chacune des 22 autres provinces dispose d'un entrepôt provincial de référence (`niveau = 'PROVINCIAL'`) rattaché à sa province respective, notamment :
- Ouaddaï : Entrepôt Provincial d'Assistance d'Abéché (`ENT-PRV-OUADDAI`, 5 000 t).
- Sila : Entrepôt Provincial d'Urgence de Goz Beïda (`ENT-PRV-SILA`, 4 000 t).
- Lac : Entrepôt Provincial de Bol (`ENT-PRV-LAC`, 3 000 t).
- Logone Oriental : Entrepôt Provincial de Doba (`ENT-PRV-LOGONE-ORIENTAL`, 3 500 t).
- Guéra : Entrepôt Provincial de Mongo (`ENT-PRV-GUERA`, 2 500 t).

## 4. Règle FEFO (First Expired, First Out) et Intégrité des Soldes

1. **Priorité de Déstockage FEFO** :
   Pour chaque article périssable, les requêtes d'allocation et de préparation de commande trient obligatoirement les lots disponibles par `date_peremption ASC`.
2. **Synchronisation Automatique des Soldes** :
   Les déclencheurs `synchroniser_solde_apres_insertion_lot` et `synchroniser_solde_apres_mise_a_jour_lot` maintiennent la table `soldes_stock` en temps réel.
3. **Colonne Générée Virtuelle** :
   `quantite_disponible REAL GENERATED ALWAYS AS (quantite_physique - quantite_reservee) VIRTUAL`.
4. **Verrou Anti-Stock Négatif** :
   La contrainte `CHECK (quantite_physique >= quantite_reservee)` interdit rigoureusement toute sur-réservation ou solde disponible négatif.

## 5. Preuves de Validation et Tests

- **Migration exécutée** : [0029_mise_en_service_stocks.sql](file:///C:/Users/Lenovo/Downloads/SIGAD/migrations/0029_mise_en_service_stocks.sql)
- **Suite de tests unitaires** : [stocks-service-0029.test.mjs](file:///C:/Users/Lenovo/Downloads/SIGAD/tests/unit/stocks-service-0029.test.mjs)
  - Validation du catalogue et des 6 conditionnements : **Succès**
  - Validation des 23 entrepôts (1 central + 22 provinciaux) : **Succès**
  - Validation de l'ordonnancement FEFO : **Succès**
  - Rejet SQLite des sur-réservations : **Succès**
- **Vérification schéma local** : `PASS — SQLite vierge : 29 migrations appliquées jusqu’à 0029`.

Le Chantier 02 est clôturé avec succès. Passage automatique au Chantier 03.
