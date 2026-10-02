import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Shield, Database, FileText, AlertTriangle, CheckCircle2,
  Clock, Users, Server, Eye, Lock, XCircle, RefreshCw,
  X, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { useDateFormatters } from '../format';
import { useAuth } from '../context/AuthContext';
import LoadingOrb from './LoadingOrb';

interface StatusDoc {
  id: number;
  judul: string;
  nomor: string | null;
  status: string;
}

interface AuditLog {
  id: number;
  timestamp: string;
  user_id: string;
  action_type: string;
  resource_id: string;
  details: string;
}

interface DashboardData {
  doc_status: Record<string, number>;
  doc_by_klasifikasi: Record<string, number>;
  doc_by_jenis: { jenis: string; count: number }[];
  active_grants: number;
  audit_logs: AuditLog[];
  /** Legacy key names ("sqlite"/"chromadb") are a frozen API contract;
      both have probed PostgreSQL since Migration M3. */
  system_health: { sqlite: boolean; chromadb: boolean };
  doc_details?: Record<string, StatusDoc[]>;
}

interface Exclusion {
  id: number;
  entity_name: string;
  created_at: string;
}

type Tone = 'success' | 'warning' | 'danger';

interface StatusCardProps {
  label: string;
  value: number;
  tone: Tone;
  icon: React.ReactNode;
  docs: StatusDoc[];
  totalDocs: number;
}

interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Must match DOC_DETAILS_LIMIT in la-legpro-be/api/routers/admin.py. */
const DOC_DETAILS_LIMIT = 100;
const AUDIT_PAGE_SIZE = 20;

/** Audit actions on the documented status-chip vocabulary: revoke and
    document-delete ride the "revoked" red, upload the "new" sky, grant
    the success green; anything else stays neutral (the triad hues
    otherwise encode legal status only). Inventory: the backend logs
    SEARCH, GRANT_ACCESS, REVOKE_ACCESS, DELETE_DOCUMENT literals
    (db_service.log_audit call sites); UPLOAD survives in migrated legacy
    rows. Replaces the hardcoded #7e22ce/#be123c map — forbidden purple,
    rose double duty with "Terbatas", and 1.98:1 in dark theme. */
const ACTION_CHIP: Record<string, string> = {
  SEARCH: 'status-chip--neutral',
  UPLOAD: 'status-chip--new',
  GRANT_ACCESS: 'status-chip--success',
  REVOKE_ACCESS: 'status-chip--revoked',
  DELETE_DOCUMENT: 'status-chip--revoked',
};

/** Klasifikasi legend/bar hues via theme-aware tokens: deep -700 variants
    on light glass, 300-level tints in dark (tokens.css). Rahasia reuses
    --warning-text (the same deep amber, flips automatically). */
const KLASIFIKASI_COLOR: Record<string, string> = {
  Umum: 'var(--dv-cyan)',
  Rahasia: 'var(--warning-text)',
  Terbatas: 'var(--dv-rose)',
};
const FALLBACK_COLOR = 'var(--text-secondary)';

