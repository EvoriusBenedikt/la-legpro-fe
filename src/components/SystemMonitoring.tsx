import { useState, useEffect } from 'react';
import { Activity, HardDrive, Cpu, Server, Play, Clock, CheckCircle, Save, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './SystemMonitoring.css';

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
}

interface BackupData {
  filename: string;
  size_mb: number;
  created_at: string;
}

export default function SystemMonitoring() {
  const { token } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [backups, setBackups] = useState<BackupData[]>([]);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [healthRes, queueRes, backupRes] = await Promise.all([
        fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/engineer/health', { headers }),
        fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/engineer/queue', { headers }),
        fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/engineer/backups', { headers })
      ]);

      if (healthRes.ok) setHealth(await healthRes.json());
      if (queueRes.ok) {
        const qData = await queueRes.json();
        setTasks(qData.recent_history);
      }
      if (backupRes.ok) {
        const bData = await backupRes.json();
        setBackups(bData.backups);
      }
    } catch (err) {
      setError("Gagal mengambil data dari server. Pastikan backend aktif.");
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [token]);

  const triggerBackup = async () => {
    setLoadingBackup(true);
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/engineer/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchData();
      } else {
        alert("Gagal membuat backup");
      }
    } catch (err) {
      alert("Error: " + err);
    }
    setLoadingBackup(false);
  };

  const formatBytes = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  const formatUptime = (sec: number) => {
    const d = Math.floor(sec / (3600*24));
    const h = Math.floor(sec % (3600*24) / 3600);
    const m = Math.floor(sec % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  };

  if (!health) return <div style={{padding: '32px', color: '#94a3b8'}}>Loading System Metrics...</div>;

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

      {error && <div className="error-banner"><AlertTriangle size={18}/> {error}</div>}

      {/* KPI CARDS */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-indicator blue"></div>
          <div className="kpi-header">
            <div>
              <p className="kpi-title">CPU Load</p>
              <h2 className="kpi-value">{health.cpu}%</h2>
            </div>
            <div className="kpi-icon blue"><Cpu size={24} /></div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${health.cpu > 80 ? 'danger' : 'blue'}`} style={{ width: `${health.cpu}%` }}></div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-indicator purple"></div>
          <div className="kpi-header">
            <div>
              <p className="kpi-title">RAM Usage</p>
              <h2 className="kpi-value">{health.memory.percent}%</h2>
              <p className="kpi-subtext">{formatBytes(health.memory.used)} / {formatBytes(health.memory.total)}</p>
            </div>
            <div className="kpi-icon purple"><Server size={24} /></div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${health.memory.percent > 85 ? 'danger' : 'purple'}`} style={{ width: `${health.memory.percent}%` }}></div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-indicator green"></div>
          <div className="kpi-header">
            <div>
              <p className="kpi-title">Disk Storage</p>
              <h2 className="kpi-value">{health.disk.percent}%</h2>
              <p className="kpi-subtext">{formatBytes(health.disk.used)} / {formatBytes(health.disk.total)}</p>
            </div>
            <div className="kpi-icon green"><HardDrive size={24} /></div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill ${health.disk.percent > 90 ? 'danger' : 'green'}`} style={{ width: `${health.disk.percent}%` }}></div>
          </div>
        </div>
        
        <div className="kpi-card" style={{display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
           <div className="kpi-card-indicator orange"></div>
           <p className="kpi-title" style={{marginBottom: '12px'}}>Database Sizes</p>
           <div className="db-row">
             <span>KG Metadata:</span>
             <span>{health.database.metadata_db_mb} MB</span>
           </div>
           <div className="db-row">
             <span>Users DB:</span>
             <span>{health.database.users_db_mb} MB</span>
           </div>
        </div>
      </div>

      <div className="modules-grid">
        {/* Antrean Pemrosesan */}
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title indigo"><Play size={18}/> Antrean Pemrosesan (Queue)</h3>
            <span className="module-badge">Recent Activity</span>
          </div>
          <div className="module-content">
            {tasks.length === 0 ? (
               <div className="empty-state">Tidak ada tugas dalam antrean.</div>
            ) : (
              <table className="monitoring-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Aksi</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="status-pill">
                          <CheckCircle size={12} /> {t.status}
                        </span>
                      </td>
                      <td style={{fontWeight: 500}}>
                        {t.action}
                      </td>
                      <td>
                        <div className="time-pill">
                          <Clock size={12}/> {new Date(t.timestamp).toLocaleTimeString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Manajemen Backup */}
        <div className="module-card">
          <div className="module-header">
            <h3 className="module-title emerald"><Save size={18}/> Manajemen Backup Database</h3>
            <button 
              onClick={triggerBackup}
              disabled={loadingBackup}
              className="module-btn"
            >
              {loadingBackup ? 'Membuat Backup...' : '+ Buat Backup Manual'}
            </button>
          </div>
          <div className="module-content">
            {backups.length === 0 ? (
               <div className="empty-state">Belum ada backup yang dibuat.</div>
            ) : (
              <table className="monitoring-table">
                <thead>
                  <tr>
                    <th>Nama File Backup</th>
                    <th>Ukuran</th>
                    <th>Dibuat Pada</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b, idx) => (
                    <tr key={idx}>
                      <td style={{fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8'}}>{b.filename}</td>
                      <td>{b.size_mb} MB</td>
                      <td style={{fontSize: '0.75rem', color: '#94a3b8'}}>{new Date(b.created_at).toLocaleString()}</td>
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
