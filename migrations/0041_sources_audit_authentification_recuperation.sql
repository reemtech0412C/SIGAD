ALTER TABLE evenements_connexion ADD COLUMN request_id TEXT;
ALTER TABLE preuves_operateur_recuperation ADD COLUMN request_id TEXT;
ALTER TABLE preuves_operateur_recuperation ADD COLUMN adresse_ip TEXT;

DROP TRIGGER evenements_audit_immuables_update;
DROP TRIGGER evenements_audit_immuables_delete;
DROP TRIGGER adapter_journaux_audit_vers_evenements;
DROP TRIGGER adapter_audits_territoire_vers_evenements;
DROP TRIGGER adapter_historique_decoupages_vers_evenements;
DROP TRIGGER adapter_decisions_comptes_vers_evenements;
DROP TRIGGER adapter_historique_operations_vers_evenements;

ALTER TABLE evenements_audit RENAME TO evenements_audit_b24;

CREATE TABLE evenements_audit (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL CHECK (source_table IN (
    'journaux_audit', 'audits_territoire', 'historique_decoupages',
    'decisions_comptes', 'historique_operations_centrales',
    'evenements_connexion', 'preuves_operateur_recuperation'
  )),
  source_id TEXT NOT NULL,
  request_id TEXT,
  acteur_id TEXT REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  acteur_identite TEXT,
  acteur_role TEXT,
  portee_gid TEXT,
  appareil_id TEXT,
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 120),
  cible_type TEXT,
  cible_id TEXT,
  avant TEXT CHECK (avant IS NULL OR json_valid(avant)),
  apres TEXT CHECK (apres IS NULL OR json_valid(apres)),
  motif TEXT,
  adresse_ip TEXT,
  resultat TEXT NOT NULL CHECK (resultat IN ('SUCCES', 'ECHEC')),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_table, source_id)
);

INSERT INTO evenements_audit (
  id, source_table, source_id, request_id, acteur_id, acteur_role, portee_gid,
  appareil_id, action, cible_type, cible_id, avant, apres, motif, adresse_ip,
  resultat, cree_le
)
SELECT id, source_table, source_id, request_id, acteur_id, acteur_role, portee_gid,
  appareil_id, action, cible_type, cible_id, avant, apres, motif, adresse_ip,
  resultat, cree_le
FROM evenements_audit_b24;

DROP TABLE evenements_audit_b24;

CREATE INDEX idx_evenements_audit_acteur_date
  ON evenements_audit(acteur_id, cree_le DESC, id);
CREATE INDEX idx_evenements_audit_action_date
  ON evenements_audit(action, cree_le DESC, id);
CREATE INDEX idx_evenements_audit_cible_date
  ON evenements_audit(cible_type, cible_id, cree_le DESC, id);
CREATE INDEX idx_evenements_audit_request
  ON evenements_audit(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX idx_evenements_audit_requete_cible
  ON evenements_audit(request_id, cible_type, cible_id)
  WHERE request_id IS NOT NULL AND cible_type IS NOT NULL AND cible_id IS NOT NULL;

CREATE TRIGGER evenements_audit_immuables_update
BEFORE UPDATE ON evenements_audit
BEGIN
  SELECT RAISE(ABORT, 'EVENEMENTS_AUDIT_IMMUABLE');
END;

CREATE TRIGGER evenements_audit_immuables_delete
BEFORE DELETE ON evenements_audit
BEGIN
  SELECT RAISE(ABORT, 'EVENEMENTS_AUDIT_IMMUABLE');
END;

CREATE TRIGGER adapter_journaux_audit_vers_evenements
AFTER INSERT ON journaux_audit
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role, portee_gid,
    action, cible_type, cible_id, avant, apres, motif, adresse_ip, resultat, cree_le
  ) VALUES (
    'audit:journaux_audit:' || NEW.id, 'journaux_audit', NEW.id, NEW.request_id,
    NEW.utilisateur_id, NEW.role_utilisateur, NEW.province_id,
    NEW.action, NEW.entite_type, NEW.entite_id, NULL,
    json_object('source_table', 'journaux_audit', 'source_id', NEW.id, 'details_redactes', 1),
    NEW.motif, NEW.adresse_ip, 'SUCCES', NEW.cree_le
  );
END;

CREATE TRIGGER adapter_audits_territoire_vers_evenements
AFTER INSERT ON audits_territoire
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role,
    action, cible_type, cible_id, avant, apres, motif, adresse_ip, resultat, cree_le
  ) VALUES (
    'audit:audits_territoire:' || NEW.id, 'audits_territoire', NEW.id, NEW.request_id,
    NEW.utilisateur_id, (SELECT role FROM utilisateurs WHERE id = NEW.utilisateur_id),
    CASE WHEN NEW.action = 'FUSION' THEN 'FUSION_TERRITORIALE' ELSE NEW.action END,
    NEW.entite_type, NEW.entite_id, NULL,
    json_object('source_table', 'audits_territoire', 'source_id', NEW.id, 'details_redactes', 1),
    CASE WHEN NEW.motif IS NOT NULL OR NEW.justificatif IS NOT NULL
      THEN 'Motif conservé dans la source spécialisée.' ELSE NULL END,
    NEW.adresse_ip, 'SUCCES', NEW.cree_le
  );
END;

