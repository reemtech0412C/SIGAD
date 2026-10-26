PRAGMA foreign_keys = ON;

-- B2.3-A: empty, additive target model. No legacy rows are copied and no
-- authorization, beneficiary, stock or distribution table is modified here.
CREATE TABLE geo_sources (
  source_id TEXT PRIMARY KEY CHECK (length(trim(source_id)) BETWEEN 1 AND 160),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('LEGAL', 'STATISTICAL', 'BOUNDARY', 'OPERATIONAL', 'LEGACY', 'TEST')),
  reference_code TEXT,
  titre TEXT NOT NULL CHECK (length(trim(titre)) BETWEEN 1 AND 300),
  edition TEXT,
  date_reference TEXT,
  date_publication TEXT,
  valide_du TEXT,
  valide_au TEXT,
  editeur TEXT,
  licence TEXT,
  uri TEXT,
  sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-fA-F]*')),
  exhaustivite TEXT NOT NULL DEFAULT 'INCONNUE' CHECK (exhaustivite IN ('INCONNUE', 'PARTIELLE', 'COMPLETE')),
  statut_verification TEXT NOT NULL DEFAULT 'NON_VERIFIE' CHECK (statut_verification IN ('NON_VERIFIE', 'VERIFIE', 'REJETE')),
  verifie_par TEXT,
  verifie_le TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (valide_au IS NULL OR valide_du IS NULL OR valide_au > valide_du),
  CHECK (valide_du IS NULL OR (length(valide_du) = 10 AND date(valide_du) = valide_du)),
  CHECK (valide_au IS NULL OR (length(valide_au) = 10 AND date(valide_au) = valide_au)),
  CHECK ((statut_verification = 'VERIFIE' AND verifie_par IS NOT NULL AND verifie_le IS NOT NULL)
      OR (statut_verification <> 'VERIFIE' AND verifie_par IS NULL AND verifie_le IS NULL))
);

CREATE TABLE geo_types_unites (
  type_code TEXT PRIMARY KEY CHECK (length(trim(type_code)) BETWEEN 1 AND 80),
  famille TEXT NOT NULL CHECK (famille IN ('ADMINISTRATIVE', 'HUMANITAIRE', 'OPERATIONNELLE')),
  libelle TEXT NOT NULL CHECK (length(trim(libelle)) BETWEEN 1 AND 160),
  parent_obligatoire INTEGER NOT NULL DEFAULT 1 CHECK (parent_obligatoire IN (0, 1)),
  autorise_racine INTEGER NOT NULL DEFAULT 0 CHECK (autorise_racine IN (0, 1)),
  statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'RETIRE')),
  source_id TEXT REFERENCES geo_sources(source_id),
  version_source TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (NOT (parent_obligatoire = 1 AND autorise_racine = 1))
);

CREATE TABLE geo_regles_parente (
  regle_id TEXT PRIMARY KEY CHECK (length(trim(regle_id)) BETWEEN 1 AND 160),
  type_enfant TEXT NOT NULL REFERENCES geo_types_unites(type_code),
  type_parent TEXT NOT NULL REFERENCES geo_types_unites(type_code),
  source_id TEXT REFERENCES geo_sources(source_id),
  citation_source TEXT,
  statut TEXT NOT NULL DEFAULT 'PROPOSE' CHECK (statut IN ('PROPOSE', 'APPROUVE', 'REJETE', 'RETIRE')),
  valide_du TEXT,
  valide_au TEXT,
  propose_par TEXT,
  approuve_par TEXT,
  autorite_approbatrice TEXT,
  approuve_le TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (type_enfant <> type_parent),
  CHECK (valide_au IS NULL OR valide_du IS NULL OR valide_au > valide_du),
  CHECK (valide_du IS NULL OR (length(valide_du) = 10 AND date(valide_du) = valide_du)),
  CHECK (valide_au IS NULL OR (length(valide_au) = 10 AND date(valide_au) = valide_au)),
  CHECK (statut <> 'APPROUVE' OR (
    source_id IS NOT NULL AND length(trim(coalesce(citation_source, ''))) > 0
    AND propose_par IS NOT NULL AND approuve_par IS NOT NULL AND approuve_par <> propose_par
    AND length(trim(coalesce(autorite_approbatrice, ''))) > 0 AND approuve_le IS NOT NULL
  ))
);

