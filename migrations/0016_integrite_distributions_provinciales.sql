PRAGMA foreign_keys = ON;

CREATE INDEX idx_distributions_province_statut_date
  ON distributions_provinciales(province_id, statut, date_prevue DESC, id);
CREATE INDEX idx_zones_distribution_parent
  ON zones_distribution(distribution_id, province_id, id);
CREATE INDEX idx_articles_distribution_parent
  ON articles_distribution(distribution_id, article_id);
CREATE INDEX idx_menages_distribution_province_statut
  ON menages_distribution(province_id, distribution_id, statut_service, id);
CREATE INDEX idx_allocations_distribution_article
  ON allocations_distribution(distribution_id, article_id, menage_distribution_id);
CREATE INDEX idx_reservations_distribution_lot
  ON reservations_stock(distribution_id, province_id, article_id, lot_stock_id, statut);
CREATE UNIQUE INDEX idx_reservation_distribution_lot_active
  ON reservations_stock(distribution_id, article_id, lot_stock_id)
  WHERE statut = 'ACTIVE';
CREATE INDEX idx_remises_distribution_date
  ON remises_distribution(province_id, distribution_id, date_remise DESC, id);
CREATE INDEX idx_lignes_remise_reservation
  ON lignes_remise(reservation_id, remise_id, article_id);
CREATE INDEX idx_demandes_correction_distribution_statut
  ON demandes_correction(distribution_id, statut, cree_le DESC);

CREATE TRIGGER verifier_distribution_avant_insertion
BEFORE INSERT ON distributions_provinciales
WHEN NOT EXISTS (
  SELECT 1
  FROM provinces p
  INNER JOIN departements d ON d.province_id = p.id AND d.actif = 1
  INNER JOIN entrepots e ON e.id = NEW.entrepot_id AND e.niveau = 'PROVINCIAL'
    AND e.province_id = p.id AND e.actif = 1
  WHERE p.id = NEW.province_id AND p.actif = 1 AND d.id = NEW.departement_id
)
OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sous_prefectures sp
  INNER JOIN departements d ON d.id = sp.departement_id
  WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id
    AND d.province_id = NEW.province_id AND sp.actif = 1
))
OR (NEW.commune_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM communes c
  INNER JOIN rattachements_territoriaux rt ON rt.commune_id = c.id
  WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id AND c.actif = 1
    AND c.statut_validation = 'VALIDE'
    AND rt.departement_id = NEW.departement_id
    AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
    AND rt.date_debut_validite <= date('now')
    AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
))
BEGIN
  SELECT RAISE(ABORT, 'DISTRIBUTION_RATTACHEMENT_INVALIDE');
END;

CREATE TRIGGER verifier_zone_distribution_avant_insertion
BEFORE INSERT ON zones_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
)
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM localites l
  INNER JOIN distributions_provinciales d ON d.id = NEW.distribution_id
  WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
    AND l.departement_id = d.departement_id AND l.statut_validation = 'VALIDE'
))
OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM arrondissements a
  WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id
    AND a.statut_validation = 'VALIDE'
))
OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM quartiers q
  WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id
    AND q.arrondissement_id IS NEW.arrondissement_id AND q.statut_validation = 'VALIDE'
))
OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM carres c
  INNER JOIN quartiers q ON q.id = c.quartier_id
  WHERE c.id = NEW.carre_id AND c.quartier_id = NEW.quartier_id
    AND q.localite_id = NEW.localite_id AND q.statut_validation = 'VALIDE'
))
OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sites_humanitaires s
  INNER JOIN distributions_provinciales d ON d.id = NEW.distribution_id
  WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
    AND s.departement_id = d.departement_id AND s.statut_validation = 'VALIDE'
))
BEGIN
  SELECT RAISE(ABORT, 'ZONE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_menage_distribution_avant_insertion
BEFORE INSERT ON menages_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
    AND m.province_id = NEW.province_id AND m.departement_id = d.departement_id
    AND m.statut = 'ACTIF'
)
OR (NEW.zone_distribution_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM zones_distribution z
  INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE z.id = NEW.zone_distribution_id AND z.distribution_id = NEW.distribution_id
    AND z.province_id = NEW.province_id
    AND ((z.site_humanitaire_id IS NOT NULL AND m.site_humanitaire_id = z.site_humanitaire_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NOT NULL AND m.carre_id = z.carre_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NOT NULL AND m.quartier_id = z.quartier_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NULL AND z.arrondissement_id IS NOT NULL AND m.arrondissement_id = z.arrondissement_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NULL AND z.arrondissement_id IS NULL AND z.localite_id IS NOT NULL AND m.localite_id = z.localite_id))
))
BEGIN
  SELECT RAISE(ABORT, 'MENAGE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_article_distribution_avant_insertion
BEFORE INSERT ON articles_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN articles a ON a.id = NEW.article_id AND a.actif = 1
  WHERE d.id = NEW.distribution_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
)
BEGIN
  SELECT RAISE(ABORT, 'ARTICLE_DISTRIBUTION_INVALIDE');
