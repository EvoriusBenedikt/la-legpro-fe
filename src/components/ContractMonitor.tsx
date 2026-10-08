import { useState, useEffect, useRef } from 'react';
import {
  Search, CalendarClock, FileCheck, AlertTriangle, CheckCircle,
  XCircle, Clock, Edit2, Trash2, Eye, Calendar, Building,
  Inbox, FileX, ShieldCheck, X, Upload, RefreshCw, Download, Loader2
} from 'lucide-react';
import { useContractUpload, type UploadJob } from '../hooks/useContractUpload';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { getExpiryInfo, expiryStatusWord } from '../expiry';
import ComplianceResultsViewer, {
  type ComplianceResult,
  type ComplianceSummary,
} from './ComplianceResultsViewer';
import ContractUploadModal from './ContractUploadModal';
import LoadingOrb from './LoadingOrb';
import api, { isHttpError } from '../services/api';
import { useDateFormatters, formatDateWith } from '../format';

/* Contracts page hardening (critique 2026-10-06): failure paths get honest,
   recoverable UI (error panel + retry, inline dialog failures, job history
   with retry) instead of empty-state lies and unhandled rejections; all
   expiry colors are semantic tokens via src/expiry.ts; both dialogs meet the
   system dialog standard (useDialogA11y + .confirm-modal grammar). */

const NETWORK_ERROR = 'Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.';

const JOB_STATUS_LABEL: Record<UploadJob['status'], string> = {
  processing: 'Dianalisis…',
  done: 'Selesai',
  error: 'Gagal',
  interrupted: 'Terputus',
};

interface AnalyzedDocument {
  id: string;
  filename: string;
  company_name: string | null;
  expiration_date: string | null;
  created_at: string;
  /** Payload persisted via /api/compliance-history (UploadProvider saves
      `{ summary, results }` from the compliance analysis). */
  results?: {
    summary?: ComplianceSummary | null;
    results?: ComplianceResult[] | null;
  } | null;
}

type FilterTab = 'all' | 'active' | 'expiring' | 'expired';

interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  /** Resolves → dialog closes. Rejects → dialog stays open with the error
      inline, so the user can retry or cancel with full context. */
  onConfirm: () => Promise<void>;
}

/** System-consistent danger confirmation (mirrors AdminDashboard's
    ConfirmDialog pattern): replaces native window.confirm for the delete
    flow, names the document that dies, and surfaces failures inline. */
