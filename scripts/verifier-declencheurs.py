import sqlite3
import glob

con = sqlite3.connect(':memory:')
for f in sorted(glob.glob('migrations/*.sql'))[:-1]:
    with open(f, encoding='utf-8') as mf:
        con.executescript(mf.read())

cur = con.cursor()
cur.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'")
for name, tbl, sql in cur.fetchall():
    if 'menages' in sql.lower() and tbl != 'menages':
        print(f'Trigger {name} on {tbl} references menages')
    if 'sites_humanitaires' in sql.lower() and tbl != 'sites_humanitaires':
        print(f'Trigger {name} on {tbl} references sites_humanitaires')
