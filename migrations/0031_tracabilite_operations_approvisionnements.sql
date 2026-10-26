PRAGMA foreign_keys = ON;

-- Migration 0031 : Traçabilité intégrée des opérations, approvisionnements et distributions
-- Permet de rattacher facultativement un approvisionnement central à une opération centrale
-- sans rupture de compatibilité pour les approvisionnements existants ou autonomes.

ALTER TABLE approvisionnements_centraux ADD COLUMN operation_centrale_id TEXT REFERENCES operations_centrales_distribution(id);

CREATE INDEX IF NOT EXISTS idx_app_centraux_op_centrale ON approvisionnements_centraux(operation_centrale_id);
