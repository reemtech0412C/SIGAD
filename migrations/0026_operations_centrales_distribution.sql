PRAGMA foreign_keys = ON;

-- Table principale des opérations centrales de distribution
CREATE TABLE operations_centrales_distribution (
    id TEXT PRIMARY KEY,
    code_operation TEXT NOT NULL UNIQUE,
    reference_administrative TEXT,
    intitule TEXT NOT NULL,
    description_contexte TEXT,
    type_intervention TEXT NOT NULL DEFAULT 'DISTRIBUTION_GRATUITE_VIVRES' CHECK (type_intervention IN ('DISTRIBUTION_GRATUITE_VIVRES', 'ASSISTANCE_DOULEUR_CATASTROPHE', 'NFI_URGENCE', 'MIXTE', 'AUTRE')),
    annee_campagne TEXT NOT NULL,
    institution_responsable TEXT NOT NULL DEFAULT 'MASSNAH',
    reference_juridique TEXT,
    objectif_general TEXT,
    categories_beneficiaires TEXT,
    criteres_eligibilite TEXT,
    sources_donnees_ciblage TEXT,
    nombre_previsionnel_menages INTEGER CHECK (nombre_previsionnel_menages IS NULL OR nombre_previsionnel_menages >= 0),
    nombre_previsionnel_personnes INTEGER CHECK (nombre_previsionnel_personnes IS NULL OR nombre_previsionnel_personnes >= 0),
    date_debut_prevue TEXT,
    date_fin_prevue TEXT,
    date_limite_preparation_provinciale TEXT,
    date_limite_transmission_rapports TEXT,
    source_vivres TEXT NOT NULL DEFAULT 'ONASA' CHECK (source_vivres IN ('ONASA', 'PARTENAIRE', 'STOCK_EXISTANT', 'ACHAT_PUBLIC', 'DON_EXTERNE', 'MIXTE')),
    articles_cibles_json TEXT,
    notes_transport_reception TEXT,
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'SOUMISE_A_APPROBATION', 'APPROUVEE', 'OUVERTE', 'EN_COURS', 'EN_CONSOLIDATION', 'CLOTUREE', 'ANNULEE')),
    motif_annulation TEXT,
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Liaison entre l'opération centrale et les provinces ciblées
CREATE TABLE operations_centrales_provinces (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations_centrales_distribution(id) ON DELETE RESTRICT,
    province_id TEXT NOT NULL REFERENCES provinces(id) ON DELETE RESTRICT,
    quantite_allouee_prevue REAL CHECK (quantite_allouee_prevue IS NULL OR quantite_allouee_prevue >= 0),
    nombre_menages_cibles_province INTEGER CHECK (nombre_menages_cibles_province IS NULL OR nombre_menages_cibles_province >= 0),
    instructions_specifiques TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(operation_id, province_id)
);

-- Dossiers d'exécution provinciaux ouverts lors du passage à OUVERTE
CREATE TABLE dossiers_execution_provinciaux (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations_centrales_distribution(id) ON DELETE RESTRICT,
    province_id TEXT NOT NULL REFERENCES provinces(id) ON DELETE RESTRICT,
    reference_dossier TEXT NOT NULL UNIQUE,
    statut_execution TEXT NOT NULL DEFAULT 'ASSIGNE' CHECK (statut_execution IN ('ASSIGNE', 'EN_PREPARATION', 'EN_DISTRIBUTION', 'TERMINE', 'RAPPORT_TRANSMIS', 'VALIDE_CENTRAL')),
    plan_operationnel_local TEXT,
    observations_delegue TEXT,
    date_debut_reelle TEXT,
    date_fin_reelle TEXT,
    total_menages_servis INTEGER NOT NULL DEFAULT 0 CHECK (total_menages_servis >= 0),
    total_personnes_servies INTEGER NOT NULL DEFAULT 0 CHECK (total_personnes_servies >= 0),
    quantite_totale_distribuee REAL NOT NULL DEFAULT 0 CHECK (quantite_totale_distribuee >= 0),
    pv_piece_jointe_id TEXT REFERENCES pieces_jointes(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(operation_id, province_id)
);

-- Actes et approbations de gouvernance (Comité de pilotage, Validation ministérielle)
CREATE TABLE approbations_operations (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations_centrales_distribution(id) ON DELETE RESTRICT,
    type_approbation TEXT NOT NULL CHECK (type_approbation IN ('COMITE_PILOTAGE', 'VALIDATION_MINISTERIELLE', 'AUTORISATION_SPECIALISEE')),
    instance_decisionnaire TEXT NOT NULL,
    reference_acte TEXT NOT NULL,
    date_decision TEXT NOT NULL,
    signataire_nom TEXT NOT NULL,
    signataire_qualite TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('APPROUVE', 'APPROUVE_AVEC_RESERVES', 'REJETE')),
    reserves_ou_conditions TEXT,
    piece_jointe_id TEXT REFERENCES pieces_jointes(id),
    enregistre_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documents et arrêtés attachés à l'opération
CREATE TABLE documents_operations (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations_centrales_distribution(id) ON DELETE RESTRICT,
    categorie_document TEXT NOT NULL CHECK (categorie_document IN ('ARRETE_MINISTERIEL', 'DECISION_PILOTAGE', 'PLAN_OPERATIONNEL_NATIONAL', 'CADRE_DE_CIBLAGE', 'BORDEREAU_CONSOLIDE', 'RAPPORT_EVALUATION', 'AUTRE')),
    intitule TEXT NOT NULL,
    cle_r2 TEXT NOT NULL UNIQUE,
    nom_fichier_original TEXT NOT NULL,
    type_mime TEXT NOT NULL,
    taille_octets INTEGER NOT NULL,
    televerse_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Traçabilité de l'historique des statuts de l'opération centrale
CREATE TABLE historique_operations_centrales (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations_centrales_distribution(id) ON DELETE RESTRICT,
    statut_precedent TEXT,
    nouveau_statut TEXT NOT NULL,
    motif_ou_commentaire TEXT,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Évolution non destructive de distributions_provinciales pour liaison optionnelle
ALTER TABLE distributions_provinciales ADD COLUMN operation_centrale_id TEXT REFERENCES operations_centrales_distribution(id);
ALTER TABLE distributions_provinciales ADD COLUMN dossier_execution_id TEXT REFERENCES dossiers_execution_provinciaux(id);

-- Index de performance Cloudflare D1 (Free Tier optimization)
CREATE INDEX idx_op_centrales_statut ON operations_centrales_distribution(statut, annee_campagne DESC);
CREATE INDEX idx_op_centrales_code ON operations_centrales_distribution(code_operation);
CREATE INDEX idx_op_prov_op ON operations_centrales_provinces(operation_id, province_id);
CREATE INDEX idx_dossiers_exec_op_prov ON dossiers_execution_provinciaux(operation_id, province_id, statut_execution);
CREATE INDEX idx_approbations_op ON approbations_operations(operation_id, type_approbation);
CREATE INDEX idx_docs_op ON documents_operations(operation_id, categorie_document);
CREATE INDEX idx_hist_op ON historique_operations_centrales(operation_id, cree_le DESC);
CREATE INDEX idx_dist_prov_op_centrale ON distributions_provinciales(operation_centrale_id, dossier_execution_id);
