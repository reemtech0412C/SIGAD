import sqlite3
import glob
import openpyxl
import re

# 1. Load candidate departments from excel
wb = openpyxl.load_workbook(r'c:\Users\Lenovo\Downloads\sigad_referentiel_territorial_recherche_2026.xlsx')
ws = wb['Départements à vérifier']
PROV_MAP = {
    'Barh El Gazel': 'prov-barh-el-gazel',
    'Batha': 'prov-batha',
    'Borkou': 'prov-borkou',
    'Chari-Baguirmi': 'prov-chari-baguirmi',
    'Ennedi Est': 'prov-ennedi-est',
    'Ennedi Ouest': 'prov-ennedi-ouest',
    'Guéra': 'prov-guera',
    'Hadjer-Lamis': 'prov-hadjer-lamis',
    'Kanem': 'prov-kanem',
    'Lac': 'prov-lac',
    'Logone Occidental': 'prov-logone-occidental',
    'Logone Oriental': 'prov-logone-oriental',
    'Mandoul': 'prov-mandoul',
    'Mayo-Kebbi Est': 'prov-mayo-kebbi-est',
    'Mayo-Kebbi Ouest': 'prov-mayo-kebbi-ouest',
    'Moyen-Chari': 'prov-moyen-chari',
    'Ouaddaï': 'prov-ouaddai',
    'Salamat': 'prov-salamat',
    'Sila': 'prov-sila',
    'Tandjilé': 'prov-tandjile',
    'Tibesti': 'prov-tibesti',
    'Wadi Fira': 'prov-wadi-fira'
}

def slug(text):
    text = text.lower()
    text = re.sub(r'[éèê]', 'e', text)
    text = re.sub(r'[àâ]', 'a', text)
    text = re.sub(r'[ïî]', 'i', text)
    text = re.sub(r'[ôö]', 'o', text)
    text = re.sub(r'[ùûü]', 'u', text)
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text

# Load 0001 to 0027 to capture all triggers and tables
con = sqlite3.connect(':memory:')
for f in sorted(glob.glob('migrations/*.sql')):
    if '0028' in f:
        continue
    with open(f, encoding='utf-8') as mf:
        con.executescript(mf.read())

cur = con.cursor()

# Get all indexes on tables being recreated
cur.execute("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('localites', 'sites_humanitaires', 'menages') AND sql IS NOT NULL")
indexes_to_recreate = cur.fetchall()
cur.execute("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'")
all_triggers = dict(cur.fetchall())

triggers_to_drop = []
for name, sql in all_triggers.items():
    s = sql.lower()
    if 'localites' in s or 'sites_humanitaires' in s or 'menages' in s:
        triggers_to_drop.append(name)

lines = [
    'PRAGMA foreign_keys = OFF;',
    '',
    '-- 1. Qualification et traçabilité des départements',
    "ALTER TABLE departements ADD COLUMN statut_validation TEXT NOT NULL DEFAULT 'A_VERIFIER' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'ARCHIVE'));",
    "ALTER TABLE departements ADD COLUMN source_officielle TEXT DEFAULT 'INSEED 2024 / Inventaire territorial provisoire';",
    '',
    '-- 2. Suppression temporaire des déclencheurs dépendants pour permettre la restructuration',
]

for t in triggers_to_drop:
    if t in all_triggers:
        lines.append(f'DROP TRIGGER IF EXISTS {t};')

