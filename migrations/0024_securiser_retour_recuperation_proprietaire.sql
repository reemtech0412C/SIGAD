PRAGMA foreign_keys = ON;

-- Les lignes 0023 déjà présentes restent historiques et ne reçoivent aucun état supposé.
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN etat_activation_precedent_capture_le TEXT;
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN empreinte_activation_precedente TEXT;
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN expiration_activation_precedente TEXT;
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN empreinte_mot_de_passe_precedente TEXT;
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN secret_mfa_temporaire_precedent TEXT;
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN changement_mot_de_passe_precedent INTEGER
  CHECK (changement_mot_de_passe_precedent IS NULL OR changement_mot_de_passe_precedent IN (0, 1));
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN mfa_actif_precedent INTEGER
  CHECK (mfa_actif_precedent IS NULL OR mfa_actif_precedent IN (0, 1));
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN emission_confirmee_le TEXT;
ALTER TABLE recuperations_acces_proprietaire ADD COLUMN revocation_confirmee_le TEXT;

CREATE TRIGGER trg_recuperation_snapshot_initial_valide
BEFORE INSERT ON recuperations_acces_proprietaire
WHEN NEW.etat_activation_precedent_capture_le IS NULL
  OR NEW.changement_mot_de_passe_precedent IS NULL
  OR NEW.mfa_actif_precedent IS NULL
  OR NEW.emission_confirmee_le IS NOT NULL
  OR NEW.revocation_confirmee_le IS NOT NULL
  OR NOT EXISTS (
    SELECT 1
    FROM utilisateurs u
    INNER JOIN preuves_operateur_recuperation p
      ON p.id = NEW.preuve_emission_id
     AND p.utilisateur_id = NEW.utilisateur_id
     AND p.operation = 'EMETTRE_ACTIVATION_INITIALE'
    WHERE u.id = NEW.utilisateur_id
      AND u.identifiant = 'proprietaire'
      AND u.role = 'PROPRIETAIRE'
      AND u.statut = 'ACTIF'
      AND u.doit_changer_mot_de_passe = 1
      AND u.code_activation_recuperation_id IS NULL
      AND u.code_activation_hash IS NEW.empreinte_activation_precedente
      AND u.code_activation_expire_le IS NEW.expiration_activation_precedente
      AND u.mot_de_passe_hash IS NEW.empreinte_mot_de_passe_precedente
      AND u.double_facteur_secret_temporaire IS NEW.secret_mfa_temporaire_precedent
      AND u.double_facteur_actif = NEW.mfa_actif_precedent
      AND u.doit_changer_mot_de_passe = NEW.changement_mot_de_passe_precedent
      AND NOT EXISTS (
        SELECT 1 FROM recuperations_acces_proprietaire r
        WHERE r.utilisateur_id = u.id AND r.terminee_le IS NULL AND r.revoquee_le IS NULL
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'État de récupération absent, périmé ou concurrent.');
END;

CREATE TRIGGER trg_recuperation_emission_confirmee
BEFORE UPDATE OF emission_confirmee_le ON recuperations_acces_proprietaire
WHEN OLD.emission_confirmee_le IS NOT NULL
  OR NEW.emission_confirmee_le IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM utilisateurs u
    WHERE u.id = NEW.utilisateur_id
      AND u.identifiant = 'proprietaire'
      AND u.role = 'PROPRIETAIRE'
      AND u.statut = 'ACTIF'
      AND u.doit_changer_mot_de_passe = 1
      AND u.code_activation_hash IS NOT NULL
      AND u.code_activation_expire_le = NEW.activation_expire_le
      AND u.code_activation_recuperation_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'La récupération propriétaire ne peut pas être confirmée.');
END;

