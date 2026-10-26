-- ============================================================================
-- Migration 0035 : Refonte territoriale dynamique sans communes
-- Date : 2026-10-25
-- Description :
--   1. Conservation exclusive des 23 provinces et 112 départements actifs comme socle initial
--   2. Conservation du statut particulier de N'Djaména, ses 10 arrondissements et 19 quartiers
--   3. Suppression sécurisée des 500 communes du référentiel opérationnel (sans CASCADE destructif)
--   4. Assouplissement des cantons (rattachement direct au département ou via sous-préfecture)
--   5. Prise en charge du type HAMEAU dans localites et audits_territoire
--   6. Ajout de la traçabilité de provenance (SOCLE_INITIAL vs AJOUT_DYNAMIQUE)
--   7. Assouplissement des déclencheurs urbains/ruraux (carrés facultatifs, niveaux intermédiaires non bloquants)
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- 1. Suppression temporaire des déclencheurs dépendants
DROP TRIGGER IF EXISTS verifier_rattachement_territorial_avant_insertion;
DROP TRIGGER IF EXISTS verifier_rattachement_territorial_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_localite_avant_insertion;
DROP TRIGGER IF EXISTS verifier_localite_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_arrondissement_avant_insertion;
DROP TRIGGER IF EXISTS verifier_arrondissement_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_quartier_avant_insertion;
DROP TRIGGER IF EXISTS verifier_quartier_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_carre_avant_insertion;
DROP TRIGGER IF EXISTS verifier_carre_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_site_humanitaire_avant_insertion;
DROP TRIGGER IF EXISTS verifier_site_humanitaire_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_menage_avant_insertion;
DROP TRIGGER IF EXISTS verifier_menage_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_zone_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_entrepot_avant_insertion;
DROP TRIGGER IF EXISTS verifier_entrepot_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_signalement_doublon_avant_insertion;
DROP TRIGGER IF EXISTS verifier_signalement_doublon_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_menage_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_allocation_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_remise_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_modification_distribution_apres_validation;
DROP TRIGGER IF EXISTS figer_menages_distribution_valides;
DROP TRIGGER IF EXISTS figer_modification_menage_distribution;
DROP TRIGGER IF EXISTS figer_suppression_menage_distribution;
DROP TRIGGER IF EXISTS verifier_statut_menage_distribution;
DROP TRIGGER IF EXISTS verifier_cloture_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_inscription_beneficiaire_avant_insertion;
DROP TRIGGER IF EXISTS verifier_inscription_beneficiaire_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_statut_validation_menage_avant_insertion;
DROP TRIGGER IF EXISTS verifier_statut_validation_menage_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_confirmation_distincte_avant_mise_a_jour;
DROP TRIGGER IF EXISTS appliquer_confirmation_distincte_apres_mise_a_jour;
DROP TRIGGER IF EXISTS journaliser_validation_menage_apres_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_signalement_ouvert_avant_insertion;
DROP TRIGGER IF EXISTS verifier_doublon_menage_concurrent_apres_insertion;

-- 2. Nettoyage sécurisé des références aux communes avant suppression (aucune suppression de données métier)
UPDATE localites SET commune_id = NULL WHERE commune_id IS NOT NULL;
UPDATE arrondissements SET commune_id = NULL WHERE commune_id IS NOT NULL;
UPDATE sites_humanitaires SET commune_id = NULL WHERE commune_id IS NOT NULL;
UPDATE menages SET commune_id = NULL WHERE commune_id IS NOT NULL;
UPDATE distributions_provinciales SET commune_id = NULL WHERE commune_id IS NOT NULL;

DELETE FROM rattachements_territoriaux;
DELETE FROM communes;

-- 3. Garantie que les 112 départements du socle initial sont tous actifs et utilisables
UPDATE departements
SET actif = 1,
    statut_validation = 'VALIDE',
    statut_operationnel = 'ACTIF'
WHERE statut_validation IN ('A_VERIFIER', 'PROPOSE', 'VALIDE')
  AND statut_operationnel != 'ARCHIVE';

-- 4. Ajout de la colonne de provenance sur les tables territoriales existantes
ALTER TABLE departements ADD COLUMN provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL';
ALTER TABLE departements ADD COLUMN cree_par TEXT REFERENCES utilisateurs(id);

ALTER TABLE sous_prefectures ADD COLUMN statut_validation TEXT NOT NULL DEFAULT 'VALIDE';
ALTER TABLE sous_prefectures ADD COLUMN provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL';
ALTER TABLE sous_prefectures ADD COLUMN source_officielle TEXT DEFAULT 'Saisie opérationnelle SIGAD';
ALTER TABLE sous_prefectures ADD COLUMN cree_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE sous_prefectures ADD COLUMN cree_le TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z';

ALTER TABLE arrondissements ADD COLUMN provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL';
ALTER TABLE arrondissements ADD COLUMN cree_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE arrondissements ADD COLUMN actif INTEGER NOT NULL DEFAULT 1;

ALTER TABLE quartiers ADD COLUMN provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL';
ALTER TABLE quartiers ADD COLUMN valide_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE quartiers ADD COLUMN cree_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE quartiers ADD COLUMN actif INTEGER NOT NULL DEFAULT 1;
-- Tous les quartiers acceptent désormais des carrés facultatifs sans blocage
UPDATE quartiers SET possede_carres = 1;

ALTER TABLE carres ADD COLUMN provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL';
ALTER TABLE carres ADD COLUMN cree_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE carres ADD COLUMN actif INTEGER NOT NULL DEFAULT 1;

