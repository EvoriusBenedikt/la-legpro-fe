import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield, Database, FileText, AlertTriangle, CheckCircle2,
  Clock, Users, Server, Eye, Lock, XCircle, RefreshCw,
  X, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, ArrowUpDown, Download, UserX, UserCheck, Loader2,
  MoreHorizontal, ChevronDown, LogOut, KeyRound, Info, MailCheck, MailX
} from 'lucide-react';
import { HighchartsReact } from 'highcharts-react-official';
import Highcharts from 'highcharts';
import 'highcharts/highcharts-3d';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import { useDateFormatters } from '../format';
import { useStrings, fill, msg, plural, statusLabel, LocalizedError, type Msg, type StringKey } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useDialogA11y } from '../hooks/useDialogA11y';
import LoadingOrb from './LoadingOrb';
import AdminAccessGrants from './AdminAccessGrants';

interface StatusDoc {
  id: number;
  judul: string;
  nomor: string | null;
  /** Document-type classification (POJK/SEOJK/...) rendered as the row's
      sub-line badge; nomor stays in the payload for the search filter. */
  jenis: string | null;
  status: string;
}

interface AuditLog {
  id: number;
  timestamp: string;
  user_id: string;
  /** LEFT JOIN users � NULL when the account no longer exists; the viewer
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
      date range, username join, export � 2026-10-06 critique P1). */
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
  last_login: string | null;    // migration 010 � null until first login after upgrade
  email_verified: boolean;       // migration 010 � false by default
  /** Server-computed: target strictly below the actor's role level and not
      the actor. Presentation only � every mutation re-checks server-side. */
  manageable: boolean;
  is_self: boolean;
}

type Tone = 'success' | 'warning' | 'danger';

/** Sortable users-table columns (client-side � the directory is fetched
    whole, so sorting is a view concern). [sort key, header label]. */
type UserSortKey = 'username' | 'email' | 'role' | 'status' | 'created' | 'last_login';
const USER_SORT_COLUMNS: [UserSortKey, StringKey][] = [
  ['username', 'admColUser'],
  ['email', 'admColEmail'],
  ['role', 'admColRole'],
  ['status', 'admColStatus'],
  ['created', 'admColCreated'],
  ['last_login', 'admColLastLogin'],
];

const USERS_PAGE_SIZE = 15;

interface StatusCardProps {
  /** Stable raw status value (also the doc_status / doc_details key); the
      search input id derives from it so it never depends on the label. */
  id: string;
  labelKey: StringKey;
  value: number;
  tone: Tone;
  icon: React.ReactNode;
  docs: StatusDoc[];
  totalDocs: number;
}

interface ConfirmState {
  /** Msgs, not text: the dialog resolves them while rendering, so a language
      switch while it is open re-renders it in the new language. */
  title: Msg;
  body: Msg;
  confirmLabel: Msg;
  /** 'danger' (default) for destructive acts; 'primary' for reversible ones
      (reactivating an account, changing a role). */
  confirmTone?: 'danger' | 'primary';
  /** Resolves ? dialog closes. Rejects ? dialog stays open with the error
      inline, so the admin can retry or cancel with full context. */
  onConfirm: () => Promise<void>;
}

/** Must match DOC_DETAILS_LIMIT in la-legpro-be/api/routers/admin.py. */
const DOC_DETAILS_LIMIT = 100;
const AUDIT_PAGE_SIZE = 20;

/** Role ladder � must match ROLE_LEVELS in la-legpro-be/api/auth.py. */
const ROLE_LEVELS: Record<string, number> = {
  pengguna: 1,
  manajer: 2,
  direktur: 3,
  admin: 4,
  'sekretaris perusahaan': 5,
  'insinyur ti': 6,
  dewa: 7, // unofficial developer role � unassignable via the level filter below
};

/** Label keys for the stored (lowercase) role values. */
const ROLE_LABEL_KEYS: Record<string, StringKey> = {
  pengguna: 'admRolePengguna',
  manajer: 'admRoleManajer',
  direktur: 'admRoleDirektur',
  admin: 'admRoleAdmin',
  'sekretaris perusahaan': 'admRoleSekretaris',
  'insinyur ti': 'admRoleInsinyur',
  dewa: 'admRoleDev', // unofficial developer role
};

/** Localized role label; unknown roles pass through as stored. */
const roleLabel = (t: Record<StringKey, string>, role: string): string =>
  ROLE_LABEL_KEYS[role] ? t[ROLE_LABEL_KEYS[role]] : role;

/** Role as a Msg for toast/dialog params (resolved at render). */
const roleMsg = (role: string): Msg =>
  ROLE_LABEL_KEYS[role] ? { key: ROLE_LABEL_KEYS[role] } : { text: role };

/** One/Other Msg for a count (id has no plural forms; en does). */
const pl = (base: string, n: number, params: Record<string, string | number | Msg> = {}): Msg => ({
  key: `${base}${n === 1 ? 'One' : 'Other'}` as StringKey,
  params: { n, ...params },
});

/** Failure Msg with the cause appended: network -> errNetwork, a recognized
    backend detail -> its key, anything else -> generic (raw text is logged). */
const failMsg = (key: StringKey, e: unknown, user: string): Msg => ({
  key,
  params: { user, reason: apiErrorMsg(e, 'errUnexpected') },
});

/** Audit actions on the documented status-chip vocabulary: revoke and
    document-delete ride the "revoked" red, upload the "new" sky, grant
    the success green; anything else stays neutral (the triad hues
    otherwise encode legal status only). Inventory: the backend logs
    SEARCH, GRANT_ACCESS, REVOKE_ACCESS, DELETE_DOCUMENT literals
    (db_service.log_audit call sites); UPLOAD survives in migrated legacy
    rows; CHANGE_ROLE / ACTIVATE_USER / DEACTIVATE_USER are logged by the
    admin user-management endpoints (2026-10-06); CREATE_TAXONOMY /
    RENAME_TAXONOMY / ACTIVATE_TAXONOMY / DEACTIVATE_TAXONOMY /
    DELETE_TAXONOMY by the taxonomy endpoints (2026-10-08 � cascade
    rename + audit trail, critique Issues 1�2). Replaces the hardcoded
    #7e22ce/#be123c map � forbidden purple, rose double duty with
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
  FORCE_LOGOUT: 'status-chip--warning',
  RESET_PASSWORD: 'status-chip--warning',
  SET_EMAIL_VERIFIED: 'status-chip--neutral',
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

const StatusCard = ({ id, labelKey, value, tone, icon, docs, totalDocs }: StatusCardProps) => {
  const t = useStrings();
  const label = t[labelKey];
  const [search, setSearch] = useState('');
  const inputId = `admin-card-search-${id.toLowerCase().replace(/\s+/g, '-')}`;
  const q = search.trim().toLowerCase();

  const filteredDocs = q
    ? docs.filter(d =>
        (d.judul || '').toLowerCase().includes(q) ||
        (d.nomor || '').toLowerCase().includes(q))
    : docs;

  const pct = totalDocs > 0 ? Math.min(1, value / totalDocs) : 0;
  const capped = value > docs.length;
  const statusLower = label.toLowerCase();
  const meta = q
    ? fill(t.admCardMetaMatch, { n: filteredDocs.length, m: Math.min(docs.length, DOC_DETAILS_LIMIT) })
    : capped
      ? fill(t.admCardMetaCapped, { n: docs.length, total: value })
      : plural(t, 'admDocCount', value);

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
          <label htmlFor={inputId} className="visually-hidden">{fill(t.admCardSearchAria, { status: label })}</label>
          <input
            id={inputId}
            type="text"
            placeholder={fill(t.admCardSearchPh, { status: statusLower })}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setSearch('')}
              aria-label={fill(t.admCardClearAria, { status: statusLower })}
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
                {d.jenis && (
                  <div className="admin-doc-jenis">
                    <span className="jenis-badge">{d.jenis}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="admin-list-empty">
              {q
                ? (capped
                  // Cap-owning copy (critique P1�3): a zero-match here only
                  // proves absence from the loaded preview, never from the
                  // corpus � with 889 live Berlaku docs vs a 100-doc preview
                  // the old "no documents match" was a confident false
                  // negative. FR-24 bars admins from the repository, so the
                  // copy owns the limit instead of routing to a denied page.
                  ? fill(t.admCardEmptyCapped, { q: search.trim(), n: docs.length, total: value })
                  : fill(t.admCardEmptyMatch, { q: search.trim() }))
                : t.admCardEmpty}
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
  const t = useStrings();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Msg | null>(null);

  // Mounted only while open, so `open` is a constant true. While a mutation
  // is in flight Escape gets a no-op handler � the dialog cannot vanish
  // mid-action � and the backdrop mousedown below ignores clicks for the
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
      setError(e instanceof LocalizedError ? e.msg : { key: 'errUnexpected' });
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
        <h3 className="confirm-modal-title" id="admin-confirm-title">{msg(t, state.title)}</h3>
        <p className="confirm-modal-body">{msg(t, state.body)}</p>
        {error && <p className="confirm-modal-error" role="alert">{msg(t, error)}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {t.admCancel}
          </button>
          <button
            type="button"
            className={`btn ${state.confirmTone === 'primary' ? 'btn-primary' : 'btn-danger'}`}
            onClick={() => { void runConfirm(); }}
            disabled={pending}
          >
            {pending && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending ? t.admWorking : msg(t, state.confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Fixed-position tooltip portal for hint cells (2026-10-13 critique P2�4).
    The old CSS ::after hint painted inside `.compliance-table-wrap`
    (`overflow-y: auto`), so lower-row tooltips clipped or spawned stray
    scrollbars � live-verified. Portaling to body with a viewport-aware
    flip/clamp means they can never be clipped again.
    `focusable` cells (hint-only content: full UUIDs, permission-denial
    justifications) keep tabIndex=0 and gain a visually-hidden
    aria-describedby twin per the house contract (LegalRepository's
    status-hint pattern); cells whose full text is already in the DOM are
    hover-only, not tab stops (~40 extra stops per page removed). */
