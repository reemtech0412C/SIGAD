ALTER TABLE utilisateurs ADD COLUMN double_facteur_secret_temporaire TEXT;

ALTER TABLE sessions ADD COLUMN mfa_verifiee INTEGER NOT NULL DEFAULT 0
  CHECK (mfa_verifiee IN (0, 1));

CREATE TABLE defis_mfa (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  jeton_hash TEXT NOT NULL UNIQUE,
  expire_le TEXT NOT NULL,
  tentatives INTEGER NOT NULL DEFAULT 0 CHECK (tentatives BETWEEN 0 AND 5),
  consomme INTEGER NOT NULL DEFAULT 0 CHECK (consomme IN (0, 1)),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_defis_mfa_utilisateur_expiration ON defis_mfa(utilisateur_id, consomme, expire_le);

CREATE TABLE compteurs_totp_utilises (
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  compteur INTEGER NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  utilise_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (utilisateur_id, compteur)
);

CREATE TABLE codes_recuperation_mfa (
  empreinte_code TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  utilise_le TEXT,
  operation_id TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (utilisateur_id, empreinte_code)
);

CREATE INDEX idx_codes_recuperation_mfa_utilisateur ON codes_recuperation_mfa(utilisateur_id, utilise_le);
