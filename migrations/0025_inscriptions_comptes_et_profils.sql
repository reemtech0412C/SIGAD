PRAGMA foreign_keys = ON;

ALTER TABLE utilisateurs ADD COLUMN courriel TEXT;
ALTER TABLE utilisateurs ADD COLUMN courriel_verifie_le TEXT;
ALTER TABLE utilisateurs ADD COLUMN telephone TEXT;

CREATE UNIQUE INDEX idx_utilisateurs_courriel_unique
  ON utilisateurs(lower(trim(courriel)))
  WHERE courriel IS NOT NULL AND length(trim(courriel)) > 0;

CREATE UNIQUE INDEX idx_delegues_actifs_province_unique
  ON utilisateurs(province_id)
  WHERE role = 'DELEGUE_PROVINCIAL' AND statut = 'ACTIF';

CREATE TABLE inscriptions_delegues (
  id TEXT PRIMARY KEY,
  nom_complet TEXT NOT NULL CHECK (length(trim(nom_complet)) BETWEEN 3 AND 160),
  province_id TEXT NOT NULL REFERENCES provinces(id),
  courriel TEXT NOT NULL CHECK (length(trim(courriel)) BETWEEN 5 AND 254),
  telephone TEXT NOT NULL CHECK (length(trim(telephone)) BETWEEN 7 AND 30),
  mot_de_passe_hash TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'EMAIL_NON_VERIFIE'
    CHECK (statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION', 'APPROUVEE', 'REFUSEE')),
  courriel_verifie_le TEXT,
  conflit_delegation INTEGER NOT NULL DEFAULT 0 CHECK (conflit_delegation IN (0, 1)),
  motif_decision TEXT,
  decide_par TEXT REFERENCES utilisateurs(id),
  decide_le TEXT,
  utilisateur_cree_id TEXT REFERENCES utilisateurs(id),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION') AND decide_par IS NULL AND decide_le IS NULL)
      OR (statut IN ('APPROUVEE', 'REFUSEE') AND decide_par IS NOT NULL AND decide_le IS NOT NULL))
);

CREATE UNIQUE INDEX idx_inscriptions_delegues_courriel_en_cours_unique
  ON inscriptions_delegues(lower(trim(courriel)))
  WHERE statut IN ('EMAIL_NON_VERIFIE', 'EN_ATTENTE_APPROBATION');
CREATE INDEX idx_inscriptions_delegues_statut_date
  ON inscriptions_delegues(statut, cree_le DESC, id);
CREATE INDEX idx_inscriptions_delegues_province_statut
  ON inscriptions_delegues(province_id, statut, cree_le DESC);

