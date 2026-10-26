PRAGMA foreign_keys = OFF;

-- =============================================================================
-- Migration 0033 : Activation opérationnelle globale du référentiel territorial
-- Décision du Propriétaire : mise en service des 112 départements
-- Conservation intégrale de la qualification juridique et traçabilité historique
-- =============================================================================

-- 1. Ajout des colonnes de qualification opérationnelle et juridique
ALTER TABLE departements ADD COLUMN statut_operationnel TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut_operationnel IN ('ACTIF', 'SUSPENDU', 'ARCHIVE'));
ALTER TABLE departements ADD COLUMN certification_juridique TEXT NOT NULL DEFAULT 'NON_CERTIFIE' CHECK (certification_juridique IN ('CERTIFIE_OFFICIEL', 'NON_CERTIFIE', 'EN_COURS', 'HISTORIQUE'));
ALTER TABLE departements ADD COLUMN active_par_proprietaire INTEGER NOT NULL DEFAULT 1 CHECK (active_par_proprietaire IN (0, 1));
ALTER TABLE departements ADD COLUMN date_activation_operationnelle TEXT;

-- 2. Activation opérationnelle immédiate des 112 départements existants
UPDATE departements
SET 
    statut_operationnel = 'ACTIF',
    statut_validation = 'VALIDE',
    actif = 1,
    active_par_proprietaire = 1,
    date_activation_operationnelle = datetime('now');

-- 3. Qualification juridique : 80 certifiés officiels vs 32 candidats actifs
UPDATE departements
SET certification_juridique = 'CERTIFIE_OFFICIEL'
WHERE validation_administrative = 'VALIDE' 
  AND reference_juridique IS NOT NULL 
  AND reference_juridique != 'Projet de découpage 2024';

UPDATE departements
SET certification_juridique = 'NON_CERTIFIE'
WHERE validation_administrative != 'VALIDE' 
   OR reference_juridique IS NULL 
   OR reference_juridique = 'Projet de découpage 2024';

-- 4. Élargissement de la table d'audit des mutations pour inclure l'action REACTIVATION
CREATE TABLE audits_territoire_nouvelle (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('CREATION', 'MODIFICATION', 'MODIFICATION_RATTACHEMENT', 'FUSION', 'ARCHIVAGE', 'REACTIVATION', 'SUPPRESSION', 'VALIDATION', 'RETRAIT_VALIDATION', 'IMPORT')),
    entite_type TEXT NOT NULL,
    entite_id TEXT NOT NULL,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    anciennes_valeurs TEXT,
    nouvelles_valeurs TEXT,
    justificatif TEXT,
    motif TEXT,
    adresse_ip TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO audits_territoire_nouvelle 
SELECT id, action, entite_type, entite_id, utilisateur_id, anciennes_valeurs, nouvelles_valeurs, justificatif, motif, adresse_ip, cree_le 
FROM audits_territoire;

DROP TABLE audits_territoire;
ALTER TABLE audits_territoire_nouvelle RENAME TO audits_territoire;

CREATE INDEX IF NOT EXISTS idx_audits_terr_entite ON audits_territoire(entite_type, entite_id);
CREATE INDEX IF NOT EXISTS idx_audits_terr_action ON audits_territoire(action);
CREATE INDEX IF NOT EXISTS idx_audits_terr_cree ON audits_territoire(cree_le);

PRAGMA foreign_keys = ON;