CREATE UNIQUE INDEX idx_geo_regles_parente_approuvee
  ON geo_regles_parente(type_enfant, type_parent)
  WHERE statut = 'APPROUVE' AND valide_au IS NULL;

CREATE TABLE geo_unites (
  gid TEXT PRIMARY KEY CHECK (length(trim(gid)) BETWEEN 1 AND 160),
  type_code TEXT NOT NULL REFERENCES geo_types_unites(type_code),
  nom TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 200),
  nom_normalise TEXT NOT NULL CHECK (length(trim(nom_normalise)) BETWEEN 1 AND 200),
  nom_ar TEXT,
  statut_validation TEXT NOT NULL DEFAULT 'PROPOSE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'ARCHIVE')),
  statut_operationnel TEXT NOT NULL DEFAULT 'INACTIF' CHECK (statut_operationnel IN ('INACTIF', 'ACTIF', 'SUSPENDU', 'ARCHIVE')),
  source_id TEXT REFERENCES geo_sources(source_id),
  version_source TEXT,
  citation_source TEXT,
  date_reference TEXT,
  source_verifiee_le TEXT,
  propose_par TEXT,
  approuve_par TEXT,
  autorite_approbatrice TEXT,
  approuve_le TEXT,
  legacy_table TEXT,
  legacy_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((legacy_table IS NULL AND legacy_id IS NULL) OR (legacy_table IS NOT NULL AND legacy_id IS NOT NULL)),
  CHECK (date_reference IS NULL OR (length(date_reference) = 10 AND date(date_reference) = date_reference)),
  CHECK (statut_operationnel <> 'ACTIF' OR statut_validation = 'VALIDE'),
  CHECK (statut_validation <> 'VALIDE' OR (
    source_id IS NOT NULL AND length(trim(coalesce(citation_source, ''))) > 0
    AND source_verifiee_le IS NOT NULL
    AND propose_par IS NOT NULL AND approuve_par IS NOT NULL AND approuve_par <> propose_par
    AND length(trim(coalesce(autorite_approbatrice, ''))) > 0 AND approuve_le IS NOT NULL
  )),
  UNIQUE (legacy_table, legacy_id)
);

CREATE INDEX idx_geo_unites_type_statut ON geo_unites(type_code, statut_validation, statut_operationnel, gid);
CREATE INDEX idx_geo_unites_nom_normalise ON geo_unites(nom_normalise, type_code, gid);

CREATE TABLE geo_rattachements (
  rattachement_id TEXT PRIMARY KEY CHECK (length(trim(rattachement_id)) BETWEEN 1 AND 160),
  enfant_gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  parent_gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  statut TEXT NOT NULL DEFAULT 'PROPOSE' CHECK (statut IN ('PROPOSE', 'VALIDE', 'REJETE', 'ARCHIVE')),
  valide_du TEXT NOT NULL,
  valide_au TEXT,
  source_id TEXT REFERENCES geo_sources(source_id),
  version_source TEXT,
  citation_source TEXT,
  propose_par TEXT,
  approuve_par TEXT,
  autorite_approbatrice TEXT,
  approuve_le TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (enfant_gid <> parent_gid),
  CHECK (valide_au IS NULL OR valide_au > valide_du),
  CHECK (length(valide_du) = 10 AND date(valide_du) = valide_du),
  CHECK (valide_au IS NULL OR (length(valide_au) = 10 AND date(valide_au) = valide_au)),
  CHECK (statut <> 'VALIDE' OR (
    source_id IS NOT NULL AND length(trim(coalesce(citation_source, ''))) > 0
    AND propose_par IS NOT NULL AND approuve_par IS NOT NULL AND approuve_par <> propose_par
    AND length(trim(coalesce(autorite_approbatrice, ''))) > 0 AND approuve_le IS NOT NULL
  ))
);

CREATE INDEX idx_geo_rattachements_parent_courant
  ON geo_rattachements(parent_gid, statut, valide_du, valide_au, enfant_gid);
CREATE INDEX idx_geo_rattachements_enfant_historique
  ON geo_rattachements(enfant_gid, valide_du, valide_au);
CREATE UNIQUE INDEX idx_geo_rattachements_parent_courant_unique
  ON geo_rattachements(enfant_gid)
  WHERE statut = 'VALIDE' AND valide_au IS NULL;

