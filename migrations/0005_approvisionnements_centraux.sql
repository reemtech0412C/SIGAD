PRAGMA foreign_keys = ON;

CREATE TABLE approvisionnements_centraux (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE, -- ex: 'APP-NAT-2026-001'
    intitule_operation TEXT NOT NULL,
    date_creation TEXT NOT NULL,
    description TEXT,
    source_articles TEXT NOT NULL CHECK (source_articles IN ('ENTREPOT_CENTRAL', 'FOURNISSEUR_EXTERNE', 'DON_PARTENAIRE')),
    partenaire_id TEXT REFERENCES partenaires(id),
    nature_aide TEXT NOT NULL, -- Alimentaire, NFI, Mixte
    date_prevue_expedition TEXT,
    instructions TEXT,
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'VALIDEE', 'EN_EXPEDITION', 'PARTIELLEMENT_RECEPTIONNEE', 'RECEPTIONNEE', 'EN_RAPPROCHEMENT', 'CLOTUREE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    date_validation TEXT,
    cloture_par TEXT REFERENCES utilisateurs(id),
    date_cloture TEXT,
    observations_cloture TEXT
);

CREATE TABLE destinations_approvisionnement (
    id TEXT PRIMARY KEY,
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    statut_destination TEXT NOT NULL DEFAULT 'PLANIFIEE' CHECK (statut_destination IN ('PLANIFIEE', 'EN_EXPEDITION', 'PARTIELLEMENT_RECEPTIONNEE', 'RECEPTIONNEE', 'EN_ECART', 'CLOTUREE')),
    UNIQUE(approvisionnement_id, province_id)
);

CREATE TABLE articles_approvisionnement (
    id TEXT PRIMARY KEY,
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    destination_id TEXT NOT NULL REFERENCES destinations_approvisionnement(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_allouee REAL NOT NULL CHECK (quantite_allouee > 0),
    quantite_expediee REAL NOT NULL DEFAULT 0 CHECK (quantite_expediee >= 0),
    quantite_receptionnee_acceptee REAL NOT NULL DEFAULT 0 CHECK (quantite_receptionnee_acceptee >= 0),
    UNIQUE(destination_id, article_id)
);

CREATE TABLE expeditions (
    id TEXT PRIMARY KEY,
    reference_expedition TEXT NOT NULL UNIQUE, -- ex: 'EXP-2026-001-OD'
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    destination_id TEXT NOT NULL REFERENCES destinations_approvisionnement(id),
    province_destinataire_id TEXT NOT NULL REFERENCES provinces(id),
    date_expedition TEXT NOT NULL,
    origine_expedition TEXT NOT NULL CHECK (origine_expedition IN ('ENTREPOT_CENTRAL', 'LIVRAISON_DIRECTE_FOURNISSEUR')),
    entrepot_origine_id TEXT REFERENCES entrepots(id), -- NULL si fournisseur externe direct
    reference_bordereau TEXT NOT NULL,
    transporteur_partenaire_id TEXT REFERENCES partenaires(id),
    informations_transport TEXT, -- Immatriculation camion, nom chauffeur, téléphone
    statut_expedition TEXT NOT NULL DEFAULT 'EN_ROUTE' CHECK (statut_expedition IN ('EN_ROUTE', 'RECEPTIONNEE', 'RECEPTIONNEE_AVEC_ECART')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_expedition (
    id TEXT PRIMARY KEY,
    expedition_id TEXT NOT NULL REFERENCES expeditions(id),
    article_approvisionnement_id TEXT NOT NULL REFERENCES articles_approvisionnement(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_origine_id TEXT REFERENCES lots_stock(id),
    numero_lot_fournisseur TEXT,
    date_peremption TEXT,
    quantite_expediee REAL NOT NULL CHECK (quantite_expediee > 0)
);

CREATE TABLE receptions_provinciales (
    id TEXT PRIMARY KEY,
    reference_reception_prov TEXT NOT NULL UNIQUE, -- ex: 'REC-OD-2026-001'
    expedition_id TEXT NOT NULL UNIQUE REFERENCES expeditions(id),
    approvisionnement_id TEXT NOT NULL REFERENCES approvisionnements_centraux(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    entrepot_recepteur_id TEXT NOT NULL REFERENCES entrepots(id),
    date_reception TEXT NOT NULL,
    numero_pv_reception TEXT NOT NULL,
    comporte_ecarts INTEGER NOT NULL DEFAULT 0,
    statut_rapprochement TEXT NOT NULL DEFAULT 'AUCUN' CHECK (statut_rapprochement IN ('AUCUN', 'ECART_OUVERT', 'RAPPROCHE_JUSTIFIE')),
    observations TEXT,
    pv_piece_jointe_id TEXT,
    enregistre_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_reception_provinciale (
    id TEXT PRIMARY KEY,
    reception_provinciale_id TEXT NOT NULL REFERENCES receptions_provinciales(id),
    ligne_expedition_id TEXT NOT NULL REFERENCES lignes_expedition(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_expediee REAL NOT NULL,
    quantite_recue_physique REAL NOT NULL CHECK (quantite_recue_physique >= 0),
    quantite_acceptee REAL NOT NULL CHECK (quantite_acceptee >= 0),
    quantite_endommagee REAL NOT NULL DEFAULT 0 CHECK (quantite_endommagee >= 0),
    quantite_manquante REAL NOT NULL DEFAULT 0 CHECK (quantite_manquante >= 0),
    lot_cree_id TEXT REFERENCES lots_stock(id),
    justification_ecart TEXT
);

