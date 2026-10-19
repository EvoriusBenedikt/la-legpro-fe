import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, X } from 'lucide-react';
import { apiErrorMsg } from '../apiErrors';
import { useDateFormatters } from '../format';
import { useStrings, fill, plural, LocalizedError, type Msg, type StringKey } from '../i18n';
import {
  bulkGrants, listGrantIds, listGrants, listHistory, revealGrantReason, revokeGrant,
  setGrantExpiry, setGrantPermission, setGrantReasonVisible,
  type AccessGrant, type BulkResult, type ExpirySpec, type GrantEvent, type GrantFilters,
  type GrantList, type GrantPermission,
} from '../services/accessGrants';

/** Subset of AdminDashboard's ConfirmState (structurally compatible). */
export interface ConfirmRequest {
  title: Msg;
  body: Msg;
  confirmLabel: Msg;
  confirmTone?: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
}

interface Props {
  expanded: boolean;
  /** Called after any mutation so the dashboard tile count refreshes. */
  onChanged: () => void;
  requestConfirm: (state: ConfirmRequest) => void;
  pushToast: (kind: 'success' | 'error', message: Msg) => void;
}

const PAGE_SIZE = 25;
const BULK_CHUNK = 100;
const IDS_CAP = 1000; // must match IDS_CAP in admin_access_grants.py
const DEBOUNCE_MS = 300;
const DAY_MS = 86_400_000;

const DEFAULT_FILTERS: GrantFilters = {
  status: 'active', search: '', permission: '', expiry: '', grantedBy: '', sort: 'newest',
};
const EMPTY_HISTORY = { search: '', eventType: '', from: '', to: '' };

const EVENT_LABEL: Record<string, StringKey> = {
  granted: 'admAgHistGranted',
  revoked: 'admAgHistRevoked',
  expired: 'admAgHistExpired',
  extended: 'admAgHistExtended',
  expiry_set: 'admAgHistExpirySet',
  expiry_cleared: 'admAgHistExpiryCleared',
  permission_changed: 'admAgHistPermission',
  visibility_changed: 'admAgHistVisibility',
  reason_revealed: 'admAgHistRevealed',
};
const EVENT_TONE: Record<string, string> = {
  granted: 'success', revoked: 'revoked', expired: 'warning', extended: 'new',
  expiry_set: 'new', expiry_cleared: 'new', permission_changed: 'neutral',
  visibility_changed: 'neutral', reason_revealed: 'neutral',
};

const permKey = (p: GrantPermission): StringKey => (p === 'read' ? 'admAgPermRead' : 'admAgPermFull');

const todayLocal = (offsetDays = 0): string => {
  const d = new Date(Date.now() + offsetDays * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Custom date -> end of that local day, with offset (server rejects naive datetimes). */
const endOfDayIso = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
};

const failMsg = (key: StringKey, e: unknown): Msg => ({ key, params: { reason: apiErrorMsg(e, 'errUnexpected') } });

const userOf = (g: AccessGrant) => g.username || g.granted_to;

/** Debounced copy of a value; setState happens in the timer callback, not the effect body. */
function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return out;
}

/* ───────────────────────── Row editor ───────────────────────── */

interface EditorProps {
  grant: AccessGrant;
  revealed: string | undefined;
  onReveal: (id: string, reason: string) => void;
  onSaved: () => void;
  onClose: () => void;
  pushToast: Props['pushToast'];
}

type ExpiryChoice = '7' | '30' | '90' | 'custom' | 'never' | '';

