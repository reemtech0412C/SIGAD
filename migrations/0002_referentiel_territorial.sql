PRAGMA foreign_keys = ON;

CREATE TABLE provinces (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- ex: 'TD-OD' (Ouaddaï), 'TD-SI' (Sila)
    identifiant_compte TEXT NOT NULL UNIQUE, -- ex: 'ouaddai', 'sila'
    nom TEXT NOT NULL UNIQUE,
    chef_lieu TEXT NOT NULL,
    statut_particulier INTEGER NOT NULL DEFAULT 0, -- 1 pour N'Djamena
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE departements (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    chef_lieu TEXT,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sous_prefectures (
    id TEXT PRIMARY KEY,
    departement_id TEXT NOT NULL REFERENCES departements(id),
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE communes (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    type_commune TEXT NOT NULL CHECK (type_commune IN ('URBAINE', 'RURALE')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'ARCHIVE')),
    source_officielle TEXT DEFAULT 'Loi Organique 015/CNT/2024',
    date_effet TEXT,
    actif INTEGER NOT NULL DEFAULT 1
);

-- يدعم ارتباط البلدية بمحافظة فرعية أو أكثر مع توثيق المصدر وفترة السريان
CREATE TABLE rattachements_territoriaux (
    id TEXT PRIMARY KEY,
    commune_id TEXT NOT NULL REFERENCES communes(id),
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    source_juridique TEXT NOT NULL,
    date_debut_validite TEXT NOT NULL,
    date_fin_validite TEXT,
    est_principal INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cantons (
    id TEXT PRIMARY KEY,
    sous_prefecture_id TEXT NOT NULL REFERENCES sous_prefectures(id),
    nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'REJETE')),
    cree_par TEXT REFERENCES utilisateurs(id)
);

-- يشمل المدن والقرى والـ Ferricks والـ Campements مع تحديد نوع التقسيم الحضري للمدن
CREATE TABLE localites (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    canton_id TEXT REFERENCES cantons(id),
    nom TEXT NOT NULL,
    type_localite TEXT NOT NULL CHECK (type_localite IN ('VILLE', 'VILLAGE', 'FERRICK', 'CAMPEMENT')),
    mode_decoupage_urbain TEXT NOT NULL DEFAULT 'AUCUN' CHECK (mode_decoupage_urbain IN ('AUCUN', 'SANS_ARRONDISSEMENT', 'AVEC_ARRONDISSEMENTS')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'REJETE')),
    source_documentation TEXT,
    date_effet TEXT,
    propose_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE arrondissements (
    id TEXT PRIMARY KEY,
    localite_id TEXT NOT NULL REFERENCES localites(id), -- المدينة التي تقبل دوائر
    commune_id TEXT REFERENCES communes(id),
    code TEXT,
    nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE'
);

CREATE TABLE quartiers (
    id TEXT PRIMARY KEY,
    localite_id TEXT NOT NULL REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id), -- NULL إذا كانت المدينة بدون دوائر
    nom TEXT NOT NULL,
    possede_carres INTEGER NOT NULL DEFAULT 0,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'REJETE')),
    propose_par TEXT REFERENCES utilisateurs(id)
);

CREATE TABLE carres (
    id TEXT PRIMARY KEY,
    quartier_id TEXT NOT NULL REFERENCES quartiers(id),
    code_ou_nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE'
);

CREATE TABLE sites_humanitaires (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    localite_proche_id TEXT REFERENCES localites(id),
    code_site TEXT UNIQUE,
    nom TEXT NOT NULL,
    categorie_site TEXT NOT NULL CHECK (categorie_site IN ('CAMP_REFUGIES', 'SITE_DEPLACES', 'CENTRE_ACCUEIL', 'SITE_TRANSIT', 'AUTRE_SITE')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'FERME')),
    propose_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE historique_decoupages (
    id TEXT PRIMARY KEY,
    entite_type TEXT NOT NULL,
    entite_id TEXT NOT NULL,
    type_modification TEXT NOT NULL,
    anciennes_valeurs TEXT, -- JSON
    nouvelles_valeurs TEXT, -- JSON
    source_officielle TEXT,
    date_effet TEXT NOT NULL,
    auteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

