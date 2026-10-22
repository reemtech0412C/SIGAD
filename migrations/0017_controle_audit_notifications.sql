PRAGMA foreign_keys = ON;

CREATE INDEX idx_observations_province_statut_date
  ON observations_controle(province_id, statut, cree_le DESC, id);
CREATE INDEX idx_observations_operation_statut
  ON observations_controle(operation_type, operation_id, statut);
CREATE INDEX idx_corrections_province_statut_date
  ON demandes_correction(province_id, statut, cree_le DESC, id);
CREATE INDEX idx_notifications_utilisateur_non_lues
  ON notifications(destinataire_utilisateur_id, lue, cree_le DESC, id);
CREATE INDEX idx_notifications_province_role_non_lues
  ON notifications(destinataire_province_id, destinataire_role, lue, cree_le DESC, id);
CREATE INDEX idx_notifications_role_non_lues
  ON notifications(destinataire_role, lue, cree_le DESC, id);
CREATE INDEX idx_audit_utilisateur_date
  ON journaux_audit(utilisateur_id, cree_le DESC, id);
CREATE INDEX idx_audit_action_date
  ON journaux_audit(action, cree_le DESC, id);
CREATE INDEX idx_audit_entite_date
  ON journaux_audit(entite_type, entite_id, cree_le DESC, id);
CREATE INDEX idx_audit_province_action_date
  ON journaux_audit(province_id, action, cree_le DESC, id);

CREATE TRIGGER verifier_observation_controle_avant_insertion
BEFORE INSERT ON observations_controle
WHEN NOT EXISTS (
  SELECT 1 FROM utilisateurs u
  WHERE u.id = NEW.auteur_central_id AND u.role = 'ADMIN_CENTRAL' AND u.statut = 'ACTIF'
)
OR (NEW.operation_type = 'DISTRIBUTION_PROVINCIALE' AND NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  WHERE d.id = NEW.operation_id AND d.province_id = NEW.province_id
))
OR (NEW.operation_type = 'APPROVISIONNEMENT_CENTRAL' AND NOT EXISTS (
  SELECT 1 FROM destinations_approvisionnement d
  WHERE d.approvisionnement_id = NEW.operation_id AND d.province_id = NEW.province_id
))
OR (NEW.operation_type = 'STOCK_PROVINCIAL' AND NOT EXISTS (
  SELECT 1 FROM mouvements_stock m
  WHERE m.id = NEW.operation_id AND m.province_id = NEW.province_id
))
BEGIN
  SELECT RAISE(ABORT, 'OBSERVATION_CONTROLE_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_observation_controle_avant_modification
BEFORE UPDATE ON observations_controle
WHEN NEW.id IS NOT OLD.id
  OR NEW.operation_type IS NOT OLD.operation_type
  OR NEW.operation_id IS NOT OLD.operation_id
  OR NEW.province_id IS NOT OLD.province_id
  OR NEW.niveau_gravite IS NOT OLD.niveau_gravite
  OR NEW.observation IS NOT OLD.observation
  OR NEW.auteur_central_id IS NOT OLD.auteur_central_id
  OR NEW.cree_le IS NOT OLD.cree_le
  OR NOT (
    (NEW.reponse_delegue IS OLD.reponse_delegue AND NEW.date_reponse IS OLD.date_reponse
      AND NEW.statut IS OLD.statut)
    OR (OLD.statut = 'OUVERTE' AND OLD.reponse_delegue IS NULL
      AND NEW.reponse_delegue IS NOT NULL AND NEW.date_reponse IS NOT NULL
      AND NEW.statut = 'OUVERTE')
    OR (OLD.statut = 'OUVERTE' AND OLD.reponse_delegue IS NOT NULL
      AND NEW.reponse_delegue IS OLD.reponse_delegue AND NEW.date_reponse IS OLD.date_reponse
      AND NEW.statut IN ('TRAITEE', 'CLASSEE'))
  )
BEGIN
  SELECT RAISE(ABORT, 'OBSERVATION_CONTROLE_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_observation_controle
BEFORE DELETE ON observations_controle
BEGIN
  SELECT RAISE(ABORT, 'OBSERVATION_CONTROLE_IMMUABLE');
END;

CREATE TRIGGER verifier_demande_correction_avant_insertion
BEFORE INSERT ON demandes_correction
WHEN NEW.statut <> 'EN_ATTENTE_DELEGUE'
  OR json_valid(NEW.elements_a_corriger) = 0
  OR json_type(NEW.elements_a_corriger, '$.champs_modifiables') <> 'array'
  OR json_type(NEW.elements_a_corriger, '$.valeurs_originales') <> 'object'
  OR NOT EXISTS (
    SELECT 1 FROM distributions_provinciales d
    INNER JOIN utilisateurs u ON u.id = NEW.demande_par
      AND u.role = 'ADMIN_CENTRAL' AND u.statut = 'ACTIF'
    WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
      AND d.statut = 'TERMINEE_PROVINCE'
  )
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_CORRECTION_INCOHERENTE');
END;

CREATE TRIGGER verifier_demande_correction_avant_modification
BEFORE UPDATE ON demandes_correction
WHEN NEW.id IS NOT OLD.id
  OR NEW.distribution_id IS NOT OLD.distribution_id
  OR NEW.province_id IS NOT OLD.province_id
  OR NEW.motif_retour IS NOT OLD.motif_retour
  OR NEW.demande_par IS NOT OLD.demande_par
  OR NEW.cree_le IS NOT OLD.cree_le
  OR NOT (
    (OLD.statut = 'EN_ATTENTE_DELEGUE' AND NEW.statut = 'CORRECTION_SOUMISE'
      AND OLD.traite_par_delegue IS NULL AND NEW.traite_par_delegue IS NOT NULL
      AND OLD.reponse_delegue IS NULL AND NEW.reponse_delegue IS NOT NULL
      AND NEW.resolu_le IS OLD.resolu_le
      AND json_valid(NEW.elements_a_corriger) = 1
      AND json_extract(NEW.elements_a_corriger, '$.valeurs_originales') =
          json_extract(OLD.elements_a_corriger, '$.valeurs_originales'))
    OR (OLD.statut = 'CORRECTION_SOUMISE' AND NEW.statut = 'VALIDEE_CENTRAL'
      AND NEW.traite_par_delegue IS OLD.traite_par_delegue
      AND NEW.reponse_delegue IS OLD.reponse_delegue
      AND NEW.elements_a_corriger IS OLD.elements_a_corriger
      AND NEW.resolu_le IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_CORRECTION_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_demande_correction
BEFORE DELETE ON demandes_correction
BEGIN
  SELECT RAISE(ABORT, 'DEMANDE_CORRECTION_IMMUABLE');
END;

CREATE TRIGGER verifier_historique_correction_distribution
BEFORE INSERT ON historique_statuts
WHEN NEW.operation_type = 'DISTRIBUTION_PROVINCIALE'
  AND NEW.statut_precedent = 'RETOURNEE_POUR_CORRECTION'
  AND NEW.nouveau_statut = 'TERMINEE_PROVINCE'
  AND (changes() <> 1 OR NOT EXISTS (
    SELECT 1 FROM demandes_correction dc
    WHERE dc.distribution_id = NEW.operation_id AND dc.province_id = (
      SELECT d.province_id FROM distributions_provinciales d WHERE d.id = NEW.operation_id
    ) AND dc.statut = 'CORRECTION_SOUMISE' AND dc.traite_par_delegue = NEW.auteur_id
  ))
BEGIN
  SELECT RAISE(ABORT, 'CORRECTION_DISTRIBUTION_SANS_TRANSITION');
END;

CREATE TRIGGER verifier_notification_avant_insertion
BEFORE INSERT ON notifications
WHEN (NEW.destinataire_utilisateur_id IS NULL
      AND NEW.destinataire_province_id IS NULL AND NEW.destinataire_role IS NULL)
  OR (NEW.destinataire_role IS NOT NULL
      AND NEW.destinataire_role NOT IN ('PROPRIETAIRE', 'ADMIN_CENTRAL', 'DELEGUE_PROVINCIAL'))
  OR (NEW.destinataire_utilisateur_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM utilisateurs u WHERE u.id = NEW.destinataire_utilisateur_id
      AND u.statut = 'ACTIF'
  ))
  OR (NEW.destinataire_province_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM provinces p WHERE p.id = NEW.destinataire_province_id AND p.actif = 1
  ))
  OR (NEW.destinataire_utilisateur_id IS NOT NULL AND NEW.destinataire_province_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM utilisateurs u WHERE u.id = NEW.destinataire_utilisateur_id
        AND u.province_id = NEW.destinataire_province_id))
  OR (NEW.titre = 'Nouvelle observation de contrôle' AND changes() <> 1)
  OR (NEW.titre = 'Réponse provinciale à une observation' AND changes() <> 1)
  OR (NEW.titre = 'Observation de contrôle clôturée' AND changes() <> 1)
  OR NEW.lue NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'NOTIFICATION_DESTINATAIRE_INVALIDE');
