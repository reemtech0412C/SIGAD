PRAGMA foreign_keys = ON;

CREATE TABLE partenaires (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    nom TEXT NOT NULL UNIQUE,
    sigle TEXT,
    type_organisation TEXT NOT NULL, -- ONG Internationale, Agence ONU, ONG Nationale, État...
    contact_email TEXT,
    contact_telephone TEXT,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'VALIDE', 'INACTIF')),
    propose_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles_partenaires (
    id TEXT PRIMARY KEY,
    partenaire_id TEXT NOT NULL REFERENCES partenaires(id),
    role TEXT NOT NULL CHECK (role IN ('BAILLEUR_DE_FONDS', 'DONATEUR', 'FOURNISSEUR', 'PARTENAIRE_EXECUTION', 'TRANSPORTEUR', 'GESTIONNAIRE_SITE')),
    UNIQUE(partenaire_id, role)
);

CREATE TABLE affectations_partenaires (
    id TEXT PRIMARY KEY,
    partenaire_id TEXT NOT NULL REFERENCES partenaires(id),
    role TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('APPROVISIONNEMENT_CENTRAL', 'DISTRIBUTION_PROVINCIALE', 'SITE_HUMANITAIRE')),
    operation_id TEXT NOT NULL,
    observations TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories_population (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- AUTOCHTONE, DEPLACE_INTERNE, REFUGIE, RETOURNE, HOTE_VULNERABLE
    libelle TEXT NOT NULL,
    description TEXT
);

CREATE TABLE vulnerabilites (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- FEMME_CHEF_MENAGE, HANDICAP, PERSONNE_AGEE, ENFANT_NON_ACCOMPAGNE, MALNUTRITION
    libelle TEXT NOT NULL,
    niveau_priorite INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE menages (
    id TEXT PRIMARY KEY,
    code_menage TEXT NOT NULL UNIQUE, -- ex: 'MEN-OD-2026-000145'
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT NOT NULL REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    localite_id TEXT REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id),
    quartier_id TEXT REFERENCES quartiers(id),
    carre_id TEXT REFERENCES carres(id),
    site_humanitaire_id TEXT REFERENCES sites_humanitaires(id),
    nom_chef_menage TEXT NOT NULL,
    sexe_chef TEXT NOT NULL CHECK (sexe_chef IN ('M', 'F')),
    nombre_personnes INTEGER NOT NULL CHECK (nombre_personnes > 0),
    telephone TEXT,
    categorie_population_id TEXT NOT NULL REFERENCES categories_population(id),
    criteres_vulnerabilite TEXT, -- JSON Array of codes
    date_enregistrement TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF', 'DOUBLON_SUSPECTE', 'ARCHIVE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE membres_menage (
    id TEXT PRIMARY KEY,
    menage_id TEXT NOT NULL REFERENCES menages(id),
    nom_complet TEXT NOT NULL,
    sexe TEXT NOT NULL CHECK (sexe IN ('M', 'F')),
    annee_naissance INTEGER,
    lien_parente TEXT NOT NULL,
    identifiant_individuel TEXT
);

CREATE TABLE listes_beneficiaires (
    id TEXT PRIMARY KEY,
    reference_liste TEXT NOT NULL UNIQUE,
    intitule TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    nombre_menages_cibles INTEGER NOT NULL DEFAULT 0,
    nombre_personnes_cibles INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'PRETE', 'VERROUILLEE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE inscriptions_beneficiaires (
    id TEXT PRIMARY KEY,
    liste_id TEXT NOT NULL REFERENCES listes_beneficiaires(id),
    menage_id TEXT NOT NULL REFERENCES menages(id),
    ordre_affichage INTEGER,
    statut_verification TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_verification IN ('VALIDE', 'ECARTE_DOUBLON', 'EN_VERIFICATION')),
    UNIQUE(liste_id, menage_id)
);

CREATE TABLE signalements_doublons (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    menage_source_id TEXT NOT NULL REFERENCES menages(id),
    menage_suspect_id TEXT NOT NULL REFERENCES menages(id),
    motif_similitude TEXT NOT NULL, -- ex: 'MEME_TELEPHONE', 'NOM_ET_LOCALITE_SIMILAIRES'
    statut_traitement TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_traitement IN ('EN_ATTENTE', 'CONFIRME_DISTINCT', 'CONFIRME_DOUBLON')),
    traite_par TEXT REFERENCES utilisateurs(id),
    observations TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

