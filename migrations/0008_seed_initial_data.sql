PRAGMA foreign_keys = ON;

INSERT INTO provinces (id, code, identifiant_compte, nom, chef_lieu, statut_particulier, actif)
VALUES
('prov-batha', 'TD-BA', 'batha', 'Batha', 'Ati', 0, 1),
('prov-borkou', 'TD-BO', 'borkou', 'Borkou', 'Faya-Largeau', 0, 1),
('prov-chari-baguirmi', 'TD-CB', 'chari-baguirmi', 'Chari-Baguirmi', 'Massenya', 0, 1),
('prov-ennedi-est', 'TD-EE', 'ennedi-est', 'Ennedi-Est', 'Amdjarass', 0, 1),
('prov-ennedi-ouest', 'TD-EO', 'ennedi-ouest', 'Ennedi-Ouest', 'Fada', 0, 1),
('prov-guera', 'TD-GR', 'guera', 'Guéra', 'Mongo', 0, 1),
('prov-hadjer-lamis', 'TD-HL', 'hadjer-lamis', 'Hadjer-Lamis', 'Massakory', 0, 1),
('prov-kanem', 'TD-KA', 'kanem', 'Kanem', 'Mao', 0, 1),
('prov-lac', 'TD-LC', 'lac', 'Lac', 'Bol', 0, 1),
('prov-logone-occidental', 'TD-LO', 'logone-occidental', 'Logone-Occidental', 'Moundou', 0, 1),
('prov-logone-oriental', 'TD-LR', 'logone-oriental', 'Logone-Oriental', 'Doba', 0, 1),
('prov-mandoul', 'TD-MA', 'mandoul', 'Mandoul', 'Koumra', 0, 1),
('prov-mayo-kebbi-est', 'TD-ME', 'mayo-kebbi-est', 'Mayo-Kebbi-Est', 'Bongor', 0, 1),
('prov-mayo-kebbi-ouest', 'TD-MO', 'mayo-kebbi-ouest', 'Mayo-Kebbi-Ouest', 'Pala', 0, 1),
('prov-moyen-chari', 'TD-MC', 'moyen-chari', 'Moyen-Chari', 'Sarh', 0, 1),
('prov-ndjamena', 'TD-ND', 'ndjamena', 'N''Djamena', 'N''Djamena', 1, 1),
('prov-ouaddai', 'TD-OD', 'ouaddai', 'Ouaddaï', 'Abéché', 0, 1),
('prov-salamat', 'TD-SA', 'salamat', 'Salamat', 'Am Timan', 0, 1),
('prov-sila', 'TD-SI', 'sila', 'Sila', 'Goz Beïda', 0, 1),
('prov-tandjile', 'TD-TA', 'tandjile', 'Tandjilé', 'Laï', 0, 1),
('prov-tibesti', 'TD-TI', 'tibesti', 'Tibesti', 'Bardaï', 0, 1),
('prov-wadi-fira', 'TD-WF', 'wadi-fira', 'Wadi-Fira', 'Biltine', 0, 1),
('prov-barh-el-gazel', 'TD-BG', 'barh-el-gazel', 'Barh-El-Gazel', 'Moussoro', 0, 1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO utilisateurs
  (id, identifiant, nom_complet, role, province_id, mot_de_passe_hash, code_activation_hash, doit_changer_mot_de_passe, statut)
VALUES
('usr-proprietaire', 'proprietaire', 'Propriétaire du SIGAD', 'PROPRIETAIRE', NULL, 'pbkdf2-sha256$310000$q5G6QgpJLSN2oor9bwlmiA$vtwm7rgzP6KrSJYfm21eo59MfeH5HmMW7nwzJ2Ln-_A', 'pbkdf2-sha256$310000$q5G6QgpJLSN2oor9bwlmiA$vtwm7rgzP6KrSJYfm21eo59MfeH5HmMW7nwzJ2Ln-_A', 1, 'ACTIF'),
('usr-central', 'central', 'Administrateur central', 'ADMIN_CENTRAL', NULL, 'pbkdf2-sha256$310000$zOSLW4D_guNEmCxlkcuobw$Xa1LVmpOx-yHivc_wjAeR1YfrBRWMrSvKpdIjB6XsT8', 'pbkdf2-sha256$310000$zOSLW4D_guNEmCxlkcuobw$Xa1LVmpOx-yHivc_wjAeR1YfrBRWMrSvKpdIjB6XsT8', 1, 'ACTIF'),
('usr-batha', 'batha', 'Délégué provincial — Batha', 'DELEGUE_PROVINCIAL', 'prov-batha', 'pbkdf2-sha256$310000$xUgUR4bZEI-exlsNZglAnQ$sLFKyVp2Z1R5-FqQA4TJVYCJ6SDFQjOmx79wEO7NdQY', 'pbkdf2-sha256$310000$xUgUR4bZEI-exlsNZglAnQ$sLFKyVp2Z1R5-FqQA4TJVYCJ6SDFQjOmx79wEO7NdQY', 1, 'ACTIF'),
('usr-borkou', 'borkou', 'Délégué provincial — Borkou', 'DELEGUE_PROVINCIAL', 'prov-borkou', 'pbkdf2-sha256$310000$ONC1IIS2Qqk-6wFHzkG-CQ$HGtrqptX1tj5KWvwe3nnzHPCLcXip4SvBpTiqjr4Xsw', 'pbkdf2-sha256$310000$ONC1IIS2Qqk-6wFHzkG-CQ$HGtrqptX1tj5KWvwe3nnzHPCLcXip4SvBpTiqjr4Xsw', 1, 'ACTIF'),
('usr-chari-baguirmi', 'chari-baguirmi', 'Délégué provincial — Chari-Baguirmi', 'DELEGUE_PROVINCIAL', 'prov-chari-baguirmi', 'pbkdf2-sha256$310000$lldD24T08pP9H0GkQHMdSA$eE08SnkGnN-N4Tu-YAi-YsMmvbMo1APhm3oVmnF1k9U', 'pbkdf2-sha256$310000$lldD24T08pP9H0GkQHMdSA$eE08SnkGnN-N4Tu-YAi-YsMmvbMo1APhm3oVmnF1k9U', 1, 'ACTIF'),
('usr-ennedi-est', 'ennedi-est', 'Délégué provincial — Ennedi-Est', 'DELEGUE_PROVINCIAL', 'prov-ennedi-est', 'pbkdf2-sha256$310000$ont7qKm0VQs4NV5EuBtTdA$AHVNAMCABdZHQGzDCf7IOXdXMUNvDL2DRQHYKVDpB3Q', 'pbkdf2-sha256$310000$ont7qKm0VQs4NV5EuBtTdA$AHVNAMCABdZHQGzDCf7IOXdXMUNvDL2DRQHYKVDpB3Q', 1, 'ACTIF'),
('usr-ennedi-ouest', 'ennedi-ouest', 'Délégué provincial — Ennedi-Ouest', 'DELEGUE_PROVINCIAL', 'prov-ennedi-ouest', 'pbkdf2-sha256$310000$Smm2x6roA4MykXEfHXtu6Q$v-dl1KMRGgf2r1gohcNoPONfqj2dOrqUo9D4mXZ4hco', 'pbkdf2-sha256$310000$Smm2x6roA4MykXEfHXtu6Q$v-dl1KMRGgf2r1gohcNoPONfqj2dOrqUo9D4mXZ4hco', 1, 'ACTIF'),
('usr-guera', 'guera', 'Délégué provincial — Guéra', 'DELEGUE_PROVINCIAL', 'prov-guera', 'pbkdf2-sha256$310000$KrYV3BAuZouVNLLeQs218w$F1jEu9ibGn1cHXisuHgLiGUah4gq8c_LoY5KnBNDYko', 'pbkdf2-sha256$310000$KrYV3BAuZouVNLLeQs218w$F1jEu9ibGn1cHXisuHgLiGUah4gq8c_LoY5KnBNDYko', 1, 'ACTIF'),
('usr-hadjer-lamis', 'hadjer-lamis', 'Délégué provincial — Hadjer-Lamis', 'DELEGUE_PROVINCIAL', 'prov-hadjer-lamis', 'pbkdf2-sha256$310000$b4_tpTsuSaxN1mDEA3JxSw$basbYv608sQHJtMPiUaPLFuRWi9Ot4XF4s2X5Yu4FNI', 'pbkdf2-sha256$310000$b4_tpTsuSaxN1mDEA3JxSw$basbYv608sQHJtMPiUaPLFuRWi9Ot4XF4s2X5Yu4FNI', 1, 'ACTIF'),
('usr-kanem', 'kanem', 'Délégué provincial — Kanem', 'DELEGUE_PROVINCIAL', 'prov-kanem', 'pbkdf2-sha256$310000$ODqa6YS6XgNUh_ndFcdo9w$t0g-yFqir2TFEqvnONWd7gRteLIE83W9GfIU__9jsO4', 'pbkdf2-sha256$310000$ODqa6YS6XgNUh_ndFcdo9w$t0g-yFqir2TFEqvnONWd7gRteLIE83W9GfIU__9jsO4', 1, 'ACTIF'),
('usr-lac', 'lac', 'Délégué provincial — Lac', 'DELEGUE_PROVINCIAL', 'prov-lac', 'pbkdf2-sha256$310000$Asx_ZQz4FS4azSOaINvyUw$ucxThEBiAFB8-IKMEXuwwcDk8RzOYWDkn0CxNzdyQwU', 'pbkdf2-sha256$310000$Asx_ZQz4FS4azSOaINvyUw$ucxThEBiAFB8-IKMEXuwwcDk8RzOYWDkn0CxNzdyQwU', 1, 'ACTIF'),
('usr-logone-occidental', 'logone-occidental', 'Délégué provincial — Logone-Occidental', 'DELEGUE_PROVINCIAL', 'prov-logone-occidental', 'pbkdf2-sha256$310000$7nw-rD4euxCBiFdtQsns3Q$nAxi0us5KQqqRHhWeWt92vknqhAZ1uH7TeP9Le4k_nc', 'pbkdf2-sha256$310000$7nw-rD4euxCBiFdtQsns3Q$nAxi0us5KQqqRHhWeWt92vknqhAZ1uH7TeP9Le4k_nc', 1, 'ACTIF'),
('usr-logone-oriental', 'logone-oriental', 'Délégué provincial — Logone-Oriental', 'DELEGUE_PROVINCIAL', 'prov-logone-oriental', 'pbkdf2-sha256$310000$LXhV-mjDapvzTc2BVPIyhg$c37AjyVkRG1AcEl9maLZ3JNO_t3ACdZq_HrjcKE_yyc', 'pbkdf2-sha256$310000$LXhV-mjDapvzTc2BVPIyhg$c37AjyVkRG1AcEl9maLZ3JNO_t3ACdZq_HrjcKE_yyc', 1, 'ACTIF'),
('usr-mandoul', 'mandoul', 'Délégué provincial — Mandoul', 'DELEGUE_PROVINCIAL', 'prov-mandoul', 'pbkdf2-sha256$310000$YONhsBvxHR1iaKmwcf7WAA$BG1JNyksWOLV0T-7dgOll4UvRrdcrqYHmalHZ6DfEo0', 'pbkdf2-sha256$310000$YONhsBvxHR1iaKmwcf7WAA$BG1JNyksWOLV0T-7dgOll4UvRrdcrqYHmalHZ6DfEo0', 1, 'ACTIF'),
('usr-mayo-kebbi-est', 'mayo-kebbi-est', 'Délégué provincial — Mayo-Kebbi-Est', 'DELEGUE_PROVINCIAL', 'prov-mayo-kebbi-est', 'pbkdf2-sha256$310000$VmnzBqDl3QewwTeuDj1kgQ$wwsd4gNbzCGTnwwu90r50_PFah9NLcbCeNxHxMhe_sk', 'pbkdf2-sha256$310000$VmnzBqDl3QewwTeuDj1kgQ$wwsd4gNbzCGTnwwu90r50_PFah9NLcbCeNxHxMhe_sk', 1, 'ACTIF'),
('usr-mayo-kebbi-ouest', 'mayo-kebbi-ouest', 'Délégué provincial — Mayo-Kebbi-Ouest', 'DELEGUE_PROVINCIAL', 'prov-mayo-kebbi-ouest', 'pbkdf2-sha256$310000$zLXmWPoqPKLht6drdXJ-rw$Alv1YpwvC1hk6Bgqrqgbo11mTR352MCdtUtS6tC9p9M', 'pbkdf2-sha256$310000$zLXmWPoqPKLht6drdXJ-rw$Alv1YpwvC1hk6Bgqrqgbo11mTR352MCdtUtS6tC9p9M', 1, 'ACTIF'),
('usr-moyen-chari', 'moyen-chari', 'Délégué provincial — Moyen-Chari', 'DELEGUE_PROVINCIAL', 'prov-moyen-chari', 'pbkdf2-sha256$310000$IWBLpG0O0L07SG8E_X7yPQ$G1Cfjky4IGoHGygZI6WLRwZzY59bgnY_2TWVviZpZNM', 'pbkdf2-sha256$310000$IWBLpG0O0L07SG8E_X7yPQ$G1Cfjky4IGoHGygZI6WLRwZzY59bgnY_2TWVviZpZNM', 1, 'ACTIF'),
('usr-ndjamena', 'ndjamena', 'Délégué provincial — N''Djamena', 'DELEGUE_PROVINCIAL', 'prov-ndjamena', 'pbkdf2-sha256$310000$i3gutA_fTCR3SWb4LkbJUw$ZK9GpyKeT1WcuXL145KGcKxTTyc-XOvdiskmhA4SQpU', 'pbkdf2-sha256$310000$i3gutA_fTCR3SWb4LkbJUw$ZK9GpyKeT1WcuXL145KGcKxTTyc-XOvdiskmhA4SQpU', 1, 'ACTIF'),
('usr-ouaddai', 'ouaddai', 'Délégué provincial — Ouaddaï', 'DELEGUE_PROVINCIAL', 'prov-ouaddai', 'pbkdf2-sha256$310000$A4AURoOvAVwZG4_r4rpaRQ$kfkoZfHBbX-0UuAK0W8Rki_bE-A_V5l-RhSb9LIeudo', 'pbkdf2-sha256$310000$A4AURoOvAVwZG4_r4rpaRQ$kfkoZfHBbX-0UuAK0W8Rki_bE-A_V5l-RhSb9LIeudo', 1, 'ACTIF'),
('usr-salamat', 'salamat', 'Délégué provincial — Salamat', 'DELEGUE_PROVINCIAL', 'prov-salamat', 'pbkdf2-sha256$310000$42SrEYyYU0skcTcNVtU3GA$M-cLjsogkzdnUa8RJuk6Z4wUqZ6wotlSrx7KJ0hSLiU', 'pbkdf2-sha256$310000$42SrEYyYU0skcTcNVtU3GA$M-cLjsogkzdnUa8RJuk6Z4wUqZ6wotlSrx7KJ0hSLiU', 1, 'ACTIF'),
('usr-sila', 'sila', 'Délégué provincial — Sila', 'DELEGUE_PROVINCIAL', 'prov-sila', 'pbkdf2-sha256$310000$JAI0h63b_7u5_XTlAuYQ8g$cEW1Go8TxIFPK-vzf5UmI9xpJRb3Ud84w2aegOIAQSs', 'pbkdf2-sha256$310000$JAI0h63b_7u5_XTlAuYQ8g$cEW1Go8TxIFPK-vzf5UmI9xpJRb3Ud84w2aegOIAQSs', 1, 'ACTIF'),
('usr-tandjile', 'tandjile', 'Délégué provincial — Tandjilé', 'DELEGUE_PROVINCIAL', 'prov-tandjile', 'pbkdf2-sha256$310000$ux9Kj1VPqvxOAWh3Ao_A3Q$11fCP5CnwySdOLLaXJcNBeelx5l9shb_UE3fqY2thO4', 'pbkdf2-sha256$310000$ux9Kj1VPqvxOAWh3Ao_A3Q$11fCP5CnwySdOLLaXJcNBeelx5l9shb_UE3fqY2thO4', 1, 'ACTIF'),
('usr-tibesti', 'tibesti', 'Délégué provincial — Tibesti', 'DELEGUE_PROVINCIAL', 'prov-tibesti', 'pbkdf2-sha256$310000$6ervHwc5f8h1EnWiDfhOdw$ee-WBt_ireJjNq6vWYEPdGTacDlvDPs3E7hZUHk4KL8', 'pbkdf2-sha256$310000$6ervHwc5f8h1EnWiDfhOdw$ee-WBt_ireJjNq6vWYEPdGTacDlvDPs3E7hZUHk4KL8', 1, 'ACTIF'),
('usr-wadi-fira', 'wadi-fira', 'Délégué provincial — Wadi-Fira', 'DELEGUE_PROVINCIAL', 'prov-wadi-fira', 'pbkdf2-sha256$310000$qndvXQ2KUnSv5_aLfiZm_w$tRYlJZ0gHm21oeyruz9qVEUBWOs-a7EwI5sQMOYKBwY', 'pbkdf2-sha256$310000$qndvXQ2KUnSv5_aLfiZm_w$tRYlJZ0gHm21oeyruz9qVEUBWOs-a7EwI5sQMOYKBwY', 1, 'ACTIF'),
('usr-barh-el-gazel', 'barh-el-gazel', 'Délégué provincial — Barh-El-Gazel', 'DELEGUE_PROVINCIAL', 'prov-barh-el-gazel', 'pbkdf2-sha256$310000$qe9qsaP0XamULrbx8GKh0Q$aTXMN1dk7WdtNNh0UEBXCisI3X2FDOX8VnLse1FhxB4', 'pbkdf2-sha256$310000$qe9qsaP0XamULrbx8GKh0Q$aTXMN1dk7WdtNNh0UEBXCisI3X2FDOX8VnLse1FhxB4', 1, 'ACTIF')
ON CONFLICT(id) DO NOTHING;

INSERT INTO categories_aide (id, code, libelle)
VALUES
('cat-alimentaire', 'ALIMENTAIRE', 'Aide alimentaire'),
('cat-menager', 'MENAGER', 'Articles ménagers essentiels'),
('cat-hygiene', 'HYGIENE', 'Hygiène et assainissement'),
('cat-abri', 'ABRI', 'Abri et matériaux de construction'),
('cat-autre_nfi', 'AUTRE_NFI', 'Autres articles non alimentaires')
ON CONFLICT(id) DO NOTHING;

INSERT INTO unites_mesure (id, code, libelle, decimales_autorisees)
VALUES
('unit-kg', 'KG', 'Kilogramme', 3),
('unit-litre', 'LITRE', 'Litre', 3),
('unit-sac', 'SAC', 'Sac', 0),
('unit-carton', 'CARTON', 'Carton', 0),
('unit-piece', 'PIECE', 'Pièce', 0),
('unit-kit', 'KIT', 'Kit', 0)
ON CONFLICT(id) DO NOTHING;
