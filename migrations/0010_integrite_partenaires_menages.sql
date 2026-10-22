PRAGMA foreign_keys = ON;

CREATE INDEX idx_partenaires_statut_nom ON partenaires(statut_validation, nom COLLATE NOCASE, id);
CREATE INDEX idx_partenaires_proposition_auteur ON partenaires(propose_par, statut_validation, cree_le DESC);
CREATE INDEX idx_roles_partenaires_role ON roles_partenaires(role, partenaire_id);
CREATE INDEX idx_menages_province_statut_date ON menages(province_id, statut, date_enregistrement DESC, id);
CREATE INDEX idx_menages_province_telephone ON menages(province_id, telephone, statut) WHERE telephone IS NOT NULL;
CREATE INDEX idx_menages_province_nom_localite ON menages(province_id, lower(trim(nom_chef_menage)), localite_id, statut);
CREATE INDEX idx_membres_menage_menage ON membres_menage(menage_id, id);
CREATE INDEX idx_listes_beneficiaires_province_statut ON listes_beneficiaires(province_id, statut, cree_le DESC, id);
CREATE INDEX idx_inscriptions_beneficiaires_liste_ordre ON inscriptions_beneficiaires(liste_id, ordre_affichage, menage_id);
CREATE INDEX idx_signalements_doublons_province_statut ON signalements_doublons(province_id, statut_traitement, cree_le DESC, id);

CREATE TRIGGER verifier_partenaire_propose_avant_insertion
BEFORE INSERT ON partenaires
WHEN NEW.statut_validation = 'PROPOSE'
 AND NOT EXISTS (
   SELECT 1 FROM utilisateurs u
   WHERE u.id = NEW.propose_par AND u.role = 'DELEGUE_PROVINCIAL' AND u.statut = 'ACTIF'
 )
BEGIN
  SELECT RAISE(ABORT, 'Une proposition de partenaire doit provenir d’un délégué provincial actif.');
END;

CREATE TRIGGER verifier_partenaire_valide_avant_insertion
BEFORE INSERT ON partenaires
WHEN NEW.statut_validation = 'VALIDE'
 AND NOT EXISTS (
   SELECT 1 FROM utilisateurs u
   WHERE u.id = NEW.valide_par AND u.role IN ('ADMIN_CENTRAL', 'PROPRIETAIRE') AND u.statut = 'ACTIF'
 )
BEGIN
  SELECT RAISE(ABORT, 'La validation d’un partenaire relève de l’administration centrale.');
END;

CREATE TRIGGER verifier_partenaire_validation_avant_mise_a_jour
BEFORE UPDATE OF statut_validation, valide_par ON partenaires
WHEN NEW.statut_validation = 'VALIDE'
 AND (OLD.statut_validation <> 'VALIDE' OR NEW.valide_par IS NOT OLD.valide_par)
 AND NOT EXISTS (
   SELECT 1 FROM utilisateurs u
   WHERE u.id = NEW.valide_par AND u.role IN ('ADMIN_CENTRAL', 'PROPRIETAIRE') AND u.statut = 'ACTIF'
 )
BEGIN
  SELECT RAISE(ABORT, 'La validation d’un partenaire relève de l’administration centrale.');
END;

