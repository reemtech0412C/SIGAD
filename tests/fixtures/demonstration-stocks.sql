PRAGMA foreign_keys = ON;

-- DONNÉES DE DÉMONSTRATION ET DE TEST — ISOLEES HORS DES MIGRATIONS OPERATIONNELLES
-- Ces entrepôts et lots fictifs sont exclusivement destinés aux bancs de test locaux
-- et ne doivent JAMAIS être importés dans une base de données de production ou de staging.

-- 1. Entrepôt Central de Démonstration (N'Djaména)
INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id, localite_id, adresse_detaillee, capacite_indicative, responsable_nom, responsable_telephone, actif) VALUES
('ent-central-ndjamena', 'ENT-CEN-NDJ', 'Entrepôt Central de Réserve Stratégique — N''Djaména', 'CENTRAL', NULL, NULL, 'Zone Industrielle de Farcha, N''Djaména', '15 000 tonnes', 'Coordonnateur Magasins Centraux (Démo)', '+23566000001', 1)
ON CONFLICT(id) DO NOTHING;

-- 2. Entrepôts Provinciaux de Démonstration
INSERT INTO entrepots (id, code_entrepot, nom, niveau, province_id, localite_id, adresse_detaillee, capacite_indicative, responsable_nom, responsable_telephone, actif) VALUES
('ent-prov-batha', 'ENT-PRV-BATHA', 'Entrepôt Provincial d''Assistance — Batha (Ati)', 'PROVINCIAL', 'prov-batha', NULL, 'Chef-lieu provincial (Ati)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-borkou', 'ENT-PRV-BORKOU', 'Entrepôt Provincial d''Assistance — Borkou (Faya-Largeau)', 'PROVINCIAL', 'prov-borkou', NULL, 'Chef-lieu provincial (Faya-Largeau)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-chari-baguirmi', 'ENT-PRV-CHARI-BAGUIRMI', 'Entrepôt Provincial d''Assistance — Chari-Baguirmi (Massenya)', 'PROVINCIAL', 'prov-chari-baguirmi', NULL, 'Chef-lieu provincial (Massenya)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-ennedi-est', 'ENT-PRV-ENNEDI-EST', 'Entrepôt Provincial d''Assistance — Ennedi-Est (Amdjarass)', 'PROVINCIAL', 'prov-ennedi-est', NULL, 'Chef-lieu provincial (Amdjarass)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-ennedi-ouest', 'ENT-PRV-ENNEDI-OUEST', 'Entrepôt Provincial d''Assistance — Ennedi-Ouest (Fada)', 'PROVINCIAL', 'prov-ennedi-ouest', NULL, 'Chef-lieu provincial (Fada)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-guera', 'ENT-PRV-GUERA', 'Entrepôt Provincial d''Assistance — Guéra (Mongo)', 'PROVINCIAL', 'prov-guera', NULL, 'Chef-lieu provincial (Mongo)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-hadjer-lamis', 'ENT-PRV-HADJER-LAMIS', 'Entrepôt Provincial d''Assistance — Hadjer-Lamis (Massakory)', 'PROVINCIAL', 'prov-hadjer-lamis', NULL, 'Chef-lieu provincial (Massakory)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-kanem', 'ENT-PRV-KANEM', 'Entrepôt Provincial d''Assistance — Kanem (Mao)', 'PROVINCIAL', 'prov-kanem', NULL, 'Chef-lieu provincial (Mao)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-lac', 'ENT-PRV-LAC', 'Entrepôt Provincial d''Assistance — Lac (Bol)', 'PROVINCIAL', 'prov-lac', NULL, 'Chef-lieu provincial (Bol)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-logone-occidental', 'ENT-PRV-LOGONE-OCCIDENTAL', 'Entrepôt Provincial d''Assistance — Logone-Occidental (Moundou)', 'PROVINCIAL', 'prov-logone-occidental', NULL, 'Chef-lieu provincial (Moundou)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-logone-oriental', 'ENT-PRV-LOGONE-ORIENTAL', 'Entrepôt Provincial d''Assistance — Logone-Oriental (Doba)', 'PROVINCIAL', 'prov-logone-oriental', NULL, 'Chef-lieu provincial (Doba)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-mandoul', 'ENT-PRV-MANDOUL', 'Entrepôt Provincial d''Assistance — Mandoul (Koumra)', 'PROVINCIAL', 'prov-mandoul', NULL, 'Chef-lieu provincial (Koumra)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-mayo-kebbi-est', 'ENT-PRV-MAYO-KEBBI-EST', 'Entrepôt Provincial d''Assistance — Mayo-Kebbi-Est (Bongor)', 'PROVINCIAL', 'prov-mayo-kebbi-est', NULL, 'Chef-lieu provincial (Bongor)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-mayo-kebbi-ouest', 'ENT-PRV-MAYO-KEBBI-OUEST', 'Entrepôt Provincial d''Assistance — Mayo-Kebbi-Ouest (Pala)', 'PROVINCIAL', 'prov-mayo-kebbi-ouest', NULL, 'Chef-lieu provincial (Pala)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-moyen-chari', 'ENT-PRV-MOYEN-CHARI', 'Entrepôt Provincial d''Assistance — Moyen-Chari (Sarh)', 'PROVINCIAL', 'prov-moyen-chari', NULL, 'Chef-lieu provincial (Sarh)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-ouaddai', 'ENT-PRV-OUADDAI', 'Entrepôt Provincial d''Assistance — Ouaddaï (Abéché)', 'PROVINCIAL', 'prov-ouaddai', NULL, 'Chef-lieu provincial (Abéché)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-salamat', 'ENT-PRV-SALAMAT', 'Entrepôt Provincial d''Assistance — Salamat (Am Timan)', 'PROVINCIAL', 'prov-salamat', NULL, 'Chef-lieu provincial (Am Timan)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-sila', 'ENT-PRV-SILA', 'Entrepôt Provincial d''Assistance — Sila (Goz Beïda)', 'PROVINCIAL', 'prov-sila', NULL, 'Chef-lieu provincial (Goz Beïda)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-tandjile', 'ENT-PRV-TANDJILE', 'Entrepôt Provincial d''Assistance — Tandjilé (Laï)', 'PROVINCIAL', 'prov-tandjile', NULL, 'Chef-lieu provincial (Laï)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-tibesti', 'ENT-PRV-TIBESTI', 'Entrepôt Provincial d''Assistance — Tibesti (Bardaï)', 'PROVINCIAL', 'prov-tibesti', NULL, 'Chef-lieu provincial (Bardaï)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-wadi-fira', 'ENT-PRV-WADI-FIRA', 'Entrepôt Provincial d''Assistance — Wadi-Fira (Biltine)', 'PROVINCIAL', 'prov-wadi-fira', NULL, 'Chef-lieu provincial (Biltine)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1),
('ent-prov-barh-el-gazel', 'ENT-PRV-BARH-EL-GAZEL', 'Entrepôt Provincial d''Assistance — Barh-El-Gazel (Moussoro)', 'PROVINCIAL', 'prov-barh-el-gazel', NULL, 'Chef-lieu provincial (Moussoro)', '3 000 à 5 000 tonnes', 'Responsable des Stocks Provinciaux (Démo)', '+23566000000', 1)
ON CONFLICT(id) DO NOTHING;

-- 3. Lots de stock initiaux pour tests
INSERT INTO lots_stock (
    id, numero_lot, article_id, entrepot_id, province_id, source_type,
    date_peremption, etat_qualite, quantite_initiale, quantite_physique, quantite_reservee
) VALUES
('lot-sorg-cen-01', 'LOT-SORG-2026-001', 'art-sorgho-50kg', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', '2027-03-31', 'BON', 5000, 5000, 0),
('lot-sorg-cen-02', 'LOT-SORG-2026-002', 'art-sorgho-50kg', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', '2027-10-31', 'BON', 5000, 5000, 0),
('lot-mais-cen-01', 'LOT-MAIS-2026-001', 'art-mais-50kg', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', '2027-05-31', 'BON', 4000, 4000, 0),
('lot-huil-cen-01', 'LOT-HUIL-2026-001', 'art-huile-5l', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', '2027-06-30', 'BON', 2500, 2500, 0),
('lot-csbp-cen-01', 'LOT-CSBP-2026-001', 'art-csb-25kg', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', '2027-04-30', 'BON', 3000, 3000, 0),
('lot-nieb-cen-01', 'LOT-NIEB-2026-001', 'art-niebe-25kg', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', '2027-08-31', 'BON', 2000, 2000, 0),
('lot-seli-cen-01', 'LOT-SELI-2026-001', 'art-sel-1kg', 'ent-central-ndjamena', NULL, 'STOCK_INITIAL', NULL, 'BON', 10000, 10000, 0),
('lot-sorg-od-01', 'LOT-SORG-OD-001', 'art-sorgho-50kg', 'ent-prov-ouaddai', 'prov-ouaddai', 'STOCK_INITIAL', '2027-04-30', 'BON', 1500, 1500, 0),
('lot-huil-od-01', 'LOT-HUIL-OD-001', 'art-huile-5l', 'ent-prov-ouaddai', 'prov-ouaddai', 'STOCK_INITIAL', '2027-07-31', 'BON', 800, 800, 0),
('lot-sorg-si-01', 'LOT-SORG-SI-001', 'art-sorgho-50kg', 'ent-prov-sila', 'prov-sila', 'STOCK_INITIAL', '2027-04-15', 'BON', 1200, 1200, 0),
('lot-csbp-si-01', 'LOT-CSBP-SI-001', 'art-csb-25kg', 'ent-prov-sila', 'prov-sila', 'STOCK_INITIAL', '2027-05-15', 'BON', 600, 600, 0),
('lot-mais-lc-01', 'LOT-MAIS-LC-001', 'art-mais-50kg', 'ent-prov-lac', 'prov-lac', 'STOCK_INITIAL', '2027-06-15', 'BON', 1000, 1000, 0)
ON CONFLICT(id) DO NOTHING;
