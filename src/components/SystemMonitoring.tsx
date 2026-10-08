import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  AlertTriangle, CheckCircle, ShieldAlert, Cpu, Server, HardDrive, Database,
  BarChart2, UserCheck, Play, Save, FileText, Users, Clock, Search,
  ChevronLeft, ChevronRight, ChevronDown, Settings, Pause, RefreshCw, X, Info, Wifi
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import './SystemMonitoring.css';

import api from '../services/api';
import { useDateFormatters } from '../format';
import LoadingOrb from './LoadingOrb';

interface HealthData {
  cpu: number;
  memory: { total: number; used: number; percent: number };
  disk: { total: number; used: number; percent: number };
  database: { metadata_db_mb: number; users_db_mb: number };
  uptime_seconds: number;
}

interface TaskData {
  user: string;
  action: string;
  resource: string;
  timestamp: string;
  status: string;
  // Queue-task shape returned by /api/engineer/queue (optional fields)
  name?: string;
  start_time?: string;
  end_time?: string;
}

interface BackupData {
  filename: string;
  size_mb: number;
  created_at: string;
}

interface SessionData {
  username: string;
  role: string;
  last_seen: string;
  ip_address: string;
}

interface ApiStatData {
  route: string;
  total_requests: number;
  error_count: number;
  error_rate_pct: number;
}

interface AuditLogData {
  id: number;
  timestamp: string;
  user_id: string;
  action_type: string;
  resource_id: string;
  details: string;
}

interface MetricPointData {
  timestamp: string;
  cpu: number;
  ram: number;
  metadata_db_mb: number;
}

interface BackupConfigData {
  frequency: string;
  time: string;
  retention_count: number;
}

interface ActiveTaskData {
  status: string;
  name?: string;
  action?: string;
  start_time: string;
}

interface UserStatData {
  user_id: string;
  total_actions: number;
  breakdown?: Record<string, number>;
}

interface LlmCallData {
  timestamp: string;
  endpoint: string;
  latency_ms: number;
  tokens_used: number;
}

interface LlmMetricsData {
  aggregate?: {
    total_calls?: number;
    avg_latency_ms?: number;
    total_cost?: number;
  };
  recent?: LlmCallData[];
}

interface KgRebuildData {
  start_time: string;
  duration_s?: number | null;
  status: string;
  nodes_changed?: number | null;
  edges_changed?: number | null;
}

interface ErrorRateData {
  route: string;
  error_rate_pct: number;
  error_count: number;
  total_requests: number;
  last_error_time?: string | null;
}

const ALERT_THRESHOLDS = {
  cpu: { warn: 70, critical: 90 },
  memory: { warn: 75, critical: 90 },
  disk: { warn: 80, critical: 95 },
};

function getAlertLevel(value: number, thresholds: { warn: number; critical: number }) {
  if (value >= thresholds.critical) return 'critical';
  if (value >= thresholds.warn) return 'warn';
  return 'ok';
}

/* Keeps the fetch-era res.ok semantics: an HTTP error resolves to null (that panel is
   skipped), while a network error rethrows so the caller's catch shows the global error. */
const getOrSkipHttpError = (url: string) =>
  api.get(url).catch((e) => {
    if (!e.response) throw e;
    return null;
  });

/* Polling cadence (critique 2026-10-08, P1 "5-second firehose"): live vitals every
   10 s, cumulative/historical endpoints every 60 s, and the analytics trio only while
   its section is open. Was 11 endpoints every 5 s (~132 req/min); now ~26 req/min
   at worst, with the heavy metrics-history payload cut 12x. */
const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 60_000;
const AUDIT_DEBOUNCE_MS = 350;

type ChipTone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

/* Machine statuses -> the Fixed Vocabulary (DESIGN.md): Gagal / Selesai / Memproses /
   Menunggu, never the raw enum. Tones follow the house chip doctrine: in-flight
   machine work is info blue, queued is neutral, outcomes ride the verdict triad. */
const STATUS_VOCAB: Record<string, { label: string; tone: ChipTone }> = {
  FAILED: { label: 'Gagal', tone: 'danger' },
  ERROR: { label: 'Gagal', tone: 'danger' },
  COMPLETED: { label: 'Selesai', tone: 'success' },
  SUCCESS: { label: 'Selesai', tone: 'success' },
  DONE: { label: 'Selesai', tone: 'success' },
  RUNNING: { label: 'Memproses', tone: 'info' },
  PROCESSING: { label: 'Memproses', tone: 'info' },
  STARTED: { label: 'Memproses', tone: 'info' },
  PENDING: { label: 'Menunggu', tone: 'neutral' },
  QUEUED: { label: 'Menunggu', tone: 'neutral' },
};

function statusVocab(status: string): { label: string; tone: ChipTone } {
  return STATUS_VOCAB[status?.toUpperCase()] ?? { label: status || '—', tone: 'neutral' };
}

/* Audit action -> chip tone, following the admin audit-log doctrine in DESIGN.md
   (GRANT/ACTIVATE = success, REVOKE/DELETE/DEACTIVATE = revoked red, UPLOAD = new
   sky, anything unknown = neutral). */
const ACTION_TONES: Record<string, 'success' | 'danger' | 'info'> = {
  GRANT_ACCESS: 'success',
  ACTIVATE_USER: 'success',
  REVOKE_ACCESS: 'danger',
  DELETE_DOCUMENT: 'danger',
  DEACTIVATE_USER: 'danger',
  UPLOAD: 'info',
};

/* Poll guard: commit a fetched payload only when it actually differs from the last
   one. Idle polls become zero-render, and the memoized charts below skip their
   repaint unless their data truly changed. */
function useStableState<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const lastJson = useRef<string>(JSON.stringify(initial));
  const setStable = useCallback((next: T) => {
    const json = JSON.stringify(next);
    if (json !== lastJson.current) {
      lastJson.current = json;
      setState(next);
    }
  }, []);
  return [state, setStable] as const;
}

