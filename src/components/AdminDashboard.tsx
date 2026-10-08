import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Shield, Database, FileText, AlertTriangle, CheckCircle2,
  Clock, Users, Server, Eye, Lock, XCircle, RefreshCw,
  X, Trash2, ChevronLeft, ChevronRight, Download, UserX, UserCheck, Loader2
} from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { useDateFormatters } from '../format';
import { useAuth } from '../hooks/useAuth';
import { useDialogA11y } from '../hooks/useDialogA11y';
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
  /** LEFT JOIN users — NULL when the account no longer exists; the viewer
      falls back to the UUID prefix. */
  username: string | null;
  action_type: string;
  resource_id: string;
  details: string;
}

interface DashboardData {
  doc_status: Record<string, number>;
  doc_by_klasifikasi: Record<string, number>;
  doc_by_jenis: { jenis: string; count: number }[];
  active_grants: number;
  /** audit_logs moved to GET /api/admin/audit-logs (server pagination,
      date range, username join, export — 2026-10-06 critique P1). */
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

interface ManagedUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  /** Server-computed: target strictly below the actor's role level and not
      the actor. Presentation only — every mutation re-checks server-side. */
  manageable: boolean;
  is_self: boolean;
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
  /** 'danger' (default) for destructive acts; 'primary' for reversible ones
      (reactivating an account, changing a role). */
  confirmTone?: 'danger' | 'primary';
  /** Resolves → dialog closes. Rejects → dialog stays open with the error
      inline, so the admin can retry or cancel with full context. */
  onConfirm: () => Promise<void>;
}

/** Must match DOC_DETAILS_LIMIT in la-legpro-be/api/routers/admin.py. */
const DOC_DETAILS_LIMIT = 100;
const AUDIT_PAGE_SIZE = 20;

/** Role ladder — must match ROLE_LEVELS in la-legpro-be/api/auth.py. */
const ROLE_LEVELS: Record<string, number> = {
  pengguna: 1,
  manajer: 2,
  direktur: 3,
  admin: 4,
  'sekretaris perusahaan': 5,
  'insinyur ti': 6,
  dewa: 7, // unofficial developer role — unassignable via the level filter below
};

/** Display labels for the stored (lowercase) role values. */
const ROLE_LABELS: Record<string, string> = {
  pengguna: 'Pengguna',
  manajer: 'Manajer',
  direktur: 'Direktur',
  admin: 'Admin',
  'sekretaris perusahaan': 'Sekretaris Perusahaan',
  'insinyur ti': 'Insinyur TI',
  dewa: 'Developer', // unofficial developer role
};

/** Audit actions on the documented status-chip vocabulary: revoke and
    document-delete ride the "revoked" red, upload the "new" sky, grant
    the success green; anything else stays neutral (the triad hues
    otherwise encode legal status only). Inventory: the backend logs
    SEARCH, GRANT_ACCESS, REVOKE_ACCESS, DELETE_DOCUMENT literals
    (db_service.log_audit call sites); UPLOAD survives in migrated legacy
    rows; CHANGE_ROLE / ACTIVATE_USER / DEACTIVATE_USER are logged by the
    admin user-management endpoints (2026-10-06); CREATE_TAXONOMY /
    RENAME_TAXONOMY / ACTIVATE_TAXONOMY / DEACTIVATE_TAXONOMY /
    DELETE_TAXONOMY by the taxonomy endpoints (2026-10-08 — cascade
    rename + audit trail, critique Issues 1–2). Replaces the hardcoded
    #7e22ce/#be123c map — forbidden purple, rose double duty with
    "Terbatas", and 1.98:1 in dark theme. */