CREATE TABLE journaux_inscriptions (
  id TEXT PRIMARY KEY,
  inscription_id TEXT NOT NULL REFERENCES inscriptions_delegues(id),
  action TEXT NOT NULL CHECK (action IN ('INSCRIPTION_RECUE', 'CODE_ENVOYE', 'EMAIL_VERIFIE', 'DECISION_ADMINISTRATIVE')),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_journaux_inscriptions_demande_date
  ON journaux_inscriptions(inscription_id, cree_le DESC);

CREATE TABLE verifications_courriel (
  id TEXT PRIMARY KEY,
  inscription_id TEXT REFERENCES inscriptions_delegues(id),
  utilisateur_id TEXT REFERENCES utilisateurs(id),
  type_verification TEXT NOT NULL CHECK (type_verification IN ('INSCRIPTION_DELEGUE', 'MODIFICATION_PROFIL', 'INVITATION_CONSULTATION')),
  courriel_cible TEXT NOT NULL CHECK (length(trim(courriel_cible)) BETWEEN 5 AND 254),
  empreinte_code TEXT NOT NULL,
  expire_le TEXT NOT NULL,
  tentatives INTEGER NOT NULL DEFAULT 0 CHECK (tentatives BETWEEN 0 AND 5),
  consomme_le TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((inscription_id IS NOT NULL AND utilisateur_id IS NULL AND type_verification = 'INSCRIPTION_DELEGUE')
      OR (inscription_id IS NULL AND utilisateur_id IS NOT NULL AND type_verification IN ('MODIFICATION_PROFIL', 'INVITATION_CONSULTATION'))),
  CHECK (datetime(expire_le) > datetime(cree_le))
);

CREATE UNIQUE INDEX idx_verifications_courriel_inscription_active_unique
  ON verifications_courriel(inscription_id)
  WHERE inscription_id IS NOT NULL AND consomme_le IS NULL;
CREATE UNIQUE INDEX idx_verifications_courriel_utilisateur_active_unique
  ON verifications_courriel(utilisateur_id, type_verification)
  WHERE utilisateur_id IS NOT NULL AND consomme_le IS NULL;
CREATE INDEX idx_verifications_courriel_expiration
  ON verifications_courriel(expire_le, consomme_le);

CREATE TABLE limites_inscription_publique (
  empreinte_cle TEXT PRIMARY KEY,
  compteur INTEGER NOT NULL CHECK (compteur >= 1),
  fenetre_debut TEXT NOT NULL,
  modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE decisions_comptes (
  id TEXT PRIMARY KEY,
  acteur_id TEXT NOT NULL REFERENCES utilisateurs(id),
  inscription_id TEXT REFERENCES inscriptions_delegues(id),
  utilisateur_cible_id TEXT REFERENCES utilisateurs(id),
  action TEXT NOT NULL CHECK (action IN ('APPROBATION_DELEGUE', 'REFUS_DELEGUE', 'SUSPENSION_DELEGUE', 'REACTIVATION_DELEGUE', 'REMPLACEMENT_DELEGUE', 'REVOCATION_SESSIONS_DELEGUE', 'REEMISSION_INVITATION_DELEGUE', 'CREATION_COMPTE_CONSULTATION', 'REEMISSION_INVITATION_CONSULTATION', 'SUSPENSION_COMPTE_CONSULTATION', 'REACTIVATION_COMPTE_CONSULTATION', 'REVOCATION_SESSIONS_CONSULTATION', 'MODIFICATION_PERIMETRE_CONSULTATION')),
  motif TEXT NOT NULL CHECK (length(trim(motif)) BETWEEN 10 AND 500),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (inscription_id IS NOT NULL OR utilisateur_cible_id IS NOT NULL)
);
CREATE INDEX idx_decisions_comptes_cible_date
  ON decisions_comptes(utilisateur_cible_id, cree_le DESC);
CREATE INDEX idx_decisions_comptes_inscription_date
  ON decisions_comptes(inscription_id, cree_le DESC);

CREATE TABLE comptes_consultation (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL UNIQUE REFERENCES utilisateurs(id),
  institution TEXT NOT NULL CHECK (length(trim(institution)) BETWEEN 2 AND 180),
  fonction TEXT NOT NULL CHECK (length(trim(fonction)) BETWEEN 2 AND 180),
  perimetre TEXT NOT NULL CHECK (perimetre IN ('NATIONAL', 'PROVINCIAL', 'MULTI_PROVINCIAL')),
  statut TEXT NOT NULL CHECK (statut IN ('INVITE', 'ACTIF', 'SUSPENDU')),
  cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE perimetres_provinciaux_consultation (
  compte_consultation_id TEXT NOT NULL REFERENCES comptes_consultation(id),
  province_id TEXT NOT NULL REFERENCES provinces(id),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (compte_consultation_id, province_id)
);
CREATE INDEX idx_perimetres_consultation_province
  ON perimetres_provinciaux_consultation(province_id, compte_consultation_id);

CREATE TRIGGER trg_perimetre_consultation_coherent_insert
BEFORE INSERT ON perimetres_provinciaux_consultation
WHEN NOT EXISTS (
  SELECT 1 FROM comptes_consultation c
  WHERE c.id = NEW.compte_consultation_id AND c.perimetre IN ('PROVINCIAL', 'MULTI_PROVINCIAL')
)
BEGIN
  SELECT RAISE(ABORT, 'Le périmètre provincial du compte consultatif est incohérent.');
END;

CREATE TRIGGER trg_compte_consultation_perimetre_national
BEFORE UPDATE OF perimetre ON comptes_consultation
WHEN NEW.perimetre = 'NATIONAL' AND EXISTS (
  SELECT 1 FROM perimetres_provinciaux_consultation p WHERE p.compte_consultation_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'Un compte national ne porte pas de liste provinciale.');
END;

