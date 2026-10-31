-- D-02/D-16/D-17: trace des exceptions d'accès nominatif approuvées par un second administrateur central.
-- Additif et INERTE: aucune route ni aucun middleware ne consulte cette table; l'enforcement relève de B2.6.

CREATE TABLE exceptions_acces_nominatif (
    id TEXT PRIMARY KEY,
    demande_id TEXT NOT NULL UNIQUE REFERENCES demandes_approbation(id),
    beneficiaire_id TEXT NOT NULL REFERENCES utilisateurs(id),
    route_cible TEXT NOT NULL CHECK (route_cible IN ('GET /api/distributions/menages')),
    finalite TEXT NOT NULL CHECK (length(trim(finalite)) >= 10),
    accorde_par TEXT NOT NULL REFERENCES utilisateurs(id),
    accorde_le TEXT NOT NULL DEFAULT (datetime('now')),
    expire_le TEXT NOT NULL,
    revoque_le TEXT,
    CHECK (expire_le > accorde_le),
    CHECK (expire_le <= datetime(accorde_le, '+24 hours')),
    CHECK (accorde_par <> beneficiaire_id)
);

CREATE INDEX idx_exceptions_acces_nominatif_beneficiaire
    ON exceptions_acces_nominatif(beneficiaire_id, expire_le DESC);

-- Les lignes sont immuables sauf la révocation (revoque_le renseigné une seule fois).
CREATE TRIGGER verifier_exception_acces_nominatif_immuable
BEFORE UPDATE ON exceptions_acces_nominatif
WHEN OLD.revoque_le IS NOT NULL
  OR NEW.id <> OLD.id OR NEW.demande_id <> OLD.demande_id OR NEW.beneficiaire_id <> OLD.beneficiaire_id
  OR NEW.route_cible <> OLD.route_cible OR NEW.finalite <> OLD.finalite OR NEW.accorde_par <> OLD.accorde_par
  OR NEW.accorde_le <> OLD.accorde_le OR NEW.expire_le <> OLD.expire_le
BEGIN
  SELECT RAISE(ABORT, 'EXCEPTION_ACCES_NOMINATIF_IMMUABLE');
END;
