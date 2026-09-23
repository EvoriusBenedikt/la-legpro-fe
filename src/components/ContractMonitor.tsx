import { useState, useEffect } from 'react';
import {
  Search, BarChart2, FileCheck, AlertTriangle, CheckCircle,
  XCircle, Clock, Edit2, Trash2, Eye, Calendar, Building,
  TrendingUp, ShieldCheck, X, Upload, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useContractUpload } from '../context/ContractUploadContext';
import ComplianceResultsViewer from './ComplianceResultsViewer';
import ContractUploadModal from './ContractUploadModal';
import { API_BASE } from '../config';

interface AnalyzedDocument {
  id: string;
  filename: string;
  company_name: string | null;
  expiration_date: string | null;
  created_at: string;
  results?: any;
}

type FilterTab = 'all' | 'active' | 'expiring' | 'expired';
type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'active' | 'none';

interface ExpiryInfo {
  status: ExpiryStatus;
  label: string;
  daysLeft: number | null;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  notifText: string;
  notifColor: string;
}

function getExpiryInfo(expiration_date: string | null): ExpiryInfo {
  if (!expiration_date) return {
    status: 'none', label: 'Tidak terdeteksi', daysLeft: null,
    badgeColor: '#475569', badgeBg: 'rgba(100,116,139,0.15)', badgeBorder: 'rgba(100,116,139,0.3)',
    notifText: '', notifColor: ''
  };

  const now = new Date(); now.setHours(0,0,0,0);
  const exp = new Date(expiration_date); exp.setHours(0,0,0,0);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  const dateStr = exp.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });

  if (daysLeft < 0) return {
    status: 'expired', label: `Kadaluarsa ${Math.abs(daysLeft)} hari lalu`, daysLeft,
    badgeColor: '#b91c1c', badgeBg: 'rgba(239,68,68,0.15)', badgeBorder: 'rgba(239,68,68,0.4)',
    notifText: `Dokumen telah KEDALUWARSA sejak ${dateStr}`, notifColor: '#b91c1c'
  };
  if (daysLeft <= 7) return {
    status: 'critical', label: `${daysLeft} hari lagi`, daysLeft,
    badgeColor: '#9a3412', badgeBg: 'rgba(249,115,22,0.15)', badgeBorder: 'rgba(249,115,22,0.4)',
    notifText: `Kurang dari 1 minggu — kedaluwarsa ${dateStr}`, notifColor: '#9a3412'
  };
  if (daysLeft <= 31) return {
    status: 'warning', label: `${daysLeft} hari lagi`, daysLeft,
    badgeColor: '#92400e', badgeBg: 'rgba(251,191,36,0.12)', badgeBorder: 'rgba(251,191,36,0.35)',
    notifText: `Kurang dari 1 bulan — kedaluwarsa ${dateStr}`, notifColor: '#92400e'
  };
  return {
    status: 'active', label: dateStr, daysLeft,
    badgeColor: '#047857', badgeBg: 'rgba(52,211,153,0.12)', badgeBorder: 'rgba(52,211,153,0.3)',
    notifText: '', notifColor: ''
  };
}

