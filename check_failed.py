import sqlite3

db_path = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be\data\legal_metadata.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT id, judul FROM regulations WHERE status = 'Gagal - Error' LIMIT 10")
rows = c.fetchall()
for row in rows:
    print(row)
conn.close()
