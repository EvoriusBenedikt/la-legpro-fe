import re
import os

filepath = os.path.join("src", "components", "LegalRepository.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
if "Clock" not in content:
    content = content.replace("import { Search, Database, File, Upload, CheckCircle2, BookOpen, FolderOpen, Zap, FileCheck, X, Trash2 } from 'lucide-react';", 
                              "import { Search, Database, File, Upload, CheckCircle2, BookOpen, FolderOpen, Zap, FileCheck, X, Trash2, Clock } from 'lucide-react';")

# 2. ActiveTab type
content = content.replace("type ActiveTab = 'regulations' | 'internal' | 'analyzed' | 'templates';", 
                          "type ActiveTab = 'regulations' | 'internal' | 'analyzed' | 'templates' | 'pending';")

# 3. pendingDocs state and handleConfirmPending
state_inject = """  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [pendingDocs, setPendingDocs] = useState<OJKDocument[]>([]);"""
content = content.replace("  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);", state_inject)

fetch_inject = """  const fetchPendingDocs = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/repository/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPendingDocs(data.documents || []);
      }
    } catch (error) {
      console.error("Error fetching pending docs", error);
    }
  };

  const handleConfirmPending = async (docId: string, klasifikasi: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/repository/pending/${docId}/confirm`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ klasifikasi })
      });
      if (res.ok) {
        alert('Dokumen berhasil dikonfirmasi dan dimasukkan ke repositori!');
        fetchPendingDocs();
        fetchDocs();
      } else {
        alert('Gagal mengkonfirmasi dokumen.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan koneksi.');
    }
  };

  const fetchDocs = async () => {"""
content = content.replace("  const fetchDocs = async () => {", fetch_inject)

# 4. useEffect
use_effect_old = """  useEffect(() => {
    fetchDocs();
    fetchHistoryDocs();
    fetchTemplates();
  }, []);"""
use_effect_new = """  useEffect(() => {
    fetchDocs();
    fetchHistoryDocs();
    fetchTemplates();
    if (user?.role?.toLowerCase() === 'sekretaris perusahaan') {
      fetchPendingDocs();
    }
  }, [user]);"""
content = content.replace(use_effect_old, use_effect_new)

# 5. tabs definition
tabs_old = """  const tabs = [
    { id: 'regulations' as ActiveTab, label: 'Regulations', icon: <BookOpen size={16} />, count: regulationDocs.length },
    { id: 'internal' as ActiveTab, label: 'Internal Documents', icon: <FolderOpen size={16} />, count: internalDocs.length },
    { id: 'analyzed' as ActiveTab, label: 'Analyzed Documents', icon: <FileCheck size={16} />, count: historyDocs.length },
    { id: 'templates' as ActiveTab, label: 'Document Templates', icon: <File size={16} />, count: templates.length },
  ];"""
tabs_new = """  const tabs = [
    { id: 'regulations' as ActiveTab, label: 'Regulations', icon: <BookOpen size={16} />, count: regulationDocs.length },
    { id: 'internal' as ActiveTab, label: 'Internal Documents', icon: <FolderOpen size={16} />, count: internalDocs.length },
    { id: 'analyzed' as ActiveTab, label: 'Analyzed Documents', icon: <FileCheck size={16} />, count: historyDocs.length },
    { id: 'templates' as ActiveTab, label: 'Document Templates', icon: <File size={16} />, count: templates.length },
  ];
  if (user?.role?.toLowerCase() === 'sekretaris perusahaan') {
    tabs.push({ id: 'pending' as ActiveTab, label: 'Pending Documents', icon: <Clock size={16} />, count: pendingDocs.length });
  }"""
content = content.replace(tabs_old, tabs_new)

# 6. Render Pending grid
grid_old = """            {activeTab === 'templates' && templates.map((tpl) => ("""
grid_new = """            {activeTab === 'pending' && pendingDocs.map((doc, idx) => (
              <div key={idx} className="document-card" style={{ borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.05)' }}>
                <div className="doc-type-badge" style={{ background: '#f59e0b', color: 'white' }}>
                  Menunggu Konfirmasi
                </div>
                <h3 className="doc-title">{doc.judul}</h3>
                <div className="doc-meta">
                  <span>Nomor: {doc.nomor}</span>
                </div>
                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>Rekomendasi AI Klasifikasi:</p>
                  <select
                    defaultValue={(doc as any).klasifikasi || 'Umum'}
                    onChange={(e) => { (doc as any).selectedKlasifikasi = e.target.value; }}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '8px', color: '#f8fafc', marginBottom: '12px' }}
                  >
                    <option value="Umum">Umum</option>
                    <option value="Rahasia">Rahasia</option>
                    <option value="Terbatas">Terbatas</option>
                  </select>
                  <button
                    onClick={() => handleConfirmPending(doc.id, (doc as any).selectedKlasifikasi || (doc as any).klasifikasi || 'Umum')}
                    style={{ width: '100%', background: '#f59e0b', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Konfirmasi & Ingest
                  </button>
                </div>
              </div>
            ))}
            
            {activeTab === 'templates' && templates.map((tpl) => ("""
content = content.replace(grid_old, grid_new)


with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Frontend patch applied successfully.")
