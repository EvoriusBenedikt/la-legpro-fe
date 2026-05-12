import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MoreVertical, Edit2, Trash2, Calendar, Building, FileCheck, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';

interface AnalyzedDocument {
  id: string;
  filename: string;
  company_name: string | null;
  expiration_date: string | null;
  created_at: string;
}

type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'upcoming' | 'none';

interface ExpiryInfo {
  status: ExpiryStatus;
  label: string;
  daysLeft: number | null;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  glowColor: string;
  icon: React.ReactNode;
  notifBg: string;
  notifBorder: string;
  notifText: string;
}

function getExpiryInfo(expiration_date: string | null): ExpiryInfo {
  if (!expiration_date) {
    return {
      status: 'none',
      label: 'Tidak terdeteksi',
      daysLeft: null,
      badgeColor: '#64748b',
      badgeBg: 'rgba(100, 116, 139, 0.15)',
      badgeBorder: 'rgba(100, 116, 139, 0.3)',
      glowColor: 'transparent',
      icon: null,
      notifBg: '',
      notifBorder: '',
      notifText: '',
    };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expDate = new Date(expiration_date);
  expDate.setHours(0, 0, 0, 0);
  const diffMs = expDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const dateStr = expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  if (daysLeft < 0) {
    return {
      status: 'expired',
      label: `Kedaluwarsa ${Math.abs(daysLeft)} hari lalu`,
      daysLeft,
      badgeColor: '#f87171',
      badgeBg: 'rgba(239, 68, 68, 0.2)',
      badgeBorder: 'rgba(239, 68, 68, 0.5)',
      glowColor: 'rgba(239, 68, 68, 0.15)',
      icon: <XCircle size={12} />,
      notifBg: 'rgba(239, 68, 68, 0.1)',
      notifBorder: 'rgba(239, 68, 68, 0.4)',
      notifText: `⚠ Dokumen telah KEDALUWARSA sejak ${dateStr}`,
    };
  }
  if (daysLeft === 0) {
    return {
      status: 'critical',
      label: 'Kedaluwarsa hari ini!',
      daysLeft,
      badgeColor: '#fb923c',
      badgeBg: 'rgba(249, 115, 22, 0.2)',
      badgeBorder: 'rgba(249, 115, 22, 0.5)',
      glowColor: 'rgba(249, 115, 22, 0.15)',
      icon: <AlertTriangle size={12} />,
      notifBg: 'rgba(249, 115, 22, 0.1)',
      notifBorder: 'rgba(249, 115, 22, 0.4)',
      notifText: `🔴 Dokumen kedaluwarsa HARI INI (${dateStr})`,
    };
  }
  if (daysLeft <= 7) {
    return {
      status: 'critical',
      label: `${daysLeft} hari lagi`,
      daysLeft,
      badgeColor: '#fb923c',
      badgeBg: 'rgba(249, 115, 22, 0.2)',
      badgeBorder: 'rgba(249, 115, 22, 0.5)',
      glowColor: 'rgba(249, 115, 22, 0.15)',
      icon: <AlertTriangle size={12} />,
      notifBg: 'rgba(249, 115, 22, 0.1)',
      notifBorder: 'rgba(249, 115, 22, 0.4)',
      notifText: `🔴 Kurang dari 1 minggu — kedaluwarsa ${dateStr}`,
    };
  }
  if (daysLeft <= 31) {
    return {
      status: 'warning',
      label: `${daysLeft} hari lagi`,
      daysLeft,
      badgeColor: '#fbbf24',
      badgeBg: 'rgba(251, 191, 36, 0.15)',
      badgeBorder: 'rgba(251, 191, 36, 0.4)',
      glowColor: 'rgba(251, 191, 36, 0.10)',
      icon: <Clock size={12} />,
      notifBg: 'rgba(251, 191, 36, 0.08)',
      notifBorder: 'rgba(251, 191, 36, 0.3)',
      notifText: `🟡 Kurang dari 1 bulan — kedaluwarsa ${dateStr}`,
    };
  }

  return {
    status: 'upcoming',
    label: dateStr,
    daysLeft,
    badgeColor: '#34d399',
    badgeBg: 'rgba(52, 211, 153, 0.12)',
    badgeBorder: 'rgba(52, 211, 153, 0.3)',
    glowColor: 'transparent',
    icon: <CheckCircle size={12} />,
    notifBg: '',
    notifBorder: '',
    notifText: '',
  };
}

export default function AnalyzedDocumentsDashboard() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<AnalyzedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editDoc, setEditDoc] = useState<AnalyzedDocument | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/compliance-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus dokumen ini dari history?')) return;
    try {
      const res = await fetch(`http://localhost:8000/api/compliance-history/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== id));
      } else {
        alert('Gagal menghapus dokumen.');
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
    setOpenDropdownId(null);
  };

  const handleEditSave = async () => {
    if (!editDoc) return;
    try {
      const res = await fetch(`http://localhost:8000/api/compliance-history/${editDoc.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_name: editCompanyName || null,
          expiration_date: editExpirationDate || null
        })
      });
      if (res.ok) {
        setDocuments(prev => prev.map(doc => 
          doc.id === editDoc.id 
            ? { ...doc, company_name: editCompanyName, expiration_date: editExpirationDate } 
            : doc
        ));
        setEditDoc(null);
      } else {
        alert('Gagal menyimpan perubahan.');
      }
    } catch (err) {
      console.error("Edit failed", err);
    }
  };

  return (
    <div className="activity-feed" style={{ width: '380px', flexShrink: 0, overflowY: 'auto' }}>
      <div className="activity-feed-header">
        <div>
          <h3>Dashboard Dokumen</h3>
          <p>Hasil Analisis Terkini</p>
        </div>
      </div>

      <div className="activity-list" style={{ marginTop: '16px' }}>
        {isLoading ? (
          <div className="empty-activity">Memuat dokumen...</div>
        ) : documents.length === 0 ? (
          <div className="empty-activity">Belum ada dokumen yang dianalisis.</div>
        ) : (
          documents.map((doc) => {
            const expiry = getExpiryInfo(doc.expiration_date);
            return (
              <div
                key={doc.id}
                className="activity-item"
                style={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '14px 16px',
                  background: expiry.glowColor !== 'transparent' && expiry.glowColor
                    ? `linear-gradient(135deg, rgba(30, 41, 59, 0.6), ${expiry.glowColor})`
                    : 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '12px',
                  marginBottom: '12px',
                  border: expiry.status !== 'none' && expiry.status !== 'upcoming'
                    ? `1px solid ${expiry.badgeBorder}`
                    : '1px solid rgba(255,255,255,0.05)',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Title Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <FileCheck size={16} className="text-accent" />
                    <span className="activity-title" style={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.filename}
                    </span>
                  </div>

                  {/* Dropdown Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenDropdownId(openDropdownId === doc.id ? null : doc.id)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openDropdownId === doc.id && (
                      <div style={{ position: 'absolute', right: 0, top: '24px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', width: '120px', overflow: 'hidden' }}>
                        <button
                          onClick={() => {
                            setEditDoc(doc);
                            setEditCompanyName(doc.company_name || '');
                            setEditExpirationDate(doc.expiration_date || '');
                            setOpenDropdownId(null);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}
                        >
                          <Trash2 size={14} /> Hapus
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Meta Row */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#94a3b8', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building size={14} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.company_name || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Tidak terdeteksi</span>}
                    </span>
                  </div>

                  {/* Expiry Badge Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={14} />
                      <span style={{ color: '#64748b' }}>Kadaluarsa:</span>
                    </div>
                    {doc.expiration_date ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 9px',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: expiry.badgeColor,
                        background: expiry.badgeBg,
                        border: `1px solid ${expiry.badgeBorder}`,
                        letterSpacing: '0.01em',
                      }}>
                        {expiry.icon}
                        {expiry.label}
                      </span>
                    ) : (
                      <span style={{ fontStyle: 'italic', opacity: 0.5, fontSize: '0.82rem' }}>Tidak terdeteksi</span>
                    )}
                  </div>
                </div>

                {/* Notification bar for urgent statuses */}
                {expiry.notifText && (
                  <div style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    background: expiry.notifBg,
                    border: `1px solid ${expiry.notifBorder}`,
                    fontSize: '0.78rem',
                    color: expiry.badgeColor,
                    fontWeight: 500,
                    lineHeight: '1.4',
                  }}>
                    {expiry.notifText}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Modal */}
      {editDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'white' }}>Edit Metadata Dokumen</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#94a3b8' }}>Nama Perusahaan (Para Pihak)</label>
              <input
                type="text"
                value={editCompanyName}
                onChange={(e) => setEditCompanyName(e.target.value)}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: 'white' }}
                placeholder="Contoh: PT Lintasarta & PT Global Prima"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#94a3b8' }}>Tanggal Berakhir (Kadaluarsa)</label>
              <input
                type="date"
                value={editExpirationDate}
                onChange={(e) => setEditExpirationDate(e.target.value)}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: 'white' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditDoc(null)}
                style={{ background: 'transparent', border: '1px solid #334155', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={handleEditSave}
                style={{ background: '#8b5cf6', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
