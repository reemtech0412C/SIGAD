PRAGMA foreign_keys = ON;

ALTER TABLE menages
  ADD COLUMN statut_validation TEXT NOT NULL DEFAULT 'VALIDE'
  CHECK (statut_validation IN ('A_VERIFIER', 'VALIDE', 'REFUSE'));

ALTER TABLE menages ADD COLUMN validation_decidee_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE menages ADD COLUMN validation_decidee_le TEXT;
ALTER TABLE menages ADD COLUMN motif_validation TEXT;

UPDATE menages
SET statut_validation = 'A_VERIFIER'
WHERE statut = 'DOUBLON_SUSPECTE';

ALTER TABLE signalements_doublons
  ADD COLUMN empreintes_preuve_json TEXT
  CHECK (empreintes_preuve_json IS NULL OR json_valid(empreintes_preuve_json));

ALTER TABLE signalements_doublons
  ADD COLUMN comparaison_json TEXT
  CHECK (comparaison_json IS NULL OR json_valid(comparaison_json));

ALTER TABLE signalements_doublons
  ADD COLUMN empreinte_reference_preuve TEXT;

ALTER TABLE signalements_doublons
  ADD COLUMN reouverture_de_id TEXT REFERENCES signalements_doublons(id);

ALTER TABLE signalements_doublons
  ADD COLUMN traite_le TEXT;

ALTER TABLE signalements_doublons ADD COLUMN reouvert_par TEXT REFERENCES utilisateurs(id);
ALTER TABLE signalements_doublons ADD COLUMN motif_reouverture TEXT;

DROP INDEX idx_signalements_doublons_paire_unique;

CREATE UNIQUE INDEX idx_signalements_doublons_paire_ouverte_unique
ON signalements_doublons (
  province_id,
  min(menage_source_id, menage_suspect_id),
  max(menage_source_id, menage_suspect_id)
)
WHERE statut_traitement = 'EN_ATTENTE';

CREATE INDEX idx_signalements_doublons_source_recent
ON signalements_doublons(province_id, menage_source_id, cree_le DESC, id);

CREATE INDEX idx_signalements_doublons_suspect_recent
ON signalements_doublons(province_id, menage_suspect_id, cree_le DESC, id);

CREATE INDEX idx_menages_province_validation_statut_date_id
ON menages(province_id, statut_validation, statut, date_enregistrement DESC, id);

DROP TRIGGER IF EXISTS verifier_inscription_beneficiaire_avant_insertion;
CREATE TRIGGER verifier_inscription_beneficiaire_avant_insertion
BEFORE INSERT ON inscriptions_beneficiaires
WHEN NOT EXISTS (
  SELECT 1 FROM listes_beneficiaires lb INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE lb.id = NEW.liste_id AND lb.province_id = m.province_id
    AND lb.statut <> 'VERROUILLEE' AND m.statut = 'ACTIF'
    AND m.statut_validation = 'VALIDE'
)
BEGIN
  SELECT RAISE(ABORT, 'La liste et le ménage doivent relever de la même province et le ménage doit être validé et actif.');
END;

DROP TRIGGER IF EXISTS verifier_inscription_beneficiaire_avant_mise_a_jour;
CREATE TRIGGER verifier_inscription_beneficiaire_avant_mise_a_jour
BEFORE UPDATE OF liste_id, menage_id ON inscriptions_beneficiaires
WHEN NOT EXISTS (
  SELECT 1 FROM listes_beneficiaires lb INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE lb.id = NEW.liste_id AND lb.province_id = m.province_id
    AND lb.statut <> 'VERROUILLEE' AND m.statut = 'ACTIF'
    AND m.statut_validation = 'VALIDE'
)
BEGIN
  SELECT RAISE(ABORT, 'La liste et le ménage doivent relever de la même province et le ménage doit être validé et actif.');
END;

CREATE TRIGGER verifier_statut_validation_menage_avant_insertion
BEFORE INSERT ON menages
WHEN (NEW.statut = 'ACTIF' AND NEW.statut_validation <> 'VALIDE')
  OR (NEW.statut = 'DOUBLON_SUSPECTE' AND NEW.statut_validation <> 'A_VERIFIER')
  OR (NEW.statut_validation = 'REFUSE' AND NEW.statut <> 'INACTIF')
BEGIN
  SELECT RAISE(ABORT, 'Le statut du ménage est incompatible avec son état de validation.');
END;