END;

CREATE TRIGGER verifier_allocation_distribution_avant_insertion
BEFORE INSERT ON allocations_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM menages_distribution md
  INNER JOIN articles_distribution ad ON ad.distribution_id = md.distribution_id
    AND ad.article_id = NEW.article_id
  WHERE md.id = NEW.menage_distribution_id
    AND md.distribution_id = NEW.distribution_id
    AND ad.distribution_id = NEW.distribution_id
    AND md.statut_service = 'EN_ATTENTE'
)
BEGIN
  SELECT RAISE(ABORT, 'ALLOCATION_DISTRIBUTION_INCOHERENTE');
END;

CREATE TRIGGER verifier_reservation_distribution_avant_insertion
BEFORE INSERT ON reservations_stock
WHEN NOT (
  EXISTS (
    SELECT 1 FROM distributions_provinciales d
    INNER JOIN entrepots e ON e.id = NEW.entrepot_id AND e.id = d.entrepot_id
      AND e.province_id = d.province_id AND e.niveau = 'PROVINCIAL' AND e.actif = 1
    INNER JOIN lots_stock l ON l.id = NEW.lot_stock_id AND l.entrepot_id = e.id
      AND l.province_id = d.province_id AND l.article_id = NEW.article_id
    INNER JOIN articles_distribution ad ON ad.distribution_id = d.id AND ad.article_id = NEW.article_id
    WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
      AND d.statut = 'EN_PREPARATION'
      AND l.etat_qualite = 'BON'
      AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
  )
  OR EXISTS (
    SELECT 1 FROM entrepots e
    INNER JOIN lots_stock l ON l.id = NEW.lot_stock_id AND l.entrepot_id = e.id
      AND l.province_id = NEW.province_id AND l.article_id = NEW.article_id
    INNER JOIN utilisateurs u ON u.id = NEW.cree_par AND u.statut = 'ACTIF'
    WHERE e.id = NEW.entrepot_id AND e.niveau = 'PROVINCIAL'
      AND e.province_id = NEW.province_id AND e.actif = 1
      AND l.etat_qualite = 'BON'
      AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
      AND NOT EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id)
      AND (u.role IN ('ADMIN_CENTRAL', 'PROPRIETAIRE')
        OR (u.role = 'DELEGUE_PROVINCIAL' AND u.province_id = NEW.province_id))
  )
)
BEGIN
  SELECT RAISE(ABORT, 'RESERVATION_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_reservation_distribution_avant_modification
BEFORE UPDATE ON reservations_stock
WHEN NEW.id <> OLD.id OR NEW.distribution_id <> OLD.distribution_id
  OR NEW.entrepot_id <> OLD.entrepot_id OR NEW.province_id <> OLD.province_id
  OR NEW.article_id <> OLD.article_id OR NEW.lot_stock_id <> OLD.lot_stock_id
  OR NEW.quantite_reservee <> OLD.quantite_reservee OR NEW.cree_par <> OLD.cree_par
  OR NEW.quantite_consommee < OLD.quantite_consommee
  OR NEW.quantite_liberee < OLD.quantite_liberee
  OR NEW.quantite_consommee + NEW.quantite_liberee > NEW.quantite_reservee + 0.000001
  OR NEW.statut NOT IN ('ACTIVE', 'CONSOMMEE', 'LIBEREE_CLOTURE', 'ANNULEE')
BEGIN
  SELECT RAISE(ABORT, 'RESERVATION_DISTRIBUTION_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_reservation_distribution
BEFORE DELETE ON reservations_stock
BEGIN
  SELECT RAISE(ABORT, 'RESERVATION_DISTRIBUTION_IMMUABLE');
END;

CREATE TRIGGER verifier_remise_distribution_avant_insertion
BEFORE INSERT ON remises_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN menages_distribution md ON md.id = NEW.menage_distribution_id
    AND md.distribution_id = d.id AND md.province_id = d.province_id
  INNER JOIN utilisateurs u ON u.id = NEW.agent_distributeur_id
    AND u.role = 'DELEGUE_PROVINCIAL' AND u.province_id = d.province_id AND u.statut = 'ACTIF'
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'EN_EXECUTION' AND md.statut_service IN ('EN_ATTENTE', 'PARTIELLEMENT_SERVI')
    AND md.menage_id = NEW.menage_id
)
BEGIN
  SELECT RAISE(ABORT, 'REMISE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_ligne_remise_distribution_avant_insertion
BEFORE INSERT ON lignes_remise
WHEN NOT EXISTS (
  SELECT 1 FROM remises_distribution r
  INNER JOIN allocations_distribution a ON a.id = NEW.allocation_id
    AND a.menage_distribution_id = r.menage_distribution_id
    AND a.distribution_id = r.distribution_id AND a.article_id = NEW.article_id
  INNER JOIN reservations_stock rs ON rs.id = NEW.reservation_id
    AND rs.distribution_id = r.distribution_id AND rs.province_id = r.province_id
    AND rs.article_id = NEW.article_id AND rs.lot_stock_id = NEW.lot_stock_id
  WHERE r.id = NEW.remise_id AND a.distribution_id = r.distribution_id
    AND rs.statut = 'ACTIVE'
)
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_REMISE_DISTRIBUTION_INCOHERENTE');
END;

CREATE TRIGGER verifier_validation_distribution_avant_insertion
BEFORE INSERT ON validations_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'EN_PREPARATION' AND d.version_plan = NEW.version_validee
    AND json_valid(NEW.snapshot_plan_json)
)
BEGIN
  SELECT RAISE(ABORT, 'VALIDATION_DISTRIBUTION_INCOHERENTE');
END;

CREATE TRIGGER interdire_modification_validation_distribution
BEFORE UPDATE ON validations_distribution
BEGIN
  SELECT RAISE(ABORT, 'VALIDATION_DISTRIBUTION_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_validation_distribution
BEFORE DELETE ON validations_distribution
BEGIN
  SELECT RAISE(ABORT, 'VALIDATION_DISTRIBUTION_IMMUABLE');
END;

CREATE TRIGGER verifier_statut_distribution
BEFORE UPDATE OF statut ON distributions_provinciales
WHEN NEW.statut <> OLD.statut AND NOT (
  (OLD.statut = 'BROUILLON' AND NEW.statut = 'EN_PREPARATION')
  OR (OLD.statut = 'EN_PREPARATION' AND NEW.statut = 'VALIDEE_PROVINCE')
  OR (OLD.statut = 'VALIDEE_PROVINCE' AND NEW.statut = 'EN_EXECUTION')
  OR (OLD.statut = 'EN_EXECUTION' AND NEW.statut = 'TERMINEE_PROVINCE')
  OR (OLD.statut = 'TERMINEE_PROVINCE' AND NEW.statut IN ('RETOURNEE_POUR_CORRECTION', 'CLOTUREE_CENTRAL'))
  OR (OLD.statut = 'RETOURNEE_POUR_CORRECTION' AND NEW.statut = 'TERMINEE_PROVINCE'
    AND EXISTS (SELECT 1 FROM demandes_correction dc WHERE dc.distribution_id = OLD.id AND dc.statut = 'CORRECTION_SOUMISE'))
)
BEGIN
  SELECT RAISE(ABORT, 'TRANSITION_STATUT_DISTRIBUTION_INVALIDE');
END;

CREATE TRIGGER verifier_modification_distribution_apres_validation
BEFORE UPDATE ON distributions_provinciales
WHEN OLD.statut IN ('VALIDEE_PROVINCE', 'EN_EXECUTION', 'TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL')
  AND (NEW.reference_distribution <> OLD.reference_distribution
    OR NEW.intitule_distribution <> OLD.intitule_distribution
    OR NEW.province_id <> OLD.province_id
    OR NEW.departement_id <> OLD.departement_id
    OR NEW.sous_prefecture_id IS NOT OLD.sous_prefecture_id
    OR NEW.commune_id IS NOT OLD.commune_id
    OR NEW.nature_aide <> OLD.nature_aide
    OR NEW.bailleur_fonds_id IS NOT OLD.bailleur_fonds_id
    OR NEW.partenaire_execution_id IS NOT OLD.partenaire_execution_id
    OR NEW.objectif <> OLD.objectif
    OR NEW.nombre_menages_cibles <> OLD.nombre_menages_cibles
    OR NEW.nombre_personnes_cibles <> OLD.nombre_personnes_cibles
    OR NEW.date_prevue <> OLD.date_prevue
    OR NEW.entrepot_id <> OLD.entrepot_id
    OR NEW.liste_beneficiaires_id IS NOT OLD.liste_beneficiaires_id
    OR NEW.version_plan <> OLD.version_plan)
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_zones_distribution_validee
BEFORE INSERT ON zones_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_modification_zone_distribution
BEFORE UPDATE ON zones_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_suppression_zone_distribution
BEFORE DELETE ON zones_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_articles_distribution_valides
BEFORE INSERT ON articles_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_modification_article_distribution
BEFORE UPDATE ON articles_distribution
WHEN (OLD.distribution_id <> NEW.distribution_id OR OLD.article_id <> NEW.article_id
    OR OLD.source_approvisionnement <> NEW.source_approvisionnement
    OR OLD.lot_stock_id IS NOT NEW.lot_stock_id
    OR OLD.ration_par_menage <> NEW.ration_par_menage
    OR OLD.quantite_totale_prevue <> NEW.quantite_totale_prevue)
  AND EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_suppression_article_distribution
BEFORE DELETE ON articles_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_menages_distribution_valides
BEFORE INSERT ON menages_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_modification_menage_distribution
BEFORE UPDATE ON menages_distribution
WHEN (OLD.distribution_id <> NEW.distribution_id OR OLD.province_id <> NEW.province_id
    OR OLD.menage_id <> NEW.menage_id OR OLD.zone_distribution_id IS NOT NEW.zone_distribution_id)
  AND EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_suppression_menage_distribution
BEFORE DELETE ON menages_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_allocations_distribution_valides
BEFORE INSERT ON allocations_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER figer_suppression_allocation_distribution
BEFORE DELETE ON allocations_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;
CREATE TRIGGER verifier_modification_allocation_distribution
BEFORE UPDATE ON allocations_distribution
WHEN NEW.id <> OLD.id OR NEW.menage_distribution_id <> OLD.menage_distribution_id
  OR NEW.distribution_id <> OLD.distribution_id OR NEW.article_id <> OLD.article_id
  OR NEW.quantite_prevue <> OLD.quantite_prevue
  OR NEW.quantite_servie < OLD.quantite_servie
  OR NEW.quantite_servie > NEW.quantite_prevue + 0.000001
BEGIN
  SELECT RAISE(ABORT, 'ALLOCATION_DISTRIBUTION_IMMUABLE');
END;

CREATE TRIGGER verifier_statut_menage_distribution
BEFORE UPDATE OF statut_service ON menages_distribution
WHEN NEW.statut_service <> OLD.statut_service AND NOT (
  OLD.statut_service = 'EN_ATTENTE' AND NEW.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI', 'ABSENT', 'NON_SERVI')
  OR OLD.statut_service = 'PARTIELLEMENT_SERVI' AND NEW.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI')
)
BEGIN
  SELECT RAISE(ABORT, 'TRANSITION_STATUT_MENAGE_INVALIDE');
END;

CREATE TRIGGER interdire_modification_remise_distribution
BEFORE UPDATE ON remises_distribution
BEGIN
  SELECT RAISE(ABORT, 'REMISE_DISTRIBUTION_IMMUABLE');
END;
CREATE TRIGGER interdire_suppression_remise_distribution
BEFORE DELETE ON remises_distribution
BEGIN
  SELECT RAISE(ABORT, 'REMISE_DISTRIBUTION_IMMUABLE');
END;
CREATE TRIGGER interdire_modification_ligne_remise_distribution
BEFORE UPDATE ON lignes_remise
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_REMISE_DISTRIBUTION_IMMUABLE');
END;
CREATE TRIGGER interdire_suppression_ligne_remise_distribution
BEFORE DELETE ON lignes_remise
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_REMISE_DISTRIBUTION_IMMUABLE');
END;
CREATE TRIGGER interdire_modification_historique_statuts
BEFORE UPDATE ON historique_statuts
BEGIN
  SELECT RAISE(ABORT, 'HISTORIQUE_STATUT_IMMUABLE');
END;
CREATE TRIGGER interdire_suppression_historique_statuts
BEFORE DELETE ON historique_statuts
BEGIN
  SELECT RAISE(ABORT, 'HISTORIQUE_STATUT_IMMUABLE');
END;
CREATE TRIGGER interdire_modification_cloture_distribution
BEFORE UPDATE ON clotures_distribution
BEGIN
  SELECT RAISE(ABORT, 'CLOTURE_DISTRIBUTION_IMMUABLE');
END;
CREATE TRIGGER interdire_suppression_cloture_distribution
BEFORE DELETE ON clotures_distribution
BEGIN
  SELECT RAISE(ABORT, 'CLOTURE_DISTRIBUTION_IMMUABLE');
END;

CREATE TRIGGER verifier_cloture_distribution_avant_insertion
BEFORE INSERT ON clotures_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN utilisateurs u ON u.id = NEW.cloture_par AND u.role = 'ADMIN_CENTRAL' AND u.statut = 'ACTIF'
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'CLOTUREE_CENTRAL'
    AND NOT EXISTS (
      SELECT 1 FROM reservations_stock r
      WHERE r.distribution_id = d.id AND r.statut = 'ACTIVE'
        AND r.quantite_reservee - r.quantite_consommee - r.quantite_liberee > 0.000001
    )
    AND NOT EXISTS (
      SELECT 1 FROM demandes_correction dc
      WHERE dc.distribution_id = d.id AND dc.statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'CLOTURE_DISTRIBUTION_INCOMPLETE');
END;

DROP TRIGGER verifier_mouvement_stock_avant_insertion;
CREATE TRIGGER verifier_mouvement_stock_avant_insertion
BEFORE INSERT ON mouvements_stock
WHEN NEW.lot_stock_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM lots_stock l
    WHERE l.id = NEW.lot_stock_id
      AND l.entrepot_id = NEW.entrepot_id
      AND l.province_id IS NEW.province_id
      AND l.article_id = NEW.article_id
  )
  OR (NEW.type_mouvement IN ('RESERVATION', 'LIBERATION_RESERVATION') AND NEW.sens <> 'NEUTRE_RESERVATION')
  OR (NEW.type_mouvement IN ('RECEPTION', 'ENTREE', 'RETOUR', 'TRANSFERT_ENTRANT', 'AJUSTEMENT_POSITIF') AND NEW.sens <> 'PLUS')
  OR (NEW.type_mouvement IN ('SORTIE_EXPEDITION', 'SORTIE_DISTRIBUTION', 'TRANSFERT_SORTANT', 'AJUSTEMENT_NEGATIF', 'PERTE') AND NEW.sens <> 'MOINS')
  OR (NEW.sens = 'PLUS' AND NOT EXISTS (
    SELECT 1 FROM soldes_stock s
    WHERE s.entrepot_id = NEW.entrepot_id AND s.article_id = NEW.article_id
      AND s.province_id IS NEW.province_id
      AND abs(s.quantite_physique - NEW.solde_physique_apres) <= 0.000000001
      AND abs(NEW.solde_physique_apres - NEW.solde_physique_avant - NEW.quantite) <= 0.000000001
  ))
  OR (NEW.sens = 'MOINS' AND NOT EXISTS (
    SELECT 1 FROM soldes_stock s
    WHERE s.entrepot_id = NEW.entrepot_id AND s.article_id = NEW.article_id
      AND s.province_id IS NEW.province_id
      AND abs(s.quantite_physique - NEW.solde_physique_apres) <= 0.000000001
      AND abs(NEW.solde_physique_avant - NEW.solde_physique_apres - NEW.quantite) <= 0.000000001
  ))
  OR (NEW.sens = 'NEUTRE_RESERVATION' AND NOT EXISTS (
    SELECT 1 FROM soldes_stock s
    WHERE s.entrepot_id = NEW.entrepot_id AND s.article_id = NEW.article_id
      AND s.province_id IS NEW.province_id
      AND abs(s.quantite_physique - NEW.solde_physique_avant) <= 0.000000001
      AND abs(s.quantite_physique - NEW.solde_physique_apres) <= 0.000000001
      AND s.quantite_physique >= s.quantite_reservee
  ))
  OR (NEW.type_mouvement IN ('RESERVATION', 'SORTIE_DISTRIBUTION', 'LIBERATION_RESERVATION') AND NOT EXISTS (
    SELECT 1 FROM lots_stock l
    WHERE l.id = NEW.lot_stock_id
      AND abs(l.quantite_reservee - COALESCE((
        SELECT SUM(r.quantite_reservee - r.quantite_consommee - r.quantite_liberee)
        FROM reservations_stock r
        WHERE r.lot_stock_id = l.id AND r.statut = 'ACTIVE'
      ), 0)) <= 0.000001
  ))
  OR (NEW.type_mouvement = 'RESERVATION' AND NOT (
    (NEW.document_source_type = 'DISTRIBUTION_PROVINCIALE' AND EXISTS (
      SELECT 1 FROM reservations_stock r
      INNER JOIN distributions_provinciales d ON d.id = r.distribution_id
      WHERE r.distribution_id = NEW.document_source_id
        AND r.lot_stock_id = NEW.lot_stock_id AND r.article_id = NEW.article_id
        AND d.province_id = NEW.province_id AND d.entrepot_id = NEW.entrepot_id
        AND r.statut = 'ACTIVE'
        AND abs(r.quantite_reservee - NEW.quantite) <= 0.000001
    ))
    OR (NEW.document_source_type = 'RESERVATION_STOCK' AND EXISTS (
      SELECT 1 FROM reservations_stock r
      WHERE r.id = NEW.document_source_id
        AND r.lot_stock_id = NEW.lot_stock_id AND r.article_id = NEW.article_id
        AND r.province_id = NEW.province_id AND r.entrepot_id = NEW.entrepot_id
        AND r.cree_par = NEW.auteur_id AND r.statut = 'ACTIVE'
        AND abs(r.quantite_reservee - NEW.quantite) <= 0.000001
        AND NOT EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = r.distribution_id)
    ))
  ))
  OR (NEW.type_mouvement = 'SORTIE_DISTRIBUTION' AND NOT EXISTS (
    SELECT 1 FROM lignes_remise lr
    INNER JOIN remises_distribution rd ON rd.id = lr.remise_id
    WHERE rd.id = NEW.document_source_id AND lr.lot_stock_id = NEW.lot_stock_id
      AND lr.article_id = NEW.article_id AND abs(lr.quantite_remise - NEW.quantite) <= 0.000001
      AND NEW.document_source_type = 'REMISE_DISTRIBUTION'
  ))
  OR (NEW.type_mouvement = 'LIBERATION_RESERVATION' AND NOT EXISTS (
    SELECT 1 FROM reservations_stock r
    INNER JOIN distributions_provinciales d ON d.id = r.distribution_id
    WHERE r.distribution_id = NEW.document_source_id AND r.lot_stock_id = NEW.lot_stock_id
      AND r.article_id = NEW.article_id AND d.province_id = NEW.province_id
      AND NEW.document_source_type = 'CLOTURE_DISTRIBUTION'
      AND abs(r.quantite_liberee - NEW.quantite) <= 0.000001
  ))