CREATE TABLE geo_fermeture (
  ancetre_gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  descendant_gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  profondeur INTEGER NOT NULL CHECK (profondeur >= 1),
  version_calcul INTEGER NOT NULL DEFAULT 1 CHECK (version_calcul >= 1),
  calcule_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ancetre_gid, descendant_gid),
  CHECK (ancetre_gid <> descendant_gid)
);

CREATE INDEX idx_geo_fermeture_descendant ON geo_fermeture(descendant_gid, profondeur, ancetre_gid);

CREATE TABLE geo_codes_externes (
  systeme TEXT NOT NULL CHECK (length(trim(systeme)) BETWEEN 1 AND 80),
  code_externe TEXT NOT NULL CHECK (length(trim(code_externe)) BETWEEN 1 AND 160),
  gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES geo_sources(source_id),
  version_source TEXT NOT NULL,
  verifie_le TEXT,
  PRIMARY KEY (systeme, code_externe)
);

CREATE INDEX idx_geo_codes_externes_gid ON geo_codes_externes(gid, systeme);

CREATE TABLE geo_alias (
  alias_id TEXT PRIMARY KEY CHECK (length(trim(alias_id)) BETWEEN 1 AND 160),
  gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  nom_alias TEXT NOT NULL CHECK (length(trim(nom_alias)) BETWEEN 1 AND 200),
  nom_normalise TEXT NOT NULL CHECK (length(trim(nom_normalise)) BETWEEN 1 AND 200),
  langue TEXT,
  type_alias TEXT NOT NULL DEFAULT 'ALTERNATIF' CHECK (type_alias IN ('ALTERNATIF', 'ARABE', 'ANCIEN', 'VARIANTE')),
  source_id TEXT NOT NULL REFERENCES geo_sources(source_id),
  version_source TEXT,
  verifie_le TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (gid, nom_normalise, type_alias)
);

CREATE INDEX idx_geo_alias_nom ON geo_alias(nom_normalise, gid);

CREATE TABLE geo_journal_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  evenement TEXT NOT NULL CHECK (evenement IN ('UNITE_CREEE', 'UNITE_MODIFIEE', 'RATTACHEMENT_CREE', 'RATTACHEMENT_MODIFIE')),
  gid TEXT NOT NULL REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  parent_gid TEXT REFERENCES geo_unites(gid) ON DELETE RESTRICT,
  version_schema INTEGER NOT NULL DEFAULT 1 CHECK (version_schema >= 1),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER geo_sources_verification_coherente
BEFORE UPDATE OF statut_verification, verifie_par, verifie_le ON geo_sources
WHEN NEW.statut_verification = 'VERIFIE'
BEGIN
  SELECT CASE WHEN length(trim(coalesce(NEW.verifie_par, ''))) = 0 OR NEW.verifie_le IS NULL
    THEN RAISE(ABORT, 'geo_source_verification_metadata_required') END;
END;

CREATE TRIGGER geo_regles_parente_approbation_source
BEFORE INSERT ON geo_regles_parente
WHEN NEW.statut = 'APPROUVE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM geo_sources s
    JOIN geo_types_unites enfant ON enfant.type_code = NEW.type_enfant
    JOIN geo_types_unites parent ON parent.type_code = NEW.type_parent
    WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
      AND enfant.statut = 'ACTIF' AND parent.statut = 'ACTIF'
      AND ((enfant.famille = 'ADMINISTRATIVE' AND s.source_kind = 'LEGAL')
        OR (enfant.famille <> 'ADMINISTRATIVE' AND s.source_kind = 'OPERATIONAL'))
  ) THEN RAISE(ABORT, 'geo_parent_rule_requires_verified_source') END;
END;

CREATE TRIGGER geo_regles_parente_approbation_source_maj
BEFORE UPDATE OF statut, source_id ON geo_regles_parente
WHEN NEW.statut = 'APPROUVE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM geo_sources s
    JOIN geo_types_unites enfant ON enfant.type_code = NEW.type_enfant
    JOIN geo_types_unites parent ON parent.type_code = NEW.type_parent
    WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
      AND enfant.statut = 'ACTIF' AND parent.statut = 'ACTIF'
      AND ((enfant.famille = 'ADMINISTRATIVE' AND s.source_kind = 'LEGAL')
        OR (enfant.famille <> 'ADMINISTRATIVE' AND s.source_kind = 'OPERATIONAL'))
  ) THEN RAISE(ABORT, 'geo_parent_rule_requires_verified_source') END;
END;

