import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import LoadingOrb from './LoadingOrb';

interface Taxonomy {
  id: number;
  name: string;
  parent_id: number | null;
  is_active: boolean;
  usage_count: number;
}

/** System-consistent choice dialog (mirrors AdminDashboard's ConfirmDialog
    pattern): replaces window.confirm for the destructive delete, and offers
    the reversible deactivate path first (2026-10-06 critique remediation). */
const ChoiceDialog = ({
  tax,
  busy,
  onCancel,
  onDeactivate,
  onDelete,
}: {
  tax: Taxonomy;
  busy: boolean;
  onCancel: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const used = tax.usage_count > 0;

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="tax-choice-title">
        <h3 className="confirm-modal-title" id="tax-choice-title">
          Nonaktifkan atau hapus “{tax.name}”?
        </h3>
        <p className="confirm-modal-body">
          {used
            ? `${tax.usage_count} dokumen di repositori menggunakan jenis ini. Menonaktifkan menyembunyikannya dari unggahan dan klasifikasi baru tanpa menghapus riwayat, dan dapat dibatalkan kapan saja.`
            : 'Tidak ada dokumen yang menggunakan jenis ini. Menonaktifkan dapat dibatalkan kapan saja.'}
          {' '}Menghapus menghilangkan jenis ini secara permanen dari sistem.
        </p>
        <div className="confirm-modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" onClick={onDeactivate} disabled={busy}>
            Nonaktifkan
          </button>
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={busy}>
            Hapus Permanen
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TaxonomyManager() {
  const [taxonomyList, setTaxonomyList] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState('');

  // States for Adding
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // States for Editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // In-flight lock for every mutation (double-submit guard)
  const [busy, setBusy] = useState(false);

  // Delete-or-deactivate choice dialog target
  const [choice, setChoice] = useState<Taxonomy | null>(null);

  const fail = (message: string, again: () => void) => {
    setError(message);
    setRetry(() => again);
  };

  // Success confirmations are short positive sentences that dismiss themselves
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const fetchTaxonomy = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/taxonomy');
      setTaxonomyList(res.data.taxonomy);
      setError('');
      setRetry(null);
    } catch (e) {
      fail(isHttpError(e) ? 'Gagal memuat data taksonomi.' : 'Kesalahan jaringan.', fetchTaxonomy);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxonomy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await api.post('/api/taxonomy', { name });
      setNewName('');
      setAdding(false);
      setNotice('Taksonomi berhasil ditambahkan.');
      await fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        fail(e.response.data?.detail || 'Gagal menambahkan taksonomi', handleAdd);
      } else {
        console.error(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (tax: Taxonomy) => {
    setEditingId(tax.id);
    setEditName(tax.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  // Enter = save, Escape = cancel, blur = cancel; a PUT fires only when the
  // value actually changed (2026-10-06 critique remediation).
  const commitEdit = async (id: number) => {
    const original = taxonomyList.find(t => t.id === id);
    const name = editName.trim();
    if (!original || !name || name === original.name) {
      cancelEdit();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await api.put(`/api/taxonomy/${id}`, { name });
      cancelEdit();
      setNotice('Nama taksonomi berhasil diperbarui.');
      await fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        fail(e.response.data?.detail || 'Gagal memperbarui taksonomi', () => commitEdit(id));
      } else {
        console.error(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (tax: Taxonomy) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.put(`/api/taxonomy/${tax.id}`, { is_active: !tax.is_active });
      setNotice(tax.is_active ? 'Taksonomi dinonaktifkan.' : 'Taksonomi diaktifkan kembali.');
      await fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        fail(e.response.data?.detail || 'Gagal mengubah status taksonomi', () => handleToggleActive(tax));
      } else {
        console.error(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (tax: Taxonomy) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/api/taxonomy/${tax.id}`);
      setChoice(null);
      setNotice('Taksonomi berhasil dihapus.');
      await fetchTaxonomy();
    } catch (e) {
      if (isHttpError(e)) {
        fail(e.response.data?.detail || 'Gagal menghapus taksonomi', () => handleDelete(tax));
      } else {
        console.error(e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-view">
      <div className="tax-head">
        <div>
          <h2 className="tax-title">Manajemen Taksonomi Dokumen</h2>
          <p className="tax-subtitle">Kelola jenis dan sub-jenis dokumen yang tersedia di sistem.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setAdding(!adding); setNewName(''); }}
          disabled={busy}
        >
          {adding ? <XCircle size={16} /> : <Plus size={16} />}
          {adding ? 'Batal' : 'Tambah Taksonomi'}
        </button>
      </div>

      {adding && (
        <form
          className="tax-add-row"
          onSubmit={e => { e.preventDefault(); handleAdd(); }}
        >
          <div className="tax-field">
            <label htmlFor="tax-new-name">Nama Jenis Dokumen</label>
            <input
              id="tax-new-name"
              className="tax-input"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Contoh: Peraturan Direksi"
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>
            Simpan
          </button>
        </form>
      )}

      {error && (
        <div className="tax-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          {retry && (
            <button type="button" className="btn btn-secondary tax-retry" onClick={() => retry && retry()} disabled={busy}>
              Coba lagi
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="tax-notice" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      <div className="compliance-table-wrap">
        <table className="compliance-table tax-table">
          <thead>
            <tr>
              <th scope="col">Nama Jenis Dokumen</th>
              <th scope="col">Status</th>
              <th scope="col" className="tax-col-actions">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="tax-cell-center">
                  <LoadingOrb size={32} label="Memuat taksonomi..." />
                </td>
              </tr>
            ) : taxonomyList.length === 0 ? (
              <tr>
                <td colSpan={3} className="tax-cell-center">Belum ada data taksonomi</td>
              </tr>
            ) : taxonomyList.map(tax => (
              <tr key={tax.id} className={tax.is_active ? undefined : 'tax-row-inactive'}>
                <td>
                  {editingId === tax.id ? (
                    <input
                      className="tax-input tax-input--inline"
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={cancelEdit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(tax.id); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                      }}
                      autoFocus
                      aria-label={`Ubah nama taksonomi ${tax.name}`}
                    />
                  ) : (
                    <span className="tax-name">{tax.name}</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className={`status-chip tax-chip ${tax.is_active ? 'status-chip--success' : 'status-chip--neutral'}`}
                    role="switch"
                    aria-checked={tax.is_active}
                    title={tax.is_active ? 'Klik untuk menonaktifkan' : 'Klik untuk mengaktifkan'}
                    onClick={() => handleToggleActive(tax)}
                    disabled={busy}
                  >
                    {tax.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {tax.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </td>
                <td className="tax-cell-actions">
                  <button
                    type="button"
                    className="tax-icon-btn"
                    title="Ubah Nama"
                    aria-label={`Ubah nama ${tax.name}`}
                    onClick={() => startEdit(tax)}
                    disabled={busy}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="tax-icon-btn tax-icon-btn--danger"
                    title="Hapus atau nonaktifkan"
                    aria-label={`Hapus atau nonaktifkan ${tax.name}`}
                    onClick={() => setChoice(tax)}
                    disabled={busy}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {choice && (
        <ChoiceDialog
          tax={choice}
          busy={busy}
          onCancel={() => setChoice(null)}
          onDeactivate={() => { const t = choice; setChoice(null); handleToggleActive(t); }}
          onDelete={() => handleDelete(choice)}
        />
      )}
    </div>
  );
}
