PRAGMA foreign_keys = ON;

CREATE TABLE preuves_operateur_recuperation (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
  acteur_identite TEXT NOT NULL,
  nonce_hash TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL CHECK (operation IN ('EMETTRE_ACTIVATION_INITIALE', 'REVOQUER_ACTIVATION_INITIALE')),
  motif TEXT NOT NULL CHECK (length(trim(motif)) BETWEEN 10 AND 300),
  preuve_expire_le TEXT NOT NULL,
  consommee_le TEXT NOT NULL DEFAULT (datetime('now')),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (datetime(preuve_expire_le) > datetime(cree_le))
);

CREATE TABLE recuperations_acces_proprietaire (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
  preuve_emission_id TEXT NOT NULL UNIQUE REFERENCES preuves_operateur_recuperation(id),
  activation_expire_le TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  jeton_consomme_le TEXT,
  session_id TEXT REFERENCES sessions(id),
  defi_mfa_id TEXT REFERENCES defis_mfa(id),
  mot_de_passe_change_le TEXT,
  terminee_le TEXT,
  revoquee_le TEXT,
  preuve_revocation_id TEXT UNIQUE REFERENCES preuves_operateur_recuperation(id),
  CHECK (datetime(activation_expire_le) > datetime(cree_le)),
  CHECK (session_id IS NULL OR defi_mfa_id IS NULL),
  CHECK (terminee_le IS NULL OR mot_de_passe_change_le IS NOT NULL),
  CHECK (terminee_le IS NULL OR revoquee_le IS NULL),
  CHECK (revoquee_le IS NULL OR preuve_revocation_id IS NOT NULL)
);

CREATE INDEX idx_preuves_operateur_cible_date
  ON preuves_operateur_recuperation(utilisateur_id, cree_le DESC);

CREATE INDEX idx_recuperations_proprietaire_date
  ON recuperations_acces_proprietaire(utilisateur_id, cree_le DESC);

CREATE UNIQUE INDEX idx_recuperation_proprietaire_ouverte_unique
  ON recuperations_acces_proprietaire(utilisateur_id)
  WHERE terminee_le IS NULL AND revoquee_le IS NULL;

CREATE TRIGGER trg_preuve_operateur_cible
BEFORE INSERT ON preuves_operateur_recuperation
WHEN NOT EXISTS (
  SELECT 1 FROM utilisateurs
  WHERE id = NEW.utilisateur_id
    AND identifiant = 'proprietaire'
    AND role = 'PROPRIETAIRE'
)
BEGIN
  SELECT RAISE(ABORT, 'La récupération est réservée au compte propriétaire SIGAD.');
END;

CREATE TRIGGER trg_preuve_operateur_immuable_update
BEFORE UPDATE ON preuves_operateur_recuperation
BEGIN
  SELECT RAISE(ABORT, 'Une preuve opérateur consommée est immuable.');
END;

CREATE TRIGGER trg_preuve_operateur_immuable_delete
BEFORE DELETE ON preuves_operateur_recuperation
BEGIN
  SELECT RAISE(ABORT, 'Une preuve opérateur consommée ne peut pas être supprimée.');
END;

CREATE TRIGGER trg_recuperation_proprietaire_cible
BEFORE INSERT ON recuperations_acces_proprietaire
WHEN NOT EXISTS (
  SELECT 1 FROM utilisateurs
  WHERE id = NEW.utilisateur_id
    AND identifiant = 'proprietaire'
    AND role = 'PROPRIETAIRE'
)
BEGIN
  SELECT RAISE(ABORT, 'La récupération est réservée au compte propriétaire SIGAD.');
END;

CREATE TRIGGER trg_recuperation_proprietaire_immuable_delete
BEFORE DELETE ON recuperations_acces_proprietaire
BEGIN
  SELECT RAISE(ABORT, 'Un dossier de récupération ne peut pas être supprimé.');
END;

ALTER TABLE utilisateurs ADD COLUMN code_activation_expire_le TEXT;
ALTER TABLE utilisateurs ADD COLUMN code_activation_recuperation_id TEXT
  REFERENCES recuperations_acces_proprietaire(id);

ALTER TABLE sessions ADD COLUMN activation_initiale INTEGER NOT NULL DEFAULT 0
  CHECK (activation_initiale IN (0, 1));
ALTER TABLE sessions ADD COLUMN recuperation_id TEXT
  REFERENCES recuperations_acces_proprietaire(id);

ALTER TABLE defis_mfa ADD COLUMN activation_initiale INTEGER NOT NULL DEFAULT 0
  CHECK (activation_initiale IN (0, 1));
ALTER TABLE defis_mfa ADD COLUMN recuperation_id TEXT
  REFERENCES recuperations_acces_proprietaire(id);

CREATE INDEX idx_utilisateurs_activation_expiration
  ON utilisateurs(code_activation_expire_le)
  WHERE code_activation_hash IS NOT NULL;

CREATE INDEX idx_sessions_activation_initiale
  ON sessions(utilisateur_id, activation_initiale, revoquee);
