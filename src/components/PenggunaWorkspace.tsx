import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowUpRight, Bot, ChartPie, CheckCircle2, FileText,
} from 'lucide-react';
import PenggunaShell, { PenggunaBackButton } from './PenggunaShell';
import LoadingOrb from './LoadingOrb';
import ComplianceResultsViewer, { type ComplianceSummary, type ComplianceResult } from './ComplianceResultsViewer';
import { useStrings, msg, type Msg } from '../i18n';
import { useDateFormatters } from '../format';
import api from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import './PenggunaWorkspace.css';
/* Reuses the notebook page's shared classes (.nb-panel/.nb-btn/.nb-paper/
   .nb-kicker/…) — that chunk is pengguna-only, so importing it here keeps
   the styles loaded when the workspace is deep-linked directly. */
import './PenggunaNotebook.css';

/* FEAT phase-3 (2026-10-25, user: pressing Chatbot should open IN the
   current page, not navigate): the tool toggles an in-place chat view — the
   same LegalOpinion the /opinion page mounts — REPLACING the workspace
   content while the URL stays on /contracts/{docId}/workspace. /opinion
   itself remains its own page. Lazy so the heavy chat chunk is only
   fetched when the tool is actually pressed. */
const LegalOpinion = lazy(() => import('./LegalOpinion'));

/* FEAT phase-2c (2026-10-24): pengguna-only document workspace — the
   prototype's second screen opened by DOUBLE-clicking the uploaded
   document on the notebook page (App.tsx routes /contracts/{id}/workspace
   here, outside the classic shell). Columns: left = document card +
   document tools (Analysis scrolls to the embedded compliance analysis
   below the preview; Chatbot jumps to the Legal Opinion module);
   right/main = kicker + filename hero, "Siap ditinjau" chip, the real PDF
   viewer panel (stored file → iframe; summary-paper fallback for missing
   storage / legacy rows / non-PDF) and the full analysis embedded in the
   page. Data: GET /api/compliance-history/{id} (+ /file for the PDF). */

interface NotebookDetail {
  id: string;
  filename: string;
  company_name: string | null;
  expiration_date: string | null;
  /** Owning notebook (migration 014, grouped notebooks): the back-link
      target. Absent on rows persisted before the column existed. */
  notebook_id?: string | null;
  /** Owning notebook's display name (phase-3 topbar trail): the root
      document's company, falling back to its file name. */
  notebook_name?: string | null;
  created_at: string;
  results: { summary?: ComplianceSummary | null; results?: ComplianceResult[] | null } | null;
}

function extOf(filename: string) {
  return (filename.split('.').pop() ?? '').toLowerCase();
}