const HINT_GAP = 8;

const HintTooltip = ({ anchor, text }: { anchor: DOMRect; text: string }) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Height estimate for the flip decision (0.75rem/1.45 � 18px lines, ~38
  // chars per 260px content width). The tooltip is transient; a measurement
  // pass would be overkill.
  const estH = Math.ceil(text.length / 38) * 18 + 18;
  const placeAbove = anchor.bottom + HINT_GAP + estH > vh - HINT_GAP
    && anchor.top - HINT_GAP - estH >= HINT_GAP;
  const style: React.CSSProperties = {
    right: Math.max(HINT_GAP, vw - anchor.right - HINT_GAP),
    ...(placeAbove
      ? { bottom: vh - anchor.top + HINT_GAP }
      : { top: anchor.bottom + HINT_GAP }),
  };
  return createPortal(
    <span className="admin-hint-pop" role="tooltip" style={style}>{text}</span>,
    document.body
  );
};

const HintCell = ({ hint, focusable = false, children }: {
  hint: string;
  focusable?: boolean;
  children: React.ReactNode;
}) => {
  const twinId = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <span
      className="admin-hint-cell"
      {...(focusable ? { tabIndex: 0, 'aria-describedby': twinId } : {})}
      onMouseEnter={e => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
      onFocus={e => setAnchor(e.currentTarget.getBoundingClientRect())}
      onBlur={() => setAnchor(null)}
      onKeyDown={e => { if (e.key === 'Escape') setAnchor(null); }}
    >
      {children}
      {focusable && <span id={twinId} className="visually-hidden">{hint}</span>}
      {anchor && <HintTooltip anchor={anchor} text={hint} />}
    </span>
  );
};

// -- Klasifikasi pie chart -------------------------------------------------
// Highcharts 3-D pie � the side-effect import of 'highcharts/highcharts-3d'
// above registers the 3D module via its compose() calls. CSS variables are
// resolved at render time so the chart matches the app's light/dark theme.

interface KlasPieProps {
  data: Record<string, number>;
  totalDocs: number;
}

const KlasifikasiPieChart = ({ data, totalDocs }: KlasPieProps) => {
  const t = useStrings();
  // The raw klasifikasi value drives the color; only the label is translated.
  const seriesData = useMemo(
    () => Object.entries(data).map(([klas, count]) => ({
      name: statusLabel(t, klas),
      y: count,
      color: KLASIFIKASI_COLOR[klas] ?? FALLBACK_COLOR,
    })),
    [data, t],
  );

  // Read computed CSS tokens so Highcharts inherits the live theme palette.
  const root = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement)
    : null;
  const textColor   = root?.getPropertyValue('--text-primary').trim()   || '#e2e8f0';
  const subColor    = root?.getPropertyValue('--text-secondary').trim()  || '#94a3b8';
  const bgSurface   = root?.getPropertyValue('--bg-surface').trim()      || '#1e293b';
  const borderColor = root?.getPropertyValue('--border-color').trim()    || '#334155';

  const options = useMemo<Highcharts.Options>(() => ({
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      margin: [10, 10, 60, 10],
      options3d: {
        enabled: true,
        alpha: 48,
        beta: 0,
      },
      style: { fontFamily: 'Inter, sans-serif' },
      animation: { duration: 700 },
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      itemStyle: { color: subColor, fontSize: '0.78rem', fontWeight: '400' },
      itemHoverStyle: { color: textColor },
      symbolRadius: 4,
      // Each legend item shows "Name � N docs"
      labelFormatter(this: Highcharts.Point | Highcharts.Series) {
        const y = 'y' in this ? this.y : undefined;
        return `${this.name} � <b>${y}</b>`;
      },
    },
    tooltip: {
      useHTML: true,
      outside: true,
      backgroundColor: bgSurface,
      borderColor,
      borderRadius: 6,
      shadow: false,
      style: { color: '#ffffff', fontSize: '0.82rem' },
      headerFormat: '',
      pointFormatter(this: Highcharts.Point) {
        const pct = totalDocs > 0
          ? ((( this.y ?? 0) / totalDocs) * 100).toFixed(1)
          : '�';
        return `<span style="font-size:0.78rem;font-weight:600;color:#ffffff">${this.name}</span><br/>`
          + `<span style="color:${this.color as string}">\u25CF</span> `
          + `<span style="color:#ffffff">${this.series.name}: <b>${plural(t, 'admDocCount', this.y ?? 0)}</b> (${pct}%)</span><br/>`;
      },
    },
    plotOptions: {
      pie: {
        depth: 35,
        innerSize: '40%',
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: { enabled: false },
        showInLegend: true,
        states: {
          hover: { brightness: 0.12 },
          select: { color: undefined, borderColor: textColor, borderWidth: 2 },
        },
      },
    },
    series: [{
      type: 'pie',
      name: t.admSeriesDocs,
      data: seriesData,
    }],
  }), [seriesData, totalDocs, textColor, subColor, bgSurface, borderColor, t]);

  return (
    <div className="admin-pie-wrap">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};