const GrantEditor = ({ grant, revealed, onReveal, onSaved, onClose, pushToast }: EditorProps) => {
  const t = useStrings();
  const uid = useId();
  const [choice, setChoice] = useState<ExpiryChoice>('');
  const [customDate, setCustomDate] = useState('');
  const [dateError, setDateError] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: Msg) => {
    setBusy(true);
    try {
      await fn();
      pushToast('success', ok);
      onSaved();
    } catch (e) {
      pushToast('error', failMsg('admAgActionFail', e));
      console.error('Access grant update error:', e);
    } finally {
      setBusy(false);
    }
  };

  const saveExpiry = () => {
    let spec: ExpirySpec;
    if (choice === 'never') {
      spec = { mode: 'never' };
    } else if (choice === 'custom') {
      if (!customDate || customDate <= todayLocal()) { setDateError(true); return; }
      spec = { mode: 'set', expires_at: endOfDayIso(customDate) };
    } else if (choice) {
      spec = { mode: 'extend', days: Number(choice) };
    } else {
      return;
    }
    setDateError(false);
    void run(() => setGrantExpiry(grant.id, spec), { key: 'admAgExpirySaved' });
  };

  const reveal = async () => {
    setBusy(true);
    try {
      onReveal(grant.id, (await revealGrantReason(grant.id)) ?? '');
    } catch (e) {
      pushToast('error', failMsg('admAgActionFail', e));
    } finally {
      setBusy(false);
    }
  };

  const choices: [ExpiryChoice, string][] = [
    ['7', t.admAgExtend7], ['30', t.admAgExtend30], ['90', t.admAgExtend90],
    ['custom', t.admAgCustomDate], ['never', t.admAgNever],
  ];
  const reasonText = grant.reason_hidden ? revealed : grant.reason;

  return (
    <div className="admin-ag-editor">
      <fieldset className="admin-ag-fieldset" disabled={busy}>
        <legend>{t.admAgEditorExpiry}</legend>
        <div className="admin-ag-choices">
          {choices.map(([value, label]) => (
            <label key={value} className="admin-ag-choice">
              <input
                type="radio"
                name={`${uid}-expiry`}
                checked={choice === value}
                onChange={() => { setChoice(value); setDateError(false); }}
              />
              {label}
            </label>
          ))}
        </div>
        {choice === 'custom' && (
          <div className="admin-ag-date">
            <label htmlFor={`${uid}-date`} className="visually-hidden">{t.admAgCustomDateAria}</label>
            <input
              id={`${uid}-date`}
              type="date"
              className="admin-input admin-date"
              min={todayLocal(1)}
              value={customDate}
              aria-invalid={dateError}
              aria-describedby={dateError ? `${uid}-date-err` : undefined}
              onChange={e => { setCustomDate(e.target.value); setDateError(false); }}
            />
            {dateError && <span id={`${uid}-date-err`} className="admin-ag-error" role="alert">{t.admAgDateFuture}</span>}
          </div>
        )}
        {grant.expires_at === null && ['7', '30', '90'].includes(choice) && (
          <p className="admin-ag-hint" role="status">{t.admAgNeverWarn}</p>
        )}
        <div className="admin-ag-actions">
          <button type="button" className="btn btn-primary" onClick={saveExpiry} disabled={!choice}>{t.admAgSave}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t.admAgClose}</button>
        </div>
      </fieldset>

      <div className="admin-ag-field">
        <label htmlFor={`${uid}-perm`}>{t.admAgPermLabel}</label>
        <select
          id={`${uid}-perm`}
          className="admin-select admin-select--row"
          value={grant.permission}
          disabled={busy}
          aria-describedby={`${uid}-perm-help`}
          onChange={e => {
            const next = e.target.value as GrantPermission;
            if (next !== grant.permission) void run(() => setGrantPermission(grant.id, next), { key: 'admAgPermSaved' });
          }}
        >
          <option value="full">{t.admAgPermFull}</option>
          <option value="read">{t.admAgPermRead}</option>
        </select>
        <span id={`${uid}-perm-help`} className="admin-ag-hint">
          {grant.permission === 'read' ? t.admAgPermHelpRead : t.admAgPermHelpFull}
        </span>
      </div>

      <div className="admin-ag-field">
        <span className="admin-ag-field-label">{t.admAgReasonLabel}</span>
        {reasonText !== undefined && reasonText !== null ? (
          <p className="admin-ag-reason">{reasonText}</p>
        ) : (
          <div className="admin-ag-reason-hidden">
            <span className="admin-null-val">{t.admAgReasonHidden}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void reveal()} disabled={busy}>
              <Eye size={14} aria-hidden="true" /> {t.admAgReasonReveal}
            </button>
          </div>
        )}
        <label className="admin-ag-choice">
          <input
            type="checkbox"
            role="switch"
            checked={!grant.reason_hidden}
            disabled={busy}
            onChange={e => void run(() => setGrantReasonVisible(grant.id, e.target.checked), { key: 'admAgVisSaved' })}
          />
          {t.admAgReasonSwitch}
        </label>
      </div>
    </div>
  );
};