const StatusCard = ({ label, value, tone, icon, docs, totalDocs }: StatusCardProps) => {
  const [search, setSearch] = useState('');
  const inputId = `admin-card-search-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const q = search.trim().toLowerCase();

  const filteredDocs = q
    ? docs.filter(d =>
        (d.judul || '').toLowerCase().includes(q) ||
        (d.nomor || '').toLowerCase().includes(q))
    : docs;

  const pct = totalDocs > 0 ? Math.min(1, value / totalDocs) : 0;
  const capped = value > docs.length;
  const meta = q
    ? `${filteredDocs.length} cocok dari ${Math.min(docs.length, DOC_DETAILS_LIMIT)} dokumen dimuat`
    : capped
      ? `Menampilkan ${docs.length} pertama dari ${value} dokumen`
      : `${value} dokumen`;

  return (
    <div className={`admin-status-card admin-status-card--${tone}`}>
      <div className="admin-status-body">
        <div className="admin-status-head">
          <span aria-hidden="true">{icon}</span>
          <span className="admin-status-label">{label}</span>
        </div>
        <div className="admin-status-value">{value}</div>
        <div className="admin-status-track" aria-hidden="true">
          <div className="admin-status-fill" style={{ transform: `scaleX(${pct})` }} />
        </div>
      </div>
      <div className="admin-status-browser">
        <div className="admin-card-search">
          <label htmlFor={inputId} className="visually-hidden">Cari regulasi berstatus {label}</label>
          <input
            id={inputId}
            type="text"
            placeholder={`Cari regulasi ${label.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setSearch('')}
              aria-label={`Bersihkan pencarian regulasi ${label.toLowerCase()}`}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="admin-doc-list">
          {filteredDocs.length > 0 ? (
            filteredDocs.map(d => (
              <div key={d.id} className="admin-doc-item">
                <div className="admin-doc-title">{d.judul}</div>
                {d.nomor && <div className="admin-doc-nomor">{d.nomor}</div>}
              </div>
            ))
          ) : (
            <p className="admin-list-empty">
              {q ? `Tidak ada dokumen yang cocok dengan "${search.trim()}".` : 'Belum ada dokumen.'}
            </p>
          )}
        </div>
        <p className="admin-list-meta">{meta}</p>
      </div>
    </div>
  );
};

/** System-consistent confirmation dialog (mirrors LegalOpinion's AppDialog
    pattern): replaces window.confirm for the destructive FR-30 actions. */
