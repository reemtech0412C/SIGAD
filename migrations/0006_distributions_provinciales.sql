PRAGMA foreign_keys = ON;

CREATE TABLE distributions_provinciales (
    id TEXT PRIMARY KEY,
    reference_distribution TEXT NOT NULL UNIQUE, -- ex: 'DIST-OD-2026-001'
    intitule_distribution TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    nature_aide TEXT NOT NULL,
    bailleur_fonds_id TEXT REFERENCES partenaires(id),
    partenaire_execution_id TEXT REFERENCES partenaires(id),
    objectif TEXT NOT NULL,
    nombre_menages_cibles INTEGER NOT NULL CHECK (nombre_menages_cibles > 0),
    nombre_personnes_cibles INTEGER NOT NULL CHECK (nombre_personnes_cibles > 0),
    date_prevue TEXT NOT NULL,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    liste_beneficiaires_id TEXT REFERENCES listes_beneficiaires(id),
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'EN_PREPARATION', 'VALIDEE_PROVINCE', 'EN_EXECUTION', 'TERMINEE_PROVINCE', 'RETOURNEE_POUR_CORRECTION', 'CLOTUREE_CENTRAL')),
    version_plan INTEGER NOT NULL DEFAULT 1,
    observations TEXT,
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    date_declaration_fin TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE zones_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    localite_id TEXT REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id),
    quartier_id TEXT REFERENCES quartiers(id),
    carre_id TEXT REFERENCES carres(id),
    site_humanitaire_id TEXT REFERENCES sites_humanitaires(id),
    nom_site_distribution TEXT NOT NULL
);

CREATE TABLE articles_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    source_approvisionnement TEXT NOT NULL CHECK (source_approvisionnement IN ('APPROVISIONNEMENT_CENTRAL', 'APPROVISIONNEMENT_DIRECT', 'STOCK_EXISTANT', 'MIXTE')),
    lot_stock_id TEXT REFERENCES lots_stock(id),
    ration_par_menage REAL NOT NULL CHECK (ration_par_menage > 0),
    quantite_totale_prevue REAL NOT NULL CHECK (quantite_totale_prevue > 0),
    quantite_reservee REAL NOT NULL DEFAULT 0,
    quantite_distribuee REAL NOT NULL DEFAULT 0
);

CREATE TABLE menages_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    menage_id TEXT NOT NULL REFERENCES menages(id),
    zone_distribution_id TEXT REFERENCES zones_distribution(id),
    statut_service TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_service IN ('EN_ATTENTE', 'SERVI', 'PARTIELLEMENT_SERVI', 'ABSENT', 'NON_SERVI')),
    date_service TEXT,
    motif_non_service TEXT,
    UNIQUE(distribution_id, menage_id)
);

CREATE TABLE allocations_distribution (
    id TEXT PRIMARY KEY,
    menage_distribution_id TEXT NOT NULL REFERENCES menages_distribution(id),
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_prevue REAL NOT NULL CHECK (quantite_prevue > 0),
    quantite_servie REAL NOT NULL DEFAULT 0 CHECK (quantite_servie >= 0),
    UNIQUE(menage_distribution_id, article_id)
);

CREATE TABLE remises_distribution (
    id TEXT PRIMARY KEY,
    reference_remise TEXT NOT NULL UNIQUE,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    menage_distribution_id TEXT NOT NULL REFERENCES menages_distribution(id),
    menage_id TEXT NOT NULL REFERENCES menages(id),
    date_remise TEXT NOT NULL,
    identite_recepteur TEXT NOT NULL,
    emargement_reference TEXT,
    agent_distributeur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cle_idempotence TEXT NOT NULL UNIQUE,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_remise (
    id TEXT PRIMARY KEY,
    remise_id TEXT NOT NULL REFERENCES remises_distribution(id),
    allocation_id TEXT NOT NULL REFERENCES allocations_distribution(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    reservation_id TEXT NOT NULL REFERENCES reservations_stock(id),
    quantite_remise REAL NOT NULL CHECK (quantite_remise > 0)
);

CREATE TABLE validations_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    version_validee INTEGER NOT NULL,
    valide_par TEXT NOT NULL REFERENCES utilisateurs(id),
    date_validation TEXT NOT NULL DEFAULT (datetime('now')),
    snapshot_plan_json TEXT NOT NULL, -- copie figée du plan au moment de la validation
    observations TEXT
);

CREATE TABLE historique_statuts (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('APPROVISIONNEMENT_CENTRAL', 'DISTRIBUTION_PROVINCIALE')),
    operation_id TEXT NOT NULL,
    statut_precedent TEXT,
    nouveau_statut TEXT NOT NULL,
    motif_ou_commentaire TEXT,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clotures_distribution (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL UNIQUE REFERENCES distributions_provinciales(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    total_menages_cibles INTEGER NOT NULL,
    total_menages_servis INTEGER NOT NULL,
    total_menages_partiels INTEGER NOT NULL,
    total_menages_absents INTEGER NOT NULL,
    total_menages_non_servis INTEGER NOT NULL,
    bilan_articles_json TEXT NOT NULL, -- synthèse figée: prévu, réservé, distribué, reliquat libéré
    pv_distribution_piece_id TEXT,
    cloture_par TEXT NOT NULL REFERENCES utilisateurs(id),
    date_cloture TEXT NOT NULL DEFAULT (datetime('now')),
    observations_finales TEXT
);

