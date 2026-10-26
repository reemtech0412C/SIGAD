PRAGMA foreign_keys = OFF;

-- 1. Qualification et traçabilité des départements
ALTER TABLE departements ADD COLUMN statut_validation TEXT NOT NULL DEFAULT 'A_VERIFIER' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'ARCHIVE'));
ALTER TABLE departements ADD COLUMN source_officielle TEXT DEFAULT 'INSEED 2024 / Inventaire territorial provisoire';

-- 2. Suppression temporaire des déclencheurs dépendants pour permettre la restructuration
DROP TRIGGER IF EXISTS verifier_localite_avant_insertion;
DROP TRIGGER IF EXISTS verifier_localite_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_arrondissement_avant_insertion;
DROP TRIGGER IF EXISTS verifier_arrondissement_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_quartier_avant_insertion;
DROP TRIGGER IF EXISTS verifier_quartier_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_site_humanitaire_avant_insertion;
DROP TRIGGER IF EXISTS verifier_site_humanitaire_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_menage_avant_insertion;
DROP TRIGGER IF EXISTS verifier_menage_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_signalement_doublon_avant_insertion;
DROP TRIGGER IF EXISTS verifier_signalement_doublon_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_entrepot_avant_insertion;
DROP TRIGGER IF EXISTS verifier_entrepot_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_zone_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_menage_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_allocation_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_remise_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_modification_distribution_apres_validation;
DROP TRIGGER IF EXISTS figer_menages_distribution_valides;
DROP TRIGGER IF EXISTS figer_modification_menage_distribution;
DROP TRIGGER IF EXISTS figer_suppression_menage_distribution;
DROP TRIGGER IF EXISTS verifier_statut_menage_distribution;
DROP TRIGGER IF EXISTS verifier_cloture_distribution_avant_insertion;
DROP TRIGGER IF EXISTS verifier_inscription_beneficiaire_avant_insertion;
DROP TRIGGER IF EXISTS verifier_inscription_beneficiaire_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_statut_validation_menage_avant_insertion;
DROP TRIGGER IF EXISTS verifier_statut_validation_menage_avant_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_confirmation_distincte_avant_mise_a_jour;
DROP TRIGGER IF EXISTS appliquer_confirmation_distincte_apres_mise_a_jour;
DROP TRIGGER IF EXISTS journaliser_validation_menage_apres_mise_a_jour;
DROP TRIGGER IF EXISTS verifier_signalement_ouvert_avant_insertion;
DROP TRIGGER IF EXISTS verifier_doublon_menage_concurrent_apres_insertion;

