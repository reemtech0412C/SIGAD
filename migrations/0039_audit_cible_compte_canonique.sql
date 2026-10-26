DROP TRIGGER adapter_decisions_comptes_vers_evenements;

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
