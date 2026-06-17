import os

filepath = os.path.join("src", "components", "LegalRepository.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add state for PDF Modal
state_inject = """  const [viewPdfDoc, setViewPdfDoc] = useState<OJKDocument | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);"""
content = content.replace("  const [selectedDoc, setSelectedDoc] = useState<OJKDocument | null>(null);", 
                          "  const [selectedDoc, setSelectedDoc] = useState<OJKDocument | null>(null);\n" + state_inject)

# 2. Add effect for fetching PDF blob
effect_inject = """  // Fetch PDF blob for centered viewer
  useEffect(() => {
    if (!viewPdfDoc || !viewPdfDoc.filename) return;
    
    const pdfUrl = `http://localhost:8000/api/pdf/${encodeURIComponent(viewPdfDoc.filename)}`;
    setIsPdfLoading(true);
    setPdfBlobUrl(null);
    
    fetch(pdfUrl)
      .then(res => res.json())
      .then(data => {
        const binary = atob(data.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        setPdfBlobUrl(URL.createObjectURL(blob));
      })
      .catch(err => console.error('PDF load error:', err))
      .finally(() => setIsPdfLoading(false));
      
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [viewPdfDoc]);"""

content = content.replace("  useEffect(() => {", effect_inject + "\n\n  useEffect(() => {", 1)

# 3. Change 'Lihat Dokumen' button onClick
old_btn = """                <button
                  className="analyze-btn"
                  onClick={() => setSelectedDoc(doc)}
                  style={{ background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', marginTop: '12px' }}
                >
                  <BookOpen size={14} /> Lihat Dokumen
                </button>"""
new_btn = """                <button
                  className="analyze-btn"
                  onClick={() => setViewPdfDoc(doc)}
                  style={{ background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', marginTop: '12px' }}
                >
                  <BookOpen size={14} /> Lihat Dokumen
                </button>"""
content = content.replace(old_btn, new_btn)

# 4. Inject PDF Modal UI at the bottom
modal_ui = """      {/* Centered PDF Modal for Pending Documents */}
      {viewPdfDoc && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyItems: 'center', padding: '24px', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: '#1e293b', width: '100%', maxWidth: '900px', height: '90vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#f59e0b', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Menunggu Konfirmasi</div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>{viewPdfDoc.judul}</h3>
              </div>
              <button onClick={() => { setViewPdfDoc(null); setPdfBlobUrl(null); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative', background: '#0f172a' }}>
              {isPdfLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                  <File size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
                  <p>Memuat PDF...</p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} title="PDF Viewer" style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444' }}>
                  <p>Gagal memuat PDF.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}"""

# Find where to inject (right before the last </div> in the return statement)
# The file ends with </div>\n    </div>\n  );\n}
content = content.replace("      <DocumentDrawer", modal_ui + "\n\n      <DocumentDrawer")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Frontend patch for PDF Modal applied successfully.")
