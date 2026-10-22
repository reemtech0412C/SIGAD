PRAGMA foreign_keys = ON;

ALTER TABLE receptions_provinciales
  ADD COLUMN reception_stock_id TEXT REFERENCES receptions_stock(id);

ALTER TABLE lignes_reception_provinciale
  ADD COLUMN lot_endommage_id TEXT REFERENCES lots_stock(id);

CREATE INDEX idx_destinations_appro_province
  ON destinations_approvisionnement(province_id, approvisionnement_id, statut_destination);
CREATE INDEX idx_articles_appro_destination
  ON articles_approvisionnement(destination_id, article_id);
CREATE INDEX idx_expeditions_appro_date
  ON expeditions(approvisionnement_id, date_expedition DESC, id);
CREATE INDEX idx_expeditions_destination_statut
  ON expeditions(destination_id, statut_expedition, cree_le DESC);
CREATE INDEX idx_expeditions_province_date
  ON expeditions(province_destinataire_id, cree_le DESC, id);
CREATE INDEX idx_lignes_expedition_parent
  ON lignes_expedition(expedition_id, article_id);
CREATE INDEX idx_receptions_appro_date
  ON receptions_provinciales(approvisionnement_id, date_reception DESC, id);
CREATE INDEX idx_receptions_province_date
  ON receptions_provinciales(province_id, date_reception DESC, id);
CREATE UNIQUE INDEX idx_reception_ligne_expedition_unique
  ON lignes_reception_provinciale(ligne_expedition_id);
CREATE INDEX idx_lignes_reception_parent
  ON lignes_reception_provinciale(reception_provinciale_id, article_id);

CREATE TRIGGER verifier_mouvement_apres_mutation_effective
BEFORE INSERT ON mouvements_stock
WHEN changes() <> 1
BEGIN
  SELECT RAISE(ABORT, 'MOUVEMENT_SANS_MUTATION_EFFECTIVE');
END;

CREATE TRIGGER verifier_audit_action_approvisionnement
BEFORE INSERT ON journaux_audit
WHEN NEW.action IN (
  'CREATION_APPROVISIONNEMENT', 'VALIDATION_APPROVISIONNEMENT',
  'CREATION_EXPEDITION_APPROVISIONNEMENT', 'RECEPTION_PROVINCIALE_APPROVISIONNEMENT',
  'RAPPROCHEMENT_ECART_APPROVISIONNEMENT', 'CLOTURE_APPROVISIONNEMENT',
  'TELEVERSEMENT_PV_APPROVISIONNEMENT'
) AND changes() = 0
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_APPROVISIONNEMENT_SANS_ECRITURE');
END;

CREATE TRIGGER verifier_destination_approvisionnement_avant_insertion
BEFORE INSERT ON destinations_approvisionnement
WHEN NOT EXISTS (
  SELECT 1 FROM approvisionnements_centraux a
  INNER JOIN provinces p ON p.id = NEW.province_id AND p.actif = 1
  WHERE a.id = NEW.approvisionnement_id AND a.statut = 'BROUILLON'
)
BEGIN
  SELECT RAISE(ABORT, 'DESTINATION_APPROVISIONNEMENT_INVALIDE');
END;

CREATE TRIGGER verifier_article_approvisionnement_avant_insertion
BEFORE INSERT ON articles_approvisionnement
WHEN NOT EXISTS (
  SELECT 1 FROM destinations_approvisionnement d
  INNER JOIN approvisionnements_centraux a ON a.id = d.approvisionnement_id
  INNER JOIN articles ar ON ar.id = NEW.article_id AND ar.actif = 1
  WHERE d.id = NEW.destination_id
    AND d.approvisionnement_id = NEW.approvisionnement_id
    AND d.province_id = NEW.province_id
    AND a.statut = 'BROUILLON'
)
BEGIN
  SELECT RAISE(ABORT, 'ARTICLE_DESTINATION_APPROVISIONNEMENT_INVALIDE');
END;

