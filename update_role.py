import sqlite3
import os

db_path = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be\data\users.db'
if not os.path.exists(db_path):
    print('DB not found at:', db_path)
else:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("UPDATE users SET role = 'Direktur' WHERE username = 'direktur'")
    if c.rowcount == 0:
        print('User not found or role already set.')
    else:
        print('Successfully updated role for user: direktur')
    conn.commit()
    conn.close()
