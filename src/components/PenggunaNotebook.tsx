import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BookOpen, Check, CheckCircle2, Eye, FileText, Inbox,
  Plus, RefreshCw, Search, Sparkles, Tag, Upload, X,
} from 'lucide-react';
import PenggunaShell, { PenggunaBackButton } from './PenggunaShell';
import LoadingOrb from './LoadingOrb';
import ContractUploadModal from './ContractUploadModal';
import InternalRefUploadModal from './InternalRefUploadModal';
import { type ComplianceSummary, type ComplianceResult } from './ComplianceResultsViewer';
import { useContractUpload } from '../hooks/useContractUpload';
import { useStrings, fill, msg, type Msg } from '../i18n';
import { useDateFormatters } from '../format';
import api from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import './PenggunaNotebook.css';

/* FEAT phase-2b (2026-10-24): pengguna-only notebook detail page — the
   approved Notebookly reference's three-column view that opens when a
   contract card is clicked (App.tsx routes /contracts/{id} here, outside
   the classic shell, for role pengguna only). Columns map to real data:
   - left  : the actual document repository (/api/repository rows; category
             facets from the live jenis values, counts and search included)
   - middle: the notebook's uploaded-document list (migration 014 grouped
             notebooks, 2026-10-24: GET .../{notebook}/documents — an upload
             started here JOINS this list; single-click selects a row for
             the preview, double-click opens its workspace)
   - right : the selected document's summary preview card fed by the real
             analysis results JSON plus the stored source file (PDF → a
             real iframe, anything else keeps the summary-paper fallback).
             The full analysis is embedded in the document workspace
             (phase-2c). Every other role never reaches this page (classic
             routes unchanged). The URL /contracts/{id} id doubles as the
             notebook identity: it is the notebook's first document. */

interface NotebookDetail {
  id: string;
  filename: string;
  company_name: string | null;
  expiration_date: string | null;
  /** Owning notebook (migration 014, grouped notebooks): the workspace's
      back-link target. Absent on rows persisted before the column. */
  notebook_id?: string | null;
  created_at: string;
  results: { summary?: ComplianceSummary | null; results?: ComplianceResult[] | null } | null;
}

/* One uploaded document in this notebook's list (GET .../documents). */
interface NotebookDocItem {
  id: string;
  filename: string;
  company_name: string | null;
  created_at: string;
}

interface RepoRow {
  id: string;            // backend already sends str(reg_id); internal rows use the ref
  source_ref: string;    // 'reg:<id>' | 'internal:<uploadId>'
  active: boolean;        // from the backend exclusion set
  judul: string;
  nomor: string | null;
  jenis: string | null;
  status: string | null;
}

/* Decorative icon face per extension (port of the prototype's file-icon
   accents; fixed decor colors like the home cover art). */
/* Temporary toggle: hide the repository-category filter while the full
   Indonesian-law repository is used as the default reference base. */
const SHOW_REPO_CATEGORIES = false;

const EXT_ACCENTS: Record<string, string> = { pdf: 'red', docx: 'blue', doc: 'blue', xlsx: 'green', pptx: 'amber', jpg: 'slate', jpeg: 'slate', png: 'slate', txt: 'slate' };

function extOf(filename: string) {
  return (filename.split('.').pop() ?? '').toLowerCase();
}

