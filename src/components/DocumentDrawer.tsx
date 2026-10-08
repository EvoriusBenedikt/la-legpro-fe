import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, List, Eye, AlertCircle, BookOpen, ChevronRight, BarChart2, FolderOpen, ExternalLink } from 'lucide-react';
import api from '../services/api';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useStrings, getLocale, fill, STRINGS } from '../i18n';
import LoadingOrb from './LoadingOrb';

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
    status?: string;
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
  // PDF load failure gets an honest, user-visible state (bug_reports.md
  // 2026-10-07): the catch used to be console-only, leaving a bare
  // "Gagal memuat PDF." with no reason and no way to retry. retryable=false
  // only for 404 — a missing corpus file won't reappear on a second click.
  const [pdfError, setPdfError] = useState<{ msg: string; retryable: boolean } | null>(null);
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const [pasalData, setPasalData] = useState<PasalItem[]>([]);
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);
  /* Drawer copy follows the app locale (2026-10-08 critique remediation
     P2-5); async catches read STRINGS[getLocale()] at throw time because
     hooks cannot run inside effect callbacks. */
  const t = useStrings();
  /* Roving-tabindex tablist: refs for the arrow-key focus moves. */
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Use /api/pdf/ route (not StaticFiles /pdfs/) so CORS headers are applied correctly
  const pdfPath = doc?.filename
    ? `/api/pdf/${encodeURIComponent(doc.filename)}`
    : null;

  // Effect 1: Run overview analysis when doc changes
  useEffect(() => {
    if (!doc) return;
    // Awaited IIFE (react-hooks/set-state-in-effect): the six resets still run
    // synchronously in this tick, but the setState chain no longer sits in the
    // effect body's direct call graph. Same pattern as LegalRepository's PDF effect.
    (async () => {
      setAnalysis(null);
      setActiveTab('overview');
      setIsAnalyzing(true);
      setPdfBlobUrl(null);
      setPdfError(null);
      setPasalData([]);
      setDeepError(null);

      await api.post('/api/analyze', {
        reg_id: doc.id ? String(doc.id) : null,
        nomor: String(doc.nomor),
        judul: String(doc.judul),
        filename: doc.filename ?? null,
      })
        .then(r => r.data)
        .then(data => setAnalysis(data))
        .catch(err => {
          console.error('Analyze error:', err);
          // Indonesian user-facing copy; technical detail stays in the console
          // (critique re-score P1 copy pass).
          const s = STRINGS[getLocale()];
          const msg = err?.response
            ? fill(s.drawerErrServer, { code: err.response.status })
            : s.drawerErrNetwork;
          setAnalysis({
            total_pasal: 0,
            overview: fill(s.drawerErrAnalyze, { msg }),
            status: { dicabut: [], diubah_dengan: [] },
            outline: [],
          });
        })
        .finally(() => setIsAnalyzing(false));
    })();
  }, [doc?.id]);

  // Effect 2: Fetch PDF as JSON (base64) then decode to blob - bypasses IDM completely
  useEffect(() => {
    if (activeTab !== 'pdf' || !pdfPath || pdfBlobUrl) return;

    // Awaited IIFE (react-hooks/set-state-in-effect): spinner flip stays
    // synchronous; the fetch chain moves out of the direct call graph.
    (async () => {
      setIsPdfLoading(true);
      setPdfError(null);
      await api.get(pdfPath)
        .then(r => r.data)
        .then(({ data }: { data: string }) => {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          setPdfBlobUrl(URL.createObjectURL(blob));
        })
        .catch(err => {
          console.error('PDF load error:', err);
          // 404 = the corpus file is genuinely not on the server (a data gap,
          // not the user's fault); anything else gets the house network copy.
          const s = STRINGS[getLocale()];
          setPdfError(err?.response?.status === 404
            ? { msg: s.drawerErrPdfMissing, retryable: false }
            : { msg: s.drawerErrPdfNet, retryable: true });
        })
        .finally(() => setIsPdfLoading(false));
    })();
  }, [activeTab, pdfPath, pdfAttempt]);

  // Effect 3: Deep per-pasal analysis when "analisis" tab is opened
  useEffect(() => {
    if (activeTab !== 'analisis' || !doc) return;
    if (pasalData.length > 0 || isDeepAnalyzing) return; // already done or in progress

    // Awaited IIFE (react-hooks/set-state-in-effect): the two "analyzing"
    // flips stay synchronous; the POST chain moves out of the direct call graph.
    (async () => {
      setIsDeepAnalyzing(true);
      setDeepError(null);

      await api.post('/api/analyze-pasals', {
        reg_id: doc.id ? String(doc.id) : null,
        nomor: String(doc.nomor),
        judul: String(doc.judul),
        filename: doc.filename ?? null,
      })
        .then(r => r.data)
        .then(data => {
          if (data.error) setDeepError(data.error);
          setPasalData(data.pasals || []);
        })
        .catch(err => {
          console.error('Deep analysis error:', err);
          const s = STRINGS[getLocale()];
          const msg = err?.response
            ? fill(s.drawerErrServer, { code: err.response.status })
            : s.drawerErrNetwork;
          setDeepError(fill(s.drawerErrDeep, { msg }));
        })
        .finally(() => setIsDeepAnalyzing(false));
    })();
  }, [activeTab, doc?.id]);

  // Effect 4: Revoke blob URL on cleanup
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Dialog a11y (Esc, focus move/restore, Tab trap) — registered before the
  // early return so hook order stays stable (critique remediation P2, 2026-09-29).
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(!!doc, onClose, panelRef);

  if (!doc) return null;

  /* The PDF tab only exists when the document actually has a corpus file
     (2026-10-08 critique remediation P2-5): a tab that can only ever say
     "not available" is a dead control. Chat sources gained filename
     plumbing the same day; internal/legacy docs without one simply see
     three tabs. */
  const tabs = [
    { id: 'overview' as DrawerTab, label: t.drawerTabOverview, icon: <Eye size={14} /> },
    ...(doc.filename ? [{ id: 'pdf' as DrawerTab, label: t.drawerTabPdf, icon: <FileText size={14} /> }] : []),
    { id: 'outline' as DrawerTab, label: t.drawerTabOutline, icon: <List size={14} /> },
    { id: 'analisis' as DrawerTab, label: t.drawerTabAnalysis, icon: <BarChart2 size={14} /> },
  ];

  /* Tablist keyboard model (ARIA APG): arrows move focus AND selection
     (automatic activation — the panel content is light), Home/End jump
     to the ends. */
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const ids = tabs.map(x => x.id);
    const cur = ids.indexOf(activeTab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (cur + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActiveTab(ids[next]);
    tabRefs.current[ids[next]]?.focus();
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Drawer Panel — wider for the Analisis tab */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={doc.judul}
        tabIndex={-1}
        className={`drawer-panel${activeTab === 'analisis' ? ' drawer-panel--wide' : ''}`}
      >
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="drawer-badge">{doc.jenis}</span>
            <h3 className="drawer-title">{doc.judul}</h3>
            <span className="drawer-sub">{doc.sektor} · {t.drawerNomorPrefix} {doc.nomor}</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label={t.drawerClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar — a real ARIA tablist now (2026-10-08 critique
            remediation P2-5): tab/tabpanel roles, aria-selected, roving
            tabindex and arrow-key navigation replace four look-alike
            buttons carrying no semantics. */}
        <div className="drawer-tabs" role="tablist" aria-label={t.drawerTabsLabel}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              role="tab"
              id={`drawer-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls="drawer-panel"
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`drawer-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={onTabKeyDown}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          className={`drawer-content${activeTab === 'pdf' ? ' drawer-content--pdf' : ''}`}
          role="tabpanel"
          id="drawer-panel"
          aria-labelledby={`drawer-tab-${activeTab}`}
          tabIndex={-1}
        >

          {/* ── IKHTISAR TAB ── */}
          {activeTab === 'overview' && (
            <div className="drawer-section-list">
              {/* Qualified-status caveat repeated where the decision is made
                  (critique re-score P1): the card tooltip must not be the only
                  place this surfaces. */}
              {doc.status?.startsWith('Berlaku (') && (
                <div className="drawer-status-note" role="note">
                  <AlertCircle size={16} />
                  <span>{t.drawerStatusNote}</span>
                </div>
              )}
              <div className="stat-card">
                <span className="stat-label">{t.drawerTotalPasal}</span>
                {isAnalyzing
                  ? <div className="skeleton-line wide" />
                  : <span className="stat-value">{analysis?.total_pasal ?? '—'}</span>
                }
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title"><BookOpen size={16} /> {t.drawerOverviewTitle}</div>
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
                <div className="drawer-section-title"><AlertCircle size={16} /> {t.drawerStatusDocLevel}</div>
                {isAnalyzing ? (
                  <div className="skeleton-block"><div className="skeleton-line medium" /></div>
                ) : (
                  <div className="status-group">
                    <div className="status-label">{t.drawerRevokedLabel}</div>
                    {analysis?.status?.dicabut && analysis.status.dicabut.length > 0 ? (
                      <ul className="status-list">
                        {analysis.status.dicabut.map((item, i) => (
                          <li key={i} className="status-item"><ChevronRight size={12} /> {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="status-none">{t.drawerNoRevocation}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title"><AlertCircle size={16} /> {t.drawerStatusArticleLevel}</div>
                {isAnalyzing ? (
                  <div className="skeleton-block"><div className="skeleton-line medium" /></div>
                ) : (
                  <div className="status-group">
                    <div className="status-label">{t.drawerAmendedLabel}</div>
                    {analysis?.status?.diubah_dengan && analysis.status.diubah_dengan.length > 0 ? (
                      <ul className="status-list">
                        {analysis.status.diubah_dengan.map((item, i) => (
                          <li key={i} className="status-item"><ChevronRight size={12} /> {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="status-none">{t.drawerNoAmendment}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PDF TAB ── */}
          {activeTab === 'pdf' && (
            <div className="pdf-viewer-area">
              {!pdfPath ? (
                <div className="empty-pdf">
                  <FileText size={48} style={{ opacity: 0.3 }} />
                  <p>{t.drawerPdfUnavailable}</p>
                </div>
              ) : isPdfLoading ? (
                <div className="empty-pdf">
                  <FileText size={48} style={{ color: 'var(--accent-color)', opacity: 0.7 }} />
                  <p>{t.drawerPdfLoading}</p>
                </div>
              ) : pdfBlobUrl ? (
                <>
                  <iframe src={pdfBlobUrl} title={t.drawerPdfViewerTitle} className="pdf-object" />
                  {/* The ↗ glyph was a unicode stand-in for the icon system
                      that already exists (craft floor); ExternalLink carries
                      the same meaning in the house stroke. */}
                  <a href={pdfBlobUrl} target="_blank" rel="noopener noreferrer" className="pdf-open-link">
                    <ExternalLink size={13} aria-hidden="true" /> {t.drawerPdfOpenNewTab}
                  </a>
                </>
              ) : (
                <div className="empty-pdf">
                  <FileText size={48} style={{ opacity: 0.3 }} />
                  <p>{pdfError?.msg ?? t.drawerPdfFailed}</p>
                  {(pdfError?.retryable ?? true) && (
                    <button className="btn btn-primary" onClick={() => setPdfAttempt(a => a + 1)}>
                      {t.drawerTryAgain}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── KERANGKA TAB ── */}
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
                    {item.type === 'bab'
                      ? <FolderOpen size={14} aria-hidden="true" />
                      : <FileText size={13} aria-hidden="true" />}
                    <span>{item.text}</span>
                  </div>
                ))
              ) : (
                <div className="empty-pdf">
                  <List size={48} style={{ opacity: 0.3 }} />
                  <p>{t.drawerOutlineEmpty}</p>
                </div>
              )}
            </div>
          )}

          {/* ── ANALISIS TAB ── */}
          {activeTab === 'analisis' && (
            <div className="pasal-analysis-view">
              {isDeepAnalyzing ? (
                <div className="deep-loading">
                  <LoadingOrb state="solving" size={64} />
                  <h4>{t.drawerDeepLoadingTitle}</h4>
                  <p>{t.drawerDeepLoadingBody}<br />{t.drawerDeepLoadingEta}</p>
                  <div className="deep-loading-bar">
                    <div className="deep-loading-bar-inner" />
                  </div>
                </div>
              ) : deepError ? (
                <div className="empty-pdf">
                  <AlertCircle size={40} style={{ opacity: 0.5, color: 'var(--danger)' }} />
                  <p style={{ color: 'var(--danger-text)' }}>{deepError}</p>
                </div>
              ) : pasalData.length === 0 ? (
                <div className="empty-pdf">
                  <BarChart2 size={48} style={{ opacity: 0.3 }} />
                  <p>{t.drawerDeepEmpty}</p>
                </div>
              ) : (
                <>
                  <div className="pasal-analysis-header">
                    <span>{fill(t.drawerDeepHeader, { n: pasalData.length })}</span>
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
                          <span className="pasal-analysis-chip">{t.drawerDeepCompare}</span>
                          <p>{item.perbandingan}</p>
                        </div>
                        <div className="pasal-analysis-block">
                          <span className="pasal-analysis-chip pasal-analysis-chip--blue">{t.drawerDeepRelation}</span>
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