CREATE TRIGGER verifier_menage_avant_insertion
BEFORE INSERT ON menages
WHEN NOT EXISTS (
       SELECT 1 FROM departements d
       WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1
     )
  OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)
  OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM sous_prefectures sp
       WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id AND sp.actif = 1
     ))
  OR (NEW.commune_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM communes c
       WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id AND c.actif = 1 AND c.statut_validation = 'VALIDE'
         AND EXISTS (
           SELECT 1 FROM rattachements_territoriaux rt
           WHERE rt.commune_id = c.id AND rt.departement_id = NEW.departement_id
             AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
             AND rt.date_debut_validite <= date('now')
             AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
         )
     ))
  OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM localites l
       WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
         AND l.departement_id = NEW.departement_id AND l.statut_validation = 'VALIDE'
         AND (l.sous_prefecture_id IS NULL OR l.sous_prefecture_id = NEW.sous_prefecture_id)
         AND (l.commune_id IS NULL OR l.commune_id = NEW.commune_id)
     ))
  OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM arrondissements a
       INNER JOIN localites l ON l.id = a.localite_id
       WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id
         AND a.statut_validation = 'VALIDE' AND l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
     ))
  OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM quartiers q
       WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id AND q.statut_validation = 'VALIDE'
         AND q.arrondissement_id IS NEW.arrondissement_id
     ))
  OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM carres ca
       INNER JOIN quartiers q ON q.id = ca.quartier_id
       WHERE ca.id = NEW.carre_id AND q.id = NEW.quartier_id AND ca.statut_validation = 'VALIDE'
     ))
  OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM sites_humanitaires s
       WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
         AND s.departement_id = NEW.departement_id AND s.statut_validation = 'VALIDE'
         AND (s.sous_prefecture_id IS NULL OR s.sous_prefecture_id = NEW.sous_prefecture_id)
         AND (s.commune_id IS NULL OR s.commune_id = NEW.commune_id)
         AND (s.localite_proche_id IS NULL OR s.localite_proche_id = NEW.localite_id)
     ))
BEGIN
  SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');
END;

CREATE TRIGGER verifier_menage_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id, localite_id,
  arrondissement_id, quartier_id, carre_id, site_humanitaire_id, categorie_population_id ON menages
WHEN NOT EXISTS (
       SELECT 1 FROM departements d
       WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1
     )
  OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)
  OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM sous_prefectures sp
       WHERE sp.id = NEW.sous_prefecture_id AND sp.departement_id = NEW.departement_id AND sp.actif = 1
     ))
  OR (NEW.commune_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM communes c
       WHERE c.id = NEW.commune_id AND c.province_id = NEW.province_id AND c.actif = 1 AND c.statut_validation = 'VALIDE'
         AND EXISTS (
           SELECT 1 FROM rattachements_territoriaux rt
           WHERE rt.commune_id = c.id AND rt.departement_id = NEW.departement_id
             AND (NEW.sous_prefecture_id IS NULL OR rt.sous_prefecture_id = NEW.sous_prefecture_id)
             AND rt.date_debut_validite <= date('now')
             AND (rt.date_fin_validite IS NULL OR rt.date_fin_validite >= date('now'))
         )
     ))
  OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM localites l
       WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
         AND l.departement_id = NEW.departement_id AND l.statut_validation = 'VALIDE'
         AND (l.sous_prefecture_id IS NULL OR l.sous_prefecture_id = NEW.sous_prefecture_id)
         AND (l.commune_id IS NULL OR l.commune_id = NEW.commune_id)
     ))
  OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM arrondissements a
       INNER JOIN localites l ON l.id = a.localite_id
       WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id
         AND a.statut_validation = 'VALIDE' AND l.mode_decoupage_urbain = 'AVEC_ARRONDISSEMENTS'
     ))
  OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM quartiers q
       WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id AND q.statut_validation = 'VALIDE'
         AND q.arrondissement_id IS NEW.arrondissement_id
     ))
  OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM carres ca
       INNER JOIN quartiers q ON q.id = ca.quartier_id
       WHERE ca.id = NEW.carre_id AND q.id = NEW.quartier_id AND ca.statut_validation = 'VALIDE'
     ))
  OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM sites_humanitaires s
       WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
         AND s.departement_id = NEW.departement_id AND s.statut_validation = 'VALIDE'
         AND (s.sous_prefecture_id IS NULL OR s.sous_prefecture_id = NEW.sous_prefecture_id)
         AND (s.commune_id IS NULL OR s.commune_id = NEW.commune_id)
         AND (s.localite_proche_id IS NULL OR s.localite_proche_id = NEW.localite_id)
     ))
BEGIN
  SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');
END;

CREATE TRIGGER verifier_inscription_beneficiaire_avant_insertion
BEFORE INSERT ON inscriptions_beneficiaires
WHEN NOT EXISTS (
  SELECT 1 FROM listes_beneficiaires lb INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE lb.id = NEW.liste_id AND lb.province_id = m.province_id
    AND lb.statut <> 'VERROUILLEE' AND m.statut = 'ACTIF'
)
BEGIN
  SELECT RAISE(ABORT, 'La liste et le ménage doivent relever de la même province et être actifs.');
