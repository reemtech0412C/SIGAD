PRAGMA foreign_keys = ON;

CREATE TABLE appareils (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  plateforme TEXT NOT NULL CHECK (plateforme IN ('ANDROID', 'IOS', 'WEB')),
  nom TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 100),
  empreinte_cle TEXT NOT NULL CHECK (length(empreinte_cle) = 64),
  cle_publique_jwk TEXT NOT NULL CHECK (json_valid(cle_publique_jwk)),
  statut TEXT NOT NULL DEFAULT 'EN_ATTENTE'
    CHECK (statut IN ('EN_ATTENTE', 'AUTORISE', 'SUSPENDU', 'REVOQUE')),
  autorise_par TEXT REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  autorise_le TEXT,
  derniere_activite TEXT,
  revoque_le TEXT,
  motif_revocation TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (utilisateur_id, empreinte_cle),
  CHECK ((statut = 'AUTORISE' AND autorise_par IS NOT NULL AND autorise_le IS NOT NULL)
    OR statut <> 'AUTORISE')
);

CREATE TABLE defis_appareils (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  empreinte_cle TEXT NOT NULL CHECK (length(empreinte_cle) = 64),
  cle_publique_jwk TEXT NOT NULL CHECK (json_valid(cle_publique_jwk)),
  valeur_defi TEXT NOT NULL,
  expire_le TEXT NOT NULL,
  consomme_le TEXT,
  appareil_cree_id TEXT REFERENCES appareils(id) ON DELETE RESTRICT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((consomme_le IS NULL AND appareil_cree_id IS NULL)
    OR (consomme_le IS NOT NULL AND appareil_cree_id IS NOT NULL))
);

CREATE TABLE transitions_etat_compte (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  ancien_etat TEXT NOT NULL CHECK (ancien_etat IN
    ('INVITE', 'EN_ATTENTE_APPROBATION', 'REFUSE', 'ACTIF', 'SUSPENDU', 'VERROUILLE', 'EXPIRE', 'REVOQUE', 'ARCHIVE')),
  nouvel_etat TEXT NOT NULL CHECK (nouvel_etat IN
    ('INVITE', 'EN_ATTENTE_APPROBATION', 'REFUSE', 'ACTIF', 'SUSPENDU', 'VERROUILLE', 'EXPIRE', 'REVOQUE', 'ARCHIVE')),
  acteur_id TEXT REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  acteur_role TEXT,
  motif TEXT,
  request_id TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (ancien_etat <> nouvel_etat),
  CHECK (nouvel_etat NOT IN ('SUSPENDU', 'REVOQUE') OR length(trim(coalesce(motif, ''))) >= 10)
);

ALTER TABLE sessions ADD COLUMN appareil_id TEXT REFERENCES appareils(id) ON DELETE RESTRICT;
ALTER TABLE sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'WEB' CHECK (type IN ('WEB', 'MOBILE'));
ALTER TABLE sessions ADD COLUMN motif_revocation TEXT;
ALTER TABLE journaux_audit ADD COLUMN motif TEXT;

CREATE INDEX idx_appareils_utilisateur_statut ON appareils(utilisateur_id, statut, cree_le DESC);
CREATE INDEX idx_appareils_statut_date ON appareils(statut, cree_le DESC);
CREATE INDEX idx_defis_appareils_expiration ON defis_appareils(expire_le, consomme_le);
CREATE INDEX idx_transitions_etat_compte_utilisateur_date
  ON transitions_etat_compte(utilisateur_id, cree_le DESC, id);

CREATE TRIGGER transitions_etat_compte_immuables_update
BEFORE UPDATE ON transitions_etat_compte
BEGIN
  SELECT RAISE(ABORT, 'TRANSITIONS_ETAT_COMPTE_IMMUABLES');
END;

CREATE TRIGGER transitions_etat_compte_immuables_delete
BEFORE DELETE ON transitions_etat_compte
BEGIN
  SELECT RAISE(ABORT, 'TRANSITIONS_ETAT_COMPTE_IMMUABLES');
END;

CREATE TRIGGER controle_session_appareil_avant_insert
BEFORE INSERT ON sessions
WHEN (NEW.type = 'MOBILE' AND NEW.appareil_id IS NULL)
  OR (NEW.appareil_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM appareils a WHERE a.id = NEW.appareil_id
      AND a.utilisateur_id = NEW.utilisateur_id AND a.statut = 'AUTORISE'))
BEGIN
  SELECT RAISE(ABORT, 'SESSION_APPAREIL_NON_AUTORISE');
END;

CREATE TRIGGER controle_session_appareil_avant_update
BEFORE UPDATE OF appareil_id, type, utilisateur_id ON sessions
WHEN (NEW.type = 'MOBILE' AND NEW.appareil_id IS NULL)
  OR (NEW.appareil_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM appareils a WHERE a.id = NEW.appareil_id
      AND a.utilisateur_id = NEW.utilisateur_id AND a.statut = 'AUTORISE'))
BEGIN
  SELECT RAISE(ABORT, 'SESSION_APPAREIL_NON_AUTORISE');
END;

CREATE TRIGGER revoquer_acces_apres_sortie_compte_actif
AFTER UPDATE OF statut ON utilisateurs
WHEN OLD.statut = 'ACTIF' AND NEW.statut <> 'ACTIF'
BEGIN
  UPDATE sessions SET revoquee = 1,
    motif_revocation = coalesce(motif_revocation, 'COMPTE_NON_ACTIF')
    WHERE utilisateur_id = NEW.id AND revoquee = 0;
  UPDATE appareils SET statut = 'REVOQUE', revoque_le = coalesce(revoque_le, datetime('now')),
    motif_revocation = coalesce(motif_revocation, 'COMPTE_NON_ACTIF')
    WHERE utilisateur_id = NEW.id AND statut <> 'REVOQUE';
END;

CREATE TRIGGER revoquer_acces_apres_suspension_consultation
AFTER UPDATE OF statut ON comptes_consultation
WHEN OLD.statut = 'ACTIF' AND NEW.statut <> 'ACTIF'
BEGIN
  UPDATE sessions SET revoquee = 1,
    motif_revocation = coalesce(motif_revocation, 'COMPTE_NON_ACTIF')
    WHERE utilisateur_id = NEW.utilisateur_id AND revoquee = 0;
  UPDATE appareils SET statut = 'REVOQUE', revoque_le = coalesce(revoque_le, datetime('now')),
    motif_revocation = coalesce(motif_revocation, 'COMPTE_NON_ACTIF')
    WHERE utilisateur_id = NEW.utilisateur_id AND statut <> 'REVOQUE';
END;

DROP TRIGGER adapter_journaux_audit_vers_evenements;
CREATE TRIGGER adapter_journaux_audit_vers_evenements
AFTER INSERT ON journaux_audit
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role, portee_gid,
    action, cible_type, cible_id, avant, apres, motif, adresse_ip, resultat, cree_le
  ) VALUES (
    'audit:journaux_audit:' || NEW.id, 'journaux_audit', NEW.id, NEW.request_id,
    NEW.utilisateur_id, NEW.role_utilisateur, NEW.province_id,
    NEW.action, NEW.entite_type, NEW.entite_id, NULL,
    json_object('source_table', 'journaux_audit', 'source_id', NEW.id, 'details_redactes', 1),
    NEW.motif, NEW.adresse_ip, 'SUCCES', NEW.cree_le
  );
END;