CREATE TRIGGER verifier_article_approvisionnement_avant_modification
BEFORE UPDATE OF approvisionnement_id, destination_id, province_id, article_id, quantite_allouee
ON articles_approvisionnement
WHEN EXISTS (
  SELECT 1 FROM approvisionnements_centraux a
  WHERE a.id = OLD.approvisionnement_id AND a.statut <> 'BROUILLON'
)
  OR NOT EXISTS (
    SELECT 1 FROM destinations_approvisionnement d
    INNER JOIN approvisionnements_centraux a ON a.id = d.approvisionnement_id
    INNER JOIN articles ar ON ar.id = NEW.article_id AND ar.actif = 1
    WHERE d.id = NEW.destination_id
      AND d.approvisionnement_id = NEW.approvisionnement_id
      AND d.province_id = NEW.province_id
      AND a.statut = 'BROUILLON'
  )
  OR NEW.quantite_allouee < NEW.quantite_expediee
BEGIN
  SELECT RAISE(ABORT, 'ARTICLE_DESTINATION_APPROVISIONNEMENT_IMMUABLE');
END;

CREATE TRIGGER verifier_validation_approvisionnement
BEFORE UPDATE OF statut ON approvisionnements_centraux
WHEN NEW.statut = 'VALIDEE' AND OLD.statut = 'BROUILLON'
  AND (NOT EXISTS (
    SELECT 1 FROM destinations_approvisionnement d WHERE d.approvisionnement_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM destinations_approvisionnement d
    WHERE d.approvisionnement_id = OLD.id
      AND NOT EXISTS (
        SELECT 1 FROM articles_approvisionnement aa WHERE aa.destination_id = d.id
      )
  ))
BEGIN
  SELECT RAISE(ABORT, 'APPROVISIONNEMENT_SANS_REPARTITION');
END;

CREATE TRIGGER verifier_expedition_avant_insertion
BEFORE INSERT ON expeditions
WHEN NOT EXISTS (
  SELECT 1
  FROM approvisionnements_centraux a
  INNER JOIN destinations_approvisionnement d
    ON d.id = NEW.destination_id
   AND d.approvisionnement_id = NEW.approvisionnement_id
   AND d.province_id = NEW.province_destinataire_id
  WHERE a.id = NEW.approvisionnement_id
    AND a.statut IN ('VALIDEE', 'EN_EXPEDITION', 'PARTIELLEMENT_RECEPTIONNEE', 'EN_RAPPROCHEMENT')
    AND (
      (NEW.origine_expedition = 'ENTREPOT_CENTRAL'
        AND a.source_articles = 'ENTREPOT_CENTRAL'
        AND NEW.entrepot_origine_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM entrepots e
          WHERE e.id = NEW.entrepot_origine_id AND e.niveau = 'CENTRAL'
            AND e.province_id IS NULL AND e.actif = 1
        ))
      OR (NEW.origine_expedition = 'LIVRAISON_DIRECTE_FOURNISSEUR'
        AND a.source_articles IN ('FOURNISSEUR_EXTERNE', 'DON_PARTENAIRE')
        AND NEW.entrepot_origine_id IS NULL)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'EXPEDITION_APPROVISIONNEMENT_INCOHERENTE');
END;

