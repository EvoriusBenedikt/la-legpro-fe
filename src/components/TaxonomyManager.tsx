import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import LoadingOrb from './LoadingOrb';

interface Taxonomy {
  id: number;
  name: string;
  parent_id: number | null;
  is_active: boolean;
}

export default function TaxonomyManager() {
  const [taxonomyList, setTaxonomyList] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // States for Adding
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  
  // States for Editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const fetchTaxonomy = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/taxonomy');
      setTaxonomyList(res.data.taxonomy);
    } catch (e) {
      setError(isHttpError(e) ? 'Gagal memuat data taksonomi.' : 'Kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxonomy();
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await api.post('/api/taxonomy', { name: newName });
      setNewName('');
      setAdding(false);
      fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response.data?.detail || 'Gagal menambahkan taksonomi');
      } else {
        console.error(e);
      }
    }
  };

  const handleUpdateName = async (id: number) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await api.put(`/api/taxonomy/${id}`, { name: editName });
      setEditingId(null);
      fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response.data?.detail || 'Gagal memperbarui taksonomi');
      } else {
        console.error(e);
      }
    }
  };

  const handleToggleActive = async (id: number, currentStatus: boolean) => {
    try {
      await api.put(`/api/taxonomy/${id}`, { is_active: !currentStatus });
      fetchTaxonomy();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus atau menonaktifkan taksonomi ini?')) return;
    try {
      const res = await api.delete(`/api/taxonomy/${id}`);
      alert(res.data.message);
      fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response.data?.detail || 'Gagal menghapus taksonomi');
      } else {
        console.error(e);
      }
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Manajemen Taksonomi Dokumen</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Kelola jenis dan sub-jenis dokumen yang tersedia di sistem.</p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--accent)', color: '#fff',
            border: 'none', padding: '10px 20px', borderRadius: '8px',
            fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
          }}
        >
          {adding ? <XCircle size={18} /> : <Plus size={18} />}
          {adding ? 'Batal' : 'Tambah Taksonomi'}
        </button>
      </div>

      {adding && (
        <div style={{ 
          background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', 
          marginBottom: '24px', border: '1px solid var(--border-color)',
          display: 'flex', gap: '16px', alignItems: 'flex-end'
        }}>
          <div style={{ flexGrow: 1 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Nama Jenis Dokumen</label>
            <input 
              type="text" 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Contoh: Peraturan Direksi"
              style={{
                width: '100%', padding: '12px', borderRadius: '8px',
                background: 'var(--bg-element)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '0.95rem'
              }}
            />
          </div>
          <button 
            onClick={handleAdd}
            style={{
              padding: '12px 24px', background: 'var(--accent-color)', color: '#fff',
              border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Simpan
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'var(--bg-element)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>NAMA JENIS DOKUMEN</th>
              <th style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>STATUS</th>
              <th style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>AKSI</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} style={{ padding: '32px', textAlign: 'center' }}><LoadingOrb size={32} label="Memuat taksonomi..." /></td></tr>
            ) : taxonomyList.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada data taksonomi</td></tr>
            ) : taxonomyList.map(tax => (
              <tr key={tax.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: tax.is_active ? 1 : 0.6 }}>
                <td style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>
                  {editingId === tax.id ? (
                    <input 
                      type="text" 
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleUpdateName(tax.id)}
                      onKeyDown={e => e.key === 'Enter' && handleUpdateName(tax.id)}
                      autoFocus
                      style={{
                        padding: '6px 10px', borderRadius: '4px', background: 'var(--bg-element)',
                        border: '1px solid var(--border-highlight)', color: 'var(--text-primary)', width: '100%'
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{tax.name}</span>
                  )}
                </td>
                <td style={{ padding: '16px 24px' }}>
                  <button 
                    onClick={() => handleToggleActive(tax.id, tax.is_active)}
                    style={{
                      background: tax.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
                      color: tax.is_active ? 'var(--success-text)' : 'var(--text-secondary)',
                      border: `1px solid ${tax.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.2)'}`,
                      padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {tax.is_active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {tax.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => { setEditingId(tax.id); setEditName(tax.name); }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                      title="Ubah Nama"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(tax.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', padding: '4px' }}
                      title="Hapus"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
