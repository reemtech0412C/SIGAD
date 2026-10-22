PRAGMA foreign_keys = ON;

CREATE TABLE categories_aide (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- ALIMENTAIRE, MENAGER, HYGIENE, ABRI, AUTRE_NFI
    libelle TEXT NOT NULL
);

CREATE TABLE unites_mesure (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- KG, LITRE, SAC, CARTON, PIECE, KIT
    libelle TEXT NOT NULL,
    decimales_autorisees INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE conditionnements (
    id TEXT PRIMARY KEY,
    libelle TEXT NOT NULL UNIQUE, -- ex: 'Sac de 50 kg', 'Bidon de 5 litres', 'Carton de 24 pièces'
    unite_base_id TEXT NOT NULL REFERENCES unites_mesure(id),
    facteur_conversion REAL NOT NULL DEFAULT 1
);

CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    code_article TEXT NOT NULL UNIQUE, -- ex: 'ALIM-RIZ-50KG'
    designation TEXT NOT NULL,
    categorie_id TEXT NOT NULL REFERENCES categories_aide(id),
    unite_mesure_id TEXT NOT NULL REFERENCES unites_mesure(id),
    conditionnement_id TEXT REFERENCES conditionnements(id),
    perissable INTEGER NOT NULL DEFAULT 0, -- 1 = applique la règle FEFO
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE entrepots (
    id TEXT PRIMARY KEY,
    code_entrepot TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    niveau TEXT NOT NULL CHECK (niveau IN ('CENTRAL', 'PROVINCIAL')),
    province_id TEXT REFERENCES provinces(id), -- NULL si central national, obligatoire si provincial
    localite_id TEXT REFERENCES localites(id),
    adresse_detaillee TEXT,
    capacite_indicative TEXT,
    responsable_nom TEXT,
    responsable_telephone TEXT,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE lots_stock (
    id TEXT PRIMARY KEY,
    numero_lot TEXT NOT NULL,
    article_id TEXT NOT NULL REFERENCES articles(id),
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    source_type TEXT NOT NULL CHECK (source_type IN ('APPROVISIONNEMENT_CENTRAL', 'APPROVISIONNEMENT_DIRECT', 'STOCK_INITIAL')),
    source_reference_id TEXT, -- ID de la réception ou de l'approvisionnement
    partenaire_bailleur_id TEXT REFERENCES partenaires(id),
    date_peremption TEXT, -- Utilisé pour le tri FEFO
    etat_qualite TEXT NOT NULL DEFAULT 'BON' CHECK (etat_qualite IN ('BON', 'ENDOMMAGE', 'PERIME', 'QUARANTAINE')),
    quantite_initiale REAL NOT NULL CHECK (quantite_initiale >= 0),
    quantite_physique REAL NOT NULL CHECK (quantite_physique >= 0),
    quantite_reservee REAL NOT NULL DEFAULT 0 CHECK (quantite_reservee >= 0),
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (quantite_physique >= quantite_reservee)
);

CREATE TABLE soldes_stock (
    id TEXT PRIMARY KEY,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    quantite_physique REAL NOT NULL DEFAULT 0 CHECK (quantite_physique >= 0),
    quantite_reservee REAL NOT NULL DEFAULT 0 CHECK (quantite_reservee >= 0),
    quantite_disponible REAL GENERATED ALWAYS AS (quantite_physique - quantite_reservee) VIRTUAL,
    seuil_alerte REAL NOT NULL DEFAULT 0,
    derniere_maj TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(entrepot_id, article_id),
    CHECK (quantite_physique >= quantite_reservee)
);

-- لتسجيل المواد الواردة مباشرة من الشركاء في الولاية أو التوريدات المباشرة للمخزن
CREATE TABLE receptions_stock (
    id TEXT PRIMARY KEY,
    reference_reception TEXT NOT NULL UNIQUE,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    type_entree TEXT NOT NULL CHECK (type_entree IN ('APPROVISIONNEMENT_DIRECT_PARTENAIRE', 'APPROVISIONNEMENT_CENTRAL', 'RETOUR_DISTRIBUTION', 'STOCK_INITIAL')),
    partenaire_id TEXT REFERENCES partenaires(id),
    date_reception TEXT NOT NULL,
    numero_bordereau_externe TEXT,
    observations TEXT,
    piece_jointe_id TEXT,
    enregistre_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lignes_reception (
    id TEXT PRIMARY KEY,
    reception_stock_id TEXT NOT NULL REFERENCES receptions_stock(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    quantite_recue REAL NOT NULL CHECK (quantite_recue > 0),
    quantite_acceptee REAL NOT NULL CHECK (quantite_acceptee >= 0),
    quantite_endommagee REAL NOT NULL DEFAULT 0 CHECK (quantite_endommagee >= 0),
    date_peremption TEXT
);

CREATE TABLE mouvements_stock (
    id TEXT PRIMARY KEY,
    reference_mouvement TEXT NOT NULL UNIQUE,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT REFERENCES lots_stock(id),
    type_mouvement TEXT NOT NULL CHECK (type_mouvement IN ('RECEPTION', 'ENTREE', 'SORTIE_EXPEDITION', 'SORTIE_DISTRIBUTION', 'RESERVATION', 'LIBERATION_RESERVATION', 'TRANSFERT_SORTANT', 'TRANSFERT_ENTRANT', 'RETOUR', 'AJUSTEMENT_POSITIF', 'AJUSTEMENT_NEGATIF', 'PERTE', 'INVENTAIRE')),
    sens TEXT NOT NULL CHECK (sens IN ('PLUS', 'MOINS', 'NEUTRE_RESERVATION')),
    quantite REAL NOT NULL CHECK (quantite > 0),
    solde_physique_avant REAL NOT NULL,
    solde_physique_apres REAL NOT NULL,
    document_source_type TEXT NOT NULL,
    document_source_id TEXT NOT NULL,
    motif TEXT NOT NULL,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reservations_stock (
    id TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    quantite_reservee REAL NOT NULL CHECK (quantite_reservee > 0),
    quantite_consommee REAL NOT NULL DEFAULT 0 CHECK (quantite_consommee >= 0),
    quantite_liberee REAL NOT NULL DEFAULT 0 CHECK (quantite_liberee >= 0),
    statut TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'CONSOMMEE', 'LIBEREE_CLOTURE', 'ANNULEE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ajustements_stock (
    id TEXT PRIMARY KEY,
    reference_ajustement TEXT NOT NULL UNIQUE,
    entrepot_id TEXT NOT NULL REFERENCES entrepots(id),
    province_id TEXT REFERENCES provinces(id),
    article_id TEXT NOT NULL REFERENCES articles(id),
    lot_stock_id TEXT NOT NULL REFERENCES lots_stock(id),
    type_ajustement TEXT NOT NULL CHECK (type_ajustement IN ('INVENTAIRE', 'PERTE', 'AVARIE', 'CORRECTION_ERREUR')),
    ecart_quantite REAL NOT NULL, -- positif ou négatif
    motif_detaille TEXT NOT NULL,
    piece_justificative_id TEXT,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

