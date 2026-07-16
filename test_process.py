import asyncio
import os
import sys

BASE_DIR = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be\api'
ROOT_DIR = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be'
sys.path.append(BASE_DIR)
sys.path.append(os.path.join(ROOT_DIR, "parser"))

from dotenv import load_dotenv
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))

import sqlite3
from routers.repository import process_document_background

def main():
    db_path = r'c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-be\data\legal_metadata.db'
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, judul, nomor, jenis, sektor, status, klasifikasi, local_path FROM regulations WHERE status = 'Gagal - Error' LIMIT 1")
    doc = c.fetchone()
    conn.close()
    
    if not doc:
        print("No failed doc found")
        return
        
    doc_id, judul, nomor, jenis, sektor, status, klasifikasi, local_path = doc
    
    print(f"Testing doc_id: {doc_id} with file: {local_path}")
    try:
        process_document_background(local_path, doc_id, judul, nomor, jenis, sektor, status, klasifikasi)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