function titleOf(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

export default function PenggunaNotebook() {
  const t = useStrings();
  const location = useLocation();
  const navigate = useNavigate();
  const { formatDate, formatNumber } = useDateFormatters();
  const { subscribe } = useContractUpload();
  const reportId = location.pathname.match(/^\/contracts\/([^/]+)/)?.[1] ?? '';

  const [detail, setDetail] = useState<NotebookDetail | null>(null);
  /* Full-page loading ONLY until the first detail arrives; document switches
     keep the page mounted (layout unmount+remount = the jitter/lag the user
     reported when clicking between rows). */
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [loadError, setLoadError] = useState<Msg | null>(null);
  /* Grouped notebooks (migration 014): every uploaded document of THIS
     notebook, oldest first — plus the row selected for the right preview. */
  const [docs, setDocs] = useState<NotebookDocItem[]>([]);
  /* Migration 017 empty workspaces: there is no root document to derive the
     workspace name from, so the documents response carries notebook_name.
     Null on legacy (document-rooted) responses — the old derivation stays. */
  const [nbName, setNbName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repo, setRepo] = useState<RepoRow[]>([]);
  const [repoFailed, setRepoFailed] = useState(false);
  /* True until the first rag-sources fetch settles — gates the "no internal
     references yet" empty note so it doesn't flash during load. */
  const [repoPending, setRepoPending] = useState(true);
  const [repoQuery, setRepoQuery] = useState('');
  const [docQuery, setDocQuery] = useState('');
  const [pickedCats, setPickedCats] = useState<string[] | null>(null);
  /* RAG reference selection (B2): source_refs of CHECKED reference-base sources,
     seeded from the backend `active` flag (a ref with no exclusion row comes
     back active). Toggling persists to /api/rag-sources/exclusions. */
  const [checkedRefs, setCheckedRefs] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  // B3: the LEFT "Add reference" button opens its own internal-reference upload
  // modal (POSTs to /api/upload-internal with this workspace), distinct from the
  // MIDDLE "Analyze another document" contract flow.
  const [refUploadOpen, setRefUploadOpen] = useState(false);
  /* FEAT phase-2b: real source preview. The backend stores the uploaded
     file (uploaded right after the report is saved); PDFs render in an
     iframe from a blob URL — anything else (or missing storage) keeps the
     summary-paper fallback. */
  const [srcPreview, setSrcPreview] = useState<{ state: 'loading' | 'ready' | 'unavailable'; url: string | null }>({ state: 'unavailable', url: null });

  /* Notebook documents: the URL id is the notebook's identity (the root
     document). The selected row drives the right-column preview below. */
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      // Entering a (different) notebook: drop the previous notebook's detail
      // so the page reloads properly instead of flashing stale content.
      setFirstLoadDone(false);
      setDetail(null);
      setLoadError(null);
      setNbName(null);
      try {
        const res = await api.get(`/api/compliance-history/${reportId}/documents`);
        if (!cancelled) {
          const list: NotebookDocItem[] = res.data.documents ?? [];
          setDocs(list);
          setNbName(res.data.notebook_name ?? null);
          // Bootstrap the selection on the notebook's first document; once
          // set it survives refetches (an upload selects its own row).
          setSelectedId((prev) => (prev && list.some((d) => d.id === prev) ? prev : (list[0]?.id ?? null)));
          /* EMPTY workspace (migration 017): there is no document to detail,
             so the detail fetch below can never run and would leave the
             page loading forever. Open the gate here; the render branches
             to the clean-workspace empty panel. */
          if (list.length === 0) setFirstLoadDone(true);
        }
      } catch (err) {
        if (!cancelled) {
          // Was silently swallowed (the detail fetch reported failures) —
          // but an empty workspace never reaches the detail fetch, so a 404
          // workspace id would dead-end into the empty panel. Fail honestly.
          setLoadError(apiErrorMsg(err, 'nbLoadErrorBody'));
          setFirstLoadDone(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  /* Detail: fetch the SELECTED document's report; selection changes refetch
     WITHOUT a page-level loading swap — the previous detail stays on screen
     and the right panel dims (nb-insight--switching) until the new one
     lands, so row switching feels in-place. */
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/compliance-history/${selectedId}`);
        if (!cancelled) {
          setDetail(res.data);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMsg(err, 'nbLoadErrorBody'));
      } finally {
        if (!cancelled) setFirstLoadDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, reportId]);

  /* Reference base: the shared document repository (klasifikasi-filtered
     server-side by role; failures leave a small honest note). */
  // B3: the list is workspace-scoped — pass this notebook's reportId so the
  // LEFT list shows this workspace's internal refs (plus global public regs and
  // any legacy-unscoped refs). A ref uploaded via the LEFT button refetches here.
  const refetchRefList = useCallback(async () => {
    try {
      const res = await api.get('/api/rag-sources/list', { params: { report_id: reportId } });
      const rows: RepoRow[] = res.data.documents ?? res.data ?? [];
      setRepo(rows);
      // Backend is the source of truth: seed from `active`.
      setCheckedRefs(new Set(rows.filter((r) => r.active).map((r) => r.source_ref)));
      setRepoFailed(false);
    } catch {
      setRepoFailed(true);
    } finally {
      setRepoPending(false);
    }
  }, [reportId]);

  // Awaited IIFE (react-hooks/set-state-in-effect): every setState in
  // refetchRefList lands after its await, so the effect body triggers no
  // synchronous render — same shape as AdminDashboard's fetch effects.
  useEffect(() => { (async () => { await refetchRefList(); })(); }, [refetchRefList]);

  /* Refresh when an analysis job finishes while this page is open. Uploads
     started here passed this notebook's id, so the new document ARRIVES in
     this list — select its row so the user sees exactly where it landed.
     (Grouped notebooks; the earlier navigate-to-new-report flow predated
     grouping.) */
  useEffect(
    () =>
      subscribe((job) => {
        if (job.status !== 'done' || !job.reportId) return;
        const newDocId = job.reportId; // capture: TS narrowing doesn't cross the .then boundary
        api.get(`/api/compliance-history/${reportId}/documents`)
          .then((res) => {
            const list: NotebookDocItem[] = res.data.documents ?? [];
            setDocs(list);
            if (list.some((d) => d.id === newDocId)) setSelectedId(newDocId);
          })
          .catch(() => { /* keep the current list */ });
      }),
    [subscribe, reportId]
  );

  const summary = detail?.results?.summary ?? null;
  /* In-flight switch: the shown detail belongs to the PREVIOUS selection —
     dim the right panel instead of remounting the page. */
  const switching = !!detail && !!selectedId && detail.id !== selectedId;
  /* phase-2c: the per-pasal results are rendered by the document workspace
     page (embedded ComplianceResultsViewer) — the notebook only previews. */

  /* Fetch and decode the stored source file (base64 JSON, like the
     repository's /api/pdf flow). Awaited-IIFE: keeps the setState-containing
     fetch out of the effect body's direct call graph — same pattern as
     LegalRepository's pdf loader. */
  useEffect(() => {
    const isPdf = !!detail && extOf(detail.filename) === 'pdf';
    let cancelled = false;
    (async () => {
      if (!isPdf) {
        // Non-PDF (or a torn-away detail): clear any previous document's
        // PDF — stale state would keep rendering the OLD file.
        if (!cancelled) setSrcPreview({ state: 'unavailable', url: null });
        return;
      }
      setSrcPreview({ state: 'loading', url: null });
      try {
        const res = await api.get(`/api/compliance-history/${selectedId}/file`);
        if (cancelled) return;
        const binary = atob(res.data.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setSrcPreview({ state: 'ready', url });
      } catch {
        if (!cancelled) setSrcPreview({ state: 'unavailable', url: null });
      }
    })();
    return () => { cancelled = true; };
  }, [detail, selectedId]);

  /* Revoke the last blob URL on change/unmount (the cleanup always sees the
     previous value, never the new one). */
  useEffect(() => () => {
    if (srcPreview.url) URL.revokeObjectURL(srcPreview.url);
  }, [srcPreview.url]);

  /* Workspace name: migration 017 empty workspaces get theirs from the
      documents response; legacy groups derive it from the first document
      (the row the notebook was named after), not the transiently selected
      one. */
  const notebookName = nbName
    ?? (docs[0]
      ? (docs[0].company_name ?? titleOf(docs[0].filename))
      : (detail?.company_name ?? titleOf(detail?.filename ?? '')));
  const fromExt = detail ? extOf(detail.filename) : '';
  const categories = useMemo(
    () => Array.from(new Set(repo.map((r) => r.jenis ?? '—').filter(Boolean))),
    [repo]
  );
  const catCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of repo) {
      const key = row.jenis ?? '—';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [repo]);

  /* Reference base, 2026-10-26 user request: only the user's UPLOADED
     internal references are listed; the public law repository stays the
     default included base for matching (backend RAG uses it unless
     explicitly excluded) but is not shown in the sidebar. */
  const internalRepo = useMemo(
    () => repo.filter((row) => row.source_ref.startsWith('internal:')),
    [repo]
  );
  const visibleRepo = useMemo(() => {
    const normalized = repoQuery.trim().toLowerCase();
    return internalRepo
      .filter((row) => !pickedCats || pickedCats.includes(row.jenis ?? '—'))
      .filter((row) => !normalized ||
        `${row.judul} ${row.nomor ?? ''} ${row.jenis ?? ''}`.toLowerCase().includes(normalized));
  }, [internalRepo, pickedCats, repoQuery]);

  /* Middle-column list filter across every uploaded document of the
     notebook. */
  const visibleDocs = useMemo(() => {
    const normalized = docQuery.trim().toLowerCase();
    if (!normalized) return docs;
    return docs.filter((d) =>
      `${d.company_name ?? ''} ${d.filename}`.toLowerCase().includes(normalized));
  }, [docs, docQuery]);

  /* Select-all header: checked when every visible reference is selected,
     indeterminate when only some are (no JSX prop for it). Operates over the
     search-filtered visibleRepo, consistent with pre-B2 behavior. */
  const allSelected = visibleRepo.length > 0 && visibleRepo.every((r) => checkedRefs.has(r.source_ref));
  const someSelected = visibleRepo.some((r) => checkedRefs.has(r.source_ref));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  /* Per-row toggle: flip local state optimistically, persist the exclusion
     (checked = NOT excluded), revert on failure. */
  const toggleRef = (ref: string) => {
    const wasChecked = checkedRefs.has(ref);
    setCheckedRefs((prev) => {
      const next = new Set(prev);
      if (wasChecked) next.delete(ref); else next.add(ref);
      return next;
    });
    api.post('/api/rag-sources/exclusions', { source_ref: ref, excluded: wasChecked })
      .catch(() => setCheckedRefs((prev) => {
        const next = new Set(prev);
        if (wasChecked) next.add(ref); else next.delete(ref);
        return next;
      }));
  };

  /* Bulk select-all / deselect-all over the current visibleRepo. */
  const toggleAll = () => {
    const refs = visibleRepo.map((r) => r.source_ref);
    const turningOff = allSelected; // currently all checked -> deselect them
    setCheckedRefs((prev) => {
      const next = new Set(prev);
      for (const r of refs) { if (turningOff) next.delete(r); else next.add(r); }
      return next;
    });
    const payload = turningOff ? { set_excluded: refs } : { set_included: refs };
    api.post('/api/rag-sources/exclusions', payload)
      .catch(() => setCheckedRefs((prev) => {
        const next = new Set(prev);
        for (const r of refs) { if (turningOff) next.add(r); else next.delete(r); }
        return next;
      }));
  };

  if (!reportId) return null;

  return (
    <PenggunaShell
      crumbs={[
        // Path trail reflects LOCATION only (user request 2026-10-25): the
        // document node appears when a workspace is double-click-opened —
        // NOT on single-click preview switches, which are transient.
        { label: t.navHome, to: '/home' },
        ...(notebookName ? [{ label: notebookName, to: `/contracts/${reportId}` }] : []),
      ]}
    >
      <main className="nb-main">
        {!firstLoadDone ? (
          <div className="nb-loading"><LoadingOrb className="loading-orb--padded" label={t.homeLoading} /></div>
        ) : workspaceEmpty ? (
          /* Clean workspace (migration 017): it was created empty and holds
              no document yet — a create-first panel instead of the three
              columns (which all hang off a selected document). The upload
              modal already passes this workspace's id, so the first
              analysis becomes the workspace's document list seed. */
          <div className="nb-panel">
            <Inbox size={36} aria-hidden="true" />
            <h3>{t.nbEmptyWsTitle}</h3>
            <p>{t.nbEmptyWsBody}</p>
            <button className="nb-btn nb-btn--primary" type="button" onClick={() => setUploadOpen(true)}>
              <Plus size={15} aria-hidden="true" /> {t.nbEmptyWsCta}
            </button>
          </div>
        ) : loadError ? (
          <div className="nb-panel">
            <AlertTriangle size={36} aria-hidden="true" />
            <h3>{t.nbLoadErrorTitle}</h3>
            <p>{msg(t, loadError)}</p>
            <Link className="nb-btn nb-btn--primary" to="/home">
              <RefreshCw size={15} aria-hidden="true" /> {t.nbBackHome}
            </Link>
          </div>
        ) : !detail ? (
          /* Transient: the first document just landed in a previously empty
              workspace — its detail is on its way (the old branches never
              saw this because detail was always available by firstLoadDone). */
          <div className="nb-loading"><LoadingOrb className="loading-orb--padded" label={t.homeLoading} /></div>
        ) : (
          <div className="nb-layout">
            {/* ── left: real document repository as the reference base ── */}
            <aside className="nb-sidebar">
              <div className="nb-sidebar-heading">
                <div>
                  <span className="nb-kicker">{t.navRepository}</span>
                  <h1>{t.nbRefTitle}</h1>
                </div>
              {/* Count badge counts the VISIBLE (internal) references — the
                  public repository stays default-on behind the scenes. */}
              <span className="nb-total">{t ? formatNumber(internalRepo.length) : ''}</span>
              </div>
              <p className="nb-sidebar-sub">{t.nbRefSub}</p>
              <button className="nb-btn nb-btn--primary nb-upload-btn" type="button" onClick={() => setRefUploadOpen(true)}>
                <Upload size={16} aria-hidden="true" /> {t.nbAddReference}
              </button>
              <label className="nb-search">
                <Search size={15} aria-hidden="true" />
                <input value={repoQuery} onChange={(e) => setRepoQuery(e.target.value)} placeholder={t.nbSearchRepo} aria-label={t.nbSearchRepo} />
                {repoQuery && (
                  <button type="button" className="nb-clear" onClick={() => setRepoQuery('')} aria-label={t.cmSearchClear}>
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </label>
              {repoFailed ? (
                <p className="nb-repo-fail">{t.nbRepoFail}</p>
              ) : (
                <>
                  {SHOW_REPO_CATEGORIES && (
                  <div className="nb-cats">
                    <div className="nb-cats-head"><span>{t.nbCatsHeading}</span><Tag size={14} aria-hidden="true" /></div>
                    {categories.map((cat) => (
                      <label className="nb-cat" key={cat}>
                        <input
                          type="checkbox"
                          checked={!pickedCats || pickedCats.includes(cat)}
                          onChange={() => setPickedCats((prev) =>
                            prev === null
                              ? categories.filter((c) => c !== cat)
                              : prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])}
                        />
                        <span className="nb-cat-box"><Check size={12} aria-hidden="true" /></span>
                        <span className="nb-cat-name">{cat}</span>
                        <small>{t ? formatNumber(Number((catCounts.get(cat) ?? 0).toString())) : ''}</small>
                      </label>
                    ))}
                  </div>
                  )}
                  {visibleRepo.length > 0 && (
                    <label className="nb-ref-selectall">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="nb-select"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label={t.nbSelectAll}
                      />
                      <span>{t.nbSelectAll}</span>
                    </label>
                  )}
                  <div className="nb-repo-list">
                    {!repoPending && internalRepo.length === 0 && (
                      <p className="nb-repo-empty">{t.nbRepoInternalEmpty}</p>
                    )}
                    {visibleRepo.map((row) => (
                      <label className="nb-repo-item" key={row.source_ref}>
                        <input
                          type="checkbox"
                          className="nb-select nb-repo-check"
                          checked={checkedRefs.has(row.source_ref)}
                          onChange={() => toggleRef(row.source_ref)}
                          aria-label={t.nbSelectDoc}
                        />
                        <span className="nb-repo-item-body">
                          <span className="nb-repo-item-top">
                            <strong title={row.judul}>{row.judul}</strong>
                            <span>{row.status}</span>
                          </span>
                          <small>{row.jenis} · {row.nomor}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <div className="nb-note"><Sparkles size={15} aria-hidden="true" /><span>{t.nbRefNote}</span></div>
              <div className="nb-foot"><span>{t.nbFootLive}</span><span className="nb-foot-right"><span className="nb-dot" aria-hidden="true" />{t.nbFootSync}</span></div>
            </aside>

            {/* ── middle: every document uploaded into THIS notebook ── */}
            <section className="nb-docs">
              <div className="nb-docs-heading">
                <div>
                  <span className="nb-kicker-row">
                    <PenggunaBackButton />
                    <span className="nb-kicker"><BookOpen size={14} aria-hidden="true" /> {t.nbDocKicker}</span>
                  </span>
                  <h2>{t.nbDocTitle}</h2>
                  <p>{t.nbDocSub}</p>
                </div>
              </div>
              {summary && (
                <div className="nb-docs-brief" aria-label={t.nbDocKicker}>
                  <strong>{summary.jenis_dokumen}</strong>
                  <span>{summary.pihak_pertama} · {summary.pihak_kedua}</span>
                </div>
              )}
              <div className="nb-docs-toolbar">
                <div className="nb-count"><strong>{fill(t.nbDocCount, { n: formatNumber(docs.length) })}</strong></div>
                <button className="nb-add-btn" type="button" onClick={() => setUploadOpen(true)}>
                  <Plus size={13} aria-hidden="true" /> {t.nbAnalyzeAnother}
                </button>
                <label className="nb-search nb-search--small">
                  <Search size={13} aria-hidden="true" />
                  <input value={docQuery} onChange={(e) => setDocQuery(e.target.value)} placeholder={t.nbSearchDocs} aria-label={t.nbSearchDocs} />
                  {docQuery && (
                    <button type="button" className="nb-clear" onClick={() => setDocQuery('')} aria-label={t.cmSearchClear}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </label>
              </div>
              {visibleDocs.length > 0 ? (
                <div className="nb-list" role="table" aria-label={t.nbDocTitle}>
                  <div className="nb-list-head" role="row">
                    <span role="columnheader">{t.nbColDocument}</span>
                    <span role="columnheader">{t.nbColReview}</span>
                    <span role="columnheader">{t.nbColAnalyzed}</span>
                    <span role="columnheader">{t.nbColType}</span>
                  </div>
                  {visibleDocs.map((doc) => {
                    const ext = extOf(doc.filename);
                    const selected = doc.id === selectedId;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        role="row"
                        className={selected ? 'nb-row selected' : 'nb-row'}
                        aria-pressed={selected}
                        onClick={(e) => {
                          // Phones never fire dblclick on a tap, so the
                          // desktop pattern (click = preview, double-click =
                          // open) dead-ends there. Touch input opens the
                          // workspace on the first tap; mouse/pen keep the
                          // two-step flow (2026-10-26 mobile report).
                          const pe = e.nativeEvent as PointerEvent;
                          const isTouch = pe.pointerType
                            ? pe.pointerType !== 'mouse'
                            : window.matchMedia('(pointer: coarse)').matches;
                          if (isTouch) {
                            navigate(`/contracts/${doc.id}/workspace`);
                            return;
                          }
                          setSelectedId(doc.id);
                        }}
                        onDoubleClick={() => navigate(`/contracts/${doc.id}/workspace`)}
                        title={t.nbDocSub}
                      >
                        <span className="nb-row-name" role="cell">
                          <span className={`nb-file-icon ${EXT_ACCENTS[ext] ?? 'slate'}`}><FileText size={17} aria-hidden="true" /></span>
                          <span className="nb-row-title">
                            <strong title={doc.filename}>{doc.filename}</strong>
                            <small>{doc.company_name || titleOf(doc.filename)}</small>
                          </span>
                        </span>
                        <span className="nb-row-chip" role="cell"><span className="nb-pill">{selected && summary?.jenis_dokumen ? summary.jenis_dokumen : ext.toUpperCase() || 'FILE'}</span></span>
                        <span className="nb-row-cell" role="cell">{formatDate(doc.created_at)}</span>
                        <span className="nb-type-cell" role="cell">{ext.toUpperCase() || 'FILE'}<Check size={13} aria-hidden="true" /></span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="nb-panel nb-panel--flat">
                  <Inbox size={34} aria-hidden="true" />
                  <h3>{t.homeNoMatchTitle}</h3>
                  <p>{t.homeNoMatchBody}</p>
                  <button className="nb-btn nb-btn--ghost" type="button" onClick={() => setDocQuery('')}>{t.cmClearFilters}</button>
                </div>
              )}
              {/* Analysis moved out of the page: it lives embedded in the
                  document workspace (double-click a row above, phase-2c). */}
            </section>

            {/* ── right: summary preview of the SELECTED document ── */}
            <aside className={switching ? 'nb-insight nb-insight--switching' : 'nb-insight'}>
              <div className="nb-insight-heading">
                <div>
                  <span className="nb-kicker">{t.nbPreviewKicker}</span>
                  <h2 title={detail.filename}>{detail.filename}</h2>
                </div>
              </div>
              <div className="nb-selected">
                <span className={`nb-file-icon ${EXT_ACCENTS[fromExt] ?? 'slate'}`}><FileText size={18} aria-hidden="true" /></span>
                <span className="nb-selected-copy">
                  <strong title={detail.filename}>{titleOf(detail.filename)}</strong>
                  <span>{summary?.jenis_dokumen ?? notebookName} · {extOf(detail.filename).toUpperCase() || 'FILE'}</span>
                </span>
              </div>
              <div className="nb-preview-toolbar">
                <span><Eye size={14} aria-hidden="true" /> {t.nbPreviewLabel}</span>
                <span>{t.nbPreviewNote}</span>
              </div>
              {srcPreview.state === 'ready' && srcPreview.url ? (
                <iframe
                  className="nb-frame"
                  src={srcPreview.url}
                  title={`${t.nbPreviewLabel}: ${detail.filename}`}
                />
              ) : srcPreview.state === 'loading' ? (
                <div className="nb-photo-loading"><LoadingOrb label={t.homeLoading} /></div>
              ) : (
                <div className="nb-paper">
                  <div className="nb-paper-top"><span>LEGAL ANALYZER SOURCE</span><span>{extOf(detail.filename).toUpperCase() || 'FILE'}</span></div>
                  <h3>{titleOf(detail.filename)}</h3>
                  <div className="nb-rule" aria-hidden="true" />
                  <p>{summary?.pokok_perjanjian || '—'}</p>
                  {summary && (
                    <div className="nb-grid">
                      <div><span>{t.nbParties1}</span><strong title={summary.pihak_pertama}>{summary.pihak_pertama}</strong></div>
                      <div><span>{t.nbParties2}</span><strong title={summary.pihak_kedua}>{summary.pihak_kedua}</strong></div>
                      <div><span>{t.nbSector}</span><strong>{summary.sektor_bisnis}</strong></div>
                      <div><span>{t.nbScore}</span><strong>{formatNumber(Number(summary.skor_kepatuhan ?? 0))}%</strong></div>
                    </div>
                  )}
                  <div className="nb-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div>
                  <div className="nb-page-number">01</div>
                </div>
              )}
              <div className="nb-caption">
                <CheckCircle2 size={14} aria-hidden="true" />
                {srcPreview.state === 'ready' ? t.nbCaptionFile : t.nbPreviewCaption}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Mobile bottom dock (≤680px only, CSS-gated): "analyze another doc"
          stays thumb-reachable; the in-flow add button remains for desktop. */}
      <div className="ph-dock">
        <button className="ph-dock-pill ph-dock-pill--primary" type="button" onClick={() => setUploadOpen(true)}>
          <Plus size={17} aria-hidden="true" /> <span className="ph-dock-pill-label">{t.nbAnalyzeAnother}</span>
        </button>
      </div>

      {uploadOpen && (
        <ContractUploadModal onClose={() => setUploadOpen(false)} notebookId={reportId} />
      )}
      {refUploadOpen && (
        <InternalRefUploadModal
          reportId={reportId}
          onClose={() => setRefUploadOpen(false)}
          onUploaded={refetchRefList}
        />
      )}
    </PenggunaShell>
  );
}
