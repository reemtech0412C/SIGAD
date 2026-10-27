PRAGMA foreign_keys = ON;

-- B2.6: projection réconciliée de manière transactionnelle. Legacy reste
-- l'unique source de décision; ces tables ne sont qu'une représentation miroir.
CREATE TABLE b22_reconciliation_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id TEXT NOT NULL,
  source_table TEXT NOT NULL CHECK (source_table IN (
    'UTILISATEURS',
    'UTILISATEURS_STATUT',
    'PROFILS_OPERATIONNELS_TERRAIN',
    'COMPTES_CONSULTATION',
    'COMPTES_CONSULTATION_STATUT',
    'PERIMETRES_PROVINCIAUX_CONSULTATION',
    'ENTREPOTS',
    'MIGRATION_0042'
  )),
  resultat TEXT NOT NULL DEFAULT 'EN_COURS' CHECK (resultat IN (
    'EN_COURS', 'RECONCILIE', 'CONFLIT', 'COMPTE_ABSENT'
  )),
  raison TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_b22_reconciliation_journal_utilisateur
  ON b22_reconciliation_journal(utilisateur_id, id DESC);

CREATE TABLE b22_reconciliation_etat (
  utilisateur_id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL,
  resultat TEXT NOT NULL CHECK (resultat IN ('RECONCILIE', 'CONFLIT', 'COMPTE_ABSENT')),
  raison TEXT,
  verifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Réplique les mêmes priorités que le middleware et le backfill 0036.
CREATE VIEW b22_profil_role_effectif AS
WITH profils_comptes AS (
  SELECT utilisateur_id, COUNT(*) AS nombre
  FROM profils_operationnels_terrain
  WHERE statut = 'ACTIF'
  GROUP BY utilisateur_id
), profils_uniques AS (
  SELECT p.*
  FROM profils_operationnels_terrain p
  JOIN profils_comptes pc ON pc.utilisateur_id = p.utilisateur_id AND pc.nombre = 1
  WHERE p.statut = 'ACTIF'
)
SELECT
  u.id AS utilisateur_id,
  CASE
    WHEN cc.id IS NOT NULL THEN 'CONSULTATION_INSTITUTIONNELLE'
    WHEN COALESCE(pc.nombre, 0) > 1 THEN NULL
    WHEN pu.id IS NOT NULL THEN pu.role_terrain
    ELSE u.role
  END AS role_code,
  CASE
    WHEN cc.id IS NOT NULL THEN 'COMPTES_CONSULTATION'
    WHEN COALESCE(pc.nombre, 0) > 1 THEN 'UTILISATEURS'
    WHEN pu.id IS NOT NULL THEN 'PROFILS_OPERATIONNELS_TERRAIN'
    ELSE 'UTILISATEURS'
  END AS source_role,
  u.role AS role_legacy,
  u.province_id AS province_utilisateur,
  pu.id AS profil_id,
  pu.province_id AS province_profil,
  pu.entrepot_id,
  cc.id AS compte_consultation_id,
  cc.perimetre AS perimetre_consultation,
  CASE
    WHEN u.statut <> 'ACTIF' OR (cc.statut IS NOT NULL AND cc.statut <> 'ACTIF') THEN 'SUSPENDU'
    ELSE 'ACTIF'
  END AS statut_ombre,
  COALESCE(pc.nombre, 0) AS profils_actifs
FROM utilisateurs u
LEFT JOIN comptes_consultation cc ON cc.utilisateur_id = u.id
LEFT JOIN profils_comptes pc ON pc.utilisateur_id = u.id
LEFT JOIN profils_uniques pu ON pu.utilisateur_id = u.id;

-- Les vues d'attente sont séparées pour éviter les limites de compilation du
-- Worker D1; elles conservent les mêmes identifiants que le backfill 0036.
CREATE VIEW b22_portee_nationale_role AS
SELECT 'pa:' || utilisateur_id || ':NATIONALE:NATIONALE' AS id, utilisateur_id,
  'NATIONALE' AS type_unite, NULL AS gid, 0 AS inclut_descendants,
  'ROLES_NATIONAUX' AS source_legacy, statut_ombre AS statut
FROM b22_profil_role_effectif WHERE role_code IN ('PROPRIETAIRE', 'ADMIN_CENTRAL');

CREATE VIEW b22_portee_nationale_consultation AS
SELECT 'pa:' || utilisateur_id || ':NATIONALE:NATIONALE' AS id, utilisateur_id,
  'NATIONALE' AS type_unite, NULL AS gid, 0 AS inclut_descendants,
  'COMPTES_CONSULTATION' AS source_legacy, statut_ombre AS statut
FROM b22_profil_role_effectif
WHERE role_code = 'CONSULTATION_INSTITUTIONNELLE' AND perimetre_consultation = 'NATIONAL';

CREATE VIEW b22_portee_province_delegue AS
SELECT 'pa:' || utilisateur_id || ':PROVINCE:' || province_utilisateur AS id, utilisateur_id,
  'PROVINCE' AS type_unite, province_utilisateur AS gid, 1 AS inclut_descendants,
  'UTILISATEURS' AS source_legacy, statut_ombre AS statut
FROM b22_profil_role_effectif
WHERE role_code = 'DELEGUE_PROVINCIAL' AND province_utilisateur IS NOT NULL;

CREATE VIEW b22_portee_province_terrain AS
SELECT 'pa:' || utilisateur_id || ':PROVINCE:' || province_profil AS id, utilisateur_id,
  'PROVINCE' AS type_unite, province_profil AS gid, 1 AS inclut_descendants,
  'PROFILS_OPERATIONNELS_TERRAIN' AS source_legacy, statut_ombre AS statut
FROM b22_profil_role_effectif
WHERE role_code IN ('SUPERVISEUR_TERRAIN', 'AGENT_DISTRIBUTION') AND province_profil IS NOT NULL;

CREATE VIEW b22_portee_localite_stock AS
SELECT 'pa:' || r.utilisateur_id || ':LOCALITE:' || e.localite_id AS id, r.utilisateur_id,
  'LOCALITE' AS type_unite, e.localite_id AS gid, 0 AS inclut_descendants,
  'ENTREPOTS' AS source_legacy, r.statut_ombre AS statut
FROM b22_profil_role_effectif r
JOIN entrepots e ON e.id = r.entrepot_id
WHERE r.role_code = 'RESPONSABLE_STOCK'
  AND e.niveau = 'PROVINCIAL' AND e.actif = 1
  AND e.province_id = r.province_profil AND e.localite_id IS NOT NULL;

CREATE VIEW b22_portee_province_consultation AS
SELECT 'pa:' || r.utilisateur_id || ':PROVINCE:' || p.province_id AS id, r.utilisateur_id,
  'PROVINCE' AS type_unite, p.province_id AS gid, 1 AS inclut_descendants,
  'PERIMETRES_PROVINCIAUX_CONSULTATION' AS source_legacy, r.statut_ombre AS statut
FROM b22_profil_role_effectif r
JOIN perimetres_provinciaux_consultation p
  ON p.compte_consultation_id = r.compte_consultation_id
WHERE r.role_code = 'CONSULTATION_INSTITUTIONNELLE';

-- L'état courant facilite l'identification des comptes ambigus/supprimés;
-- le journal conserve les tentatives de réconciliation et leurs résultats.
CREATE TRIGGER b22_appliquer_reconciliation_apres_evenement
AFTER INSERT ON b22_reconciliation_journal
BEGIN
  DELETE FROM affectations_roles WHERE utilisateur_id = NEW.utilisateur_id;
  DELETE FROM portees_acces WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO portees_acces (
    id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  )
  SELECT id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  FROM b22_portee_nationale_role WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO portees_acces (
    id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  )
  SELECT id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  FROM b22_portee_nationale_consultation WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO portees_acces (
    id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  )
  SELECT id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  FROM b22_portee_province_delegue WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO portees_acces (
    id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  )
  SELECT id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  FROM b22_portee_province_terrain WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO portees_acces (
    id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  )
  SELECT id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  FROM b22_portee_localite_stock WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO portees_acces (
    id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  )
  SELECT id, utilisateur_id, type_unite, gid, inclut_descendants, source_legacy, statut
  FROM b22_portee_province_consultation WHERE utilisateur_id = NEW.utilisateur_id;

  INSERT INTO affectations_roles (
    id, utilisateur_id, role_code, portee_id, source_legacy, statut
  )
  SELECT
    'ar:' || r.utilisateur_id || ':' || r.role_code || ':' || COALESCE(p.id, 'SANS_PORTEE'),
    r.utilisateur_id, r.role_code, p.id, r.source_role, r.statut_ombre
  FROM b22_profil_role_effectif r
  JOIN roles catalogue ON catalogue.code = r.role_code
  LEFT JOIN portees_acces p ON p.utilisateur_id = r.utilisateur_id
  WHERE r.utilisateur_id = NEW.utilisateur_id AND r.role_code IS NOT NULL;

  UPDATE sessions
  SET revoquee = 1,
      motif_revocation = COALESCE(motif_revocation, 'PORTEE_MODIFIEE')
  WHERE utilisateur_id = NEW.utilisateur_id
    AND revoquee = 0
    AND NEW.source_table NOT IN ('MIGRATION_0042', 'UTILISATEURS_STATUT', 'COMPTES_CONSULTATION_STATUT');

  UPDATE b22_reconciliation_journal
  SET resultat = CASE
        WHEN NOT EXISTS (SELECT 1 FROM utilisateurs WHERE id = NEW.utilisateur_id)
          THEN 'COMPTE_ABSENT'
        WHEN EXISTS (
          SELECT 1 FROM b22_profil_role_effectif
          WHERE utilisateur_id = NEW.utilisateur_id AND role_code IS NULL
        ) THEN 'CONFLIT'
        ELSE 'RECONCILIE'
      END,
      raison = CASE
        WHEN NOT EXISTS (SELECT 1 FROM utilisateurs WHERE id = NEW.utilisateur_id)
          THEN 'UTILISATEUR_SUPPRIME'
        WHEN EXISTS (
          SELECT 1 FROM b22_profil_role_effectif
          WHERE utilisateur_id = NEW.utilisateur_id AND role_code IS NULL
        ) THEN 'PLUSIEURS_PROFILS_TERRAIN_ACTIFS'
        ELSE NULL
      END
  WHERE id = NEW.id;

  INSERT INTO b22_reconciliation_etat (utilisateur_id, source_table, resultat, raison, verifie_le)
  SELECT utilisateur_id, source_table, resultat, raison, cree_le
  FROM b22_reconciliation_journal WHERE id = NEW.id
  ON CONFLICT(utilisateur_id) DO UPDATE SET
    source_table = excluded.source_table,
    resultat = excluded.resultat,
    raison = excluded.raison,
    verifie_le = excluded.verifie_le;
END;

CREATE TRIGGER b22_reconcilier_utilisateur_apres_creation
AFTER INSERT ON utilisateurs
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (NEW.id, 'UTILISATEURS');
END;

CREATE TRIGGER b22_reconcilier_utilisateur_apres_changement_identite
AFTER UPDATE OF role, province_id ON utilisateurs
WHEN OLD.role IS NOT NEW.role OR OLD.province_id IS NOT NEW.province_id
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (NEW.id, 'UTILISATEURS');
END;

CREATE TRIGGER b22_reconcilier_utilisateur_apres_changement_statut
AFTER UPDATE OF statut ON utilisateurs
WHEN OLD.statut IS NOT NEW.statut
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (NEW.id, 'UTILISATEURS_STATUT');
END;

CREATE TRIGGER b22_marquer_utilisateur_supprime
AFTER DELETE ON utilisateurs
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (OLD.id, 'UTILISATEURS');
END;

CREATE TRIGGER b22_reconcilier_profil_terrain_apres_creation
AFTER INSERT ON profils_operationnels_terrain
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (NEW.utilisateur_id, 'PROFILS_OPERATIONNELS_TERRAIN');
END;

CREATE TRIGGER b22_reconcilier_profil_terrain_apres_modification
AFTER UPDATE OF utilisateur_id, role_terrain, province_id, entrepot_id, statut ON profils_operationnels_terrain
WHEN OLD.utilisateur_id IS NOT NEW.utilisateur_id
  OR OLD.role_terrain IS NOT NEW.role_terrain
  OR OLD.province_id IS NOT NEW.province_id
  OR OLD.entrepot_id IS NOT NEW.entrepot_id
  OR OLD.statut IS NOT NEW.statut
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (OLD.utilisateur_id, 'PROFILS_OPERATIONNELS_TERRAIN');
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT NEW.utilisateur_id, 'PROFILS_OPERATIONNELS_TERRAIN'
  WHERE NEW.utilisateur_id IS NOT OLD.utilisateur_id;
END;

CREATE TRIGGER b22_reconcilier_profil_terrain_apres_suppression
AFTER DELETE ON profils_operationnels_terrain
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (OLD.utilisateur_id, 'PROFILS_OPERATIONNELS_TERRAIN');
END;

CREATE TRIGGER b22_reconcilier_compte_consultation_apres_creation
AFTER INSERT ON comptes_consultation
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (NEW.utilisateur_id, 'COMPTES_CONSULTATION');
END;

CREATE TRIGGER b22_reconcilier_compte_consultation_apres_modification
AFTER UPDATE OF utilisateur_id, perimetre ON comptes_consultation
WHEN OLD.utilisateur_id IS NOT NEW.utilisateur_id
  OR OLD.perimetre IS NOT NEW.perimetre
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (OLD.utilisateur_id, 'COMPTES_CONSULTATION');
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT NEW.utilisateur_id, 'COMPTES_CONSULTATION'
  WHERE NEW.utilisateur_id IS NOT OLD.utilisateur_id;
END;

CREATE TRIGGER b22_reconcilier_statut_compte_consultation
AFTER UPDATE OF statut ON comptes_consultation
WHEN OLD.statut IS NOT NEW.statut
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (NEW.utilisateur_id, 'COMPTES_CONSULTATION_STATUT');
END;

CREATE TRIGGER b22_reconcilier_compte_consultation_apres_suppression
AFTER DELETE ON comptes_consultation
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  VALUES (OLD.utilisateur_id, 'COMPTES_CONSULTATION');
END;

CREATE TRIGGER b22_reconcilier_perimetre_consultation_apres_creation
AFTER INSERT ON perimetres_provinciaux_consultation
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT utilisateur_id, 'PERIMETRES_PROVINCIAUX_CONSULTATION'
  FROM comptes_consultation WHERE id = NEW.compte_consultation_id;
END;

CREATE TRIGGER b22_reconcilier_perimetre_consultation_apres_modification
AFTER UPDATE OF compte_consultation_id, province_id ON perimetres_provinciaux_consultation
WHEN OLD.compte_consultation_id IS NOT NEW.compte_consultation_id
  OR OLD.province_id IS NOT NEW.province_id
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT utilisateur_id, 'PERIMETRES_PROVINCIAUX_CONSULTATION'
  FROM comptes_consultation WHERE id = OLD.compte_consultation_id;
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT utilisateur_id, 'PERIMETRES_PROVINCIAUX_CONSULTATION'
  FROM comptes_consultation
  WHERE id = NEW.compte_consultation_id AND NEW.compte_consultation_id IS NOT OLD.compte_consultation_id;
END;

CREATE TRIGGER b22_reconcilier_perimetre_consultation_apres_suppression
AFTER DELETE ON perimetres_provinciaux_consultation
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT utilisateur_id, 'PERIMETRES_PROVINCIAUX_CONSULTATION'
  FROM comptes_consultation WHERE id = OLD.compte_consultation_id;
END;

CREATE TRIGGER b22_reconcilier_portee_apres_changement_entrepot
AFTER UPDATE OF niveau, province_id, localite_id, actif ON entrepots
WHEN OLD.niveau IS NOT NEW.niveau OR OLD.province_id IS NOT NEW.province_id
  OR OLD.localite_id IS NOT NEW.localite_id OR OLD.actif IS NOT NEW.actif
BEGIN
  INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
  SELECT DISTINCT utilisateur_id, 'ENTREPOTS'
  FROM profils_operationnels_terrain WHERE entrepot_id = NEW.id;
END;

-- Backfill/réconciliation locale des comptes existants. Le journal est créé
-- une fois à l'installation; aucun compte ou donnée métier n'est modifié.
INSERT INTO b22_reconciliation_journal (utilisateur_id, source_table)
SELECT id, 'MIGRATION_0042' FROM utilisateurs;