CREATE TRIGGER verifier_ligne_expedition_avant_insertion
BEFORE INSERT ON lignes_expedition
WHEN NOT EXISTS (
  SELECT 1
  FROM expeditions e
  INNER JOIN articles_approvisionnement aa
    ON aa.id = NEW.article_approvisionnement_id
   AND aa.approvisionnement_id = e.approvisionnement_id
   AND aa.destination_id = e.destination_id
   AND aa.province_id = e.province_destinataire_id
   AND aa.article_id = NEW.article_id
  WHERE e.id = NEW.expedition_id
    AND aa.quantite_expediee + NEW.quantite_expediee <= aa.quantite_allouee + 0.000001
    AND (
      (e.origine_expedition = 'ENTREPOT_CENTRAL'
        AND NEW.lot_origine_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM lots_stock l
          WHERE l.id = NEW.lot_origine_id
            AND l.entrepot_id = e.entrepot_origine_id
            AND l.province_id IS NULL
            AND l.article_id = NEW.article_id
            AND l.etat_qualite = 'BON'
            AND (l.date_peremption IS NULL OR l.date_peremption >= date('now'))
        ))
      OR (e.origine_expedition = 'LIVRAISON_DIRECTE_FOURNISSEUR'
        AND NEW.lot_origine_id IS NULL
        AND length(trim(COALESCE(NEW.numero_lot_fournisseur, ''))) > 0)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_EXPEDITION_INVALIDE_OU_ALLOCATION_DEPASSEE');
END;

CREATE TRIGGER appliquer_ligne_expedition
AFTER INSERT ON lignes_expedition
BEGIN
  UPDATE articles_approvisionnement
  SET quantite_expediee = quantite_expediee + NEW.quantite_expediee
  WHERE id = NEW.article_approvisionnement_id;

  UPDATE destinations_approvisionnement
  SET statut_destination = 'EN_EXPEDITION'
  WHERE id = (SELECT destination_id FROM expeditions WHERE id = NEW.expedition_id)
    AND statut_destination = 'PLANIFIEE';

  UPDATE destinations_approvisionnement
  SET statut_destination = CASE
    WHEN EXISTS (
      SELECT 1 FROM expeditions e
      INNER JOIN receptions_provinciales r ON r.expedition_id = e.id
      WHERE e.destination_id = destinations_approvisionnement.id
        AND r.statut_rapprochement = 'ECART_OUVERT'
    ) THEN 'EN_ECART'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) AND EXISTS (
      SELECT 1 FROM receptions_provinciales r
      INNER JOIN expeditions e ON e.id = r.expedition_id
      WHERE e.destination_id = destinations_approvisionnement.id
    ) THEN 'PARTIELLEMENT_RECEPTIONNEE'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) THEN 'EN_EXPEDITION'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
    ) THEN 'RECEPTIONNEE'
    ELSE 'PLANIFIEE' END
  WHERE id = (SELECT destination_id FROM expeditions WHERE id = NEW.expedition_id);

  UPDATE approvisionnements_centraux
  SET statut = CASE
    WHEN EXISTS (
      SELECT 1 FROM receptions_provinciales r
      WHERE r.approvisionnement_id = approvisionnements_centraux.id
        AND r.statut_rapprochement = 'ECART_OUVERT'
    ) THEN 'EN_RAPPROCHEMENT'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) AND EXISTS (
      SELECT 1 FROM receptions_provinciales r WHERE r.approvisionnement_id = approvisionnements_centraux.id
    ) THEN 'PARTIELLEMENT_RECEPTIONNEE'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) THEN 'EN_EXPEDITION'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
    ) THEN 'RECEPTIONNEE'
    ELSE approvisionnements_centraux.statut END
  WHERE id = (SELECT approvisionnement_id FROM expeditions WHERE id = NEW.expedition_id)
    AND statut <> 'CLOTUREE';
END;

CREATE TRIGGER verifier_reception_provinciale_avant_insertion
BEFORE INSERT ON receptions_provinciales
WHEN NOT EXISTS (
  SELECT 1 FROM expeditions e
  INNER JOIN entrepots w ON w.id = NEW.entrepot_recepteur_id
  WHERE e.id = NEW.expedition_id
    AND e.approvisionnement_id = NEW.approvisionnement_id
    AND e.province_destinataire_id = NEW.province_id
    AND w.niveau = 'PROVINCIAL' AND w.province_id = NEW.province_id AND w.actif = 1
    AND e.statut_expedition = 'EN_ROUTE'
    AND EXISTS (
      SELECT 1 FROM receptions_stock rs
      WHERE rs.id = NEW.reception_stock_id
        AND rs.entrepot_id = NEW.entrepot_recepteur_id
        AND rs.province_id = NEW.province_id
        AND rs.type_entree = 'APPROVISIONNEMENT_CENTRAL'
    )
    AND (NEW.pv_piece_jointe_id IS NULL OR EXISTS (
      SELECT 1 FROM pieces_jointes pj
      WHERE pj.id = NEW.pv_piece_jointe_id
        AND pj.categorie_document = 'PV_RECEPTION'
        AND pj.entite_liee_type = 'EXPEDITION'
        AND pj.entite_liee_id = e.id
        AND pj.province_id = NEW.province_id
    ))
)
BEGIN
  SELECT RAISE(ABORT, 'RECEPTION_PROVINCIALE_HORS_PERIMETRE_OU_PV_INVALIDE');
END;

