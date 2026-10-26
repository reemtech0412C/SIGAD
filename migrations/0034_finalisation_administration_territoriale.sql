-- ============================================================================
-- Migration 0034 : Finalisation de l'administration territoriale et subdivisions
-- Date : 2026-10-25
-- Description :
--   1. Prise en charge des subdivisions géographiques (BLOC, SECTEUR, CARRE)
--   2. Support des subdivisions rattachées aux quartiers urbains ou sites humanitaires
--   3. Extension de la table carres avec type_subdivision et site_humanitaire_id
--   4. Mise à jour de audits_territoire pour supporter BLOC et SECTEUR
-- ============================================================================

-- 1. Ajout des colonnes type_subdivision et site_humanitaire_id sur carres
ALTER TABLE carres ADD COLUMN type_subdivision TEXT NOT NULL DEFAULT 'CARRE';
ALTER TABLE carres ADD COLUMN site_humanitaire_id TEXT REFERENCES sites_humanitaires(id);

-- 2. Index pour les recherches performantes par type de subdivision
CREATE INDEX IF NOT EXISTS idx_carres_type_subdivision ON carres (type_subdivision);
CREATE INDEX IF NOT EXISTS idx_carres_site_humanitaire ON carres (site_humanitaire_id);

-- 3. Mise à jour de audits_territoire pour intégrer BLOC et SECTEUR dans entite_type
-- Dans SQLite, recreation de audits_territoire pour mettre à jour la contrainte CHECK
CREATE TABLE audits_territoire_new (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('CREATION', 'MODIFICATION', 'VALIDATION', 'MODIFICATION_RATTACHEMENT', 'FUSION', 'ARCHIVAGE', 'REACTIVATION', 'SUPPRESSION')),
    entite_type TEXT NOT NULL CHECK (entite_type IN (
        'PROVINCE', 'DEPARTEMENT', 'SOUS_PREFECTURE', 'COMMUNE', 'CANTON', 
        'VILLE', 'VILLAGE', 'FERRICK', 'CAMPEMENT', 'ARRONDISSEMENT', 
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

INSERT INTO audits_territoire_new SELECT * FROM audits_territoire;
DROP TABLE audits_territoire;
ALTER TABLE audits_territoire_new RENAME TO audits_territoire;

CREATE INDEX IF NOT EXISTS idx_audits_terr_entite ON audits_territoire (entite_type, entite_id);
CREATE INDEX IF NOT EXISTS idx_audits_terr_action ON audits_territoire (action);
CREATE INDEX IF NOT EXISTS idx_audits_terr_cree ON audits_territoire (cree_le DESC);