CREATE TRIGGER geo_unite_approbation_source
BEFORE INSERT ON geo_unites
WHEN NEW.statut_validation = 'VALIDE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM geo_sources s JOIN geo_types_unites t ON t.type_code = NEW.type_code
    WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
      AND ((t.famille = 'ADMINISTRATIVE' AND s.source_kind = 'LEGAL')
        OR (t.famille <> 'ADMINISTRATIVE' AND s.source_kind = 'OPERATIONNEL'))
  ) THEN RAISE(ABORT, 'geo_unit_requires_verified_source_for_type') END;
END;

CREATE TRIGGER geo_unite_approbation_source_maj
BEFORE UPDATE OF statut_validation, source_id, type_code ON geo_unites
WHEN NEW.statut_validation = 'VALIDE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM geo_sources s JOIN geo_types_unites t ON t.type_code = NEW.type_code
    WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
      AND ((t.famille = 'ADMINISTRATIVE' AND s.source_kind = 'LEGAL')
        OR (t.famille <> 'ADMINISTRATIVE' AND s.source_kind = 'OPERATIONNEL'))
  ) THEN RAISE(ABORT, 'geo_unit_requires_verified_source_for_type') END;
END;

CREATE TRIGGER geo_unite_activation_parent
BEFORE UPDATE OF statut_operationnel, statut_validation ON geo_unites
WHEN NEW.statut_operationnel = 'ACTIF'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM geo_types_unites t WHERE t.type_code = NEW.type_code AND t.parent_obligatoire = 1
  ) AND NOT EXISTS (
    SELECT 1 FROM geo_rattachements r
    WHERE r.enfant_gid = NEW.gid AND r.statut = 'VALIDE' AND r.valide_au IS NULL
      AND r.valide_du <= date('now')
  ) THEN RAISE(ABORT, 'geo_unit_activation_requires_valid_parent') END;
END;

CREATE TRIGGER geo_rattachement_validation
BEFORE INSERT ON geo_rattachements
WHEN NEW.statut = 'VALIDE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM geo_unites enfant
    JOIN geo_unites parent ON parent.gid = NEW.parent_gid
    JOIN geo_types_unites te ON te.type_code = enfant.type_code
    JOIN geo_types_unites tp ON tp.type_code = parent.type_code
    JOIN geo_regles_parente regle ON regle.type_enfant = te.type_code AND regle.type_parent = tp.type_code
      AND regle.statut = 'APPROUVE'
      AND (regle.valide_du IS NULL OR regle.valide_du <= NEW.valide_du)
      AND (regle.valide_au IS NULL OR regle.valide_au > NEW.valide_du)
    JOIN geo_sources source ON source.source_id = NEW.source_id AND source.statut_verification = 'VERIFIE'
    WHERE enfant.gid = NEW.enfant_gid AND enfant.statut_validation = 'VALIDE'
      AND parent.statut_validation = 'VALIDE' AND te.statut = 'ACTIF' AND tp.statut = 'ACTIF'
      AND ((te.famille = 'ADMINISTRATIVE' AND source.source_kind = 'LEGAL')
        OR (te.famille <> 'ADMINISTRATIVE' AND source.source_kind = 'OPERATIONNEL'))
  ) THEN RAISE(ABORT, 'geo_attachment_requires_valid_units_rule_and_source') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM geo_rattachements r
    WHERE r.enfant_gid = NEW.enfant_gid AND r.statut = 'VALIDE'
      AND (r.valide_au IS NULL OR NEW.valide_du < r.valide_au)
      AND (NEW.valide_au IS NULL OR r.valide_du < NEW.valide_au)
  ) THEN RAISE(ABORT, 'geo_attachment_period_overlap') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM geo_unites enfant
    JOIN geo_unites doublon ON doublon.type_code = enfant.type_code
      AND doublon.nom_normalise = enfant.nom_normalise AND doublon.gid <> enfant.gid
    JOIN geo_rattachements parent_doublon ON parent_doublon.enfant_gid = doublon.gid
      AND parent_doublon.parent_gid = NEW.parent_gid AND parent_doublon.statut = 'VALIDE'
      AND (parent_doublon.valide_au IS NULL OR NEW.valide_du < parent_doublon.valide_au)
      AND (NEW.valide_au IS NULL OR parent_doublon.valide_du < NEW.valide_au)
    WHERE enfant.gid = NEW.enfant_gid
  ) THEN RAISE(ABORT, 'geo_duplicate_sibling_name') END;
