import { useState, useEffect, useCallback } from 'react';
import {
  Activity, HardDrive, Cpu, Server, Play, Clock, CheckCircle,
  Save, AlertTriangle, Users, Wifi, FileText, Search, ChevronLeft, ChevronRight,
  ShieldAlert, BarChart2, UserCheck, Settings, Database
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useAuth } from '../context/AuthContext';
import './SystemMonitoring.css';

import { API_BASE } from '../config';

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

export default function SystemMonitoring() {
  const { token } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [backups, setBackups] = useState<BackupData[]>([]);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New state
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [apiStats, setApiStats] = useState<ApiStatData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActionTypes, setAuditActionTypes] = useState<string[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_PAGE_SIZE = 20;

  // Medium Priority State
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [backupConfig, setBackupConfig] = useState<any>({ frequency: 'daily', time: '02:00', retention_count: 5 });
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [showBackupConfig, setShowBackupConfig] = useState(false);
  const [savingBackupConfig, setSavingBackupConfig] = useState(false);

  // Nice-To-Have Analytics State
  const [userStats, setUserStats] = useState<any[]>([]);
  const [llmMetrics, setLlmMetrics] = useState<any>({ aggregate: {}, recent: [] });
  const [kgHistory, setKgHistory] = useState<any[]>([]);
  const [errorRates, setErrorRates] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [healthRes, queueRes, backupRes, sessionRes, statsRes, metricsRes, backupConfigRes, userStatsRes, llmRes, kgRes, errorsRes] = await Promise.all([
        fetch(`${API_BASE}/api/engineer/health`, { headers }),
        fetch(`${API_BASE}/api/engineer/queue`, { headers }),
        fetch(`${API_BASE}/api/engineer/backups`, { headers }),
        fetch(`${API_BASE}/api/engineer/active-sessions`, { headers }),
        fetch(`${API_BASE}/api/engineer/api-stats`, { headers }),
        fetch(`${API_BASE}/api/engineer/metrics-history`, { headers }),
        fetch(`${API_BASE}/api/engineer/backup-config`, { headers }),
        fetch(`${API_BASE}/api/engineer/user-stats`, { headers }),
        fetch(`${API_BASE}/api/engineer/llm-metrics`, { headers }),
        fetch(`${API_BASE}/api/engineer/kg-history`, { headers }),
        fetch(`${API_BASE}/api/engineer/error-rates`, { headers })
      ]);

      if (healthRes.ok) setHealth(await healthRes.json());
      if (queueRes.ok) { const d = await queueRes.json(); setTasks(d.recent_history); setActiveTasks(d.active_tasks || []); }
      if (backupRes.ok) { const d = await backupRes.json(); setBackups(d.backups); }
      if (sessionRes.ok) { const d = await sessionRes.json(); setSessions(d.active_sessions); }
      if (statsRes.ok) { const d = await statsRes.json(); setApiStats(d.stats); }
      if (metricsRes.ok) { const d = await metricsRes.json(); setMetricsHistory(d.metrics); }
      if (backupConfigRes.ok) { const d = await backupConfigRes.json(); setBackupConfig(d); }
      if (userStatsRes.ok) { const d = await userStatsRes.json(); setUserStats(d.stats); }
      if (llmRes.ok) { const d = await llmRes.json(); setLlmMetrics(d); }
      if (kgRes.ok) { const d = await kgRes.json(); setKgHistory(d.history); }
      if (errorsRes.ok) { const d = await errorsRes.json(); setErrorRates(d.errors); }
    } catch {
      setError("Gagal mengambil data dari server. Pastikan backend aktif.");
    }
  }, [token]);

  const fetchAuditLogs = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({
      limit: String(AUDIT_PAGE_SIZE),
      offset: String(auditPage * AUDIT_PAGE_SIZE),
    });
    if (auditSearch) params.set('search', auditSearch);
    if (auditAction) params.set('action', auditAction);
    try {
      const res = await fetch(`${API_BASE}/api/engineer/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setAuditLogs(d.logs);
        setAuditTotal(d.total);
        setAuditActionTypes(d.action_types);
      }
    } catch { /* silent */ }
  }, [token, auditSearch, auditAction, auditPage]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const triggerBackup = async () => {
    setLoadingBackup(true);
    try {
      const res = await fetch(`${API_BASE}/api/engineer/backup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) await fetchData();
      else alert("Gagal membuat backup");
    } catch (err) { alert("Error: " + err); }
    setLoadingBackup(false);
  };

  const saveBackupConfig = async () => {
    setSavingBackupConfig(true);
    try {
      const res = await fetch(`${API_BASE}/api/engineer/backup-config`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(backupConfig)
      });
      if (res.ok) alert("Konfigurasi jadwal backup berhasil disimpan.");
      else alert("Gagal menyimpan konfigurasi.");
    } catch (err) { alert("Error: " + err); }
    setSavingBackupConfig(false);
    setShowBackupConfig(false);
  };

  const formatBytes = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  const formatUptime = (sec: number) => {
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor(sec % (3600 * 24) / 3600);
    const m = Math.floor(sec % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  };
  const timeAgo = (ts: string) => {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };
  const roleBadgeColor = (role: string) => {
    const map: Record<string, string> = {
      'admin': '#ef4444', 'direktur': '#a855f7', 'manajer': '#3b82f6',
      'insinyur ti': '#f59e0b', 'pengguna': '#10b981', 'sekretaris perusahaan': '#06b6d4'
    };
    return map[role?.toLowerCase()] || 'var(--text-secondary)';
  };

  if (!health) return <div style={{ padding: '32px', color: 'var(--text-secondary)' }}>Loading System Metrics...</div>;

  const cpuLevel = getAlertLevel(health.cpu, ALERT_THRESHOLDS.cpu);
  const memLevel = getAlertLevel(health.memory.percent, ALERT_THRESHOLDS.memory);
  const diskLevel = getAlertLevel(health.disk.percent, ALERT_THRESHOLDS.disk);
  const hasAlerts = cpuLevel !== 'ok' || memLevel !== 'ok' || diskLevel !== 'ok';

  return (
    <div className="monitoring-container">
      <div className="monitoring-header">
        <div>
          <h1>System Health Dashboard</h1>
          <p>Real-time infrastructure monitoring (FR-31)</p>
        </div>
        <div className="status-badge">
          <Activity size={16} />
          <span>System Online • Uptime: {formatUptime(health.uptime_seconds)}</span>
        </div>
      </div>

      {error && <div className="error-banner"><AlertTriangle size={18} /> {error}</div>}

      {/* ── ALERT BANNERS ───────────────────────────────────────── */}
      {hasAlerts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {cpuLevel === 'critical' && (
            <div className="alert-banner critical"><ShieldAlert size={16} /> <strong>KRITIS:</strong> CPU load melebihi 90%! Segera periksa proses yang berjalan.</div>
          )}
          {cpuLevel === 'warn' && (
            <div className="alert-banner warn"><AlertTriangle size={16} /> <strong>Peringatan:</strong> CPU load melebihi 70% ({health.cpu}%).</div>
          )}
          {memLevel === 'critical' && (
            <div className="alert-banner critical"><ShieldAlert size={16} /> <strong>KRITIS:</strong> RAM usage melebihi 90% ({health.memory.percent}%)!</div>
          )}
          {memLevel === 'warn' && (
            <div className="alert-banner warn"><AlertTriangle size={16} /> <strong>Peringatan:</strong> RAM usage melebihi 75% ({health.memory.percent}%).</div>
          )}
          {diskLevel === 'critical' && (
            <div className="alert-banner critical"><ShieldAlert size={16} /> <strong>KRITIS:</strong> Disk storage hampir penuh ({health.disk.percent}%)! Docker dan aplikasi bisa crash.</div>
          )}
          {diskLevel === 'warn' && (
            <div className="alert-banner warn"><AlertTriangle size={16} /> <strong>Peringatan:</strong> Disk usage melebihi 80% ({health.disk.percent}%).</div>
          )}
        </div>
      )}

      {/* ── KPI CARDS ───────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className={`kpi-card ${cpuLevel !== 'ok' ? 'kpi-alert-' + cpuLevel : ''}`}>
          <div className={`kpi-card-indicator ${cpuLevel === 'critical' ? 'danger' : cpuLevel === 'warn' ? 'warning' : 'blue'}`}></div>
          <div className="kpi-header">
            <div>
              <p className="kpi-title">CPU Load</p>
              <h2 className="kpi-value">{health.cpu}%</h2>
            </div>
            <div className={`kpi-icon ${cpuLevel === 'ok' ? 'blue' : 'danger'}`}><Cpu size={24} /></div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${cpuLevel === 'critical' ? 'danger' : cpuLevel === 'warn' ? 'warning' : 'blue'}`} style={{ width: `${health.cpu}%` }}></div>
          </div>
          <p className="kpi-threshold">Warn &gt;70% / Critical &gt;90%</p>
        </div>

        <div className={`kpi-card ${memLevel !== 'ok' ? 'kpi-alert-' + memLevel : ''}`}>
          <div className={`kpi-card-indicator ${memLevel === 'critical' ? 'danger' : memLevel === 'warn' ? 'warning' : 'purple'}`}></div>
          <div className="kpi-header">
            <div>
              <p className="kpi-title">RAM Usage</p>
              <h2 className="kpi-value">{health.memory.percent}%</h2>
              <p className="kpi-subtext">{formatBytes(health.memory.used)} / {formatBytes(health.memory.total)}</p>
            </div>
            <div className={`kpi-icon ${memLevel === 'ok' ? 'purple' : 'danger'}`}><Server size={24} /></div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${memLevel === 'critical' ? 'danger' : memLevel === 'warn' ? 'warning' : 'purple'}`} style={{ width: `${health.memory.percent}%` }}></div>
          </div>
          <p className="kpi-threshold">Warn &gt;75% / Critical &gt;90%</p>
        </div>

        <div className={`kpi-card ${diskLevel !== 'ok' ? 'kpi-alert-' + diskLevel : ''}`}>
          <div className={`kpi-card-indicator ${diskLevel === 'critical' ? 'danger' : diskLevel === 'warn' ? 'warning' : 'green'}`}></div>
          <div className="kpi-header">
            <div>
              <p className="kpi-title">Disk Storage</p>
              <h2 className="kpi-value">{health.disk.percent}%</h2>
              <p className="kpi-subtext">{formatBytes(health.disk.used)} / {formatBytes(health.disk.total)}</p>
            </div>
            <div className={`kpi-icon ${diskLevel === 'ok' ? 'green' : 'danger'}`}><HardDrive size={24} /></div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${diskLevel === 'critical' ? 'danger' : diskLevel === 'warn' ? 'warning' : 'green'}`} style={{ width: `${health.disk.percent}%` }}></div>
          </div>
          <p className="kpi-threshold">Warn &gt;80% / Critical &gt;95%</p>
        </div>

        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="kpi-card-indicator orange"></div>
          <p className="kpi-title" style={{ marginBottom: '12px' }}>Database Sizes</p>
          <div className="db-row"><span>KG Metadata:</span><span>{health.database.metadata_db_mb} MB</span></div>
          <div className="db-row"><span>Users DB:</span><span>{health.database.users_db_mb} MB</span></div>
        </div>
      </div>

      {/* ── HISTORICAL CHARTS ───────────────────────────────────────────────────────────── */}
      <div className="modules-grid" style={{ marginTop: '24px' }}>
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title" style={{ color: '#38bdf8' }}><BarChart2 size={18} /> CPU & RAM Trend (48 Jam)</h3>
          </div>
          <div className="module-content" style={{ height: 250 }}>
            {metricsHistory.length === 0 ? (
              <div className="empty-state">Belum ada data metrik.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metricsHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} domain={[0, 100]} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #334155', borderRadius: '8px', color: 'var(--text-primary)' }}
                    labelFormatter={(v) => new Date(String(v)).toLocaleString()}
                  />
                  <Line type="monotone" dataKey="cpu" name="CPU (%)" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ram" name="RAM (%)" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title emerald"><Database size={18} /> Database Growth Trend</h3>
          </div>
          <div className="module-content" style={{ height: 250 }}>
            {metricsHistory.length === 0 ? (
              <div className="empty-state">Belum ada data metrik.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorDb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid #334155', borderRadius: '8px', color: 'var(--text-primary)' }}
                    labelFormatter={(v) => new Date(String(v)).toLocaleString()}
                  />
                  <Area type="monotone" dataKey="metadata_db_mb" name="Metadata DB (MB)" stroke="#10b981" fillOpacity={1} fill="url(#colorDb)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── ACTIVE SESSIONS + API STATS ROW ─────────────────────── */}
      <div className="modules-grid">
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title indigo"><UserCheck size={18} /> Sesi Aktif ({sessions.length})</h3>
            <span className="module-badge">Live • 5 menit terakhir</span>
          </div>
          <div className="module-content">
            {sessions.length === 0 ? (
              <div className="empty-state">
                <Users size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
                <span>Tidak ada pengguna aktif saat ini.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((s, i) => (
                  <div key={i} className="session-row">
                    <div className="session-avatar" style={{ background: roleBadgeColor(s.role) }}>
                      {s.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{s.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.ip_address}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className="role-badge" style={{ background: roleBadgeColor(s.role) + '22', color: roleBadgeColor(s.role), border: `1px solid ${roleBadgeColor(s.role)}44` }}>
                        {s.role}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{timeAgo(s.last_seen)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title emerald"><BarChart2 size={18} /> API Endpoint Health</h3>
            <span className="module-badge">Since last restart</span>
          </div>
          <div className="module-content">
            {apiStats.length === 0 ? (
              <div className="empty-state"><Wifi size={24} style={{ opacity: 0.4, marginBottom: 8 }} /><span>Belum ada request tercatat.</span></div>
            ) : (
              <table className="monitoring-table">
                <thead>
                  <tr><th>Endpoint</th><th>Total</th><th>Errors</th><th>Error Rate</th></tr>
                </thead>
                <tbody>
                  {apiStats.map((s, i) => {
                    const rateLevel = s.error_rate_pct >= 5 ? 'danger' : s.error_rate_pct >= 1 ? 'warning' : 'ok';
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.route}>{s.route}</td>
                        <td style={{ color: 'var(--text-primary)' }}>{s.total_requests}</td>
                        <td style={{ color: s.error_count > 0 ? '#f87171' : 'var(--text-secondary)' }}>{s.error_count}</td>
                        <td>
                          <span className={`rate-pill ${rateLevel}`}>{s.error_rate_pct}%</span>
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

      {/* ── QUEUE + BACKUP ROW ──────────────────────────────────────────────────────────── */}
      <div className="modules-grid">
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title indigo"><Play size={18} /> Antrean Pemrosesan (Queue)</h3>
            <span className="module-badge">Live Task Tracking</span>
          </div>
          <div className="module-content">
            {activeTasks.length === 0 && tasks.length === 0 ? (
              <div className="empty-state">Tidak ada tugas dalam antrean.</div>
            ) : (
              <table className="monitoring-table">
                <thead><tr><th>Status</th><th>Aksi</th><th>Timestamp</th></tr></thead>
                <tbody>
                  {activeTasks.map((t, idx) => (
                    <tr key={`active-${idx}`}>
                      <td><span className="status-pill warn"><Clock size={12} /> {t.status}</span></td>
                      <td style={{ fontWeight: 500, color: '#f59e0b' }}>{t.name || t.action}</td>
                      <td><div className="time-pill"><Clock size={12} /> {new Date(t.start_time).toLocaleTimeString()}</div></td>
                    </tr>
                  ))}
                  {tasks.map((t, idx) => (
                    <tr key={`recent-${idx}`}>
                      <td>
                        <span className={`status-pill ${t.status === 'FAILED' ? 'danger' : ''}`}>
                          {t.status === 'FAILED' ? <AlertTriangle size={12}/> : <CheckCircle size={12} />} {t.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{t.name || t.action}</td>
                      <td><div className="time-pill"><Clock size={12} /> {new Date(t.end_time || t.start_time || t.timestamp).toLocaleTimeString()}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title emerald"><Save size={18} /> Manajemen Backup Database</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowBackupConfig(true)} className="module-btn" style={{ background: 'rgba(0,0,0,0.1)' }}>
                <Settings size={14} /> Jadwal
              </button>
              <button onClick={triggerBackup} disabled={loadingBackup} className="module-btn">
                {loadingBackup ? 'Membuat Backup...' : '+ Manual'}
              </button>
            </div>
          </div>
          {showBackupConfig && (
            <div style={{ padding: '16px', background: 'var(--bg-element)', borderBottom: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Konfigurasi Jadwal Backup</h4>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Frekuensi</label>
                  <select value={backupConfig?.frequency || 'daily'} onChange={e => setBackupConfig({...backupConfig, frequency: e.target.value})} style={{ padding: '6px', borderRadius: '4px', background: 'rgba(30,41,59,0.8)', color: '#fff', border: '1px solid var(--border-color)' }}>
                    <option value="daily">Harian</option>
                    <option value="weekly">Mingguan</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Waktu</label>
                  <input type="time" value={backupConfig?.time || '02:00'} onChange={e => setBackupConfig({...backupConfig, time: e.target.value})} style={{ padding: '6px', borderRadius: '4px', background: 'rgba(30,41,59,0.8)', color: '#fff', border: '1px solid var(--border-color)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Retensi (Jumlah File)</label>
                  <input type="number" value={backupConfig?.retention_count || 5} min={1} max={30} onChange={e => setBackupConfig({...backupConfig, retention_count: parseInt(e.target.value)})} style={{ padding: '6px', width: '60px', borderRadius: '4px', background: 'rgba(30,41,59,0.8)', color: '#fff', border: '1px solid var(--border-color)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button onClick={saveBackupConfig} disabled={savingBackupConfig} style={{ padding: '6px 12px', borderRadius: '4px', background: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>Simpan Jadwal</button>
                <button onClick={() => setShowBackupConfig(false)} style={{ padding: '6px 12px', borderRadius: '4px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid #475569', cursor: 'pointer', fontSize: '0.75rem' }}>Batal</button>
              </div>
            </div>
          )}
          <div className="module-content">
            {backups.length === 0 ? (
              <div className="empty-state">Belum ada backup yang dibuat.</div>
            ) : (
              <table className="monitoring-table">
                <thead><tr><th>Nama File Backup</th><th>Ukuran</th><th>Dibuat Pada</th></tr></thead>
                <tbody>
                  {backups.map((b, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{b.filename}</td>
                      <td>{b.size_mb} MB</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(b.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── AUDIT LOG VIEWER ─────────────────────────────────────── */}
      <div className="module-card" style={{ marginTop: '0' }}>
        <div className="module-header">
          <h3 className="module-title" style={{ color: '#f59e0b' }}><FileText size={18} /> Audit Log Viewer</h3>
          <span className="module-badge">Total: {auditTotal.toLocaleString()} entri</span>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              value={auditSearch}
              onChange={e => { setAuditSearch(e.target.value); setAuditPage(0); }}
              placeholder="Cari user, resource, detail..."
              style={{
                width: '100%', paddingLeft: '32px', padding: '7px 10px 7px 32px',
                background: 'rgba(30,41,59,0.8)', border: '1px solid var(--border-color)',
                borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem', boxSizing: 'border-box'
              }}
            />
          </div>
          <select
            value={auditAction}
            onChange={e => { setAuditAction(e.target.value); setAuditPage(0); }}
            style={{
              padding: '7px 10px', background: 'rgba(30,41,59,0.8)',
              border: '1px solid var(--border-color)', borderRadius: '8px',
              color: 'var(--text-primary)', fontSize: '0.82rem'
            }}
          >
            <option value="">Semua Aksi</option>
            {auditActionTypes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="module-content" style={{ padding: 0 }}>
          {auditLogs.length === 0 ? (
            <div className="empty-state">Tidak ada log yang ditemukan.</div>
          ) : (
            <table className="monitoring-table">
              <thead>
                <tr><th>Timestamp</th><th>User</th><th>Aksi</th><th>Resource</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((log, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString('id-ID')}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.user_id || '-'}</td>
                    <td>
                      <span className="action-badge">{log.action_type}</span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={log.resource_id}>{log.resource_id || '-'}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={log.details}>{log.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '10px 20px', borderTop: '1px solid var(--border-color)', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditTotal)} dari {auditTotal}
          </span>
          <button
            onClick={() => setAuditPage(p => Math.max(0, p - 1))}
            disabled={auditPage === 0}
            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-secondary)', cursor: auditPage === 0 ? 'not-allowed' : 'pointer' }}
          ><ChevronLeft size={14} /></button>
          <button
            onClick={() => setAuditPage(p => p + 1)}
            disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= auditTotal}
            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-secondary)', cursor: (auditPage + 1) * AUDIT_PAGE_SIZE >= auditTotal ? 'not-allowed' : 'pointer' }}
          ><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* ── NICE TO HAVE: ENGINEERING ANALYTICS ────────────────────────────────────────── */}
      
      <div className="modules-grid">
        {/* Per-User Activity Stats */}
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title" style={{ color: '#c084fc' }}><Users size={18} /> Statistik Aktivitas Pengguna</h3>
          </div>
          <div className="module-content">
            {userStats.length === 0 ? (
              <div className="empty-state">Belum ada data aktivitas.</div>
            ) : (
              <table className="monitoring-table">
                <thead><tr><th>User ID</th><th>Total Aksi</th><th>Breakdown</th></tr></thead>
                <tbody>
                  {userStats.map((stat, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500 }}>{stat.user_id}</td>
                      <td>{stat.total_actions}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {Object.entries(stat.breakdown || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* LLM/AI Call Metrics */}
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title" style={{ color: '#2dd4bf' }}><Cpu size={18} /> Metrik Panggilan AI (LLM)</h3>
          </div>
          <div className="module-content">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-element)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Calls</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{llmMetrics.aggregate?.total_calls || 0}</div>
              </div>
              <div style={{ background: 'var(--bg-element)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Avg Latency</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{Math.round(llmMetrics.aggregate?.avg_latency_ms || 0)} ms</div>
              </div>
              <div style={{ background: 'var(--bg-element)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Est. Cost</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>${(llmMetrics.aggregate?.total_cost || 0).toFixed(4)}</div>
              </div>
            </div>
            <table className="monitoring-table">
              <thead><tr><th>Timestamp</th><th>Endpoint</th><th>Latency</th><th>Tokens</th></tr></thead>
              <tbody>
                {(llmMetrics.recent || []).slice(0, 5).map((m: any, idx: number) => (
                  <tr key={idx}>
                    <td><div className="time-pill"><Clock size={12}/> {new Date(m.timestamp).toLocaleTimeString()}</div></td>
                    <td><span className="action-badge">{m.endpoint}</span></td>
                    <td style={{ color: m.latency_ms > 5000 ? '#ef4444' : '#10b981' }}>{m.latency_ms} ms</td>
                    <td>{m.tokens_used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="modules-grid">
        {/* Error Rate Dashboard */}
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title danger"><AlertTriangle size={18} /> Error Rate Dashboard (4xx/5xx)</h3>
          </div>
          <div className="module-content">
            {errorRates.length === 0 ? (
              <div className="empty-state">Tidak ada error tercatat.</div>
            ) : (
              <table className="monitoring-table">
                <thead><tr><th>Endpoint</th><th>Error Rate</th><th>Total Errors</th><th>Terakhir</th></tr></thead>
                <tbody>
                  {errorRates.map((e, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500, color: '#ef4444', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.route}>{e.route}</td>
                      <td style={{ width: 100 }}>
                        <div style={{ width: '100%', background: 'rgba(0,0,0,0.1)', height: '6px', borderRadius: '3px', marginTop: '4px' }}>
                          <div style={{ width: `${Math.min(100, e.error_rate_pct)}%`, background: '#ef4444', height: '100%', borderRadius: '3px' }}></div>
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>{e.error_rate_pct}%</span>
                      </td>
                      <td>{e.error_count} / {e.total_requests}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {e.last_error_time ? new Date(e.last_error_time).toLocaleTimeString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* KG Rebuild History */}
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title indigo"><Database size={18} /> Knowledge Graph Rebuild History</h3>
          </div>
          <div className="module-content">
            {kgHistory.length === 0 ? (
              <div className="empty-state">Belum ada riwayat rebuild KG.</div>
            ) : (
              <table className="monitoring-table">
                <thead><tr><th>Waktu Mulai</th><th>Durasi</th><th>Status</th><th>Nodes/Edges Changed</th></tr></thead>
                <tbody>
                  {kgHistory.map((h, idx) => (
                    <tr key={idx}>
                      <td><div className="time-pill"><Clock size={12}/> {new Date(h.start_time).toLocaleString()}</div></td>
                      <td>{h.duration_s ? `${h.duration_s}s` : '-'}</td>
                      <td>
                        <span className={`status-pill ${h.status === 'COMPLETED' ? '' : 'warn'}`}>
                          {h.status === 'COMPLETED' ? <CheckCircle size={12} /> : <Play size={12} />} {h.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <span style={{ color: (h.nodes_changed || 0) >= 0 ? '#10b981' : '#ef4444' }}>{h.nodes_changed > 0 ? '+' : ''}{h.nodes_changed || 0}N</span>
                        <span style={{ margin: '0 4px', color: '#475569' }}>|</span>
                        <span style={{ color: (h.edges_changed || 0) >= 0 ? '#10b981' : '#ef4444' }}>{h.edges_changed > 0 ? '+' : ''}{h.edges_changed || 0}E</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