ALTER TABLE sites_humanitaires ADD COLUMN provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL';
ALTER TABLE sites_humanitaires ADD COLUMN valide_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE sites_humanitaires ADD COLUMN cree_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE sites_humanitaires ADD COLUMN actif INTEGER NOT NULL DEFAULT 1;

-- 5. Restructuration de la table cantons (departement_id supporté directement, sous_prefecture_id optionnel)
CREATE TABLE cantons_nouvelle (
    id TEXT PRIMARY KEY,
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    nom TEXT NOT NULL,
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')),
    provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL',
    source_officielle TEXT DEFAULT 'Saisie opérationnelle SIGAD',
    actif INTEGER NOT NULL DEFAULT 1,
    cree_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO cantons_nouvelle (id, departement_id, sous_prefecture_id, nom, statut_validation, provenance, cree_par)
SELECT ca.id, sp.departement_id, ca.sous_prefecture_id, ca.nom, ca.statut_validation, 'SOCLE_INITIAL', ca.cree_par
FROM cantons ca
LEFT JOIN sous_prefectures sp ON sp.id = ca.sous_prefecture_id;
DROP TABLE cantons;
ALTER TABLE cantons_nouvelle RENAME TO cantons;

CREATE INDEX IF NOT EXISTS idx_cantons_departement ON cantons(departement_id);
CREATE INDEX IF NOT EXISTS idx_cantons_sous_prefecture ON cantons(sous_prefecture_id);

-- 6. Restructuration de la table localites pour supporter HAMEAU et provenance
-- Compatible avec l'exécution transactionnelle Cloudflare D1 (où PRAGMA foreign_keys = OFF est sans effet)
CREATE TABLE _tmp_ref_entrepots_0035 AS SELECT id, localite_id FROM entrepots WHERE localite_id IS NOT NULL;
UPDATE entrepots SET localite_id = NULL WHERE localite_id IS NOT NULL;

CREATE TABLE _tmp_ref_sites_0035 AS SELECT id, localite_proche_id FROM sites_humanitaires WHERE localite_proche_id IS NOT NULL;
UPDATE sites_humanitaires SET localite_proche_id = NULL WHERE localite_proche_id IS NOT NULL;

CREATE TABLE _tmp_ref_menages_0035 AS
SELECT id, localite_id, arrondissement_id, quartier_id, carre_id
FROM menages
WHERE localite_id IS NOT NULL OR arrondissement_id IS NOT NULL OR quartier_id IS NOT NULL OR carre_id IS NOT NULL;
UPDATE menages
SET localite_id = NULL, arrondissement_id = NULL, quartier_id = NULL, carre_id = NULL
WHERE localite_id IS NOT NULL OR arrondissement_id IS NOT NULL OR quartier_id IS NOT NULL OR carre_id IS NOT NULL;

CREATE TABLE _tmp_ref_zones_0035 AS
SELECT id, localite_id, arrondissement_id, quartier_id, carre_id
FROM zones_distribution
WHERE localite_id IS NOT NULL OR arrondissement_id IS NOT NULL OR quartier_id IS NOT NULL OR carre_id IS NOT NULL;
UPDATE zones_distribution
SET localite_id = NULL, arrondissement_id = NULL, quartier_id = NULL, carre_id = NULL
WHERE localite_id IS NOT NULL OR arrondissement_id IS NOT NULL OR quartier_id IS NOT NULL OR carre_id IS NOT NULL;

CREATE TABLE _tmp_carres_0035 AS SELECT * FROM carres;
DELETE FROM carres;

CREATE TABLE _tmp_quartiers_0035 AS SELECT * FROM quartiers;
DELETE FROM quartiers;

CREATE TABLE _tmp_arrondissements_0035 AS SELECT * FROM arrondissements;
DELETE FROM arrondissements;

CREATE TABLE localites_nouvelle (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    canton_id TEXT REFERENCES cantons(id),
    nom TEXT NOT NULL,
    type_localite TEXT NOT NULL CHECK (type_localite IN ('VILLE', 'VILLAGE', 'HAMEAU', 'FERRICK', 'CAMPEMENT')),
    mode_decoupage_urbain TEXT NOT NULL DEFAULT 'AUCUN' CHECK (mode_decoupage_urbain IN ('AUCUN', 'SANS_ARRONDISSEMENT', 'AVEC_ARRONDISSEMENTS')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')),
    provenance TEXT NOT NULL DEFAULT 'SOCLE_INITIAL',
    source_documentation TEXT,
    date_effet TEXT,
    propose_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    cree_par TEXT REFERENCES utilisateurs(id),
    actif INTEGER NOT NULL DEFAULT 1,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO localites_nouvelle (
    id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id,
    nom, type_localite, mode_decoupage_urbain, statut_validation, provenance,
    source_documentation, date_effet, propose_par, valide_par, cree_par, actif, cree_le
)
SELECT
    id, province_id, departement_id, sous_prefecture_id, NULL, canton_id,
    nom, type_localite, mode_decoupage_urbain, statut_validation, 'SOCLE_INITIAL',
    source_documentation, date_effet, propose_par, valide_par, propose_par, 1, cree_le
FROM localites;
DROP TABLE localites;
ALTER TABLE localites_nouvelle RENAME TO localites;

CREATE INDEX IF NOT EXISTS idx_localites_province_statut_type_nom
    ON localites(province_id, statut_validation, type_localite, nom);
CREATE INDEX IF NOT EXISTS idx_localites_departement
    ON localites(departement_id, type_localite, nom);

INSERT INTO arrondissements SELECT * FROM _tmp_arrondissements_0035;
DROP TABLE _tmp_arrondissements_0035;

INSERT INTO quartiers SELECT * FROM _tmp_quartiers_0035;
DROP TABLE _tmp_quartiers_0035;

INSERT INTO carres SELECT * FROM _tmp_carres_0035;
DROP TABLE _tmp_carres_0035;

UPDATE entrepots
SET localite_id = (SELECT t.localite_id FROM _tmp_ref_entrepots_0035 t WHERE t.id = entrepots.id)
WHERE id IN (SELECT id FROM _tmp_ref_entrepots_0035);
DROP TABLE _tmp_ref_entrepots_0035;

UPDATE sites_humanitaires
SET localite_proche_id = (SELECT t.localite_proche_id FROM _tmp_ref_sites_0035 t WHERE t.id = sites_humanitaires.id)
WHERE id IN (SELECT id FROM _tmp_ref_sites_0035);
DROP TABLE _tmp_ref_sites_0035;

UPDATE menages
SET localite_id = (SELECT t.localite_id FROM _tmp_ref_menages_0035 t WHERE t.id = menages.id),
    arrondissement_id = (SELECT t.arrondissement_id FROM _tmp_ref_menages_0035 t WHERE t.id = menages.id),
    quartier_id = (SELECT t.quartier_id FROM _tmp_ref_menages_0035 t WHERE t.id = menages.id),
    carre_id = (SELECT t.carre_id FROM _tmp_ref_menages_0035 t WHERE t.id = menages.id)
WHERE id IN (SELECT id FROM _tmp_ref_menages_0035);
DROP TABLE _tmp_ref_menages_0035;

UPDATE zones_distribution
SET localite_id = (SELECT t.localite_id FROM _tmp_ref_zones_0035 t WHERE t.id = zones_distribution.id),
    arrondissement_id = (SELECT t.arrondissement_id FROM _tmp_ref_zones_0035 t WHERE t.id = zones_distribution.id),
    quartier_id = (SELECT t.quartier_id FROM _tmp_ref_zones_0035 t WHERE t.id = zones_distribution.id),
    carre_id = (SELECT t.carre_id FROM _tmp_ref_zones_0035 t WHERE t.id = zones_distribution.id)
WHERE id IN (SELECT id FROM _tmp_ref_zones_0035);
DROP TABLE _tmp_ref_zones_0035;

-- 7. Mise à jour de audits_territoire pour supporter HAMEAU dans entite_type
CREATE TABLE audits_territoire_nouvelle (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('CREATION', 'MODIFICATION', 'VALIDATION', 'RETRAIT_VALIDATION', 'MODIFICATION_RATTACHEMENT', 'FUSION', 'ARCHIVAGE', 'REACTIVATION', 'SUPPRESSION')),
    entite_type TEXT NOT NULL CHECK (entite_type IN (
        'PROVINCE', 'DEPARTEMENT', 'SOUS_PREFECTURE', 'COMMUNE', 'CANTON',
        'VILLE', 'VILLAGE', 'HAMEAU', 'FERRICK', 'CAMPEMENT', 'ARRONDISSEMENT',
        'QUARTIER', 'CARRE', 'BLOC', 'SECTEUR', 'SITE_HUMANITAIRE', 'LOCALITE'
    )),
    entite_id TEXT NOT NULL,
    utilisateur_id TEXT REFERENCES utilisateurs(id),
    anciennes_valeurs TEXT,
    nouvelles_valeurs TEXT,
    justificatif TEXT,
    motif TEXT,
    adresse_ip TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO audits_territoire_nouvelle SELECT * FROM audits_territoire;
DROP TABLE audits_territoire;
ALTER TABLE audits_territoire_nouvelle RENAME TO audits_territoire;

CREATE INDEX IF NOT EXISTS idx_audits_terr_entite ON audits_territoire (entite_type, entite_id);
CREATE INDEX IF NOT EXISTS idx_audits_terr_action ON audits_territoire (action);
CREATE INDEX IF NOT EXISTS idx_audits_terr_cree ON audits_territoire (cree_le DESC);

-- 8. Recréation des déclencheurs adaptés au parcours dynamique sans communes
CREATE TRIGGER verifier_localite_avant_insertion
BEFORE INSERT ON localites
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
OR (
    NEW.sous_prefecture_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sous_prefectures sp
        WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id)
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Rattachement territorial de la localité incohérent avec la province ou le département.');
END;

CREATE TRIGGER verifier_localite_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id ON localites
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Rattachement territorial de la localité incohérent avec la province ou le département.');
END;

CREATE TRIGGER verifier_arrondissement_avant_insertion
BEFORE INSERT ON arrondissements
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')
BEGIN
    SELECT RAISE(ABORT, 'Un arrondissement doit appartenir à une ville divisée en arrondissements.');
END;

CREATE TRIGGER verifier_arrondissement_avant_mise_a_jour
BEFORE UPDATE OF localite_id, statut_validation ON arrondissements
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')
BEGIN
    SELECT RAISE(ABORT, 'Un arrondissement doit appartenir à une ville divisée en arrondissements.');
END;

CREATE TRIGGER verifier_quartier_avant_insertion
BEFORE INSERT ON quartiers
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND (
          NEW.arrondissement_id IS NULL
          OR EXISTS (
              SELECT 1 FROM arrondissements a
              WHERE a.id = NEW.arrondissement_id AND a.localite_id = l.id
          )
      )
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')
OR NEW.possede_carres NOT IN (0, 1)
BEGIN
    SELECT RAISE(ABORT, 'Le quartier ne correspond pas à la ville ou à son arrondissement.');
END;

CREATE TRIGGER verifier_quartier_avant_mise_a_jour
BEFORE UPDATE OF localite_id, arrondissement_id, statut_validation, possede_carres ON quartiers
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND (
          NEW.arrondissement_id IS NULL
          OR EXISTS (
              SELECT 1 FROM arrondissements a
              WHERE a.id = NEW.arrondissement_id AND a.localite_id = l.id
          )
      )
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')
OR NEW.possede_carres NOT IN (0, 1)
BEGIN
    SELECT RAISE(ABORT, 'Le quartier ne correspond pas à la ville ou à son arrondissement.');
END;

CREATE TRIGGER verifier_carre_avant_insertion
BEFORE INSERT ON carres
WHEN (
    NEW.quartier_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM quartiers q WHERE q.id = NEW.quartier_id
    )
)
OR (
    NEW.quartier_id IS NULL AND NEW.site_humanitaire_id IS NULL
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')
BEGIN
    SELECT RAISE(ABORT, 'Le carré doit être rattaché à un quartier valide.');
END;

CREATE TRIGGER verifier_carre_avant_mise_a_jour
BEFORE UPDATE OF quartier_id, statut_validation ON carres
WHEN (
    NEW.quartier_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM quartiers q WHERE q.id = NEW.quartier_id
    )
)
OR (
    NEW.quartier_id IS NULL AND NEW.site_humanitaire_id IS NULL
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE', 'ARCHIVE')
BEGIN
    SELECT RAISE(ABORT, 'Le carré doit être rattaché à un quartier valide.');
END;

CREATE TRIGGER verifier_site_humanitaire_avant_insertion
BEFORE INSERT ON sites_humanitaires
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');
END;

CREATE TRIGGER verifier_site_humanitaire_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id ON sites_humanitaires
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');
END;

CREATE TRIGGER verifier_menage_avant_insertion
BEFORE INSERT ON menages
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)
OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sous_prefectures sp
    WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id) AND sp.actif = 1
))
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
      AND (NEW.departement_id IS NULL OR l.departement_id IS NULL OR l.departement_id = NEW.departement_id) AND l.statut_validation = 'VALIDE'
))
OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM arrondissements a
    WHERE a.id = NEW.arrondissement_id AND (NEW.localite_id IS NULL OR a.localite_id = NEW.localite_id)
      AND a.statut_validation = 'VALIDE'
))
OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quartiers q
    WHERE q.id = NEW.quartier_id AND (NEW.localite_id IS NULL OR q.localite_id = NEW.localite_id) AND q.statut_validation = 'VALIDE'
      AND (NEW.arrondissement_id IS NULL OR q.arrondissement_id IS NULL OR q.arrondissement_id = NEW.arrondissement_id)
))
OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM carres ca
    INNER JOIN quartiers q ON q.id = ca.quartier_id
    WHERE ca.id = NEW.carre_id AND q.id = NEW.quartier_id AND ca.statut_validation = 'VALIDE'
))
OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sites_humanitaires s
    WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
      AND (NEW.departement_id IS NULL OR s.departement_id IS NULL OR s.departement_id = NEW.departement_id) AND s.statut_validation = 'VALIDE'
))
BEGIN
    SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');