CREATE TRIGGER verifier_ligne_reception_provinciale_avant_insertion
BEFORE INSERT ON lignes_reception_provinciale
WHEN abs(NEW.quantite_recue_physique - NEW.quantite_acceptee - NEW.quantite_endommagee) > 0.000001
  OR abs(NEW.quantite_recue_physique + NEW.quantite_manquante - NEW.quantite_expediee) > 0.000001
  OR NOT EXISTS (
    SELECT 1
    FROM receptions_provinciales r
    INNER JOIN expeditions e ON e.id = r.expedition_id
    INNER JOIN lignes_expedition le ON le.id = NEW.ligne_expedition_id
    WHERE r.id = NEW.reception_provinciale_id
      AND r.expedition_id = le.expedition_id
      AND r.approvisionnement_id = e.approvisionnement_id
      AND NEW.article_id = le.article_id
      AND abs(NEW.quantite_expediee - le.quantite_expediee) <= 0.000001
      AND (
        (NEW.quantite_acceptee = 0 AND NEW.lot_cree_id IS NULL)
        OR (NEW.quantite_acceptee > 0 AND EXISTS (
          SELECT 1 FROM lots_stock l
          WHERE l.id = NEW.lot_cree_id AND l.source_reference_id = r.reception_stock_id
            AND l.entrepot_id = r.entrepot_recepteur_id AND l.province_id = r.province_id
            AND l.article_id = NEW.article_id AND l.etat_qualite IN ('BON', 'PERIME')
        ))
      )
      AND (
        (NEW.quantite_endommagee = 0 AND NEW.lot_endommage_id IS NULL)
        OR (NEW.quantite_endommagee > 0 AND EXISTS (
          SELECT 1 FROM lots_stock l
          WHERE l.id = NEW.lot_endommage_id AND l.source_reference_id = r.reception_stock_id
            AND l.entrepot_id = r.entrepot_recepteur_id AND l.province_id = r.province_id
            AND l.article_id = NEW.article_id AND l.etat_qualite = 'ENDOMMAGE'
        ))
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_RECEPTION_PROVINCIALE_INCOHERENTE');
END;

CREATE TRIGGER appliquer_ligne_reception_provinciale
AFTER INSERT ON lignes_reception_provinciale
BEGIN
  UPDATE articles_approvisionnement
  SET quantite_receptionnee_acceptee = quantite_receptionnee_acceptee + NEW.quantite_acceptee
  WHERE id = (
    SELECT le.article_approvisionnement_id FROM lignes_expedition le
    WHERE le.id = NEW.ligne_expedition_id
  );

  UPDATE receptions_provinciales
  SET comporte_ecarts = CASE WHEN EXISTS (
        SELECT 1 FROM lignes_reception_provinciale lr
        WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id
          AND abs(lr.quantite_acceptee - lr.quantite_expediee) > 0.000001
      ) THEN 1 ELSE 0 END,
      statut_rapprochement = CASE
        WHEN EXISTS (
          SELECT 1 FROM lignes_reception_provinciale lr
          WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id
            AND abs(lr.quantite_acceptee - lr.quantite_expediee) > 0.000001
        ) THEN 'ECART_OUVERT' ELSE 'AUCUN' END
  WHERE id = NEW.reception_provinciale_id
    AND (SELECT COUNT(*) FROM lignes_reception_provinciale lr
         WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id)
      = (SELECT COUNT(*) FROM lignes_expedition le
         INNER JOIN receptions_provinciales r ON r.expedition_id = le.expedition_id
         WHERE r.id = NEW.reception_provinciale_id);

  UPDATE expeditions
  SET statut_expedition = CASE WHEN EXISTS (
    SELECT 1 FROM lignes_reception_provinciale lr
    WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id
      AND abs(lr.quantite_acceptee - lr.quantite_expediee) > 0.000001
  ) THEN 'RECEPTIONNEE_AVEC_ECART' ELSE 'RECEPTIONNEE' END
  WHERE id = (SELECT expedition_id FROM receptions_provinciales WHERE id = NEW.reception_provinciale_id)
    AND (SELECT COUNT(*) FROM lignes_reception_provinciale lr
         WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id)
      = (SELECT COUNT(*) FROM lignes_expedition le
         WHERE le.expedition_id = expeditions.id);

  UPDATE destinations_approvisionnement
  SET statut_destination = CASE
    WHEN EXISTS (
      SELECT 1 FROM expeditions e
      INNER JOIN receptions_provinciales r ON r.expedition_id = e.id
      WHERE e.destination_id = destinations_approvisionnement.id
        AND r.statut_rapprochement = 'ECART_OUVERT'
    ) THEN 'EN_ECART'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) AND EXISTS (
      SELECT 1 FROM receptions_provinciales r
      INNER JOIN expeditions e ON e.id = r.expedition_id
      WHERE e.destination_id = destinations_approvisionnement.id
    ) THEN 'PARTIELLEMENT_RECEPTIONNEE'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) THEN 'EN_EXPEDITION'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
    ) THEN 'RECEPTIONNEE'
    ELSE 'PLANIFIEE' END
  WHERE id = (SELECT destination_id FROM expeditions
              WHERE id = (SELECT expedition_id FROM receptions_provinciales WHERE id = NEW.reception_provinciale_id));

  UPDATE approvisionnements_centraux
  SET statut = CASE
    WHEN EXISTS (
      SELECT 1 FROM receptions_provinciales r
      WHERE r.approvisionnement_id = approvisionnements_centraux.id
        AND r.statut_rapprochement = 'ECART_OUVERT'
    ) THEN 'EN_RAPPROCHEMENT'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) AND EXISTS (
      SELECT 1 FROM receptions_provinciales r WHERE r.approvisionnement_id = approvisionnements_centraux.id
    ) THEN 'PARTIELLEMENT_RECEPTIONNEE'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) THEN 'EN_EXPEDITION'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
    ) THEN 'RECEPTIONNEE'
    ELSE approvisionnements_centraux.statut END
  WHERE id = (SELECT approvisionnement_id FROM receptions_provinciales WHERE id = NEW.reception_provinciale_id)
    AND statut <> 'CLOTUREE';

  INSERT INTO notifications (
    id, destinataire_role, titre, message, type_alerte, lien_cible
  )
  SELECT lower(hex(randomblob(16))), 'ADMIN_CENTRAL', 'Écart de réception à rapprocher',
    'Une réception provinciale comporte un écart à examiner.', 'ACTION_REQUISE',
    '/approvisionnements/' || r.approvisionnement_id
  FROM receptions_provinciales r
  WHERE r.id = NEW.reception_provinciale_id
    AND r.statut_rapprochement = 'ECART_OUVERT';