CREATE TRIGGER trg_recuperation_revocation_autorisee
BEFORE UPDATE OF revoquee_le, preuve_revocation_id ON recuperations_acces_proprietaire
WHEN OLD.revoquee_le IS NULL AND NEW.revoquee_le IS NOT NULL
  AND (
    OLD.etat_activation_precedent_capture_le IS NULL
    OR OLD.emission_confirmee_le IS NULL
    OR NEW.preuve_revocation_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM preuves_operateur_recuperation p
      WHERE p.id = NEW.preuve_revocation_id
        AND p.utilisateur_id = OLD.utilisateur_id
        AND p.operation = 'REVOQUER_ACTIVATION_INITIALE'
    )
    OR NOT EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.id = OLD.utilisateur_id
        AND u.identifiant = 'proprietaire'
        AND u.role = 'PROPRIETAIRE'
        AND u.statut = 'ACTIF'
        AND u.double_facteur_actif = OLD.mfa_actif_precedent
        AND (
          u.code_activation_recuperation_id = OLD.id
          OR (OLD.jeton_consomme_le IS NOT NULL AND u.code_activation_recuperation_id IS NULL)
        )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'La récupération ne peut pas être annulée dans cet état.');
END;

CREATE TRIGGER trg_recuperation_revocation_confirmee
BEFORE UPDATE OF revocation_confirmee_le ON recuperations_acces_proprietaire
WHEN OLD.revocation_confirmee_le IS NOT NULL
  OR NEW.revocation_confirmee_le IS NULL
  OR NEW.revoquee_le IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM utilisateurs u
    WHERE u.id = NEW.utilisateur_id
      AND u.identifiant = 'proprietaire'
      AND u.role = 'PROPRIETAIRE'
      AND u.statut = 'ACTIF'
      AND u.code_activation_recuperation_id IS NULL
      AND u.double_facteur_actif = NEW.mfa_actif_precedent
      AND u.doit_changer_mot_de_passe = NEW.changement_mot_de_passe_precedent
      AND u.mot_de_passe_hash IS NEW.empreinte_mot_de_passe_precedente
      AND u.double_facteur_secret_temporaire IS NEW.secret_mfa_temporaire_precedent
      AND u.code_activation_hash IS CASE
        WHEN NEW.empreinte_activation_precedente IS NOT NULL
          AND (NEW.expiration_activation_precedente IS NULL
            OR datetime(NEW.expiration_activation_precedente) > datetime('now'))
        THEN NEW.empreinte_activation_precedente ELSE NULL END
      AND u.code_activation_expire_le IS CASE
        WHEN NEW.empreinte_activation_precedente IS NOT NULL
          AND (NEW.expiration_activation_precedente IS NULL
            OR datetime(NEW.expiration_activation_precedente) > datetime('now'))
        THEN NEW.expiration_activation_precedente ELSE NULL END
  )
BEGIN
  SELECT RAISE(ABORT, 'La restauration de l’état précédent n’est pas complète.');
END;

CREATE TRIGGER trg_recuperation_snapshot_nettoyage_securise
BEFORE UPDATE OF empreinte_activation_precedente, empreinte_mot_de_passe_precedente, secret_mfa_temporaire_precedent
ON recuperations_acces_proprietaire
WHEN NOT (
  NEW.empreinte_activation_precedente IS OLD.empreinte_activation_precedente
  AND NEW.empreinte_mot_de_passe_precedente IS OLD.empreinte_mot_de_passe_precedente
  AND NEW.secret_mfa_temporaire_precedent IS OLD.secret_mfa_temporaire_precedent
)
AND NOT (
  NEW.empreinte_activation_precedente IS NULL
  AND NEW.empreinte_mot_de_passe_precedente IS NULL
  AND NEW.secret_mfa_temporaire_precedent IS NULL
  AND NEW.etat_activation_precedent_capture_le IS OLD.etat_activation_precedent_capture_le
  AND NEW.expiration_activation_precedente IS OLD.expiration_activation_precedente
  AND NEW.changement_mot_de_passe_precedent IS OLD.changement_mot_de_passe_precedent
  AND NEW.mfa_actif_precedent IS OLD.mfa_actif_precedent
  AND ((NEW.terminee_le IS NOT NULL AND NEW.emission_confirmee_le IS NOT NULL)
    OR (NEW.revoquee_le IS NOT NULL AND NEW.revocation_confirmee_le IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'L’instantané ne peut être effacé qu’après clôture confirmée.');
END;