END;

CREATE TRIGGER verifier_menage_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, localite_id,
  arrondissement_id, quartier_id, carre_id, site_humanitaire_id, categorie_population_id ON menages
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)
OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sous_prefectures sp
    WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id) AND sp.actif = 1
))
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
      AND (NEW.departement_id IS NULL OR l.departement_id IS NULL OR l.departement_id = NEW.departement_id) AND l.statut_validation = 'VALIDE'
))
OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM arrondissements a
    WHERE a.id = NEW.arrondissement_id AND (NEW.localite_id IS NULL OR a.localite_id = NEW.localite_id)
      AND a.statut_validation = 'VALIDE'
))
OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quartiers q
    WHERE q.id = NEW.quartier_id AND (NEW.localite_id IS NULL OR q.localite_id = NEW.localite_id) AND q.statut_validation = 'VALIDE'
      AND (NEW.arrondissement_id IS NULL OR q.arrondissement_id IS NULL OR q.arrondissement_id = NEW.arrondissement_id)
))
OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM carres ca
    INNER JOIN quartiers q ON q.id = ca.quartier_id
    WHERE ca.id = NEW.carre_id AND q.id = NEW.quartier_id AND ca.statut_validation = 'VALIDE'
))
OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sites_humanitaires s
    WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
      AND (NEW.departement_id IS NULL OR s.departement_id IS NULL OR s.departement_id = NEW.departement_id) AND s.statut_validation = 'VALIDE'
))
BEGIN
    SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');