END;

CREATE TRIGGER verifier_inscription_beneficiaire_avant_mise_a_jour
BEFORE UPDATE OF liste_id, menage_id ON inscriptions_beneficiaires
WHEN NOT EXISTS (
  SELECT 1 FROM listes_beneficiaires lb INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE lb.id = NEW.liste_id AND lb.province_id = m.province_id
    AND lb.statut <> 'VERROUILLEE' AND m.statut = 'ACTIF'
)
BEGIN
  SELECT RAISE(ABORT, 'La liste et le ménage doivent relever de la même province et être actifs.');
END;

CREATE TRIGGER verifier_signalement_doublon_avant_insertion
BEFORE INSERT ON signalements_doublons
WHEN NEW.menage_source_id = NEW.menage_suspect_id
  OR NOT EXISTS (
    SELECT 1 FROM menages source INNER JOIN menages suspect
      ON suspect.id = NEW.menage_suspect_id AND suspect.province_id = source.province_id
    WHERE source.id = NEW.menage_source_id AND source.province_id = NEW.province_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Un signalement de doublon doit relier deux ménages distincts de la même province.');
END;

CREATE TRIGGER verifier_signalement_doublon_avant_mise_a_jour
BEFORE UPDATE OF province_id, menage_source_id, menage_suspect_id ON signalements_doublons
WHEN NEW.menage_source_id = NEW.menage_suspect_id
  OR NOT EXISTS (
    SELECT 1 FROM menages source INNER JOIN menages suspect
      ON suspect.id = NEW.menage_suspect_id AND suspect.province_id = source.province_id
    WHERE source.id = NEW.menage_source_id AND source.province_id = NEW.province_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Un signalement de doublon doit relier deux ménages distincts de la même province.');
END;

CREATE TRIGGER verifier_affectation_partenaire_avant_insertion
BEFORE INSERT ON affectations_partenaires
WHEN NOT EXISTS (
  SELECT 1 FROM roles_partenaires rp
  WHERE rp.partenaire_id = NEW.partenaire_id AND rp.role = NEW.role
)
BEGIN
  SELECT RAISE(ABORT, 'Le partenaire ne possède pas le rôle affecté à cette opération.');
END;

CREATE TRIGGER verifier_affectation_partenaire_avant_mise_a_jour
BEFORE UPDATE OF partenaire_id, role ON affectations_partenaires
WHEN NOT EXISTS (
  SELECT 1 FROM roles_partenaires rp
  WHERE rp.partenaire_id = NEW.partenaire_id AND rp.role = NEW.role
)
BEGIN
  SELECT RAISE(ABORT, 'Le partenaire ne possède pas le rôle affecté à cette opération.');
END;

INSERT INTO categories_population (id, code, libelle, description) VALUES
  ('cat-pop-autochtone', 'AUTOCHTONE', 'Population autochtone', NULL),
  ('cat-pop-deplace-interne', 'DEPLACE_INTERNE', 'Personne déplacée interne', NULL),
  ('cat-pop-refugie', 'REFUGIE', 'Réfugié', NULL),
  ('cat-pop-retourne', 'RETOURNE', 'Personne retournée', NULL),
  ('cat-pop-hote-vulnerable', 'HOTE_VULNERABLE', 'Ménage hôte vulnérable', NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO vulnerabilites (id, code, libelle, niveau_priorite) VALUES
  ('vul-femme-chef-menage', 'FEMME_CHEF_MENAGE', 'Femme cheffe de ménage', 1),
  ('vul-handicap', 'HANDICAP', 'Personne en situation de handicap', 1),
  ('vul-personne-agee', 'PERSONNE_AGEE', 'Personne âgée', 1),
  ('vul-enfant-non-accompagne', 'ENFANT_NON_ACCOMPAGNE', 'Enfant non accompagné', 1),
  ('vul-malnutrition', 'MALNUTRITION', 'Situation de malnutrition', 1)
ON CONFLICT(id) DO NOTHING;