END;

CREATE TRIGGER geo_rattachement_validation_maj
BEFORE UPDATE OF statut, source_id, valide_du, valide_au ON geo_rattachements
WHEN NEW.statut = 'VALIDE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM geo_unites enfant
    JOIN geo_unites parent ON parent.gid = NEW.parent_gid
    JOIN geo_types_unites te ON te.type_code = enfant.type_code
    JOIN geo_types_unites tp ON tp.type_code = parent.type_code
    JOIN geo_regles_parente regle ON regle.type_enfant = te.type_code AND regle.type_parent = tp.type_code
      AND regle.statut = 'APPROUVE'
      AND (regle.valide_du IS NULL OR regle.valide_du <= NEW.valide_du)
      AND (regle.valide_au IS NULL OR regle.valide_au > NEW.valide_du)
    JOIN geo_sources source ON source.source_id = NEW.source_id AND source.statut_verification = 'VERIFIE'
    WHERE enfant.gid = NEW.enfant_gid AND enfant.statut_validation = 'VALIDE'
      AND parent.statut_validation = 'VALIDE' AND te.statut = 'ACTIF' AND tp.statut = 'ACTIF'
      AND ((te.famille = 'ADMINISTRATIVE' AND source.source_kind = 'LEGAL')
        OR (te.famille <> 'ADMINISTRATIVE' AND source.source_kind = 'OPERATIONNEL'))
  ) THEN RAISE(ABORT, 'geo_attachment_requires_valid_units_rule_and_source') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM geo_rattachements r
    WHERE r.enfant_gid = NEW.enfant_gid AND r.rattachement_id <> NEW.rattachement_id AND r.statut = 'VALIDE'
      AND (r.valide_au IS NULL OR NEW.valide_du < r.valide_au)
      AND (NEW.valide_au IS NULL OR r.valide_du < NEW.valide_au)
  ) THEN RAISE(ABORT, 'geo_attachment_period_overlap') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM geo_unites enfant
    JOIN geo_unites doublon ON doublon.type_code = enfant.type_code
      AND doublon.nom_normalise = enfant.nom_normalise AND doublon.gid <> enfant.gid
    JOIN geo_rattachements parent_doublon ON parent_doublon.enfant_gid = doublon.gid
      AND parent_doublon.parent_gid = NEW.parent_gid AND parent_doublon.rattachement_id <> NEW.rattachement_id
      AND parent_doublon.statut = 'VALIDE'
      AND (parent_doublon.valide_au IS NULL OR NEW.valide_du < parent_doublon.valide_au)
      AND (NEW.valide_au IS NULL OR parent_doublon.valide_du < NEW.valide_au)
    WHERE enfant.gid = NEW.enfant_gid
  ) THEN RAISE(ABORT, 'geo_duplicate_sibling_name') END;
END;

CREATE TRIGGER geo_rattachement_identite_immuable
BEFORE UPDATE OF enfant_gid, parent_gid, valide_du ON geo_rattachements
WHEN NEW.enfant_gid <> OLD.enfant_gid OR NEW.parent_gid <> OLD.parent_gid OR NEW.valide_du <> OLD.valide_du
BEGIN
  SELECT RAISE(ABORT, 'geo_attachment_identity_is_immutable');
END;

CREATE TRIGGER geo_rattachement_cycle
BEFORE INSERT ON geo_rattachements
WHEN NEW.statut = 'VALIDE' AND EXISTS (
  WITH RECURSIVE instants(date_effet) AS (
    SELECT NEW.valide_du
    UNION
    SELECT r.valide_du FROM geo_rattachements r
    WHERE r.statut = 'VALIDE' AND r.valide_du > NEW.valide_du
      AND (NEW.valide_au IS NULL OR r.valide_du < NEW.valide_au)
  ), chemin(date_effet, gid) AS (
    SELECT date_effet, NEW.parent_gid FROM instants
    UNION
    SELECT chemin.date_effet, r.parent_gid
    FROM chemin JOIN geo_rattachements r ON r.enfant_gid = chemin.gid
    WHERE r.statut = 'VALIDE' AND r.valide_du <= chemin.date_effet
      AND (r.valide_au IS NULL OR r.valide_au > chemin.date_effet)
  )
  SELECT 1 FROM chemin WHERE gid = NEW.enfant_gid
)
BEGIN
  SELECT RAISE(ABORT, 'geo_attachment_cycle');
