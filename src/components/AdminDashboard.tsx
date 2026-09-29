import React from 'react';
import { useState, useEffect } from 'react';
import {
  Shield, Database, FileText, AlertTriangle, CheckCircle2,
  Clock, Users, Activity, Server, Eye, Lock, XCircle, RefreshCw
} from 'lucide-react';
import api, { isHttpError } from '../services/api';

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
  doc_details?: Record<string, any[]>;
}

const ACTION_COLORS: Record<string, string> = {
  SEARCH: '#0369a1',
  GRANT_ACCESS: '#7e22ce',
  REVOKE_ACCESS: '#be123c',
  UPLOAD: '#155e75',
  DEFAULT: '#475569',
};

const KLASIFIKASI_COLORS: Record<string, string> = {
  Umum: '#0e7490',
  Rahasia: '#92400e',
  Terbatas: '#be123c',
};


const StatusCard = ({ label, value, icon, color, totalDocs, docs = [] }: any) => {
  const [search, setSearch] = React.useState("");

  const filteredDocs = docs.filter((d: any) => 
    d.judul.toLowerCase().includes(search.toLowerCase()) || 
    (d.nomor && d.nomor.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '14px', border: `1px solid ${color}33`, overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color }}>
            {icon}
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color, marginTop: '12px' }}>{value}</div>
        <div style={{ height: '4px', background: `${color}22`, borderRadius: '2px', marginTop: '12px' }}>
          <div style={{ height: '100%', borderRadius: '2px', background: color, width: totalDocs > 0 ? `${Math.min(100, (value / totalDocs) * 100)}%` : '0%' }}></div>
        </div>
      </div>
      
      <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${color}22`, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <input 
          type="text" 
          placeholder={`Cari regulasi ${label.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-element)', border: `1px solid ${color}55`, borderRadius: '6px', color: 'var(--text-primary)', marginTop: '16px', marginBottom: '12px', fontSize: '0.85rem' }}
        />
        <div className="custom-scrollbar" style={{ maxHeight: '200px', flexGrow: 1, overflowY: 'auto' }}>
          {filteredDocs.length > 0 ? filteredDocs.map((d: any, i: number) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < filteredDocs.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: '1.4' }}>{d.judul}</div>
              {d.nomor && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{d.nomor}</div>}
            </div>
          )) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px 0' }}>Tidak ada dokumen ditemukan</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  const [exclusions, setExclusions] = useState<{id: number; entity_name: string; created_at: string}[]>([]);
  const [newExclusion, setNewExclusion] = useState('');
  const [addingExclusion, setAddingExclusion] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      // Per-call catch: a failing endpoint still lets the other one load
      const res = await api.get('/api/admin/dashboard').catch(() => null);
      if (res) {
        setData(res.data);
        setLastRefresh(new Date());
      }
      
      const excRes = await api.get('/api/admin/kg-exclusions').catch(() => null);
      if (excRes) {
        setExclusions(excRes.data.exclusions);
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

  const handleAddExclusion = async () => {
    if (!newExclusion.trim()) return;
    setAddingExclusion(true);
    try {
      await api.post('/api/admin/kg-exclusions', { entity_name: newExclusion });
      setNewExclusion('');
      fetchDashboard();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response.data?.detail || 'Gagal menambahkan pengecualian');
      } else {
        console.error(e);
      }
    } finally {
      setAddingExclusion(false);
    }
  };

  const handleDeleteExclusion = async (id: number) => {
    if (!confirm('Hapus pengecualian ini?')) return;
    try {
      await api.delete(`/api/admin/kg-exclusions/${id}`);
      fetchDashboard();
    } catch (e) {
      console.error(e);
    }
  };

  const totalDocs = data ? Object.values(data.doc_status).reduce((a: any, b: any) => a + b, 0) : 0;
  const berlakuDocs = data?.doc_status['Berlaku'] ?? 0;
  const tidakBerlakuDocs = data?.doc_status['Tidak Berlaku'] ?? 0;
  const memproseDocs = data?.doc_status['Memproses'] ?? 0;
  const failedDocs = data?.doc_status['Gagal'] ?? 0;
  
  const docDetails = data?.doc_details || {};
    
  const maxJenisCount = data?.doc_by_jenis?.length ? Math.max(...data.doc_by_jenis.map(d => d.count)) : 1;

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
              background: 'var(--gradient-brand)',
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
            background: 'var(--accent-glow)', border: '1px solid var(--border-highlight)',
            color: 'var(--accent-hover)', borderRadius: '10px', padding: '10px 20px',
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
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--danger-text)' }}>
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
                border: `1px solid ${item.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <div style={{ color: item.ok ? 'var(--success-text)' : 'var(--danger-text)' }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.label}</div>
                  <div style={{ fontWeight: 600, color: item.ok ? 'var(--success-text)' : 'var(--danger-text)', fontSize: '0.9rem' }}>
                    {item.ok ? '● Online' : '● Offline'}
                  </div>
                </div>
              </div>
            ))}

            <div style={{
              background: 'var(--bg-card)', borderRadius: '14px', padding: '20px',
              border: '1px solid var(--border-highlight)',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <Users size={18} color="var(--accent-color)" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pemberian Akses Aktif</div>
                <div style={{ fontWeight: 700, color: 'var(--accent-hover)', fontSize: '1.2rem' }}>{data.active_grants}</div>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-card)', borderRadius: '14px', padding: '20px',
              border: '1px solid var(--border-highlight)',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <FileText size={18} color="var(--accent-color)" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Dokumen</div>
                <div style={{ fontWeight: 700, color: 'var(--accent-hover)', fontSize: '1.2rem' }}>{totalDocs}</div>
              </div>
            </div>
          </div>

          {/* Doc Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px', alignItems: 'stretch' }}>
            {[
              { label: 'Berlaku', value: berlakuDocs, icon: <CheckCircle2 size={20} />, color: '#047857', docs: docDetails['Berlaku'] || [] },
              { label: 'Tidak Berlaku', value: tidakBerlakuDocs, icon: <XCircle size={20} />, color: '#64748b', docs: docDetails['Tidak Berlaku'] || [] },
              { label: 'Memproses', value: memproseDocs, icon: <Clock size={20} />, color: '#92400e', docs: docDetails['Memproses'] || [] },
              { label: 'Gagal', value: failedDocs, icon: <AlertTriangle size={20} />, color: '#b91c1c', docs: docDetails['Gagal'] || [] },
            ].map(card => (
              <StatusCard key={card.label} {...card} totalDocs={totalDocs} />
            ))}
          </div>

          {/* Volume by Klasifikasi & Jenis */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* By Klasifikasi */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Lock size={18} color="var(--accent-color)" />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Volume per Klasifikasi</h3>
              </div>
              {Object.entries(data.doc_by_klasifikasi).map(([klas, count]) => (
                <div key={klas} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: KLASIFIKASI_COLORS[klas] ?? '#64748b', display: 'inline-block' }} />
                      {klas}
                    </span>
                    <span style={{ fontWeight: 600, color: KLASIFIKASI_COLORS[klas] ?? 'var(--text-primary)' }}>{count}</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-element)', borderRadius: '3px' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: KLASIFIKASI_COLORS[klas] ?? '#64748b',
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
                <FileText size={18} color="var(--accent-color)" />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Volume per Jenis</h3>
              </div>
              {data.doc_by_jenis.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tidak ada data</p>
              ) : (
                data.doc_by_jenis.map(item => (
                  <div key={item.jenis} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1, marginRight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.jenis || 'Tidak Diketahui'}
                      </span>
                      <span style={{
                        color: 'var(--accent-hover)', fontSize: '0.85rem', fontWeight: 600,
                      }}>{item.count}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-element)', borderRadius: '3px' }}>
                      <div style={{
                        height: '100%', borderRadius: '3px',
                        background: 'var(--accent-color)',
                        width: maxJenisCount > 0 ? `${(item.count / maxJenisCount) * 100}%` : '0%',
                        transition: 'width 0.8s ease',
                      }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* FR-30: KG Exclusions */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Shield size={18} color="var(--danger)" />
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Pengecualian Entitas Knowledge Graph (FR-30)</h3>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                placeholder="Nama entitas untuk dikecualikan (misal: 'Menteri Hukum', 'Kementerian X')..."
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-element)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExclusion()}
              />
              <button
                onClick={handleAddExclusion}
                disabled={addingExclusion}
                style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '8px', cursor: addingExclusion ? 'wait' : 'pointer', fontWeight: 600 }}
              >
                {addingExclusion ? 'Menambahkan...' : 'Tambah Pengecualian'}
              </button>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>ID</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Nama Entitas</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Ditambahkan Pada</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {exclusions.map(exc => (
                    <tr key={exc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{exc.id}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{exc.entity_name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{new Date(exc.created_at).toLocaleString('id-ID')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button onClick={() => handleDeleteExclusion(exc.id)} title="Hapus pengecualian" style={{ background: 'transparent', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                          <XCircle size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {exclusions.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Belum ada entitas yang dikecualikan.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Logs */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Eye size={18} color="var(--warning)" />
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Log Audit (Append-Only)</h3>
              <span style={{
                marginLeft: 'auto', background: 'rgba(245,158,11,0.15)', color: 'var(--warning-text)',
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
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
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