BEGIN
  SELECT RAISE(ABORT, 'MOUVEMENT_STOCK_INCOHERENT');
END;

CREATE TRIGGER verifier_audit_distribution
BEFORE INSERT ON journaux_audit
WHEN NEW.action IN (
  'PREPARATION_DISTRIBUTION', 'VALIDATION_DISTRIBUTION', 'REMISE_DISTRIBUTION', 'DECLARATION_FIN_DISTRIBUTION',
  'RETOUR_CORRECTION_DISTRIBUTION', 'SOUMISSION_CORRECTION_DISTRIBUTION',
  'VALIDATION_CORRECTION_DISTRIBUTION', 'CLOTURE_DISTRIBUTION'
) AND NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  WHERE d.id = NEW.entite_id
    AND ((NEW.action = 'PREPARATION_DISTRIBUTION' AND d.statut = 'EN_PREPARATION')
      OR (NEW.action = 'VALIDATION_DISTRIBUTION' AND d.statut = 'VALIDEE_PROVINCE'
      AND EXISTS (SELECT 1 FROM validations_distribution v WHERE v.distribution_id = d.id)
      AND (SELECT COUNT(*) FROM reservations_stock r WHERE r.distribution_id = d.id) =
          (SELECT COUNT(*) FROM mouvements_stock m WHERE m.type_mouvement = 'RESERVATION'
            AND m.document_source_type = 'DISTRIBUTION_PROVINCIALE' AND m.document_source_id = d.id))
      OR (NEW.action = 'REMISE_DISTRIBUTION' AND json_valid(NEW.donnees_apres)
        AND EXISTS (SELECT 1 FROM remises_distribution rd
          WHERE rd.id = json_extract(NEW.donnees_apres, '$.remise_id') AND rd.distribution_id = d.id
            AND (SELECT COUNT(*) FROM lignes_remise lr WHERE lr.remise_id = rd.id) =
                (SELECT COUNT(*) FROM mouvements_stock m WHERE m.type_mouvement = 'SORTIE_DISTRIBUTION'
                  AND m.document_source_type = 'REMISE_DISTRIBUTION' AND m.document_source_id = rd.id)))
      OR (NEW.action = 'DECLARATION_FIN_DISTRIBUTION' AND d.statut = 'TERMINEE_PROVINCE'
        AND EXISTS (SELECT 1 FROM pieces_jointes pj WHERE pj.entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
          AND pj.entite_liee_id = d.id AND pj.categorie_document = 'PV_DISTRIBUTION'))
      OR (NEW.action = 'RETOUR_CORRECTION_DISTRIBUTION' AND d.statut = 'RETOURNEE_POUR_CORRECTION'
        AND EXISTS (SELECT 1 FROM demandes_correction dc WHERE dc.distribution_id = d.id))
      OR (NEW.action = 'SOUMISSION_CORRECTION_DISTRIBUTION' AND d.statut = 'TERMINEE_PROVINCE'
        AND EXISTS (SELECT 1 FROM demandes_correction dc WHERE dc.distribution_id = d.id AND dc.statut = 'CORRECTION_SOUMISE'))
      OR (NEW.action = 'VALIDATION_CORRECTION_DISTRIBUTION' AND d.statut = 'TERMINEE_PROVINCE'
        AND EXISTS (SELECT 1 FROM demandes_correction dc WHERE dc.distribution_id = d.id AND dc.statut = 'VALIDEE_CENTRAL'))
      OR (NEW.action = 'CLOTURE_DISTRIBUTION' AND d.statut = 'CLOTUREE_CENTRAL'
        AND EXISTS (SELECT 1 FROM clotures_distribution c WHERE c.distribution_id = d.id)))
)
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_DISTRIBUTION_SANS_ECRITURE');
END;
