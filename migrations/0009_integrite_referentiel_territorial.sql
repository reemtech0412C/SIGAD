PRAGMA foreign_keys = ON;

CREATE INDEX idx_departements_province_actif_nom
    ON departements(province_id, actif, nom);
CREATE INDEX idx_sous_prefectures_departement_actif_nom
    ON sous_prefectures(departement_id, actif, nom);
CREATE INDEX idx_communes_province_statut_actif_nom
    ON communes(province_id, statut_validation, actif, nom);
CREATE INDEX idx_rattachements_commune_validite
    ON rattachements_territoriaux(commune_id, date_debut_validite, date_fin_validite);
CREATE INDEX idx_rattachements_departement_sous_prefecture
    ON rattachements_territoriaux(departement_id, sous_prefecture_id, commune_id);
CREATE INDEX idx_cantons_sous_prefecture_statut_nom
    ON cantons(sous_prefecture_id, statut_validation, nom);
CREATE INDEX idx_localites_province_statut_type_nom
    ON localites(province_id, statut_validation, type_localite, nom);
CREATE INDEX idx_arrondissements_localite_statut_nom
    ON arrondissements(localite_id, statut_validation, nom);
CREATE INDEX idx_quartiers_localite_statut_arrondissement_nom
    ON quartiers(localite_id, statut_validation, arrondissement_id, nom);
CREATE INDEX idx_carres_quartier_statut_nom
    ON carres(quartier_id, statut_validation, code_ou_nom);
CREATE INDEX idx_sites_humanitaires_province_statut_nom
    ON sites_humanitaires(province_id, statut_validation, nom);
CREATE INDEX idx_historique_decoupages_entite_date
    ON historique_decoupages(entite_type, entite_id, cree_le DESC);
CREATE INDEX idx_journaux_audit_action_entite_date
    ON journaux_audit(action, entite_type, entite_id, cree_le DESC);

CREATE TRIGGER verifier_rattachement_territorial_avant_insertion
BEFORE INSERT ON rattachements_territoriaux
WHEN NOT EXISTS (
    SELECT 1
    FROM communes c
    JOIN departements d ON d.id = COALESCE(NEW.departement_id, (
        SELECT sp.departement_id FROM sous_prefectures sp WHERE sp.id = NEW.sous_prefecture_id
    ))
    WHERE c.id = NEW.commune_id
      AND c.province_id = d.province_id
      AND (
          NEW.sous_prefecture_id IS NULL
          OR EXISTS (
              SELECT 1 FROM sous_prefectures sp
              WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = d.id
          )
      )
)
OR (NEW.date_fin_validite IS NOT NULL AND NEW.date_fin_validite < NEW.date_debut_validite)
BEGIN
    SELECT RAISE(ABORT, 'Rattachement territorial incohérent avec la province, le département ou la sous-préfecture.');
END;

CREATE TRIGGER verifier_rattachement_territorial_avant_mise_a_jour
BEFORE UPDATE OF commune_id, departement_id, sous_prefecture_id, date_debut_validite, date_fin_validite ON rattachements_territoriaux
WHEN NOT EXISTS (
    SELECT 1
    FROM communes c
    JOIN departements d ON d.id = COALESCE(NEW.departement_id, (
        SELECT sp.departement_id FROM sous_prefectures sp WHERE sp.id = NEW.sous_prefecture_id
    ))
    WHERE c.id = NEW.commune_id
      AND c.province_id = d.province_id
      AND (
          NEW.sous_prefecture_id IS NULL
          OR EXISTS (
              SELECT 1 FROM sous_prefectures sp
              WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = d.id
          )
      )
)
OR (NEW.date_fin_validite IS NOT NULL AND NEW.date_fin_validite < NEW.date_debut_validite)
BEGIN
    SELECT RAISE(ABORT, 'Rattachement territorial incohérent avec la province, le département ou la sous-préfecture.');
END;