END;

CREATE TRIGGER verifier_distribution_avant_insertion
BEFORE INSERT ON distributions_provinciales
WHEN NOT EXISTS (
  SELECT 1
  FROM provinces p
  INNER JOIN departements d ON d.province_id = p.id AND d.actif = 1
  INNER JOIN entrepots e ON e.id = NEW.entrepot_id AND e.niveau = 'PROVINCIAL'
    AND e.province_id = p.id AND e.actif = 1
  WHERE p.id = NEW.province_id AND p.actif = 1 AND d.id = NEW.departement_id
)
OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sous_prefectures sp
  INNER JOIN departements d ON d.id = sp.departement_id
  WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id
    AND d.province_id = NEW.province_id AND sp.actif = 1
))
BEGIN
  SELECT RAISE(ABORT, 'DISTRIBUTION_RATTACHEMENT_INVALIDE');
END;

CREATE TRIGGER verifier_zone_distribution_avant_insertion
BEFORE INSERT ON zones_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
)
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM localites l
  INNER JOIN distributions_provinciales d ON d.id = NEW.distribution_id
  WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
    AND (l.departement_id IS NULL OR l.departement_id = d.departement_id) AND l.statut_validation = 'VALIDE'
))
OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM arrondissements a
  WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id
    AND a.statut_validation = 'VALIDE'
))
OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM quartiers q
  WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id
    AND (NEW.arrondissement_id IS NULL OR q.arrondissement_id IS NULL OR q.arrondissement_id = NEW.arrondissement_id)
    AND q.statut_validation = 'VALIDE'
))
OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM carres c
  INNER JOIN quartiers q ON q.id = c.quartier_id
  WHERE c.id = NEW.carre_id AND c.quartier_id = NEW.quartier_id
    AND q.localite_id = NEW.localite_id AND c.statut_validation = 'VALIDE'
))
OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sites_humanitaires s
  INNER JOIN distributions_provinciales d ON d.id = NEW.distribution_id
  WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
    AND (s.departement_id IS NULL OR s.departement_id = d.departement_id) AND s.statut_validation = 'VALIDE'
))
BEGIN
  SELECT RAISE(ABORT, 'ZONE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_entrepot_avant_insertion
BEFORE INSERT ON entrepots
WHEN (NEW.niveau = 'CENTRAL' AND (NEW.province_id IS NOT NULL OR NEW.localite_id IS NOT NULL))
  OR (NEW.niveau = 'PROVINCIAL' AND (NEW.province_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.actif = 1
  )))
  OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.province_id = NEW.province_id
      AND l.statut_validation = 'VALIDE'
  ))