function titleOf(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

export default function PenggunaWorkspace() {
  const t = useStrings();
  const location = useLocation();
  const navigate = useNavigate();
  const { formatDate } = useDateFormatters();
  const reportId = location.pathname.match(/^\/contracts\/([^/]+)/)?.[1] ?? '';

  const [detail, setDetail] = useState<NotebookDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Msg | null>(null);
  const [srcPreview, setSrcPreview] = useState<{ state: 'loading' | 'ready' | 'unavailable'; url: string | null }>({ state: 'unavailable', url: null });
  /* In-place chat (phase-3): the Chatbot tool swaps the workspace into the
     legal-opinion chat view on the SAME path — no navigation. */
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    if (chatOpen) window.scrollTo(0, 0);
  }, [chatOpen]);
  /* Analisis (BUG 2026-10-25): while the in-place chat is open the analysis
     section is NOT in the DOM, so the plain scrollIntoView dead-ended. When
     the chat is open, close it first and scroll once the document column has
     re-rendered (two frames — one for the state commit, one for layout). */
  const scrollToAnalysis = () => {
    const scroll = () => {
      document.querySelector('.nws-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (!chatOpen) {
      scroll();
      return;
    }
    setChatOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(scroll));
  };

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await api.get(`/api/compliance-history/${reportId}`);
        if (!cancelled) setDetail(res.data);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMsg(err, 'nbLoadErrorBody'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  /* Stored source file → blob URL (base64 JSON), same decode flow as the
     notebook preview; non-PDF keeps the summary-paper fallback. */
  useEffect(() => {
    if (!detail || extOf(detail.filename) !== 'pdf') return;
    let cancelled = false;
    (async () => {
      setSrcPreview({ state: 'loading', url: null });
      try {
        const res = await api.get(`/api/compliance-history/${reportId}/file`);
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
  }, [detail, reportId]);

  useEffect(() => () => {
    if (srcPreview.url) URL.revokeObjectURL(srcPreview.url);
  }, [srcPreview.url]);

  if (!reportId) return null;

  const summary = detail?.results?.summary ?? null;
  const pasalResults = detail?.results?.results ?? null;
  const fromExt = detail ? extOf(detail.filename) : '';

  return (
    <PenggunaShell
      crumbs={[
        { label: t.navHome, to: '/home' },
        ...(detail?.notebook_name && detail.notebook_id
          ? [{ label: detail.notebook_name, to: `/contracts/${detail.notebook_id}` }]
          : []),
        ...(detail ? [{ label: detail.filename }] : []),
      ]}
      /* The in-place chat is an app-like full-height view: drop the footer so
         it owns the viewport remainder (same rule as the /opinion page). */
      footer={!chatOpen}
    >
      <main className="nws-main">
        {isLoading ? (
          <div className="nb-loading"><LoadingOrb className="loading-orb--padded" label={t.homeLoading} /></div>
        ) : loadError || !detail ? (
          <div className="nb-panel">
            <FileText size={36} aria-hidden="true" />
            <h3>{t.nbLoadErrorTitle}</h3>
            <p>{loadError ? msg(t, loadError) : t.nbLoadErrorBody}</p>
            <Link className="nb-btn nb-btn--primary" to="/home">
              {t.nbBackHome}
            </Link>
          </div>
        ) : (
          <div className="nws-grid">
            {/* ── left: document card + tools (STAYS MOUNTED while the chat is
                open — the Chatbot / Analisis tools and the notebook back link
                remain visible and usable; the Chatbot tool becomes the exit). ── */}
            <aside className="nws-side">
              {/* Back to the OWNING notebook (grouped notebooks: the
                  document lives in that notebook's list; the detail
                  response now carries notebook_id). */}
              <button className="nws-back" type="button" onClick={() => navigate(`/contracts/${detail.notebook_id || reportId}`)}>
                <ArrowLeft size={15} aria-hidden="true" /> {t.wsBack}
              </button>
              <div className="nws-doc-card">
                <span className="nws-doc-icon" aria-hidden="true"><FileText size={26} /></span>
                <strong title={detail.filename}>{detail.filename}</strong>
                <span className="nws-doc-meta">
                  {summary?.jenis_dokumen ?? t.nbDocTitle} · {fromExt.toUpperCase() || 'FILE'}
                </span>
                <span className="nws-chip"><CheckCircle2 size={13} aria-hidden="true" /> {t.wsCreated}</span>
              </div>
              <span className="nb-kicker nws-tools-kicker">{t.wsToolsKicker}</span>
              <nav className="nws-tools" aria-label={t.wsToolsKicker}>
                <button
                  className="nws-tool"
                  type="button"
                  onClick={() => setChatOpen((o) => !o)}
                  /* Toggled ON = the chat view is open INSIDE this page;
                     pressing it again returns to the document. */
                  aria-pressed={chatOpen}
                >
                  <span className="nws-tool-icon" aria-hidden="true"><Bot size={17} /></span>
                  <span className="nws-tool-copy">
                    <strong>{t.wsToolChat}</strong>
                    <small>{t.wsToolChatSub}</small>
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
                <button className="nws-tool" type="button" onClick={scrollToAnalysis}>
                  <span className="nws-tool-icon" aria-hidden="true"><ChartPie size={17} /></span>
                  <span className="nws-tool-copy">
                    <strong>{t.wsToolAnalysis}</strong>
                    <small>{t.wsToolAnalysisSub}</small>
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </nav>
              <div className="nws-ctx">
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>{t.nbRefNote}</span>
              </div>
            </aside>

            {/* ── main: either the document (hero + PDF viewer + embedded
                analysis) or the in-place chat view on the SAME path ── */}
            <section className={"nws-body" + (chatOpen ? " nws-body--chat" : "")}>
              {chatOpen ? (
                /* In-place chat view (same path, no navigation): the full
                   Legal Opinion module; the tools rail on the left stays. */
                <div className="nws-chatview">
                  <Suspense fallback={<div className="nws-chatload"><LoadingOrb label={t.homeLoading} /></div>}>
                    {/* Scope split (2026-10-27): the in-place chat stores its
                        history under `doc:{reportId}`, so every document's
                        workspace owns an isolated conversation list — the
                        shared /opinion history never leaks in here. */}
                    <LegalOpinion scope={`doc:${reportId}`} />
                  </Suspense>
                </div>
              ) : (
                <>
              <span className="nb-kicker-row">
                <PenggunaBackButton />
                <span className="nb-kicker">{t.wsKicker}</span>
              </span>
              <h1>{detail.filename}</h1>
              <div className="nws-subrow">
                <p>{summary?.pokok_perjanjian || summary?.jenis_dokumen || t.nbDocTitle}</p>
                <span className="nws-ready"><CheckCircle2 size={14} aria-hidden="true" /> {t.wsReady}</span>
              </div>

              <div className="nws-pdfwrap">
                <div className="nws-pdfhead">
                  <div>
                    <strong>{t.wsPdfPreview}</strong>
                    <span>{formatDate(detail.created_at)}</span>
                  </div>
                  {srcPreview.state === 'ready' && srcPreview.url && (
                    <a className="nws-open" href={srcPreview.url} target="_blank" rel="noreferrer" title={t.wsOpenTab} aria-label={t.wsOpenTab}>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </a>
                  )}
                </div>
                {srcPreview.state === 'ready' && srcPreview.url ? (
                  <>
                    <div className="nws-pdfbar">
                      <span className="nws-pdfbar-left"><FileText size={14} aria-hidden="true" /> {t.wsPdfViewer}</span>
                      <span>{t.wsPageRange}</span>
                    </div>
                    <iframe className="nws-frame" src={srcPreview.url} title={`${t.wsPdfViewer}: ${detail.filename}`} />
                  </>
                ) : srcPreview.state === 'loading' ? (
                  <div className="nb-photo-loading"><LoadingOrb label={t.homeLoading} /></div>
                ) : (
                  <div className="nws-paper nb-paper">
                    <div className="nb-paper-top"><span>LEGAL ANALYZER LEGAL REVIEW</span><span>{fromExt.toUpperCase() || 'FILE'}</span></div>
                    <h3>{titleOf(detail.filename)}</h3>
                    <div className="nb-rule" aria-hidden="true" />
                    <p>{summary?.pokok_perjanjian || summary?.jenis_dokumen || '—'}</p>
                    {summary && (
                      <div className="nb-grid">
                        <div><span>{t.nbParties1}</span><strong title={summary.pihak_pertama}>{summary.pihak_pertama}</strong></div>
                        <div><span>{t.nbParties2}</span><strong title={summary.pihak_kedua}>{summary.pihak_kedua}</strong></div>
                        <div><span>{t.nbSector}</span><strong>{summary.sektor_bisnis}</strong></div>
                        <div><span>{t.nbScore}</span><strong>{summary.skor_kepatuhan ?? 0}%</strong></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* The full compliance analysis lives in the page (user
                  request: "put analisis inside the page on each document"). */}
              <section className="nws-analysis" aria-label={t.wsToolAnalysis}>
                <span className="nb-kicker">{t.wsToolAnalysis}</span>
                {pasalResults && pasalResults.length > 0 ? (
                  <div className="nws-analysis-viewer">
                    <ComplianceResultsViewer
                      filename={detail.filename}
                      summary={summary}
                      results={pasalResults}
                      headerActions={null}
                    />
                  </div>
                ) : (
                  <p className="nws-analysis-empty">{t.wsNoAnalysis}</p>
                )}
              </section>
                </>
              )}
            </section>
          </div>
        )}

        {/* Mobile bottom dock (≤680px only, CSS-gated): the two document
            tools stay thumb-reachable without scrolling to the side rail.
            Hidden while the chat view is open — its composer owns the
            bottom. Pressing Analisis here exits the chat first
            (scrollToAnalysis handles that). */}
        {!chatOpen && (
          <div className="ph-dock">
            <button className="ph-dock-pill" type="button" onClick={() => setChatOpen(true)}>
              <Bot size={17} aria-hidden="true" /> <span className="ph-dock-pill-label">{t.wsToolChat}</span>
            </button>
            <button className="ph-dock-pill ph-dock-pill--primary" type="button" onClick={scrollToAnalysis}>
              <ChartPie size={17} aria-hidden="true" /> <span className="ph-dock-pill-label">{t.wsToolAnalysis}</span>
            </button>
          </div>
        )}
      </main>
    </PenggunaShell>
  );
}