-- 3. Recréation de la table localites (departement_id nullable pour N'Djamena et rattachements directs)
CREATE TABLE localites_nouvelle (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    canton_id TEXT REFERENCES cantons(id),
    nom TEXT NOT NULL,
    type_localite TEXT NOT NULL CHECK (type_localite IN ('VILLE', 'VILLAGE', 'FERRICK', 'CAMPEMENT')),
    mode_decoupage_urbain TEXT NOT NULL DEFAULT 'AUCUN' CHECK (mode_decoupage_urbain IN ('AUCUN', 'SANS_ARRONDISSEMENT', 'AVEC_ARRONDISSEMENTS')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE')),
    source_documentation TEXT,
    date_effet TEXT,
    propose_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO localites_nouvelle SELECT id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id, nom, type_localite, mode_decoupage_urbain, statut_validation, source_documentation, date_effet, propose_par, valide_par, cree_le FROM localites;
DROP TABLE localites;
ALTER TABLE localites_nouvelle RENAME TO localites;

-- 4. Recréation de la table sites_humanitaires (departement_id nullable)
CREATE TABLE sites_humanitaires_nouvelle (
    id TEXT PRIMARY KEY,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    localite_proche_id TEXT REFERENCES localites(id),
    code_site TEXT UNIQUE,
    nom TEXT NOT NULL,
    categorie_site TEXT NOT NULL CHECK (categorie_site IN ('CAMP_REFUGIES', 'SITE_DEPLACES', 'CENTRE_ACCUEIL', 'SITE_TRANSIT', 'AUTRE_SITE')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'FERME')),
    propose_par TEXT REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO sites_humanitaires_nouvelle SELECT id, province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id, code_site, nom, categorie_site, statut_validation, propose_par, cree_le FROM sites_humanitaires;
DROP TABLE sites_humanitaires;
ALTER TABLE sites_humanitaires_nouvelle RENAME TO sites_humanitaires;

-- 5. Recréation de la table menages (departement_id nullable)
CREATE TABLE menages_nouvelle (
    id TEXT PRIMARY KEY,
    code_menage TEXT NOT NULL UNIQUE,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    departement_id TEXT REFERENCES departements(id),
    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),
    commune_id TEXT REFERENCES communes(id),
    localite_id TEXT REFERENCES localites(id),
    arrondissement_id TEXT REFERENCES arrondissements(id),
    quartier_id TEXT REFERENCES quartiers(id),
    carre_id TEXT REFERENCES carres(id),
    site_humanitaire_id TEXT REFERENCES sites_humanitaires(id),
    nom_chef_menage TEXT NOT NULL,
    sexe_chef TEXT NOT NULL CHECK (sexe_chef IN ('M', 'F')),
    nombre_personnes INTEGER NOT NULL CHECK (nombre_personnes > 0),
    telephone TEXT,
    categorie_population_id TEXT NOT NULL REFERENCES categories_population(id),
    criteres_vulnerabilite TEXT,
    date_enregistrement TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF', 'DOUBLON_SUSPECTE', 'ARCHIVE')),
    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('VALIDE', 'A_VERIFIER', 'REJETE')),
    validation_decidee_par TEXT REFERENCES utilisateurs(id),
    validation_decidee_le TEXT,
    motif_validation TEXT
);
INSERT INTO menages_nouvelle SELECT id, code_menage, province_id, departement_id, sous_prefecture_id, commune_id, localite_id, arrondissement_id, quartier_id, carre_id, site_humanitaire_id, nom_chef_menage, sexe_chef, nombre_personnes, telephone, categorie_population_id, criteres_vulnerabilite, date_enregistrement, statut, cree_par, cree_le, statut_validation, validation_decidee_par, validation_decidee_le, motif_validation FROM menages;
DROP TABLE menages;
ALTER TABLE menages_nouvelle RENAME TO menages;

-- 6. Recréation des index
CREATE INDEX idx_menages_province_code ON menages(province_id, code_menage);
CREATE INDEX idx_menages_localisation ON menages(province_id, departement_id, localite_id, site_humanitaire_id);
CREATE INDEX idx_localites_province_statut_type_nom
    ON localites(province_id, statut_validation, type_localite, nom);
CREATE INDEX idx_sites_humanitaires_province_statut_nom
    ON sites_humanitaires(province_id, statut_validation, nom);
CREATE INDEX idx_menages_province_statut_date ON menages(province_id, statut, date_enregistrement DESC, id);
CREATE INDEX idx_menages_province_telephone ON menages(province_id, telephone, statut) WHERE telephone IS NOT NULL;
CREATE INDEX idx_menages_province_nom_localite ON menages(province_id, lower(trim(nom_chef_menage)), localite_id, statut);
CREATE INDEX idx_menages_province_date_id
  ON menages (province_id, date_enregistrement DESC, id);
CREATE INDEX idx_menages_province_validation_statut_date_id
ON menages(province_id, statut_validation, statut, date_enregistrement DESC, id);

-- 7. Déclencheurs adaptés avec prise en charge du statut particulier et des départements optionnels
CREATE TRIGGER verifier_localite_avant_insertion
BEFORE INSERT ON localites
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
OR (
    NEW.sous_prefecture_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sous_prefectures sp
        WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id)
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Rattachement territorial de la localité incohérent avec la province ou le département.');
END;

CREATE TRIGGER verifier_localite_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id ON localites
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Rattachement territorial de la localité incohérent avec la province ou le département.');
END;

CREATE TRIGGER verifier_site_humanitaire_avant_insertion
BEFORE INSERT ON sites_humanitaires
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');
END;

CREATE TRIGGER verifier_site_humanitaire_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id ON sites_humanitaires
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
BEGIN
    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');
END;

CREATE TRIGGER verifier_menage_avant_insertion
BEFORE INSERT ON menages
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)
OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sous_prefectures sp
    WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id) AND sp.actif = 1
))
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
      AND (NEW.departement_id IS NULL OR l.departement_id IS NULL OR l.departement_id = NEW.departement_id) AND l.statut_validation = 'VALIDE'
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
      AND (NEW.departement_id IS NULL OR s.departement_id IS NULL OR s.departement_id = NEW.departement_id) AND s.statut_validation = 'VALIDE'
))
BEGIN
    SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');
END;

CREATE TRIGGER verifier_menage_avant_mise_a_jour
BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id, localite_id,
  arrondissement_id, quartier_id, carre_id, site_humanitaire_id, categorie_population_id ON menages
WHEN (
    NEW.departement_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM departements d
        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1
    )
)
OR (
    NEW.departement_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1
    )
)
OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)
OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sous_prefectures sp
    WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id) AND sp.actif = 1
))
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM localites l
    WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
      AND (NEW.departement_id IS NULL OR l.departement_id IS NULL OR l.departement_id = NEW.departement_id) AND l.statut_validation = 'VALIDE'
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
      AND (NEW.departement_id IS NULL OR s.departement_id IS NULL OR s.departement_id = NEW.departement_id) AND s.statut_validation = 'VALIDE'
))
BEGIN
    SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');
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

