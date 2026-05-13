import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Shield, Database, FileText, AlertTriangle, CheckCircle2,
  Clock, Users, Activity, Server, Eye, Lock, XCircle, RefreshCw
} from 'lucide-react';

interface DashboardData {
  doc_status: Record<string, number>;
  doc_by_klasifikasi: Record<string, number>;
  doc_by_jenis: { jenis: string; count: number }[];
  active_grants: number;
  audit_logs: {
    id: number;
    timestamp: string;
    user_id: string;
    action_type: string;
    resource_id: string;
    details: string;
  }[];
  system_health: {
    sqlite: boolean;
    chromadb: boolean;
  };
}

const ACTION_COLORS: Record<string, string> = {
  SEARCH: '#38BDF8',
  GRANT_ACCESS: '#A855F7',
  REVOKE_ACCESS: '#F43F5E',
  UPLOAD: '#22D3EE',
  DEFAULT: '#94A3B8',
};

const KLASIFIKASI_COLORS: Record<string, string> = {
  Publik: '#22D3EE',
  Rahasia: '#F59E0B',
  Terbatas: '#F43F5E',
};

export default function AdminDashboard() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch (e) {
      console.error('Admin dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const totalDocs = data ? Object.values(data.doc_status).reduce((a, b) => a + b, 0) : 0;
  const berlakuDocs = data?.doc_status['Berlaku'] ?? 0;
  const memproseDocs = data?.doc_status['Memproses'] ?? 0;
  const failedDocs = Object.entries(data?.doc_status ?? {})
    .filter(([k]) => k.startsWith('Gagal'))
    .reduce((a, [, v]) => a + v, 0);

  return (
    <div style={{ padding: '0 0 48px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(56,189,248,0.1))',
        borderRadius: '20px',
        padding: '32px',
        marginBottom: '28px',
        border: '1px solid rgba(168,85,247,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #A855F7, #38BDF8)',
              borderRadius: '12px', padding: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={24} color="white" />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Admin Dashboard
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Monitoring sistem & statistik operasional — Anda tidak memiliki akses ke konten dokumen
          </p>
        </div>
        <button
          onClick={fetchDashboard}
          style={{
            background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
            color: '#A855F7', borderRadius: '10px', padding: '10px 20px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '0.9rem', fontWeight: 500,
          }}
        >
          <RefreshCw size={16} />
          Refresh ({lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>
          <Activity size={40} style={{ marginBottom: '16px', opacity: 0.5, display: 'block', margin: '0 auto 16px' }} />
          Memuat data dashboard...
        </div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#F43F5E' }}>
          Gagal memuat data dashboard.
        </div>
      ) : (
        <>
          {/* System Health */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'SQLite Database', ok: data.system_health.sqlite, icon: <Database size={18} /> },
              { label: 'ChromaDB Vector', ok: data.system_health.chromadb, icon: <Server size={18} /> },
            ].map(item => (
              <div key={item.label} style={{
                background: 'var(--bg-card)', borderRadius: '14px', padding: '20px',
                border: `1px solid ${item.ok ? 'rgba(34,211,238,0.3)' : 'rgba(244,63,94,0.3)'}`,
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <div style={{ color: item.ok ? '#22D3EE' : '#F43F5E' }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.label}</div>
                  <div style={{ fontWeight: 600, color: item.ok ? '#22D3EE' : '#F43F5E', fontSize: '0.9rem' }}>
                    {item.ok ? '● Online' : '● Offline'}
                  </div>
                </div>
              </div>
            ))}

            <div style={{
              background: 'var(--bg-card)', borderRadius: '14px', padding: '20px',
              border: '1px solid rgba(168,85,247,0.3)',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <Users size={18} color="#A855F7" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pemberian Akses Aktif</div>
                <div style={{ fontWeight: 700, color: '#A855F7', fontSize: '1.2rem' }}>{data.active_grants}</div>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', borderRadius: '14px', padding: '20px',
              border: '1px solid rgba(34,211,238,0.3)',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <FileText size={18} color="#22D3EE" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Dokumen</div>
                <div style={{ fontWeight: 700, color: '#22D3EE', fontSize: '1.2rem' }}>{totalDocs}</div>
              </div>
            </div>
          </div>

          {/* Doc Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Berlaku', value: berlakuDocs, icon: <CheckCircle2 size={20} />, color: '#22D3EE' },
              { label: 'Memproses', value: memproseDocs, icon: <Clock size={20} />, color: '#F59E0B' },
              { label: 'Gagal', value: failedDocs, icon: <XCircle size={20} />, color: '#F43F5E' },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--bg-card)', borderRadius: '14px', padding: '24px',
                border: `1px solid ${card.color}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: card.color }}>
                  {card.icon}
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{card.label}</span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ height: '4px', background: `${card.color}22`, borderRadius: '2px', marginTop: '12px' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    background: card.color,
                    width: totalDocs > 0 ? `${Math.min(100, (card.value / totalDocs) * 100)}%` : '0%',
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Volume by Klasifikasi & Jenis */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* By Klasifikasi */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Lock size={18} color="#A855F7" />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Volume per Klasifikasi</h3>
              </div>
              {Object.entries(data.doc_by_klasifikasi).map(([klas, count]) => (
                <div key={klas} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: KLASIFIKASI_COLORS[klas] ?? '#94A3B8', display: 'inline-block' }} />
                      {klas}
                    </span>
                    <span style={{ fontWeight: 600, color: KLASIFIKASI_COLORS[klas] ?? 'var(--text-primary)' }}>{count}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: KLASIFIKASI_COLORS[klas] ?? '#94A3B8',
                      width: totalDocs > 0 ? `${(count / totalDocs) * 100}%` : '0%',
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>
              ))}
              {Object.keys(data.doc_by_klasifikasi).length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Tidak ada data</p>
              )}
            </div>

            {/* By Jenis */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <FileText size={18} color="#38BDF8" />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Volume per Jenis</h3>
              </div>
              {data.doc_by_jenis.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tidak ada data</p>
              ) : (
                data.doc_by_jenis.map(item => (
                  <div key={item.jenis} style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1, marginRight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.jenis || 'Tidak Diketahui'}
                    </span>
                    <span style={{
                      background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
                      borderRadius: '20px', padding: '2px 10px', fontSize: '0.8rem', fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Audit Logs */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Eye size={18} color="#F59E0B" />
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Log Audit (Append-Only)</h3>
              <span style={{
                marginLeft: 'auto', background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
                borderRadius: '20px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600,
              }}>
                {data.audit_logs.length} entri terbaru
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {data.audit_logs.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '32px' }}>
                  Belum ada entri log audit.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {['Waktu', 'User ID', 'Aksi', 'Resource', 'Detail'].map(h => (
                        <th key={h} style={{
                          padding: '10px 12px', textAlign: 'left',
                          color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit_logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {log.user_id.slice(0, 8)}...
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            background: `${ACTION_COLORS[log.action_type] ?? ACTION_COLORS.DEFAULT}22`,
                            color: ACTION_COLORS[log.action_type] ?? ACTION_COLORS.DEFAULT,
                            borderRadius: '6px', padding: '2px 8px', fontSize: '0.78rem', fontWeight: 600,
                          }}>
                            {log.action_type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {log.resource_id ? log.resource_id.slice(0, 12) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
