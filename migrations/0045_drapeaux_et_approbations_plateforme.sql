-- B3.2 / D-15 à D-17: catalogue fermé de drapeaux et demandes d'approbation à second approbateur.
-- Additif et inerte: aucune route, aucun middleware ni aucune permission ne lit ces tables dans cette migration.

CREATE TABLE drapeaux_plateforme (
    code TEXT PRIMARY KEY CHECK (code GLOB '[a-z]*' AND length(code) BETWEEN 3 AND 64 AND code NOT GLOB '*[^a-z0-9_]*'),
    categorie TEXT NOT NULL CHECK (categorie IN ('PRESENTATION', 'AUTORISATION', 'TECHNIQUE')),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    actif INTEGER NOT NULL DEFAULT 0 CHECK (actif IN (0, 1)),
    double_controle INTEGER NOT NULL CHECK (double_controle IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    modifie_par TEXT REFERENCES utilisateurs(id),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
    -- Un drapeau d'autorisation est toujours à double contrôle (D-15).
    CHECK (categorie <> 'AUTORISATION' OR double_controle = 1)
);

INSERT INTO drapeaux_plateforme (code, categorie, description, actif, double_controle) VALUES
('consoles_v2', 'PRESENTATION', 'Interface par console (plateforme, national, provincial, institution).', 0, 0),
('authz_observation', 'AUTORISATION', 'Évaluation Shadow des autorisations en observation (sans effet sur l''accès).', 0, 1),
('etats_compte_v2', 'TECHNIQUE', 'Cycle de vie des comptes, sessions et appareils (B2.5).', 0, 1),
('geo_v2_ecriture', 'TECHNIQUE', 'Écriture du référentiel géographique v2 (B2.3).', 0, 1),
('roles_personnalises', 'AUTORISATION', 'Rôles personnalisés (hors rôles système).', 0, 1);

CREATE TABLE demandes_approbation (
    id TEXT PRIMARY KEY,
    action_code TEXT NOT NULL CHECK (action_code GLOB '[A-Z]*' AND length(action_code) BETWEEN 3 AND 80 AND action_code NOT GLOB '*[^A-Z0-9_]*'),
    classe TEXT NOT NULL DEFAULT 'A' CHECK (classe = 'A'),
    cible_type TEXT NOT NULL CHECK (length(trim(cible_type)) > 0),
    cible_id TEXT NOT NULL CHECK (length(trim(cible_id)) > 0),
    empreinte_action TEXT NOT NULL CHECK (length(empreinte_action) = 64 AND empreinte_action NOT GLOB '*[^0-9a-f]*'),
    parametres TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(parametres)),
    motif TEXT NOT NULL CHECK (length(trim(motif)) >= 10),
    demandeur_id TEXT NOT NULL REFERENCES utilisateurs(id),
    role_approbateur_requis TEXT NOT NULL CHECK (role_approbateur_requis IN ('PROPRIETAIRE', 'ADMIN_CENTRAL')),
    statut TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'APPROUVEE', 'REFUSEE', 'EXPIREE', 'EXECUTEE', 'ANNULEE')),
    decide_par TEXT REFERENCES utilisateurs(id),
    decide_le TEXT,
    motif_decision TEXT,
    execute_le TEXT,
    request_id TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    expire_le TEXT NOT NULL,
    CHECK (expire_le > cree_le),
    CHECK ((statut IN ('APPROUVEE', 'REFUSEE', 'EXECUTEE')) = (decide_par IS NOT NULL AND decide_le IS NOT NULL)),
    CHECK (statut <> 'EXECUTEE' OR execute_le IS NOT NULL),
    CHECK (decide_par IS NULL OR decide_par <> demandeur_id)
);

CREATE INDEX idx_demandes_approbation_statut ON demandes_approbation(statut, expire_le);
CREATE INDEX idx_demandes_approbation_demandeur ON demandes_approbation(demandeur_id, cree_le DESC, id);
CREATE UNIQUE INDEX idx_demandes_approbation_unique_ouverte
    ON demandes_approbation(action_code, cible_type, cible_id, empreinte_action)
    WHERE statut IN ('EN_ATTENTE', 'APPROUVEE');

-- Durée de vie maximale de 24 h et approbateur différent de la cible lorsque la cible est un compte.
CREATE TRIGGER verifier_demande_approbation_creation
BEFORE INSERT ON demandes_approbation
WHEN NEW.statut <> 'EN_ATTENTE'
  OR NEW.expire_le > datetime(NEW.cree_le, '+24 hours')
  OR NEW.decide_par IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_APPROBATION_CREATION_INVALIDE');
END;

-- Transitions autorisées: EN_ATTENTE vers APPROUVEE/REFUSEE/EXPIREE/ANNULEE, APPROUVEE vers EXECUTEE/EXPIREE; états terminaux figés.
CREATE TRIGGER verifier_demande_approbation_transition
BEFORE UPDATE OF statut ON demandes_approbation
WHEN NOT (
  (OLD.statut = 'EN_ATTENTE' AND NEW.statut IN ('APPROUVEE', 'REFUSEE', 'EXPIREE', 'ANNULEE'))
  OR (OLD.statut = 'APPROUVEE' AND NEW.statut IN ('EXECUTEE', 'EXPIREE'))
)
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_APPROBATION_TRANSITION_INVALIDE');
END;

-- L'action demandée est immuable: l'approbation vaut pour cette empreinte exacte.
CREATE TRIGGER verifier_demande_approbation_immuable
BEFORE UPDATE OF action_code, classe, cible_type, cible_id, empreinte_action, parametres, motif, demandeur_id, role_approbateur_requis, cree_le, expire_le
ON demandes_approbation
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_APPROBATION_ACTION_IMMUABLE');
END;

-- Pas d'auto-approbation d'une demande dont l'approbateur est la cible, et pas d'approbation par un autre rôle.
CREATE TRIGGER verifier_demande_approbation_decision
BEFORE UPDATE OF decide_par ON demandes_approbation
WHEN NEW.decide_par IS NOT NULL AND (
  NEW.decide_par = OLD.demandeur_id
  OR (OLD.cible_type = 'UTILISATEUR' AND NEW.decide_par = OLD.cible_id)
  OR NOT EXISTS (
    SELECT 1 FROM utilisateurs u
    WHERE u.id = NEW.decide_par AND u.statut = 'ACTIF' AND u.role = OLD.role_approbateur_requis
  )
)
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_APPROBATION_APPROBATEUR_INVALIDE');
END;