CREATE TRIGGER verifier_localite_avant_insertion
BEFORE INSERT ON localites
WHEN NOT EXISTS (
    SELECT 1 FROM departements d
    WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
)
OR (
    NEW.sous_prefecture_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sous_prefectures sp
        WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id
    )
)
OR (
    NEW.commune_id IS NOT NULL
    AND (
        NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id)
        OR NOT EXISTS (
            SELECT 1 FROM rattachements_territoriaux rt
            WHERE rt.commune_id = NEW.commune_id
              AND rt.departement_id = NEW.departement_id
              AND rt.date_debut_validite <= COALESCE(NEW.date_effet, date('now'))
              AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= COALESCE(NEW.date_effet, date('now')))
              AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
        )
    )
)
OR (
    NEW.canton_id IS NOT NULL
    AND (
        NEW.sous_prefecture_id IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM cantons ca
            WHERE ca.id = NEW.canton_id AND ca.sous_prefecture_id = NEW.sous_prefecture_id
        )
    )
)
OR (NEW.type_localite = 'VILLE' AND NEW.mode_decoupage_urbain = 'AUCUN')
OR (NEW.type_localite <> 'VILLE' AND NEW.mode_decoupage_urbain <> 'AUCUN')
BEGIN
    SELECT RAISE(ABORT, 'Localité incohérente avec son département, sa sous-préfecture, sa commune, son canton ou son découpage urbain.');
END;

CREATE TRIGGER verifier_localite_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id, canton_id, type_localite, mode_decoupage_urbain ON localites
WHEN NOT EXISTS (
    SELECT 1 FROM departements d
    WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
)
OR (
    NEW.sous_prefecture_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sous_prefectures sp
        WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id
    )
)
OR (
    NEW.commune_id IS NOT NULL
    AND (
        NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id)
        OR NOT EXISTS (
            SELECT 1 FROM rattachements_territoriaux rt
            WHERE rt.commune_id = NEW.commune_id
              AND rt.departement_id = NEW.departement_id
              AND rt.date_debut_validite <= COALESCE(NEW.date_effet, date('now'))
              AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= COALESCE(NEW.date_effet, date('now')))
              AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
        )
    )
)
OR (
    NEW.canton_id IS NOT NULL
    AND (
        NEW.sous_prefecture_id IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM cantons ca
            WHERE ca.id = NEW.canton_id AND ca.sous_prefecture_id = NEW.sous_prefecture_id
        )
    )
)
OR (NEW.type_localite = 'VILLE' AND NEW.mode_decoupage_urbain = 'AUCUN')
OR (NEW.type_localite <> 'VILLE' AND NEW.mode_decoupage_urbain <> 'AUCUN')
BEGIN
    SELECT RAISE(ABORT, 'Localité incohérente avec son département, sa sous-préfecture, sa commune, son canton ou son découpage urbain.');
END;

CREATE TRIGGER verifier_arrondissement_avant_insertion
BEFORE INSERT ON arrondissements
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
      AND (NEW.commune_id IS NULL OR NEW.commune_id = l.commune_id)
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'VALIDE', 'REJETE', 'ARCHIVE')
BEGIN
    SELECT RAISE(ABORT, 'Un arrondissement doit appartenir à une ville divisée en arrondissements.');
END;

CREATE TRIGGER verifier_arrondissement_avant_mise_a_jour
BEFORE UPDATE OF localite_id, commune_id, statut_validation ON arrondissements
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
      AND (NEW.commune_id IS NULL OR NEW.commune_id = l.commune_id)
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'VALIDE', 'REJETE', 'ARCHIVE')
BEGIN
    SELECT RAISE(ABORT, 'Un arrondissement doit appartenir à une ville divisée en arrondissements.');
END;

CREATE TRIGGER verifier_quartier_avant_insertion
BEFORE INSERT ON quartiers
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND (
          (l.mode_decoupage_urbain = 'SANS_ARRONDISSEMENT' AND NEW.arrondissement_id IS NULL)
          OR (
              l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
              AND NEW.arrondissement_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM arrondissements a
                  WHERE a.id = NEW.arrondissement_id AND a.localite_id = l.id
              )
          )
      )
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'VALIDE', 'REJETE')
OR NEW.possede_carres NOT IN (0, 1)
BEGIN
    SELECT RAISE(ABORT, 'Le quartier ne correspond pas à la ville et à son découpage en arrondissements.');