lines.extend([
    '',
    "-- 3. Recréation de la table localites (departement_id nullable pour N'Djamena et rattachements directs)",
    'CREATE TABLE localites_nouvelle (',
    '    id TEXT PRIMARY KEY,',
    '    province_id TEXT NOT NULL REFERENCES provinces(id),',
    '    departement_id TEXT REFERENCES departements(id),',
    '    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),',
    '    commune_id TEXT REFERENCES communes(id),',
    '    canton_id TEXT REFERENCES cantons(id),',
    '    nom TEXT NOT NULL,',
    "    type_localite TEXT NOT NULL CHECK (type_localite IN ('VILLE', 'VILLAGE', 'FERRICK', 'CAMPEMENT')),",
    "    mode_decoupage_urbain TEXT NOT NULL DEFAULT 'AUCUN' CHECK (mode_decoupage_urbain IN ('AUCUN', 'SANS_ARRONDISSEMENT', 'AVEC_ARRONDISSEMENTS')),",
    "    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'REJETE')),",
    '    source_documentation TEXT,',
    '    date_effet TEXT,',
    '    propose_par TEXT REFERENCES utilisateurs(id),',
    '    valide_par TEXT REFERENCES utilisateurs(id),',
    "    cree_le TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'INSERT INTO localites_nouvelle SELECT id, province_id, departement_id, sous_prefecture_id, commune_id, canton_id, nom, type_localite, mode_decoupage_urbain, statut_validation, source_documentation, date_effet, propose_par, valide_par, cree_le FROM localites;',
    'DROP TABLE localites;',
    'ALTER TABLE localites_nouvelle RENAME TO localites;',
    '',
    '-- 4. Recréation de la table sites_humanitaires (departement_id nullable)',
    'CREATE TABLE sites_humanitaires_nouvelle (',
    '    id TEXT PRIMARY KEY,',
    '    province_id TEXT NOT NULL REFERENCES provinces(id),',
    '    departement_id TEXT REFERENCES departements(id),',
    '    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),',
    '    commune_id TEXT REFERENCES communes(id),',
    '    localite_proche_id TEXT REFERENCES localites(id),',
    '    code_site TEXT UNIQUE,',
    '    nom TEXT NOT NULL,',
    "    categorie_site TEXT NOT NULL CHECK (categorie_site IN ('CAMP_REFUGIES', 'SITE_DEPLACES', 'CENTRE_ACCUEIL', 'SITE_TRANSIT', 'AUTRE_SITE')),",
    "    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('PROPOSE', 'A_VERIFIER', 'VALIDE', 'FERME')),",
    '    propose_par TEXT REFERENCES utilisateurs(id),',
    "    cree_le TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'INSERT INTO sites_humanitaires_nouvelle SELECT id, province_id, departement_id, sous_prefecture_id, commune_id, localite_proche_id, code_site, nom, categorie_site, statut_validation, propose_par, cree_le FROM sites_humanitaires;',
    'DROP TABLE sites_humanitaires;',
    'ALTER TABLE sites_humanitaires_nouvelle RENAME TO sites_humanitaires;',
    '',
    '-- 5. Recréation de la table menages (departement_id nullable)',
    'CREATE TABLE menages_nouvelle (',
    '    id TEXT PRIMARY KEY,',
    '    code_menage TEXT NOT NULL UNIQUE,',
    '    province_id TEXT NOT NULL REFERENCES provinces(id),',
    '    departement_id TEXT REFERENCES departements(id),',
    '    sous_prefecture_id TEXT REFERENCES sous_prefectures(id),',
    '    commune_id TEXT REFERENCES communes(id),',
    '    localite_id TEXT REFERENCES localites(id),',
    '    arrondissement_id TEXT REFERENCES arrondissements(id),',
    '    quartier_id TEXT REFERENCES quartiers(id),',
    '    carre_id TEXT REFERENCES carres(id),',
    '    site_humanitaire_id TEXT REFERENCES sites_humanitaires(id),',
    '    nom_chef_menage TEXT NOT NULL,',
    "    sexe_chef TEXT NOT NULL CHECK (sexe_chef IN ('M', 'F')),",
    '    nombre_personnes INTEGER NOT NULL CHECK (nombre_personnes > 0),',
    '    telephone TEXT,',
    '    categorie_population_id TEXT NOT NULL REFERENCES categories_population(id),',
    '    criteres_vulnerabilite TEXT,',
    '    date_enregistrement TEXT NOT NULL,',
    "    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF', 'DOUBLON_SUSPECTE', 'ARCHIVE')),",
    '    cree_par TEXT NOT NULL REFERENCES utilisateurs(id),',
    "    cree_le TEXT NOT NULL DEFAULT (datetime('now')),",
    "    statut_validation TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut_validation IN ('VALIDE', 'A_VERIFIER', 'REJETE')),",
    '    validation_decidee_par TEXT REFERENCES utilisateurs(id),',
    '    validation_decidee_le TEXT,',
    '    motif_validation TEXT',
    ');',
    'INSERT INTO menages_nouvelle SELECT id, code_menage, province_id, departement_id, sous_prefecture_id, commune_id, localite_id, arrondissement_id, quartier_id, carre_id, site_humanitaire_id, nom_chef_menage, sexe_chef, nombre_personnes, telephone, categorie_population_id, criteres_vulnerabilite, date_enregistrement, statut, cree_par, cree_le, statut_validation, validation_decidee_par, validation_decidee_le, motif_validation FROM menages;',
    'DROP TABLE menages;',
    'ALTER TABLE menages_nouvelle RENAME TO menages;',
    '',
    '-- 6. Recréation des index',
])