export default function AdminDashboard() {
  const { formatDateTime, formatTime } = useDateFormatters();
  const tr = useStrings();
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [grantsExpanded, setGrantsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Time of the last successful fetch (button label), via the shared
  // formatter: HH:mm with a colon, 24-hour for id-ID/iso, h:mm AM/PM for en-US.
  const lastRefreshTime = lastRefresh ? formatTime(lastRefresh) : null;

  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [exclusionsError, setExclusionsError] = useState(false);
  const [newExclusion, setNewExclusion] = useState('');
  const [addingExclusion, setAddingExclusion] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  /* Local toast strip (house pattern from KnowledgeGraph/SystemMonitoring �
     there is no app-wide toast context to join). Mutation/export feedback
     used to be a banner at page top, which could render thousands of px
     above the viewport while the action happened down-page (critique P1�1:
     export success live-verified at top -3034 px). The bottom-right fixed
     stack is always in view. */
  const toastIdRef = useRef(0);
  const [toasts, setToasts] = useState<{ id: number; kind: 'success' | 'error'; msg: Msg }[]>([]);
  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);
  const pushToast = useCallback((kind: 'success' | 'error', message: Msg) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, kind, msg: message }]);
    // Successes auto-dismiss so they don't stack up during a batch of edits;
    // errors persist until dismissed (2026-10-06 critique P2 � preserved in
    // toast form) so a failed destructive action can never vanish unread.
    if (kind === 'success') window.setTimeout(() => dismissToast(id), 8000);
  }, [dismissToast]);

  // User management (critique P0) � exact-role admin only; the BE re-checks
  // every guard, the FE gate is presentation.
  const isAdminRole = ['admin', 'dewa'].includes((user?.role || '').toLowerCase());
  const actorLevel = ROLE_LEVELS[(user?.role || '').toLowerCase()] ?? 1;
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersError, setUsersError] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [exportingUsers, setExportingUsers] = useState(false);
  // Drawer: show full user detail
  const [drawerUser, setDrawerUser] = useState<ManagedUser | null>(null);
  // Per-row action menu (force logout, reset pwd, open drawer)
  const [rowMenu, setRowMenu] = useState<{ userId: string; top: number; right: number } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  // Temp password shown after reset (one-time display)
  const [tempPwdInfo, setTempPwdInfo] = useState<{ username: string; pwd: string } | null>(null);

  // Audit viewer (critique P1) � server-side pagination/filtering; auditQuery
  // is the debounced copy of auditSearch that actually hits the API. Filter
  // and page state seed from and sync to URL search params (critique P2�5):
  // a built audit view survives F5, can be bookmarked, and can be handed to
  // a colleague.
  const [searchParams, setSearchParams] = useSearchParams();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActionTypes, setAuditActionTypes] = useState<string[]>([]);
  const [auditSearch, setAuditSearch] = useState(() => searchParams.get('q') ?? '');
  const [auditQuery, setAuditQuery] = useState(() => searchParams.get('q') ?? '');
  const [auditAction, setAuditAction] = useState(() => searchParams.get('action') ?? '');
  const [auditFrom, setAuditFrom] = useState(() => searchParams.get('from') ?? '');
  const [auditTo, setAuditTo] = useState(() => searchParams.get('to') ?? '');
  const [auditPage, setAuditPage] = useState(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10);
    return Number.isNaN(p) ? 1 : Math.max(1, p);
  }); // 1-based, matches the API
  const [auditLoading, setAuditLoading] = useState(true); // first fetch is in flight on mount
  const [auditError, setAuditError] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  // Page-jump scratch value (critique P2�5) � committed on Enter; the
  // placeholder shows "current/total" while empty.
  const [pageJump, setPageJump] = useState('');

  /** Refresh never blanks the page: the skeleton shows only while data is
      null; later pulls keep the (stale) view, spin the hero button, and
      surface failures as an inline alert instead of a content vacuum. */
  const runFetch = useCallback(async () => {
    // Parallel round-trips (critique P2�5): three sequential awaits made
    // every hero refresh ~3� slower than the slowest single endpoint.
    // Per-call catches keep the partial-failure contract � one dead
    // endpoint still lets the others load.
    const [res, excRes, usersRes] = await Promise.all([
      api.get('/api/admin/dashboard').catch((e) => { console.error('Dashboard fetch error:', e); return null; }),
      api.get('/api/admin/kg-exclusions').catch((e) => { console.error('KG exclusions fetch error:', e); return null; }),
      // User management is exact-role admin only (the BE would 403 anyway �
      // skipping the call keeps sekretaris perusahaan's network tab clean).
      isAdminRole
        ? api.get('/api/admin/users').catch((e) => { console.error('Users fetch error:', e); return null; })
        : Promise.resolve(undefined),
    ]);

    if (res) {
      setData(res.data);
      setLastRefresh(new Date());
      setLoadError(false);
    } else {
      setLoadError(true);
    }

    if (excRes) {
      setExclusions(excRes.data.exclusions);
      setExclusionsError(false);
    } else {
      setExclusionsError(true);
    }

    if (isAdminRole) {
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
    // synchronous setState (react-hooks/set-state-in-effect) � the async
    // block clears the flag once the fetch settles.
    (async () => {
      try { await runFetch(); } finally { setLoading(false); }
    })();
  }, [runFetch]);

  // Lazy: AdminAccessGrants fetches on first expand; the dashboard only owns the toggle.
  const toggleGrants = () => setGrantsExpanded(expanded => !expanded);

  // Abort + sequence refs for the audit race guard (see fetchAudit below).
  const auditAbortRef = useRef<AbortController | null>(null);
  const auditSeqRef = useRef(0);

  /** Audit viewer (critique P1): its own endpoint, its own error state �
      filter/page changes refetch without touching the rest of the view.
      No setState before the first await: the busy flag is raised by the
      event handlers/debounce timeout that trigger a refetch, so the
      fetching effect stays free of synchronous renders
      (react-hooks/set-state-in-effect � same contract as
      SystemMonitoring.fetchAuditLogs). */
  const fetchAudit = useCallback(async () => {
    // Race guard (critique P1�2; the 2026-10-12 functional scan confirmed
    // out-of-order responses at API level): a newer fetch aborts the
    // in-flight one, and a sequence number fences whatever still resolves,
    // so a stale response can never paint rows contradicting the visible
    // filters.
    auditAbortRef.current?.abort();
    const ctrl = new AbortController();
    auditAbortRef.current = ctrl;
    const seq = ++auditSeqRef.current;
    const res = await api.get('/api/admin/audit-logs', {
      params: {
        search: auditQuery || undefined,
        action: auditAction || undefined,
        date_from: auditFrom || undefined,
        date_to: auditTo || undefined,
        page: auditPage,
        page_size: AUDIT_PAGE_SIZE,
      },
      signal: ctrl.signal,
    }).catch((e) => {
      // An aborted request was superseded by a newer fetch � not an error.
      if (!ctrl.signal.aborted) console.error('Audit fetch error:', e);
      return null;
    });
    if (seq !== auditSeqRef.current) return;
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
    // Awaited IIFE � the same shape as the initial-load effect above: every
    // setState in fetchAudit lands after its await, so the effect body
    // triggers no synchronous render (react-hooks/set-state-in-effect).
    (async () => { await fetchAudit(); })();
  }, [fetchAudit]);

  // Abort any in-flight audit request on unmount (route change mid-fetch).
  useEffect(() => () => auditAbortRef.current?.abort(), []);

  // Debounce the search field (350 ms) into the server query and restart at
  // page 1 � inside the timeout, not the effect body (set-state-in-effect).
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

  // One-way state ? URL sync (critique P2�5). replace-not-push: filter
  // typing must not flood the history stack (and with no intermediate
  // entries, back-navigation can never strand the viewer on a rewritten
  // URL). The string comparison keeps a no-op replace from re-triggering.
  useEffect(() => {
    const next = new URLSearchParams();
    if (auditQuery) next.set('q', auditQuery);
    if (auditAction) next.set('action', auditAction);
    if (auditFrom) next.set('from', auditFrom);
    if (auditTo) next.set('to', auditTo);
    if (auditPage > 1) next.set('page', String(auditPage));
    if (searchParams.toString() !== next.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [auditQuery, auditAction, auditFrom, auditTo, auditPage, searchParams, setSearchParams]);

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
      pushToast('success', { key: 'admExportDone', params: { fmt: fmt.toUpperCase(), file: filename } });
    } catch (e) {
      pushToast('error', { key: 'admExportFail', params: { fmt: fmt.toUpperCase() } });
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
      pushToast('success', deletedNodes + deletedEdges > 0
        ? { key: 'admExclAdded', params: { name, nodes: deletedNodes, edges: deletedEdges } }
        : { key: 'admExclAddedNone', params: { name } });
      await fetchAll(true);
    } catch (e) {
      const mapped = apiErrorMsg(e, 'errUnexpected');
      const message: Msg = 'key' in mapped && mapped.key === 'errAdmEntityExists'
        ? { key: 'admExclExists', params: { name } }
        : { key: 'admExclAddFail', params: { reason: mapped } };
      pushToast('error', message);
      console.error('Add exclusion error:', e);
      // Rethrow so the ConfirmDialog stays open with the failure inline
      // instead of closing over a mutation that never landed (critique P2).
      // The Msg rides the error so the dialog resolves it in the live locale.
      throw new LocalizedError(message);
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
    // the action � the dialog then says the count could not be fetched.
    let body: Msg;
    try {
      const res = await api.get('/api/admin/kg-exclusions/preview', { params: { entity_name: name } });
      const nodes: number = res.data?.matching_nodes ?? 0;
      const edges: number = res.data?.matching_edges ?? 0;
      if (res.data?.already_excluded) {
        pushToast('error', { key: 'admExclExists', params: { name } });
        return;
      }
      body = nodes + edges > 0
        ? { key: 'admExclPreviewBody', params: { nodes, edges, name } }
        : { key: 'admExclPreviewNone', params: { name } };
    } catch (e) {
      console.error('KG exclusion preview error:', e);
      body = { key: 'admExclPreviewFail', params: { name } };
    }
    setConfirmState({
      title: { key: 'admExclConfirmTitle' },
      body,
      confirmLabel: { key: 'admExclConfirmLabel' },
      onConfirm: () => addExclusion(name),
    });
  };

  const deleteExclusion = async (exc: Exclusion) => {
    try {
      await api.delete(`/api/admin/kg-exclusions/${exc.id}`);
      pushToast('success', { key: 'admExclDeleted', params: { name: exc.entity_name } });
      await fetchAll(true);
    } catch (e) {
      const message: Msg = { key: 'admExclDeleteFail', params: { name: exc.entity_name } };
      pushToast('error', message);
      console.error('Delete exclusion error:', e);
      throw new LocalizedError(message); // keeps the ConfirmDialog open (critique P2)
    }
  };

  const requestDeleteExclusion = (exc: Exclusion) => {
    setConfirmState({
      title: { key: 'admExclDelTitle' },
      body: { key: 'admExclDelBody', params: { name: exc.entity_name } },
      confirmLabel: { key: 'admExclDelLabel' },
      onConfirm: () => deleteExclusion(exc),
    });
  };

  // -- User management mutations (critique P0) -----------------------------
  // Every failure rethrows so the ConfirmDialog stays open with the reason
  // inline; successes refresh the directory (and the audit feed, since each
  // mutation is audit-logged server-side).

  const changeUserRole = async (target: ManagedUser, newRole: string) => {
    try {
      await api.patch(`/api/admin/users/${target.id}/role`, { role: newRole });
      pushToast('success', { key: 'admRoleChanged', params: { user: target.username, from: roleMsg(target.role), to: roleMsg(newRole) } });
      await fetchAll(true);
      void fetchAudit();
    } catch (e) {
      const message = failMsg('admRoleFail', e, target.username);
      pushToast('error', message);
      console.error('Change role error:', e);
      throw new LocalizedError(message);
    }
  };

  const requestRoleChange = (target: ManagedUser, newRole: string) => {
    setConfirmState({
      title: { key: 'admRoleTitle' },
      body: { key: 'admRoleBody', params: { user: target.username, from: roleMsg(target.role), to: roleMsg(newRole) } },
      confirmLabel: { key: 'admRoleLabel' },
      confirmTone: 'primary',
      onConfirm: () => changeUserRole(target, newRole),
    });
  };

  const setUserActive = async (target: ManagedUser, nextActive: boolean) => {
    try {
      await api.patch(`/api/admin/users/${target.id}/status`, { is_active: nextActive });
      pushToast('success', {
        key: nextActive ? 'admUserReactivated' : 'admUserDeactivated',
        params: { user: target.username },
      });
      await fetchAll(true);
      void fetchAudit();
    } catch (e) {
      const message = failMsg(nextActive ? 'admActivateFail' : 'admDeactivateFail', e, target.username);
      pushToast('error', message);
      console.error('Set user status error:', e);
      throw new LocalizedError(message);
    }
  };

  const requestToggleActive = (target: ManagedUser) => {
    const deactivate = target.is_active;
    setConfirmState({
      title: { key: deactivate ? 'admDeactTitle' : 'admReactTitle' },
      body: deactivate
        ? { key: 'admDeactBody', params: { user: target.username } }
        : { key: 'admReactBody', params: { user: target.username, role: roleMsg(target.role) } },
      confirmLabel: { key: deactivate ? 'admDeactLabel' : 'admReactLabel' },
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
  // `id` is the raw backend status (doc_status / doc_details key); only the
  // label is translated, via labelKey.
  const statusCards: StatusCardProps[] = data ? [
    { id: 'Berlaku', labelKey: 'stBerlaku', value: data.doc_status['Berlaku'] ?? 0, tone: 'success', icon: <CheckCircle2 size={20} />, docs: docDetails['Berlaku'] ?? [], totalDocs },
    { id: 'Tidak Berlaku', labelKey: 'stTidakBerlaku', value: data.doc_status['Tidak Berlaku'] ?? 0, tone: 'danger', icon: <XCircle size={20} />, docs: docDetails['Tidak Berlaku'] ?? [], totalDocs },
    { id: 'Memproses', labelKey: 'stMemproses', value: data.doc_status['Memproses'] ?? 0, tone: 'warning', icon: <Clock size={20} />, docs: docDetails['Memproses'] ?? [], totalDocs },
    { id: 'Gagal', labelKey: 'stGagal', value: data.doc_status['Gagal'] ?? 0, tone: 'danger', icon: <AlertTriangle size={20} />, docs: docDetails['Gagal'] ?? [], totalDocs },
  ] : [];

  // Audit pagination/range are server-driven now (critique P1).
  const auditHasFilters = Boolean(auditQuery || auditAction || auditFrom || auditTo);
  const pageCount = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));
  const rangeLabel = auditTotal === 0
    ? tr.admRangeZero
    : fill(tr.admRange, { a: (auditPage - 1) * AUDIT_PAGE_SIZE + 1, b: Math.min(auditPage * AUDIT_PAGE_SIZE, auditTotal), total: auditTotal });

  // "Reset Filter" (critique P2�5): auditHasFilters used to power only the
  // empty-state copy; now it gates a real control. Whenever resettable, at
  // least one settled fetch dep (a filter value or the page) differs from
  // its reset value, so the refetch effect is guaranteed to fire and the
  // busy flag raised here can never strand the viewer.
  const auditResettable = auditHasFilters || auditPage !== 1;
  const resetAuditFilters = () => {
    if (!auditResettable) return;
    setAuditSearch('');
    setAuditQuery('');
    setAuditAction('');
    setAuditFrom('');
    setAuditTo('');
    setAuditPage(1);
    setAuditLoading(true);
  };

  // Page-jump commit (Enter): clamps into the real range; empty, NaN, or
  // same-page values are no-ops. Escape/blur discard the scratch value.
  const commitPageJump = () => {
    const n = parseInt(pageJump, 10);
    setPageJump('');
    if (Number.isNaN(n)) return;
    const clamped = Math.min(pageCount, Math.max(1, n));
    if (clamped === auditPage) return;
    setAuditLoading(true);
    setAuditPage(clamped);
  };

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

  // -- Bulk account actions (critique P2�5) --------------------------------
  // Row checkboxes + a selection bar. Same guard rails as the single-row
  // flow: only manageable non-self rows are selectable, and the BE re-checks
  // every row anyway. The selection is a set of ids; selectedManaged
  // re-validates against the latest managedUsers on every render, so stale
  // ids (a refresh demoted or removed a row) can never ride into a bulk
  // mutation.
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const selectedManaged = useMemo(
    () => managedUsers.filter(u => selectedUsers.has(u.id) && u.manageable && !u.is_self),
    [managedUsers, selectedUsers]);
  const bulkDeactivateTargets = useMemo(() => selectedManaged.filter(u => u.is_active), [selectedManaged]);
  const bulkActivateTargets = useMemo(() => selectedManaged.filter(u => !u.is_active), [selectedManaged]);
  const visibleManageable = useMemo(
    () => visibleUsers.filter(u => u.manageable && !u.is_self),
    [visibleUsers]);
  const allVisibleSelected = visibleManageable.length > 0
    && visibleManageable.every(u => selectedUsers.has(u.id));

  const toggleSelectUser = (id: string, on: boolean) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleManageable.forEach(u => next.delete(u.id));
      else visibleManageable.forEach(u => next.add(u.id));
      return next;
    });
  };

  /** Sequential per-row mutation with one result-summary toast (critique
      P2�5; also answers Riley's "batches have no summary" flag). Partial
      failure closes the dialog � the persistent error toast carries the
      per-account detail, and a dialog hovering over a half-finished batch
      helps nobody. Directory + audit feed refresh once, not per row. */
  const bulkSetActive = async (targets: ManagedUser[], nextActive: boolean) => {
    let ok = 0;
    const failed: string[] = [];
    for (const target of targets) {
      try {
        await api.patch(`/api/admin/users/${target.id}/status`, { is_active: nextActive });
        ok += 1;
      } catch (e) {
        // Per-account causes are server text in either language; only the
        // usernames reach the toast, the detail goes to the console.
        failed.push(target.username);
        console.error('Bulk user status error:', e);
      }
    }
    if (failed.length === 0) {
      pushToast('success', pl(nextActive ? 'admBulkReact' : 'admBulkDeact', ok));
    } else if (ok === 0) {
      pushToast('error', pl('admBulkFailAll', failed.length, { names: failed.join(', ') }));
    } else {
      pushToast('error', {
        key: nextActive ? 'admBulkPartialReact' : 'admBulkPartialDeact',
        params: { ok, total: targets.length, names: failed.join(', ') },
      });
    }
    setSelectedUsers(new Set());
    await fetchAll(true);
    void fetchAudit();
  };

  const requestBulkToggle = (nextActive: boolean) => {
    const targets = nextActive ? bulkActivateTargets : bulkDeactivateTargets;
    if (targets.length === 0) return;
    const shown = targets.slice(0, 6).map(u => u.username).join(', ');
    const names: Msg = targets.length > 6
      ? { key: 'admNamesMore', params: { names: shown, n: targets.length - 6 } }
      : { text: shown };
    setConfirmState({
      title: pl(nextActive ? 'admBulkTitleReact' : 'admBulkTitleDeact', targets.length),
      body: { key: nextActive ? 'admBulkBodyReact' : 'admBulkBodyDeact', params: { names } },
      confirmLabel: pl(nextActive ? 'admBulkLabelReact' : 'admBulkLabelDeact', targets.length),
      confirmTone: nextActive ? 'primary' : 'danger',
      onConfirm: () => bulkSetActive(targets, nextActive),
    });
  };

  // -- Users-table column sorting (critique P2�5) --------------------------
  // null = the server's directory order (default). First click sorts asc,
  // second desc; the th carries aria-sort for screen readers.
  const [userSort, setUserSort] = useState<{ key: UserSortKey; dir: 'asc' | 'desc' } | null>(null);
  const toggleUserSort = (key: UserSortKey) => {
    setUserSort(prev => (prev?.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }));
  };
  const sortedUsers = useMemo(() => {
    if (!userSort) return visibleUsers;
    const dir = userSort.dir === 'asc' ? 1 : -1;
    return [...visibleUsers].sort((a, b) => {
      switch (userSort.key) {
        case 'username': return a.username.localeCompare(b.username) * dir;
        case 'email': return (a.email ?? '').localeCompare(b.email ?? '') * dir;
        case 'role': return ((ROLE_LEVELS[a.role] ?? 0) - (ROLE_LEVELS[b.role] ?? 0)) * dir;
        case 'status': return (Number(a.is_active) - Number(b.is_active)) * dir;
        case 'created': return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        case 'last_login': {
          const ta = a.last_login ? new Date(a.last_login).getTime() : 0;
          const tb = b.last_login ? new Date(b.last_login).getTime() : 0;
          return (ta - tb) * dir;
        }
        default: return 0;
      }
    });
  }, [visibleUsers, userSort]);

  // Client-side pagination for the users table.
  const usersTotalPages = Math.max(1, Math.ceil(sortedUsers.length / USERS_PAGE_SIZE));
  const usersPageClamped = Math.min(usersPage, usersTotalPages);
  const pagedUsers = sortedUsers.slice(
    (usersPageClamped - 1) * USERS_PAGE_SIZE,
    usersPageClamped * USERS_PAGE_SIZE,
  );
  const usersRangeLabel = sortedUsers.length === 0
    ? tr.admUsersRangeZero
    : fill(tr.admRange, { a: (usersPageClamped - 1) * USERS_PAGE_SIZE + 1, b: Math.min(usersPageClamped * USERS_PAGE_SIZE, sortedUsers.length), total: sortedUsers.length });

  // -- New user management mutations ---------------------------------------

  const forceLogout = async (target: ManagedUser) => {
    try {
      await api.post(`/api/admin/users/${target.id}/force-logout`);
      pushToast('success', { key: 'admForceDone', params: { user: target.username } });
      void fetchAudit();
    } catch (e) {
      const message = failMsg('admForceFail', e, target.username);
      pushToast('error', message);
      throw new LocalizedError(message);
    }
  };

  const requestForceLogout = (target: ManagedUser) => {
    setRowMenu(null);
    setConfirmState({
      title: { key: 'admForceTitle' },
      body: { key: 'admForceBody', params: { user: target.username } },
      confirmLabel: { key: 'admForceLabel' },
      confirmTone: 'danger',
      onConfirm: () => forceLogout(target),
    });
  };

  const resetPassword = async (target: ManagedUser) => {
    try {
      const res = await api.post(`/api/admin/users/${target.id}/reset-password`);
      const pwd: string = res.data.temp_password;
      setTempPwdInfo({ username: target.username, pwd });
      void fetchAudit();
    } catch (e) {
      const message = failMsg('admResetFail', e, target.username);
      pushToast('error', message);
      throw new LocalizedError(message);
    }
  };

  const requestResetPassword = (target: ManagedUser) => {
    setRowMenu(null);
    setConfirmState({
      title: { key: 'admResetTitle' },
      body: { key: 'admResetBody', params: { user: target.username } },
      confirmLabel: { key: 'admResetLabel' },
      confirmTone: 'danger',
      onConfirm: () => resetPassword(target),
    });
  };

  const exportUsers = async () => {
    setExportingUsers(true);
    try {
      const res = await api.get('/api/admin/users/export', { responseType: 'blob' });
      const cd = (res.headers['content-disposition'] as string | undefined) ?? '';
      const named = /filename="?([^";]+)"?/.exec(cd);
      const filename = named?.[1] ?? `users-${Date.now()}.csv`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      pushToast('success', { key: 'admUsersExportDone', params: { file: filename } });
    } catch (e) {
      pushToast('error', { key: 'admUsersExportFail' });
      console.error('User export error:', e);
    } finally {
      setExportingUsers(false);
    }
  };

  // Close row menu on outside click / Escape.
  useEffect(() => {
    if (!rowMenu) return;
    const onDown = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) setRowMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [rowMenu]);

  const isSekretaris = (user?.role || '').toLowerCase() === 'sekretaris perusahaan';
  const heroSubtitle = isSekretaris ? tr.admHeroSubSek : tr.admHeroSubAdmin;

  return (
    <div className="view-container admin-view">
      {/* Hero � the shared navy brand surface (.hero-banner), not a
          one-off gradient (the old purple tint violated DESIGN.md's
          forbidden-hue rule). */}
      <div className="hero-banner">
        <div className="hero-content admin-hero-row">
          <div>
            <div className="hero-title-row">
              <span className="hero-icon-tile" aria-hidden="true">
                <Shield size={22} strokeWidth={1.75} />
              </span>
              <h1>{tr.admTitle}</h1>
            </div>
            <p>{heroSubtitle}</p>
          </div>
          <button
            type="button"
            className="btn-hero"
            onClick={() => fetchAll(true)}
            disabled={loading || refreshing}
            aria-label={lastRefreshTime ? fill(tr.adminRefreshAria, { time: lastRefreshTime }) : tr.adminRefresh}
            title={lastRefreshTime ? fill(tr.adminLastUpdated, { time: lastRefreshTime }) : undefined}
            style={{ maxWidth: '100%' }}
          >
            <RefreshCw size={15} className={refreshing ? 'admin-spin' : undefined} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lastRefreshTime ? fill(tr.adminLastUpdated, { time: lastRefreshTime }) : tr.adminRefresh}
            </span>
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingOrb className="loading-orb--padded" label={tr.admLoading} />
      ) : !data ? (
        <div className="empty-state admin-error-state" role="alert">
          <AlertTriangle size={40} color="var(--danger-text)" aria-hidden="true" />
          <p>{tr.admLoadStatsFail}</p>
          <button type="button" className="btn btn-primary" onClick={() => fetchAll(false)}>
            {tr.admRetry}
          </button>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="admin-feedback admin-feedback--error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              {lastRefresh ? fill(tr.admStaleAt, { time: formatTime(lastRefresh) }) : tr.admStale}
              <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => fetchAll(true)}>
                {tr.admRetry}
              </button>
            </div>
          )}

          {/* Mutation + export feedback now rides the bottom-right toast
              strip (house pattern � rendered at the end of this component):
              the old screen-global banner sat at page top, up to thousands
              of px above the actions that produced it (critique P1�1). */}

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
                    {item.ok ? `● ${tr.admOnline}` : `● ${tr.admOffline}`}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="admin-health-tile admin-grants-trigger"
              aria-expanded={grantsExpanded}
              aria-controls="admin-active-grants"
              aria-label={tr.admGrantsToggleAria}
              onClick={toggleGrants}
            >
              <span className="admin-health-icon accent" aria-hidden="true"><Users size={18} /></span>
              <span className="admin-grants-text">
                <span className="admin-tile-label">{tr.admGrants}</span>
                <span className="admin-tile-value accent">{data.active_grants}</span>
              </span>
              <ChevronDown size={16} className="admin-grants-chevron" aria-hidden="true" />
            </button>
            <div className="admin-health-tile">
              <span className="admin-health-icon accent" aria-hidden="true"><FileText size={18} /></span>
              <div>
                <div className="admin-tile-label">{tr.admTotalDocs}</div>
                <div className="admin-tile-value accent">{totalDocs}</div>
              </div>
            </div>
          </div>

          <div id="admin-active-grants" className="admin-grants-panel" hidden={!grantsExpanded}>
            <AdminAccessGrants
              expanded={grantsExpanded}
              onChanged={() => { void fetchAll(true); }}
              requestConfirm={setConfirmState}
              pushToast={pushToast}
            />
          </div>

          {/* Document status cards with per-status browsers */}
          <div className="admin-status-grid">
            {statusCards.map(card => (
              <StatusCard key={card.id} {...card} />
            ))}
          </div>

          {/* Volume by Klasifikasi & Jenis. Panel titles are h2 (page h1 ?
              panel h2 ? dialog h3): the skipped tier broke SR heading
              navigation (detector: skipped-heading). */}
          <div className="admin-panels-2col">
            <section className="admin-panel" aria-labelledby="admin-klas-title">
              <div className="admin-panel-head">
                <h2 className="admin-panel-title" id="admin-klas-title">
                  <Lock size={18} color="var(--accent-color)" aria-hidden="true" />
                  {tr.admKlasTitle}
                </h2>
              </div>
              <p className="admin-panel-hint">{plural(tr, 'admKlasHint', totalDocs)}</p>
              {Object.keys(data.doc_by_klasifikasi).length === 0 ? (
                <p className="admin-list-empty">{tr.admNoData}</p>
              ) : (
                <KlasifikasiPieChart
                  data={data.doc_by_klasifikasi}
                  totalDocs={totalDocs}
                />
              )}
            </section>

            <section className="admin-panel" aria-labelledby="admin-jenis-title">
              <div className="admin-panel-head">
                <h2 className="admin-panel-title" id="admin-jenis-title">
                  <FileText size={18} color="var(--accent-color)" aria-hidden="true" />
                  {tr.admJenisTitle}
                </h2>
              </div>
              <p className="admin-panel-hint">{tr.admJenisHint}</p>
              {data.doc_by_jenis.length === 0 ? (
                <p className="admin-list-empty">{tr.admNoData}</p>
              ) : (
                data.doc_by_jenis.map(item => (
                  <div key={item.jenis || '__unknown'} className="admin-bar-row">
                    <div className="admin-bar-head">
                      <span className="admin-bar-label">
                        <span className="admin-bar-name" title={item.jenis || tr.admUnknown}>
                          {item.jenis || tr.admUnknown}
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

          {/* User & role management (critique P0 � PRODUCT.md defines this
              as the admin role's job). Exact-role admin only; every guard
              is re-checked server-side (admin.py). */}
          {isAdminRole && (
            <section className="admin-panel" aria-labelledby="admin-users-title">
              <div className="admin-panel-head">
                <h2 className="admin-panel-title" id="admin-users-title">
                  <Users size={18} color="var(--accent-color)" aria-hidden="true" />
                  {tr.admUsersTitle}
                </h2>
                <span className="admin-panel-note">{plural(tr, 'admUsersRegistered', managedUsers.length)}</span>
                <button
                  type="button"
                  className="btn btn-secondary admin-export-btn"
                  onClick={() => { void exportUsers(); }}
                  disabled={exportingUsers || managedUsers.length === 0}
                  title={tr.admUsersExportTitle}
                >
                  {exportingUsers
                    ? <Loader2 size={14} className="admin-spin" aria-hidden="true" />
                    : <Download size={14} aria-hidden="true" />}
                  CSV
                </button>
              </div>
              <p className="admin-panel-hint">{tr.admUsersHint}</p>

              <div className="admin-toolbar">
                <label htmlFor="admin-user-search" className="visually-hidden">{tr.admUserSearchAria}</label>
                <input
                  id="admin-user-search"
                  className="admin-input"
                  type="text"
                  placeholder={tr.admUserSearchPh}
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setUsersPage(1); }}
                />
                <label htmlFor="admin-user-role" className="visually-hidden">{tr.admRoleFilterAria}</label>
                <select
                  id="admin-user-role"
                  className="admin-select"
                  value={userRoleFilter}
                  onChange={e => { setUserRoleFilter(e.target.value); setUsersPage(1); }}
                >
                  <option value="">{tr.admAllRoles}</option>
                  {Object.keys(ROLE_LABEL_KEYS).map(r => <option key={r} value={r}>{roleLabel(tr, r)}</option>)}
                </select>
              </div>

              {selectedManaged.length > 0 && (
                <div className="admin-bulk-bar" role="group" aria-label={tr.admBulkGroupAria}>
                  <span className="admin-bulk-count">{plural(tr, 'admBulkSelected', selectedManaged.length)}</span>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => requestBulkToggle(false)}
                    disabled={bulkDeactivateTargets.length === 0}
                  >
                    <UserX size={14} aria-hidden="true" />
                    {tr.admBulkDeactBtn}{bulkDeactivateTargets.length > 0 ? ` (${bulkDeactivateTargets.length})` : ''}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => requestBulkToggle(true)}
                    disabled={bulkActivateTargets.length === 0}
                  >
                    <UserCheck size={14} aria-hidden="true" />
                    {tr.admBulkReactBtn}{bulkActivateTargets.length > 0 ? ` (${bulkActivateTargets.length})` : ''}
                  </button>
                  <button
                    type="button"
                    className="admin-bulk-clear"
                    onClick={() => setSelectedUsers(new Set())}
                    aria-label={tr.admBulkClearAria}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {usersError ? (
                <div className="admin-feedback admin-feedback--error" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  {tr.admUsersLoadFail}
                  <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => fetchAll(true)}>
                    {tr.admRetry}
                  </button>
                </div>
              ) : (
                <>
                  <div className="compliance-table-wrap">
                    <table className="compliance-table">
                      <caption className="visually-hidden">{tr.admUsersCaption}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="admin-th-check">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              ref={el => {
                                if (el) el.indeterminate = !allVisibleSelected && visibleManageable.some(u => selectedUsers.has(u.id));
                              }}
                              onChange={toggleSelectAllVisible}
                              disabled={visibleManageable.length === 0}
                              aria-label={tr.admSelectAllAria}
                            />
                          </th>
                          {USER_SORT_COLUMNS.map(([key, labelKey]) => (
                            <th
                              key={key}
                              scope="col"
                              aria-sort={userSort?.key === key
                                ? (userSort.dir === 'asc' ? 'ascending' : 'descending')
                                : 'none'}
                            >
                              <button type="button" className="admin-th-sort" onClick={() => { toggleUserSort(key); setUsersPage(1); }}>
                                {tr[labelKey]}
                                {userSort?.key === key
                                  ? (userSort.dir === 'asc'
                                    ? <ArrowUp size={12} aria-hidden="true" />
                                    : <ArrowDown size={12} aria-hidden="true" />)
                                  : <ArrowUpDown size={12} aria-hidden="true" />}
                              </button>
                            </th>
                          ))}
                          {/* Email verified column header */}
                          <th scope="col" title={tr.admColVerifyTitle}>
                            <span className="visually-hidden">{tr.admLblVerify}</span>
                            <MailCheck size={14} aria-hidden="true" />
                          </th>
                          <th scope="col" className="admin-th-action">{tr.admColActions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedUsers.map(u => (
                          <tr key={u.id} className={u.is_active ? undefined : 'admin-row-inactive'}>
                            <td className="admin-cell-check">
                              {u.manageable && !u.is_self && (
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.has(u.id)}
                                  onChange={e => toggleSelectUser(u.id, e.target.checked)}
                                  aria-label={fill(tr.admSelectUserAria, { user: u.username })}
                                />
                              )}
                            </td>
                            <td className="admin-entity-name">
                              <button
                                type="button"
                                className="admin-user-name-btn"
                                onClick={() => setDrawerUser(u)}
                                title={fill(tr.admViewDetailTitle, { user: u.username })}
                              >
                                {u.username}
                              </button>
                              {u.is_self && <span className="status-chip status-chip--neutral admin-self-chip">{tr.admYou}</span>}
                            </td>
                            <td className="admin-cell-secondary">{u.email || '\u2014'}</td>
                            <td>
                              {u.manageable && !u.is_self ? (
                                <>
                                  <label htmlFor={`admin-role-${u.id}`} className="visually-hidden">
                                    {fill(tr.admChangeRoleLabel, { user: u.username })}
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
                                    {assignableRoles.map(r => <option key={r} value={r}>{roleLabel(tr, r)}</option>)}
                                  </select>
                                </>
                              ) : (
                                <HintCell
                                  focusable
                                  hint={u.is_self ? tr.admHintSelf : tr.admHintLevel}
                                >
                                  <span className="status-chip status-chip--neutral">
                                    {roleLabel(tr, u.role)}
                                  </span>
                                </HintCell>
                              )}
                            </td>
                            <td>
                              <span className={`status-chip ${u.is_active ? 'status-chip--success' : 'status-chip--danger'}`}>
                                {u.is_active ? tr.stActive : tr.admStatusInactive}
                              </span>
                            </td>
                            <td className="admin-cell-secondary admin-nowrap">{formatDateTime(u.created_at)}</td>
                            <td className="admin-cell-secondary admin-nowrap">
                              {u.last_login ? formatDateTime(u.last_login) : <span className="admin-null-val">{tr.admNever}</span>}
                            </td>
                            <td className="admin-cell-verify">
                              {u.email_verified
                                ? <MailCheck size={14} className="admin-verify-ok" aria-label={tr.admEmailVerifiedAria} />
                                : <MailX size={14} className="admin-verify-no" aria-label={tr.admEmailUnverifiedAria} />}
                            </td>
                            <td className="admin-cell-action">
                              <div className="admin-row-actions">
                                {u.manageable && !u.is_self && (
                                  <button
                                    type="button"
                                    className={`admin-icon-btn ${u.is_active ? 'admin-icon-btn--danger' : 'admin-icon-btn--success'}`}
                                    onClick={() => requestToggleActive(u)}
                                    aria-label={fill(u.is_active ? tr.admDeactAcctAria : tr.admReactAcctAria, { user: u.username })}
                                    title={u.is_active ? tr.admDeactAcctTitle : tr.admReactAcctTitle}
                                  >
                                    {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="admin-icon-btn"
                                  aria-label={fill(tr.admMenuAria, { user: u.username })}
                                  title={tr.admMenuTitle}
                                  onClick={e => {
                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setRowMenu(prev => prev?.userId === u.id ? null : { userId: u.id, top: r.bottom + 4, right: window.innerWidth - r.right });
                                  }}
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {pagedUsers.length === 0 && (
                          <tr>
                            <td colSpan={9} className="admin-table-empty">
                              {managedUsers.length === 0 ? tr.admNoAccounts : tr.admNoUserMatch}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Users table pagination */}
                  {usersTotalPages > 1 && (
                    <div className="admin-pagination">
                      <span className="admin-page-info" role="status">{usersRangeLabel}</span>
                      <button type="button" className="admin-page-btn" onClick={() => setUsersPage(1)} disabled={usersPageClamped <= 1} aria-label={tr.admPageFirst}><ChevronsLeft size={14} /></button>
                      <button type="button" className="admin-page-btn" onClick={() => setUsersPage(p => Math.max(1, p - 1))} disabled={usersPageClamped <= 1} aria-label={tr.admPagePrev}><ChevronLeft size={14} /></button>
                      <span className="admin-page-info">{usersPageClamped} / {usersTotalPages}</span>
                      <button type="button" className="admin-page-btn" onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))} disabled={usersPageClamped >= usersTotalPages} aria-label={tr.admPageNext}><ChevronRight size={14} /></button>
                      <button type="button" className="admin-page-btn" onClick={() => setUsersPage(usersTotalPages)} disabled={usersPageClamped >= usersTotalPages} aria-label={tr.admPageLast}><ChevronsRight size={14} /></button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* FR-30: KG entity exclusions */}
          <section className="admin-panel" aria-labelledby="admin-kg-title">
            <div className="admin-panel-head">
              <h2 className="admin-panel-title" id="admin-kg-title">
                <Shield size={18} color="var(--danger)" aria-hidden="true" />
                {tr.admKgTitle}
              </h2>
            </div>
            <p className="admin-panel-hint">{tr.admKgHint}</p>

            <div className="admin-exclusion-form">
              <label htmlFor="admin-new-exclusion" className="visually-hidden">{tr.admKgInputAria}</label>
              <input
                id="admin-new-exclusion"
                className="admin-input"
                type="text"
                placeholder={tr.admKgInputPh}
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
                {addingExclusion ? tr.admKgAdding : tr.admKgAddBtn}
              </button>
            </div>

            {exclusionsError ? (
              <div className="admin-feedback admin-feedback--error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                {tr.admKgLoadFail}
                <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => fetchAll(true)}>
                  {tr.admRetry}
                </button>
              </div>
            ) : (
              <div className="compliance-table-wrap">
                <table className="compliance-table">
                  <caption className="visually-hidden">{tr.admKgCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{tr.admKgColId}</th>
                      <th scope="col">{tr.admKgColName}</th>
                      <th scope="col">{tr.admKgColAdded}</th>
                      <th scope="col" className="admin-th-action">{tr.admColActions}</th>
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
                            aria-label={fill(tr.admKgDeleteAria, { name: exc.entity_name })}
                            title={fill(tr.admKgDeleteAria, { name: exc.entity_name })}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {exclusions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="admin-table-empty">{tr.admKgEmpty}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Audit logs � server-side pagination, search, action + date-range
              filters, username join, and CSV/JSON export of the FULL filtered
              set (critique P1; GET /api/admin/audit-logs + /export). */}
          <section className="admin-panel" aria-labelledby="admin-audit-title" aria-busy={auditLoading}>
            <div className="admin-panel-head">
              <h2 className="admin-panel-title" id="admin-audit-title">
                <Eye size={18} color="var(--warning)" aria-hidden="true" />
                {tr.admAuditTitle}
              </h2>
              <span className="status-chip status-chip--neutral">{tr.admAppendOnly}</span>
              <span className="admin-panel-note">{plural(tr, 'admEntries', auditTotal)}</span>
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
              <label htmlFor="admin-audit-search" className="visually-hidden">{tr.admAuditSearchAria}</label>
              <input
                id="admin-audit-search"
                className="admin-input"
                type="text"
                placeholder={tr.admAuditSearchPh}
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
              />
              <label htmlFor="admin-audit-action" className="visually-hidden">{tr.admAuditActionAria}</label>
              <select
                id="admin-audit-action"
                className="admin-select"
                value={auditAction}
                onChange={e => { setAuditLoading(true); setAuditAction(e.target.value); setAuditPage(1); }}
              >
                <option value="">{tr.admAuditAllActions}</option>
                {auditActionTypes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <label htmlFor="admin-audit-from" className="visually-hidden">{tr.admFromAria}</label>
              <input
                id="admin-audit-from"
                className="admin-input admin-date"
                type="date"
                value={auditFrom}
                max={auditTo || undefined}
                onChange={e => { setAuditLoading(true); setAuditFrom(e.target.value); setAuditPage(1); }}
              />
              <label htmlFor="admin-audit-to" className="visually-hidden">{tr.admToAria}</label>
              <input
                id="admin-audit-to"
                className="admin-input admin-date"
                type="date"
                value={auditTo}
                min={auditFrom || undefined}
                onChange={e => { setAuditLoading(true); setAuditTo(e.target.value); setAuditPage(1); }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetAuditFilters}
                disabled={!auditResettable}
              >
                <X size={14} aria-hidden="true" />
                {tr.admResetFilter}
              </button>
            </div>

            {auditError ? (
              <div className="admin-feedback admin-feedback--error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                {tr.admAuditLoadFail}
                <button type="button" className="btn btn-secondary admin-feedback-retry" onClick={() => { setAuditLoading(true); void fetchAudit(); }}>
                  {tr.admRetry}
                </button>
              </div>
            ) : auditTotal === 0 && !auditLoading ? (
              <p className="admin-list-empty">
                {auditHasFilters ? tr.admAuditEmptyFiltered : tr.admAuditEmpty}
              </p>
            ) : (
              <>
                <div className="compliance-table-wrap">
                  <table className="compliance-table">
                    <caption className="visually-hidden">{tr.admAuditCaption}</caption>
                    <thead>
                      <tr>
                        {[tr.admAuditColTime, tr.admAuditColUser, tr.admAuditColAction, tr.admAuditColResource, tr.admAuditColDetail].map(h => (
                          <th key={h} scope="col">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={auditLoading ? 'admin-audit-tbody admin-audit-tbody--busy' : 'admin-audit-tbody'}>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td className="admin-cell-secondary admin-nowrap">{formatDateTime(log.timestamp)}</td>
                          {/* Pengguna: username join; the full UUID is
                              hint-only content, so the cell stays focusable
                              and carries an aria-describedby twin
                              (critique P2�4). Deleted accounts fall back to
                              the UUID prefix (critique P1). */}
                          <td className="admin-cell-secondary">
                            {log.username ? (
                              <HintCell focusable hint={log.user_id}>
                                <span className="admin-hint-text">{log.username}</span>
                              </HintCell>
                            ) : log.user_id ? (
                              <HintCell focusable hint={log.user_id}>
                                <span className="admin-mono admin-hint-text">{`${log.user_id.slice(0, 8)}\u2026`}</span>
                              </HintCell>
                            ) : '\u2014'}
                          </td>
                          <td>
                            <span className={`status-chip ${ACTION_CHIP[log.action_type] ?? 'status-chip--neutral'}`}>
                              {log.action_type}
                            </span>
                          </td>
                          {/* Truncated cells: the full text stays in the DOM
                              for screen readers, so the hint is hover-only �
                              these cells are no longer tab stops
                              (critique P2�4: ~40 extra stops per page). */}
                          <td className="admin-cell-secondary">
                            {log.resource_id
                              ? (
                                <HintCell hint={log.resource_id}>
                                  <span className="admin-mono admin-hint-text">{log.resource_id}</span>
                                </HintCell>
                              )
                              : '\u2014'}
                          </td>
                          <td className="admin-cell-secondary">
                            {log.details
                              ? (
                                <HintCell hint={log.details}>
                                  <span className="admin-hint-text">{log.details}</span>
                                </HintCell>
                              )
                              : '\u2014'}
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && auditLoading && (
                        <tr>
                          <td colSpan={5} className="admin-table-empty" role="status">{tr.admAuditLoading}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="admin-pagination">
                  {/* role="status": the new range is announced after every
                      refetch � the visible counterpart of aria-busy
                      (critique P1�2 / Sam's silent-update flag). */}
                  <span className="admin-page-info" role="status">{rangeLabel}</span>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => { setAuditLoading(true); setAuditPage(1); }}
                    disabled={auditPage <= 1 || auditLoading}
                    aria-label={tr.admPageFirst}
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => { setAuditLoading(true); setAuditPage(p => Math.max(1, p - 1)); }}
                    disabled={auditPage <= 1 || auditLoading}
                    aria-label={tr.admPagePrev}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <label htmlFor="admin-audit-page-jump" className="visually-hidden">
                    {fill(tr.admJumpLabel, { n: pageCount })}
                  </label>
                  <input
                    id="admin-audit-page-jump"
                    className="admin-input admin-page-jump"
                    type="number"
                    min={1}
                    max={pageCount}
                    placeholder={`${auditPage}/${pageCount}`}
                    value={pageJump}
                    disabled={auditLoading}
                    onChange={e => setPageJump(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitPageJump();
                      if (e.key === 'Escape') setPageJump('');
                    }}
                    onBlur={() => setPageJump('')}
                  />
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => { setAuditLoading(true); setAuditPage(p => Math.min(pageCount, p + 1)); }}
                    disabled={auditPage >= pageCount || auditLoading}
                    aria-label={tr.admPageNext}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => { setAuditLoading(true); setAuditPage(pageCount); }}
                    disabled={auditPage >= pageCount || auditLoading}
                    aria-label={tr.admPageLast}
                  >
                    <ChevronsRight size={14} />
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

      {/* Per-row action dropdown menu � portaled so it escapes table overflow */}
      {rowMenu && createPortal((() => {
        const target = managedUsers.find(u => u.id === rowMenu.userId);
        if (!target) return null;
        return (
          <div
            ref={rowMenuRef}
            className="admin-row-menu"
            style={{ top: rowMenu.top, right: rowMenu.right }}
            role="menu"
            aria-label={fill(tr.admMenuAria, { user: target.username })}
          >
            <button
              type="button"
              role="menuitem"
              className="admin-row-menu-item"
              onClick={() => { setRowMenu(null); setDrawerUser(target); }}
            >
              <Info size={14} aria-hidden="true" />
              {tr.admViewDetail}
            </button>
            {target.manageable && !target.is_self && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="admin-row-menu-item admin-row-menu-item--danger"
                  onClick={() => requestForceLogout(target)}
                >
                  <LogOut size={14} aria-hidden="true" />
                  {tr.admForceLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="admin-row-menu-item admin-row-menu-item--danger"
                  onClick={() => requestResetPassword(target)}
                >
                  <KeyRound size={14} aria-hidden="true" />
                  {tr.admResetLabel}
                </button>
              </>
            )}
          </div>
        );
      })(), document.body)}

      {/* User detail drawer */}
      {drawerUser && createPortal(
        <div className="admin-drawer-overlay" onClick={e => { if (e.target === e.currentTarget) setDrawerUser(null); }}>
          <div className="admin-drawer" role="dialog" aria-modal="true" aria-label={fill(tr.admDrawerAria, { user: drawerUser.username })}>
            <div className="admin-drawer-head">
              <h3 className="admin-drawer-title">{drawerUser.username}</h3>
              <button type="button" className="admin-icon-btn" onClick={() => setDrawerUser(null)} aria-label={tr.admDrawerClose}>
                <X size={18} />
              </button>
            </div>

            <div className="admin-drawer-body">
              <div className="admin-drawer-section">
                <div className="admin-drawer-grid">
                  <span className="admin-drawer-label">{tr.admColEmail}</span>
                  <span className="admin-drawer-value">{drawerUser.email || '�'}</span>

                  <span className="admin-drawer-label">{tr.admColRole}</span>
                  <span className="admin-drawer-value">{roleLabel(tr, drawerUser.role)}</span>

                  <span className="admin-drawer-label">{tr.admColStatus}</span>
                  <span className="admin-drawer-value">
                    <span className={`status-chip ${drawerUser.is_active ? 'status-chip--success' : 'status-chip--danger'}`}>
                      {drawerUser.is_active ? tr.stActive : tr.admStatusInactive}
                    </span>
                  </span>

                  <span className="admin-drawer-label">{tr.admColCreated}</span>
                  <span className="admin-drawer-value admin-nowrap">{formatDateTime(drawerUser.created_at)}</span>

                  <span className="admin-drawer-label">{tr.admColLastLogin}</span>
                  <span className="admin-drawer-value admin-nowrap">
                    {drawerUser.last_login ? formatDateTime(drawerUser.last_login) : <span className="admin-null-val">{tr.admNever}</span>}
                  </span>

                  <span className="admin-drawer-label">{tr.admLblVerify}</span>
                  <span className="admin-drawer-value">
                    {drawerUser.email_verified
                      ? <span className="admin-verify-ok admin-drawer-verify"><MailCheck size={14} /> {tr.admVerified}</span>
                      : <span className="admin-verify-no admin-drawer-verify"><MailX size={14} /> {tr.admUnverified}</span>}
                  </span>

                  <span className="admin-drawer-label">{tr.admLblId}</span>
                  <span className="admin-drawer-value admin-mono" style={{ fontSize: '0.75rem' }}>{drawerUser.id}</span>
                </div>
              </div>

              {drawerUser.manageable && !drawerUser.is_self && (
                <div className="admin-drawer-section">
                  <div className="admin-drawer-section-title">{tr.admAccountActions}</div>
                  <div className="admin-drawer-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { setDrawerUser(null); requestToggleActive(drawerUser); }}
                    >
                      {drawerUser.is_active ? <UserX size={14} aria-hidden="true" /> : <UserCheck size={14} aria-hidden="true" />}
                      {drawerUser.is_active ? tr.admDeactLabel : tr.admReactLabel}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { setDrawerUser(null); requestForceLogout(drawerUser); }}
                    >
                      <LogOut size={14} aria-hidden="true" />
                      {tr.admForceLabel}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { setDrawerUser(null); requestResetPassword(drawerUser); }}
                    >
                      <KeyRound size={14} aria-hidden="true" />
                      {tr.admResetLabel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Temp password one-time display */}
      {tempPwdInfo && createPortal(
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setTempPwdInfo(null); }}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="admin-tmpwd-title">
            <h3 className="confirm-modal-title" id="admin-tmpwd-title">{tr.admTmpTitle}</h3>
            <p className="confirm-modal-body">
              {tr.admTmpBodyPre} <strong>{tempPwdInfo.username}</strong> {tr.admTmpBodyPost}
            </p>
            <div className="admin-tmpwd-box">
              <code className="admin-tmpwd-code">{tempPwdInfo.pwd}</code>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigator.clipboard?.writeText(tempPwdInfo.pwd).then(() => pushToast('success', { key: 'admPwdCopied' })).catch(() => {})}
              >
                {tr.admCopy}
              </button>
            </div>
            <div className="confirm-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setTempPwdInfo(null)}>
                {tr.admDone}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Local toast strip � reuses the UploadProvider's .upload-toast
          grammar (components.css); the house pattern for pages without the
          upload context (KnowledgeGraph, SystemMonitoring do the same). The
          container is always mounted so the live region pre-exists its
          first announcement (critique P1�1). */}
      <div className="upload-toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`upload-toast upload-toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            {toast.kind === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
            <span>{msg(tr, toast.msg)}</span>
            <button type="button" className="upload-toast-close" onClick={() => dismissToast(toast.id)} aria-label={tr.admToastClose}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
