PRAGMA foreign_keys = ON;

-- Migration 0029 : Mise en service du catalogue des articles et conditionnements de référence
-- Cette migration opérationnelle introduit STRICTEMENT les articles et conditionnements officiels.
-- Les entrepôts réels doivent être physiquement et administrativement confirmés par arrêté.
-- Les entrepôts et stocks de démonstration sont isolés dans tests/fixtures/demonstration-stocks.sql.

-- 1. Catalogue standard des conditionnements d'aide humanitaire
INSERT INTO conditionnements (id, libelle, unite_base_id, facteur_conversion) VALUES
('cond-sac-50kg', 'Sac de 50 kg', 'unit-kg', 50.0),
('cond-sac-25kg', 'Sac de 25 kg', 'unit-kg', 25.0),
('cond-bidon-5l', 'Bidon de 5 litres', 'unit-litre', 5.0),
('cond-bouteille-1l', 'Bouteille de 1 litre', 'unit-litre', 1.0),
('cond-carton-24', 'Carton de 24 pièces', 'unit-piece', 24.0),
('cond-sachet-1kg', 'Sachet de 1 kg', 'unit-kg', 1.0)
ON CONFLICT(id) DO NOTHING;

-- 2. Catalogue standard des articles alimentaires et nutritionnels
INSERT INTO articles (id, code_article, designation, categorie_id, unite_mesure_id, conditionnement_id, perissable, actif) VALUES
('art-sorgho-50kg', 'ALIM-SORG-50KG', 'Sorgho blanc local (Sac de 50 kg)', 'cat-alimentaire', 'unit-sac', 'cond-sac-50kg', 1, 1),
('art-mais-50kg', 'ALIM-MAIS-50KG', 'Maïs blanc en grains (Sac de 50 kg)', 'cat-alimentaire', 'unit-sac', 'cond-sac-50kg', 1, 1),
('art-huile-5l', 'ALIM-HUIL-05L', 'Huile végétale enrichie Vitamine A (Bidon de 5L)', 'cat-alimentaire', 'unit-litre', 'cond-bidon-5l', 1, 1),
('art-csb-25kg', 'ALIM-CSBP-25KG', 'Farine enrichie CSB+ (Sac de 25 kg)', 'cat-alimentaire', 'unit-sac', 'cond-sac-25kg', 1, 1),
('art-niebe-25kg', 'ALIM-NIEB-25KG', 'Niébé / Haricot sec local (Sac de 25 kg)', 'cat-alimentaire', 'unit-sac', 'cond-sac-25kg', 1, 1),
('art-sel-1kg', 'ALIM-SELI-01KG', 'Sel iodé de cuisine (Paquet de 1 kg)', 'cat-alimentaire', 'unit-kg', 'cond-sachet-1kg', 0, 1)
ON CONFLICT(id) DO NOTHING;