CREATE TRIGGER verifier_statut_validation_menage_avant_mise_a_jour
BEFORE UPDATE OF statut, statut_validation ON menages
WHEN (NEW.statut = 'ACTIF' AND NEW.statut_validation <> 'VALIDE')
  OR (NEW.statut = 'DOUBLON_SUSPECTE' AND NEW.statut_validation <> 'A_VERIFIER')
  OR (NEW.statut_validation = 'REFUSE' AND NEW.statut <> 'INACTIF')
  OR (OLD.statut = 'DOUBLON_SUSPECTE' AND NEW.statut = 'INACTIF' AND NEW.statut_validation = 'A_VERIFIER'
      AND NOT EXISTS (
        SELECT 1 FROM signalements_doublons sd
        WHERE sd.province_id = OLD.province_id
          AND sd.statut_traitement = 'CONFIRME_DISTINCT'
          AND (sd.menage_source_id = OLD.id OR sd.menage_suspect_id = OLD.id)
      ))
BEGIN
  SELECT RAISE(ABORT, 'La transition du ménage exige une revue ou une validation centrale correspondante.');
END;

CREATE TRIGGER verifier_confirmation_distincte_avant_mise_a_jour
BEFORE UPDATE OF statut_traitement ON signalements_doublons
WHEN OLD.statut_traitement = 'EN_ATTENTE'
  AND NEW.statut_traitement = 'CONFIRME_DISTINCT'
  AND (
    SELECT COUNT(*) FROM menages m
    WHERE m.province_id = OLD.province_id
      AND m.id IN (OLD.menage_source_id, OLD.menage_suspect_id)
      AND m.statut = 'DOUBLON_SUSPECTE'
  ) <> 2
BEGIN
  SELECT RAISE(ABORT, 'La décision de distinction exige que les deux ménages soient en revue de doublon.');
END;

CREATE TRIGGER appliquer_confirmation_distincte_apres_mise_a_jour
AFTER UPDATE OF statut_traitement ON signalements_doublons
WHEN OLD.statut_traitement = 'EN_ATTENTE'
  AND NEW.statut_traitement IN ('CONFIRME_DISTINCT', 'CONFIRME_DOUBLON')
BEGIN
  UPDATE menages
  SET statut = 'INACTIF', statut_validation = 'A_VERIFIER'
  WHERE NEW.statut_traitement = 'CONFIRME_DISTINCT'
    AND province_id = NEW.province_id
    AND id IN (NEW.menage_source_id, NEW.menage_suspect_id)
    AND statut = 'DOUBLON_SUSPECTE';

  INSERT INTO journaux_audit
    (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, donnees_avant, donnees_apres)
  SELECT lower(hex(randomblob(16))), u.id, u.role, NEW.province_id, NEW.statut_traitement,
    'SIGNALEMENT_DOUBLON', NEW.id,
    json_object('statut_traitement', OLD.statut_traitement),
    json_object('statut_traitement', NEW.statut_traitement, 'observations', NEW.observations)
  FROM utilisateurs u WHERE u.id = NEW.traite_par;
END;

CREATE TRIGGER journaliser_validation_menage_apres_mise_a_jour
AFTER UPDATE OF statut_validation ON menages
WHEN OLD.statut_validation = 'A_VERIFIER'
  AND NEW.statut_validation IN ('VALIDE', 'REFUSE')
BEGIN
  INSERT INTO journaux_audit
    (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, donnees_avant, donnees_apres)
  SELECT lower(hex(randomblob(16))), u.id, u.role, NEW.province_id,
    'VALIDATION_MENAGE_' || NEW.statut_validation, 'MENAGE', NEW.id,
    json_object('statut', OLD.statut, 'statut_validation', OLD.statut_validation),
    json_object('statut', NEW.statut, 'statut_validation', NEW.statut_validation, 'observations', NEW.motif_validation)
  FROM utilisateurs u WHERE u.id = NEW.validation_decidee_par;
END;

CREATE TRIGGER journaliser_reouverture_doublon_apres_insertion
AFTER INSERT ON signalements_doublons
WHEN NEW.reouverture_de_id IS NOT NULL
  AND NEW.reouvert_par IS NOT NULL
BEGIN
  INSERT INTO journaux_audit
    (id, utilisateur_id, role_utilisateur, province_id, action, entite_type, entite_id, donnees_avant, donnees_apres)
  SELECT lower(hex(randomblob(16))), u.id, u.role, NEW.province_id,
    'REOUVERTURE_REVUE_DOUBLON', 'SIGNALEMENT_DOUBLON', NEW.id,
    json_object('signalement_precedent', NEW.reouverture_de_id),
    json_object('motif', NEW.motif_reouverture, 'date_preuve', json_extract(NEW.comparaison_json, '$.date_preuve'),
      'empreinte_reference_preuve', NEW.empreinte_reference_preuve)
  FROM utilisateurs u WHERE u.id = NEW.reouvert_par;
END;