for idx_name, idx_sql in indexes_to_recreate:
    lines.append(f'{idx_sql};')

lines.extend([
    '',
    '-- 7. Déclencheurs adaptés avec prise en charge du statut particulier et des départements optionnels'
])

# Updated verifier_localite_avant_insertion
lines.extend([
    'CREATE TRIGGER verifier_localite_avant_insertion',
    'BEFORE INSERT ON localites',
    'WHEN (',
    '    NEW.departement_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM departements d',
    '        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id',
    '    )',
    ')',
    'OR (',
    '    NEW.departement_id IS NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1',
    '    )',
    ')',
    'OR (',
    '    NEW.sous_prefecture_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM sous_prefectures sp',
    '        WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id)',
    '    )',
    ')',
    'BEGIN',
    "    SELECT RAISE(ABORT, 'Rattachement territorial de la localité incohérent avec la province ou le département.');",
    'END;',
    '',
    'CREATE TRIGGER verifier_localite_avant_mise_a_jour',
    'BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id ON localites',
    'WHEN (',
    '    NEW.departement_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM departements d',
    '        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id',
    '    )',
    ')',
    'OR (',
    '    NEW.departement_id IS NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1',
    '    )',
    ')',
    'BEGIN',
    "    SELECT RAISE(ABORT, 'Rattachement territorial de la localité incohérent avec la province ou le département.');",
    'END;',
    '',
    'CREATE TRIGGER verifier_site_humanitaire_avant_insertion',
    'BEFORE INSERT ON sites_humanitaires',
    'WHEN (',
    '    NEW.departement_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM departements d',
    '        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id',
    '    )',
    ')',
    'OR (',
    '    NEW.departement_id IS NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1',
    '    )',
    ')',
    'BEGIN',
    "    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');",
    'END;',
    '',
    'CREATE TRIGGER verifier_site_humanitaire_avant_mise_a_jour',
    'BEFORE UPDATE OF province_id, departement_id ON sites_humanitaires',
    'WHEN (',
    '    NEW.departement_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM departements d',
    '        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id',
    '    )',
    ')',
    'OR (',
    '    NEW.departement_id IS NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1',
    '    )',
    ')',
    'BEGIN',
    "    SELECT RAISE(ABORT, 'Le site humanitaire ne correspond pas à son rattachement administratif.');",
    'END;',
    '',
    'CREATE TRIGGER verifier_menage_avant_insertion',
    'BEFORE INSERT ON menages',
    'WHEN (',
    '    NEW.departement_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM departements d',
    '        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1',
    '    )',
    ')',
    'OR (',
    '    NEW.departement_id IS NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1',
    '    )',
    ')',
    'OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)',
    'OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM sous_prefectures sp',
    '    WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id) AND sp.actif = 1',
    '))',
    'OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM localites l',
    '    WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id',
    '      AND (NEW.departement_id IS NULL OR l.departement_id IS NULL OR l.departement_id = NEW.departement_id) AND l.statut_validation = \'VALIDE\'',
    '))',
    'OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM arrondissements a',
    '    INNER JOIN localites l ON l.id = a.localite_id',
    '    WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id',
    '      AND a.statut_validation = \'VALIDE\' AND l.mode_decoupage_urbain = \'AVEC_ARRONDISSEMENTS\'',
    '))',
    'OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM quartiers q',
    '    WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id AND q.statut_validation = \'VALIDE\'',
    '      AND q.arrondissement_id IS NEW.arrondissement_id',
    '))',
    'OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM carres ca',
    '    INNER JOIN quartiers q ON q.id = ca.quartier_id',
    '    WHERE ca.id = NEW.carre_id AND q.id = NEW.quartier_id AND ca.statut_validation = \'VALIDE\'',
    '))',
    'OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM sites_humanitaires s',
    '    WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id',
    '      AND (NEW.departement_id IS NULL OR s.departement_id IS NULL OR s.departement_id = NEW.departement_id) AND s.statut_validation = \'VALIDE\'',
    '))',
    'BEGIN',
    "    SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');",
    'END;',
    '',
    'CREATE TRIGGER verifier_menage_avant_mise_a_jour',
    'BEFORE UPDATE OF province_id, departement_id, sous_prefecture_id, commune_id, localite_id,',
    '  arrondissement_id, quartier_id, carre_id, site_humanitaire_id, categorie_population_id ON menages',
    'WHEN (',
    '    NEW.departement_id IS NOT NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM departements d',
    '        WHERE d.id = NEW.departement_id AND d.province_id = NEW.province_id AND d.actif = 1',
    '    )',
    ')',
    'OR (',
    '    NEW.departement_id IS NULL',
    '    AND NOT EXISTS (',
    '        SELECT 1 FROM provinces p WHERE p.id = NEW.province_id AND p.statut_particulier = 1',
    '    )',
    ')',
    'OR NOT EXISTS (SELECT 1 FROM categories_population cp WHERE cp.id = NEW.categorie_population_id)',
    'OR (NEW.sous_prefecture_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM sous_prefectures sp',
    '    WHERE sp.id = NEW.sous_prefecture_id AND (NEW.departement_id IS NULL OR sp.departement_id = NEW.departement_id) AND sp.actif = 1',
    '))',
    'OR (NEW.localite_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM localites l',
    '    WHERE l.id = NEW.localite_id AND l.province_id = NEW.province_id',
    '      AND (NEW.departement_id IS NULL OR l.departement_id IS NULL OR l.departement_id = NEW.departement_id) AND l.statut_validation = \'VALIDE\'',
    '))',
    'OR (NEW.arrondissement_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM arrondissements a',
    '    INNER JOIN localites l ON l.id = a.localite_id',
    '    WHERE a.id = NEW.arrondissement_id AND a.localite_id = NEW.localite_id',
    '      AND a.statut_validation = \'VALIDE\' AND l.mode_decoupage_urbain = \'AVEC_ARRONDISSEMENTS\'',
    '))',
    'OR (NEW.quartier_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM quartiers q',
    '    WHERE q.id = NEW.quartier_id AND q.localite_id = NEW.localite_id AND q.statut_validation = \'VALIDE\'',
    '      AND q.arrondissement_id IS NEW.arrondissement_id',
    '))',
    'OR (NEW.carre_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM carres ca',
    '    INNER JOIN quartiers q ON q.id = ca.quartier_id',
    '    WHERE ca.id = NEW.carre_id AND q.id = NEW.quartier_id AND ca.statut_validation = \'VALIDE\'',
    '))',
    'OR (NEW.site_humanitaire_id IS NOT NULL AND NOT EXISTS (',
    '    SELECT 1 FROM sites_humanitaires s',
    '    WHERE s.id = NEW.site_humanitaire_id AND s.province_id = NEW.province_id',
    '      AND (NEW.departement_id IS NULL OR s.departement_id IS NULL OR s.departement_id = NEW.departement_id) AND s.statut_validation = \'VALIDE\'',
    '))',
    'BEGIN',
    "    SELECT RAISE(ABORT, 'Le ménage doit être rattaché à une localisation validée de sa province.');",
    'END;'
])