BEGIN
  SELECT RAISE(ABORT, 'RATTACHEMENT_ENTREPOT_INVALIDE');
END;

CREATE TRIGGER verifier_entrepot_avant_mise_a_jour
BEFORE UPDATE OF niveau, province_id, localite_id ON entrepots
WHEN (NEW.niveau = 'CENTRAL' AND (NEW.province_id IS NOT NULL OR NEW.localite_id IS NOT NULL))
  OR (NEW.niveau = 'PROVINCIAL' AND (NEW.province_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.actif = 1
  )))
  OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.province_id = NEW.province_id
      AND l.statut_validation = 'VALIDE'
  ))
BEGIN
  SELECT RAISE(ABORT, 'RATTACHEMENT_ENTREPOT_INVALIDE');
END;

CREATE TRIGGER verifier_signalement_doublon_avant_insertion
BEFORE INSERT ON signalements_doublons
WHEN NEW.menage_source_id = NEW.menage_suspect_id
  OR NOT EXISTS (
    SELECT 1 FROM menages source INNER JOIN menages suspect
      ON suspect.id = NEW.menage_suspect_id AND suspect.province_id = source.province_id
    WHERE source.id = NEW.menage_source_id AND source.province_id = NEW.province_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Un signalement de doublon doit relier deux ménages distincts de la même province.');
END;

CREATE TRIGGER verifier_signalement_doublon_avant_mise_a_jour
BEFORE UPDATE OF province_id, menage_source_id, menage_suspect_id ON signalements_doublons
WHEN NEW.menage_source_id = NEW.menage_suspect_id
  OR NOT EXISTS (
    SELECT 1 FROM menages source INNER JOIN menages suspect
      ON suspect.id = NEW.menage_suspect_id AND suspect.province_id = source.province_id
    WHERE source.id = NEW.menage_source_id AND source.province_id = NEW.province_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Un signalement de doublon doit relier deux ménages distincts de la même province.');
END;

CREATE TRIGGER verifier_menage_distribution_avant_insertion
BEFORE INSERT ON menages_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
    AND m.province_id = NEW.province_id AND m.departement_id = d.departement_id
    AND m.statut = 'ACTIF'
)
OR (NEW.zone_distribution_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM zones_distribution z
  INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE z.id = NEW.zone_distribution_id AND z.distribution_id = NEW.distribution_id
    AND z.province_id = NEW.province_id
    AND ((z.site_humanitaire_id IS NOT NULL AND m.site_humanitaire_id = z.site_humanitaire_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NOT NULL AND m.carre_id = z.carre_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NOT NULL AND m.quartier_id = z.quartier_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NULL AND z.arrondissement_id IS NOT NULL AND m.arrondissement_id = z.arrondissement_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NULL AND z.arrondissement_id IS NULL AND z.localite_id IS NOT NULL AND m.localite_id = z.localite_id))
))
BEGIN
  SELECT RAISE(ABORT, 'MENAGE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_allocation_distribution_avant_insertion
BEFORE INSERT ON allocations_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM menages_distribution md
  INNER JOIN articles_distribution ad ON ad.distribution_id = md.distribution_id
    AND ad.article_id = NEW.article_id
  WHERE md.id = NEW.menage_distribution_id
    AND md.distribution_id = NEW.distribution_id
    AND ad.distribution_id = NEW.distribution_id
    AND md.statut_service = 'EN_ATTENTE'
)
BEGIN
  SELECT RAISE(ABORT, 'ALLOCATION_DISTRIBUTION_INCOHERENTE');
END;

