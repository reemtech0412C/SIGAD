import sqlite3
import glob
con = sqlite3.connect(':memory:')
for f in sorted(glob.glob('migrations/*.sql'))[:-1]:
    with open(f, encoding='utf-8') as mf:
        con.executescript(mf.read())
cur = con.cursor()
cur.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('localites', 'sites_humanitaires', 'menages')")
for row in cur.fetchall():
    print(row)