END;

CREATE TRIGGER verifier_justification_ecart
BEFORE UPDATE OF justification_ecart ON lignes_reception_provinciale
WHEN NEW.justification_ecart IS NOT OLD.justification_ecart
  AND (abs(NEW.quantite_acceptee - NEW.quantite_expediee) <= 0.000001
    OR length(trim(COALESCE(NEW.justification_ecart, ''))) < 5)
BEGIN
  SELECT RAISE(ABORT, 'JUSTIFICATION_ECART_INVALIDE');
END;

CREATE TRIGGER appliquer_justification_ecart
AFTER UPDATE OF justification_ecart ON lignes_reception_provinciale
WHEN NEW.justification_ecart IS NOT OLD.justification_ecart
BEGIN
  UPDATE receptions_provinciales
  SET statut_rapprochement = CASE
    WHEN EXISTS (
      SELECT 1 FROM lignes_reception_provinciale lr
      WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id
        AND abs(lr.quantite_acceptee - lr.quantite_expediee) > 0.000001
        AND length(trim(COALESCE(lr.justification_ecart, ''))) < 5
    ) THEN 'ECART_OUVERT'
    WHEN EXISTS (
      SELECT 1 FROM lignes_reception_provinciale lr
      WHERE lr.reception_provinciale_id = NEW.reception_provinciale_id
        AND abs(lr.quantite_acceptee - lr.quantite_expediee) > 0.000001
    ) THEN 'RAPPROCHE_JUSTIFIE' ELSE 'AUCUN' END
  WHERE id = NEW.reception_provinciale_id;

  UPDATE destinations_approvisionnement
  SET statut_destination = CASE
    WHEN EXISTS (
      SELECT 1 FROM expeditions e
      INNER JOIN receptions_provinciales r ON r.expedition_id = e.id
      WHERE e.destination_id = destinations_approvisionnement.id
        AND r.statut_rapprochement = 'ECART_OUVERT'
    ) THEN 'EN_ECART'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) AND EXISTS (
      SELECT 1 FROM receptions_provinciales r
      INNER JOIN expeditions e ON e.id = r.expedition_id
      WHERE e.destination_id = destinations_approvisionnement.id
    ) THEN 'PARTIELLEMENT_RECEPTIONNEE'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) THEN 'EN_EXPEDITION'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.destination_id = destinations_approvisionnement.id
    ) THEN 'RECEPTIONNEE'
    ELSE 'PLANIFIEE' END
  WHERE id = (SELECT destination_id FROM expeditions
              WHERE id = (SELECT expedition_id FROM receptions_provinciales WHERE id = NEW.reception_provinciale_id));

  UPDATE approvisionnements_centraux
  SET statut = CASE
    WHEN EXISTS (
      SELECT 1 FROM receptions_provinciales r
      WHERE r.approvisionnement_id = approvisionnements_centraux.id
        AND r.statut_rapprochement = 'ECART_OUVERT'
    ) THEN 'EN_RAPPROCHEMENT'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) AND EXISTS (
      SELECT 1 FROM receptions_provinciales r WHERE r.approvisionnement_id = approvisionnements_centraux.id
    ) THEN 'PARTIELLEMENT_RECEPTIONNEE'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
        AND e.statut_expedition = 'EN_ROUTE'
    ) THEN 'EN_EXPEDITION'
    WHEN EXISTS (
      SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = approvisionnements_centraux.id
    ) THEN 'RECEPTIONNEE'
    ELSE approvisionnements_centraux.statut END
  WHERE id = (SELECT approvisionnement_id FROM receptions_provinciales WHERE id = NEW.reception_provinciale_id)
    AND statut <> 'CLOTUREE';
