import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, List, Eye, AlertCircle, BookOpen, ChevronRight, BarChart2, Layers } from 'lucide-react';

interface OutlineItem {
  type: 'bab' | 'pasal';
  text: string;
}

interface AnalysisResult {
  total_pasal: number;
  overview: string;
  status: {
    dicabut: string[];
    diubah_dengan: string[];
  };
  outline: OutlineItem[];
}

interface PasalItem {
  pasal: string;
  status: string;
  isi: string;
  isi_teks?: string;
  perbandingan: string;
  hubungan: string;
}

interface DocumentDrawerProps {
  doc: {
    id: string;
    nomor: string;
    judul: string;
    jenis: string;
    sektor: string;
    filename?: string;
  } | null;
  onClose: () => void;
}

type DrawerTab = 'overview' | 'pdf' | 'outline' | 'analisis';

const STATUS_COLORS: Record<string, string> = {
  'Tidak Berubah': 'status-chip--unchanged',
  'Diubah': 'status-chip--changed',
  'Baru': 'status-chip--new',
  'Dicabut': 'status-chip--revoked',
};

export default function DocumentDrawer({ doc, onClose }: DocumentDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pasalData, setPasalData] = useState<PasalItem[]>([]);
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  // Use /api/pdf/ route (not StaticFiles /pdfs/) so CORS headers are applied correctly
  const pdfUrl = doc?.filename
    ? `http://localhost:8000/api/pdf/${encodeURIComponent(doc.filename)}`
    : null;

  // Effect 1: Run overview analysis when doc changes
  useEffect(() => {
    if (!doc) return;
    setAnalysis(null);
    setActiveTab('overview');
    setIsAnalyzing(true);
    setPdfBlobUrl(null);
    setPasalData([]);
    setDeepError(null);

    fetch('http://localhost:8000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reg_id: doc.id ? String(doc.id) : null,
        nomor: String(doc.nomor),
        judul: String(doc.judul),
        filename: doc.filename ?? null,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then(data => setAnalysis(data))
      .catch(err => {
        console.error('Analyze error:', err);
        setAnalysis({
          total_pasal: 0,
          overview: `Gagal menganalisis dokumen. ${err.message}`,
          status: { dicabut: [], diubah_dengan: [] },
          outline: [],
        });
      })
      .finally(() => setIsAnalyzing(false));
  }, [doc?.id]);

  // Effect 2: Fetch PDF as JSON (base64) then decode to blob - bypasses IDM completely
  useEffect(() => {
    if (activeTab !== 'pdf' || !pdfUrl || pdfBlobUrl) return;

    setIsPdfLoading(true);
    fetch(pdfUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(({ data }: { data: string }) => {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        setPdfBlobUrl(URL.createObjectURL(blob));
      })
      .catch(err => console.error('PDF load error:', err))
      .finally(() => setIsPdfLoading(false));
  }, [activeTab, pdfUrl]);

  // Effect 3: Deep per-pasal analysis when "analisis" tab is opened
  useEffect(() => {
    if (activeTab !== 'analisis' || !doc) return;
    if (pasalData.length > 0 || isDeepAnalyzing) return; // already done or in progress

    setIsDeepAnalyzing(true);
    setDeepError(null);

    fetch('http://localhost:8000/api/analyze-pasals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reg_id: doc.id ? String(doc.id) : null,
        nomor: String(doc.nomor),
        judul: String(doc.judul),
        filename: doc.filename ?? null,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.error) setDeepError(data.error);
        setPasalData(data.pasals || []);
      })
      .catch(err => {
        console.error('Deep analysis error:', err);
        setDeepError(`Gagal menganalisis. ${err.message}`);
      })
      .finally(() => setIsDeepAnalyzing(false));
  }, [activeTab, doc?.id]);

  // Effect 4: Revoke blob URL on cleanup
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  if (!doc) return null;

  const tabs = [
    { id: 'overview' as DrawerTab, label: 'Overview', icon: <Eye size={14} /> },
    { id: 'pdf' as DrawerTab, label: 'PDF', icon: <FileText size={14} /> },
    { id: 'outline' as DrawerTab, label: 'Outline', icon: <List size={14} /> },
    { id: 'analisis' as DrawerTab, label: 'Analisis', icon: <BarChart2 size={14} /> },
  ];

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} />

      {/* Drawer Panel — wider for the Analisis tab */}
      <div className={`drawer-panel${activeTab === 'analisis' ? ' drawer-panel--wide' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="drawer-badge">{doc.jenis}</span>
            <h3 className="drawer-title">{doc.judul}</h3>
            <span className="drawer-sub">{doc.sektor} · Nomor {doc.nomor}</span>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="drawer-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`drawer-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={`drawer-content${activeTab === 'pdf' ? ' drawer-content--pdf' : ''}`}>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="drawer-section-list">
              <div className="stat-card">
                <span className="stat-label">Total Pasal</span>
                {isAnalyzing
                  ? <div className="skeleton-line wide" />
                  : <span className="stat-value">{analysis?.total_pasal ?? '—'}</span>
                }
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title"><BookOpen size={16} /> Ringkasan Dokumen</div>
                {isAnalyzing ? (
                  <div className="skeleton-block">
                    <div className="skeleton-line" />
                    <div className="skeleton-line medium" />
                    <div className="skeleton-line short" />
                  </div>
                ) : (
                  <p className="drawer-section-body">{analysis?.overview}</p>
                )}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title"><AlertCircle size={16} /> Status Peraturan Dokumen Level</div>
                {isAnalyzing ? (
                  <div className="skeleton-block"><div className="skeleton-line medium" /></div>
                ) : (
                  <div className="status-group">
                    <div className="status-label">Dicabut :</div>
                    {analysis?.status?.dicabut && analysis.status.dicabut.length > 0 ? (
                      <ul className="status-list">
                        {analysis.status.dicabut.map((item, i) => (
                          <li key={i} className="status-item"><ChevronRight size={12} /> {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="status-none">Tidak ada informasi pencabutan</span>
                    )}
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title"><AlertCircle size={16} /> Status Peraturan Pasal/Subpasal Level</div>
                {isAnalyzing ? (
                  <div className="skeleton-block"><div className="skeleton-line medium" /></div>
                ) : (
                  <div className="status-group">
                    <div className="status-label">Diubah dengan :</div>
                    {analysis?.status?.diubah_dengan && analysis.status.diubah_dengan.length > 0 ? (
                      <ul className="status-list">
                        {analysis.status.diubah_dengan.map((item, i) => (
                          <li key={i} className="status-item"><ChevronRight size={12} /> {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="status-none">Tidak ada informasi perubahan</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PDF TAB ── */}
          {activeTab === 'pdf' && (
            <div className="pdf-viewer-area">
              {!pdfUrl ? (
                <div className="empty-pdf">
                  <FileText size={48} style={{ opacity: 0.3 }} />
                  <p>File PDF tidak tersedia untuk dokumen ini.</p>
                </div>
              ) : isPdfLoading ? (
                <div className="empty-pdf">
                  <FileText size={48} style={{ color: 'var(--accent-color)', opacity: 0.7 }} />
                  <p>Memuat PDF...</p>
                </div>
              ) : pdfBlobUrl ? (
                <>
                  <iframe src={pdfBlobUrl} title="PDF Viewer" className="pdf-object" />
                  <a href={pdfBlobUrl} target="_blank" rel="noopener noreferrer" className="pdf-open-link">
                    ↗ Buka PDF di Tab Baru
                  </a>
                </>
              ) : (
                <div className="empty-pdf">
                  <FileText size={48} style={{ opacity: 0.3 }} />
                  <p>Gagal memuat PDF.</p>
                </div>
              )}
            </div>
          )}

          {/* ── OUTLINE TAB ── */}
          {activeTab === 'outline' && (
            <div className="outline-list">
              {isAnalyzing ? (
                <div className="skeleton-block">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={`skeleton-line ${i % 3 === 0 ? 'wide' : 'medium'}`} style={{ marginBottom: 12 }} />
                  ))}
                </div>
              ) : analysis?.outline && analysis.outline.length > 0 ? (
                analysis.outline.map((item, i) => (
                  <div key={i} className={`outline-item ${item.type}`}>
                    {item.type === 'bab' ? '📂' : '📄'} {item.text}
                  </div>
                ))
              ) : (
                <div className="empty-pdf">
                  <List size={48} style={{ opacity: 0.3 }} />
                  <p>Tidak ada outline yang dapat diekstrak dari dokumen ini.</p>
                </div>
              )}
            </div>
          )}

          {/* ── ANALISIS TAB ── */}
          {activeTab === 'analisis' && (
            <div className="pasal-analysis-view">
              {isDeepAnalyzing ? (
                <div className="deep-loading">
                  <div className="deep-loading-icon">
                    <Layers size={40} />
                  </div>
                  <h4>Menganalisis Setiap Pasal...</h4>
                  <p>LLM sedang membaca dan menganalisis setiap pasal secara mendalam.<br />Ini memerlukan waktu 1–3 menit.</p>
                  <div className="deep-loading-bar">
                    <div className="deep-loading-bar-inner" />
                  </div>
                </div>
              ) : deepError ? (
                <div className="empty-pdf">
                  <AlertCircle size={40} style={{ opacity: 0.5, color: '#f87171' }} />
                  <p style={{ color: '#f87171' }}>{deepError}</p>
                </div>
              ) : pasalData.length === 0 ? (
                <div className="empty-pdf">
                  <BarChart2 size={48} style={{ opacity: 0.3 }} />
                  <p>Tidak ada data analisis.</p>
                </div>
              ) : (
                <>
                  <div className="pasal-analysis-header">
                    <span>Analisis mendalam atas {pasalData.length} pasal teratas</span>
                  </div>
                  {pasalData.map((item, idx) => (
                    <div key={idx} className="pasal-card">
                      {/* Pasal Header */}
                      <div className="pasal-card-header">
                        <div className="pasal-card-num">({idx + 1})</div>
                        <span className="pasal-card-label">{item.pasal}</span>
                        <span className={`status-chip ${STATUS_COLORS[item.status] ?? 'status-chip--unchanged'}`}>
                          {item.status}
                        </span>
                      </div>

                      {/* Pasal text from ChromaDB */}
                      {item.isi_teks && (
                        <p className="pasal-card-text">{item.isi_teks}</p>
                      )}

                      {/* Analysis sections */}
                      <div className="pasal-analysis-sections">
                        <div className="pasal-analysis-block">
                          <span className="pasal-analysis-chip">Perbandingan Dengan Regulasi Yang Dicabut</span>
                          <p>{item.perbandingan}</p>
                        </div>
                        <div className="pasal-analysis-block">
                          <span className="pasal-analysis-chip pasal-analysis-chip--blue">Hubungan dengan Regulasi yang Lebih Tinggi</span>
                          <p>{item.hubungan}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