CREATE TRIGGER verifier_zone_distribution_avant_insertion
BEFORE INSERT ON zones_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
)
OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM localites l
  INNER JOIN distributions_provinciales d ON d.id = NEW.distribution_id
  WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id
    AND l.departement_id = d.departement_id AND l.statut_validation = 'VALIDE'
))
OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM arrondissements a
  WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id
    AND a.statut_validation = 'VALIDE'
))
OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM quartiers q
  WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id
    AND q.arrondissement_id IS NEW.arrondissement_id AND q.statut_validation = 'VALIDE'
))
OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM carres c
  INNER JOIN quartiers q ON q.id = c.quartier_id
  WHERE c.id = NEW.carre_id AND c.quartier_id = NEW.quartier_id
    AND q.localite_id = NEW.localite_id AND q.statut_validation = 'VALIDE'
))
OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sites_humanitaires s
  INNER JOIN distributions_provinciales d ON d.id = NEW.distribution_id
  WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id
    AND s.departement_id = d.departement_id AND s.statut_validation = 'VALIDE'
))
BEGIN
  SELECT RAISE(ABORT, 'ZONE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_menage_distribution_avant_insertion
BEFORE INSERT ON menages_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION')
    AND m.province_id = NEW.province_id AND m.departement_id = d.departement_id
    AND m.statut = 'ACTIF'
)
OR (NEW.zone_distribution_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM zones_distribution z
  INNER JOIN menages m ON m.id = NEW.menage_id
  WHERE z.id = NEW.zone_distribution_id AND z.distribution_id = NEW.distribution_id
    AND z.province_id = NEW.province_id
    AND ((z.site_humanitaire_id IS NOT NULL AND m.site_humanitaire_id = z.site_humanitaire_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NOT NULL AND m.carre_id = z.carre_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NOT NULL AND m.quartier_id = z.quartier_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NULL AND z.arrondissement_id IS NOT NULL AND m.arrondissement_id = z.arrondissement_id)
      OR (z.site_humanitaire_id IS NULL AND z.carre_id IS NULL AND z.quartier_id IS NULL AND z.arrondissement_id IS NULL AND z.localite_id IS NOT NULL AND m.localite_id = z.localite_id))
))
BEGIN
  SELECT RAISE(ABORT, 'MENAGE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_allocation_distribution_avant_insertion
BEFORE INSERT ON allocations_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM menages_distribution md
  INNER JOIN articles_distribution ad ON ad.distribution_id = md.distribution_id
    AND ad.article_id = NEW.article_id
  WHERE md.id = NEW.menage_distribution_id
    AND md.distribution_id = NEW.distribution_id
    AND ad.distribution_id = NEW.distribution_id
    AND md.statut_service = 'EN_ATTENTE'
)
BEGIN
  SELECT RAISE(ABORT, 'ALLOCATION_DISTRIBUTION_INCOHERENTE');
END;

CREATE TRIGGER verifier_remise_distribution_avant_insertion
BEFORE INSERT ON remises_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN menages_distribution md ON md.id = NEW.menage_distribution_id
    AND md.distribution_id = d.id AND md.province_id = d.province_id
  INNER JOIN utilisateurs u ON u.id = NEW.agent_distributeur_id
    AND u.role = 'DELEGUE_PROVINCIAL' AND u.province_id = d.province_id AND u.statut = 'ACTIF'
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'EN_EXECUTION' AND md.statut_service IN ('EN_ATTENTE', 'PARTIELLEMENT_SERVI')
    AND md.menage_id = NEW.menage_id
)
BEGIN
  SELECT RAISE(ABORT, 'REMISE_DISTRIBUTION_HORS_PERIMETRE');
END;

CREATE TRIGGER verifier_modification_distribution_apres_validation
BEFORE UPDATE ON distributions_provinciales
WHEN OLD.statut IN ('VALIDEE_PROVINCE', 'EN_EXECUTION', 'TERMINEE_PROVINCE', 'CLOTUREE_CENTRAL')
  AND (NEW.reference_distribution <> OLD.reference_distribution
    OR NEW.intitule_distribution <> OLD.intitule_distribution
    OR NEW.province_id <> OLD.province_id
    OR NEW.departement_id <> OLD.departement_id
    OR NEW.sous_prefecture_id IS NOT OLD.sous_prefecture_id
    OR NEW.commune_id IS NOT OLD.commune_id
    OR NEW.nature_aide <> OLD.nature_aide
    OR NEW.bailleur_fonds_id IS NOT OLD.bailleur_fonds_id
    OR NEW.partenaire_execution_id IS NOT OLD.partenaire_execution_id
    OR NEW.objectif <> OLD.objectif
    OR NEW.nombre_menages_cibles <> OLD.nombre_menages_cibles
    OR NEW.nombre_personnes_cibles <> OLD.nombre_personnes_cibles
    OR NEW.date_prevue <> OLD.date_prevue
    OR NEW.entrepot_id <> OLD.entrepot_id
    OR NEW.liste_beneficiaires_id IS NOT OLD.liste_beneficiaires_id
    OR NEW.version_plan <> OLD.version_plan)
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_menages_distribution_valides
BEFORE INSERT ON menages_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = NEW.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_modification_menage_distribution
BEFORE UPDATE ON menages_distribution
WHEN (OLD.distribution_id <> NEW.distribution_id OR OLD.province_id <> NEW.province_id
    OR OLD.menage_id <> NEW.menage_id OR OLD.zone_distribution_id IS NOT NEW.zone_distribution_id)
  AND EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER figer_suppression_menage_distribution
BEFORE DELETE ON menages_distribution
WHEN EXISTS (SELECT 1 FROM distributions_provinciales d WHERE d.id = OLD.distribution_id AND d.statut NOT IN ('BROUILLON', 'EN_PREPARATION', 'RETOURNEE_POUR_CORRECTION'))
BEGIN
  SELECT RAISE(ABORT, 'PLAN_DISTRIBUTION_FIGE');
END;

CREATE TRIGGER verifier_statut_menage_distribution
BEFORE UPDATE OF statut_service ON menages_distribution
WHEN NEW.statut_service <> OLD.statut_service AND NOT (
  OLD.statut_service = 'EN_ATTENTE' AND NEW.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI', 'ABSENT', 'NON_SERVI')
  OR OLD.statut_service = 'PARTIELLEMENT_SERVI' AND NEW.statut_service IN ('SERVI', 'PARTIELLEMENT_SERVI')
)
BEGIN
  SELECT RAISE(ABORT, 'TRANSITION_STATUT_MENAGE_INVALIDE');