const ACTION_CHIP: Record<string, string> = {
  SEARCH: 'status-chip--neutral',
  UPLOAD: 'status-chip--new',
  GRANT_ACCESS: 'status-chip--success',
  REVOKE_ACCESS: 'status-chip--revoked',
  DELETE_DOCUMENT: 'status-chip--revoked',
  CHANGE_ROLE: 'status-chip--neutral',
  ACTIVATE_USER: 'status-chip--success',
  DEACTIVATE_USER: 'status-chip--revoked',
  CREATE_TAXONOMY: 'status-chip--new',
  RENAME_TAXONOMY: 'status-chip--neutral',
  ACTIVATE_TAXONOMY: 'status-chip--success',
  DEACTIVATE_TAXONOMY: 'status-chip--revoked',
  DELETE_TAXONOMY: 'status-chip--revoked',
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
    pattern): replaces window.confirm for the destructive FR-30 actions.
    Hardened 2026-10-06 (critique P2): Esc / focus-in / focus-restore /
    Tab-trap come from the shared useDialogA11y hook (same behavior as
    SettingsDialog and the repository modals), the dialog stays open in a
    pending state until the mutation settles, and a rejected mutation
    surfaces inline instead of vanishing behind a dialog that closed too
    early. */
const ConfirmDialog = ({ state, onClose }: { state: ConfirmState; onClose: () => void }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mounted only while open, so `open` is a constant true. While a mutation
  // is in flight Escape gets a no-op handler — the dialog cannot vanish
  // mid-action — and the backdrop mousedown below ignores clicks for the
  // same reason. The hook restores focus to the trigger on unmount.
  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const runConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await state.onConfirm();
      onClose();
    } catch (e) {
      // Stay open: the admin sees why it failed and can retry or cancel.
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
        aria-labelledby="admin-confirm-title"
        aria-busy={pending}
        tabIndex={-1}
      >
        <h3 className="confirm-modal-title" id="admin-confirm-title">{state.title}</h3>
        <p className="confirm-modal-body">{state.body}</p>
        {error && <p className="confirm-modal-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button
            type="button"
            className={`btn ${state.confirmTone === 'primary' ? 'btn-primary' : 'btn-danger'}`}
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

  // User management (critique P0) — exact-role admin only; the BE re-checks
  // every guard, the FE gate is presentation.
  const isAdminRole = ['admin', 'dewa'].includes((user?.role || '').toLowerCase());
  const actorLevel = ROLE_LEVELS[(user?.role || '').toLowerCase()] ?? 1;
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersError, setUsersError] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');

  // Audit viewer (critique P1) — server-side pagination/filtering; auditQuery
  // is the debounced copy of auditSearch that actually hits the API.
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActionTypes, setAuditActionTypes] = useState<string[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditQuery, setAuditQuery] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditPage, setAuditPage] = useState(1); // 1-based, matches the API
  const [auditLoading, setAuditLoading] = useState(true); // first fetch is in flight on mount
  const [auditError, setAuditError] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  const showFeedback = useCallback((kind: 'success' | 'error', text: string) => {
    window.clearTimeout(feedbackTimer.current);
    setFeedback({ kind, text });
    // Errors persist until dismissed (critique P2: the old 8 s auto-dismiss
    // could hide a failed destructive action before it was read); successes
    // keep the timeout so they don't stack up during a batch of edits.
    if (kind === 'success') {
      feedbackTimer.current = window.setTimeout(() => setFeedback(null), 8000);
    }
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

    // User management is exact-role admin only (the BE would 403 anyway —
    // skipping the call keeps sekretaris perusahaan's network tab clean).
    if (isAdminRole) {
      const usersRes = await api.get('/api/admin/users').catch((e) => { console.error('Users fetch error:', e); return null; });
      if (usersRes) {
        setManagedUsers(usersRes.data.users);
        setUsersError(false);
      } else {
        setUsersError(true);
      }
    }
  }, [isAdminRole]);

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

  /** Audit viewer (critique P1): its own endpoint, its own error state —
      filter/page changes refetch without touching the rest of the view.
      No setState before the first await: the busy flag is raised by the
      event handlers/debounce timeout that trigger a refetch, so the
      fetching effect stays free of synchronous renders
      (react-hooks/set-state-in-effect — same contract as
      SystemMonitoring.fetchAuditLogs). */
  const fetchAudit = useCallback(async () => {
    const res = await api.get('/api/admin/audit-logs', {
      params: {
        search: auditQuery || undefined,
        action: auditAction || undefined,
        date_from: auditFrom || undefined,
        date_to: auditTo || undefined,
        page: auditPage,
        page_size: AUDIT_PAGE_SIZE,
      },
    }).catch((e) => { console.error('Audit fetch error:', e); return null; });
    if (res) {
      setAuditLogs(res.data.logs);
      setAuditTotal(res.data.total);
      setAuditActionTypes(res.data.action_types);
      setAuditError(false);
    } else {
      setAuditError(true);
    }
    setAuditLoading(false);
  }, [auditQuery, auditAction, auditFrom, auditTo, auditPage]);

  useEffect(() => {
    // Awaited IIFE — the same shape as the initial-load effect above: every
    // setState in fetchAudit lands after its await, so the effect body
    // triggers no synchronous render (react-hooks/set-state-in-effect).
    (async () => { await fetchAudit(); })();
  }, [fetchAudit]);

  // Debounce the search field (350 ms) into the server query and restart at
  // page 1 — inside the timeout, not the effect body (set-state-in-effect).
  // The busy flag is only raised when the query really changes, so typing
  // back to the settled value never strands the viewer in a loading state.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = auditSearch.trim();
      if (next === auditQuery) return;
      setAuditLoading(true);
      setAuditQuery(next);
      setAuditPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [auditSearch, auditQuery]);

  const exportAudit = async (fmt: 'csv' | 'json') => {
    setExporting(fmt);
    try {
      // Blob download through the axios instance so the JWT header rides
      // along (window.open would hit the endpoint unauthenticated). The
      // server's filename wins when CORS exposes Content-Disposition.
      const res = await api.get('/api/admin/audit-logs/export', {
        params: {
          format: fmt,
          search: auditQuery || undefined,
          action: auditAction || undefined,
          date_from: auditFrom || undefined,
          date_to: auditTo || undefined,
        },
        responseType: 'blob',
      });
      const cd = (res.headers['content-disposition'] as string | undefined) ?? '';
      const named = /filename="?([^";]+)"?/.exec(cd);
      const filename = named?.[1] ?? `audit-logs-${Date.now()}.${fmt}`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showFeedback('success', `Ekspor ${fmt.toUpperCase()} log audit selesai diunduh (${filename}).`);
    } catch (e) {
      showFeedback('error', `Gagal mengekspor log audit sebagai ${fmt.toUpperCase()}.`);
      console.error('Audit export error:', e);
    } finally {
      setExporting(null);
    }
  };

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
      const message = detail === 'Entity already in exclusion list'
        ? `"${name}" sudah ada dalam daftar pengecualian.`
        : `Gagal menambahkan pengecualian${detail ? `: ${detail}` : '.'}`;
      showFeedback('error', message);
      console.error('Add exclusion error:', e);
      // Rethrow so the ConfirmDialog stays open with the failure inline
      // instead of closing over a mutation that never landed (critique P2).
      throw new Error(message);
    } finally {
      setAddingExclusion(false);
    }
  };

  const requestAddExclusion = async () => {
    const name = newExclusion.trim();
    if (!name || addingExclusion) return;
    // Blast-radius preview (critique P2): count what the delete will destroy
    // BEFORE the admin commits, using the same match rule the BE delete uses
    // (admin.py GET /kg-exclusions/preview). A failed preview must not block
    // the action — the dialog then says the count could not be fetched.
    let body: string;
    try {
      const res = await api.get('/api/admin/kg-exclusions/preview', { params: { entity_name: name } });
      const nodes: number = res.data?.matching_nodes ?? 0;
      const edges: number = res.data?.matching_edges ?? 0;
      if (res.data?.already_excluded) {
        showFeedback('error', `"${name}" sudah ada dalam daftar pengecualian.`);
        return;
      }
      body = nodes + edges > 0
        ? `${nodes} node dan ${edges} relasi yang cocok dengan "${name}" akan dihapus dari graf. Tindakan ini tidak dapat dibatalkan.`
        : `Tidak ada node atau relasi yang cocok dengan "${name}" — entitas hanya ditambahkan ke daftar pengecualian dan dilewati pada pemrosesan berikutnya.`;
    } catch (e) {
      console.error('KG exclusion preview error:', e);
      body = `Node dan relasi yang cocok dengan "${name}" akan dihapus dari graf (pratinjau jumlah gagal dimuat). Tindakan ini tidak dapat dibatalkan.`;
    }
    setConfirmState({
      title: 'Kecualikan entitas dari Knowledge Graph?',
      body,
      confirmLabel: 'Kecualikan Entitas',
      onConfirm: () => addExclusion(name),
    });
  };

  const deleteExclusion = async (exc: Exclusion) => {
    try {
      await api.delete(`/api/admin/kg-exclusions/${exc.id}`);
      showFeedback('success', `Pengecualian "${exc.entity_name}" dihapus.`);
      await fetchAll(true);
    } catch (e) {
      const message = `Gagal menghapus pengecualian "${exc.entity_name}".`;
      showFeedback('error', message);
      console.error('Delete exclusion error:', e);
      throw new Error(message); // keeps the ConfirmDialog open (critique P2)
    }
  };

  const requestDeleteExclusion = (exc: Exclusion) => {
    setConfirmState({
      title: 'Hapus pengecualian?',
      body: `"${exc.entity_name}" akan dihapus dari daftar pengecualian. Node dan relasi yang sudah dihapus tidak dipulihkan otomatis — entitas ini baru terekstraksi kembali saat dokumen diproses ulang.`,
      confirmLabel: 'Hapus Pengecualian',
      onConfirm: () => deleteExclusion(exc),
    });
  };

  // ── User management mutations (critique P0) ─────────────────────────────
  // Every failure rethrows so the ConfirmDialog stays open with the reason
  // inline; successes refresh the directory (and the audit feed, since each
  // mutation is audit-logged server-side).

  const changeUserRole = async (target: ManagedUser, newRole: string) => {
    try {
      await api.patch(`/api/admin/users/${target.id}/role`, { role: newRole });
      showFeedback('success', `Peran ${target.username} diubah dari ${ROLE_LABELS[target.role] ?? target.role} menjadi ${ROLE_LABELS[newRole] ?? newRole}.`);
      await fetchAll(true);
      void fetchAudit();
    } catch (e) {
      const detail = isHttpError(e) ? (e.response.data?.detail as string | undefined) : undefined;
      const message = `Gagal mengubah peran ${target.username}${detail ? `: ${detail}` : '.'}`;
      showFeedback('error', message);
      console.error('Change role error:', e);
      throw new Error(message);
    }
  };

  const requestRoleChange = (target: ManagedUser, newRole: string) => {
    setConfirmState({
      title: 'Ubah peran pengguna?',
      body: `${target.username} akan diubah dari ${ROLE_LABELS[target.role] ?? target.role} menjadi ${ROLE_LABELS[newRole] ?? newRole}. Perubahan berlaku pada permintaan berikutnya dari akun tersebut.`,
      confirmLabel: 'Ubah Peran',
      confirmTone: 'primary',
      onConfirm: () => changeUserRole(target, newRole),
    });
  };

  const setUserActive = async (target: ManagedUser, nextActive: boolean) => {
    try {
      await api.patch(`/api/admin/users/${target.id}/status`, { is_active: nextActive });
      showFeedback('success', nextActive
        ? `Akun ${target.username} diaktifkan kembali.`
        : `Akun ${target.username} dinonaktifkan — permintaan berikutnya dari akun itu akan ditolak.`);
      await fetchAll(true);
      void fetchAudit();
    } catch (e) {
      const detail = isHttpError(e) ? (e.response.data?.detail as string | undefined) : undefined;
      const message = `Gagal ${nextActive ? 'mengaktifkan' : 'menonaktifkan'} akun ${target.username}${detail ? `: ${detail}` : '.'}`;
      showFeedback('error', message);
      console.error('Set user status error:', e);
      throw new Error(message);
    }
  };

  const requestToggleActive = (target: ManagedUser) => {
    const deactivate = target.is_active;
    setConfirmState({
      title: deactivate ? 'Nonaktifkan akun?' : 'Aktifkan kembali akun?',
      body: deactivate
        ? `${target.username} tidak dapat masuk lagi, dan sesi yang sedang berjalan ditolak pada permintaan berikutnya. Akun dapat diaktifkan kembali kapan saja.`
        : `${target.username} akan dapat masuk kembali dengan peran ${ROLE_LABELS[target.role] ?? target.role}.`,
      confirmLabel: deactivate ? 'Nonaktifkan Akun' : 'Aktifkan Kembali',
      confirmTone: deactivate ? 'danger' : 'primary',
      onConfirm: () => setUserActive(target, !deactivate),
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

  // Audit pagination/range are server-driven now (critique P1).
  const auditHasFilters = Boolean(auditQuery || auditAction || auditFrom || auditTo);
  const pageCount = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));
  const rangeLabel = auditTotal === 0
    ? '0 entri'
    : `${(auditPage - 1) * AUDIT_PAGE_SIZE + 1}\u2013${Math.min(auditPage * AUDIT_PAGE_SIZE, auditTotal)} dari ${auditTotal}`;

  // Roles this actor may assign: strictly below their own level (matches the
  // BE guard in admin.py admin_change_role).
  const assignableRoles = useMemo(
    () => Object.keys(ROLE_LEVELS)
      .filter(r => ROLE_LEVELS[r] < actorLevel)
      .sort((a, b) => ROLE_LEVELS[a] - ROLE_LEVELS[b]),
    [actorLevel]);

  const visibleUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return managedUsers.filter(u =>
      (!userRoleFilter || u.role === userRoleFilter) &&
      (!q ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)));
  }, [managedUsers, userSearch, userRoleFilter]);

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

          {/* Mutation feedback, screen-global (moved out of the KG panel
              2026-10-06: it now also reports user-management results).
              Errors persist until dismissed (critique P2). */}
          {feedback && (
            <div
              className={`admin-feedback admin-feedback--${feedback.kind}`}
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              {feedback.kind === 'error' && <AlertTriangle size={16} aria-hidden="true" />}
              {feedback.text}
              {feedback.kind === 'error' && (
                <button
                  type="button"
                  className="admin-feedback-dismiss"
                  onClick={() => setFeedback(null)}
                  aria-label="Tutup pesan error"
                >
                  <X size={14} />
                </button>
              )}
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

          {/* User & role management (critique P0 — PRODUCT.md defines this
              as the admin role's job). Exact-role admin only; every guard
              is re-checked server-side (admin.py). */}
          {isAdminRole && (
            <section className="admin-panel" aria-labelledby="admin-users-title">
              <div className="admin-panel-head">
                <h3 className="admin-panel-title" id="admin-users-title">
                  <Users size={18} color="var(--accent-color)" aria-hidden="true" />
                  Manajemen Pengguna
                </h3>
                <span className="admin-panel-note">{managedUsers.length} akun terdaftar</span>
              </div>
              <p className="admin-panel-hint">
                Ubah peran atau nonaktifkan akun di bawah level peran Anda. Perubahan berlaku
                pada permintaan berikutnya dari akun tersebut — token yang sedang berjalan
                tidak perlu menunggu kedaluwarsa.
              </p>

              <div className="admin-toolbar">
                <label htmlFor="admin-user-search" className="visually-hidden">Cari pengguna</label>
                <input
                  id="admin-user-search"
                  className="admin-input"
                  type="text"
                  placeholder="Cari nama pengguna atau email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
                <label htmlFor="admin-user-role" className="visually-hidden">Filter peran</label>
                <select
                  id="admin-user-role"
                  className="admin-select"
                  value={userRoleFilter}
                  onChange={e => setUserRoleFilter(e.target.value)}
                >
                  <option value="">Semua Peran</option>
                  {Object.keys(ROLE_LABELS).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>

              {usersError ? (
                <div className="admin-feedback admin-feedback--error" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  Gagal memuat daftar pengguna.
                  <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => fetchAll(true)}>
                    Coba lagi
                  </button>
                </div>
              ) : (
                <div className="compliance-table-wrap">
                  <table className="compliance-table">
                    <caption className="visually-hidden">Daftar akun pengguna beserta peran dan statusnya</caption>
                    <thead>
                      <tr>
                        <th scope="col">Pengguna</th>
                        <th scope="col">Email</th>
                        <th scope="col">Peran</th>
                        <th scope="col">Status</th>
                        <th scope="col">Terdaftar</th>
                        <th scope="col" className="admin-th-action">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUsers.map(u => (
                        <tr key={u.id} className={u.is_active ? undefined : 'admin-row-inactive'}>
                          <td className="admin-entity-name">
                            {u.username}
                            {u.is_self && <span className="status-chip status-chip--neutral admin-self-chip">Anda</span>}
                          </td>
                          <td className="admin-cell-secondary">{u.email || '\u2014'}</td>
                          <td>
                            {u.manageable && !u.is_self ? (
                              <>
                                <label htmlFor={`admin-role-${u.id}`} className="visually-hidden">
                                  Ubah peran {u.username}
                                </label>
                                <select
                                  id={`admin-role-${u.id}`}
                                  className="admin-select admin-select--row"
                                  value={u.role}
                                  onChange={e => {
                                    const next = e.target.value;
                                    if (next !== u.role) requestRoleChange(u, next);
                                  }}
                                >
                                  {assignableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                </select>
                              </>
                            ) : (
                              <span
                                className="status-chip status-chip--neutral"
                                data-hint={u.is_self
                                  ? 'Akun Anda sendiri tidak dapat diubah dari panel ini.'
                                  : 'Peran pada atau di atas level Anda tidak dapat dikelola dari akun ini.'}
                                tabIndex={0}
                              >
                                {ROLE_LABELS[u.role] ?? u.role}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`status-chip ${u.is_active ? 'status-chip--success' : 'status-chip--danger'}`}>
                              {u.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="admin-cell-secondary admin-nowrap">{formatDateTime(u.created_at)}</td>
                          <td className="admin-cell-action">
                            {u.manageable && !u.is_self && (
                              <button
                                type="button"
                                className={`admin-icon-btn ${u.is_active ? 'admin-icon-btn--danger' : 'admin-icon-btn--success'}`}
                                onClick={() => requestToggleActive(u)}
                                aria-label={u.is_active
                                  ? `Nonaktifkan akun ${u.username}`
                                  : `Aktifkan kembali akun ${u.username}`}
                                title={u.is_active ? 'Nonaktifkan akun' : 'Aktifkan kembali akun'}
                              >
                                {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {visibleUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="admin-table-empty">
                            {managedUsers.length === 0
                              ? 'Tidak ada akun terdaftar.'
                              : 'Tidak ada pengguna yang cocok dengan pencarian atau filter.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

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
                onKeyDown={e => { if (e.key === 'Enter') void requestAddExclusion(); }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { void requestAddExclusion(); }}
                disabled={addingExclusion || !newExclusion.trim()}
              >
                {addingExclusion ? 'Menambahkan...' : 'Tambah Pengecualian'}
              </button>
            </div>

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

          {/* Audit logs — server-side pagination, search, action + date-range
              filters, username join, and CSV/JSON export of the FULL filtered
              set (critique P1; GET /api/admin/audit-logs + /export). */}
          <section className="admin-panel" aria-labelledby="admin-audit-title" aria-busy={auditLoading}>
            <div className="admin-panel-head">
              <h3 className="admin-panel-title" id="admin-audit-title">
                <Eye size={18} color="var(--warning)" aria-hidden="true" />
                Log Audit
              </h3>
              <span className="status-chip status-chip--neutral">Append-Only</span>
              <span className="admin-panel-note">{auditTotal} entri</span>
              <button
                type="button"
                className="btn btn-secondary admin-export-btn"
                onClick={() => { void exportAudit('csv'); }}
                disabled={exporting !== null || auditTotal === 0}
              >
                {exporting === 'csv'
                  ? <Loader2 size={14} className="admin-spin" aria-hidden="true" />
                  : <Download size={14} aria-hidden="true" />}
                CSV
              </button>
              <button
                type="button"
                className="btn btn-secondary admin-export-btn"
                onClick={() => { void exportAudit('json'); }}
                disabled={exporting !== null || auditTotal === 0}
              >
                {exporting === 'json'
                  ? <Loader2 size={14} className="admin-spin" aria-hidden="true" />
                  : <Download size={14} aria-hidden="true" />}
                JSON
              </button>
            </div>

            <div className="admin-toolbar">
              <label htmlFor="admin-audit-search" className="visually-hidden">Cari log audit</label>
              <input
                id="admin-audit-search"
                className="admin-input"
                type="text"
                placeholder="Cari username, user ID, resource, atau detail..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
              />
              <label htmlFor="admin-audit-action" className="visually-hidden">Filter jenis aksi</label>
              <select
                id="admin-audit-action"
                className="admin-select"
                value={auditAction}
                onChange={e => { setAuditLoading(true); setAuditAction(e.target.value); setAuditPage(1); }}
              >
                <option value="">Semua Aksi</option>
                {auditActionTypes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <label htmlFor="admin-audit-from" className="visually-hidden">Dari tanggal</label>
              <input
                id="admin-audit-from"
                className="admin-input admin-date"
                type="date"
                value={auditFrom}
                max={auditTo || undefined}
                onChange={e => { setAuditLoading(true); setAuditFrom(e.target.value); setAuditPage(1); }}
              />
              <label htmlFor="admin-audit-to" className="visually-hidden">Sampai tanggal</label>
              <input
                id="admin-audit-to"
                className="admin-input admin-date"
                type="date"
                value={auditTo}
                min={auditFrom || undefined}
                onChange={e => { setAuditLoading(true); setAuditTo(e.target.value); setAuditPage(1); }}
              />
            </div>

            {auditError ? (
              <div className="admin-feedback admin-feedback--error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                Gagal memuat log audit.
                <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => { setAuditLoading(true); void fetchAudit(); }}>
                  Coba lagi
                </button>
              </div>
            ) : auditTotal === 0 && !auditLoading ? (
              <p className="admin-list-empty">
                {auditHasFilters ? 'Tidak ada log yang cocok dengan pencarian atau filter.' : 'Belum ada entri log audit.'}
              </p>
            ) : (
              <>
                <div className="compliance-table-wrap">
                  <table className="compliance-table">
                    <caption className="visually-hidden">Log audit sistem, diurutkan dari yang terbaru</caption>
                    <thead>
                      <tr>
                        {['Waktu', 'Pengguna', 'Aksi', 'Resource', 'Detail'].map(h => (
                          <th key={h} scope="col">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td className="admin-cell-secondary admin-nowrap">{formatDateTime(log.timestamp)}</td>
                          {/* Pengguna: username join with the full UUID as a
                              keyboard-reachable hint; deleted accounts fall
                              back to the UUID prefix (critique P1). */}
                          <td className="admin-cell-secondary">
                            {log.username ? (
                              <span className="admin-hint-cell" data-hint={log.user_id} tabIndex={0}>
                                <span className="admin-hint-text">{log.username}</span>
                              </span>
                            ) : log.user_id ? (
                              <span className="admin-hint-cell" data-hint={log.user_id} tabIndex={0}>
                                <span className="admin-mono admin-hint-text">{`${log.user_id.slice(0, 8)}\u2026`}</span>
                              </span>
                            ) : '\u2014'}
                          </td>
                          <td>
                            <span className={`status-chip ${ACTION_CHIP[log.action_type] ?? 'status-chip--neutral'}`}>
                              {log.action_type}
                            </span>
                          </td>
                          {/* Truncated cells: data-hint + tabIndex replace the
                              hover-only title (critique P2 a11y) — the full
                              text stays in the DOM for screen readers. */}
                          <td className="admin-cell-secondary">
                            {log.resource_id
                              ? (
                                <span className="admin-hint-cell" data-hint={log.resource_id} tabIndex={0}>
                                  <span className="admin-mono admin-hint-text">{log.resource_id}</span>
                                </span>
                              )
                              : '\u2014'}
                          </td>
                          <td className="admin-cell-secondary">
                            {log.details
                              ? (
                                <span className="admin-hint-cell" data-hint={log.details} tabIndex={0}>
                                  <span className="admin-hint-text">{log.details}</span>
                                </span>
                              )
                              : '\u2014'}
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && auditLoading && (
                        <tr>
                          <td colSpan={5} className="admin-table-empty" role="status">Memuat log audit...</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="admin-pagination">
                  <span className="admin-page-info">{rangeLabel}</span>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => { setAuditLoading(true); setAuditPage(p => Math.max(1, p - 1)); }}
                    disabled={auditPage <= 1 || auditLoading}
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => { setAuditLoading(true); setAuditPage(p => Math.min(pageCount, p + 1)); }}
                    disabled={auditPage >= pageCount || auditLoading}
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