END;

CREATE TRIGGER verifier_notification_avant_modification
BEFORE UPDATE ON notifications
WHEN NEW.id IS NOT OLD.id
  OR NEW.destinataire_utilisateur_id IS NOT OLD.destinataire_utilisateur_id
  OR NEW.destinataire_province_id IS NOT OLD.destinataire_province_id
  OR NEW.destinataire_role IS NOT OLD.destinataire_role
  OR NEW.titre IS NOT OLD.titre
  OR NEW.message IS NOT OLD.message
  OR NEW.type_alerte IS NOT OLD.type_alerte
  OR NEW.lien_cible IS NOT OLD.lien_cible
  OR NEW.cree_le IS NOT OLD.cree_le
  OR NOT (OLD.lue = 0 AND NEW.lue = 1)
BEGIN
  SELECT RAISE(ABORT, 'NOTIFICATION_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_notification
BEFORE DELETE ON notifications
BEGIN
  SELECT RAISE(ABORT, 'NOTIFICATION_IMMUABLE');
END;

CREATE TRIGGER interdire_modification_journal_audit
BEFORE UPDATE ON journaux_audit
BEGIN
  SELECT RAISE(ABORT, 'JOURNAL_AUDIT_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_journal_audit
BEFORE DELETE ON journaux_audit
BEGIN
  SELECT RAISE(ABORT, 'JOURNAL_AUDIT_IMMUABLE');
END;

DROP TRIGGER verifier_cloture_distribution_avant_insertion;
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
