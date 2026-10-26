import sqlite3
import glob

con = sqlite3.connect(':memory:')
for f in sorted(glob.glob('migrations/*.sql'))[:-1]:
    with open(f, encoding='utf-8') as mf:
        con.executescript(mf.read())

cur = con.cursor()

# Get all triggers
cur.execute("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'")
all_triggers = cur.fetchall()

# Drop all triggers
for name, sql in all_triggers:
    cur.execute(f"DROP TRIGGER {name}")

print(f"Dropped {len(all_triggers)} triggers.")

# Now test recreating localites, sites_humanitaires, menages
cur.execute("""
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
""")
cur.execute("INSERT INTO localites_nouvelle SELECT * FROM localites")
cur.execute("DROP TABLE localites")
cur.execute("ALTER TABLE localites_nouvelle RENAME TO localites")
print("localites recreated successfully!")

cur.execute("""
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
""")
cur.execute("INSERT INTO sites_humanitaires_nouvelle SELECT * FROM sites_humanitaires")
cur.execute("DROP TABLE sites_humanitaires")
cur.execute("ALTER TABLE sites_humanitaires_nouvelle RENAME TO sites_humanitaires")
print("sites_humanitaires recreated successfully!")

cur.execute("""
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
""")
cur.execute("INSERT INTO menages_nouvelle SELECT * FROM menages")
cur.execute("DROP TABLE menages")
cur.execute("ALTER TABLE menages_nouvelle RENAME TO menages")
print("menages recreated successfully!")

# Re-create triggers
for name, sql in all_triggers:
    cur.execute(sql)
print("Recreated all triggers successfully!")

cur.execute("PRAGMA foreign_key_check")
print("Foreign key check:", cur.fetchall())
con.close()
