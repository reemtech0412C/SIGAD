PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX idx_signalements_doublons_paire_unique
ON signalements_doublons (
  province_id,
  min(menage_source_id, menage_suspect_id),
  max(menage_source_id, menage_suspect_id)
);

DROP TRIGGER verifier_doublon_menage_concurrent_apres_insertion;

CREATE TRIGGER verifier_doublon_menage_concurrent_apres_insertion
AFTER INSERT ON menages
WHEN NEW.statut = 'ACTIF'
 AND EXISTS (
   SELECT 1 FROM menages existant
   WHERE existant.id <> NEW.id
     AND existant.province_id = NEW.province_id
     AND existant.statut <> 'ARCHIVE'
     AND (
       (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
       OR (NEW.localite_id IS NOT NULL
           AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
           AND existant.localite_id = NEW.localite_id)
     )
 )
BEGIN
  UPDATE menages
  SET statut = 'DOUBLON_SUSPECTE'
  WHERE id = NEW.id AND statut = 'ACTIF';

  INSERT OR IGNORE INTO signalements_doublons (
    id,
    province_id,
    menage_source_id,
    menage_suspect_id,
    motif_similitude
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.province_id,
    existant.id,
    NEW.id,
    CASE
      WHEN NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone THEN 'MEME_TELEPHONE'
      ELSE 'NOM_ET_LOCALITE_SIMILAIRES'
    END
  FROM menages existant
  WHERE existant.id <> NEW.id
    AND existant.province_id = NEW.province_id
    AND existant.statut <> 'ARCHIVE'
    AND (
      (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
      OR (NEW.localite_id IS NOT NULL
          AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
          AND existant.localite_id = NEW.localite_id)
    )
  ORDER BY
    CASE WHEN NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone THEN 0 ELSE 1 END,
    existant.cree_le ASC,
    existant.id ASC
  LIMIT 1;
END;
