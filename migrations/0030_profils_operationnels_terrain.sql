PRAGMA foreign_keys = ON;

-- Migration 0030 : Profils opérationnels de terrain et séparation des responsabilités
-- Permet de rattacher des utilisateurs à des rôles métiers de terrain :
-- RESPONSABLE_STOCK, SUPERVISEUR_TERRAIN, AGENT_DISTRIBUTION
-- sans altérer le schéma fondamental ni les 25 comptes de référence.

CREATE TABLE IF NOT EXISTS profils_operationnels_terrain (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    role_terrain TEXT NOT NULL CHECK (role_terrain IN ('RESPONSABLE_STOCK', 'SUPERVISEUR_TERRAIN', 'AGENT_DISTRIBUTION')),
    province_id TEXT NOT NULL REFERENCES provinces(id),
    entrepot_id TEXT REFERENCES entrepots(id),
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'REVOQUE')),
    attribue_par TEXT NOT NULL REFERENCES utilisateurs(id),
    notes TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_profils_terrain_utilisateur ON profils_operationnels_terrain(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_profils_terrain_province ON profils_operationnels_terrain(province_id);
CREATE INDEX IF NOT EXISTS idx_profils_terrain_entrepot ON profils_operationnels_terrain(entrepot_id);
CREATE INDEX IF NOT EXISTS idx_profils_terrain_statut ON profils_operationnels_terrain(statut);