END;

CREATE TRIGGER geo_rattachement_cycle_maj
BEFORE UPDATE OF statut, valide_du, valide_au ON geo_rattachements
WHEN NEW.statut = 'VALIDE' AND EXISTS (
  WITH RECURSIVE instants(date_effet) AS (
    SELECT NEW.valide_du
    UNION
    SELECT r.valide_du FROM geo_rattachements r
    WHERE r.rattachement_id <> NEW.rattachement_id AND r.statut = 'VALIDE'
      AND r.valide_du > NEW.valide_du AND (NEW.valide_au IS NULL OR r.valide_du < NEW.valide_au)
  ), chemin(date_effet, gid) AS (
    SELECT date_effet, NEW.parent_gid FROM instants
    UNION
    SELECT chemin.date_effet, r.parent_gid
    FROM chemin JOIN geo_rattachements r ON r.enfant_gid = chemin.gid
    WHERE r.rattachement_id <> NEW.rattachement_id AND r.statut = 'VALIDE'
      AND r.valide_du <= chemin.date_effet
      AND (r.valide_au IS NULL OR r.valide_au > chemin.date_effet)
  )
  SELECT 1 FROM chemin WHERE gid = NEW.enfant_gid
)
BEGIN
  SELECT RAISE(ABORT, 'geo_attachment_cycle');
END;

CREATE TRIGGER geo_unite_suppression_interdite
BEFORE DELETE ON geo_unites
BEGIN
  SELECT RAISE(ABORT, 'geo_unit_must_be_archived');
END;

CREATE TRIGGER geo_rattachement_suppression_interdite
BEFORE DELETE ON geo_rattachements
BEGIN
  SELECT RAISE(ABORT, 'geo_attachment_must_be_closed');
END;

CREATE TRIGGER geo_journal_versions_immuable_maj
BEFORE UPDATE ON geo_journal_versions
BEGIN
  SELECT RAISE(ABORT, 'geo_version_journal_is_append_only');
END;

CREATE TRIGGER geo_journal_versions_immuable_suppression
BEFORE DELETE ON geo_journal_versions
BEGIN
  SELECT RAISE(ABORT, 'geo_version_journal_is_append_only');
END;

CREATE TRIGGER geo_unite_journal_insertion
AFTER INSERT ON geo_unites
BEGIN
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_CREEE', NEW.gid);
END;

CREATE TRIGGER geo_unite_journal_modification
AFTER UPDATE ON geo_unites
WHEN NEW.nom <> OLD.nom OR NEW.nom_normalise <> OLD.nom_normalise OR NEW.nom_ar IS NOT OLD.nom_ar
  OR NEW.statut_validation <> OLD.statut_validation OR NEW.statut_operationnel <> OLD.statut_operationnel
  OR NEW.type_code <> OLD.type_code OR NEW.source_id IS NOT OLD.source_id OR NEW.version_source IS NOT OLD.version_source
  OR NEW.citation_source IS NOT OLD.citation_source OR NEW.date_reference IS NOT OLD.date_reference
  OR NEW.source_verifiee_le IS NOT OLD.source_verifiee_le OR NEW.legacy_table IS NOT OLD.legacy_table
  OR NEW.legacy_id IS NOT OLD.legacy_id OR NEW.propose_par IS NOT OLD.propose_par
  OR NEW.approuve_par IS NOT OLD.approuve_par OR NEW.autorite_approbatrice IS NOT OLD.autorite_approbatrice
  OR NEW.approuve_le IS NOT OLD.approuve_le
BEGIN
  UPDATE geo_unites SET version = OLD.version + 1, modifie_le = datetime('now') WHERE gid = OLD.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', NEW.gid);
END;

CREATE TRIGGER geo_rattachement_journal_insertion
AFTER INSERT ON geo_rattachements
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = NEW.enfant_gid;
  INSERT INTO geo_journal_versions(evenement, gid, parent_gid)
  VALUES ('RATTACHEMENT_CREE', NEW.enfant_gid, NEW.parent_gid);
END;

CREATE TRIGGER geo_rattachement_journal_modification
AFTER UPDATE ON geo_rattachements
WHEN NEW.statut <> OLD.statut OR NEW.valide_au IS NOT OLD.valide_au OR NEW.source_id IS NOT OLD.source_id
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = NEW.enfant_gid;
  INSERT INTO geo_journal_versions(evenement, gid, parent_gid)
  VALUES ('RATTACHEMENT_MODIFIE', NEW.enfant_gid, NEW.parent_gid);