END;

CREATE TRIGGER verifier_quartier_avant_mise_a_jour
BEFORE UPDATE OF localite_id, arrondissement_id, statut_validation, possede_carres ON quartiers
WHEN NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id
      AND l.type_localite = 'VILLE'
      AND (
          (l.mode_decoupage_urbain = 'SANS_ARRONDISSEMENT' AND NEW.arrondissement_id IS NULL)
          OR (
              l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
              AND NEW.arrondissement_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM arrondissements a
                  WHERE a.id = NEW.arrondissement_id AND a.localite_id = l.id
              )
          )
      )
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'VALIDE', 'REJETE')
OR NEW.possede_carres NOT IN (0, 1)
BEGIN
    SELECT RAISE(ABORT, 'Le quartier ne correspond pas à la ville et à son découpage en arrondissements.');
END;

CREATE TRIGGER verifier_carre_avant_insertion
BEFORE INSERT ON carres
WHEN NOT EXISTS (
    SELECT 1 FROM quartiers q
    WHERE q.id = NEW.quartier_id AND q.possede_carres = 1
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'VALIDE', 'REJETE')
BEGIN
    SELECT RAISE(ABORT, 'Le carré doit être rattaché à un quartier qui possède des carrés.');
END;

CREATE TRIGGER verifier_carre_avant_mise_a_jour
BEFORE UPDATE OF quartier_id, statut_validation ON carres
WHEN NOT EXISTS (
    SELECT 1 FROM quartiers q
    WHERE q.id = NEW.quartier_id AND q.possede_carres = 1
)
OR NEW.statut_validation NOT IN ('PROPOSE', 'VALIDE', 'REJETE')
BEGIN
    SELECT RAISE(ABORT, 'Le carré doit être rattaché à un quartier qui possède des carrés.');
END;

CREATE TRIGGER verifier_site_humanitaire_avant_insertion
BEFORE INSERT ON sites_humanitaires
WHEN NOT EXISTS (
    SELECT 1 FROM departements d
    WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
)
OR (
    NEW.sous_prefecture_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sous_prefectures sp
        WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id
    )
)
OR (
    NEW.commune_id IS NOT NULL
    AND (
        NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id)
        OR NOT EXISTS (
            SELECT 1 FROM rattachements_territoriaux rt
            WHERE rt.commune_id = NEW.commune_id
              AND rt.departement_id = NEW.departement_id
              AND rt.date_debut_validite <= date('now')
              AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
              AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
        )
    )
)
OR (
    NEW.localite_proche_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM localites l
        WHERE l.id = NEW.localite_proche_id
          AND l.province_id = NEW.province_id
          AND l.departement_id = NEW.departement_id
          AND (NEW.sous_prefecture_id IS NULL OR l.sous_prefecture_id = NEW.sous_prefecture_id)
          AND (NEW.commune_id IS NULL OR l.commune_id = NEW.commune_id)
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');
END;

CREATE TRIGGER verifier_site_humanitaire_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id ON sites_humanitaires
WHEN NOT EXISTS (
    SELECT 1 FROM departements d
    WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
)
OR (
    NEW.sous_prefecture_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sous_prefectures sp
        WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id
    )
)
OR (
    NEW.commune_id IS NOT NULL
    AND (
        NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id)
        OR NOT EXISTS (
            SELECT 1 FROM rattachements_territoriaux rt
            WHERE rt.commune_id = NEW.commune_id
              AND rt.departement_id = NEW.departement_id
              AND rt.date_debut_validite <= date('now')
              AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
              AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
        )
    )
)
OR (
    NEW.localite_proche_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM localites l
        WHERE l.id = NEW.localite_proche_id
          AND l.province_id = NEW.province_id
          AND l.departement_id = NEW.departement_id
          AND (NEW.sous_prefecture_id IS NULL OR l.sous_prefecture_id = NEW.sous_prefecture_id)
          AND (NEW.commune_id IS NULL OR l.commune_id = NEW.commune_id)
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');
END;
