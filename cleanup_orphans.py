import sqlite3

db_path = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be\data\legal_metadata.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("DELETE FROM regulations WHERE status = 'Gagal - Error'")
deleted_count = c.rowcount

conn.commit()
conn.close()

print(f"Successfully deleted {deleted_count} orphaned records.")