const ConfirmDialog = ({ state, onClose }: { state: ConfirmState; onClose: () => void }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mounted only while open; Escape is a no-op mid-mutation so the dialog
  // cannot vanish during the DELETE. Focus restores to the trigger on close.
  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const runConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await state.onConfirm();
      onClose();
    } catch (e) {
      // Stay open: the user sees why it failed and can retry or cancel.
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-confirm-title"
        aria-busy={pending}
        tabIndex={-1}
      >
        <h3 className="confirm-modal-title" id="cm-confirm-title">{state.title}</h3>
        <p className="confirm-modal-body">{state.body}</p>
        {error && <p className="confirm-modal-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { void runConfirm(); }}
            disabled={pending}
          >
            {pending && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending ? 'Memproses...' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Metadata edit form as a proper dialog (critique P1 #4): focus-trapped,
    labeled inputs, pending/error states — and the date normalized to
    YYYY-MM-DD, so a full-ISO expiration_date can no longer render the input
    blank and let an untouched Save silently write null. */
const EditMetadataDialog = ({ doc, onClose, onSaved }: {
  doc: AnalyzedDocument;
  onClose: () => void;
  onSaved: (companyName: string | null, expirationDate: string | null) => void;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [company, setCompany] = useState(doc.company_name || '');
  const [expiryDate, setExpiryDate] = useState(() => {
    // input[type=date] only accepts YYYY-MM-DD; anything else renders blank.
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(doc.expiration_date || '');
    return m ? m[1] : '';
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await api.put(`/api/compliance-history/${doc.id}`, {
        company_name: company || null,
        expiration_date: expiryDate || null,
      });
      onSaved(company || null, expiryDate || null);
      onClose();
    } catch (e) {
      // Stay open with the reason inline — never a bare alert(), never silence.
      setError(isHttpError(e)
        ? (e.response.data?.detail || 'Gagal menyimpan perubahan.')
        : NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-edit-title"
        aria-busy={pending}
        tabIndex={-1}
      >
        <h3 className="confirm-modal-title" id="cm-edit-title">Edit Metadata Dokumen</h3>
        <p className="confirm-modal-body">{doc.filename}</p>
        <label className="confirm-modal-label" htmlFor="cm-edit-company">Nama Perusahaan</label>
        <input
          id="cm-edit-company"
          className="confirm-modal-input"
          type="text"
          value={company}
          onChange={e => setCompany(e.target.value)}
          placeholder="Contoh: PT Lintasarta & PT Global Prima"
        />
        <label className="confirm-modal-label" htmlFor="cm-edit-expiry">Tanggal Kedaluwarsa</label>
        <input
          id="cm-edit-expiry"
          className="confirm-modal-input"
          type="date"
          value={expiryDate}
          onChange={e => setExpiryDate(e.target.value)}
        />
        {error && <p className="confirm-modal-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void run(); }}
            disabled={pending}
          >
            {pending && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function ContractMonitor() {
  const [documents, setDocuments] = useState<AnalyzedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // A failed fetch is a distinct state — it must never render as "no
  // documents" on a compliance monitor (critique P1 #1).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [editDoc, setEditDoc] = useState<AnalyzedDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<AnalyzedDocument | null>(null);
  const [viewingDoc, setViewingDoc] = useState<AnalyzedDocument | null>(null);
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { jobs, retryJob, clearJobs, notify, subscribe } = useContractUpload();
  const { dateFormat, formatDate } = useDateFormatters();
  const processingCount = jobs.filter(j => j.status === 'processing').length;

  const fetchDocs = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await api.get('/api/compliance-history');
      setDocuments(res.data.history || []);
    } catch (err) {
      console.error('Failed to fetch', err);
      setLoadError(isHttpError(err)
        ? (err.response.data?.detail || 'Gagal memuat daftar dokumen.')
        : NETWORK_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    (async () => { await fetchDocs(); })();
    // Refresh the list whenever a background analysis job finishes
    return subscribe(() => { fetchDocs(); });
  }, [subscribe]);

  const handleView = async (doc: AnalyzedDocument) => {
    if (viewingDoc?.id === doc.id) { setViewingDoc(null); return; }
    setLoadingViewId(doc.id);
    try {
      const res = await api.get(`/api/compliance-history/${doc.id}`);
      setViewingDoc(res.data);
    } catch (e) {
      console.error(e);
      notify('error', isHttpError(e)
        ? 'Gagal memuat analisis. Coba buka lagi dalam beberapa saat.'
        : NETWORK_ERROR, 12000);
    } finally { setLoadingViewId(null); }
  };

  const handleDownloadCalendar = async (doc: AnalyzedDocument) => {
    try {
      const res = await api.get(`/api/compliance-history/${doc.id}/calendar`, { responseType: 'blob' });
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract_expiry_${doc.company_name?.replace(/\s+/g, '_') || doc.id}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      notify('error', isHttpError(e)
        ? 'Gagal mengunduh kalender. Coba lagi dalam beberapa saat.'
        : NETWORK_ERROR, 12000);
    }
  };

  // Compute KPIs
  const total = documents.length;
  const expired = documents.filter(d => getExpiryInfo(d.expiration_date, dateFormat).status === 'expired').length;
  const expiring = documents.filter(d => getExpiryInfo(d.expiration_date, dateFormat).status === 'warning').length;
  const active = documents.filter(d => getExpiryInfo(d.expiration_date, dateFormat).status === 'active').length;

  // Filter + search, then default-sort by urgency: expired first (most
  // overdue on top), then soonest expiry; null-expiry rows last — the list
  // is a countdown queue, not API order (critique P1 #3).
  const filtered = documents
    .filter(doc => {
      const expiry = getExpiryInfo(doc.expiration_date, dateFormat);
      const matchesTab = filterTab === 'all' ||
        (filterTab === 'active' && expiry.status === 'active') ||
        (filterTab === 'expiring' && expiry.status === 'warning') ||
        (filterTab === 'expired' && expiry.status === 'expired');
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        doc.filename.toLowerCase().includes(q) ||
        (doc.company_name || '').toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    })
    .map(doc => ({ doc, daysLeft: getExpiryInfo(doc.expiration_date, dateFormat).daysLeft }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
    .map(x => x.doc);

  // CSV of exactly what the list shows (current filter/search/sort) — the
  // "export everything expiring" off-ramp the monitor lacked (critique P1 #3).
  const handleExportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Berkas', 'Perusahaan', 'Tanggal Kedaluwarsa', 'Status', 'Sisa Hari'];
    const rows = filtered.map(doc => {
      const expiry = getExpiryInfo(doc.expiration_date, dateFormat);
      return [
        doc.filename,
        doc.company_name || 'Tidak terdeteksi',
        doc.expiration_date ? formatDateWith(dateFormat, new Date(doc.expiration_date), 'short') : 'Tidak terdeteksi',
        expiryStatusWord(expiry.status),
        expiry.daysLeft === null ? '' : String(expiry.daysLeft),
      ].map(esc).join(',');
    });
    // BOM keeps Excel reading the UTF-8 filenames correctly
    const csv = '\uFEFF' + [header.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kontrak_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const filterTabs: { id: FilterTab; label: string; color: string; text: string; bg: string }[] = [
    { id: 'all',      label: 'Semua',           color: 'var(--accent-color)', text: 'var(--accent-hover)', bg: 'var(--accent-glow)' },
    { id: 'active',   label: 'Aktif',           color: 'var(--success)', text: 'var(--success-text)', bg: 'rgba(16,185,129,0.15)' },
    { id: 'expiring', label: 'Segera Berakhir', color: 'var(--warning)', text: 'var(--warning-text)', bg: 'rgba(245,158,11,0.15)' },
    { id: 'expired',  label: 'Kedaluwarsa',     color: 'var(--danger)', text: 'var(--danger-text)', bg: 'rgba(239,68,68,0.15)' },
  ];

  return (
    <div className="view-container cm-view">
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <CalendarClock size={24} color="var(--accent-color)" aria-hidden="true" />
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Kontrak</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Pantau status dan kedaluwarsa seluruh dokumen analisis Anda.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            title="Unduh daftar yang sedang tampil sebagai CSV"
          >
            <Download size={16} aria-hidden="true" /> Ekspor CSV
          </button>
          {/* No inline colors: .upload-btn's ink-on-accent pairing is the
              documented AA-safe face in both themes (theme-dark.css). */}
          <button className="upload-btn" onClick={() => setUploadOpen(true)}>
            <Upload size={18} /> Upload Dokumen
          </button>
        </div>
      </div>

      {/* Analysis job history: in-flight, done, failed and refresh-interrupted
          records (persisted by UploadProvider) with retry for failures — no
          job ends as a vanishing 12-second toast anymore (critique P1 #1). */}
      {jobs.length > 0 && (
        <section className="cm-jobs" aria-label="Riwayat analisis dokumen">
          <div className="cm-jobs-header">
            <h3>Riwayat Analisis</h3>
            {processingCount > 0 && (
              <span className="bg-jobs-pill" role="status">
                <RefreshCw size={14} className="animate-spin-slow" aria-hidden="true" />
                {processingCount} dokumen sedang dianalisis di latar belakang…
              </span>
            )}
            <button
              type="button"
              className="cm-jobs-clear"
              onClick={clearJobs}
              disabled={jobs.every(j => j.status === 'processing')}
            >
              Bersihkan
            </button>
          </div>
          <ul className="cm-jobs-list">
            {jobs.slice().reverse().map(job => (
              <li key={job.id} className="cm-jobs-item">
                <span className={`cm-jobs-icon cm-jobs-icon--${job.status}`} aria-hidden="true">
                  {job.status === 'processing' && <RefreshCw size={16} className="animate-spin-slow" />}
                  {job.status === 'done' && <CheckCircle size={16} />}
                  {(job.status === 'error' || job.status === 'interrupted') && <AlertTriangle size={16} />}
                </span>
                <span className="cm-jobs-main">
                  <span className="cm-jobs-name" title={job.filename}>{job.filename}</span>
                  {job.status === 'error' && job.error && (
                    <span className="cm-jobs-error">{job.error}</span>
                  )}
                  {job.status === 'interrupted' && (
                    <span className="cm-jobs-note">Terputus oleh muat ulang halaman — unggah ulang dokumen untuk mencoba lagi.</span>
                  )}
                </span>
                <span className={`cm-jobs-status cm-jobs-status--${job.status}`}>
                  {JOB_STATUS_LABEL[job.status]}
                </span>
                {job.status === 'error' && (
                  <button type="button" className="cm-jobs-retry" onClick={() => retryJob(job.id)}>
                    <RefreshCw size={13} aria-hidden="true" /> Coba lagi
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* KPI cards double as the filter control — one count display, one way
          to slice the list (critique P1 #3 + decision b). Sub-labels document
          the ≤31-day threshold that defines "Segera Berakhir" (heuristic 6).
          .stats-row brings the system card grammar and its responsive rules
          (2-up ≤1024px, 1-col ≤767px) that the old inline grid blocked. */}
      <div className="stats-row">
        {[
          { tab: 'all' as FilterTab,      heading: `${total} Total`,                sub: 'Dokumen terpantau',        iconClass: 'blue',   icon: <FileCheck size={20} /> },
          { tab: 'active' as FilterTab,   heading: `${active} Aktif`,               sub: 'Berlaku > 31 hari',        iconClass: 'green',  icon: <ShieldCheck size={20} /> },
          { tab: 'expiring' as FilterTab, heading: `${expiring} Segera Berakhir`,   sub: 'Kedaluwarsa ≤ 31 hari',    iconClass: 'orange', icon: <Clock size={20} /> },
          { tab: 'expired' as FilterTab,  heading: `${expired} Kedaluwarsa`,        sub: 'Melewati tanggal berakhir', iconClass: 'red',    icon: <XCircle size={20} /> },
        ].map(kpi => (
          <button
            key={kpi.tab}
            type="button"
            className={`stat-card stat-card--filter${filterTab === kpi.tab ? ' stat-card--active' : ''}`}
            aria-pressed={filterTab === kpi.tab}
            onClick={() => setFilterTab(filterTab === kpi.tab && kpi.tab !== 'all' ? 'all' : kpi.tab)}
            title={filterTab === kpi.tab && kpi.tab !== 'all' ? 'Klik untuk menampilkan semua dokumen' : 'Klik untuk memfilter daftar'}
          >
            <div className={`stat-icon ${kpi.iconClass}`}>{kpi.icon}</div>
            <div className="stat-info">
              <h4>{kpi.heading}</h4>
              <p>{kpi.sub}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} aria-hidden="true" />
          <input
            type="text"
            placeholder="Cari nama perusahaan atau file..."
            aria-label="Cari nama perusahaan atau file"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: search ? '10px 40px 10px 36px' : '10px 12px 10px 36px', background: 'var(--bg-element)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
          {search && (
            <button type="button" className="cm-search-clear" onClick={() => setSearch('')} aria-label="Bersihkan pencarian">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Tabs mirror the KPI filter state; counts live on the KPI cards only
            (one count display). The old count pill's hardcoded ink tint —
            invisible in dark theme — went away with it. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="group" aria-label="Filter status dokumen">
          {filterTabs.map(tab => (
            <button key={tab.id} onClick={() => setFilterTab(tab.id)} aria-pressed={filterTab === tab.id} style={{
              padding: '8px 14px', minHeight: '44px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              background: filterTab === tab.id ? tab.bg : 'var(--bg-card)',
              border: filterTab === tab.id ? `1px solid ${tab.color}` : '1px solid var(--border-color)',
              color: filterTab === tab.id ? tab.text : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document List — four honest states: loading, load-failed, empty,
          and no-match, each with its own copy and recovery affordance */}
      {isLoading ? (
        <LoadingOrb className="loading-orb--padded" label="Memuat dokumen..." />
      ) : loadError ? (
        <div className="cm-state-panel">
          <AlertTriangle size={40} aria-hidden="true" />
          <h3>Gagal memuat dokumen</h3>
          <p>{loadError}</p>
          <button className="btn btn-primary" onClick={() => { void fetchDocs(); }}>
            <RefreshCw size={16} aria-hidden="true" /> Coba lagi
          </button>
        </div>
      ) : filtered.length === 0 ? (
        documents.length === 0 ? (
          <div className="cm-state-panel">
            <Inbox size={40} aria-hidden="true" />
            <h3>Belum ada dokumen</h3>
            <p>Upload dokumen PKS untuk memulai analisis kepatuhan dan pemantauan kedaluwarsa otomatis.</p>
            <button className="upload-btn" onClick={() => setUploadOpen(true)}>
              <Upload size={18} /> Upload Dokumen
            </button>
          </div>
        ) : (
          <div className="cm-state-panel">
            <FileX size={40} aria-hidden="true" />
            <h3>Tidak ada dokumen yang cocok</h3>
            <p>Tidak ada dokumen dengan filter atau kata kunci saat ini.</p>
            <button className="btn btn-secondary" onClick={() => { setSearch(''); setFilterTab('all'); }}>
              Hapus filter
            </button>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(doc => {
            const expiry = getExpiryInfo(doc.expiration_date, dateFormat);
            const isViewing = viewingDoc?.id === doc.id;
            return (
              <div key={doc.id}>
                <div style={{
                  background: 'var(--bg-element)', borderRadius: '14px', padding: '18px 20px',
                  border: expiry.status === 'expired' || expiry.status === 'warning'
                    ? `1px solid ${expiry.badgeBorder}` : '1px solid var(--border-color)',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    {/* Status stripe */}
                    <div style={{ width: 4, borderRadius: '4px', background: expiry.badgeColor, alignSelf: 'stretch', flexShrink: 0, minHeight: '40px' }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <p title={doc.filename} style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px' }}>
                            {doc.filename}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                              <Building size={13} aria-hidden="true" />
                              {doc.company_name || <em style={{ opacity: 0.6 }}>Tidak terdeteksi</em>}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                              <Calendar size={13} aria-hidden="true" />
                              Dianalisis: {formatDate(doc.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Expiry badge + actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                            color: expiry.badgeColor, background: expiry.badgeBg, border: `1px solid ${expiry.badgeBorder}`,
                            display: 'flex', alignItems: 'center', gap: '5px'
                          }}>
                            {expiry.status === 'expired' && <XCircle size={12} aria-hidden="true" />}
                            {expiry.status === 'warning' && expiry.imminent && <AlertTriangle size={12} aria-hidden="true" />}
                            {expiry.status === 'warning' && !expiry.imminent && <Clock size={12} aria-hidden="true" />}
                            {expiry.status === 'active' && <CheckCircle size={12} aria-hidden="true" />}
                            {expiry.label}
                          </span>

                          <button onClick={() => handleView(doc)} title="Lihat Analisis" aria-expanded={isViewing}
                            aria-busy={loadingViewId === doc.id} style={{
                            padding: '6px 12px', minHeight: '44px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500,
                            background: isViewing ? 'var(--accent-glow)' : 'var(--bg-element)',
                            border: isViewing ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                            color: isViewing ? 'var(--accent-hover)' : 'var(--text-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px'
                          }}>
                            {loadingViewId === doc.id
                              ? <><Loader2 size={13} className="admin-spin" aria-hidden="true" />Memuat…</>
                              : <><Eye size={13} aria-hidden="true" />{isViewing ? 'Tutup' : 'Lihat Analisis'}</>}
                          </button>

                          {/* ICS export needs an expiry date — on null-expiry rows
                              the button could only ever fail, so it isn't offered
                              (guaranteed-failure control, critique persona Alex). */}
                          {doc.expiration_date && (
                            <button onClick={() => handleDownloadCalendar(doc)} title="Tambah ke Kalender" aria-label="Tambah ke Kalender" style={{
                              width: 44, height: 44, borderRadius: '8px', background: 'var(--accent-glow)',
                              border: '1px solid var(--border-highlight)', color: 'var(--accent-color)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}><Calendar size={16} /></button>
                          )}

                          <button onClick={() => setEditDoc(doc)} title="Edit" aria-label="Edit metadata dokumen" style={{
                            width: 44, height: 44, borderRadius: '8px', background: 'var(--bg-element)',
                            border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}><Edit2 size={16} /></button>

                          <button onClick={() => setDeleteDoc(doc)} title="Hapus" aria-label={`Hapus ${doc.filename}`} style={{
                            width: 44, height: 44, borderRadius: '8px', background: 'var(--danger-bg)',
                            border: '1px solid var(--danger-border)', color: 'var(--danger-text)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}><Trash2 size={16} /></button>
                        </div>
                      </div>

                      {/* Notification bar — text only; the old literal "⚠"
                          character was read mid-sentence by screen readers */}
                      {expiry.notifText && (
                        <div style={{
                          marginTop: '10px', padding: '7px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 500,
                          background: `${expiry.badgeBg}`, border: `1px solid ${expiry.badgeBorder}`, color: expiry.notifColor
                        }}>
                          {expiry.notifText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline viewer */}
                {isViewing && viewingDoc && (
                  <div style={{ background: 'var(--bg-element)', borderRadius: '14px', border: '1px solid var(--border-highlight)', marginTop: '4px', padding: '0 12px 24px' }}>
                    <button onClick={() => setViewingDoc(null)} style={{
                      display: 'flex', alignItems: 'center', gap: '6px', margin: '16px 0 8px',
                      background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem'
                    }}>
                      <X size={14} aria-hidden="true" /> Tutup Hasil Analisis
                    </button>
                    <ComplianceResultsViewer
                      filename={viewingDoc.filename}
                      summary={viewingDoc.results?.summary ?? null}
                      results={viewingDoc.results?.results ?? null}
                      headerActions={null}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation — styled danger dialog naming the document,
          failure inline with retry; replaces window.confirm (critique P1 #4) */}
      {deleteDoc && (
        <ConfirmDialog
          state={{
            title: 'Hapus dokumen?',
            body: `Hapus "${deleteDoc.filename}" dari monitoring? Hasil analisis dokumen ini tidak dapat dipulihkan.`,
            confirmLabel: 'Hapus',
            onConfirm: async () => {
              try {
                await api.delete(`/api/compliance-history/${deleteDoc.id}`);
              } catch (e) {
                // Rethrow so the dialog stays open with the reason inline —
                // no more unhandled rejections that leave the row sitting there.
                throw new Error(isHttpError(e)
                  ? (e.response.data?.detail || 'Gagal menghapus dokumen.')
                  : NETWORK_ERROR);
              }
              setDocuments(prev => prev.filter(d => d.id !== deleteDoc.id));
              setViewingDoc(v => (v?.id === deleteDoc.id ? null : v));
              notify('success', `"${deleteDoc.filename}" dihapus dari monitoring.`, 6000);
            },
          }}
          onClose={() => setDeleteDoc(null)}
        />
      )}

      {/* Edit modal — trapped, labeled, pending/error states, ISO date
          normalization (critique P1 #4 + error-prevention P1 #5) */}
      {editDoc && (
        <EditMetadataDialog
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={(companyName, expirationDate) => {
            setDocuments(prev => prev.map(d =>
              d.id === editDoc.id ? { ...d, company_name: companyName, expiration_date: expirationDate } : d
            ));
            notify('success', 'Metadata dokumen diperbarui.', 6000);
          }}
        />
      )}

      {/* Upload modal — merged Compliance Checker flow */}
      {uploadOpen && (
        <ContractUploadModal onClose={() => setUploadOpen(false)} />
      )}
    </div>
  );
}
