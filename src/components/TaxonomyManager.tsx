import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useDialogA11y } from '../hooks/useDialogA11y';
import LoadingOrb from './LoadingOrb';

interface Taxonomy {
  id: number;
  name: string;
  is_active: boolean;
  usage_count: number;
  /* Subset of usage docs the Legal Repository shows on its "Dokumen
     Internal" tab (the BE mirrors the repository's sektor split) — drives
     the ?tab= param of the usage link. */
  internal_count: number;
}

/* House network-failure copy (short form of Auth's authErrNetwork banner) —
   every mutation lane surfaces this instead of failing silently to the
   console (2026-10-06 shape pass fold-in, user-approved). */
const NETWORK_ERROR = 'Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.';

/* Error-lane helpers (2026-10-08 harden, critique Riley): FastAPI 422s carry
   an ARRAY of objects in `detail` — rendered as a React child that throws, so
   only a non-empty string detail may reach an error lane; anything else falls
   back to house copy. `retryable` reserves "Coba lagi" for failures a retry
   can actually fix (network, 5xx): deterministic 4xx (duplicate-name 400,
   privilege 403) used to offer a guaranteed-identical failure. */
const errorDetail = (e: unknown, fallback: string): string =>
  isHttpError(e) && typeof e.response.data?.detail === 'string' && e.response.data.detail
    ? e.response.data.detail
    : fallback;

const retryable = (e: unknown): boolean => !isHttpError(e) || e.response.status >= 500;

/** System-consistent choice dialog (mirrors AdminDashboard's ConfirmDialog
    pattern): replaces window.confirm for the destructive delete, and offers
    the reversible deactivate path first (2026-10-06 critique remediation).
    State-aware since the 2026-10-06 clarify pass (critique F1): an
    already-inactive type has nothing to deactivate, so the toggle is dropped
    from the dialog — the Status chip owns re-activation — and title, body,
    and buttons all read the row's real state.
    Hardened 2026-10-06 (critique F2+F5) onto the full ConfirmDialog contract:
    useDialogA11y focus trap, per-action pending state (spinner + "Memproses..."
    + aria-busy), failures rendered inline via .confirm-modal-error so they can
    never hide behind the dialog, and Escape/backdrop blocked mid-mutation. */
