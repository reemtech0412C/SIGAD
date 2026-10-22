PRAGMA foreign_keys = ON;

CREATE TABLE utilisateurs (
    id TEXT PRIMARY KEY,
    identifiant TEXT NOT NULL UNIQUE, -- ex: 'proprietaire', 'central', 'ouaddai', 'sila'...
    nom_complet TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL', 'DELEGUE_PROVINCIAL')),
    province_id TEXT, -- NULL للمالك والمركزي، وإجباري للمندوب الولائي
    mot_de_passe_hash TEXT NOT NULL,
    code_activation_hash TEXT,
    doit_changer_mot_de_passe INTEGER NOT NULL DEFAULT 1, -- 1 = Oui, 0 = Non
    double_facteur_secret TEXT,
    double_facteur_actif INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'VERROUILLE')),
    tentatives_echouees INTEGER NOT NULL DEFAULT 0,
    verrouille_jusqua TEXT,
    derniere_connexion TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((role = 'DELEGUE_PROVINCIAL' AND province_id IS NOT NULL) OR (role IN ('PROPRIETAIRE', 'ADMIN_CENTRAL') AND province_id IS NULL))
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    jeton_hash TEXT NOT NULL UNIQUE,
    jeton_csrf TEXT NOT NULL,
    adresse_ip TEXT,
    agent_utilisateur TEXT,
    expire_le TEXT NOT NULL,
    revoquee INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE evenements_connexion (
    id TEXT PRIMARY KEY,
    identifiant_tente TEXT NOT NULL,
    utilisateur_id TEXT REFERENCES utilisateurs(id),
    succes INTEGER NOT NULL,
    motif_echec TEXT,
    adresse_ip TEXT,
    agent_utilisateur TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE journaux_audit (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    role_utilisateur TEXT NOT NULL,
    province_id TEXT,
    action TEXT NOT NULL, -- ex: 'CREATION_APPROVISIONNEMENT', 'VALIDATION_DISTRIBUTION'
    entite_type TEXT NOT NULL,
    entite_id TEXT NOT NULL,
    donnees_avant TEXT, -- JSON
    donnees_apres TEXT, -- JSON
    adresse_ip TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE parametres_systeme (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL,
    description TEXT NOT NULL,
    modifie_par TEXT REFERENCES utilisateurs(id),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_utilisateur_expiration ON sessions(utilisateur_id, revoquee, expire_le DESC);
CREATE INDEX idx_evenements_connexion_identifiant_date ON evenements_connexion(identifiant_tente, cree_le DESC);
CREATE INDEX idx_journaux_audit_province_date ON journaux_audit(province_id, cree_le DESC);