END;

CREATE TRIGGER verifier_cloture_approvisionnement
BEFORE UPDATE OF statut ON approvisionnements_centraux
WHEN NEW.statut = 'CLOTUREE'
  AND (
    EXISTS (SELECT 1 FROM expeditions e WHERE e.approvisionnement_id = OLD.id AND e.statut_expedition = 'EN_ROUTE')
    OR EXISTS (SELECT 1 FROM receptions_provinciales r
               WHERE r.approvisionnement_id = OLD.id AND r.statut_rapprochement = 'ECART_OUVERT')
    OR EXISTS (
      SELECT 1 FROM receptions_provinciales r
      WHERE r.approvisionnement_id = OLD.id
        AND (SELECT COUNT(*) FROM lignes_reception_provinciale lr WHERE lr.reception_provinciale_id = r.id)
          <> (SELECT COUNT(*) FROM lignes_expedition le WHERE le.expedition_id = r.expedition_id)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'APPROVISIONNEMENT_NON_CLOTURABLE');
END;

CREATE TRIGGER interdire_suppression_approvisionnement
BEFORE DELETE ON approvisionnements_centraux
BEGIN
  SELECT RAISE(ABORT, 'APPROVISIONNEMENT_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_expedition
BEFORE DELETE ON expeditions
BEGIN
  SELECT RAISE(ABORT, 'EXPEDITION_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_ligne_expedition
BEFORE DELETE ON lignes_expedition
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_EXPEDITION_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_reception_provinciale
BEFORE DELETE ON receptions_provinciales
BEGIN
  SELECT RAISE(ABORT, 'RECEPTION_PROVINCIALE_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_ligne_reception_provinciale
BEFORE DELETE ON lignes_reception_provinciale
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_RECEPTION_PROVINCIALE_IMMUABLE');
END;

CREATE TRIGGER interdire_modification_quantites_reception_provinciale
BEFORE UPDATE OF reception_provinciale_id, ligne_expedition_id, article_id,
  quantite_expediee, quantite_recue_physique, quantite_acceptee,
  quantite_endommagee, quantite_manquante, lot_cree_id, lot_endommage_id
ON lignes_reception_provinciale
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_RECEPTION_PROVINCIALE_IMMUABLE');
END;

CREATE TRIGGER interdire_modification_donnees_expedition
BEFORE UPDATE OF reference_expedition, approvisionnement_id, destination_id,
  province_destinataire_id, date_expedition, origine_expedition,
  entrepot_origine_id, reference_bordereau, transporteur_partenaire_id,
  informations_transport, cree_par, cree_le
ON expeditions
BEGIN
  SELECT RAISE(ABORT, 'DONNEES_EXPEDITION_IMMUABLES');
END;

CREATE TRIGGER interdire_modification_ligne_expedition
BEFORE UPDATE ON lignes_expedition
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_EXPEDITION_IMMUABLE');
END;
