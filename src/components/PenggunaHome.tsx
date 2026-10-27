import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowUp, Calendar, Files, FolderOpen, Grid2X2,
  Inbox, List, MoreVertical, Plus, RefreshCw, Sparkles, Trash2,
} from 'lucide-react';
import PenggunaShell from './PenggunaShell';
import LoadingOrb from './LoadingOrb';
import { useContractUpload } from '../hooks/useContractUpload';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useStrings, fill, msg, LocalizedError, type Msg } from '../i18n';
import { useDateFormatters } from '../format';
import api from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import './PenggunaHome.css';

/* FEAT phase-1 (2026-10-23, phase-2 2026-10-24): pengguna-only home page
   matching the approved Notebookly reference — a large serif-accent hero,
   gradient-cover featured cards and the grid/list library below, mounted
   inside the shared standalone PenggunaShell (App.tsx routes it outside
   the classic sidebar shell, only for role pengguna). Data is real: the
   same /api/compliance-history Contract Monitor consumes (id, filename,
   company_name, expiration_date, created_at — no clause counts, so cards
   show the expiry status instead of a source count). Decorative cover art
   (gradient + arcs + glyph) is derived deterministically from the row id.
   All tokens are production (tokens.css), so both themes hold with no
   per-theme overrides. */

interface ComplianceHistoryRow {
  id: string;
  filename: string;
  company_name: string | null;
  expiration_date: string | null;
  created_at: string;
}

/* Notebook-level row (GET /compliance-history/notebooks): the root document
   plus how many documents the notebook holds (migration 014 grouping). */
interface NotebookRow extends ComplianceHistoryRow {
  document_count: number;
  /* Latest document's created_at in the notebook — "date modified" (the
     last time a document was added). Falls back to created_at for old rows. */
  modified_at: string | null;
}

/* Cover art palette (port of the prototype's cover-* gradients). */
const COVERS = [
  { cls: 'cover-indigo', glyph: '⇄' },
  { cls: 'cover-coral', glyph: '◈' },
  { cls: 'cover-forest', glyph: '⌁' },
  { cls: 'cover-sand', glyph: '▦' },
  { cls: 'cover-violet', glyph: '◒' },
  { cls: 'cover-teal', glyph: '◇' },
] as const;

function coverFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return COVERS[Math.abs(hash) % COVERS.length];
}

/* Menu semantics promise arrow navigation (copied from LegalOpinion's
   shared handler): wraps at both ends, Home/End jump. The card menu and
   the delete dialog focus their first item on open so the arrows are
   discoverable. */
function handleMenuKeys(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      'button[role="menuitem"], button[role="menuitemradio"]'
    )
  );
  if (items.length === 0) return;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? items.length - 1
        : e.key === 'ArrowDown'
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
  e.preventDefault();
  items[next].focus();
}

/* Danger confirmation for card → menu → delete, mirroring ContractMonitor's
   local ConfirmDialog: names the workspace that dies, failure inline with
   retry, Escape/overlay close, focus restored via useDialogA11y. */
interface ConfirmState {
  title: Msg;
  body: Msg;
  confirmLabel: Msg;
  onConfirm: () => Promise<void>;
}