END;

CREATE TRIGGER verifier_cloture_distribution_avant_insertion
BEFORE INSERT ON clotures_distribution
WHEN NOT EXISTS (
  SELECT 1 FROM distributions_provinciales d
  INNER JOIN utilisateurs u ON u.id = NEW.cloture_par
    AND u.role = 'ADMIN_CENTRAL' AND u.statut = 'ACTIF'
  WHERE d.id = NEW.distribution_id AND d.province_id = NEW.province_id
    AND d.statut = 'CLOTUREE_CENTRAL' AND d.date_declaration_fin IS NOT NULL
)
OR NEW.pv_distribution_piece_id IS NULL
OR NOT EXISTS (
  SELECT 1 FROM pieces_jointes p
  WHERE p.id = NEW.pv_distribution_piece_id
    AND p.entite_liee_type = 'DISTRIBUTION_PROVINCIALE'
    AND p.entite_liee_id = NEW.distribution_id
    AND p.province_id = NEW.province_id
    AND p.categorie_document = 'PV_DISTRIBUTION'
)
OR NOT json_valid(NEW.bilan_articles_json)
OR EXISTS (
  SELECT 1 FROM menages_distribution md
  WHERE md.distribution_id = NEW.distribution_id AND md.province_id = NEW.province_id
    AND (md.statut_service = 'EN_ATTENTE'
      OR (md.statut_service = 'PARTIELLEMENT_SERVI'
        AND (md.motif_non_service IS NULL OR length(trim(md.motif_non_service)) = 0))
      OR (md.statut_service IN ('ABSENT', 'NON_SERVI')
        AND (md.motif_non_service IS NULL OR length(trim(md.motif_non_service)) = 0)))
)
OR EXISTS (
  SELECT 1 FROM demandes_correction dc
  WHERE dc.distribution_id = NEW.distribution_id
    AND dc.statut IN ('EN_ATTENTE_DELEGUE', 'CORRECTION_SOUMISE')
)
OR EXISTS (
  SELECT 1 FROM observations_controle o
  WHERE o.province_id = NEW.province_id AND o.statut = 'OUVERTE'
    AND o.niveau_gravite = 'CRITIQUE'
    AND (
      (o.operation_type = 'DISTRIBUTION_PROVINCIALE' AND o.operation_id = NEW.distribution_id)
      OR (o.operation_type = 'STOCK_PROVINCIAL' AND EXISTS (
        SELECT 1 FROM mouvements_stock m
        WHERE m.id = o.operation_id AND m.province_id = NEW.province_id
          AND (m.document_source_id = NEW.distribution_id
            OR (m.document_source_type = 'REMISE_DISTRIBUTION' AND EXISTS (
              SELECT 1 FROM remises_distribution rd
              WHERE rd.id = m.document_source_id AND rd.distribution_id = NEW.distribution_id
            )))
      ))
    )
)
OR EXISTS (
  SELECT 1 FROM reservations_stock r
  INNER JOIN lots_stock l ON l.id = r.lot_stock_id
  LEFT JOIN soldes_stock s ON s.entrepot_id = l.entrepot_id
    AND s.article_id = l.article_id AND s.province_id IS l.province_id
  WHERE r.distribution_id = NEW.distribution_id
    AND (
      abs(l.quantite_reservee - COALESCE((
        SELECT SUM(r2.quantite_reservee - r2.quantite_consommee - r2.quantite_liberee)
        FROM reservations_stock r2 WHERE r2.lot_stock_id = l.id AND r2.statut = 'ACTIVE'
      ), 0)) > 0.000001
      OR s.entrepot_id IS NULL
      OR abs(s.quantite_physique - COALESCE((
        SELECT SUM(l2.quantite_physique) FROM lots_stock l2
        WHERE l2.entrepot_id = l.entrepot_id AND l2.article_id = l.article_id
          AND l2.province_id IS l.province_id
      ), 0)) > 0.000001
      OR abs(s.quantite_reservee - COALESCE((
        SELECT SUM(l3.quantite_reservee) FROM lots_stock l3
        WHERE l3.entrepot_id = l.entrepot_id AND l3.article_id = l.article_id
          AND l3.province_id IS l.province_id
      ), 0)) > 0.000001
      OR abs(r.quantite_consommee - COALESCE((
        SELECT SUM(lr.quantite_remise) FROM lignes_remise lr
        INNER JOIN remises_distribution rd ON rd.id = lr.remise_id
        WHERE lr.reservation_id = r.id AND rd.distribution_id = NEW.distribution_id
      ), 0)) > 0.000001
    )
)
OR EXISTS (
  SELECT 1 FROM reservations_stock r
  WHERE r.distribution_id = NEW.distribution_id AND r.statut = 'ACTIVE'
    AND r.quantite_reservee - r.quantite_consommee - r.quantite_liberee > 0.000001
)
BEGIN
  SELECT RAISE(ABORT, 'CLOTURE_DISTRIBUTION_INCOMPLETE');
END;

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

PRAGMA foreign_keys = ON;