/* ───────────────────────── Panel ───────────────────────── */

const AdminAccessGrants = ({ expanded, onChanged, requestConfirm, pushToast }: Props) => {
  const t = useStrings();
  const { formatDateTime } = useDateFormatters();
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameById = useRef(new Map<string, string>());

  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [reloadKey, setReloadKey] = useState(0);

  // Active tab
  const [filters, setFilters] = useState<GrantFilters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<GrantList | null>(null);
  const [activeTotal, setActiveTotal] = useState(0);
  // Captured at fetch time: render must stay pure, and day counts are coarse.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loadedKey, setLoadedKey] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [truncated, setTruncated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [bulkDays, setBulkDays] = useState('30');

  // History tab
  const [hist, setHist] = useState(EMPTY_HISTORY);
  const [histSearchInput, setHistSearchInput] = useState('');
  const [histPage, setHistPage] = useState(1);
  const [events, setEvents] = useState<{ rows: GrantEvent[]; total: number } | null>(null);

  const debouncedSearch = useDebounced(searchInput, DEBOUNCE_MS);
  const debouncedHistSearch = useDebounced(histSearchInput, DEBOUNCE_MS);
  const effFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);
  const effHist = useMemo(() => ({ ...hist, search: debouncedHistSearch }), [hist, debouncedHistSearch]);

  const key = tab === 'active'
    ? JSON.stringify(['a', effFilters, page, reloadKey])
    : JSON.stringify(['h', effHist, histPage, reloadKey]);
  const loading = expanded && loadedKey !== key && errorKey !== key;
  const failed = errorKey === key;

  useEffect(() => {
    if (!expanded) return undefined;
    const ctl = new AbortController();
    (async () => {
      try {
        if (tab === 'active') {
          const res = await listGrants(effFilters, page, PAGE_SIZE, ctl.signal);
          res.grants.forEach(g => nameById.current.set(g.id, userOf(g)));
          setList(res);
          setNowMs(Date.now());
          setActiveTotal(res.active_total);
        } else {
          const res = await listHistory(effHist, histPage, PAGE_SIZE, ctl.signal);
          setEvents({ rows: res.events, total: res.total });
        }
        setLoadedKey(key);
      } catch (e) {
        if (ctl.signal.aborted) return;
        console.error('Access grants fetch error:', e);
        setErrorKey(key);
      }
    })();
    return () => ctl.abort();
  }, [expanded, tab, effFilters, effHist, page, histPage, key]);

  // Typing in the search box resets paging once the debounce settles.
  useEffect(() => { setPage(1); }, [debouncedSearch]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setHistPage(1); }, [debouncedHistSearch]); // eslint-disable-line react-hooks/set-state-in-effect

  const reload = useCallback(() => { setReloadKey(k => k + 1); onChanged(); }, [onChanged]);

  const patchFilters = (p: Partial<GrantFilters>) => {
    setFilters(f => ({ ...f, ...p, ...(p.status === 'expired' ? { expiry: '' as const } : {}) }));
    setPage(1);
    setSelected(new Set());
    setTruncated(false);
    setEditingId(null);
  };
  const resetFilters = () => { setFilters(DEFAULT_FILTERS); setSearchInput(''); setPage(1); setSelected(new Set()); setTruncated(false); };
  const filtersDirty = JSON.stringify({ ...filters, search: searchInput }) !== JSON.stringify(DEFAULT_FILTERS);

  const grants = list?.grants ?? [];
  const total = list?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = grants.map(g => g.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const pageSomeSelected = pageIds.some(id => selected.has(id));

  const toggleOne = (id: string, on: boolean) =>
    setSelected(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  const togglePage = () => setSelected(prev => {
    const n = new Set(prev);
    pageIds.forEach(id => (pageAllSelected ? n.delete(id) : n.add(id)));
    return n;
  });
  const selectAllResults = async () => {
    try {
      const res = await listGrantIds(effFilters);
      setSelected(new Set(res.ids));
      setTruncated(res.truncated);
    } catch (e) {
      pushToast('error', failMsg('admAgActionFail', e));
    }
  };

  /* Single revoke */
  const requestRevoke = (g: AccessGrant) => {
    requestConfirm({
      title: { key: 'admAgRevokeTitle' },
      body: { key: 'admAgRevokeBody', params: { user: userOf(g), doc: g.judul || g.doc_id } },
      confirmLabel: { key: 'admAgRevokeBtn' },
      confirmTone: 'danger',
      onConfirm: async () => {
        try {
          await revokeGrant(g.id);
        } catch (e) {
          console.error('Revoke grant error:', e);
          throw new LocalizedError(failMsg('admAgRevokeFail', e));
        }
        pushToast('success', { key: 'admAgRevokedToast' });
        setSelected(prev => { const n = new Set(prev); n.delete(g.id); return n; });
        setEditingId(null);
        reload();
        // The dialog restores focus to the (now removed) row button; land on the heading instead.
        window.setTimeout(() => headingRef.current?.focus(), 80);
      },
    });
  };

  /* Bulk */
  const runBulk = async (body: Parameters<typeof bulkGrants>[0]) => {
    const ids = [...selected];
    const merged: BulkResult['results'] = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      try {
        merged.push(...(await bulkGrants(body, ids.slice(i, i + BULK_CHUNK))).results);
      } catch (e) {
        console.error('Bulk access grants error:', e);
        ids.slice(i, i + BULK_CHUNK).forEach(id => merged.push({ id, ok: false, code: 'error' }));
      }
    }
    const okIds = merged.filter(r => r.ok).map(r => r.id);
    const bad = merged.filter(r => !r.ok).map(r => nameById.current.get(r.id) ?? r.id.slice(0, 8));
    const names = bad.slice(0, 6).join(', ') + (bad.length > 6 ? ` +${bad.length - 6}` : '');
    if (bad.length === 0) pushToast('success', { key: okIds.length === 1 ? 'admAgBulkDoneOne' : 'admAgBulkDoneOther', params: { n: okIds.length } });
    else if (okIds.length === 0) pushToast('error', { key: 'admAgBulkAllFail', params: { total: merged.length, names } });
    else pushToast('error', { key: 'admAgBulkPartial', params: { ok: okIds.length, total: merged.length, names } });
    setSelected(prev => { const n = new Set(prev); okIds.forEach(id => n.delete(id)); return n; });
    setTruncated(false);
    reload();
  };

  const selectedNames = (): Msg => {
    const all = [...selected].map(id => nameById.current.get(id) ?? id.slice(0, 8));
    const shown = all.slice(0, 6).join(', ');
    return { text: all.length > 6 ? `${shown} +${all.length - 6}` : shown };
  };
  const titlePl = (base: string): Msg => ({
    key: `${base}${selected.size === 1 ? 'One' : 'Other'}` as StringKey, params: { n: selected.size },
  });

  const confirmBulk = (title: Msg, body: Msg, tone: 'danger' | 'primary', body2: Parameters<typeof bulkGrants>[0]) =>
    requestConfirm({
      title, body, confirmLabel: { key: 'admAgBulkConfirm' }, confirmTone: tone,
      onConfirm: () => runBulk(body2),
    });

  /* Badges */
  const statusBadge = (g: AccessGrant) => {
    if (g.status === 'expired') {
      return <span className="status-chip status-chip--danger admin-ag-badge"><AlertTriangle size={12} aria-hidden="true" />{t.admAgExpired}</span>;
    }
    if (g.expiring_soon && g.expires_at) {
      const days = Math.max(1, Math.ceil((new Date(g.expires_at).getTime() - nowMs) / DAY_MS));
      return (
        <span className="status-chip status-chip--warning admin-ag-badge">
          <Clock size={12} aria-hidden="true" />{t.admAgExpiringSoon} · {fill(t.admAgDaysLeft, { n: days })}
        </span>
      );
    }
    return <span className="status-chip status-chip--success admin-ag-badge"><CheckCircle2 size={12} aria-hidden="true" />{t.admAgActiveBadge}</span>;
  };

  /* Tabs: roving tabindex + arrow keys */
  const tabIds: ('active' | 'history')[] = ['active', 'history'];
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabIds.indexOf(tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabIds.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabIds.length) % tabIds.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabIds.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(tabIds[next]);
    document.getElementById(`${uid}-tab-${tabIds[next]}`)?.focus();
  };

  const histChange = (ev: GrantEvent): string => {
    const fmt = (v: string | null) => {
      if (v === null || v === '') return '';
      if (v === 'none') return t.admAgNever;
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
      if (v === 'full' || v === 'read') return t[permKey(v)];
      return v; // shortcut: visibility true/false and revoke notes are shown raw
    };
    const [o, n] = [fmt(ev.old_value), fmt(ev.new_value)];
    return o && n ? `${o} → ${n}` : (n || o || '\u2014');
  };

  const rangeCount = grants.length;
  const emptyMsg = filtersDirty ? t.admAgEmptyFiltered : (filters.status === 'expired' ? t.admAgEmptyExpired : t.admGrantsEmpty);

  const pager = (cur: number, last: number, set: (p: number) => void) => (
    <div className="admin-pagination">
      <span className="admin-page-info">{fill(t.admAgPageOf, { page: cur, pages: last })}</span>
      <button type="button" className="admin-page-btn" onClick={() => set(cur - 1)} disabled={cur <= 1} aria-label={t.admAgPrev}>
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <button type="button" className="admin-page-btn" onClick={() => set(cur + 1)} disabled={cur >= last} aria-label={t.admAgNext}>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );

  const errorBlock = (
    <div className="admin-grants-status admin-grants-status--error" role="alert">
      <span>{t.admGrantsError}</span>
      <button type="button" className="btn btn-secondary" onClick={() => setReloadKey(k => k + 1)}>{t.admRetry}</button>
    </div>
  );

  return (
    <>
      <h3 ref={headingRef} tabIndex={-1} className="admin-ag-title">{t.admGrantsPanelTitle}</h3>
      <div className="admin-ag-tabs" role="tablist" aria-label={t.admAgTabsAria} onKeyDown={onTabKey}>
        {tabIds.map(id => (
          <button
            key={id}
            id={`${uid}-tab-${id}`}
            type="button"
            role="tab"
            className="admin-ag-tab"
            aria-selected={tab === id}
            aria-controls={`${uid}-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {id === 'active' ? `${t.admAgTabActive} (${activeTotal})` : t.admAgTabHistory}
          </button>
        ))}
      </div>

      {/* ── Aktif ── */}
      <div id={`${uid}-panel-active`} role="tabpanel" aria-labelledby={`${uid}-tab-active`} hidden={tab !== 'active'}>
        <div className="admin-toolbar admin-ag-toolbar">
          <label htmlFor={`${uid}-search`} className="visually-hidden">{t.admAgSearchAria}</label>
          <input
            id={`${uid}-search`}
            className="admin-input"
            type="search"
            placeholder={t.admAgSearchPh}
            value={searchInput}
            maxLength={100}
            onChange={e => { setSearchInput(e.target.value); setSelected(new Set()); setTruncated(false); }}
          />
          <label htmlFor={`${uid}-status`} className="visually-hidden">{t.admAgStatusLabel}</label>
          <select id={`${uid}-status`} className="admin-select" value={filters.status}
            onChange={e => patchFilters({ status: e.target.value as GrantFilters['status'] })}>
            <option value="active">{t.admAgStatusActive}</option>
            <option value="expired">{t.admAgStatusExpired}</option>
          </select>
          <label htmlFor={`${uid}-perm`} className="visually-hidden">{t.admAgPermLabel}</label>
          <select id={`${uid}-perm`} className="admin-select" value={filters.permission}
            onChange={e => patchFilters({ permission: e.target.value as GrantFilters['permission'] })}>
            <option value="">{t.admAgPermAll}</option>
            <option value="full">{t.admAgPermFull}</option>
            <option value="read">{t.admAgPermRead}</option>
          </select>
          <label htmlFor={`${uid}-expiry`} className="visually-hidden">{t.admAgExpiryFilterLabel}</label>
          <select id={`${uid}-expiry`} className="admin-select" value={filters.expiry}
            disabled={filters.status === 'expired'}
            onChange={e => patchFilters({ expiry: e.target.value as GrantFilters['expiry'] })}>
            <option value="">{t.admAgExpiryAll}</option>
            <option value="expiring">{t.admAgExpiringSoon}</option>
            <option value="never">{t.admAgNever}</option>
          </select>
          <label htmlFor={`${uid}-granter`} className="visually-hidden">{t.admAgGranterLabel}</label>
          <select id={`${uid}-granter`} className="admin-select" value={filters.grantedBy}
            onChange={e => patchFilters({ grantedBy: e.target.value })}>
            <option value="">{t.admAgGranterAll}</option>
            {(list?.granters ?? []).map(g => <option key={g.id} value={g.id}>{g.username}</option>)}
          </select>
          <label htmlFor={`${uid}-sort`} className="visually-hidden">{t.admAgSortLabel}</label>
          <select id={`${uid}-sort`} className="admin-select" value={filters.sort}
            onChange={e => patchFilters({ sort: e.target.value as GrantFilters['sort'] })}>
            <option value="newest">{t.admAgSortNewest}</option>
            <option value="expiry">{t.admAgSortExpiry}</option>
            <option value="last_accessed">{t.admAgSortLastAccessed}</option>
            <option value="username">{t.admAgSortUsername}</option>
          </select>
          <button type="button" className="btn btn-secondary" onClick={resetFilters} disabled={!filtersDirty}>{t.admAgReset}</button>
        </div>

        <p className="admin-ag-count" role="status">
          {list && !loading && !failed ? fill(t.admAgShowing, { n: rangeCount, total }) : '\u00a0'}
        </p>

        {selected.size > 0 && (
          <div className="admin-bulk-bar" role="group" aria-label={t.admAgBulkGroupAria}>
            <span className="admin-bulk-count">{plural(t, 'admAgBulkSelected', selected.size)}</span>
            {pageAllSelected && total > grants.length && selected.size < Math.min(total, IDS_CAP) && (
              <button type="button" className="btn btn-secondary" onClick={() => void selectAllResults()}>
                {fill(t.admAgSelectAllResults, { total })}
              </button>
            )}
            {truncated && <span className="admin-ag-hint">{fill(t.admAgSelectAllTruncated, { max: IDS_CAP })}</span>}
            <button type="button" className="btn btn-danger"
              onClick={() => confirmBulk(titlePl('admAgBulkRevokeTitle'),
                { key: 'admAgBulkRevokeBody', params: { names: selectedNames() } }, 'danger', { action: 'revoke' })}>
              {t.admAgBulkRevoke}
            </button>
            <label htmlFor={`${uid}-bulkdays`} className="visually-hidden">{t.admAgBulkExtendAria}</label>
            <select id={`${uid}-bulkdays`} className="admin-select admin-select--row" value={bulkDays}
              onChange={e => setBulkDays(e.target.value)}>
              <option value="7">{t.admAgExtend7}</option>
              <option value="30">{t.admAgExtend30}</option>
              <option value="90">{t.admAgExtend90}</option>
            </select>
            <button type="button" className="btn btn-secondary"
              onClick={() => confirmBulk(titlePl('admAgBulkExtendTitle'),
                { key: 'admAgBulkExtendBody', params: { names: selectedNames(), days: bulkDays } }, 'primary',
                { action: 'extend', expiry: { mode: 'extend', days: Number(bulkDays) } })}>
              {t.admAgBulkExtendBtn}
            </button>
            <button type="button" className="btn btn-secondary"
              onClick={() => confirmBulk(titlePl('admAgBulkVisTitle'),
                { key: 'admAgBulkVisBodyShow', params: { names: selectedNames() } }, 'primary',
                { action: 'reason_visibility', reason_visible: true })}>
              {t.admAgBulkShowReason}
            </button>
            <button type="button" className="btn btn-secondary"
              onClick={() => confirmBulk(titlePl('admAgBulkVisTitle'),
                { key: 'admAgBulkVisBodyHide', params: { names: selectedNames() } }, 'primary',
                { action: 'reason_visibility', reason_visible: false })}>
              {t.admAgBulkHideReason}
            </button>
            <button type="button" className="admin-bulk-clear" onClick={() => { setSelected(new Set()); setTruncated(false); }}
              aria-label={t.admAgBulkClearAria}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {failed ? errorBlock : loading && !list ? (
          <p className="admin-grants-status" role="status">{t.admGrantsLoading}</p>
        ) : grants.length === 0 && !loading ? (
          <p className="admin-grants-status">{emptyMsg}</p>
        ) : (
          <>
            <div className="compliance-table-wrap" aria-busy={loading}>
              <table className="compliance-table">
                <caption className="visually-hidden">{t.admAgCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="admin-th-check">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        ref={el => { if (el) el.indeterminate = !pageAllSelected && pageSomeSelected; }}
                        onChange={togglePage}
                        aria-label={t.admAgSelectAllAria}
                      />
                    </th>
                    <th scope="col">{t.admAgColAccount}</th>
                    <th scope="col">{t.admAgColDoc}</th>
                    <th scope="col">{t.admAgColPerm}</th>
                    <th scope="col">{t.admAgColStatus}</th>
                    <th scope="col">{t.admAgColLast}</th>
                    <th scope="col">{t.admAgColGranted}</th>
                    <th scope="col" className="admin-th-action">{t.admAgColActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map(g => (
                    <React.Fragment key={g.id}>
                      <tr>
                        <td className="admin-cell-check">
                          <input
                            type="checkbox"
                            checked={selected.has(g.id)}
                            onChange={e => toggleOne(g.id, e.target.checked)}
                            aria-label={fill(t.admAgSelectRowAria, { user: userOf(g) })}
                          />
                        </td>
                        <td className="admin-entity-name">
                          {userOf(g)}
                          {g.email && <div className="admin-cell-secondary">{g.email}</div>}
                        </td>
                        <td>
                          {g.judul || g.doc_id}
                          {g.klasifikasi && <div className="admin-cell-secondary">{g.klasifikasi}</div>}
                        </td>
                        <td>
                          <span className="status-chip status-chip--neutral">{t[permKey(g.permission)]}</span>
                        </td>
                        <td>
                          {statusBadge(g)}
                          <div className="admin-cell-secondary admin-nowrap">
                            {g.expires_at ? fill(t.admGrantsExpires, { date: formatDateTime(g.expires_at) }) : t.admGrantsNeverExpires}
                          </div>
                        </td>
                        <td className="admin-cell-secondary admin-nowrap">
                          {g.last_accessed_at ? formatDateTime(g.last_accessed_at) : <span className="admin-null-val">{t.admAgNeverAccessed}</span>}
                        </td>
                        <td className="admin-cell-secondary">
                          {fill(t.admAgGrantedBy, { name: g.granted_by_username === '(akun dihapus)' ? t.admAgAccountDeleted : g.granted_by_username })}
                          <div className="admin-nowrap">{formatDateTime(g.created_at)}</div>
                        </td>
                        <td className="admin-ag-row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-expanded={editingId === g.id}
                            aria-label={fill(t.admAgManageAria, { user: userOf(g) })}
                            onClick={() => setEditingId(id => (id === g.id ? null : g.id))}
                          >
                            {t.admAgManage}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            aria-label={fill(t.admAgRevokeRowAria, { user: userOf(g) })}
                            onClick={() => requestRevoke(g)}
                          >
                            <Ban size={14} aria-hidden="true" /> {t.admAgBulkRevoke}
                          </button>
                        </td>
                      </tr>
                      {editingId === g.id && (
                        <tr className="admin-ag-editor-row">
                          <td colSpan={8}>
                            <GrantEditor
                              grant={g}
                              revealed={revealed[g.id]}
                              onReveal={(id, reason) => setRevealed(r => ({ ...r, [id]: reason }))}
                              onSaved={reload}
                              onClose={() => setEditingId(null)}
                              pushToast={pushToast}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && pager(page, pages, setPage)}
          </>
        )}
      </div>

      {/* ── Riwayat ── */}
      <div id={`${uid}-panel-history`} role="tabpanel" aria-labelledby={`${uid}-tab-history`} hidden={tab !== 'history'}>
        <div className="admin-toolbar admin-ag-toolbar">
          <label htmlFor={`${uid}-hsearch`} className="visually-hidden">{t.admAgHistSearchAria}</label>
          <input id={`${uid}-hsearch`} className="admin-input" type="search" placeholder={t.admAgSearchPh}
            value={histSearchInput} maxLength={100} onChange={e => setHistSearchInput(e.target.value)} />
          <label htmlFor={`${uid}-htype`} className="visually-hidden">{t.admAgHistTypeLabel}</label>
          <select id={`${uid}-htype`} className="admin-select" value={hist.eventType}
            onChange={e => { setHist(h => ({ ...h, eventType: e.target.value })); setHistPage(1); }}>
            <option value="">{t.admAgHistAll}</option>
            {Object.entries(EVENT_LABEL).map(([k, label]) => <option key={k} value={k}>{t[label]}</option>)}
          </select>
          <label htmlFor={`${uid}-hfrom`} className="visually-hidden">{t.admAgHistFromAria}</label>
          <input id={`${uid}-hfrom`} className="admin-input admin-date" type="date" value={hist.from}
            onChange={e => { setHist(h => ({ ...h, from: e.target.value })); setHistPage(1); }} />
          <label htmlFor={`${uid}-hto`} className="visually-hidden">{t.admAgHistToAria}</label>
          <input id={`${uid}-hto`} className="admin-input admin-date" type="date" value={hist.to}
            onChange={e => { setHist(h => ({ ...h, to: e.target.value })); setHistPage(1); }} />
        </div>
        {failed && tab === 'history' ? errorBlock : loading && !events ? (
          <p className="admin-grants-status" role="status">{t.admGrantsLoading}</p>
        ) : !events || events.rows.length === 0 ? (
          <p className="admin-grants-status">{loading ? t.admGrantsLoading : t.admAgHistEmpty}</p>
        ) : (
          <>
            <div className="compliance-table-wrap" aria-busy={loading}>
              <table className="compliance-table">
                <caption className="visually-hidden">{t.admAgHistCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.admAgHistColTime}</th>
                    <th scope="col">{t.admAgHistColAction}</th>
                    <th scope="col">{t.admAgHistColAccount}</th>
                    <th scope="col">{t.admAgHistColDoc}</th>
                    <th scope="col">{t.admAgHistColBy}</th>
                    <th scope="col">{t.admAgHistColChange}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.rows.map(ev => (
                    <tr key={ev.id}>
                      <td className="admin-cell-secondary admin-nowrap">{formatDateTime(ev.created_at)}</td>
                      <td>
                        <span className={`status-chip status-chip--${EVENT_TONE[ev.event_type] ?? 'neutral'}`}>
                          {EVENT_LABEL[ev.event_type] ? t[EVENT_LABEL[ev.event_type]] : ev.event_type}
                        </span>
                      </td>
                      <td className="admin-entity-name">{ev.grantee_name || '\u2014'}</td>
                      <td>{ev.doc_title || ev.doc_id || '\u2014'}</td>
                      <td className="admin-cell-secondary">{ev.actor_name || t.admAgSystem}</td>
                      <td className="admin-cell-secondary">{histChange(ev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Math.ceil(events.total / PAGE_SIZE) > 1 && pager(histPage, Math.ceil(events.total / PAGE_SIZE), setHistPage)}
          </>
        )}
      </div>
    </>
  );
};

export default AdminAccessGrants;
