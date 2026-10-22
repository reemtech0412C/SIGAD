PRAGMA foreign_keys = ON;

CREATE TABLE observations_controle (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('APPROVISIONNEMENT_CENTRAL', 'DISTRIBUTION_PROVINCIALE', 'STOCK_PROVINCIAL')),
    operation_id TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    niveau_gravite TEXT NOT NULL DEFAULT 'INFO' CHECK (niveau_gravite IN ('INFO', 'AVERTISSEMENT', 'CRITIQUE')),
    observation TEXT NOT NULL,
    auteur_central_id TEXT NOT NULL REFERENCES utilisateurs(id),
    reponse_delegue TEXT,
    date_reponse TEXT,
    statut TEXT NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE', 'TRAITEE', 'CLASSEE')),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE demandes_correction (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    motif_retour TEXT NOT NULL,
    elements_a_corriger TEXT NOT NULL, -- JSON ou texte structuré
    statut TEXT NOT NULL DEFAULT 'EN_ATTENTE_DELEGUE' CHECK (statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE', 'VALIDEE_CENTRAL')),
    demande_par TEXT NOT NULL REFERENCES utilisateurs(id),
    traite_par_delegue TEXT REFERENCES utilisateurs(id),
    reponse_delegue TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    resolu_le TEXT
);

CREATE TABLE pieces_jointes (
    id TEXT PRIMARY KEY,
    cle_r2 TEXT NOT NULL UNIQUE, -- ex: 'provinces/ouaddai/2026/10/pv_dist_001.pdf'
    nom_fichier_original TEXT NOT NULL,
    type_mime TEXT NOT NULL,
    taille_octets INTEGER NOT NULL,
    categorie_document TEXT NOT NULL CHECK (categorie_document IN ('BORDEREAU_EXPEDITION', 'PV_RECEPTION', 'PV_DISTRIBUTION', 'LISTE_EMARGEMENT', 'JUSTIFICATIF_ECART', 'AUTRE')),
    entite_liee_type TEXT NOT NULL,
    entite_liee_id TEXT NOT NULL,
    province_id TEXT REFERENCES provinces(id),
    televerse_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rapports_generes (
    id TEXT PRIMARY KEY,
    type_rapport TEXT NOT NULL,
    intitule TEXT NOT NULL,
    perimetre TEXT NOT NULL CHECK (perimetre IN ('NATIONAL', 'PROVINCIAL')),
    province_id TEXT REFERENCES provinces(id),
    filtres_appliques_json TEXT,
    format_export TEXT NOT NULL CHECK (format_export IN ('PDF', 'EXCEL', 'CSV')),
    cle_r2_archive TEXT,
    genere_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    destinataire_utilisateur_id TEXT REFERENCES utilisateurs(id),
    destinataire_province_id TEXT REFERENCES provinces(id),
    destinataire_role TEXT,
    titre TEXT NOT NULL,
    message TEXT NOT NULL,
    type_alerte TEXT NOT NULL CHECK (type_alerte IN ('INFO', 'ACTION_REQUISE', 'ALERTE_STOCK', 'DEMANDE_CORRECTION', 'CLOTURE')),
    lien_cible TEXT,
    lue INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cles_idempotence (
    cle TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    route_api TEXT NOT NULL,
    statut_http INTEGER NOT NULL,
    reponse_json TEXT NOT NULL,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    expire_le TEXT NOT NULL
);

-- الفهارس الإجبارية لتقليل استهلاك قراءات Cloudflare D1 (Free Tier)
CREATE INDEX idx_utilisateurs_province ON utilisateurs(province_id, role);
CREATE INDEX idx_menages_province_code ON menages(province_id, code_menage);
CREATE INDEX idx_menages_localisation ON menages(province_id, departement_id, localite_id, site_humanitaire_id);
CREATE INDEX idx_lots_stock_fefo ON lots_stock(entrepot_id, article_id, etat_qualite, date_peremption ASC);
CREATE INDEX idx_soldes_stock_prov ON soldes_stock(province_id, entrepot_id, article_id);
CREATE INDEX idx_mouvements_prov_date ON mouvements_stock(province_id, cree_le DESC);
CREATE INDEX idx_appro_statut ON approvisionnements_centraux(statut, date_creation DESC);
CREATE INDEX idx_expeditions_prov ON expeditions(province_destinataire_id, statut_expedition);
CREATE INDEX idx_dist_prov_statut ON distributions_provinciales(province_id, statut, date_prevue DESC);
CREATE INDEX idx_menages_dist_statut ON menages_distribution(distribution_id, statut_service);

