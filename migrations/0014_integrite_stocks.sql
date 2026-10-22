PRAGMA foreign_keys = ON;

CREATE INDEX idx_entrepots_province_actif_nom
ON entrepots(province_id, actif, nom);

CREATE INDEX idx_receptions_stock_province_date
ON receptions_stock(province_id, date_reception DESC, id);

CREATE INDEX idx_mouvements_stock_entrepot_article_date
ON mouvements_stock(entrepot_id, article_id, cree_le DESC, id);

CREATE INDEX idx_ajustements_stock_province_date
ON ajustements_stock(province_id, cree_le DESC, id);

CREATE TRIGGER verifier_entrepot_avant_insertion
BEFORE INSERT ON entrepots
WHEN (NEW.niveau = 'CENTRAL' AND (NEW.province_id IS NOT NULL OR NEW.localite_id IS NOT NULL))
  OR (NEW.niveau = 'PROVINCIAL' AND (NEW.province_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.actif = 1
  )))
  OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.province_id = NEW.province_id
      AND l.statut_validation = 'VALIDE'
  ))
BEGIN
  SELECT RAISE(ABORT, 'RATTACHEMENT_ENTREPOT_INVALIDE');
END;

CREATE TRIGGER verifier_entrepot_avant_mise_a_jour
BEFORE UPDATE OF niveau, province_id, localite_id ON entrepots
WHEN (NEW.niveau = 'CENTRAL' AND (NEW.province_id IS NOT NULL OR NEW.localite_id IS NOT NULL))
  OR (NEW.niveau = 'PROVINCIAL' AND (NEW.province_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.actif = 1
  )))
  OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.province_id = NEW.province_id
      AND l.statut_validation = 'VALIDE'
  ))
BEGIN
  SELECT RAISE(ABORT, 'RATTACHEMENT_ENTREPOT_INVALIDE');
END;