# Recreate all the remaining triggers exactly as they were
for t in triggers_to_drop:
    if t in [
        'verifier_localite_avant_insertion', 'verifier_localite_avant_mise_a_jour',
        'verifier_site_humanitaire_avant_insertion', 'verifier_site_humanitaire_avant_mise_a_jour',
        'verifier_menage_avant_insertion', 'verifier_menage_avant_mise_a_jour'
    ]:
        continue
    sql = all_triggers.get(t)
    if sql:
        lines.append('')
        lines.append(sql + ';')

lines.extend([
    '',
    'PRAGMA foreign_keys = ON;',
    '',
    "-- 8. Ville de N'Djaména et 10 arrondissements municipaux",
    "INSERT INTO localites (id, province_id, departement_id, nom, type_localite, mode_decoupage_urbain, statut_validation, source_documentation)",
    "VALUES ('loc-ndjamena-ville', 'prov-ndjamena', NULL, 'Ville de N''Djamena', 'VILLE', 'AVEC_ARRONDISSEMENTS', 'VALIDE', 'Loi organique 015/CNT/2024 et statut particulier');",
    '',
    'INSERT INTO arrondissements (id, localite_id, code, nom, statut_validation) VALUES'
])

arr_values = []
for i in range(1, 11):
    nom = f"{i}er Arrondissement" if i == 1 else f"{i}e Arrondissement"
    arr_values.append(f"('arr-ndj-{i}', 'loc-ndjamena-ville', 'ARR-NDJ-{i:02d}', '{nom}', 'VALIDE')")
