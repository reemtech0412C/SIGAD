-- B2.6 / D-04: relation d'affectation vérifiable pour SUPERVISEUR_TERRAIN et AGENT_DISTRIBUTION.
-- Additive, Shadow uniquement: aucune route Legacy ne lit cette table et aucune permission n'en dépend.

CREATE TABLE IF NOT EXISTS affectations_terrain_distributions (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    role_terrain TEXT NOT NULL CHECK (role_terrain IN ('SUPERVISEUR_TERRAIN', 'AGENT_DISTRIBUTION')),
    distribution_id TEXT NOT NULL REFERENCES distributions_provinciales(id),
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'REVOQUE')),
    valide_du TEXT,
    valide_au TEXT,
    motif TEXT NOT NULL CHECK (length(trim(motif)) > 0),
    attribue_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (attribue_par <> utilisateur_id),
    CHECK (valide_du IS NULL OR valide_au IS NULL OR valide_au > valide_du)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affectations_terrain_distribution_active
    ON affectations_terrain_distributions(utilisateur_id, role_terrain, distribution_id)
    WHERE statut = 'ACTIF';
CREATE INDEX IF NOT EXISTS idx_affectations_terrain_distribution_ressource
    ON affectations_terrain_distributions(distribution_id, statut);

-- Le profil terrain actif du même rôle et de la même province est obligatoire: pas d'affectation sans habilitation.
CREATE TRIGGER verifier_affectation_terrain_distribution_profil
BEFORE INSERT ON affectations_terrain_distributions
WHEN NOT EXISTS (
    SELECT 1 FROM profils_operationnels_terrain p
    JOIN distributions_provinciales d ON d.id = NEW.distribution_id
    WHERE p.utilisateur_id = NEW.utilisateur_id AND p.role_terrain = NEW.role_terrain
      AND p.statut = 'ACTIF' AND p.province_id = d.province_id
)
BEGIN
  SELECT RAISE(ABORT, 'AFFECTATION_TERRAIN_PROFIL_OU_PROVINCE_INVALIDE');
END;

-- Seuls le statut, la validité et la date de modification évoluent; la cible est immuable.
CREATE TRIGGER verifier_affectation_terrain_distribution_immuable
BEFORE UPDATE OF utilisateur_id, role_terrain, distribution_id, attribue_par ON affectations_terrain_distributions
BEGIN
  SELECT RAISE(ABORT, 'AFFECTATION_TERRAIN_CIBLE_IMMUABLE');
END;