END;

CREATE TRIGGER geo_alias_source_verifiee_insert
BEFORE INSERT ON geo_alias
WHEN NEW.verifie_le IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM geo_sources s WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
)
BEGIN
  SELECT RAISE(ABORT, 'geo_alias_requires_verified_source');
END;

CREATE TRIGGER geo_alias_source_verifiee_maj
BEFORE UPDATE OF source_id, verifie_le ON geo_alias
WHEN NEW.verifie_le IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM geo_sources s WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
)
BEGIN
  SELECT RAISE(ABORT, 'geo_alias_requires_verified_source');
END;

CREATE TRIGGER geo_alias_unite_immuable
BEFORE UPDATE OF gid ON geo_alias
WHEN NEW.gid <> OLD.gid
BEGIN
  SELECT RAISE(ABORT, 'geo_alias_unit_is_immutable');
END;

CREATE TRIGGER geo_alias_journal_insertion
AFTER INSERT ON geo_alias
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = NEW.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', NEW.gid);
END;

CREATE TRIGGER geo_alias_journal_modification
AFTER UPDATE ON geo_alias
WHEN NEW.nom_alias <> OLD.nom_alias OR NEW.nom_normalise <> OLD.nom_normalise
  OR NEW.langue IS NOT OLD.langue OR NEW.type_alias <> OLD.type_alias
  OR NEW.source_id <> OLD.source_id OR NEW.version_source IS NOT OLD.version_source
  OR NEW.verifie_le IS NOT OLD.verifie_le
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = NEW.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', NEW.gid);
END;

CREATE TRIGGER geo_alias_journal_suppression
AFTER DELETE ON geo_alias
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = OLD.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', OLD.gid);
END;

CREATE TRIGGER geo_code_externe_source_verifiee_insert
BEFORE INSERT ON geo_codes_externes
WHEN NEW.verifie_le IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM geo_sources s WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
)
BEGIN
  SELECT RAISE(ABORT, 'geo_external_code_requires_verified_source');
END;

CREATE TRIGGER geo_code_externe_source_verifiee_maj
BEFORE UPDATE OF source_id, verifie_le ON geo_codes_externes
WHEN NEW.verifie_le IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM geo_sources s WHERE s.source_id = NEW.source_id AND s.statut_verification = 'VERIFIE'
)
BEGIN
  SELECT RAISE(ABORT, 'geo_external_code_requires_verified_source');
END;

CREATE TRIGGER geo_code_externe_unite_immuable
BEFORE UPDATE OF gid ON geo_codes_externes
WHEN NEW.gid <> OLD.gid
BEGIN
  SELECT RAISE(ABORT, 'geo_external_code_unit_is_immutable');
END;

CREATE TRIGGER geo_code_externe_journal_insertion
AFTER INSERT ON geo_codes_externes
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = NEW.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', NEW.gid);
END;

CREATE TRIGGER geo_code_externe_journal_modification
AFTER UPDATE ON geo_codes_externes
WHEN NEW.systeme <> OLD.systeme OR NEW.code_externe <> OLD.code_externe
  OR NEW.source_id <> OLD.source_id OR NEW.version_source <> OLD.version_source
  OR NEW.verifie_le IS NOT OLD.verifie_le OR NEW.gid <> OLD.gid
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = NEW.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', NEW.gid);
END;

CREATE TRIGGER geo_code_externe_journal_suppression
AFTER DELETE ON geo_codes_externes
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now') WHERE gid = OLD.gid;
  INSERT INTO geo_journal_versions(evenement, gid) VALUES ('UNITE_MODIFIEE', OLD.gid);
END;

CREATE TRIGGER geo_source_journal_modification
AFTER UPDATE ON geo_sources
WHEN NEW.edition IS NOT OLD.edition OR NEW.date_reference IS NOT OLD.date_reference
  OR NEW.exhaustivite <> OLD.exhaustivite OR NEW.statut_verification <> OLD.statut_verification
BEGIN
  UPDATE geo_unites SET version = version + 1, modifie_le = datetime('now')
  WHERE source_id = NEW.source_id;
  INSERT INTO geo_journal_versions(evenement, gid)
  SELECT 'UNITE_MODIFIEE', gid FROM geo_unites WHERE source_id = NEW.source_id;
END;
