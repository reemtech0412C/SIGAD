CREATE INDEX idx_menages_province_date_id
  ON menages (province_id, date_enregistrement DESC, id);

CREATE INDEX idx_mouvements_province_date_id
  ON mouvements_stock (province_id, cree_le DESC, id);