-- 8. Ville de N'Djaména et 10 arrondissements municipaux
INSERT INTO localites (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation, source_documentation)
VALUES ('loc-ndjamena-ville', 'prov-ndjamena', NULL, 'Ville de N''Djamena', 'VILLE', 'AVEC_ARRONDISSEMENTS', 'VALIDE', 'Loi organique 015/CNT/2024 et statut particulier');

INSERT INTO arrondissements (id, localite_id, code, nom, statut_validation) VALUES
('arr-ndj-1', 'loc-ndjamena-ville', 'ARR-NDJ-01', '1er Arrondissement', 'VALIDE'),
('arr-ndj-2', 'loc-ndjamena-ville', 'ARR-NDJ-02', '2e Arrondissement', 'VALIDE'),
('arr-ndj-3', 'loc-ndjamena-ville', 'ARR-NDJ-03', '3e Arrondissement', 'VALIDE'),
('arr-ndj-4', 'loc-ndjamena-ville', 'ARR-NDJ-04', '4e Arrondissement', 'VALIDE'),
('arr-ndj-5', 'loc-ndjamena-ville', 'ARR-NDJ-05', '5e Arrondissement', 'VALIDE'),
('arr-ndj-6', 'loc-ndjamena-ville', 'ARR-NDJ-06', '6e Arrondissement', 'VALIDE'),
('arr-ndj-7', 'loc-ndjamena-ville', 'ARR-NDJ-07', '7e Arrondissement', 'VALIDE'),
('arr-ndj-8', 'loc-ndjamena-ville', 'ARR-NDJ-08', '8e Arrondissement', 'VALIDE'),
('arr-ndj-9', 'loc-ndjamena-ville', 'ARR-NDJ-09', '9e Arrondissement', 'VALIDE'),
('arr-ndj-10', 'loc-ndjamena-ville', 'ARR-NDJ-10', '10e Arrondissement', 'VALIDE');

-- 9. Quartiers de référence de la Ville de N'Djaména (terminologie officielle strictement Quartier)
INSERT INTO quartiers (id, localite_id, arrondissement_id, nom, possede_carres, statut_validation) VALUES
('qrt-ndj-1-farcha', 'loc-ndjamena-ville', 'arr-ndj-1', 'Farcha', 1, 'VALIDE'),
('qrt-ndj-1-milezi', 'loc-ndjamena-ville', 'arr-ndj-1', 'Milezi', 0, 'VALIDE'),
('qrt-ndj-2-bololo', 'loc-ndjamena-ville', 'arr-ndj-2', 'Bololo', 1, 'VALIDE'),
('qrt-ndj-2-klemat', 'loc-ndjamena-ville', 'arr-ndj-2', 'Klémat', 0, 'VALIDE'),
('qrt-ndj-3-kabalaye', 'loc-ndjamena-ville', 'arr-ndj-3', 'Kabalaye', 1, 'VALIDE'),
('qrt-ndj-3-ardep-djoumal', 'loc-ndjamena-ville', 'arr-ndj-3', 'Ardep Djoumal', 0, 'VALIDE'),
('qrt-ndj-4-repos', 'loc-ndjamena-ville', 'arr-ndj-4', 'Repos', 1, 'VALIDE'),
('qrt-ndj-5-amriguebe', 'loc-ndjamena-ville', 'arr-ndj-5', 'Amriguébé', 1, 'VALIDE'),
('qrt-ndj-5-ridina', 'loc-ndjamena-ville', 'arr-ndj-5', 'Ridina', 0, 'VALIDE'),
('qrt-ndj-6-moursal', 'loc-ndjamena-ville', 'arr-ndj-6', 'Moursal', 1, 'VALIDE'),
('qrt-ndj-6-paris-congo', 'loc-ndjamena-ville', 'arr-ndj-6', 'Paris-Congo', 1, 'VALIDE'),
('qrt-ndj-7-chagoua', 'loc-ndjamena-ville', 'arr-ndj-7', 'Chagoua', 1, 'VALIDE'),
('qrt-ndj-7-dembe', 'loc-ndjamena-ville', 'arr-ndj-7', 'Dembé', 0, 'VALIDE'),
('qrt-ndj-8-diguel', 'loc-ndjamena-ville', 'arr-ndj-8', 'Diguel', 1, 'VALIDE'),
('qrt-ndj-8-ndjari', 'loc-ndjamena-ville', 'arr-ndj-8', 'N''Djari', 0, 'VALIDE'),
('qrt-ndj-9-walia', 'loc-ndjamena-ville', 'arr-ndj-9', 'Walia', 1, 'VALIDE'),
('qrt-ndj-9-toukra', 'loc-ndjamena-ville', 'arr-ndj-9', 'Toukra', 0, 'VALIDE'),
('qrt-ndj-10-gassi', 'loc-ndjamena-ville', 'arr-ndj-10', 'Gassi', 1, 'VALIDE'),
('qrt-ndj-10-gaoui', 'loc-ndjamena-ville', 'arr-ndj-10', 'Gaoui', 0, 'VALIDE');