const ConfirmDialog = ({ state, onClose }: { state: ConfirmState; onClose: () => void }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  const t = useStrings();

  useDialogA11y(true, pending ? () => undefined : onClose, dialogRef);

  const runConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await state.onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof LocalizedError ? err.msg : { key: 'errUnexpected' });
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
        aria-labelledby="ph-confirm-title"
        aria-busy={pending}
        tabIndex={-1}
      >
        <h3 className="confirm-modal-title" id="ph-confirm-title">{msg(t, state.title)}</h3>
        <p className="confirm-modal-body">{msg(t, state.body)}</p>
        {error && <p className="confirm-modal-error" role="alert">{msg(t, error)}</p>}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {t.cmCancel}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { void runConfirm(); }}
            disabled={pending}
          >
            {pending ? t.cmWorking : msg(t, state.confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function PenggunaHome() {
  const t = useStrings();
  const { formatDate, formatNumber } = useDateFormatters();
  const { subscribe, notify } = useContractUpload();
  const [documents, setDocuments] = useState<NotebookRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Msg | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  /* List view is sortable by date modified; newest first by default. */
  const [modifiedSort, setModifiedSort] = useState<'desc' | 'asc'>('desc');
  /* FEAT (2026-10-27, user: the add button "should just function as adding
     a clean workspace instead of uploading documents"): the hero CTA, the
     mobile dock and the empty-state CTA all mint an EMPTY workspace
     (migration 017: POST /compliance-history/notebooks) and navigate
     straight into it. Uploading then happens INSIDE the workspace page
     ("Analyze first document") — the home page never opens an upload modal.
     Failure: toast (same grammar as the delete flow); success navigates
     away so the component unmounts before the flag would ever need
     resetting. */
  const [creating, setCreating] = useState(false);
  const createWorkspace = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await api.post('/api/compliance-history/notebooks', { name: t.homeNewWsName });
      navigate(`/contracts/${res.data.notebook_id}`);
    } catch (err) {
      notify('error', apiErrorMsg(err, 'homeCreateErr'), 12000);
      setCreating(false);
    }
  };
  /* NotebookLM-style card kebab (2026-10-27): one open menu at a time,
     fixed-positioned via portal (so neighbor cards and any overflow frame
     can never clip it) and anchored to the trigger button's rect. The
     delete action routes through the confirm dialog — the same cascade
     DELETE the Contracts page uses for the notebook's root document. */
  const [menuFor, setMenuFor] = useState<
    { doc: NotebookRow; top: number; left: number; anchorTop: number } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<NotebookRow | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  /* Dismiss the card menu on Escape, any click outside its trigger and
     the portaled menu, and on any scroll/resize (the fixed menu would
     otherwise detach from its anchor button). */
  useEffect(() => {
    if (!menuFor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ph-card-menu-btn') && !target.closest('.ph-card-menu')) {
        setMenuFor(null);
      }
    };
    const onMove = () => setMenuFor(null);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [menuFor]);

  /* Flip the portaled menu above its button when the downward position
     would leave the viewport; runs before paint so no jump is visible. */
  useLayoutEffect(() => {
    if (!menuFor || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    if (menuFor.top + h > window.innerHeight - 8) {
      menuRef.current.style.top = `${Math.max(8, menuFor.anchorTop - 4 - h)}px`;
    }
  }, [menuFor]);

  /* Initial load: honest loading + error states. The cards are NOTEBOOKS
     (grouped notebooks, migration 014): one card per notebook with its
     document count; the id is the notebook's root document. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await api.get('/api/compliance-history/notebooks');
        if (!cancelled) setDocuments(res.data.notebooks || []);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMsg(err, 'homeLoadFailTitle'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Quiet refresh when an analysis job finishes: upload from this page,
     contract appears on the cards. Failures stay silent here — the upload
     toasts + bell already tell the user what went wrong. */
  useEffect(
    () =>
      subscribe((job) => {
        if (job.status !== 'done') return;
        api.get('/api/compliance-history/notebooks')
          .then((res) => setDocuments(res.data.notebooks || []))
          .catch(() => { /* keep showing the previous list */ });
      }),
    [subscribe]
  );

  const filteredDocs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter((doc) =>
      (doc.company_name ?? '').toLowerCase().includes(normalized) ||
      doc.filename.toLowerCase().includes(normalized));
  }, [documents, query]);

  /* Both views sort by date modified (string compare is safe — modified_at
     is a zero-padded YYYY-MM-DD HH24:MI:SS). The toggle arrow lives next to
     the "Diubah" column header in the list view and applies to the grid
     too, so switching views never reorders under the user (2026-10-26). */
  const sortedDocs = useMemo(() => {
    const modOf = (d: NotebookRow) => d.modified_at ?? d.created_at;
    return [...filteredDocs].sort((a, b) =>
      modifiedSort === 'desc'
        ? modOf(b).localeCompare(modOf(a))
        : modOf(a).localeCompare(modOf(b)));
  }, [filteredDocs, modifiedSort]);

  const loadingPanel = isLoading ? (
    <LoadingOrb className="loading-orb--padded" label={t.homeLoading} />
  ) : loadError ? (
    <div className="ph-panel">
      <AlertTriangle size={36} aria-hidden="true" />
      <h3>{t.homeLoadFailTitle}</h3>
      <p>{msg(t, loadError)}</p>
      <button className="ph-button ph-button--primary" type="button" onClick={() => window.location.reload()}>
        <RefreshCw size={15} aria-hidden="true" /> {t.homeRetry}
      </button>
    </div>
  ) : documents.length === 0 ? (
    <div className="ph-panel">
      <Inbox size={36} aria-hidden="true" />
      <h3>{t.homeEmptyTitle}</h3>
      <p>{t.homeEmptyBody}</p>
      <button className="ph-button ph-button--primary" type="button" onClick={() => { void createWorkspace(); }} disabled={creating}>
        <Plus size={16} aria-hidden="true" /> {t.homeCtaNewWorkspace}
      </button>
    </div>
  ) : null;

  return (
    <PenggunaShell
      search={{
        value: query,
        /* Typing away the card a card menu points at would strand the
           fixed menu — close it on every keystroke. */
        onChange: (v) => { setQuery(v); setMenuFor(null); },
        label: t.homeSearchPh,
        clearAria: t.cmSearchClear,
      }}
    >
      <main className="ph-main">
        {/* Hero — "Review agreements with more clarity." */}
        <section className="ph-hero">
          <div className="ph-hero-copy">
            <span className="ph-eyebrow"><Sparkles size={14} aria-hidden="true" /> {t.homeEyebrow}</span>
            <h1>
              {t.homeHeroTitle1}
              <br />
              <em>{t.homeHeroTitleEm}</em>
            </h1>
            <p className="ph-body">{t.homeHeroBody}</p>
          </div>
          <button
            className="ph-button ph-button--primary ph-hero-cta"
            type="button"
            onClick={() => { void createWorkspace(); }}
            disabled={creating}
          >
            <Plus size={17} aria-hidden="true" />
            <span className="ph-dock-pill-label">{creating ? t.homeCreating : t.homeCtaNewWorkspace}</span>
          </button>
        </section>

        {/* Recent workspaces — merged recently-opened + library, in recent
            order (the /notebooks endpoint already returns created_at DESC),
            with the grid/list view controls and the topbar search filter.
            loadingPanel covers the loading/error/empty states. */}
        {loadingPanel}
        {!loadingPanel && documents.length > 0 && (
          <section className="ph-section" aria-label={t.homeRecentKicker}>
            <div className="ph-section-heading">
              <div>
                <span className="ph-kicker">{t.homeRecentKicker}</span>
                <h2>{t.homeRecentTitle}</h2>
              </div>
              <div className="ph-view-controls" role="group" aria-label={t.homeViewAria}>
                <button
                  type="button"
                  className={view === 'grid' ? 'ph-view-btn active' : 'ph-view-btn'}
                  onClick={() => { setView('grid'); setMenuFor(null); }}
                  aria-label={t.homeViewGrid}
                  aria-pressed={view === 'grid'}
                ><Grid2X2 size={16} aria-hidden="true" /></button>
                <button
                  type="button"
                  className={view === 'list' ? 'ph-view-btn active' : 'ph-view-btn'}
                  onClick={() => { setView('list'); setMenuFor(null); }}
                  aria-label={t.homeViewList}
                  aria-pressed={view === 'list'}
                ><List size={17} aria-hidden="true" /></button>
              </div>
            </div>
            {filteredDocs.length === 0 ? (
              <div className="ph-panel ph-panel--flat">
                <Inbox size={34} aria-hidden="true" />
                <h3>{t.homeNoMatchTitle}</h3>
                <p>{t.homeNoMatchBody}</p>
                <button className="ph-button ph-button--ghost" type="button" onClick={() => setQuery('')}>{t.cmClearFilters}</button>
              </div>
            ) : view === 'grid' ? (
              <div className="ph-lib-grid">
                {sortedDocs.map((doc) => {
                  const cover = coverFor(doc.id);
                  const name = doc.company_name ?? doc.filename;
                  const menuOpen = menuFor?.doc.id === doc.id;
                  return (
                    /* NotebookLM-style tile (2026-10-27): small gradient
                       cover icon top-left, kebab menu top-right, title +
                       meta pinned to the bottom. The card is NOT an <a> —
                       a nested button would be illegal interactive
                       content — so a stretched link covers the card and
                       the kebab sits above it (z-index). */
                    <div key={doc.id} className="ph-lib-card">
                      <div className="ph-card-top">
                        <span className={`ph-glyph-chip ${cover.cls}`} aria-hidden="true">{cover.glyph}</span>
                        <button
                          type="button"
                          className="ph-card-menu-btn"
                          onClick={(e) => {
                            if (menuOpen) { setMenuFor(null); return; }
                            /* Anchor the portaled menu to the button's
                               right edge, clamped into the viewport. */
                            const r = e.currentTarget.getBoundingClientRect();
                            const MENU_W = 190;
                            setMenuFor({
                              doc,
                              top: r.bottom + 4,
                              left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
                              anchorTop: r.top,
                            });
                          }}
                          aria-label={t.homeCardMenuAria}
                          aria-haspopup="true"
                          aria-expanded={menuOpen}
                        >
                          <MoreVertical size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="ph-lib-copy">
                        <h3 title={name}>{name}</h3>
                        {/* Date modified + doc count per the 2026-10-26
                            user request; plain text + dot matches the
                            reference tiles (icons stayed list-only). */}
                        <p>
                          {formatDate(doc.modified_at ?? doc.created_at)}
                          <span className="ph-lib-dot" aria-hidden="true">·</span>
                          {fill(t.nbDocCount, { n: formatNumber(doc.document_count) })}
                        </p>
                      </div>
                      <Link
                        className="ph-card-link"
                        to={`/contracts/${doc.id}`}
                        aria-label={t.homeCardOpen}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ph-lib-table" role="table" aria-label={t.homeRecentTitle}>
                <div className="ph-lib-thead" role="row">
                  <span className="ph-lib-th ph-lib-th--name" role="columnheader">{t.homeColName}</span>
                  <span className="ph-lib-th ph-lib-th--mod" role="columnheader">
                    {t.homeColModified}
                    <button
                      type="button"
                      className="ph-sort-btn"
                      onClick={() => setModifiedSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
                      aria-label={modifiedSort === 'desc' ? t.homeSortOldest : t.homeSortNewest}
                      title={modifiedSort === 'desc' ? t.homeSortOldest : t.homeSortNewest}
                    >
                      {modifiedSort === 'desc'
                        ? <ArrowDown size={14} aria-hidden="true" />
                        : <ArrowUp size={14} aria-hidden="true" />}
                    </button>
                  </span>
                  <span className="ph-lib-th ph-lib-th--docs" role="columnheader">{t.homeColDocs}</span>
                </div>
                {sortedDocs.map((doc) => {
                  const cover = coverFor(doc.id);
                  return (
                    <Link key={doc.id} className="ph-lib-row" to={`/contracts/${doc.id}`} role="row">
                      <span className="ph-lib-td ph-lib-td--name" role="cell">
                        <span className={`ph-glyph-chip ${cover.cls}`} aria-hidden="true">{cover.glyph}</span>
                        <span className="ph-lib-name" title={doc.company_name ?? doc.filename}>
                          {doc.company_name ?? doc.filename}
                        </span>
                      </span>
                      <span className="ph-lib-td ph-lib-td--mod" role="cell">
                        <Calendar size={13} aria-hidden="true" /> {formatDate(doc.modified_at ?? doc.created_at)}
                      </span>
                      <span className="ph-lib-td ph-lib-td--docs" role="cell">
                        <Files size={13} aria-hidden="true" /> {fill(t.nbDocCount, { n: formatNumber(doc.document_count) })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Portaled card menu — MUST portal to document.body: the card's hover
          `transform` would otherwise become the containing block for a fixed
          child and misplace it; body keeps the viewport coords honest.
          Flips above the button near the viewport bottom via the layout
          effect. */}
      {menuFor && createPortal(
        <div
          className="ph-card-menu"
          role="menu"
          ref={menuRef}
          onKeyDown={handleMenuKeys}
          style={{ top: menuFor.top, left: menuFor.left }}
        >
          <button
            role="menuitem"
            type="button"
            autoFocus
            onClick={() => {
              navigate(`/contracts/${menuFor.doc.id}`);
              setMenuFor(null);
            }}
          >
            <FolderOpen size={14} aria-hidden="true" /> {t.homeCardOpen}
          </button>
          <button
            role="menuitem"
            type="button"
            className="danger"
            onClick={() => {
              setDeleteTarget(menuFor.doc);
              setMenuFor(null);
            }}
          >
            <Trash2 size={14} aria-hidden="true" /> {t.homeCardDelete}
          </button>
        </div>,
        document.body
      )}

      {/* Delete confirmation — the backend cascade removes every document
          and bundled file under the notebook's root, which the dialog copy
          states; failure inline with retry (ContractMonitor dialog grammar). */}
      {deleteTarget && (
        <ConfirmDialog
          state={{
            title: { key: 'homeDelTitle' },
            body: { key: 'homeDelBody', params: { name: deleteTarget.company_name ?? deleteTarget.filename } },
            confirmLabel: { key: 'cmDelete' },
            onConfirm: async () => {
              try {
                await api.delete(`/api/compliance-history/${deleteTarget.id}`);
              } catch (err) {
                throw new LocalizedError(apiErrorMsg(err, 'homeDelErr'));
              }
              setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id));
              notify('success', { key: 'homeDelToast', params: { name: deleteTarget.company_name ?? deleteTarget.filename } }, 6000);
            },
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Mobile bottom dock (≤680px only, CSS-gated): the hero CTA hides on
          phones, so adding a clean workspace stays thumb-reachable. */}
      <div className="ph-dock">
        <button className="ph-dock-pill ph-dock-pill--primary" type="button" onClick={() => { void createWorkspace(); }} disabled={creating}>
          <Plus size={17} aria-hidden="true" />
          <span className="ph-dock-pill-label">{creating ? t.homeCreating : t.homeCtaNewWorkspace}</span>
        </button>
      </div>
    </PenggunaShell>
  );
}