lines.append(',\n'.join(arr_values) + ';')
lines.append('')

lines.append("-- 9. Quartiers de référence de la Ville de N'Djaména (terminologie officielle strictement Quartier)")
lines.append("INSERT INTO quartiers (id, localite_id, arrondissement_id, nom, possede_carres, statut_validation) VALUES")
quartiers_ndj = [
    ("qrt-ndj-1-farcha", "arr-ndj-1", "Farcha", 1),
    ("qrt-ndj-1-milezi", "arr-ndj-1", "Milezi", 0),
    ("qrt-ndj-2-bololo", "arr-ndj-2", "Bololo", 1),
    ("qrt-ndj-2-klemat", "arr-ndj-2", "Klémat", 0),
    ("qrt-ndj-3-kabalaye", "arr-ndj-3", "Kabalaye", 1),
    ("qrt-ndj-3-ardep-djoumal", "arr-ndj-3", "Ardep Djoumal", 0),
    ("qrt-ndj-4-repos", "arr-ndj-4", "Repos", 1),
    ("qrt-ndj-5-amriguebe", "arr-ndj-5", "Amriguébé", 1),
    ("qrt-ndj-5-ridina", "arr-ndj-5", "Ridina", 0),
    ("qrt-ndj-6-moursal", "arr-ndj-6", "Moursal", 1),
    ("qrt-ndj-6-paris-congo", "arr-ndj-6", "Paris-Congo", 1),
    ("qrt-ndj-7-chagoua", "arr-ndj-7", "Chagoua", 1),
    ("qrt-ndj-7-dembe", "arr-ndj-7", "Dembé", 0),
    ("qrt-ndj-8-diguel", "arr-ndj-8", "Diguel", 1),
    ("qrt-ndj-8-ndjari", "arr-ndj-8", "N'Djari", 0),
    ("qrt-ndj-9-walia", "arr-ndj-9", "Walia", 1),
    ("qrt-ndj-9-toukra", "arr-ndj-9", "Toukra", 0),
    ("qrt-ndj-10-gassi", "arr-ndj-10", "Gassi", 1),
    ("qrt-ndj-10-gaoui", "arr-ndj-10", "Gaoui", 0)
]
qrt_sql = []
for qid, aid, qname, pc in quartiers_ndj:
    nom_esc = qname.replace("'", "''")
    qrt_sql.append(f"('{qid}', 'loc-ndjamena-ville', '{aid}', '{nom_esc}', {pc}, 'VALIDE')")
lines.append(',\n'.join(qrt_sql) + ';')
lines.append('')

lines.append("-- 10. Seed des 112 départements candidats traçables (statut A_VERIFIER conformément aux règles d'intégrité)")
lines.append("INSERT INTO departements (id, province_id, code, nom, chef_lieu, actif, statut_validation, source_officielle) VALUES")
dep_sql = []
for r in range(2, ws.max_row+1):
    prov = ws.cell(r, 2).value
    dep = ws.cell(r, 4).value
    chef = ws.cell(r, 5).value
    if prov and dep and str(dep).strip():
        p_name = str(prov).strip()
        p_id = PROV_MAP.get(p_name)
        d_name = str(dep).strip()
        d_chef = str(chef or '').strip()
        d_id = f'dep-{p_id[5:]}-{slug(d_name)}'
        d_code = f'DEP-{slug(p_id[5:]).upper()}-{slug(d_name).upper()}'
        nom_esc = d_name.replace("'", "''")
        chef_clean = d_chef.replace("'", "''")
        chef_esc = f"'{chef_clean}'" if d_chef else 'NULL'
        dep_sql.append(f"('{d_id}', '{p_id}', '{d_code}', '{nom_esc}', {chef_esc}, 1, 'A_VERIFIER', 'INSEED 2024 / Inventaire territorial provisoire')")
lines.append(',\n'.join(dep_sql) + ';')

sql_text = '\n'.join(lines) + '\n'
with open('migrations/0028_refonte_referentiel_territorial.sql', 'w', encoding='utf-8') as f:
    f.write(sql_text)

print('Generated migrations/0028_refonte_referentiel_territorial.sql successfully!')
con.close()
