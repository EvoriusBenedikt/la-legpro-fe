import sqlite3

db_path = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be\data\legal_metadata.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("UPDATE regulations SET status = 'Berlaku' WHERE status = 'Gagal - Duplikat'")
updated_count = c.rowcount

conn.commit()
conn.close()

print(f"Successfully restored {updated_count} documents to 'Berlaku'.")