CREATE TRIGGER verifier_remise_distribution_avant_insertion
BEFORE INSERT ON remises_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN menages_distribution md ON md.id = NEW.menage_distribution_id
    AND md.distribution_id = d.id AND md.province_id = d.province_id
  INNER JOIN utilisateurs u ON u.id = NEW.agent_distributeur_id
    AND u.role = 'DELEGUE_PROVINCIAL' AND u.province_id = d.province_id AND u.statut = 'ACTIF'
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'EN_EXECUTION' AND md.statut_service IN ('EN_ATTENTE', 'PARTIELLEMENT_SERVI')
    AND md.menage_id = NEW.menage_id
)
BEGIN
  SELECT RAISE(ABORT, 'REMISE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_modification_distribution_apres_validation
BEFORE UPDATE ON distributions_provinciales
WHEN OLD.statut IN ('VALIDEE_PROVINCE', 'EN_EXECUTION', 'TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL')
  AND (NEW.reference_distribution <> OLD.reference_distribution
    OR NEW.intitule_distribution <> OLD.intitule_distribution
    OR NEW.province_id <> OLD.province_id
    OR NEW.departement_id <> OLD.departement_id
    OR NEW.sous_prefecture_id IS NOT OLD.sous_prefecture_id
    OR NEW.commune_id IS NOT OLD.commune_id
    OR NEW.nature_aide <> OLD.nature_aide
    OR NEW.bailleur_fonds_id IS NOT OLD.bailleur_fonds_id
    OR NEW.partenaire_execution_id IS NOT OLD.partenaire_execution_id
    OR NEW.objectif <> OLD.objectif
    OR NEW.nombre_menages_cibles <> OLD.nombre_menages_cibles
    OR NEW.nombre_personnes_cibles <> OLD.nombre_personnes_cibles
    OR NEW.date_prevue <> OLD.date_prevue
    OR NEW.entrepot_id <> OLD.entrepot_id
    OR NEW.liste_beneficiaires_id IS NOT OLD.liste_beneficiaires_id
    OR NEW.version_plan <> OLD.version_plan)
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_menages_distribution_valides
BEFORE INSERT ON menages_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_modification_menage_distribution
BEFORE UPDATE ON menages_distribution
WHEN (OLD.distribution_id <> NEW.distribution_id OR OLD.province_id <> NEW.province_id
    OR OLD.menage_id <> NEW.menage_id OR OLD.zone_distribution_id IS NOT NEW.zone_distribution_id)
  AND EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_suppression_menage_distribution
BEFORE DELETE ON menages_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER verifier_statut_menage_distribution
BEFORE UPDATE OF statut_service ON menages_distribution
WHEN NEW.statut_service <> OLD.statut_service AND NOT (
  OLD.statut_service = 'EN_ATTENTE' AND NEW.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI', 'ABSENT', 'NON_SERVI')
  OR OLD.statut_service = 'PARTIELLEMENT_SERVI' AND NEW.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI')
)
BEGIN
  SELECT RAISE(ABORT, 'TRANSITION_STATUT_MENAGE_INVALIDE');
END;

CREATE TRIGGER verifier_cloture_distribution_avant_insertion
BEFORE INSERT ON clotures_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN utilisateurs u ON u.id = NEW.cloture_par
    AND u.role = 'ADMIN_CENTRAL' AND u.statut = 'ACTIF'
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'CLOTUREE_CENTRAL' AND d.date_declaration_fin IS NOT NULL
)
OR NEW.pv_distribution_piece_id IS NULL
OR NOT EXISTS (
  SELECT 1 FROM pieces_jointes p
  WHERE p.id = NEW.pv_distribution_piece_id
    AND p.entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
    AND p.entite_liee_id = NEW.distribution_id
    AND p.province_id = NEW.province_id
    AND p.categorie_document = 'PV_DISTRIBUTION'
)
OR NOT json_valid(NEW.bilan_articles_json)
OR EXISTS (
  SELECT 1 FROM menages_distribution md
  WHERE md.distribution_id = NEW.distribution_id AND md.province_id = NEW.province_id
    AND (md.statut_service = 'EN_ATTENTE'
      OR (md.statut_service = 'PARTIELLEMENT_SERVI'
        AND (md.motif_non_service IS NULL OR length(trim(md.motif_non_service)) = 0))
      OR (md.statut_service IN ('ABSENT', 'NON_SERVI')
        AND (md.motif_non_service IS NULL OR length(trim(md.motif_non_service)) = 0)))
)
OR EXISTS (
  SELECT 1 FROM demandes_correction dc
  WHERE dc.distribution_id = NEW.distribution_id
    AND dc.statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE')
)
OR EXISTS (
  SELECT 1 FROM observations_controle o
  WHERE o.province_id = NEW.province_id AND o.statut = 'OUVERTE'
    AND o.niveau_gravite = 'CRITIQUE'
    AND (
      (o.operation_type = 'DISTRIBUTION_PROVINCIALE' AND o.operation_id = NEW.distribution_id)
      OR (o.operation_type = 'STOCK_PROVINCIAL' AND EXISTS (
        SELECT 1 FROM mouvements_stock m
        WHERE m.id = o.operation_id AND m.province_id = NEW.province_id
          AND (m.document_source_id = NEW.distribution_id
            OR (m.document_source_type = 'REMISE_DISTRIBUTION' AND EXISTS (
              SELECT 1 FROM remises_distribution rd
              WHERE rd.id = m.document_source_id AND rd.distribution_id = NEW.distribution_id
            )))
      ))
    )
)
OR EXISTS (
  SELECT 1 FROM reservations_stock r
  INNER JOIN lots_stock l ON l.id = r.lot_stock_id
  LEFT JOIN soldes_stock s ON s.entrepot_id = l.entrepot_id
    AND s.article_id = l.article_id AND s.province_id IS l.province_id
  WHERE r.distribution_id = NEW.distribution_id
    AND (
      abs(l.quantite_reservee - COALESCE((
        SELECT SUM(r2.quantite_reservee - r2.quantite_consommee - r2.quantite_liberee)
        FROM reservations_stock r2 WHERE r2.lot_stock_id = l.id AND r2.statut = 'ACTIVE'
      ), 0)) > 0.000001
      OR s.entrepot_id IS NULL
      OR abs(s.quantite_physique - COALESCE((
        SELECT SUM(l2.quantite_physique) FROM lots_stock l2
        WHERE l2.entrepot_id = l.entrepot_id AND l2.article_id = l.article_id
          AND l2.province_id IS l.province_id
      ), 0)) > 0.000001
      OR abs(s.quantite_reservee - COALESCE((
        SELECT SUM(l3.quantite_reservee) FROM lots_stock l3
        WHERE l3.entrepot_id = l.entrepot_id AND l3.article_id = l.article_id
          AND l3.province_id IS l.province_id
      ), 0)) > 0.000001
      OR abs(r.quantite_consommee - COALESCE((
        SELECT SUM(lr.quantite_remise) FROM lignes_remise lr
        INNER JOIN remises_distribution rd ON rd.id = lr.remise_id
        WHERE lr.reservation_id = r.id AND rd.distribution_id = NEW.distribution_id
      ), 0)) > 0.000001
    )
)
OR EXISTS (
  SELECT 1 FROM reservations_stock r
  WHERE r.distribution_id = NEW.distribution_id AND r.statut = 'ACTIVE'
    AND r.quantite_reservee - r.quantite_consommee - r.quantite_liberee > 0.000001
)
BEGIN
  SELECT RAISE(ABORT, 'CLOTURE_DISTRIBUTION_INCOMPLETE');