CREATE TRIGGER adapter_historique_decoupages_vers_evenements
AFTER INSERT ON historique_decoupages
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role,
    action, cible_type, cible_id, avant, apres, adresse_ip, resultat, cree_le
  ) VALUES (
    'audit:historique_decoupages:' || NEW.id, 'historique_decoupages', NEW.id, NEW.request_id,
    NEW.auteur_id, (SELECT role FROM utilisateurs WHERE id = NEW.auteur_id),
    NEW.type_modification, NEW.entite_type, NEW.entite_id, NULL,
    json_object('source_table', 'historique_decoupages', 'source_id', NEW.id, 'details_redactes', 1),
    NULL, 'SUCCES', NEW.cree_le
  );
END;

CREATE TRIGGER adapter_decisions_comptes_vers_evenements
AFTER INSERT ON decisions_comptes
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role,
    action, cible_type, cible_id, avant, apres, motif, resultat, cree_le
  ) VALUES (
    'audit:decisions_comptes:' || NEW.id, 'decisions_comptes', NEW.id, NEW.request_id,
    NEW.acteur_id, (SELECT role FROM utilisateurs WHERE id = NEW.acteur_id),
    NEW.action,
    CASE
      WHEN NEW.inscription_id IS NOT NULL THEN 'INSCRIPTION_DELEGUE'
      WHEN EXISTS (SELECT 1 FROM comptes_consultation cc WHERE cc.utilisateur_id = NEW.utilisateur_cible_id)
        THEN 'COMPTE_CONSULTATION'
      WHEN NEW.utilisateur_cible_id IS NOT NULL THEN 'UTILISATEUR'
      ELSE 'INSCRIPTION_DELEGUE'
    END,
    coalesce(
      NEW.inscription_id,
      (SELECT cc.id FROM comptes_consultation cc WHERE cc.utilisateur_id = NEW.utilisateur_cible_id),
      NEW.utilisateur_cible_id
    ),
    NULL,
    json_object('source_table', 'decisions_comptes', 'source_id', NEW.id, 'details_redactes', 1),
    'Motif conservé dans la source spécialisée.', 'SUCCES', NEW.cree_le
  );
END;

CREATE TRIGGER adapter_historique_operations_vers_evenements
AFTER INSERT ON historique_operations_centrales
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role,
    action, cible_type, cible_id, avant, apres, motif, resultat, cree_le
  ) VALUES (
    'audit:historique_operations_centrales:' || NEW.id,
    'historique_operations_centrales', NEW.id, NEW.request_id,
    NEW.auteur_id, (SELECT role FROM utilisateurs WHERE id = NEW.auteur_id),
    'OPERATION_CENTRALE_STATUT', 'OPERATION_CENTRALE', NEW.operation_id,
    CASE WHEN NEW.statut_precedent IS NULL THEN NULL
      ELSE json_object('statut', NEW.statut_precedent) END,
    json_object('statut', NEW.nouveau_statut),
    CASE WHEN NEW.motif_ou_commentaire IS NOT NULL
      THEN 'Motif conservé dans la source spécialisée.' ELSE NULL END,
    'SUCCES', NEW.cree_le
  );
END;

CREATE TRIGGER adapter_evenements_connexion_vers_evenements
AFTER INSERT ON evenements_connexion
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_id, acteur_role, portee_gid,
    action, cible_type, cible_id, avant, apres, adresse_ip, resultat, cree_le
  ) VALUES (
    'audit:evenements_connexion:' || NEW.id, 'evenements_connexion', NEW.id, NEW.request_id,
    CASE WHEN NEW.succes = 1 THEN NEW.utilisateur_id ELSE NULL END,
    CASE WHEN NEW.succes = 1 THEN (SELECT role FROM utilisateurs WHERE id = NEW.utilisateur_id) ELSE NULL END,
    CASE WHEN NEW.succes = 1 THEN (SELECT province_id FROM utilisateurs WHERE id = NEW.utilisateur_id) ELSE NULL END,
    CASE WHEN NEW.succes = 1 THEN 'CONNEXION_REUSSIE' ELSE 'TENTATIVE_CONNEXION_REFUSEE' END,
    'AUTHENTIFICATION', NEW.id, NULL,
    json_object('source_table', 'evenements_connexion', 'source_id', NEW.id, 'details_redactes', 1),
    NEW.adresse_ip, CASE WHEN NEW.succes = 1 THEN 'SUCCES' ELSE 'ECHEC' END, NEW.cree_le
  );
END;

CREATE TRIGGER adapter_preuves_recuperation_vers_evenements
AFTER INSERT ON preuves_operateur_recuperation
BEGIN
  INSERT OR IGNORE INTO evenements_audit (
    id, source_table, source_id, request_id, acteur_identite, acteur_role,
    action, cible_type, cible_id, avant, apres, motif, adresse_ip, resultat, cree_le
  ) VALUES (
    'audit:preuves_operateur_recuperation:' || NEW.id,
    'preuves_operateur_recuperation', NEW.id, NEW.request_id, NEW.acteur_identite,
    'OPERATEUR_EXTERNE', NEW.operation, 'UTILISATEUR', NEW.utilisateur_id, NULL,
    json_object('source_table', 'preuves_operateur_recuperation', 'source_id', NEW.id, 'details_redactes', 1),
    NEW.motif, NEW.adresse_ip, 'SUCCES', NEW.cree_le
  );
END;
