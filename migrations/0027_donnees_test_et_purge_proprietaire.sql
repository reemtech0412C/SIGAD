-- =====================================================================
-- SIGAD — MIGRATION 0027 : GESTION ET PURGE DES DONNÉES DE TEST
-- Fonctionnalité exclusive du compte PROPRIETAIRE
-- Classification explicite : REEL, TEST, INDETERMINE
-- Traçabilité immuable des suppressions et reclassifications
-- =====================================================================

-- 1. Classification explicite sur les opérations centrales
ALTER TABLE operations_centrales_distribution
  ADD COLUMN nature_donnees TEXT NOT NULL DEFAULT 'REEL'
  CHECK (nature_donnees IN ('REEL', 'TEST', 'INDETERMINE'));

-- Règle de sécurité : les opérations historiques préexistantes sont marquées INDETERMINE
UPDATE operations_centrales_distribution
  SET nature_donnees = 'INDETERMINE'
  WHERE nature_donnees = 'REEL';

CREATE INDEX IF NOT EXISTS idx_operations_centrales_nature
  ON operations_centrales_distribution(nature_donnees, statut);

-- 2. Classification explicite sur les distributions provinciales
ALTER TABLE distributions_provinciales
  ADD COLUMN nature_donnees TEXT NOT NULL DEFAULT 'REEL'
  CHECK (nature_donnees IN ('REEL', 'TEST', 'INDETERMINE'));

UPDATE distributions_provinciales
  SET nature_donnees = 'INDETERMINE'
  WHERE operation_centrale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_distributions_provinciales_nature
  ON distributions_provinciales(nature_donnees, statut);

-- 3. Procédure formelle de reclassification administrative
CREATE TABLE IF NOT EXISTS demandes_reclassification_donnees (
  id TEXT PRIMARY KEY,
  entite_type TEXT NOT NULL CHECK (entite_type IN ('OPERATION_CENTRALE', 'DISTRIBUTION_PROVINCIALE')),
  entite_id TEXT NOT NULL,
  code_entite TEXT NOT NULL,
  intitule_entite TEXT NOT NULL,
  nature_initiale TEXT NOT NULL CHECK (nature_initiale IN ('REEL', 'TEST', 'INDETERMINE')),
  nature_cible TEXT NOT NULL CHECK (nature_cible IN ('REEL', 'TEST')),
  motif TEXT NOT NULL CHECK (length(trim(motif)) >= 10),
  preuves_justificatives TEXT NOT NULL,
  verifications_automatiques_json TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'SOUMISE' CHECK (statut IN ('SOUMISE', 'APPROUVEE', 'REJETEE')),
  demandeur_id TEXT NOT NULL REFERENCES utilisateurs(id),
  examine_par_id TEXT REFERENCES utilisateurs(id),
  examine_le TEXT,
  decision_commentaire TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_demandes_reclassification_entite
  ON demandes_reclassification_donnees(entite_type, entite_id, cree_le DESC);

-- 4. Journal d'audit indépendant et immuable des suppressions de test
CREATE TABLE IF NOT EXISTS audits_suppression_donnees_test (
  id TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id),
  utilisateur_identifiant TEXT NOT NULL,
  utilisateur_nom TEXT NOT NULL,
  adresse_ip TEXT,
  entite_type TEXT NOT NULL CHECK (entite_type IN ('OPERATION_CENTRALE', 'DISTRIBUTION_PROVINCIALE', 'LOT_TEST')),
  entite_id TEXT NOT NULL,
  code_entite TEXT NOT NULL,
  intitule_entite TEXT NOT NULL,
  perimetre_supprime_json TEXT NOT NULL,
  documents_r2_supprimes_json TEXT,
  motif TEXT NOT NULL CHECK (length(trim(motif)) >= 5),
  details_verification_json TEXT NOT NULL,
  statut_resultat TEXT NOT NULL CHECK (statut_resultat IN ('SUCCES', 'ECHEC_PARTIEL', 'BLOQUE')),
  horodatage TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audits_suppression_test_date
  ON audits_suppression_donnees_test(horodatage DESC);

CREATE INDEX IF NOT EXISTS idx_audits_suppression_test_code
  ON audits_suppression_donnees_test(code_entite);

-- 5. Immuabilité stricte du journal d'audit de suppression
CREATE TRIGGER IF NOT EXISTS trg_audit_suppression_test_immuable_update
BEFORE UPDATE ON audits_suppression_donnees_test
BEGIN
  SELECT RAISE(ABORT, 'Le journal d’audit de suppression de données de test est strictement immuable.');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_suppression_test_immuable_delete
BEFORE DELETE ON audits_suppression_donnees_test
BEGIN
  SELECT RAISE(ABORT, 'Les enregistrements d’audit de suppression de données de test ne peuvent pas être supprimés.');
END;

-- 6. File persistante de réconciliation des objets R2 orphelins
CREATE TABLE IF NOT EXISTS file_reconciliation_r2_orphelins (
  id TEXT PRIMARY KEY,
  cle_r2 TEXT NOT NULL,
  entite_id TEXT NOT NULL,
  code_entite TEXT NOT NULL,
  audit_id TEXT REFERENCES audits_suppression_donnees_test(id),
  statut TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'PURGEE', 'ECHOUEE_DEFINITIVE')),
  tentatives INTEGER NOT NULL DEFAULT 0,
  derniere_tentative TEXT,
  prochaine_tentative TEXT NOT NULL DEFAULT (datetime('now')),
  dernier_message_erreur TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  purgee_le TEXT
);

CREATE INDEX IF NOT EXISTS idx_file_reconciliation_r2_statut
  ON file_reconciliation_r2_orphelins(statut, prochaine_tentative);

CREATE INDEX IF NOT EXISTS idx_file_reconciliation_r2_cle
  ON file_reconciliation_r2_orphelins(cle_r2);