END;

CREATE TRIGGER verifier_inscription_beneficiaire_avant_insertion
BEFORE INSERT ON inscriptions_beneficiaires
WHEN NOT EXISTS (
  SELECT 1 FROM listes_beneficiaires lb INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE lb.id = NEW.liste_id AND lb.province_id = m.province_id
    AND lb.statut <> 'VERROUILLEE' AND m.statut = 'ACTIF'
    AND m.statut_validation = 'VALIDE'
)
BEGIN
  SELECT RAISE(ABORT, 'La liste et le ménage doivent relever de la même province et le ménage doit être validé et actif.');
END;

CREATE TRIGGER verifier_inscription_beneficiaire_avant_mise_a_jour
BEFORE UPDATE OF liste_id, menage_id ON inscriptions_beneficiaires
WHEN NOT EXISTS (
  SELECT 1 FROM listes_beneficiaires lb INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE lb.id = NEW.liste_id AND lb.province_id = m.province_id
    AND lb.statut <> 'VERROUILLEE' AND m.statut = 'ACTIF'
    AND m.statut_validation = 'VALIDE'
)
BEGIN
  SELECT RAISE(ABORT, 'La liste et le ménage doivent relever de la même province et le ménage doit être validé et actif.');
END;

CREATE TRIGGER verifier_statut_validation_menage_avant_insertion
BEFORE INSERT ON menages
WHEN (NEW.statut = 'ACTIF' AND NEW.statut_validation <> 'VALIDE')
  OR (NEW.statut = 'DOUBLON_SUSPECTE' AND NEW.statut_validation <> 'A_VERIFIER')
  OR (NEW.statut_validation = 'REFUSE' AND NEW.statut <> 'INACTIF')
BEGIN
  SELECT RAISE(ABORT, 'Le statut du ménage est incompatible avec son état de validation.');
END;

CREATE TRIGGER verifier_statut_validation_menage_avant_mise_a_jour
BEFORE UPDATE OF statut, statut_validation ON menages
WHEN (NEW.statut = 'ACTIF' AND NEW.statut_validation <> 'VALIDE')
  OR (NEW.statut = 'DOUBLON_SUSPECTE' AND NEW.statut_validation <> 'A_VERIFIER')
  OR (NEW.statut_validation = 'REFUSE' AND NEW.statut <> 'INACTIF')
  OR (OLD.statut = 'DOUBLON_SUSPECTE' AND NEW.statut = 'INACTIF' AND NEW.statut_validation = 'A_VERIFIER'
      AND NOT EXISTS (
        SELECT 1 FROM signalements_doublons sd
        WHERE sd.province_id = OLD.province_id
          AND sd.statut_traitement = 'CONFIRME_DISTINCT'
          AND (sd.menage_source_id = OLD.id OR sd.menage_suspect_id = OLD.id)
      ))
BEGIN
  SELECT RAISE(ABORT, 'La transition du ménage exige une revue ou une validation centrale correspondante.');
END;

CREATE TRIGGER verifier_confirmation_distincte_avant_mise_a_jour
BEFORE UPDATE OF statut_traitement ON signalements_doublons
WHEN OLD.statut_traitement = 'EN_ATTENTE'
  AND NEW.statut_traitement = 'CONFIRME_DISTINCT'
  AND (
    SELECT COUNT(*) FROM menages m
    WHERE m.province_id = OLD.province_id
      AND m.id IN (OLD.menage_source_id, OLD.menage_suspect_id)
      AND m.statut = 'DOUBLON_SUSPECTE'
  ) <> 2
BEGIN
  SELECT RAISE(ABORT, 'La décision de distinction exige que les deux ménages soient en revue de doublon.');
END;

CREATE TRIGGER appliquer_confirmation_distincte_apres_mise_a_jour
AFTER UPDATE OF statut_traitement ON signalements_doublons
WHEN OLD.statut_traitement = 'EN_ATTENTE'
  AND NEW.statut_traitement IN ('CONFIRME_DISTINCT', 'CONFIRME_DOUBLON')
BEGIN
  UPDATE menages
  SET statut = 'INACTIF', statut_validation = 'A_VERIFIER'
  WHERE NEW.statut_traitement = 'CONFIRME_DISTINCT'
    AND province_id = NEW.province_id
    AND id IN (NEW.menage_source_id, NEW.menage_suspect_id)
    AND statut = 'DOUBLON_SUSPECTE';

  INSERT INTO journaux_audit
    (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, donnees_avant, donnees_apres)
  SELECT lower(hex(randomblob(16))), u.id, u.role, NEW.province_id, NEW.statut_traitement,
    'SIGNALEMENT_DOUBLON', NEW.id,
    json_object('statut_traitement', OLD.statut_traitement),
    json_object('statut_traitement', NEW.statut_traitement, 'observations', NEW.observations)
  FROM utilisateurs u WHERE u.id = NEW.traite_par;