/* Memoized chart islands: the Recharts repaint is the heaviest paint on the page,
   so each chart re-renders only when its data reference changes — not on every
   unrelated poll update elsewhere in the tree (critique 2026-10-08 P1, the lag).
   Series colors ride currentColor from token-driven CSS classes (.series-*):
   SVG presentation attributes cannot resolve var(), and hardcoded hexes would
   drift out of the dark theme. The HTML legend doubles as the accessible series
   key the hover-only tooltips never provided. */
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
  fontSize: '0.8rem',
};

const TrendChart = memo(function TrendChart({ data }: { data: MetricPointData[] }) {
  const { formatTime, formatDateTime } = useDateFormatters();
  if (data.length === 0) {
    return <div className="empty-state"><BarChart2 size={24} aria-hidden="true" /><span>Belum ada data metrik.</span></div>;
  }
  return (
    <>
      <div className="chart-legend">
        <span className="chart-legend-item"><span className="chart-swatch series-cpu" aria-hidden="true" />CPU (%)</span>
        <span className="chart-legend-item"><span className="chart-swatch series-ram" aria-hidden="true" />RAM (%)</span>
      </div>
      <div className="chart-body" role="img" aria-label="Grafik garis tren penggunaan CPU dan RAM dari waktu ke waktu">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid className="chart-grid" strokeDasharray="3 3" />
            <XAxis className="chart-axis" dataKey="timestamp" tickFormatter={(v) => formatTime(String(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis className="chart-axis" domain={[0, 100]} width={38} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <RechartsTooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(v) => formatDateTime(String(v))}
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            />
            <Line className="series-cpu" type="monotone" dataKey="cpu" name="CPU (%)" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line className="series-ram" type="monotone" dataKey="ram" name="RAM (%)" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
});

const DbChart = memo(function DbChart({ data }: { data: MetricPointData[] }) {
  const { formatTime, formatDateTime } = useDateFormatters();
  if (data.length === 0) {
    return <div className="empty-state"><Database size={24} aria-hidden="true" /><span>Belum ada data metrik.</span></div>;
  }
  return (
    <>
      <div className="chart-legend">
        <span className="chart-legend-item"><span className="chart-swatch series-db" aria-hidden="true" />Metadata Graf (MB)</span>
      </div>
      <div className="chart-body" role="img" aria-label="Grafik area pertumbuhan ukuran basis data metadata dari waktu ke waktu">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid className="chart-grid" strokeDasharray="3 3" />
            <XAxis className="chart-axis" dataKey="timestamp" tickFormatter={(v) => formatTime(String(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis className="chart-axis" width={44} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <RechartsTooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(v) => formatDateTime(String(v))}
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            />
            <Area className="series-db" type="monotone" dataKey="metadata_db_mb" name="Metadata Graf (MB)" stroke="currentColor" fill="currentColor" fillOpacity={0.14} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
});

export default function SystemMonitoring() {
  const { token } = useAuth();
  const { formatDateTime, formatTime } = useDateFormatters();

  /* Polled state — every slice sits behind the JSON-diff guard (useStableState)
     so an unchanged poll commits nothing and re-renders nothing. */
  const [health, setHealth] = useStableState<HealthData | null>(null);
  const [tasks, setTasks] = useStableState<TaskData[]>([]);
  const [activeTasks, setActiveTasks] = useStableState<ActiveTaskData[]>([]);
  const [sessions, setSessions] = useStableState<SessionData[]>([]);
  const [apiStats, setApiStats] = useStableState<ApiStatData[]>([]);
  const [errorRates, setErrorRates] = useStableState<ErrorRateData[]>([]);
  const [backups, setBackups] = useStableState<BackupData[]>([]);
  const [backupConfig, setBackupConfig] = useStableState<BackupConfigData>({ frequency: 'daily', time: '02:00', retention_count: 5 });
  const [metricsHistory, setMetricsHistory] = useStableState<MetricPointData[]>([]);
  const [userStats, setUserStats] = useStableState<UserStatData[]>([]);
  const [llmMetrics, setLlmMetrics] = useStableState<LlmMetricsData>({ aggregate: {}, recent: [] });
  const [kgHistory, setKgHistory] = useStableState<KgRebuildData[]>([]);

  /* Load & visibility state */
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* Live controls: pause clears every interval (WCAG 2.2.1/2.2.4 — auto-updating
     content the user can stop) and the stamp names the last successful update. */
  const [paused, setPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  /* Backup controls — Jadwal edits live in a draft committed on save, so a poll
     can never clobber an in-progress edit (critique P1); the manual backup runs
     a two-step confirm because retention may rotate away the oldest restore
     point (critique P1, Error Prevention). */
  const [showBackupConfig, setShowBackupConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState<{ frequency: string; time: string; retentionInput: string } | null>(null);
  const [savingBackupConfig, setSavingBackupConfig] = useState(false);
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [loadingBackup, setLoadingBackup] = useState(false);

  /* Analitik section: collapsed by default; its three endpoints fetch only
     while it is open (distill + optimize). */
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  /* Audit viewer — user-driven fetches, never polled; the search input debounces
     into auditQuery, the value that actually drives requests. */
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActionTypes, setAuditActionTypes] = useState<string[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditQuery, setAuditQuery] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditError, setAuditError] = useState(false);
  const AUDIT_PAGE_SIZE = 20;

  /* Local toast strip (the house pattern from KnowledgeGraph — there is no
     app-wide toast context to join). Replaces native alert(): feedback now
     wears product vocabulary instead of leaking raw exceptions (critique P1). */
  const toastIdRef = useRef(0);
  const [toasts, setToasts] = useState<{ id: number; kind: 'success' | 'error' | 'info'; message: string }[]>([]);
  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);
  const pushToast = useCallback((kind: 'success' | 'error' | 'info', message: string, ttl = 8000) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), ttl);
  }, [dismissToast]);

  /* Render-pure clock for timeAgo (react-hooks/purity forbids Date.now() during
     render). Lazy-initialized, then refreshed by every successful poll — the
     stamp and the session ages freeze together while paused, matching the data. */
  const [now, setNow] = useState(Date.now);

  const fetchFast = useCallback(async () => {
    if (!token) return;
    try {
      const [healthRes, queueRes, sessionRes] = await Promise.all([
        getOrSkipHttpError('/api/engineer/health'),
        getOrSkipHttpError('/api/engineer/queue'),
        getOrSkipHttpError('/api/engineer/active-sessions'),
      ]);
      if (healthRes) setHealth(healthRes.data);
      if (queueRes) { const d = queueRes.data; setTasks(d.recent_history); setActiveTasks(d.active_tasks || []); }
      if (sessionRes) setSessions(sessionRes.data.active_sessions);
      setFeedError(false);
      const t = Date.now();
      setLastUpdate(t);
      setNow(t);
    } catch {
      setFeedError(true);
    } finally {
      setLoading(false);
    }
  }, [token, setHealth, setTasks, setActiveTasks, setSessions]);

  const fetchSlow = useCallback(async () => {
    if (!token) return;
    try {
      const [backupRes, statsRes, metricsRes, backupConfigRes, errorsRes] = await Promise.all([
        getOrSkipHttpError('/api/engineer/backups'),
        getOrSkipHttpError('/api/engineer/api-stats'),
        getOrSkipHttpError('/api/engineer/metrics-history'),
        getOrSkipHttpError('/api/engineer/backup-config'),
        getOrSkipHttpError('/api/engineer/error-rates'),
      ]);
      if (backupRes) setBackups(backupRes.data.backups);
      if (statsRes) setApiStats(statsRes.data.stats);
      if (metricsRes) setMetricsHistory(metricsRes.data.metrics);
      if (backupConfigRes) setBackupConfig(backupConfigRes.data);
      if (errorsRes) setErrorRates(errorsRes.data.errors);
      setFeedError(false);
      const t = Date.now();
      setLastUpdate(t);
      setNow(t);
    } catch {
      setFeedError(true);
    }
  }, [token, setBackups, setApiStats, setMetricsHistory, setBackupConfig, setErrorRates]);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    try {
      const [userStatsRes, llmRes, kgRes] = await Promise.all([
        getOrSkipHttpError('/api/engineer/user-stats'),
        getOrSkipHttpError('/api/engineer/llm-metrics'),
        getOrSkipHttpError('/api/engineer/kg-history'),
      ]);
      if (userStatsRes) setUserStats(userStatsRes.data.stats);
      if (llmRes) setLlmMetrics(llmRes.data);
      if (kgRes) setKgHistory(kgRes.data.history);
    } catch { /* auxiliary section — its empty states carry the failure signal */ }
  }, [token, setUserStats, setLlmMetrics, setKgHistory]);

  const fetchAuditLogs = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({
      limit: String(AUDIT_PAGE_SIZE),
      offset: String(auditPage * AUDIT_PAGE_SIZE),
    });
    if (auditQuery) params.set('search', auditQuery);
    if (auditAction) params.set('action', auditAction);
    try {
      const res = await api.get(`/api/engineer/audit-logs?${params}`);
      const d = res.data;
      setAuditLogs(d.logs);
      setAuditTotal(d.total);
      setAuditActionTypes(d.action_types);
      setAuditError(false);
    } catch {
      // A silent failure would present stale rows as truth (critique P1).
      setAuditError(true);
    }
  }, [token, auditQuery, auditAction, auditPage]);

  /* Poll loops. Pausing tears the intervals down; unpausing refetches at once
     and resumes the cadence. Awaited-IIFE form keeps the effect body free of
     direct setState calls (react-hooks/set-state-in-effect). */
  useEffect(() => {
    if (!token || paused) return;
    (async () => { await fetchFast(); })();
    const interval = window.setInterval(fetchFast, FAST_POLL_MS);
    return () => window.clearInterval(interval);
  }, [token, paused, fetchFast]);

  useEffect(() => {
    if (!token || paused) return;
    (async () => { await fetchSlow(); })();
    const interval = window.setInterval(fetchSlow, SLOW_POLL_MS);
    return () => window.clearInterval(interval);
  }, [token, paused, fetchSlow]);

  useEffect(() => {
    if (!token || paused || !analyticsOpen) return;
    (async () => { await fetchAnalytics(); })();
    const interval = window.setInterval(fetchAnalytics, SLOW_POLL_MS);
    return () => window.clearInterval(interval);
  }, [token, paused, analyticsOpen, fetchAnalytics]);

  /* Debounced audit search: the query commits 350 ms after typing settles
     instead of one request per keystroke (critique P1). */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAuditQuery(auditSearch);
      setAuditPage(0);
    }, AUDIT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [auditSearch]);

  useEffect(() => {
    (async () => { await fetchAuditLogs(); })();
  }, [fetchAuditLogs]);

  /* Manual controls — plain handlers (never effect deps), so a paused page can
     still be refreshed on demand. */
  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await fetchFast();
      await fetchSlow();
      if (analyticsOpen) await fetchAnalytics();
    } finally {
      setRefreshing(false);
    }
  };

  const retryLoad = async () => {
    setLoading(true);
    await fetchFast();
    await fetchSlow();
  };

  const openBackupConfig = () => {
    setConfigDraft({
      frequency: backupConfig.frequency,
      time: backupConfig.time,
      retentionInput: String(backupConfig.retention_count ?? 5),
    });
    setShowBackupConfig(true);
  };

  const saveBackupConfig = async () => {
    if (!configDraft) return;
    /* Validate before posting: a cleared retention field used to send NaN to the
       backend (critique P1). The panel now closes only on success. */
    const retention = parseInt(configDraft.retentionInput, 10);
    if (!Number.isFinite(retention) || retention < 1 || retention > 30) {
      pushToast('error', 'Retensi harus berupa angka antara 1 dan 30.');
      return;
    }
    setSavingBackupConfig(true);
    try {
      const payload = { frequency: configDraft.frequency, time: configDraft.time, retention_count: retention };
      const res = await api.post('/api/engineer/backup-config', payload).catch(err => {
        if (!err.response) throw err;
        return null;
      });
      if (res) {
        setBackupConfig(payload);
        pushToast('success', 'Konfigurasi jadwal backup disimpan.');
        setShowBackupConfig(false);
        setConfigDraft(null);
      } else {
        pushToast('error', 'Gagal menyimpan konfigurasi jadwal.');
      }
    } catch {
      pushToast('error', 'Gagal menyimpan konfigurasi jadwal.');
    }
    setSavingBackupConfig(false);
  };

  const triggerBackup = async () => {
    setLoadingBackup(true);
    try {
      const res = await api.post('/api/engineer/backup').catch(err => {
        if (!err.response) throw err;
        return null;
      });
      if (res) {
        pushToast('success', 'Backup berhasil dibuat.');
        await fetchSlow(); // show the new file at once instead of a row appearing 60 s later
      } else {
        pushToast('error', 'Gagal membuat backup. Pastikan backend aktif.');
      }
    } catch {
      pushToast('error', 'Gagal membuat backup. Pastikan backend aktif.');
    }
    setLoadingBackup(false);
    setConfirmBackup(false);
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
  };
  const formatUptime = (sec: number) => {
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor(sec % (3600 * 24) / 3600);
    const m = Math.floor(sec % 3600 / 60);
    if (d > 0) return `${d} hari ${h} jam`;
    if (h > 0) return `${h} jam ${m} menit`;
    return `${m} menit`;
  };
  const timeAgo = (ts: string) => {
    const diff = Math.floor((now - new Date(ts).getTime()) / 1000);
    if (!Number.isFinite(diff)) return '—';
    if (diff < 60) return `${diff} dtk lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
  };

  /* ── Load gate ── the old early-return rendered a permanent English
     "Loading…" dead end when the backend was down; the page now shows the orb
     only while the first fetch is in flight, then an Indonesian danger state
     with a working retry (critique P1, harden). */
  if (!health) {
    if (loading) {
      return (
        <div className="monitoring-container">
          <LoadingOrb label="Memuat metrik sistem…" className="loading-orb--padded" />
        </div>
      );
    }
    return (
      <div className="monitoring-container">
        <div className="monitoring-deadend" role="alert">
          <ShieldAlert size={36} aria-hidden="true" />
          <h2>Metrik tidak terjangkau</h2>
          <p>Data kesehatan sistem tidak dapat dimuat. Pastikan backend aktif, lalu muat ulang.</p>
          <button type="button" className="btn btn-primary" onClick={retryLoad}>
            <RefreshCw size={15} aria-hidden="true" /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  const cpuLevel = getAlertLevel(health.cpu, ALERT_THRESHOLDS.cpu);
  const memLevel = getAlertLevel(health.memory.percent, ALERT_THRESHOLDS.memory);
  const diskLevel = getAlertLevel(health.disk.percent, ALERT_THRESHOLDS.disk);

  /* The one authored verdict for the page (critique: "eleven modules, one
     question"): threshold breaches and failed queue tasks fold into a single
     headline that the modules below then explain. The graded, actionable copy
     from the old alert banners is preserved verbatim inside the detail rows. */
  const issues: { level: 'warn' | 'critical'; text: string }[] = [];
  if (cpuLevel === 'critical') issues.push({ level: 'critical', text: `Beban CPU melebihi 90% (${health.cpu}%). Segera periksa proses yang berjalan.` });
  else if (cpuLevel === 'warn') issues.push({ level: 'warn', text: `Beban CPU melebihi 70% (${health.cpu}%).` });
  if (memLevel === 'critical') issues.push({ level: 'critical', text: `Penggunaan RAM melebihi 90% (${health.memory.percent}%).` });
  else if (memLevel === 'warn') issues.push({ level: 'warn', text: `Penggunaan RAM melebihi 75% (${health.memory.percent}%).` });
  if (diskLevel === 'critical') issues.push({ level: 'critical', text: `Penyimpanan disk hampir penuh (${health.disk.percent}%). Docker dan aplikasi bisa crash.` });
  else if (diskLevel === 'warn') issues.push({ level: 'warn', text: `Penggunaan disk melebihi 80% (${health.disk.percent}%).` });
  const failedTasks = tasks.filter(t => t.status?.toUpperCase() === 'FAILED').length;
  if (failedTasks > 0) issues.push({ level: 'warn', text: `${failedTasks} tugas pemrosesan terakhir gagal — periksa antrean di bawah.` });

  const verdictLevel: 'ok' | 'warn' | 'critical' =
    issues.some(i => i.level === 'critical') ? 'critical' : issues.length > 0 ? 'warn' : 'ok';
  const verdictTitle =
    verdictLevel === 'ok' ? 'Semua sistem normal'
      : verdictLevel === 'critical' ? `Kritis — ${issues.length} masalah terdeteksi`
        : `${issues.length} peringatan terdeteksi`;

  /* Error-rate merge: the standalone "Error Rate Dashboard" duplicated the API
     stats table (critique, distill); its one unique column — the last error
     timestamp — joins the merged endpoint table. */
  const lastErrorByRoute = new Map(errorRates.map(e => [e.route, e.last_error_time]));

  return (
    <div className="monitoring-container">
      <div className="monitoring-header">
        <div>
          <h1>Kesehatan Sistem</h1>
          <p>Pemantauan infrastruktur, antrean pemrosesan, dan audit platform.</p>
        </div>
        <div className="live-controls">
          <span className="live-stamp" title="Metrik utama diperbarui otomatis setiap 10 detik; data historis setiap 60 detik.">
            <span className={`live-dot${paused ? ' is-paused' : ''}`} aria-hidden="true" />
            {paused
              ? `Dijeda${lastUpdate ? ` • data per ${formatTime(new Date(lastUpdate))}` : ''}`
              : lastUpdate ? `Diperbarui ${formatTime(new Date(lastUpdate))}` : 'Menghubungkan…'}
          </span>
          <button type="button" className="module-btn quiet" onClick={() => setPaused(p => !p)} aria-pressed={paused}>
            {paused ? <><Play size={13} aria-hidden="true" /> Lanjutkan</> : <><Pause size={13} aria-hidden="true" /> Jeda</>}
          </button>
          <button type="button" className="module-btn quiet" onClick={refreshNow} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'admin-spin' : undefined} aria-hidden="true" /> Muat ulang
          </button>
        </div>
      </div>

      {feedError && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>Gagal mengambil data terbaru{lastUpdate ? ` — menampilkan data per ${formatTime(new Date(lastUpdate))}` : ''}. Pastikan backend aktif.</span>
        </div>
      )}

      {/* ── HEALTH VERDICT — the authored answer, modules explain it below ── */}
      <section className={`health-verdict level-${verdictLevel}`} aria-labelledby="verdict-title">
        <span className="verdict-icon" aria-hidden="true">
          {verdictLevel === 'ok' ? <CheckCircle size={28} /> : verdictLevel === 'warn' ? <AlertTriangle size={28} /> : <ShieldAlert size={28} />}
        </span>
        <div className="verdict-body">
          <h2 id="verdict-title" className="verdict-title" aria-live="polite">{verdictTitle}</h2>
          {verdictLevel === 'ok' ? (
            <p className="verdict-sub">CPU, memori, dan disk dalam batas aman — tidak ada tugas pemrosesan yang gagal.</p>
          ) : (
            <ul className="verdict-issues">
              {issues.map(i => <li key={i.text} className={`level-${i.level}`}>{i.text}</li>)}
            </ul>
          )}
        </div>
        <span className="verdict-meta">Waktu aktif sistem: {formatUptime(health.uptime_seconds)}</span>
      </section>

      {/* ── KESEHATAN ─────────────────────────────────────────────── */}
      <section className="monitoring-section" aria-label="Kesehatan">
        <h2 className="section-title">Kesehatan</h2>

        <div className="kpi-grid">
          <div className={`kpi-card level-${cpuLevel}`}>
            <div className="kpi-header">
              <div>
                <p className="kpi-title">Beban CPU</p>
                <h3 className="kpi-value">{health.cpu}%</h3>
              </div>
              <span className={`kpi-icon tone-${cpuLevel === 'ok' ? 'info' : cpuLevel === 'warn' ? 'warn' : 'danger'}`} aria-hidden="true"><Cpu size={22} /></span>
            </div>
            <div className="progress-track" role="progressbar" aria-label="Beban CPU" aria-valuenow={health.cpu} aria-valuemin={0} aria-valuemax={100}>
              <div className={`progress-fill level-${cpuLevel}`} style={{ transform: `scaleX(${health.cpu / 100})` }} />
            </div>
            <p className="kpi-threshold">Batas: peringatan &gt;70%, kritis &gt;90%</p>
          </div>

          <div className={`kpi-card level-${memLevel}`}>
            <div className="kpi-header">
              <div>
                <p className="kpi-title">Penggunaan RAM</p>
                <h3 className="kpi-value">{health.memory.percent}%</h3>
                <p className="kpi-subtext">{formatBytes(health.memory.used)} dari {formatBytes(health.memory.total)}</p>
              </div>
              <span className={`kpi-icon tone-${memLevel === 'ok' ? 'info' : memLevel === 'warn' ? 'warn' : 'danger'}`} aria-hidden="true"><Server size={22} /></span>
            </div>
            <div className="progress-track" role="progressbar" aria-label="Penggunaan RAM" aria-valuenow={health.memory.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className={`progress-fill level-${memLevel}`} style={{ transform: `scaleX(${health.memory.percent / 100})` }} />
            </div>
            <p className="kpi-threshold">Batas: peringatan &gt;75%, kritis &gt;90%</p>
          </div>

          <div className={`kpi-card level-${diskLevel}`}>
            <div className="kpi-header">
              <div>
                <p className="kpi-title">Penyimpanan Disk</p>
                <h3 className="kpi-value">{health.disk.percent}%</h3>
                <p className="kpi-subtext">{formatBytes(health.disk.used)} dari {formatBytes(health.disk.total)}</p>
              </div>
              <span className={`kpi-icon tone-${diskLevel === 'ok' ? 'info' : diskLevel === 'warn' ? 'warn' : 'danger'}`} aria-hidden="true"><HardDrive size={22} /></span>
            </div>
            <div className="progress-track" role="progressbar" aria-label="Penggunaan disk" aria-valuenow={health.disk.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className={`progress-fill level-${diskLevel}`} style={{ transform: `scaleX(${health.disk.percent / 100})` }} />
            </div>
            <p className="kpi-threshold">Batas: peringatan &gt;80%, kritis &gt;95%</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <div>
                <p className="kpi-title">Ukuran Basis Data</p>
              </div>
              <span className="kpi-icon tone-info" aria-hidden="true"><Database size={22} /></span>
            </div>
            <div className="db-rows">
              <div className="db-row"><span>Metadata Graf</span><span>{health.database.metadata_db_mb} MB</span></div>
              <div className="db-row"><span>Basis Data Pengguna</span><span>{health.database.users_db_mb} MB</span></div>
            </div>
          </div>
        </div>

        <div className="modules-grid">
          <div className="module-card">
            <div className="module-header">
              <h3 className="module-title"><BarChart2 size={18} aria-hidden="true" /> Tren CPU &amp; RAM</h3>
            </div>
            <div className="module-content chart-content">
              <TrendChart data={metricsHistory} />
            </div>
          </div>

          <div className="module-card">
            <div className="module-header">
              <h3 className="module-title"><Database size={18} aria-hidden="true" /> Pertumbuhan Basis Data</h3>
            </div>
            <div className="module-content chart-content">
              <DbChart data={metricsHistory} />
            </div>
          </div>
        </div>
      </section>

      {/* ── AKTIVITAS ─────────────────────────────────────────────── */}
      <section className="monitoring-section" aria-label="Aktivitas">
        <h2 className="section-title">Aktivitas</h2>

        <div className="modules-grid">
          <div className="module-card">
            <div className="module-header">
              <h3 className="module-title"><Play size={18} aria-hidden="true" /> Antrean Pemrosesan</h3>
              {activeTasks.length > 0 && <span className="module-badge">{activeTasks.length} berjalan</span>}
            </div>
            <div className="module-content" tabIndex={0}>
              {activeTasks.length === 0 && tasks.length === 0 ? (
                <div className="empty-state"><Play size={24} aria-hidden="true" /><span>Tidak ada tugas dalam antrean.</span></div>
              ) : (
                <table className="monitoring-table">
                  <thead><tr><th scope="col">Status</th><th scope="col">Tugas</th><th scope="col">Waktu</th></tr></thead>
                  <tbody>
                    {activeTasks.map((t, idx) => {
                      const vocab = statusVocab(t.status || 'RUNNING');
                      return (
                        <tr key={`aktif-${idx}-${t.name || t.action}-${t.start_time}`}>
                          <td><span className={`status-pill ${vocab.tone}`}><Clock size={12} aria-hidden="true" /> {vocab.label}</span></td>
                          <td className="cell-task">{t.name || t.action || '—'}</td>
                          <td><span className="time-cell"><Clock size={12} aria-hidden="true" /> {formatTime(t.start_time)}</span></td>
                        </tr>
                      );
                    })}
                    {tasks.map((t, idx) => {
                      const vocab = statusVocab(t.status);
                      return (
                        <tr key={`riwayat-${idx}-${t.name || t.action}-${t.timestamp}`}>
                          <td>
                            <span className={`status-pill ${vocab.tone}`}>
                              {vocab.tone === 'danger' ? <AlertTriangle size={12} aria-hidden="true" /> : vocab.tone === 'success' ? <CheckCircle size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />} {vocab.label}
                            </span>
                          </td>
                          <td className="cell-task">{t.name || t.action || '—'}</td>
                          <td><span className="time-cell"><Clock size={12} aria-hidden="true" /> {formatTime(t.end_time || t.start_time || t.timestamp)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="module-card">
            <div className="module-header">
              <h3 className="module-title"><UserCheck size={18} aria-hidden="true" /> Sesi Aktif</h3>
              <span className="module-badge">{sessions.length} pengguna</span>
            </div>
            <div className="module-content" tabIndex={0}>
              {sessions.length === 0 ? (
                <div className="empty-state"><Users size={24} aria-hidden="true" /><span>Tidak ada pengguna aktif saat ini.</span></div>
              ) : (
                <ul className="session-list">
                  {sessions.map(s => (
                    <li key={s.username} className="session-row">
                      <span className="session-avatar" aria-hidden="true">{s.username?.[0]?.toUpperCase() || '?'}</span>
                      <span className="session-id">
                        <span className="session-name">{s.username}</span>
                        <span className="session-ip">{s.ip_address && s.ip_address !== 'N/A' ? s.ip_address : 'IP tidak tersedia'}</span>
                      </span>
                      <span className="session-meta">
                        <span className="role-chip">{s.role}</span>
                        <span className="session-seen">{timeAgo(s.last_seen)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="modules-grid">
          <div className="module-card">
            <div className="module-header">
              <h3 className="module-title"><Save size={18} aria-hidden="true" /> Manajemen Backup</h3>
              <div className="module-actions">
                {!confirmBackup ? (
                  <>
                    <button type="button" className="module-btn quiet" onClick={openBackupConfig}>
                      <Settings size={13} aria-hidden="true" /> Jadwal
                    </button>
                    <button type="button" className="module-btn primary" onClick={() => setConfirmBackup(true)} disabled={loadingBackup}>
                      Backup manual
                    </button>
                  </>
                ) : (
                  <div className="backup-confirm" role="group" aria-label="Konfirmasi backup manual">
                    <span className="backup-confirm-note">Backup terlama dapat terhapus mengikuti retensi.</span>
                    <button type="button" className="module-btn danger" onClick={triggerBackup} disabled={loadingBackup}>
                      {loadingBackup ? 'Memproses…' : 'Ya, jalankan'}
                    </button>
                    <button type="button" className="module-btn quiet" onClick={() => setConfirmBackup(false)} disabled={loadingBackup}>Batal</button>
                  </div>
                )}
              </div>
            </div>
            {showBackupConfig && configDraft && (
              <div className="backup-config">
                <h4>Konfigurasi Jadwal Backup</h4>
                <div className="backup-config-fields">
                  <label className="field">
                    <span className="field-label">Frekuensi</span>
                    <select
                      className="monitoring-select"
                      value={configDraft.frequency}
                      onChange={e => setConfigDraft({ ...configDraft, frequency: e.target.value })}
                    >
                      <option value="daily">Harian</option>
                      <option value="weekly">Mingguan</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Waktu</span>
                    <input
                      type="time"
                      className="monitoring-input"
                      value={configDraft.time}
                      onChange={e => setConfigDraft({ ...configDraft, time: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Retensi (jumlah file)</span>
                    <input
                      type="number"
                      className="monitoring-input monitoring-input-narrow"
                      value={configDraft.retentionInput}
                      min={1}
                      max={30}
                      onChange={e => setConfigDraft({ ...configDraft, retentionInput: e.target.value })}
                    />
                  </label>
                </div>
                <div className="backup-config-actions">
                  <button type="button" className="module-btn primary" onClick={saveBackupConfig} disabled={savingBackupConfig}>
                    {savingBackupConfig ? 'Menyimpan…' : 'Simpan jadwal'}
                  </button>
                  <button type="button" className="module-btn quiet" onClick={() => { setShowBackupConfig(false); setConfigDraft(null); }} disabled={savingBackupConfig}>
                    Batal
                  </button>
                </div>
              </div>
            )}
            <div className="module-content" tabIndex={0}>
              {backups.length === 0 ? (
                <div className="empty-state"><Save size={24} aria-hidden="true" /><span>Belum ada backup yang dibuat.</span></div>
              ) : (
                <table className="monitoring-table">
                  <thead><tr><th scope="col">Nama File</th><th scope="col">Ukuran</th><th scope="col">Dibuat Pada</th></tr></thead>
                  <tbody>
                    {backups.map(b => (
                      <tr key={b.filename}>
                        <td className="cell-file" title={b.filename}>{b.filename}</td>
                        <td className="cell-num">{b.size_mb} MB</td>
                        <td className="cell-time">{formatDateTime(b.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="module-card">
            <div className="module-header">
              <h3 className="module-title"><Wifi size={18} aria-hidden="true" /> Kesehatan Endpoint API</h3>
              <span className="module-badge" title="Dihitung sejak backend terakhir dimulai">Sejak restart terakhir</span>
            </div>
            <div className="module-content" tabIndex={0}>
              {apiStats.length === 0 ? (
                <div className="empty-state"><Wifi size={24} aria-hidden="true" /><span>Belum ada permintaan tercatat.</span></div>
              ) : (
                <>
                  <table className="monitoring-table">
                    <thead><tr><th scope="col">Endpoint</th><th scope="col">Total</th><th scope="col">Error</th><th scope="col">Laju Error</th><th scope="col">Error Terakhir</th></tr></thead>
                    <tbody>
                      {apiStats.map(s => {
                        const rateLevel = s.error_rate_pct >= 5 ? 'danger' : s.error_rate_pct >= 1 ? 'warn' : 'ok';
                        const lastErr = lastErrorByRoute.get(s.route);
                        return (
                          <tr key={s.route}>
                            <td className="cell-route" title={s.route}>{s.route}</td>
                            <td className="cell-num">{s.total_requests}</td>
                            <td className={`cell-num${s.error_count > 0 ? ' has-errors' : ''}`}>{s.error_count}</td>
                            <td><span className={`rate-pill ${rateLevel}`} title="Ambang: ≥1% perlu perhatian, ≥5% kritis">{s.error_rate_pct}%</span></td>
                            <td className="cell-time">{lastErr ? formatTime(lastErr) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="table-footnote">Laju error ≥1% ditandai, ≥5% kritis — gabungan statistik endpoint dan pantauan error.</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title"><FileText size={18} aria-hidden="true" /> Log Audit</h3>
            <span className="module-badge">{auditTotal.toLocaleString('id-ID')} entri</span>
          </div>
          <div className="audit-toolbar">
            <div className="audit-search">
              <Search size={14} aria-hidden="true" />
              <input
                className="monitoring-input"
                type="search"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                placeholder="Cari pengguna, resource, atau detail…"
                aria-label="Cari log audit"
              />
            </div>
            <select
              className="monitoring-select"
              value={auditAction}
              onChange={e => { setAuditAction(e.target.value); setAuditPage(0); }}
              aria-label="Saring berdasarkan jenis aksi"
            >
              <option value="">Semua Aksi</option>
              {auditActionTypes.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {auditError && (
            <div className="audit-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>Gagal memuat log audit.</span>
              <button type="button" className="link-btn" onClick={fetchAuditLogs}>Coba lagi</button>
            </div>
          )}
          <div className="module-content" tabIndex={0}>
            {auditLogs.length === 0 ? (
              <div className="empty-state"><Search size={24} aria-hidden="true" /><span>Tidak ada log yang ditemukan.</span></div>
            ) : (
              <table className="monitoring-table">
                <thead><tr><th scope="col">Waktu</th><th scope="col">Pengguna</th><th scope="col">Aksi</th><th scope="col">Resource</th><th scope="col">Detail</th></tr></thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td className="cell-time cell-nowrap">{formatDateTime(log.timestamp)}</td>
                      <td className="cell-user">{log.user_id || '—'}</td>
                      <td><span className={`action-badge ${ACTION_TONES[log.action_type?.toUpperCase()] || 'neutral'}`}>{log.action_type}</span></td>
                      <td className="cell-trunc" title={log.resource_id}>{log.resource_id || '—'}</td>
                      <td className="cell-trunc" title={log.details}>{log.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="audit-pager">
            {auditTotal > 0 && (
              <span className="pager-range">
                {auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditTotal)} dari {auditTotal.toLocaleString('id-ID')}
              </span>
            )}
            <button type="button" className="pager-btn" onClick={() => setAuditPage(p => Math.max(0, p - 1))} disabled={auditPage === 0} aria-label="Halaman sebelumnya">
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button type="button" className="pager-btn" onClick={() => setAuditPage(p => p + 1)} disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= auditTotal} aria-label="Halaman berikutnya">
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* ── ANALITIK — collapsed by default; its endpoints fetch only while
          open, so the default page never pays for them (distill + optimize) ── */}
      <section className="monitoring-section" aria-label="Analitik">
        <h2 className="section-title">
          <button
            type="button"
            className="section-toggle"
            aria-expanded={analyticsOpen}
            onClick={() => setAnalyticsOpen(o => !o)}
            title="Statistik aktivitas pengguna, metrik panggilan AI, dan riwayat rekonstruksi graf pengetahuan"
          >
            Analitik
            <ChevronDown size={18} className={analyticsOpen ? 'chevron-open' : undefined} aria-hidden="true" />
          </button>
        </h2>
        {analyticsOpen && (
          <div className="modules-grid">
            <div className="module-card">
              <div className="module-header">
                <h3 className="module-title"><Users size={18} aria-hidden="true" /> Statistik Aktivitas Pengguna</h3>
              </div>
              <div className="module-content" tabIndex={0}>
                {userStats.length === 0 ? (
                  <div className="empty-state"><Users size={24} aria-hidden="true" /><span>Belum ada data aktivitas.</span></div>
                ) : (
                  <table className="monitoring-table">
                    <thead><tr><th scope="col">ID Pengguna</th><th scope="col">Total Aksi</th><th scope="col">Rincian</th></tr></thead>
                    <tbody>
                      {userStats.map(stat => (
                        <tr key={stat.user_id}>
                          <td className="cell-user">{stat.user_id}</td>
                          <td className="cell-num">{stat.total_actions}</td>
                          <td className="cell-breakdown">{Object.entries(stat.breakdown || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="module-card">
              <div className="module-header">
                <h3 className="module-title"><Cpu size={18} aria-hidden="true" /> Metrik Panggilan AI</h3>
              </div>
              <div className="module-content" tabIndex={0}>
                <div className="stat-tiles">
                  <div className="stat-tile" title="Jumlah total panggilan model AI sejak pencatatan dimulai">
                    <span className="stat-tile-label">Total Panggilan</span>
                    <span className="stat-tile-value">{llmMetrics.aggregate?.total_calls ?? 0}</span>
                  </div>
                  <div className="stat-tile" title="Rata-rata waktu respons panggilan AI">
                    <span className="stat-tile-label">Rata-rata Latensi</span>
                    <span className="stat-tile-value">{Math.round(llmMetrics.aggregate?.avg_latency_ms ?? 0)} ms</span>
                  </div>
                  <div className="stat-tile" title="Estimasi biaya kumulatif pemakaian model AI">
                    <span className="stat-tile-label">Estimasi Biaya</span>
                    <span className="stat-tile-value">${(llmMetrics.aggregate?.total_cost ?? 0).toFixed(4)}</span>
                  </div>
                </div>
                {(llmMetrics.recent || []).length === 0 ? (
                  <div className="empty-state"><Cpu size={24} aria-hidden="true" /><span>Belum ada panggilan AI tercatat.</span></div>
                ) : (
                  <table className="monitoring-table">
                    <thead><tr><th scope="col">Waktu</th><th scope="col">Endpoint</th><th scope="col">Latensi</th><th scope="col">Token</th></tr></thead>
                    <tbody>
                      {(llmMetrics.recent || []).slice(0, 5).map((m, idx) => (
                        <tr key={`${m.timestamp}-${m.endpoint}-${idx}`}>
                          <td><span className="time-cell"><Clock size={12} aria-hidden="true" /> {formatTime(m.timestamp)}</span></td>
                          <td><span className="action-badge neutral">{m.endpoint}</span></td>
                          <td className="cell-num">{m.latency_ms} ms</td>
                          <td className="cell-num">{m.tokens_used}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="module-card">
              <div className="module-header">
                <h3 className="module-title"><Database size={18} aria-hidden="true" /> Riwayat Rekonstruksi Graf Pengetahuan</h3>
              </div>
              <div className="module-content" tabIndex={0}>
                {kgHistory.length === 0 ? (
                  <div className="empty-state"><Database size={24} aria-hidden="true" /><span>Belum ada riwayat rekonstruksi graf.</span></div>
                ) : (
                  <table className="monitoring-table">
                    <thead><tr><th scope="col">Waktu Mulai</th><th scope="col">Durasi</th><th scope="col">Status</th><th scope="col">Perubahan</th></tr></thead>
                    <tbody>
                      {kgHistory.map((h, idx) => {
                        const vocab = statusVocab(h.status);
                        return (
                          <tr key={`${h.start_time}-${idx}`}>
                            <td><span className="time-cell"><Clock size={12} aria-hidden="true" /> {formatDateTime(h.start_time)}</span></td>
                            <td className="cell-num">{h.duration_s != null ? `${h.duration_s} dtk` : '—'}</td>
                            <td>
                              <span className={`status-pill ${vocab.tone}`}>
                                {vocab.tone === 'success' ? <CheckCircle size={12} aria-hidden="true" /> : vocab.tone === 'danger' ? <AlertTriangle size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />} {vocab.label}
                              </span>
                            </td>
                            <td className="cell-num">
                              {(h.nodes_changed ?? 0) > 0 ? '+' : ''}{h.nodes_changed ?? 0} node · {(h.edges_changed ?? 0) > 0 ? '+' : ''}{h.edges_changed ?? 0} edge
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Local toast strip — reuses the UploadProvider's .upload-toast grammar
          (components.css); the house pattern for pages without the upload
          context (KnowledgeGraph does the same). */}
      {toasts.length > 0 && (
        <div className="upload-toast-container" aria-live="polite">
          {toasts.map(tt => (
            <div key={tt.id} className={`upload-toast upload-toast--${tt.kind}`} role={tt.kind === 'error' ? 'alert' : 'status'}>
              {tt.kind === 'success' ? <CheckCircle size={16} /> : tt.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
              <span>{tt.message}</span>
              <button type="button" className="upload-toast-close" onClick={() => dismissToast(tt.id)} aria-label="Tutup notifikasi">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
