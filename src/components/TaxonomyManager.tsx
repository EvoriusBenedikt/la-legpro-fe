import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, Loader2, Check, X } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import { useStrings, msg, fill, type Msg, type StringKey } from '../i18n';
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

/* Error-lane helpers (2026-10-08 harden, critique Riley): failures are stored
   as a locale-neutral Msg built by apiErrorMsg (network -> errNetwork, a
   recognized backend detail -> its key, anything else -> the lane's fallback
   key), so the banner re-renders in the active language and raw server text
   (including FastAPI 422 arrays) never reaches the UI. `retryable` reserves
   "Coba lagi" for failures a retry can actually fix (network, 5xx):
   deterministic 4xx (duplicate-name 400, privilege 403) used to offer a
   guaranteed-identical failure. */

/** Pick the One/Other key for n (id has no plural forms; en does). */
const pl = (base: string, n: number, params: Record<string, string | number> = {}): Msg => ({
  key: `${base}${n === 1 ? 'One' : 'Other'}` as StringKey,
  params: { n, ...params },
});

const retryable = (e: unknown): boolean => !isHttpError(e) || e.response.status >= 500;

/* Twin-name defense (2026-10-12, critique Issue 5 — FE-only per user
   decision; the BE normalized unique index was declined): the join and the
   unique constraint are byte-exact, so case/whitespace variants coexist as
   confusing twins. Folded comparison catches them client-side. */
const foldName = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
const findNameConflict = (raw: string, list: Taxonomy[], excludeId?: number | null) => {
  const name = raw.trim();
  if (!name) return null;
  const exact = list.find(t => t.id !== excludeId && t.name === name);
  if (exact) return { kind: 'exact' as const, existing: exact };
  const twin = list.find(t => t.id !== excludeId && foldName(t.name) === foldName(name));
  return twin ? { kind: 'twin' as const, existing: twin } : null;
};

/* Copy (plan step 5): the exact-duplicate message mirrors the BE 400 detail
   word-for-word (a closing period is added for the FE sentence) so the
   client-side block and the server-side block speak with one voice; the
   twin warning names the existing type and never blocks. Returns a Msg so the
   copy follows the active language. */