CREATE TRIGGER verifier_lot_stock_avant_insertion
BEFORE INSERT ON lots_stock
WHEN NOT EXISTS (
  SELECT 1 FROM entrepots e
  WHERE e.id = NEW.entrepot_id
    AND e.actif = 1
    AND e.province_id IS NEW.province_id
    AND ((e.niveau = 'CENTRAL' AND NEW.province_id IS NULL)
      OR (e.niveau = 'PROVINCIAL' AND NEW.province_id IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'PERIMETRE_LOT_INVALIDE');
END;

CREATE TRIGGER verifier_lot_stock_avant_mise_a_jour
BEFORE UPDATE OF entrepot_id, province_id, article_id ON lots_stock
WHEN NOT EXISTS (
  SELECT 1 FROM entrepots e
  WHERE e.id = NEW.entrepot_id
    AND e.actif = 1
    AND e.province_id IS NEW.province_id
    AND ((e.niveau = 'CENTRAL' AND NEW.province_id IS NULL)
      OR (e.niveau = 'PROVINCIAL' AND NEW.province_id IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'PERIMETRE_LOT_INVALIDE');
END;

CREATE TRIGGER synchroniser_solde_apres_insertion_lot
AFTER INSERT ON lots_stock
BEGIN
  INSERT INTO soldes_stock (
    id, entrepot_id, province_id, article_id,
    quantite_physique, quantite_reservee, derniere_maj
  )
  SELECT lower(hex(randomblob(16))), NEW.entrepot_id, NEW.province_id, NEW.article_id,
    SUM(quantite_physique), SUM(quantite_reservee), datetime('now')
  FROM lots_stock
  WHERE entrepot_id = NEW.entrepot_id AND article_id = NEW.article_id
  ON CONFLICT(entrepot_id, article_id) DO UPDATE SET
    province_id = excluded.province_id,
    quantite_physique = excluded.quantite_physique,
    quantite_reservee = excluded.quantite_reservee,
    derniere_maj = excluded.derniere_maj;
END;

CREATE TRIGGER synchroniser_solde_apres_mise_a_jour_lot
AFTER UPDATE OF entrepot_id, province_id, article_id, quantite_physique, quantite_reservee ON lots_stock
BEGIN
  INSERT INTO soldes_stock (
    id, entrepot_id, province_id, article_id,
    quantite_physique, quantite_reservee, derniere_maj
  )
  SELECT lower(hex(randomblob(16))), OLD.entrepot_id, OLD.province_id, OLD.article_id,
    COALESCE(SUM(quantite_physique), 0), COALESCE(SUM(quantite_reservee), 0), datetime('now')
  FROM lots_stock
  WHERE entrepot_id = OLD.entrepot_id AND article_id = OLD.article_id
  ON CONFLICT(entrepot_id, article_id) DO UPDATE SET
    province_id = excluded.province_id,
    quantite_physique = excluded.quantite_physique,
    quantite_reservee = excluded.quantite_reservee,
    derniere_maj = excluded.derniere_maj;

  INSERT INTO soldes_stock (
    id, entrepot_id, province_id, article_id,
    quantite_physique, quantite_reservee, derniere_maj
  )
  SELECT lower(hex(randomblob(16))), NEW.entrepot_id, NEW.province_id, NEW.article_id,
    SUM(quantite_physique), SUM(quantite_reservee), datetime('now')
  FROM lots_stock
  WHERE entrepot_id = NEW.entrepot_id AND article_id = NEW.article_id
  ON CONFLICT(entrepot_id, article_id) DO UPDATE SET
    province_id = excluded.province_id,
    quantite_physique = excluded.quantite_physique,
    quantite_reservee = excluded.quantite_reservee,
    derniere_maj = excluded.derniere_maj;
END;

CREATE TRIGGER synchroniser_solde_apres_suppression_lot
AFTER DELETE ON lots_stock
BEGIN
  INSERT INTO soldes_stock (
    id, entrepot_id, province_id, article_id,
    quantite_physique, quantite_reservee, derniere_maj
  )
  SELECT lower(hex(randomblob(16))), OLD.entrepot_id, OLD.province_id, OLD.article_id,
    COALESCE(SUM(quantite_physique), 0), COALESCE(SUM(quantite_reservee), 0), datetime('now')
  FROM lots_stock
  WHERE entrepot_id = OLD.entrepot_id AND article_id = OLD.article_id
  ON CONFLICT(entrepot_id, article_id) DO UPDATE SET
    province_id = excluded.province_id,
    quantite_physique = excluded.quantite_physique,
    quantite_reservee = excluded.quantite_reservee,
    derniere_maj = excluded.derniere_maj;
END;

CREATE TRIGGER verifier_solde_avant_insertion
BEFORE INSERT ON soldes_stock
WHEN NOT EXISTS (
  SELECT 1 FROM entrepots e
  WHERE e.id = NEW.entrepot_id
    AND e.province_id IS NEW.province_id
    AND ((e.niveau = 'CENTRAL' AND NEW.province_id IS NULL)
      OR (e.niveau = 'PROVINCIAL' AND NEW.province_id IS NOT NULL))
)
  OR abs(NEW.quantite_physique - COALESCE((
    SELECT SUM(l.quantite_physique) FROM lots_stock l
    WHERE l.entrepot_id = NEW.entrepot_id AND l.article_id = NEW.article_id
  ), 0)) > 0.000000001
  OR abs(NEW.quantite_reservee - COALESCE((
    SELECT SUM(l.quantite_reservee) FROM lots_stock l
    WHERE l.entrepot_id = NEW.entrepot_id AND l.article_id = NEW.article_id
  ), 0)) > 0.000000001
BEGIN
  SELECT RAISE(ABORT, 'SOLDE_STOCK_INCOHERENT');
END;

CREATE TRIGGER verifier_solde_avant_mise_a_jour
BEFORE UPDATE OF entrepot_id, province_id, article_id, quantite_physique, quantite_reservee ON soldes_stock
WHEN NOT EXISTS (
  SELECT 1 FROM entrepots e
  WHERE e.id = NEW.entrepot_id
    AND e.province_id IS NEW.province_id
    AND ((e.niveau = 'CENTRAL' AND NEW.province_id IS NULL)
      OR (e.niveau = 'PROVINCIAL' AND NEW.province_id IS NOT NULL))
)
  OR abs(NEW.quantite_physique - COALESCE((
    SELECT SUM(l.quantite_physique) FROM lots_stock l
    WHERE l.entrepot_id = NEW.entrepot_id AND l.article_id = NEW.article_id
  ), 0)) > 0.000000001
  OR abs(NEW.quantite_reservee - COALESCE((
    SELECT SUM(l.quantite_reservee) FROM lots_stock l
    WHERE l.entrepot_id = NEW.entrepot_id AND l.article_id = NEW.article_id
  ), 0)) > 0.000000001
BEGIN
  SELECT RAISE(ABORT, 'SOLDE_STOCK_INCOHERENT');
END;

CREATE TRIGGER interdire_suppression_solde_stock
BEFORE DELETE ON soldes_stock
BEGIN
  SELECT RAISE(ABORT, 'SUPPRESSION_SOLDE_INTERDITE');
END;

CREATE TRIGGER verifier_reception_stock_avant_insertion
BEFORE INSERT ON receptions_stock
WHEN NOT EXISTS (
  SELECT 1 FROM entrepots e
  WHERE e.id = NEW.entrepot_id
    AND e.actif = 1
    AND e.province_id IS NEW.province_id
    AND ((e.niveau = 'CENTRAL' AND NEW.province_id IS NULL)
      OR (e.niveau = 'PROVINCIAL' AND NEW.province_id IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'PERIMETRE_RECEPTION_INVALIDE');
END;

CREATE TRIGGER verifier_ligne_reception_avant_insertion
BEFORE INSERT ON lignes_reception
WHEN abs(NEW.quantite_recue - NEW.quantite_acceptee - NEW.quantite_endommagee) > 0.000001
  OR NOT EXISTS (
    SELECT 1 FROM receptions_stock r
    INNER JOIN lots_stock l ON l.id = NEW.lot_stock_id
    WHERE r.id = NEW.reception_stock_id
      AND l.entrepot_id = r.entrepot_id
      AND l.province_id IS r.province_id
      AND l.article_id = NEW.article_id
      AND l.source_reference_id = r.id
  )
BEGIN
  SELECT RAISE(ABORT, 'LIGNE_RECEPTION_INCOHERENTE');
END;

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
  OR (NEW.type_mouvement = 'RESERVATION' AND NOT EXISTS (
    SELECT 1 FROM soldes_stock s
    WHERE s.entrepot_id = NEW.entrepot_id AND s.article_id = NEW.article_id
      AND s.province_id IS NEW.province_id
      AND abs(s.quantite_reservee - COALESCE((
        SELECT SUM(r.quantite_reservee - r.quantite_consommee - r.quantite_liberee)
        FROM reservations_stock r
        WHERE r.entrepot_id = NEW.entrepot_id
          AND r.article_id = NEW.article_id
          AND r.statut = 'ACTIVE'
      ), 0)) <= 0.000000001
  ))
BEGIN
  SELECT RAISE(ABORT, 'MOUVEMENT_STOCK_INCOHERENT');
END;

CREATE TRIGGER interdire_modification_mouvement_stock
BEFORE UPDATE ON mouvements_stock
BEGIN
  SELECT RAISE(ABORT, 'MOUVEMENT_STOCK_IMMUABLE');
END;

CREATE TRIGGER interdire_suppression_mouvement_stock
BEFORE DELETE ON mouvements_stock
BEGIN
  SELECT RAISE(ABORT, 'MOUVEMENT_STOCK_IMMUABLE');
END;