CREATE TRIGGER verifier_historique_signalement_avant_mise_a_jour
BEFORE UPDATE ON signalements_doublons
WHEN OLD.statut_traitement <> 'EN_ATTENTE'
BEGIN
  SELECT RAISE(ABORT, 'Un signalement clos est immuable; créez une nouvelle revue liée à la précédente.');
END;

CREATE TRIGGER verifier_historique_signalement_avant_suppression
BEFORE DELETE ON signalements_doublons
BEGIN
  SELECT RAISE(ABORT, 'Un signalement de doublon ne peut pas être supprimé.');
END;

CREATE TRIGGER verifier_signalement_ouvert_avant_insertion
BEFORE INSERT ON signalements_doublons
WHEN NEW.statut_traitement = 'EN_ATTENTE'
  AND (
    SELECT COUNT(*) FROM menages m
    WHERE m.id IN (NEW.menage_source_id, NEW.menage_suspect_id)
      AND m.province_id = NEW.province_id
      AND m.statut = 'DOUBLON_SUSPECTE'
      AND m.statut_validation = 'A_VERIFIER'
  ) <> 2
BEGIN
  SELECT RAISE(ABORT, 'Une revue ouverte exige deux ménages en vérification dans la même province.');
END;

DROP TRIGGER IF EXISTS verifier_doublon_menage_concurrent_apres_insertion;
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
  SET statut = 'INACTIF', statut_validation = 'A_VERIFIER'
  WHERE id = NEW.id
    AND EXISTS (
      SELECT 1 FROM menages existant
      INNER JOIN signalements_doublons sd ON sd.province_id = existant.province_id
        AND (sd.menage_source_id = existant.id OR sd.menage_suspect_id = existant.id)
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
      WHERE existant.id <> NEW.id
        AND existant.province_id = NEW.province_id
        AND existant.statut <> 'ARCHIVE'
        AND (
          (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
          OR (NEW.localite_id IS NOT NULL
              AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
              AND existant.localite_id = NEW.localite_id)
        )
    );

  UPDATE menages
  SET statut = 'DOUBLON_SUSPECTE', statut_validation = 'A_VERIFIER'
  WHERE id = NEW.id AND statut = 'ACTIF'
    AND NOT EXISTS (
      SELECT 1 FROM menages existant
      INNER JOIN signalements_doublons sd ON sd.province_id = existant.province_id
        AND (sd.menage_source_id = existant.id OR sd.menage_suspect_id = existant.id)
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
      WHERE existant.id <> NEW.id
        AND existant.province_id = NEW.province_id
        AND existant.statut <> 'ARCHIVE'
        AND (
          (NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone)
          OR (NEW.localite_id IS NOT NULL
              AND lower(trim(existant.nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
              AND existant.localite_id = NEW.localite_id)
        )
    );

  UPDATE menages
  SET statut = 'DOUBLON_SUSPECTE', statut_validation = 'A_VERIFIER'
  WHERE province_id = NEW.province_id AND id <> NEW.id AND statut <> 'ARCHIVE'
    AND (
      (NEW.telephone IS NOT NULL AND telephone = NEW.telephone)
      OR (NEW.localite_id IS NOT NULL
          AND lower(trim(nom_chef_menage)) = lower(trim(NEW.nom_chef_menage))
          AND localite_id = NEW.localite_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM signalements_doublons sd
      WHERE sd.province_id = NEW.province_id
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
        AND (sd.menage_source_id = menages.id OR sd.menage_suspect_id = menages.id)
    );

  INSERT OR IGNORE INTO signalements_doublons (
    id, province_id, menage_source_id, menage_suspect_id, motif_similitude
  )
  SELECT lower(hex(randomblob(16))), NEW.province_id, existant.id, NEW.id,
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
    AND NOT EXISTS (
      SELECT 1 FROM signalements_doublons sd
      WHERE sd.province_id = NEW.province_id
        AND sd.statut_traitement = 'CONFIRME_DISTINCT'
        AND (sd.menage_source_id = existant.id OR sd.menage_suspect_id = existant.id)
    )
  ORDER BY
    CASE WHEN NEW.telephone IS NOT NULL AND existant.telephone = NEW.telephone THEN 0 ELSE 1 END,
    existant.cree_le ASC,
    existant.id ASC
  LIMIT 1;
END;

UPDATE menages
SET statut = 'INACTIF', statut_validation = 'A_VERIFIER'
WHERE statut = 'DOUBLON_SUSPECTE'
  AND EXISTS (
    SELECT 1 FROM signalements_doublons sd
    WHERE sd.province_id = menages.province_id
      AND sd.statut_traitement = 'CONFIRME_DISTINCT'
      AND (sd.menage_source_id = menages.id OR sd.menage_suspect_id = menages.id)
  );