END;

CREATE TRIGGER journaliser_validation_menage_apres_mise_a_jour
AFTER UPDATE OF statut_validation ON menages
WHEN OLD.statut_validation = 'A_VERIFIER'
  AND NEW.statut_validation IN ('VALIDE', 'REFUSE')
BEGIN
  INSERT INTO journaux_audit
    (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, donnees_avant, donnees_apres)
  SELECT lower(hex(randomblob(16))), u.id, u.role, NEW.province_id,
    'VALIDATION_MENAGE_' || NEW.statut_validation, 'MENAGE', NEW.id,
    json_object('statut', OLD.statut, 'statut_validation', OLD.statut_validation),
    json_object('statut', NEW.statut, 'statut_validation', NEW.statut_validation, 'observations', NEW.motif_validation)
  FROM utilisateurs u WHERE u.id = NEW.validation_decidee_par;
END;

CREATE TRIGGER verifier_signalement_ouvert_avant_insertion
BEFORE INSERT ON signalements_doublons
WHEN NEW.statut_traitement = 'EN_ATTENTE'
  AND (
    SELECT COUNT(*) FROM menages m
    WHERE m.id IN (NEW.menage_source_id, NEW.menage_suspect_id)
      AND m.province_id = NEW.province_id
      AND m.statut = 'DOUBLON_SUSPECTE'
      AND m.statut_validation = 'A_VERIFIER'
  ) <> 2
BEGIN
  SELECT RAISE(ABORT, 'Une revue ouverte exige deux ménages en vérification dans la même province.');
END;

CREATE TRIGGER verifier_doublon_menage_concurrent_apres_insertion
AFTER INSERT ON menages
WHEN NEW.statut = 'ACTIF'
 AND EXISTS (
   SELECT 1 FROM menages existant
   WHERE existant.id <> NEW.id
     AND existant.province_id = NEW.province_id
     AND existant.statut <> 'ARCHIVE'
     AND (
       (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
       OR (NEW.localite_id IS NOT NULL
           AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
           AND existant.localite_id = NEW.localite_id)
     )
 )
BEGIN
  UPDATE menages
  SET statut = 'INACTIF', statut_validation = 'A_VERIFIER'
  WHERE id = NEW.id
    AND EXISTS (
      SELECT 1 FROM menages existant
      INNER JOIN signalements_doublons sd ON sd.province_id = existant.province_id
        AND (sd.menage_source_id = existant.id OR sd.menage_suspect_id = existant.id)
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
      WHERE existant.id <> NEW.id
        AND existant.province_id = NEW.province_id
        AND existant.statut <> 'ARCHIVE'
        AND (
          (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
          OR (NEW.localite_id IS NOT NULL
              AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
              AND existant.localite_id = NEW.localite_id)
        )
    );

  UPDATE menages
  SET statut = 'DOUBLON_SUSPECTE', statut_validation = 'A_VERIFIER'
  WHERE id = NEW.id AND statut = 'ACTIF'
    AND NOT EXISTS (
      SELECT 1 FROM menages existant
      INNER JOIN signalements_doublons sd ON sd.province_id = existant.province_id
        AND (sd.menage_source_id = existant.id OR sd.menage_suspect_id = existant.id)
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
      WHERE existant.id <> NEW.id
        AND existant.province_id = NEW.province_id
        AND existant.statut <> 'ARCHIVE'
        AND (
          (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
          OR (NEW.localite_id IS NOT NULL
              AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
              AND existant.localite_id = NEW.localite_id)
        )
    );

  UPDATE menages
  SET statut = 'DOUBLON_SUSPECTE', statut_validation = 'A_VERIFIER'
  WHERE province_id = NEW.province_id AND id <> NEW.id AND statut <> 'ARCHIVE'
    AND (
      (NEW.telephone IS NOT NULL AND telephone = NEW.telephone)
      OR (NEW.localite_id IS NOT NULL
           AND lower(trim(nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
           AND localite_id = NEW.localite_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM signalements_doublons sd
      WHERE sd.province_id = NEW.province_id
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
        AND (sd.menage_source_id = menages.id OR sd.menage_suspect_id = menages.id)
    );

  INSERT OR IGNORE INTO signalements_doublons (
    id, province_id, menage_source_id, menage_suspect_id, motif_similitude
  )
  SELECT lower(hex(randomblob(16))), NEW.province_id, existant.id, NEW.id,
    CASE
      WHEN NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone THEN 'MEME_TELEPHONE'
      ELSE 'NOM_ET_LOCALITE_SIMILAIRES'
    END
  FROM menages existant
  WHERE existant.id <> NEW.id
    AND existant.province_id = NEW.province_id
    AND existant.statut <> 'ARCHIVE'
    AND (
      (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
      OR (NEW.localite_id IS NOT NULL
          AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
          AND existant.localite_id = NEW.localite_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM signalements_doublons sd
      WHERE sd.province_id = NEW.province_id
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
        AND (sd.menage_source_id = existant.id OR sd.menage_suspect_id = existant.id)
    )
  ORDER BY
    CASE WHEN NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone THEN 0 ELSE 1 END,
    existant.cree_le ASC,
    existant.id ASC
  LIMIT 1;
END;

PRAGMA foreign_keys = ON;
