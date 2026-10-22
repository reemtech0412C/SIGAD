PRAGMA foreign_keys = ON;

CREATE INDEX idx_rapports_generes_province_date
  ON rapports_generes(province_id, cree_le DESC, id);
CREATE INDEX idx_rapports_generes_perimetre_date
  ON rapports_generes(perimetre, cree_le DESC, id);
CREATE INDEX idx_rapports_generes_type_date
  ON rapports_generes(type_rapport, cree_le DESC, id);

CREATE INDEX idx_distributions_date_rapport
  ON distributions_provinciales(date_prevue, province_id, statut, id);
CREATE INDEX idx_approvisionnements_date_rapport
  ON approvisionnements_centraux(date_creation, id, statut);
CREATE INDEX idx_expeditions_date_rapport
  ON expeditions(date_expedition, province_destinataire_id, id);
CREATE INDEX idx_receptions_provinciales_date_rapport
  ON receptions_provinciales(date_reception, province_id, id);
CREATE INDEX idx_mouvements_stock_date_rapport
  ON mouvements_stock(cree_le DESC, province_id, id);