-- 10. Seed des 112 départements candidats traçables (statut A_VERIFIER conformément aux règles d'intégrité)
INSERT INTO departements (id, province_id, code, nom, chef_lieu, actif, statut_validation, source_officielle) VALUES
('dep-barh-el-gazel-barh-el-gazel-nord', 'prov-barh-el-gazel', 'DEP-BARH-EL-GAZEL-BARH-EL-GAZEL-NORD', 'Barh El Gazel Nord', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-barh-el-gazel-barh-el-gazel-sud', 'prov-barh-el-gazel', 'DEP-BARH-EL-GAZEL-BARH-EL-GAZEL-SUD', 'Barh El Gazel Sud', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-barh-el-gazel-barh-el-gazel-ouest', 'prov-barh-el-gazel', 'DEP-BARH-EL-GAZEL-BARH-EL-GAZEL-OUEST', 'Barh El Gazel Ouest', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-barh-el-gazel-barh-el-gazel-est', 'prov-barh-el-gazel', 'DEP-BARH-EL-GAZEL-BARH-EL-GAZEL-EST', 'Barh El Gazel Est', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-barh-el-gazel-kleta', 'prov-barh-el-gazel', 'DEP-BARH-EL-GAZEL-KLETA', 'Kleta', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-batha-est', 'prov-batha', 'DEP-BATHA-BATHA-EST', 'Batha Est', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-batha-ouest', 'prov-batha', 'DEP-BATHA-BATHA-OUEST', 'Batha Ouest', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-fitri', 'prov-batha', 'DEP-BATHA-FITRI', 'Fitri', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-ouadi-rime', 'prov-batha', 'DEP-BATHA-OUADI-RIME', 'Ouadi Rimé', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-assinet', 'prov-batha', 'DEP-BATHA-ASSINET', 'Assinet', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-haraze', 'prov-batha', 'DEP-BATHA-HARAZE', 'Haraze', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-batha-djombo-djedid', 'prov-batha', 'DEP-BATHA-DJOMBO-DJEDID', 'Djombo Djedid', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-borkou-borkou', 'prov-borkou', 'DEP-BORKOU-BORKOU', 'Borkou', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-borkou-borkou-yala', 'prov-borkou', 'DEP-BORKOU-BORKOU-YALA', 'Borkou Yala', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-borkou-kouba', 'prov-borkou', 'DEP-BORKOU-KOUBA', 'Kouba', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-borkou-emi-koussi', 'prov-borkou', 'DEP-BORKOU-EMI-KOUSSI', 'Emi Koussi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-chari-baguirmi-baguirmi', 'prov-chari-baguirmi', 'DEP-CHARI-BAGUIRMI-BAGUIRMI', 'Baguirmi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-chari-baguirmi-chari', 'prov-chari-baguirmi', 'DEP-CHARI-BAGUIRMI-CHARI', 'Chari', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-chari-baguirmi-loug-chari', 'prov-chari-baguirmi', 'DEP-CHARI-BAGUIRMI-LOUG-CHARI', 'Loug Chari', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-chari-baguirmi-dourbali', 'prov-chari-baguirmi', 'DEP-CHARI-BAGUIRMI-DOURBALI', 'Dourbali', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-est-amdjarass', 'prov-ennedi-est', 'DEP-ENNEDI-EST-AMDJARASS', 'Amdjarass', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-est-wadi-hawar', 'prov-ennedi-est', 'DEP-ENNEDI-EST-WADI-HAWAR', 'Wadi Hawar', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-est-itou', 'prov-ennedi-est', 'DEP-ENNEDI-EST-ITOU', 'Itou', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-est-nohi', 'prov-ennedi-est', 'DEP-ENNEDI-EST-NOHI', 'Nohi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-est-bao', 'prov-ennedi-est', 'DEP-ENNEDI-EST-BAO', 'Bao', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-est-mourdi', 'prov-ennedi-est', 'DEP-ENNEDI-EST-MOURDI', 'Mourdi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-ouest-fada', 'prov-ennedi-ouest', 'DEP-ENNEDI-OUEST-FADA', 'Fada', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-ouest-mourtcha', 'prov-ennedi-ouest', 'DEP-ENNEDI-OUEST-MOURTCHA', 'Mourtcha', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-ouest-lac-ounianga', 'prov-ennedi-ouest', 'DEP-ENNEDI-OUEST-LAC-OUNIANGA', 'Lac Ounianga', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-ouest-tebi', 'prov-ennedi-ouest', 'DEP-ENNEDI-OUEST-TEBI', 'Tebi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-ouest-gouro', 'prov-ennedi-ouest', 'DEP-ENNEDI-OUEST-GOURO', 'Gouro', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ennedi-ouest-torbol', 'prov-ennedi-ouest', 'DEP-ENNEDI-OUEST-TORBOL', 'Torbol', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-guera-barh-signaka', 'prov-guera', 'DEP-GUERA-BARH-SIGNAKA', 'Barh Signaka', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-guera-guera', 'prov-guera', 'DEP-GUERA-GUERA', 'Guéra', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-guera-abtouyour', 'prov-guera', 'DEP-GUERA-ABTOUYOUR', 'Abtouyour', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-guera-mangalme', 'prov-guera', 'DEP-GUERA-MANGALME', 'Mangalmé', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-guera-garada', 'prov-guera', 'DEP-GUERA-GARADA', 'Garada', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-hadjer-lamis-dababa', 'prov-hadjer-lamis', 'DEP-HADJER-LAMIS-DABABA', 'Dababa', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-hadjer-lamis-dagana', 'prov-hadjer-lamis', 'DEP-HADJER-LAMIS-DAGANA', 'Dagana', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-hadjer-lamis-haraze-al-biar', 'prov-hadjer-lamis', 'DEP-HADJER-LAMIS-HARAZE-AL-BIAR', 'Haraze Al Biar', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-hadjer-lamis-ngoura', 'prov-hadjer-lamis', 'DEP-HADJER-LAMIS-NGOURA', 'Ngoura', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-kanem-nord-kanem', 'prov-kanem', 'DEP-KANEM-NORD-KANEM', 'Nord Kanem', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-kanem-kanem', 'prov-kanem', 'DEP-KANEM-KANEM', 'Kanem', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-kanem-sud-kanem', 'prov-kanem', 'DEP-KANEM-SUD-KANEM', 'Sud Kanem', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-lac-fouli', 'prov-lac', 'DEP-LAC-FOULI', 'Fouli', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-lac-kaya', 'prov-lac', 'DEP-LAC-KAYA', 'Kaya', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-lac-mamdi', 'prov-lac', 'DEP-LAC-MAMDI', 'Mamdi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-lac-wayi', 'prov-lac', 'DEP-LAC-WAYI', 'Wayi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-lac-doum-doum', 'prov-lac', 'DEP-LAC-DOUM-DOUM', 'Doum Doum', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-lac-kouloukime', 'prov-lac', 'DEP-LAC-KOULOUKIME', 'Kouloukimé', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-occidental-dodje', 'prov-logone-occidental', 'DEP-LOGONE-OCCIDENTAL-DODJE', 'Dodjé', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-occidental-lac-wey', 'prov-logone-occidental', 'DEP-LOGONE-OCCIDENTAL-LAC-WEY', 'Lac Wey', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-occidental-ngourkosso', 'prov-logone-occidental', 'DEP-LOGONE-OCCIDENTAL-NGOURKOSSO', 'Ngourkosso', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-occidental-gueni', 'prov-logone-occidental', 'DEP-LOGONE-OCCIDENTAL-GUENI', 'Guéni', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-oriental-nya-pende', 'prov-logone-oriental', 'DEP-LOGONE-ORIENTAL-NYA-PENDE', 'Nya Pendé', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-oriental-pende', 'prov-logone-oriental', 'DEP-LOGONE-ORIENTAL-PENDE', 'Pendé', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-oriental-monts-de-lam', 'prov-logone-oriental', 'DEP-LOGONE-ORIENTAL-MONTS-DE-LAM', 'Monts de Lam', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-oriental-nya', 'prov-logone-oriental', 'DEP-LOGONE-ORIENTAL-NYA', 'Nya', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-oriental-kouh-est', 'prov-logone-oriental', 'DEP-LOGONE-ORIENTAL-KOUH-EST', 'Kouh Est', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-logone-oriental-kouh-ouest', 'prov-logone-oriental', 'DEP-LOGONE-ORIENTAL-KOUH-OUEST', 'Kouh Ouest', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mandoul-barh-sara', 'prov-mandoul', 'DEP-MANDOUL-BARH-SARA', 'Barh Sara', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mandoul-mandoul-occidental', 'prov-mandoul', 'DEP-MANDOUL-MANDOUL-OCCIDENTAL', 'Mandoul Occidental', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mandoul-mandoul-oriental', 'prov-mandoul', 'DEP-MANDOUL-MANDOUL-ORIENTAL', 'Mandoul Oriental', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mandoul-goundi', 'prov-mandoul', 'DEP-MANDOUL-GOUNDI', 'Goundi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mandoul-taralnass', 'prov-mandoul', 'DEP-MANDOUL-TARALNASS', 'Taralnass', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mandoul-mandoul-central', 'prov-mandoul', 'DEP-MANDOUL-MANDOUL-CENTRAL', 'Mandoul Central', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-est-mayo-boneye', 'prov-mayo-kebbi-est', 'DEP-MAYO-KEBBI-EST-MAYO-BONEYE', 'Mayo-Boneye', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-est-kabbia', 'prov-mayo-kebbi-est', 'DEP-MAYO-KEBBI-EST-KABBIA', 'Kabbia', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-est-mont-d-illi', 'prov-mayo-kebbi-est', 'DEP-MAYO-KEBBI-EST-MONT-D-ILLI', 'Mont d’Illi', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-est-mayo-lemie', 'prov-mayo-kebbi-est', 'DEP-MAYO-KEBBI-EST-MAYO-LEMIE', 'Mayo-Lémié', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-ouest-lac-lere', 'prov-mayo-kebbi-ouest', 'DEP-MAYO-KEBBI-OUEST-LAC-LERE', 'Lac Léré', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-ouest-mayo-dallah', 'prov-mayo-kebbi-ouest', 'DEP-MAYO-KEBBI-OUEST-MAYO-DALLAH', 'Mayo-Dallah', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-ouest-mayo-binder', 'prov-mayo-kebbi-ouest', 'DEP-MAYO-KEBBI-OUEST-MAYO-BINDER', 'Mayo-Binder', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-ouest-el-ouaya', 'prov-mayo-kebbi-ouest', 'DEP-MAYO-KEBBI-OUEST-EL-OUAYA', 'El-Ouaya', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-ouest-gagal', 'prov-mayo-kebbi-ouest', 'DEP-MAYO-KEBBI-OUEST-GAGAL', 'Gagal', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-mayo-kebbi-ouest-nanaye', 'prov-mayo-kebbi-ouest', 'DEP-MAYO-KEBBI-OUEST-NANAYE', 'Nanaye', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-moyen-chari-barh-koh', 'prov-moyen-chari', 'DEP-MOYEN-CHARI-BARH-KOH', 'Barh Kôh', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-moyen-chari-grande-sido', 'prov-moyen-chari', 'DEP-MOYEN-CHARI-GRANDE-SIDO', 'Grande Sido', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-moyen-chari-lac-iro', 'prov-moyen-chari', 'DEP-MOYEN-CHARI-LAC-IRO', 'Lac Iro', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-moyen-chari-korbol', 'prov-moyen-chari', 'DEP-MOYEN-CHARI-KORBOL', 'Korbol', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-moyen-chari-la-moula', 'prov-moyen-chari', 'DEP-MOYEN-CHARI-LA-MOULA', 'La Moula', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-moyen-chari-bragoto', 'prov-moyen-chari', 'DEP-MOYEN-CHARI-BRAGOTO', 'Bragoto', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ouaddai-djourouf-al-ahmar', 'prov-ouaddai', 'DEP-OUADDAI-DJOUROUF-AL-AHMAR', 'Djourouf Al Ahmar', 'Am-Dam', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ouaddai-assoungha', 'prov-ouaddai', 'DEP-OUADDAI-ASSOUNGHA', 'Assoungha', 'Adré', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ouaddai-ouara', 'prov-ouaddai', 'DEP-OUADDAI-OUARA', 'Ouara', 'Abéché', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-ouaddai-abougoudam', 'prov-ouaddai', 'DEP-OUADDAI-ABOUGOUDAM', 'Abougoudam', 'Abougoudam', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-salamat-aboudeia', 'prov-salamat', 'DEP-SALAMAT-ABOUDEIA', 'Aboudeïa', 'Aboudeïa', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-salamat-barh-azoum', 'prov-salamat', 'DEP-SALAMAT-BARH-AZOUM', 'Barh Azoum', 'Am Timan', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-salamat-haraze-mangueigne', 'prov-salamat', 'DEP-SALAMAT-HARAZE-MANGUEIGNE', 'Haraze-Mangueigne', 'Haraze', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-sila-abdi', 'prov-sila', 'DEP-SILA-ABDI', 'Abdi', 'Abdi', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-sila-kimiti', 'prov-sila', 'DEP-SILA-KIMITI', 'Kimiti', 'Goz-Beïda', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-sila-tissi', 'prov-sila', 'DEP-SILA-TISSI', 'Tissi', 'Tissi', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-sila-ade', 'prov-sila', 'DEP-SILA-ADE', 'Adé', 'Adé', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-sila-koukou-angarana', 'prov-sila', 'DEP-SILA-KOUKOU-ANGARANA', 'Koukou-Angarana', 'Koukou-Angarana', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tandjile-tandjile-est', 'prov-tandjile', 'DEP-TANDJILE-TANDJILE-EST', 'Tandjilé Est', 'Laï', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tandjile-tandjile-ouest', 'prov-tandjile', 'DEP-TANDJILE-TANDJILE-OUEST', 'Tandjilé Ouest', 'Kélo', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tandjile-tandjile-centre', 'prov-tandjile', 'DEP-TANDJILE-TANDJILE-CENTRE', 'Tandjilé Centre', 'Béré', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tandjile-manga', 'prov-tandjile', 'DEP-TANDJILE-MANGA', 'Manga', 'Dono-Manga', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tandjile-manbague', 'prov-tandjile', 'DEP-TANDJILE-MANBAGUE', 'Manbagué', 'Dafra', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tibesti-bardai', 'prov-tibesti', 'DEP-TIBESTI-BARDAI', 'Bardaï', 'Bardaï', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tibesti-aouzou', 'prov-tibesti', 'DEP-TIBESTI-AOUZOU', 'Aouzou', 'Aouzou', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tibesti-zouar', 'prov-tibesti', 'DEP-TIBESTI-ZOUAR', 'Zouar', 'Zouar', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tibesti-wour', 'prov-tibesti', 'DEP-TIBESTI-WOUR', 'Wour', 'Wour', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tibesti-emi-koussi', 'prov-tibesti', 'DEP-TIBESTI-EMI-KOUSSI', 'Emi Koussi', 'Yébibou', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-tibesti-zoumri', 'prov-tibesti', 'DEP-TIBESTI-ZOUMRI', 'Zoumri', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-biltine', 'prov-wadi-fira', 'DEP-WADI-FIRA-BILTINE', 'Biltine', 'Biltine', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-dar-tama', 'prov-wadi-fira', 'DEP-WADI-FIRA-DAR-TAMA', 'Dar Tama', 'Guéréda', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-iriba', 'prov-wadi-fira', 'DEP-WADI-FIRA-IRIBA', 'Iriba', 'Iriba', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-megri', 'prov-wadi-fira', 'DEP-WADI-FIRA-MEGRI', 'Mégri', 'Matadjana', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-al-biher', 'prov-wadi-fira', 'DEP-WADI-FIRA-AL-BIHER', 'Al-Biher', 'Arada', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-dar-alfawakih', 'prov-wadi-fira', 'DEP-WADI-FIRA-DAR-ALFAWAKIH', 'Dar-Alfawakih', 'Am-Zoer', 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire'),
('dep-wadi-fira-tine', 'prov-wadi-fira', 'DEP-WADI-FIRA-TINE', 'Tiné', NULL, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire');