const ConfirmDialog = ({ state, onClose }: { state: ConfirmState; onClose: () => void }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, [state]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
        <h3 className="confirm-modal-title" id="admin-confirm-title">{state.title}</h3>
        <p className="confirm-modal-body">{state.body}</p>
        <div className="confirm-modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { state.onConfirm(); onClose(); }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const { formatDateTime, formatTime } = useDateFormatters();
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [exclusionsError, setExclusionsError] = useState(false);
  const [newExclusion, setNewExclusion] = useState('');
  const [addingExclusion, setAddingExclusion] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);

  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditPage, setAuditPage] = useState(0);

  const showFeedback = useCallback((kind: 'success' | 'error', text: string) => {
    window.clearTimeout(feedbackTimer.current);
    setFeedback({ kind, text });
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 8000);
  }, []);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  /** Refresh never blanks the page: the skeleton shows only while data is
      null; later pulls keep the (stale) view, spin the hero button, and
      surface failures as an inline alert instead of a content vacuum. */
  const runFetch = useCallback(async () => {
    // Per-call catch: a failing endpoint still lets the other one load
    const res = await api.get('/api/admin/dashboard').catch((e) => { console.error('Dashboard fetch error:', e); return null; });
    if (res) {
      setData(res.data);
      setLastRefresh(new Date());
      setLoadError(null);
    } else {
      setLoadError('Gagal memuat statistik dashboard.');
    }

    const excRes = await api.get('/api/admin/kg-exclusions').catch((e) => { console.error('KG exclusions fetch error:', e); return null; });
    if (excRes) {
      setExclusions(excRes.data.exclusions);
      setExclusionsError(false);
    } else {
      setExclusionsError(true);
    }
  }, []);

  /** Event-handler entry point (refresh button, retries, post-mutation):
      flips the busy flags around the fetch. */
  const fetchAll = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      await runFetch();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [runFetch]);

  useEffect(() => {
    // Initial load: `loading` already starts true, so the effect needs no
    // synchronous setState (react-hooks/set-state-in-effect) — the async
    // block clears the flag once the fetch settles.
    (async () => {
      try { await runFetch(); } finally { setLoading(false); }
    })();
  }, [runFetch]);

  const addExclusion = async (name: string) => {
    setAddingExclusion(true);
    try {
      const res = await api.post('/api/admin/kg-exclusions', { entity_name: name });
      const deletedNodes: number = res.data?.deleted_nodes ?? 0;
      const deletedEdges: number = res.data?.deleted_edges ?? 0;
      setNewExclusion('');
      // FR-30 deletes matching KG nodes/edges server-side; report exactly
      // what was destroyed instead of a silent success (backend returns
      // the counts, admin.py POST /kg-exclusions).
      showFeedback('success', deletedNodes + deletedEdges > 0
        ? `Pengecualian "${name}" ditambahkan — ${deletedNodes} node dan ${deletedEdges} relasi dihapus dari Knowledge Graph.`
        : `Pengecualian "${name}" ditambahkan. Tidak ada node atau relasi yang cocok untuk dihapus.`);
      await fetchAll(true);
    } catch (e) {
      const detail = isHttpError(e) ? (e.response.data?.detail as string | undefined) : undefined;
      showFeedback('error', detail === 'Entity already in exclusion list'
        ? `"${name}" sudah ada dalam daftar pengecualian.`
        : `Gagal menambahkan pengecualian${detail ? `: ${detail}` : '.'}`);
      console.error('Add exclusion error:', e);
    } finally {
      setAddingExclusion(false);
    }
  };

  const requestAddExclusion = () => {
    const name = newExclusion.trim();
    if (!name || addingExclusion) return;
    // Adding is destructive: matching nodes/edges are deleted immediately.
    setConfirmState({
      title: 'Kecualikan entitas dari Knowledge Graph?',
      body: `Node dan relasi yang cocok dengan "${name}" akan dihapus dari graf. Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Kecualikan Entitas',
      onConfirm: () => { void addExclusion(name); },
    });
  };

  const deleteExclusion = async (exc: Exclusion) => {
    try {
      await api.delete(`/api/admin/kg-exclusions/${exc.id}`);
      showFeedback('success', `Pengecualian "${exc.entity_name}" dihapus.`);
      await fetchAll(true);
    } catch (e) {
      showFeedback('error', `Gagal menghapus pengecualian "${exc.entity_name}".`);
      console.error('Delete exclusion error:', e);
    }
  };

  const requestDeleteExclusion = (exc: Exclusion) => {
    setConfirmState({
      title: 'Hapus pengecualian?',
      body: `"${exc.entity_name}" akan dihapus dari daftar pengecualian. Node dan relasi yang sudah dihapus tidak dipulihkan otomatis — entitas ini baru terekstraksi kembali saat dokumen diproses ulang.`,
      confirmLabel: 'Hapus Pengecualian',
      onConfirm: () => { void deleteExclusion(exc); },
    });
  };

  const totalDocs = data ? Object.values(data.doc_status).reduce((a, b) => a + b, 0) : 0;
  const docDetails = data?.doc_details ?? {};
  const maxJenisCount = data?.doc_by_jenis?.length ? Math.max(...data.doc_by_jenis.map(d => d.count)) : 1;

  // "Tidak Berlaku" rides the danger tone for Fixed-Vocabulary parity with
  // the repository's statusTone (LegalRepository.tsx); icon + label keep it
  // distinct from "Gagal".
  const statusCards: StatusCardProps[] = data ? [
    { label: 'Berlaku', value: data.doc_status['Berlaku'] ?? 0, tone: 'success', icon: <CheckCircle2 size={20} />, docs: docDetails['Berlaku'] ?? [], totalDocs },
    { label: 'Tidak Berlaku', value: data.doc_status['Tidak Berlaku'] ?? 0, tone: 'danger', icon: <XCircle size={20} />, docs: docDetails['Tidak Berlaku'] ?? [], totalDocs },
    { label: 'Memproses', value: data.doc_status['Memproses'] ?? 0, tone: 'warning', icon: <Clock size={20} />, docs: docDetails['Memproses'] ?? [], totalDocs },
    { label: 'Gagal', value: data.doc_status['Gagal'] ?? 0, tone: 'danger', icon: <AlertTriangle size={20} />, docs: docDetails['Gagal'] ?? [], totalDocs },
  ] : [];

  const auditLogs = useMemo(() => data?.audit_logs ?? [], [data]);
  const auditActionTypes = useMemo(
    () => Array.from(new Set(auditLogs.map(l => l.action_type))).sort(),
    [auditLogs],
  );
  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter(l =>
      (!auditAction || l.action_type === auditAction) &&
      (!q ||
        (l.user_id || '').toLowerCase().includes(q) ||
        (l.resource_id || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q)));
  }, [auditLogs, auditSearch, auditAction]);
  const pageCount = Math.max(1, Math.ceil(filteredAudit.length / AUDIT_PAGE_SIZE));
  const safePage = Math.min(auditPage, pageCount - 1);
  const pageRows = filteredAudit.slice(safePage * AUDIT_PAGE_SIZE, (safePage + 1) * AUDIT_PAGE_SIZE);
  const rangeLabel = filteredAudit.length === 0
    ? '0 entri'
    : `${safePage * AUDIT_PAGE_SIZE + 1}\u2013${Math.min((safePage + 1) * AUDIT_PAGE_SIZE, filteredAudit.length)} dari ${filteredAudit.length}`;

  const isSekretaris = (user?.role || '').toLowerCase() === 'sekretaris perusahaan';
  const heroSubtitle = isSekretaris
    ? 'Statistik operasional dan kesehatan sistem untuk corpus regulasi Anda.'
    : 'Statistik operasional dan kesehatan sistem — akses admin terbatas pada metadata, konten dokumen tidak ditampilkan.';

  return (
    <div className="view-container admin-view">
      {/* Hero — the shared navy brand surface (.hero-banner), not a
          one-off gradient (the old purple tint violated DESIGN.md's
          forbidden-hue rule). */}
      <div className="hero-banner">
        <div className="hero-content admin-hero-row">
          <div>
            <div className="hero-title-row">
              <span className="hero-icon-tile" aria-hidden="true">
                <Shield size={22} strokeWidth={1.75} />
              </span>
              <h1>Admin Dashboard</h1>
            </div>
            <p>{heroSubtitle}</p>
          </div>
          <button
            type="button"
            className="btn-hero"
            onClick={() => fetchAll(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'admin-spin' : undefined} aria-hidden="true" />
            {lastRefresh ? `Refresh (${formatTime(lastRefresh)})` : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingOrb className="loading-orb--padded" label="Memuat data dashboard..." />
      ) : !data ? (
        <div className="empty-state admin-error-state" role="alert">
          <AlertTriangle size={40} color="var(--danger-text)" aria-hidden="true" />
          <p>{loadError ?? 'Gagal memuat data dashboard.'}</p>
          <button type="button" className="btn btn-primary" onClick={() => fetchAll(false)}>
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="admin-feedback admin-feedback--error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              Gagal memuat data terbaru{lastRefresh ? ` — menampilkan data per ${formatTime(lastRefresh)}` : ''}.
              <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => fetchAll(true)}>
                Coba lagi
              </button>
            </div>
          )}

          {/* System health + counters */}
          <div className="admin-health-grid">
            {[
              { label: 'PostgreSQL Database', ok: data.system_health.sqlite, icon: <Database size={18} /> },
              { label: 'PGVector', ok: data.system_health.chromadb, icon: <Server size={18} /> },
            ].map(item => (
              <div key={item.label} className={`admin-health-tile admin-health-tile--${item.ok ? 'ok' : 'down'}`}>
                <span className={`admin-health-icon ${item.ok ? 'ok' : 'down'}`} aria-hidden="true">{item.icon}</span>
                <div>
                  <div className="admin-tile-label">{item.label}</div>
                  <div className={`admin-tile-value ${item.ok ? 'ok' : 'down'}`}>
                    {item.ok ? '● Online' : '● Offline'}
                  </div>
                </div>
              </div>
            ))}

            <div className="admin-health-tile">
              <span className="admin-health-icon accent" aria-hidden="true"><Users size={18} /></span>
              <div>
                <div className="admin-tile-label">Pemberian Akses Aktif</div>
                <div className="admin-tile-value accent">{data.active_grants}</div>
              </div>
            </div>

            <div className="admin-health-tile">
              <span className="admin-health-icon accent" aria-hidden="true"><FileText size={18} /></span>
              <div>
                <div className="admin-tile-label">Total Dokumen</div>
                <div className="admin-tile-value accent">{totalDocs}</div>
              </div>
            </div>
          </div>

          {/* Document status cards with per-status browsers */}
          <div className="admin-status-grid">
            {statusCards.map(card => (
              <StatusCard key={card.label} {...card} />
            ))}
          </div>

          {/* Volume by Klasifikasi & Jenis */}
          <div className="admin-panels-2col">
            <section className="admin-panel" aria-labelledby="admin-klas-title">
              <div className="admin-panel-head">
                <h3 className="admin-panel-title" id="admin-klas-title">
                  <Lock size={18} color="var(--accent-color)" aria-hidden="true" />
                  Volume per Klasifikasi
                </h3>
              </div>
              <p className="admin-panel-hint">Porsi terhadap total {totalDocs} dokumen.</p>
              {Object.entries(data.doc_by_klasifikasi).map(([klas, count]) => {
                const color = KLASIFIKASI_COLOR[klas] ?? FALLBACK_COLOR;
                return (
                  <div key={klas} className="admin-bar-row">
                    <div className="admin-bar-head">
                      <span className="admin-bar-label">
                        <span className="admin-legend-dot" style={{ background: color }} aria-hidden="true" />
                        <span className="admin-bar-name" title={klas}>{klas}</span>
                      </span>
                      <span className="admin-bar-count" style={{ color }}>{count}</span>
                    </div>
                    <div className="admin-bar-track" aria-hidden="true">
                      <div
                        className="admin-bar-fill"
                        style={{ background: color, transform: `scaleX(${totalDocs > 0 ? count / totalDocs : 0})` }}
                      />
                    </div>
                  </div>
                );
              })}
              {Object.keys(data.doc_by_klasifikasi).length === 0 && (
                <p className="admin-list-empty">Tidak ada data</p>
              )}
            </section>

            <section className="admin-panel" aria-labelledby="admin-jenis-title">
              <div className="admin-panel-head">
                <h3 className="admin-panel-title" id="admin-jenis-title">
                  <FileText size={18} color="var(--accent-color)" aria-hidden="true" />
                  Volume per Jenis
                </h3>
              </div>
              <p className="admin-panel-hint">10 jenis teratas — panjang batang relatif terhadap jenis terbanyak.</p>
              {data.doc_by_jenis.length === 0 ? (
                <p className="admin-list-empty">Tidak ada data</p>
              ) : (
                data.doc_by_jenis.map(item => (
                  <div key={item.jenis || 'Tidak Diketahui'} className="admin-bar-row">
                    <div className="admin-bar-head">
                      <span className="admin-bar-label">
                        <span className="admin-bar-name" title={item.jenis || 'Tidak Diketahui'}>
                          {item.jenis || 'Tidak Diketahui'}
                        </span>
                      </span>
                      <span className="admin-bar-count" style={{ color: 'var(--accent-hover)' }}>{item.count}</span>
                    </div>
                    <div className="admin-bar-track" aria-hidden="true">
                      <div
                        className="admin-bar-fill"
                        style={{ background: 'var(--accent-color)', transform: `scaleX(${maxJenisCount > 0 ? item.count / maxJenisCount : 0})` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>

          {/* FR-30: KG entity exclusions */}
          <section className="admin-panel" aria-labelledby="admin-kg-title">
            <div className="admin-panel-head">
              <h3 className="admin-panel-title" id="admin-kg-title">
                <Shield size={18} color="var(--danger)" aria-hidden="true" />
                Pengecualian Entitas Knowledge Graph
              </h3>
            </div>
            <p className="admin-panel-hint">
              Entitas yang dikecualikan tidak diekstraksi ke dalam Knowledge Graph.
              Menambahkan pengecualian akan menghapus node dan relasi entitas tersebut
              yang sudah ada — tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="admin-exclusion-form">
              <label htmlFor="admin-new-exclusion" className="visually-hidden">Nama entitas untuk dikecualikan</label>
              <input
                id="admin-new-exclusion"
                className="admin-input"
                type="text"
                placeholder="Nama entitas untuk dikecualikan (misal: 'Menteri Hukum', 'Kementerian X')..."
                value={newExclusion}
                onChange={e => setNewExclusion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') requestAddExclusion(); }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={requestAddExclusion}
                disabled={addingExclusion || !newExclusion.trim()}
              >
                {addingExclusion ? 'Menambahkan...' : 'Tambah Pengecualian'}
              </button>
            </div>

            {feedback && (
              <div
                className={`admin-feedback admin-feedback--${feedback.kind}`}
                role={feedback.kind === 'error' ? 'alert' : 'status'}
              >
                {feedback.text}
              </div>
            )}

            {exclusionsError ? (
              <div className="admin-feedback admin-feedback--error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                Gagal memuat daftar pengecualian.
                <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => fetchAll(true)}>
                  Coba lagi
                </button>
              </div>
            ) : (
              <div className="compliance-table-wrap">
                <table className="compliance-table">
                  <caption className="visually-hidden">Daftar entitas yang dikecualikan dari Knowledge Graph</caption>
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Nama Entitas</th>
                      <th scope="col">Ditambahkan Pada</th>
                      <th scope="col" className="admin-th-action">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exclusions.map(exc => (
                      <tr key={exc.id}>
                        <td className="admin-mono">{exc.id}</td>
                        <td className="admin-entity-name">{exc.entity_name}</td>
                        <td className="admin-cell-secondary admin-nowrap">{formatDateTime(exc.created_at)}</td>
                        <td className="admin-cell-action">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--danger"
                            onClick={() => requestDeleteExclusion(exc)}
                            aria-label={`Hapus pengecualian ${exc.entity_name}`}
                            title={`Hapus pengecualian ${exc.entity_name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {exclusions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="admin-table-empty">Belum ada entitas yang dikecualikan.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Audit logs — FE-side search/filter/pagination over the 100
              rows the API returns (parity with the engineer-only
              SystemMonitoring viewer, which admins cannot reach). */}
          <section className="admin-panel" aria-labelledby="admin-audit-title">
            <div className="admin-panel-head">
              <h3 className="admin-panel-title" id="admin-audit-title">
                <Eye size={18} color="var(--warning)" aria-hidden="true" />
                Log Audit
              </h3>
              <span className="status-chip status-chip--neutral">Append-Only</span>
              <span className="admin-panel-note">{auditLogs.length} entri terbaru</span>
            </div>

            <div className="admin-toolbar">
              <label htmlFor="admin-audit-search" className="visually-hidden">Cari log audit</label>
              <input
                id="admin-audit-search"
                className="admin-input"
                type="text"
                placeholder="Cari user, resource, atau detail..."
                value={auditSearch}
                onChange={e => { setAuditSearch(e.target.value); setAuditPage(0); }}
              />
              <label htmlFor="admin-audit-action" className="visually-hidden">Filter jenis aksi</label>
              <select
                id="admin-audit-action"
                className="admin-select"
                value={auditAction}
                onChange={e => { setAuditAction(e.target.value); setAuditPage(0); }}
              >
                <option value="">Semua Aksi</option>
                {auditActionTypes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {filteredAudit.length === 0 ? (
              <p className="admin-list-empty">
                {auditLogs.length === 0 ? 'Belum ada entri log audit.' : 'Tidak ada log yang cocok dengan pencarian atau filter.'}
              </p>
            ) : (
              <>
                <div className="compliance-table-wrap">
                  <table className="compliance-table">
                    <caption className="visually-hidden">{auditLogs.length} entri log audit terbaru</caption>
                    <thead>
                      <tr>
                        {['Waktu', 'User ID', 'Aksi', 'Resource', 'Detail'].map(h => (
                          <th key={h} scope="col">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(log => (
                        <tr key={log.id}>
                          <td className="admin-cell-secondary admin-nowrap">{formatDateTime(log.timestamp)}</td>
                          <td className="admin-mono" title={log.user_id}>
                            {log.user_id ? `${log.user_id.slice(0, 8)}\u2026` : '\u2014'}
                          </td>
                          <td>
                            <span className={`status-chip ${ACTION_CHIP[log.action_type] ?? 'status-chip--neutral'}`}>
                              {log.action_type}
                            </span>
                          </td>
                          <td className="admin-mono admin-cell-truncate" title={log.resource_id || undefined}>
                            {log.resource_id || '\u2014'}
                          </td>
                          <td className="admin-cell-secondary admin-cell-truncate" title={log.details || undefined}>
                            {log.details || '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-pagination">
                  <span className="admin-page-info">{rangeLabel}</span>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => setAuditPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    aria-label="Halaman berikutnya"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {confirmState && (
        <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      )}
    </div>
  );
}