const ChoiceDialog = ({
  tax,
  canDelete,
  onClose,
  onDeactivate,
  onDelete,
}: {
  tax: Taxonomy;
  canDelete: boolean;
  onClose: () => void;
  onDeactivate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<'deactivate' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mounted only while open, so `open` is a constant true. While a mutation
  // is in flight Escape gets a no-op handler — the dialog cannot vanish
  // mid-action — and the backdrop mousedown below ignores clicks for the same
  // reason. The hook traps Tab and restores focus to the trigger on unmount.
  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const run = async (which: 'deactivate' | 'delete', action: () => Promise<void>, fallback: string) => {
    setPending(which);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      // Stay open: the user sees why it failed and can retry or cancel — the
      // failure renders inside the dialog, never behind it (critique F2).
      setError(isHttpError(e) ? errorDetail(e, fallback) : NETWORK_ERROR);
    } finally {
      setPending(null);
    }
  };

  const used = tax.usage_count > 0;

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tax-choice-title"
        aria-busy={pending !== null}
        tabIndex={-1}
      >
        <h3 className="confirm-modal-title" id="tax-choice-title">
          {tax.is_active
            ? `Nonaktifkan atau hapus “${tax.name}”?`
            : `Hapus “${tax.name}”?`}
        </h3>
        {/* Post-cascade (2026-10-08 clarify, critique Issue 4 / Question 4):
            delete is the ONLY detaching operation — the privileged path now
            states its real blast radius, including the name-join physics that
            recreating the same name re-attaches the orphaned classifications. */}
        <p className="confirm-modal-body">
          {tax.is_active
            ? used
              ? `${tax.usage_count} dokumen di repositori menggunakan jenis ini. Menonaktifkan menyembunyikannya dari unggahan dan klasifikasi baru tanpa menghapus riwayat, dan dapat dibatalkan kapan saja.`
              : 'Tidak ada dokumen yang menggunakan jenis ini. Menonaktifkan dapat dibatalkan kapan saja.'
            : used
              ? `Jenis ini sudah nonaktif dan tersembunyi dari unggahan serta klasifikasi baru, tetapi ${tax.usage_count} dokumen di repositori masih tercatat menggunakannya.`
              : 'Jenis ini sudah nonaktif dan tidak ada dokumen yang menggunakannya.'}
          {' '}{used && canDelete
            ? `Menghapus menghilangkan jenis ini secara permanen; klasifikasi ${tax.usage_count} dokumen tersebut akan merujuk ke nama yang tidak lagi ada. Membuat ulang jenis dengan nama yang sama akan menghubungkan kembali dokumen-dokumen itu.`
            : 'Menghapus menghilangkan jenis ini secara permanen dari sistem.'}
        </p>
        {!canDelete && (
          <p className="confirm-modal-note">
            {tax.is_active
              ? 'Jenis ini masih digunakan — penghapusan permanen memerlukan admin atau Insinyur TI. Anda tetap dapat menonaktifkannya.'
              : 'Jenis ini masih digunakan — penghapusan permanen memerlukan admin atau Insinyur TI. Jenis ini tetap nonaktif sampai dihapus.'}
          </p>
        )}
        {error && <p className="confirm-modal-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending !== null}>
            Batal
          </button>
          {tax.is_active && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { void run('deactivate', onDeactivate, 'Gagal mengubah status jenis dokumen'); }}
              disabled={pending !== null}
            >
              {pending === 'deactivate' && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
              {pending === 'deactivate' ? 'Memproses...' : 'Nonaktifkan'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { void run('delete', onDelete, 'Gagal menghapus jenis dokumen'); }}
            disabled={pending !== null || !canDelete}
          >
            {pending === 'delete' && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending === 'delete' ? 'Memproses...' : 'Hapus Permanen'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Informational gate for renaming an in-use type (2026-10-06 shape pass;
    flipped 2026-10-08 harden, critique Issue 1 + user decision): the BE now
    CASCADES the rename (`UPDATE regulations SET jenis` in the same
    transaction, taxonomy.py) — documents follow the new name instead of
    detaching, so this dialog is an FYI before a repository-wide change, not
    a disaster warning. The client-side usage_count may be stale; that only
    affects the displayed number, never safety — the server cascades whatever
    exists at commit time. Same dialog contract as ChoiceDialog:
    useDialogA11y trap, pending state, inline failure, retry = click again. */
const RenameDialog = ({
  from,
  to,
  usage,
  onClose,
  onConfirm,
}: {
  from: string;
  to: string;
  usage: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape is a no-op mid-mutation; the hook traps Tab and restores focus to
  // the inline edit input on unmount (the input stays open behind this dialog).
  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      // Stay open: the failure renders inside the dialog, never behind it.
      setError(isHttpError(e)
        ? errorDetail(e, 'Gagal memperbarui jenis dokumen')
        : NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tax-rename-title"
        aria-busy={pending}
        tabIndex={-1}
      >
        <h3 className="confirm-modal-title" id="tax-rename-title">
          Ubah nama “{from}”?
        </h3>
        <p className="confirm-modal-body">
          “{from}” saat ini digunakan oleh {usage} dokumen di repositori. Setelah nama
          diganti menjadi “{to}”, klasifikasi {usage} dokumen tersebut diperbarui
          mengikuti nama baru.
        </p>
        {error && <p className="confirm-modal-error" role="alert">{error}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void run(); }}
            disabled={pending}
          >
            {pending && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending ? 'Memproses...' : 'Ubah Nama'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TaxonomyManager() {
  const { user } = useAuth();
  // Usage-based dual gate (2026-10-06, user decision): admin / insinyur ti may
  // hard-delete in-use types; other writer roles only when usage_count is 0.
  // The BE enforces the same rule on DELETE — this mirrors it for button state.
  const privileged = ['admin', 'insinyur ti', 'dewa'].includes((user?.role || '').toLowerCase());
  // Only sekretaris perusahaan (regular-routes block) and dewa (full union)
  // hold the /repository route (App.tsx) — for admin/insinyur ti a usage link
  // would bounce off their catch-all redirect, so their count stays plain
  // text (2026-10-08 shape pass, critique Issue 5).
  const canBrowseRepository = ['sekretaris perusahaan', 'dewa'].includes((user?.role || '').toLowerCase());
  const [taxonomyList, setTaxonomyList] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  // Two error lanes (2026-10-06 clarify pass, critique F4): mutation failures
  // (add/rename/toggle/delete) surface in the page banner with a retry
  // closure; a failed load renders inside the table body instead, so the
  // "no data" empty state can never contradict a load failure.
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  // Monotonic sequence so two identical notices back-to-back still restart the
  // dismiss timer — a deps list on the string alone skips the re-fire (the
  // "toggle two types within 4s" trap from the critique's reviewer notes).
  const [noticeSeq, setNoticeSeq] = useState(0);

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

  // Rename informational-gate target (critique F3; FYI semantics since the
  // 2026-10-08 BE cascade): set when an in-use type's inline edit commits;
  // the PUT waits for the dialog's confirm.
  const [renameConfirm, setRenameConfirm] = useState<{ id: number; from: string; to: string; usage: number } | null>(null);

  // Focus management (critique F5): useDialogA11y restores focus to the
  // trigger when a dialog closes normally. Mutations that REMOVE the focused
  // element (delete takes the opener row, rename takes the inline input) end
  // with a deliberate landing on the table itself — the dialog's restore is a
  // no-op on the detached node, so the landing survives the unmount — while
  // the role=status notice announces the outcome.
  const tableRef = useRef<HTMLTableElement>(null);
  // Escape from the add form returns focus to its opener (critique §8.4):
  // dismissible surfaces never drop focus to <body>. The opener is the header
  // toggle OR the empty-state CTA — addOriginRef remembers which one
  // (2026-10-08 polish, minor 7: the landing matches the origin).
  const headAddRef = useRef<HTMLButtonElement>(null);
  const emptyAddRef = useRef<HTMLButtonElement>(null);
  const addOriginRef = useRef<'header' | 'empty'>('header');

  // `again` is optional since the 2026-10-08 harden pass: deterministic 4xx
  // failures (duplicate name, privilege) get the banner WITHOUT "Coba lagi" —
  // a retry there is a guaranteed-identical failure (critique Riley dead-end).
  const fail = (message: string, again?: () => void) => {
    setError(message);
    setRetry(again ? () => again : null);
  };

  const notify = (text: string) => {
    setNotice(text);
    setNoticeSeq(s => s + 1);
  };

  // Success confirmations are short positive sentences that dismiss themselves
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice, noticeSeq]);

  const fetchTaxonomy = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/taxonomy');
      setTaxonomyList(res.data.taxonomy);
      setLoadError('');
      // A confirmed-fresh list also retires any stale mutation banner
      setError('');
      setRetry(null);
    } catch (e) {
      setLoadError(isHttpError(e) ? 'Gagal memuat jenis dokumen.' : 'Kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => { await fetchTaxonomy(); })();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await api.post('/api/taxonomy', { name });
      setNewName('');
      setAdding(false);
      // Refetch BEFORE the notice (2026-10-08 polish, minor 1): the table must
      // never briefly contradict its own success banner. The notice names its
      // object (critique Issue 3) — "which one?" is never a question here.
      await fetchTaxonomy();
      notify(`Jenis dokumen “${name}” berhasil ditambahkan.`);
    } catch (e) {
      if (isHttpError(e)) {
        fail(errorDetail(e, 'Gagal menambahkan jenis dokumen'), retryable(e) ? handleAdd : undefined);
      } else {
        console.error(e);
        fail(NETWORK_ERROR, handleAdd);
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

  // Throwable core (same split as toggleActive/deleteTax): the rename dialog
  // runs it under its own pending state with inline failures; commitRename
  // below is the no-dialog lane (page banner + retry). The dialog lanes
  // deliberately bypass the page `busy` lock — the modal blocks all other
  // input while they run; any future NON-modal consumer of these cores must
  // add its own lock (2026-10-08 polish, minor 5: invariant now documented).
  const renameTax = async (id: number, name: string, from: string) => {
    const res = await api.put(`/api/taxonomy/${id}`, { name });
    cancelEdit();
    await fetchTaxonomy();
    // Post-cascade the BE reports how many documents followed the rename —
    // the notice names its object AND its real blast radius (Issue 3).
    const n: number = res.data?.updated_documents ?? 0;
    notify(n > 0
      ? `“${from}” diubah namanya menjadi “${name}” (${n} dokumen mengikuti).`
      : `“${from}” diubah namanya menjadi “${name}”.`);
    // The inline input is gone by now — land focus on the table so keyboard
    // users don't drop to <body> (critique F5 pattern, applied to rename).
    tableRef.current?.focus();
  };

  // The retry closure captures (id, name, from) instead of re-reading editName:
  // clicking "Coba lagi" blurs the input, and blur-cancel used to empty the
  // state the retry depended on — a guaranteed silent no-op (critique F3b).
  const commitRename = async (id: number, name: string, from: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await renameTax(id, name, from);
    } catch (e) {
      if (isHttpError(e)) {
        fail(errorDetail(e, 'Gagal memperbarui jenis dokumen'),
             retryable(e) ? () => commitRename(id, name, from) : undefined);
      } else {
        console.error(e);
        fail(NETWORK_ERROR, () => commitRename(id, name, from));
      }
    } finally {
      setBusy(false);
    }
  };

  // Enter = save, Escape = cancel, blur = cancel (suppressed while the rename
  // dialog is open); a PUT fires only when the value actually changed. An
  // in-use type gates behind the informational dialog first (critique F3a;
  // FYI semantics since the 2026-10-08 BE cascade).
  const commitEdit = async (id: number) => {
    const original = taxonomyList.find(t => t.id === id);
    if (!original) return;
    const name = editName.trim();
    // Whitespace-only is neither a save nor a cancel (2026-10-08 harden,
    // critique Riley): the editor stays open — Escape and blur remain the
    // cancels — so a blank Enter can never look like a swallowed save.
    if (!name) return;
    if (name === original.name) {
      cancelEdit();
      return;
    }
    if (busy) return;
    if (original.usage_count > 0) {
      setRenameConfirm({ id, from: original.name, to: name, usage: original.usage_count });
      return;
    }
    await commitRename(id, name, original.name);
  };

  // Throwable cores: the dialog runs these under its own pending state and
  // renders failures inline (critique F2). The chip wrapper below keeps the
  // page-banner + retry behavior for toggles started outside the dialog.
  const toggleActive = async (tax: Taxonomy) => {
    await api.put(`/api/taxonomy/${tax.id}`, { is_active: !tax.is_active });
    await fetchTaxonomy();
    notify(tax.is_active ? `“${tax.name}” dinonaktifkan.` : `“${tax.name}” diaktifkan kembali.`);
  };

  const deleteTax = async (tax: Taxonomy) => {
    await api.delete(`/api/taxonomy/${tax.id}`);
    await fetchTaxonomy();
    notify(`“${tax.name}” berhasil dihapus.`);
    // The opener row just vanished — land focus on the table; the dialog's
    // opener-restore is a no-op on the detached button (critique F5).
    tableRef.current?.focus();
  };

  const handleToggleActive = async (tax: Taxonomy) => {
    if (busy) return;
    setBusy(true);
    try {
      await toggleActive(tax);
    } catch (e) {
      if (isHttpError(e)) {
        fail(errorDetail(e, 'Gagal mengubah status jenis dokumen'),
             retryable(e) ? () => handleToggleActive(tax) : undefined);
      } else {
        console.error(e);
        fail(NETWORK_ERROR, () => handleToggleActive(tax));
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleAdd = () => { addOriginRef.current = 'header'; setAdding(a => !a); setNewName(''); };
  const openAdd = () => { addOriginRef.current = 'empty'; setAdding(true); setNewName(''); };

  return (
    <div className="admin-view">
      <div className="tax-head">
        <div>
          <h1 className="tax-title">Manajemen Taksonomi Dokumen</h1>
          <p className="tax-subtitle">Kelola jenis dokumen yang tersedia di sistem.</p>
        </div>
        <button
          ref={headAddRef}
          type="button"
          className={`btn ${adding ? 'btn-secondary' : 'btn-primary'}`}
          onClick={toggleAdd}
          disabled={busy}
        >
          {adding ? <XCircle size={16} /> : <Plus size={16} />}
          {adding ? 'Batal' : 'Tambah Jenis Dokumen'}
        </button>
      </div>

      {adding && (
        <form
          className="tax-add-row"
          onSubmit={e => { e.preventDefault(); handleAdd(); }}
          onKeyDown={e => {
            // Escape closes the form like every other dismissible surface
            // (critique §8.4) — on the FORM, not the input, so it still works
            // after focus tabs to "Simpan" (2026-10-08 polish, minor 4).
            // Focus returns to whichever button opened the form (minor 7).
            if (e.key === 'Escape') {
              e.preventDefault();
              setAdding(false);
              setNewName('');
              (addOriginRef.current === 'empty' ? emptyAddRef : headAddRef).current?.focus();
            }
          }}
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
              maxLength={100}
              autoFocus
            />
            {/* maxLength truncates pasted text invisibly (critique §8.3):
                the counter states the budget and turns danger at the cap. */}
            <span className={`tax-charcount${newName.length >= 100 ? ' tax-charcount--max' : ''}`}>
              {newName.length}/100
            </span>
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
        <table
          ref={tableRef}
          className="compliance-table tax-table"
          tabIndex={-1}
          aria-label="Daftar jenis dokumen"
        >
          <thead>
            <tr>
              <th scope="col">Nama Jenis Dokumen</th>
              <th scope="col">Status</th>
              <th scope="col">Digunakan</th>
              <th scope="col" className="tax-col-actions">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="tax-cell-center">
                  <LoadingOrb size={32} label="Memuat jenis dokumen..." />
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={4} className="tax-cell-center">
                  <div className="tax-error" role="alert">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                    <button type="button" className="btn btn-secondary tax-retry" onClick={fetchTaxonomy} disabled={busy}>
                      Coba lagi
                    </button>
                  </div>
                </td>
              </tr>
            ) : taxonomyList.length === 0 ? (
              <tr>
                <td colSpan={4} className="tax-cell-center">
                  <div className="tax-empty-inner">
                    <span>Belum ada jenis dokumen</span>
                    <button ref={emptyAddRef} type="button" className="btn btn-primary" onClick={openAdd}>
                      <Plus size={16} />
                      Tambah Jenis Dokumen
                    </button>
                  </div>
                </td>
              </tr>
            ) : taxonomyList.map(tax => (
              <tr key={tax.id} className={tax.is_active ? undefined : 'tax-row-inactive'}>
                {/* Row-header semantics (2026-10-08 polish, minor 8) —
                    .tax-name-cell styles the th back to td appearance, so
                    the change is a visual no-op. */}
                <th scope="row" className="tax-name-cell">
                  {editingId === tax.id ? (
                    <div>
                      <input
                        className="tax-input tax-input--inline"
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        maxLength={100}
                        onBlur={() => { if (!renameConfirm) cancelEdit(); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(tax.id); }
                          // Escape cancels and lands on the table — the same
                          // deliberate landing as the post-mutation paths
                          // (critique F5 pattern, §8.4 consistency).
                          else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); tableRef.current?.focus(); }
                        }}
                        autoFocus
                        aria-label={`Nama baru untuk ${tax.name}`}
                      />
                      <span className={`tax-charcount${editName.length >= 100 ? ' tax-charcount--max' : ''}`}>
                        {editName.length}/100
                      </span>
                    </div>
                  ) : (
                    <span className="tax-name">{tax.name}</span>
                  )}
                </th>
                <td>
                  <button
                    type="button"
                    className={`status-chip tax-chip ${tax.is_active ? 'status-chip--success' : 'status-chip--neutral'}`}
                    role="switch"
                    aria-checked={tax.is_active}
                    aria-label={`Status ${tax.name}`}
                    data-hint={tax.is_active ? 'Klik untuk menonaktifkan' : 'Klik untuk mengaktifkan'}
                    onClick={() => {
                      // Deactivating an IN-USE type changes upload/classification
                      // behavior repository-wide — it routes through the
                      // ChoiceDialog's consequence copy instead of firing
                      // instantly (2026-10-08 clarify, critique Issue 3): one
                      // mutation, one gate. The accessible name is stable
                      // ("Status X") so the control never renames itself under
                      // a screen reader mid-toggle. Activation and unused-type
                      // deactivation stay one-click.
                      if (tax.is_active && tax.usage_count > 0) setChoice(tax);
                      else void handleToggleActive(tax);
                    }}
                    disabled={busy}
                  >
                    {tax.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {tax.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </td>
                <td>
                  {tax.usage_count > 0 && canBrowseRepository && !tax.name.includes(',') &&
                  (tax.internal_count === 0 || tax.internal_count === tax.usage_count) ? (
                    /* The count becomes evidence (critique Issue 5): a deep
                       link into the repository's jenis filter — ?jenis= is
                       parsed by LegalRepository's initialList on mount, and
                       ?tab= targets the tab whose dokumen actually carry
                       this jenis (the repo splits its list by sektor;
                       internal_count is the BE's mirror of that split).
                       Comma-bearing names keep the text form — the param
                       splits on commas and would arrive as two bogus
                       filters (Review Focus 5) — and so do mixed types
                       (docs spread across both tabs), because neither tab
                       could show the full count the link promises. */
                    <Link
                      className="tax-usage-link"
                      to={`/repository?tab=${tax.internal_count === 0 ? 'regulations' : 'internal'}&jenis=${encodeURIComponent(tax.name)}`}
                      aria-label={`Lihat ${tax.usage_count} dokumen jenis “${tax.name}” di Repositori Legal`}
                    >
                      {tax.usage_count} dokumen
                    </Link>
                  ) : tax.usage_count > 0 ? (
                    `${tax.usage_count} dokumen`
                  ) : (
                    'Belum digunakan'
                  )}
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
                    title={tax.is_active ? 'Hapus atau nonaktifkan' : 'Hapus'}
                    aria-label={tax.is_active ? `Hapus atau nonaktifkan ${tax.name}` : `Hapus ${tax.name}`}
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
          canDelete={privileged || choice.usage_count === 0}
          onClose={() => setChoice(null)}
          onDeactivate={() => toggleActive(choice)}
          onDelete={() => deleteTax(choice)}
        />
      )}

      {renameConfirm && (
        <RenameDialog
          from={renameConfirm.from}
          to={renameConfirm.to}
          usage={renameConfirm.usage}
          onClose={() => setRenameConfirm(null)}
          onConfirm={() => renameTax(renameConfirm.id, renameConfirm.to, renameConfirm.from)}
        />
      )}
    </div>
  );
}