export default function ContractMonitor() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<AnalyzedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [editDoc, setEditDoc] = useState<AnalyzedDocument | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [viewingDoc, setViewingDoc] = useState<AnalyzedDocument | null>(null);
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { jobs, subscribe } = useContractUpload();
  const processingCount = jobs.filter(j => j.status === 'processing').length;

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(API_BASE + '/api/compliance-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
    // Refresh the list whenever a background analysis job finishes
    return subscribe(() => { fetchDocs(); });
  }, [token, subscribe]);

  // Edit modal: Escape closes (overlay click handled on the overlay itself)
  useEffect(() => {
    if (!editDoc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditDoc(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editDoc]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus dokumen ini dari monitoring?')) return;
    const res = await fetch(`${API_BASE}/api/compliance-history/${id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) setDocuments(prev => prev.filter(d => d.id !== id));
    else alert('Gagal menghapus dokumen.');
  };

  const handleEditSave = async () => {
    if (!editDoc) return;
    const res = await fetch(`${API_BASE}/api/compliance-history/${editDoc.id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: editCompanyName || null, expiration_date: editExpirationDate || null })
    });
    if (res.ok) {
      setDocuments(prev => prev.map(d =>
        d.id === editDoc.id ? { ...d, company_name: editCompanyName, expiration_date: editExpirationDate } : d
      ));
      setEditDoc(null);
    } else alert('Gagal menyimpan perubahan.');
  };

  const handleView = async (doc: AnalyzedDocument) => {
    if (viewingDoc?.id === doc.id) { setViewingDoc(null); return; }
    setLoadingViewId(doc.id);
    try {
      const res = await fetch(`${API_BASE}/api/compliance-history/${doc.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setViewingDoc(await res.json());
      else alert('Gagal memuat analisis.');
    } catch (e) { console.error(e); }
    finally { setLoadingViewId(null); }
  };

  const handleDownloadCalendar = async (doc: AnalyzedDocument) => {
    try {
      const res = await fetch(`${API_BASE}/api/compliance-history/${doc.id}/calendar`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contract_expiry_${doc.company_name?.replace(/\s+/g, '_') || doc.id}.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Gagal mengunduh kalender.');
      }
    } catch (e) { console.error(e); }
  };

  // Compute KPIs
  const total = documents.length;
  const expired = documents.filter(d => { const e = getExpiryInfo(d.expiration_date); return e.status === 'expired'; }).length;
  const expiring = documents.filter(d => { const e = getExpiryInfo(d.expiration_date); return e.status === 'warning' || e.status === 'critical'; }).length;
  const active = documents.filter(d => { const e = getExpiryInfo(d.expiration_date); return e.status === 'active'; }).length;

  // Filter + search
  const filtered = documents.filter(doc => {
    const expiry = getExpiryInfo(doc.expiration_date);
    const matchesTab = filterTab === 'all' ||
      (filterTab === 'active' && expiry.status === 'active') ||
      (filterTab === 'expiring' && (expiry.status === 'warning' || expiry.status === 'critical')) ||
      (filterTab === 'expired' && expiry.status === 'expired');
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      doc.filename.toLowerCase().includes(q) ||
      (doc.company_name || '').toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const filterTabs: { id: FilterTab; label: string; count: number; color: string; text: string; bg: string }[] = [
    { id: 'all',      label: 'Semua',           count: total,    color: '#a855f7', text: '#6d28d9', bg: 'rgba(168,85,247,0.15)' },
    { id: 'active',   label: 'Aktif',           count: active,   color: '#34d399', text: '#047857', bg: 'rgba(52,211,153,0.15)' },
    { id: 'expiring', label: 'Segera Berakhir', count: expiring, color: '#fbbf24', text: '#92400e', bg: 'rgba(251,191,36,0.15)' },
    { id: 'expired',  label: 'Kedaluwarsa',     count: expired,  color: '#f87171', text: '#b91c1c', bg: 'rgba(239,68,68,0.15)' },
  ];

  return (
    <div className="view-container" style={{ padding: '24px 32px', boxSizing: 'border-box', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <BarChart2 size={24} color="#a855f7" />
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Contracts</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Pantau status dan kedaluwarsa seluruh dokumen analisis Anda.</p>
        </div>
        <button
          className="upload-btn"
          onClick={() => setUploadOpen(true)}
          style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', fontWeight: 600 }}
        >
          <Upload size={18} /> Upload Dokumen
        </button>
      </div>

      {/* Background analysis jobs (keep running across route changes) */}
      {processingCount > 0 && (
        <div className="bg-jobs-pill" role="status">
          <RefreshCw size={14} className="animate-spin-slow" />
          {processingCount} dokumen sedang dianalisis di latar belakang…
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Dokumen', value: total, icon: <FileCheck size={20} />, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
          { label: 'Aktif', value: active, icon: <ShieldCheck size={20} />, color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
          { label: 'Segera Berakhir', value: expiring, icon: <Clock size={20} />, color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
          { label: 'Kedaluwarsa', value: expired, icon: <XCircle size={20} />, color: '#f87171', bg: 'rgba(239,68,68,0.1)' },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: 'var(--bg-element)', borderRadius: '16px', padding: '20px',
            border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px'
          }}>
            <div style={{ width: 44, height: 44, borderRadius: '12px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color, flexShrink: 0 }}>
              {kpi.icon}
            </div>
            <div>
              <div style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.1, color: 'var(--text-primary)' }}>{kpi.value}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Cari nama perusahaan atau file..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-element)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {filterTabs.map(tab => (
            <button key={tab.id} onClick={() => setFilterTab(tab.id)} aria-pressed={filterTab === tab.id} style={{
              padding: '8px 14px', minHeight: '44px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              background: filterTab === tab.id ? tab.bg : 'var(--bg-card)',
              border: filterTab === tab.id ? `1px solid ${tab.color}` : '1px solid var(--border-color)',
              color: filterTab === tab.id ? tab.text : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              {tab.label}
              <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '999px', background: 'rgba(0,0,0,0.08)' }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Document List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>Memuat dokumen...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          <TrendingUp size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p>Tidak ada dokumen yang sesuai.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(doc => {
            const expiry = getExpiryInfo(doc.expiration_date);
            const isViewing = viewingDoc?.id === doc.id;
            return (
              <div key={doc.id}>
                <div style={{
                  background: 'var(--bg-element)', borderRadius: '14px', padding: '18px 20px',
                  border: expiry.status !== 'active' && expiry.status !== 'none'
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
                          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px' }}>
                            {doc.filename}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                              <Building size={13} />
                              {doc.company_name || <em style={{ opacity: 0.6 }}>Tidak terdeteksi</em>}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                              <Calendar size={13} />
                              Dianalisis: {new Date(doc.created_at).toLocaleDateString('id-ID')}
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
                            {expiry.status === 'expired' && <XCircle size={12} />}
                            {(expiry.status === 'critical') && <AlertTriangle size={12} />}
                            {expiry.status === 'warning' && <Clock size={12} />}
                            {expiry.status === 'active' && <CheckCircle size={12} />}
                            {expiry.label}
                          </span>

                          <button onClick={() => handleView(doc)} title="Lihat Analisis" aria-expanded={isViewing} style={{
                            padding: '6px 12px', minHeight: '44px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500,
                            background: isViewing ? 'rgba(168,85,247,0.12)' : 'var(--bg-element)',
                            border: isViewing ? '1px solid #a855f7' : '1px solid var(--border-color)',
                            color: isViewing ? '#6d28d9' : 'var(--text-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px'
                          }}>
                            {loadingViewId === doc.id ? '...' : <><Eye size={13} />{isViewing ? 'Tutup' : 'Lihat Analisis'}</>}
                          </button>

                          <button onClick={() => handleDownloadCalendar(doc)} title="Tambah ke Kalender" aria-label="Tambah ke Kalender" style={{
                            width: 44, height: 44, borderRadius: '8px', background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.2)', color: '#2563eb', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}><Calendar size={16} /></button>

                          <button onClick={() => { setEditDoc(doc); setEditCompanyName(doc.company_name || ''); setEditExpirationDate(doc.expiration_date || ''); }} title="Edit" aria-label="Edit metadata dokumen" style={{
                            width: 44, height: 44, borderRadius: '8px', background: 'var(--bg-element)',
                            border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}><Edit2 size={16} /></button>

                          <button onClick={() => handleDelete(doc.id)} title="Hapus" aria-label="Hapus dokumen" style={{
                            width: 44, height: 44, borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}><Trash2 size={16} /></button>
                        </div>
                      </div>

                      {/* Notification bar */}
                      {expiry.notifText && (
                        <div style={{
                          marginTop: '10px', padding: '7px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 500,
                          background: `${expiry.badgeBg}`, border: `1px solid ${expiry.badgeBorder}`, color: expiry.notifColor
                        }}>
                          ⚠ {expiry.notifText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline viewer */}
                {isViewing && viewingDoc && (
                  <div style={{ background: 'var(--bg-element)', borderRadius: '14px', border: '1px solid rgba(168,85,247,0.2)', marginTop: '4px', padding: '0 12px 24px' }}>
                    <button onClick={() => setViewingDoc(null)} style={{
                      display: 'flex', alignItems: 'center', gap: '6px', margin: '16px 0 8px',
                      background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem'
                    }}>
                      <X size={14} /> Tutup Hasil Analisis
                    </button>
                    <ComplianceResultsViewer
                      filename={viewingDoc.filename}
                      summary={viewingDoc.results?.summary}
                      results={viewingDoc.results?.results}
                      headerActions={null}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Metadata Dokumen"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditDoc(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 20px', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Edit Metadata Dokumen</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Nama Perusahaan</label>
              <input type="text" value={editCompanyName} onChange={e => setEditCompanyName(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-element)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                placeholder="Contoh: PT Lintasarta & PT Global Prima" />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Tanggal Kadaluarsa</label>
              <input type="date" value={editExpirationDate} onChange={e => setEditExpirationDate(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-element)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditDoc(null)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer' }}>Batal</button>
              <button onClick={handleEditSave} style={{ background: 'var(--accent-color)', border: 'none', color: 'white', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal — merged Compliance Checker flow */}
      {uploadOpen && (
        <ContractUploadModal onClose={() => setUploadOpen(false)} />
      )}
    </div>
  );
}