const conflictCopy = (c: { kind: 'exact' | 'twin'; existing: Taxonomy }): Msg =>
  c.kind === 'exact'
    ? { key: 'errTaxExists' }
    : { key: 'taxConflictTwin', params: { name: c.existing.name } };

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
  showEvidence,
  adminNote,
  onClose,
  onDeactivate,
  onDelete,
}: {
  tax: Taxonomy;
  canDelete: boolean;
  showEvidence: boolean;
  adminNote: boolean;
  onClose: () => void;
  onDeactivate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) => {
  const t = useStrings();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<'deactivate' | 'delete' | null>(null);
  const [error, setError] = useState<Msg | null>(null);
  // Evidence preview (2026-10-12, critique Issue 1): up to 3 sample judul for
  // this jenis, fetched from the repository API when the dialog opens for a
  // role the parent gates in (insinyur ti). A fetch failure degrades to a
  // message and the dialog stays functional; the copy says "contoh" and never
  // claims completeness (Review Focus 5).
  const [samples, setSamples] = useState<{ titles: string[]; hidden: number } | null>(null);
  const [samplesFailed, setSamplesFailed] = useState(false);

  useEffect(() => {
    if (!showEvidence) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/repository');
        const docs = (res.data?.documents ?? []).filter(
          (d: { jenis?: string }) => d.jenis === tax.name,
        );
        const titles: string[] = [];
        for (const d of docs) {
          const j = ((d as { judul?: string }).judul ?? '').trim();
          if (!j) continue;
          titles.push(j.length > 60 ? `${j.slice(0, 57)}…` : j);
          if (titles.length === 3) break;
        }
        if (!cancelled) setSamples({ titles, hidden: docs.length - titles.length });
      } catch {
        if (!cancelled) setSamplesFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [showEvidence, tax.name]);

  // Mounted only while open, so `open` is a constant true. While a mutation
  // is in flight Escape gets a no-op handler — the dialog cannot vanish
  // mid-action — and the backdrop mousedown below ignores clicks for the same
  // reason. The hook traps Tab and restores focus to the trigger on unmount.
  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const run = async (which: 'deactivate' | 'delete', action: () => Promise<void>, fallback: StringKey) => {
    if (pending) return;
    setPending(which);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      // Stay open: the user sees why it failed and can retry or cancel — the
      // failure renders inside the dialog, never behind it (critique F2).
      setError(apiErrorMsg(e, fallback));
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
            ? fill(t.taxChoiceTitleActive, { name: tax.name })
            : fill(t.taxChoiceTitleInactive, { name: tax.name })}
        </h3>
        {/* Post-cascade (2026-10-08 clarify, critique Issue 4 / Question 4):
            delete is the ONLY detaching operation — the privileged path now
            states its real blast radius, including the name-join physics that
            recreating the same name re-attaches the orphaned classifications. */}
        <p className="confirm-modal-body">
          {tax.is_active
            ? used
              ? msg(t, pl('taxBodyActiveUsed', tax.usage_count))
              : t.taxBodyActiveUnused
            : used
              ? msg(t, pl('taxBodyInactiveUsed', tax.usage_count))
              : t.taxBodyInactiveUnused}
          {' '}{used && canDelete
            ? msg(t, pl('taxDeleteUsed', tax.usage_count))
            : t.taxDeleteUnused}
        </p>
        {/* Evidence preview (2026-10-12, critique Issue 1) — grammar reuse:
            confirm-modal-note, no new CSS. Never claims completeness. */}
        {showEvidence && samples === null && !samplesFailed && (
          <p className="confirm-modal-note">{t.taxSamplesLoading}</p>
        )}
        {showEvidence && samplesFailed && (
          <p className="confirm-modal-note">{t.taxSamplesFail}</p>
        )}
        {showEvidence && samples !== null && samples.titles.length === 0 && (
          <p className="confirm-modal-note">{t.taxSamplesNone}</p>
        )}
        {showEvidence && samples !== null && samples.titles.length > 0 && (
          <p className="confirm-modal-note">
            {samples.hidden > 0
              ? fill(t.taxSamplesMore, { titles: samples.titles.map(title => `“${title}”`).join(', '), n: samples.hidden })
              : fill(t.taxSamples, { titles: samples.titles.map(title => `“${title}”`).join(', ') })}
          </p>
        )}
        {adminNote && (
          <p className="confirm-modal-note">{t.taxAdminNote}</p>
        )}
        {!canDelete && (
          <p className="confirm-modal-note">
            {tax.is_active ? t.taxNoDeleteActive : t.taxNoDeleteInactive}
          </p>
        )}
        {error && <p className="confirm-modal-error" role="alert">{msg(t, error)}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => { if (!pending) onClose(); }} aria-disabled={pending !== null || undefined}>
            {t.taxCancel}
          </button>
          {tax.is_active && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { void run('deactivate', onDeactivate, 'taxFailChange'); }}
              aria-disabled={pending !== null || undefined}
            >
              {pending === 'deactivate' && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
              {pending === 'deactivate' ? t.taxWorking : t.taxDeactivate}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { void run('delete', onDelete, 'taxFailDelete'); }}
            disabled={!canDelete}
            aria-disabled={pending !== null || undefined}
          >
            {pending === 'delete' && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending === 'delete' ? t.taxWorking : t.taxDeletePerm}
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
  const t = useStrings();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Msg | null>(null);

  // Escape is a no-op mid-mutation; the hook traps Tab and restores focus to
  // the inline edit input on unmount (the input stays open behind this dialog).
  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const run = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      // Stay open: the failure renders inside the dialog, never behind it.
      setError(apiErrorMsg(e, 'taxFailUpdate'));
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
          {fill(t.taxRenameTitle, { from })}
        </h3>
        <p className="confirm-modal-body">
          {msg(t, pl('taxRenameBody', usage, { from, to }))}
        </p>
        {error && <p className="confirm-modal-error" role="alert">{msg(t, error)}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => { if (!pending) onClose(); }} aria-disabled={pending || undefined}>
            {t.taxCancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void run(); }}
            aria-disabled={pending || undefined}
          >
            {pending && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending ? t.taxWorking : t.taxRenameBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TaxonomyManager() {
  const t = useStrings();
  const { user } = useAuth();
  const roleLower = (user?.role || '').toLowerCase();
  // Usage-based dual gate (2026-10-06, user decision): admin / insinyur ti may
  // hard-delete in-use types; other writer roles only when usage_count is 0.
  // The BE enforces the same rule on DELETE — this mirrors it for button state.
  const privileged = ['admin', 'insinyur ti', 'dewa'].includes(roleLower);
  // Only sekretaris perusahaan (regular-routes block) and dewa (full union)
  // hold the /repository route (App.tsx) — for admin/insinyur ti a usage link
  // would bounce off their catch-all redirect, so their count stays plain
  // text (2026-10-08 shape pass, critique Issue 5).
  const canBrowseRepository = ['sekretaris perusahaan', 'dewa'].includes(roleLower);
  // Evidence preview (2026-10-12, critique Issue 1): FR-24 bars admin from the
  // repository API, so the in-dialog sample preview serves insinyur ti — the
  // only privileged role that is API-allowed yet lacks the /repository deep
  // link (dewa + sekretaris keep the link); admin gets the FR-24 explanation
  // note instead. The preview copy says "contoh" and never claims completeness
  // (the role's klasifikasi filter may hide documents — Review Focus 5).
  const evidencePreview = roleLower === 'insinyur ti';
  const adminRepoBlocked = roleLower === 'admin';
  const [taxonomyList, setTaxonomyList] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  // Two error lanes (2026-10-06 clarify pass, critique F4): mutation failures
  // (add/rename/toggle/delete) surface in the page banner with a retry
  // closure; a failed load renders inside the table body instead, so the
  // "no data" empty state can never contradict a load failure.
  const [error, setError] = useState<Msg | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [loadError, setLoadError] = useState<Msg | null>(null);
  const [notice, setNotice] = useState<Msg | null>(null);
  // Monotonic sequence so two identical notices back-to-back still restart the
  // dismiss timer — a deps list on the string alone skips the re-fire (the
  // "toggle two types within 4s" trap from the critique's reviewer notes).
  const [noticeSeq, setNoticeSeq] = useState(0);
  // Undo-on-delete (2026-10-12, critique Issue 2): the full deleted row, held
  // so the delete notice can offer "Urungkan" — a re-POST of {name, is_active}
  // is a COMPLETE recovery because regulation classification joins on the name
  // (id churn irrelevant). Retires when any newer notice replaces it.
  const [undoTarget, setUndoTarget] = useState<Taxonomy | null>(null);

  // States for Adding
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // States for Editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // In-flight lock for every mutation (double-submit guard). Since the
  // 2026-10-12 audit pass (critique Issue 3) the lock is a SCOPED pending
  // state: `busy` stays the derived any-mutation flag for guards, while
  // kind/id drive the acting-control spinner and keep the control focusable —
  // native disabled on the clicked element drops focus to <body> and punches
  // a hole in the dialog Tab trap. Doctrine: native `disabled` = steady-state
  // conditions (empty input, exact duplicate, unprivileged delete);
  // `aria-disabled` + handler guard = transient in-flight lock.
  const [pending, setPending] = useState<{ kind: 'add' | 'rename' | 'toggle' | 'undo'; id?: number } | null>(null);
  const busy = pending !== null;

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
  // `() => again` is the REQUIRED React idiom for storing a function in state:
  // a function passed to a setter is consumed as an UPDATER, so React calls
  // `(() => again)(prev)` and stores `again` itself. A bare `setRetry(again)`
  // would instead INVOKE `again` during the update (spurious retry) and store
  // its Promise result as state. The 2026-10-12 review's "inert retry" finding
  // was a static misread of this idiom — disproved live 2026-10-13 (network
  // probe: the retry click fired the real PUT end-to-end). Do not "simplify".
  const fail = (message: Msg, again?: () => void) => {
    setError(message);
    setRetry(again ? () => again : null);
  };

  const notify = (text: Msg) => {
    setNotice(text);
    // Any newer notice retires a pending undo (single-notice grammar).
    setUndoTarget(null);
    setNoticeSeq(s => s + 1);
  };

  // The delete notice is the only lane that carries an undo affordance: it
  // persists until dismissed (timer exemption below) and offers the re-POST
  // of the deleted row (2026-10-12, critique Issue 2).
  const notifyDelete = (text: Msg, tax: Taxonomy) => {
    setNotice(text);
    setUndoTarget(tax);
    setNoticeSeq(s => s + 1);
  };

  // Success confirmations are short positive sentences that dismiss themselves —
  // EXCEPT the delete notice while it carries "Urungkan": an undo affordance
  // must not die on a 4-second timer (2026-10-12, critique Issue 2), so that
  // notice persists until dismissed or replaced.
  useEffect(() => {
    if (!notice || undoTarget) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice, noticeSeq, undoTarget]);

  const fetchTaxonomy = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/taxonomy');
      setTaxonomyList(res.data.taxonomy);
      setLoadError(null);
      // A confirmed-fresh list also retires any stale mutation banner
      setError(null);
      setRetry(null);
    } catch (e) {
      setLoadError(apiErrorMsg(e, 'taxLoadFail'));
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
    // Exact duplicate = deterministic BE 400: Simpan is native-disabled and
    // the visible message explains why; this closes the Enter-submit path
    // (the server stays the authority).
    if (findNameConflict(name, taxonomyList)?.kind === 'exact') return;
    setPending({ kind: 'add' });
    try {
      await api.post('/api/taxonomy', { name });
      setNewName('');
      setAdding(false);
      // Refetch BEFORE the notice (2026-10-08 polish, minor 1): the table must
      // never briefly contradict its own success banner. The notice names its
      // object (critique Issue 3) — "which one?" is never a question here.
      await fetchTaxonomy();
      notify({ key: 'taxNoticeAdded', params: { name } });
    } catch (e) {
      if (isHttpError(e)) {
        fail(apiErrorMsg(e, 'taxFailAdd'), retryable(e) ? handleAdd : undefined);
      } else {
        console.error(e);
        fail(apiErrorMsg(e, 'taxFailAdd'), handleAdd);
      }
    } finally {
      setPending(null);
    }
  };

  // Live name checks (2026-10-12 harden, critique Issue 5): computed on the
  // full in-memory list — no per-keystroke round trip (H7's complaint). The
  // Task-4 single-editor invariant gives activeConflict exactly one source.
  const addConflict = findNameConflict(newName, taxonomyList);
  const editConflict = editingId !== null ? findNameConflict(editName, taxonomyList, editingId) : null;
  const activeConflict = editingId !== null ? editConflict : addConflict;

  const startEdit = (tax: Taxonomy) => {
    // Exactly one editor surface at a time (2026-10-12 clarify, critique
    // Issue 4): blur no longer cancels, so opening one editor must close the
    // other — the add form yields to the row editor.
    setAdding(false);
    setNewName('');
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
      ? { key: 'taxNoticeRenamedDocs', params: { from, to: name, n } }
      : { key: 'taxNoticeRenamed', params: { from, to: name } });
    // The inline input is gone by now — land focus on the table so keyboard
    // users don't drop to <body> (critique F5 pattern, applied to rename).
    tableRef.current?.focus();
  };

  // The retry closure captures (id, name, from) instead of re-reading editName:
  // clicking "Coba lagi" blurs the input, and blur-cancel used to empty the
  // state the retry depended on — a guaranteed silent no-op (critique F3b).
  const commitRename = async (id: number, name: string, from: string) => {
    if (busy) return;
    setPending({ kind: 'rename', id });
    try {
      await renameTax(id, name, from);
    } catch (e) {
      if (isHttpError(e)) {
        fail(apiErrorMsg(e, 'taxFailUpdate'),
             retryable(e) ? () => commitRename(id, name, from) : undefined);
      } else {
        console.error(e);
        fail(apiErrorMsg(e, 'taxFailUpdate'), () => commitRename(id, name, from));
      }
    } finally {
      setPending(null);
    }
  };

  // Enter = save, Escape = cancel — blur PRESERVES the draft (2026-10-12
  // clarify, critique Issue 4: the destructive blur destroyed uncommitted
  // work); the ✓/✕ tiles are the visible contract, Enter/Esc the
  // accelerators. A PUT fires only when the value actually changed. An
  // in-use type gates behind the informational dialog first (critique F3a;
  // FYI semantics since the 2026-10-08 BE cascade).
  const commitEdit = async (id: number) => {
    const original = taxonomyList.find(row => row.id === id);
    if (!original) return;
    const name = editName.trim();
    // Whitespace-only is neither a save nor a cancel (2026-10-08 harden,
    // critique Riley): the editor stays open — Escape and the ✕ tile remain
    // the cancels — so a blank Enter can never look like a swallowed save.
    if (!name) return;
    if (name === original.name) {
      cancelEdit();
      return;
    }
    // Exact duplicate = deterministic BE 400 — the visible message under the
    // editor already explains it; twins never block (2026-10-12 user
    // decision).
    if (findNameConflict(name, taxonomyList, id)?.kind === 'exact') return;
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
    notify({ key: tax.is_active ? 'taxNoticeDeactivated' : 'taxNoticeReactivated', params: { name: tax.name } });
    // The refetch's loading re-render unmounts the acting chip — without a
    // deliberate landing, focus falls to <body> (2026-10-12 audit, critique
    // Issue 3). The <table> survives the loading state; same doctrine as the
    // rename/delete lanes. Covers the chip lane AND the dialog deactivate lane.
    tableRef.current?.focus();
  };

  const deleteTax = async (tax: Taxonomy) => {
    await api.delete(`/api/taxonomy/${tax.id}`);
    await fetchTaxonomy();
    notifyDelete({ key: 'taxNoticeDeleted', params: { name: tax.name } }, tax);
    // The opener row just vanished — land focus on the table; the dialog's
    // opener-restore is a no-op on the detached button (critique F5).
    tableRef.current?.focus();
  };

  // Undo lane (2026-10-12, critique Issue 2): a re-POST of the deleted row.
  // The recovery is faithful — the name is the join key for regulation
  // classification, and POST accepts the deleted row's is_active, so an
  // inactive type comes back inactive. If the name was re-taken meanwhile the
  // POST 400s deterministically (no "Coba lagi") — and the documents are
  // already re-attached to the existing name, so no data-loss path remains.
  const restoreTax = async (tax: Taxonomy) => {
    await api.post('/api/taxonomy', { name: tax.name, is_active: tax.is_active });
    await fetchTaxonomy();
    notify({ key: 'taxNoticeRestored', params: { name: tax.name } });
  };

  const handleUndo = async () => {
    if (busy || !undoTarget) return;
    const tax = undoTarget;
    setPending({ kind: 'undo' });
    try {
      await restoreTax(tax);
    } catch (e) {
      if (isHttpError(e)) {
        fail(apiErrorMsg(e, 'taxFailRestore'),
             retryable(e) ? handleUndo : undefined);
      } else {
        console.error(e);
        fail(apiErrorMsg(e, 'taxFailRestore'), handleUndo);
      }
    } finally {
      setPending(null);
    }
  };

  const handleToggleActive = async (tax: Taxonomy) => {
    if (busy) return;
    setPending({ kind: 'toggle', id: tax.id });
    try {
      await toggleActive(tax);
    } catch (e) {
      if (isHttpError(e)) {
        fail(apiErrorMsg(e, 'taxFailChange'),
             retryable(e) ? () => handleToggleActive(tax) : undefined);
      } else {
        console.error(e);
        fail(apiErrorMsg(e, 'taxFailChange'), () => handleToggleActive(tax));
      }
    } finally {
      setPending(null);
    }
  };

  const toggleAdd = () => { cancelEdit(); addOriginRef.current = 'header'; setAdding(a => !a); setNewName(''); };
  const openAdd = () => { cancelEdit(); addOriginRef.current = 'empty'; setAdding(true); setNewName(''); };

  return (
    <div className="admin-view">
      <div className="tax-head">
        <div>
          <h1 className="tax-title">{t.taxTitle}</h1>
          <p className="tax-subtitle">{t.taxSubtitle}</p>
        </div>
        <button
          ref={headAddRef}
          type="button"
          className={`btn ${adding ? 'btn-secondary' : 'btn-primary'}`}
          onClick={toggleAdd}
          aria-disabled={busy || undefined}
        >
          {adding ? <XCircle size={16} /> : <Plus size={16} />}
          {adding ? t.taxCancel : t.taxAddBtn}
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
            <label htmlFor="tax-new-name">{t.taxNameLabel}</label>
            <input
              id="tax-new-name"
              className="tax-input"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t.taxNamePh}
              maxLength={100}
              autoFocus
              aria-describedby={addConflict ? 'tax-add-conflict' : undefined}
            />
            {/* maxLength truncates pasted text invisibly (critique §8.3):
                the counter states the budget and turns danger at the cap. */}
            <span className={`tax-charcount${newName.length >= 100 ? ' tax-charcount--max' : ''}`}>
              {newName.length}/100
            </span>
            {/* Live name check (2026-10-12 harden, critique Issue 5): exact
                duplicates block (danger tone, BE 400 wording, Simpan
                native-disabled); case/whitespace twins warn in warning tones
                and never block (user decision). */}
            {addConflict && (
              <p
                id="tax-add-conflict"
                className={`tax-conflict${addConflict.kind === 'exact' ? ' tax-conflict--exact' : ''}`}
              >
                {msg(t, conflictCopy(addConflict))}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newName.trim() || addConflict?.kind === 'exact'}
            aria-disabled={busy || undefined}
          >
            {pending?.kind === 'add' && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
            {pending?.kind === 'add' ? t.taxWorking : t.taxSave}
          </button>
        </form>
      )}

      {error && (
        <div className="tax-error" role="alert">
          <AlertCircle size={18} />
          <span>{msg(t, error)}</span>
          {retry && (
            <button type="button" className="btn btn-secondary tax-retry" onClick={() => { if (busy) return; retry?.(); }} aria-disabled={busy || undefined}>
              {t.taxRetry}
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="tax-notice" role="status">
          <CheckCircle2 size={18} />
          <span>{msg(t, notice)}</span>
          {undoTarget && (
            <>
              {/* Undo-on-delete (2026-10-12, critique Issue 2): the re-POST of
                  the deleted row — a complete recovery because classification
                  joins on the name. Task 3 migration done: aria-disabled +
                  handleUndo's busy guard + acting-control spinner. */}
              <button
                type="button"
                className="btn btn-secondary tax-undo"
                onClick={() => { void handleUndo(); }}
                aria-disabled={busy || undefined}
              >
                {pending?.kind === 'undo' && <Loader2 size={14} className="admin-spin" aria-hidden="true" />}
                {pending?.kind === 'undo' ? t.taxWorking : t.taxUndo}
              </button>
              {/* Clears the notice only — undoTarget survives so the banner's
                  "Coba lagi" (handleUndo) keeps the restore lane available
                  after a failed restore whose notice was dismissed. NOTE: the
                  setRetry(() => again) idiom in fail() stores the retry
                  closure correctly (React updater semantics; live-proven
                  2026-10-13) — the 2026-10-12 "KNOWN INHERITED DEFECT: inert
                  retry" note that stood here was a false static finding,
                  disproved by the live RED probe and replaced with this
                  correction the same day. */}
              <button
                type="button"
                className="tax-notice-close"
                onClick={() => setNotice(null)}
                aria-label={t.taxCloseNotice}
              >
                <XCircle size={16} />
              </button>
            </>
          )}
        </div>
      )}

      <div className="compliance-table-wrap">
        <table
          ref={tableRef}
          className="compliance-table tax-table"
          tabIndex={-1}
          aria-label={t.taxTableAria}
        >
          <thead>
            <tr>
              <th scope="col">{t.taxNameLabel}</th>
              <th scope="col">{t.taxColStatus}</th>
              <th scope="col">{t.taxColUsed}</th>
              <th scope="col" className="tax-col-actions">{t.taxColActions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="tax-cell-center">
                  <LoadingOrb size={32} label={t.taxLoading} />
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={4} className="tax-cell-center">
                  <div className="tax-error" role="alert">
                    <AlertCircle size={18} />
                    <span>{msg(t, loadError)}</span>
                    <button type="button" className="btn btn-secondary tax-retry" onClick={() => { if (!busy) void fetchTaxonomy(); }} aria-disabled={busy || undefined}>
                      {t.taxRetry}
                    </button>
                  </div>
                </td>
              </tr>
            ) : taxonomyList.length === 0 ? (
              <tr>
                <td colSpan={4} className="tax-cell-center">
                  <div className="tax-empty-inner">
                    <span>{t.taxEmpty}</span>
                    <button ref={emptyAddRef} type="button" className="btn btn-primary" onClick={openAdd}>
                      <Plus size={16} />
                      {t.taxAddBtn}
                    </button>
                  </div>
                </td>
              </tr>
            ) : taxonomyList.map(tax => (
              <tr
                key={tax.id}
                className={
                  [
                    !tax.is_active ? 'tax-row-inactive' : '',
                    // The counterparty row of a live name conflict lights up
                    // (2026-10-12 harden, critique Issue 5): the draft's
                    // clash target becomes visible in the table itself.
                    activeConflict?.existing.id === tax.id
                      ? `tax-row-conflict${activeConflict.kind === 'exact' ? ' tax-row-conflict--exact' : ''}`
                      : '',
                  ].filter(Boolean).join(' ') || undefined
                }
              >
                {/* Row-header semantics (2026-10-08 polish, minor 8) —
                    .tax-name-cell styles the th back to td appearance, so
                    the change is a visual no-op. */}
                <th scope="row" className="tax-name-cell">
                  {editingId === tax.id ? (
                    <div>
                      {/* Visible contract (2026-10-12 clarify, critique Issue
                          4): the ✓/✕ tiles make save/cancel discoverable —
                          Enter/Esc stay as accelerators. Blur no longer
                          cancels: clicking away preserves the draft (the
                          destructive blur was the issue's core complaint;
                          the renameConfirm suppression died with it). */}
                      <div className="tax-edit-box">
                        <input
                          className="tax-input tax-input--inline"
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          maxLength={100}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(tax.id); }
                            // Escape cancels and lands on the table — the same
                            // deliberate landing as the post-mutation paths
                            // (critique F5 pattern, §8.4 consistency).
                            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); tableRef.current?.focus(); }
                          }}
                          autoFocus
                          aria-label={fill(t.taxEditAria, { name: tax.name })}
                          aria-describedby={editConflict ? 'tax-edit-conflict' : undefined}
                        />
                        <button
                          type="button"
                          className="tax-icon-btn"
                          aria-label={fill(t.taxSaveAria, { name: tax.name })}
                          onClick={() => { void commitEdit(tax.id); }}
                          aria-disabled={(pending?.kind === 'rename' && pending.id === tax.id) || undefined}
                        >
                          {pending?.kind === 'rename' && pending.id === tax.id
                            ? <Loader2 size={16} className="admin-spin" aria-hidden="true" />
                            : <Check size={16} />}
                        </button>
                        <button
                          type="button"
                          className="tax-icon-btn"
                          aria-label={fill(t.taxCancelEditAria, { name: tax.name })}
                          onClick={() => { cancelEdit(); tableRef.current?.focus(); }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <span className={`tax-charcount${editName.length >= 100 ? ' tax-charcount--max' : ''}`}>
                        {editName.length}/100
                      </span>
                      {editConflict && (
                        <p
                          id="tax-edit-conflict"
                          className={`tax-conflict${editConflict.kind === 'exact' ? ' tax-conflict--exact' : ''}`}
                        >
                          {msg(t, conflictCopy(editConflict))}
                        </p>
                      )}
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
                    aria-label={fill(t.taxStatusAria, { name: tax.name })}
                    data-hint={tax.is_active ? t.taxHintDeactivate : t.taxHintActivate}
                    onClick={() => {
                      if (busy) return;
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
                    aria-disabled={busy || undefined}
                  >
                    {/* Acting-control spinner (2026-10-12 audit, critique
                        Issue 3): the toggling chip swaps its state icon for
                        the house spinner — the label (accessible name) never
                        shifts mid-toggle. Settles the H1 residual "chip toggle
                        has no in-flight indicator". */}
                    {pending?.kind === 'toggle' && pending.id === tax.id
                      ? <Loader2 size={12} className="admin-spin" aria-hidden="true" />
                      : tax.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {tax.is_active ? t.taxActive : t.taxInactive}
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
                      aria-label={msg(t, pl('taxUsageLinkAria', tax.usage_count, { name: tax.name }))}
                    >
                      {msg(t, pl('taxUsageCount', tax.usage_count))}
                    </Link>
                  ) : tax.usage_count > 0 ? (
                    msg(t, pl('taxUsageCount', tax.usage_count))
                  ) : (
                    t.taxUnused
                  )}
                </td>
                <td className="tax-cell-actions">
                  <button
                    type="button"
                    className="tax-icon-btn"
                    title={t.taxRenameBtn}
                    aria-label={fill(t.taxRenameAria, { name: tax.name })}
                    onClick={() => startEdit(tax)}
                    aria-disabled={busy || undefined}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="tax-icon-btn tax-icon-btn--danger"
                    title={tax.is_active ? t.taxDeleteOrDeactTitle : t.taxDeleteTitle}
                    aria-label={fill(tax.is_active ? t.taxDeleteOrDeactAria : t.taxDeleteAria, { name: tax.name })}
                    onClick={() => { if (!busy) setChoice(tax); }}
                    aria-disabled={busy || undefined}
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
          showEvidence={evidencePreview && choice.usage_count > 0}
          adminNote={adminRepoBlocked && choice.usage_count > 0}
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
