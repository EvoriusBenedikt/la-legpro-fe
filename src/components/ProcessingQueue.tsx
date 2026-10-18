import { useState } from 'react';
import {
  Play, Clock, CheckCircle, AlertTriangle, Ban, RotateCcw, Loader2, Circle, Check, X, User, RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import { useDateFormatters } from '../format';
import { useStrings, fill, stageLabel, type Dict, type Msg, type StringKey } from '../i18n';
import { apiErrorMsg } from '../apiErrors';

/* "Antrean Pemrosesan" card (System Monitoring). Presentational + actions: the
   parent owns polling and the document drawer; this component owns the view
   state (tab, status filter, "show more", inline cancel confirm). */

export type QueueStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface QueueStage { name: string; status: 'pending' | 'running' | 'done' | 'failed' }

export interface QueueTask {
  id: string;
  name: string | null;
  doc_id: string | null;
  filename: string | null;
  uploader: string | null;
  status: QueueStatus;
  stage: string | null;
  stages: QueueStage[];
  progress: number | null;
  queued_at: string | null;
  start_time: string | null;
  end_time: string | null;
  attempts: number;
  max_attempts: number;
  error: string | null;
  retryable: boolean;
  cancel_requested: boolean;
  next_retry_at: string | null;
}

export interface QueueData {
  tasks: QueueTask[];
  counts: Record<QueueStatus, number>;
}

type Tab = 'active' | 'history';
type Filter = 'ALL' | QueueStatus;

const PAGE_SIZE = 8;

/* Fixed Vocabulary (DESIGN.md) + the new Dibatalkan state. */
const VOCAB: Record<QueueStatus, { labelKey: StringKey; sumKey: StringKey; tone: 'success' | 'danger' | 'info' | 'neutral' }> = {
  QUEUED: { labelKey: 'stQueued', sumKey: 'pqSumQueued', tone: 'neutral' },
  RUNNING: { labelKey: 'stMemproses', sumKey: 'pqSumRunning', tone: 'info' },
  COMPLETED: { labelKey: 'stCompleted', sumKey: 'pqSumCompleted', tone: 'success' },
  FAILED: { labelKey: 'stGagal', sumKey: 'pqSumFailed', tone: 'danger' },
  CANCELLED: { labelKey: 'stCancelled', sumKey: 'pqSumCancelled', tone: 'neutral' },
};

/* A failed task still waiting on its automatic retry is live work, not history. */
const isActive = (t: QueueTask) =>
  t.status === 'QUEUED' || t.status === 'RUNNING' || (t.status === 'FAILED' && !!t.next_retry_at);

const ACTIVE_FILTERS: QueueStatus[] = ['QUEUED', 'RUNNING', 'FAILED'];
const HISTORY_FILTERS: QueueStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

function fmtDuration(t: Dict, ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return fill(t.pqDurSec, { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? fill(t.pqDurMinSec, { m, s: s % 60 }) : fill(t.pqDurMin, { m });
  const h = Math.floor(m / 60);
  return m % 60 ? fill(t.pqDurHourMin, { h, m: m % 60 }) : fill(t.pqDurHour, { h });
}

function StatusIcon({ status }: { status: QueueStatus }) {
  switch (status) {
    case 'RUNNING': return <Loader2 size={12} className="admin-spin" aria-hidden="true" />;
    case 'COMPLETED': return <CheckCircle size={12} aria-hidden="true" />;
    case 'FAILED': return <AlertTriangle size={12} aria-hidden="true" />;
    case 'CANCELLED': return <Ban size={12} aria-hidden="true" />;
    default: return <Clock size={12} aria-hidden="true" />;
  }
}

/* Long filenames: the base ellipsizes, the extension never does, and the full
   name rides the title tooltip. */
function FileLabel({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  const hasExt = dot > 0 && name.length - dot <= 6;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  return (
    <>
      <span className="queue-file-base">{base}</span>
      {ext && <span className="queue-file-ext">{ext}</span>}
    </>
  );
}

interface Props {
  data: QueueData;
  now: number;
  paused: boolean;
  intervalMs: number;
  onOpenDocument: (docId: string) => void;
  onChanged: () => Promise<void> | void;
  pushToast: (kind: 'success' | 'error' | 'info', message: Msg, ttl?: number) => void;
}

export default function ProcessingQueue({ data, now, paused, intervalMs, onOpenDocument, onChanged, pushToast }: Props) {
  const { formatTime, formatDateTime } = useDateFormatters();
  const t = useStrings();
  const [tab, setTab] = useState<Tab>('active');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeTasks = data.tasks.filter(isActive);
  const historyTasks = data.tasks.filter(task => !isActive(task));
  const inTab = tab === 'active' ? activeTasks : historyTasks;
  const filtered = filter === 'ALL' ? inTab : inTab.filter(task => task.status === filter);
  // History reads newest-first by end time; active keeps server order (newest activity first).
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  const filterOptions = tab === 'active' ? ACTIVE_FILTERS : HISTORY_FILTERS;
  const countIn = (s: QueueStatus) => inTab.filter(task => task.status === s).length;

  const switchTab = (next: Tab) => { setTab(next); setFilter('ALL'); setVisible(PAGE_SIZE); setConfirmCancelId(null); };
  const applyFilter = (next: Filter) => { setFilter(next); setVisible(PAGE_SIZE); };

  /* Summary counters ("2 memproses · 5 menunggu · 1 gagal") double as shortcuts:
     each jumps to the tab + filter that lists exactly those tasks. */
  const summary = (['RUNNING', 'QUEUED', 'FAILED'] as QueueStatus[])
    .filter(s => data.counts[s] > 0)
    .map(s => ({ status: s, n: data.counts[s] }));
  const jumpTo = (s: QueueStatus) => {
    const target: Tab = s === 'FAILED' ? 'history' : 'active';
    // A failure still awaiting auto-retry lives in the active tab.
    const failedLive = s === 'FAILED' && activeTasks.some(task => task.status === 'FAILED');
    setTab(failedLive ? 'active' : target);
    setFilter(s);
    setVisible(PAGE_SIZE);
  };

  /* Toasts carry Msg keys, resolved at render, so a language flip re-renders them. */
  const cancelTask = async (task: QueueTask) => {
    setBusyId(task.id);
    try {
      const res = await api.post(`/api/engineer/queue/${encodeURIComponent(task.id)}/cancel`);
      pushToast('info', { key: res.data?.result === 'requested' ? 'pqToastCancelRequested' : 'pqToastCancelled' });
      await onChanged();
    } catch (e) {
      pushToast('error', apiErrorMsg(e, 'pqToastCancelFail'));
    } finally {
      setBusyId(null);
      setConfirmCancelId(null);
    }
  };

  const retryTask = async (task: QueueTask) => {
    setBusyId(task.id);
    try {
      await api.post(`/api/engineer/queue/${encodeURIComponent(task.id)}/retry`);
      pushToast('success', { key: 'pqToastRetried' });
      await onChanged();
    } catch (e) {
      pushToast('error', apiErrorMsg(e, 'pqToastRetryFail'));
    } finally {
      setBusyId(null);
    }
  };

  const timeLine = (task: QueueTask) => {
    const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
    if (task.status === 'QUEUED') {
      return {
        text: fill(t.pqLineQueued, { time: formatTime(task.queued_at ?? ''), dur: fmtDuration(t, now - ms(task.queued_at)) }),
        title: formatDateTime(task.queued_at ?? ''),
      };
    }
    if (task.status === 'RUNNING') {
      return {
        text: fill(t.pqLineRunning, { time: formatTime(task.start_time ?? ''), dur: fmtDuration(t, now - ms(task.start_time)) }),
        title: formatDateTime(task.start_time ?? ''),
      };
    }
    const dur = task.start_time && task.end_time
      ? ` ${fill(t.pqLineDuration, { dur: fmtDuration(t, ms(task.end_time) - ms(task.start_time)) })}`
      : '';
    const lineKey: StringKey = task.status === 'COMPLETED' ? 'pqLineCompleted' : task.status === 'FAILED' ? 'pqLineFailed' : 'pqLineCancelled';
    return {
      text: `${fill(t[lineKey], { time: formatDateTime(task.end_time ?? '') })}${dur}`,
      title: fill(t.pqQueuedAt, { time: formatDateTime(task.queued_at ?? '') }),
    };
  };

  const renderRow = (task: QueueTask) => {
    const vocab = VOCAB[task.status];
    const displayName = task.filename || task.name || task.id;
    const time = timeLine(task);
    const busy = busyId === task.id;
    const canCancel = !task.cancel_requested && (task.status === 'QUEUED' || task.status === 'RUNNING' || (task.status === 'FAILED' && !!task.next_retry_at));
    const canRetry = (task.status === 'FAILED' || task.status === 'CANCELLED') && task.retryable;
    const confirming = confirmCancelId === task.id;
    const stageTotal = task.stages.length;
    const stageDone = task.stages.filter(s => s.status === 'done').length;
    const currentIdx = task.stages.findIndex(s => s.status === 'running');
    const failedStage = task.stages.find(s => s.status === 'failed');
    const showStages = stageTotal > 0 && (task.status === 'RUNNING' || task.status === 'FAILED' || (task.status === 'CANCELLED' && stageDone > 0));
    const pct = task.status === 'RUNNING' && stageTotal > 0 ? Math.min(100, Math.round(((stageDone + 0.5) / stageTotal) * 100)) : 0;
    const retryIn = task.next_retry_at ? Math.max(0, Math.ceil((new Date(task.next_retry_at).getTime() - now) / 1000)) : null;

    return (
      <li key={task.id} className={`queue-row tone-${vocab.tone}`}>
        <div className="queue-row-main">
          <span className={`status-pill ${vocab.tone}`}><StatusIcon status={task.status} /> {t[vocab.labelKey]}</span>
          {task.doc_id ? (
            <button
              type="button"
              className="queue-file queue-file-link"
              onClick={() => onOpenDocument(task.doc_id!)}
              title={fill(t.pqOpenDoc, { name: displayName })}
            >
              <FileLabel name={displayName} />
            </button>
          ) : (
            <span className="queue-file" title={displayName}><FileLabel name={displayName} /></span>
          )}
          <div className="queue-actions">
            {confirming ? (
              <span className="queue-confirm" role="group" aria-label={fill(t.pqConfirmAria, { name: displayName })}>
                <span className="queue-confirm-note">{t.pqConfirmNote}</span>
                <button type="button" className="module-btn danger" onClick={() => cancelTask(task)} disabled={busy}>
                  {busy ? t.pqCancelling : t.pqYes}
                </button>
                <button type="button" className="module-btn quiet" onClick={() => setConfirmCancelId(null)} disabled={busy}>{t.pqNo}</button>
              </span>
            ) : (
              <>
                {canRetry && (
                  <button type="button" className="module-btn quiet" onClick={() => retryTask(task)} disabled={busy} aria-label={fill(t.pqRetryAria, { name: displayName })}>
                    <RotateCcw size={13} aria-hidden="true" /> {busy ? t.pqRetrying : t.pqRetry}
                  </button>
                )}
                {canCancel && (
                  <button type="button" className="module-btn quiet" onClick={() => setConfirmCancelId(task.id)} aria-label={fill(t.pqCancelAria, { name: displayName })}>
                    <X size={13} aria-hidden="true" /> {t.pqCancel}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="queue-meta">
          <span className="queue-meta-item" title={time.title}><Clock size={12} aria-hidden="true" /> {time.text}</span>
          {task.uploader && <span className="queue-meta-item"><User size={12} aria-hidden="true" /> {task.uploader}</span>}
          {task.attempts > 0 && (
            <span className={`queue-meta-item${task.status === 'FAILED' && task.attempts >= task.max_attempts ? ' is-exhausted' : ''}`}>
              <RefreshCw size={12} aria-hidden="true" /> {fill(t.pqAttempt, { n: task.attempts, max: task.max_attempts })}
            </span>
          )}
        </div>

        {task.status === 'RUNNING' && stageTotal > 0 && (
          <div className="queue-progress">
            <div className="progress-track queue-progress-track" role="progressbar"
              aria-label={fill(t.pqProgressAria, { name: displayName })} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
              aria-valuetext={fill(t.pqStageValueText, { i: currentIdx + 1, total: stageTotal, stage: stageLabel(t, task.stage ?? '') })}>
              <div className="progress-fill level-ok" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <span className="queue-progress-label">
              {task.cancel_requested
                ? t.pqCancelRequested
                : fill(t.pqStageLabel, { i: currentIdx + 1, total: stageTotal, stage: task.stage ? stageLabel(t, task.stage) : '…' })}
            </span>
          </div>
        )}

        {showStages && (
          <ol className="queue-stages" aria-label={t.pqStagesAria}>
            {task.stages.map(s => (
              <li key={s.name} className={`queue-stage is-${s.status}`}>
                {s.status === 'done' ? <Check size={11} aria-hidden="true" />
                  : s.status === 'running' ? <Loader2 size={11} className="admin-spin" aria-hidden="true" />
                    : s.status === 'failed' ? <X size={11} aria-hidden="true" />
                      : <Circle size={9} aria-hidden="true" />}
                <span>{stageLabel(t, s.name)}</span>
                <span className="queue-sr">
                  {` ${s.status === 'done' ? t.pqStageDone : s.status === 'running' ? t.pqStageRunning : s.status === 'failed' ? t.pqStageFailed : t.pqStagePending}`}
                </span>
              </li>
            ))}
          </ol>
        )}

        {(task.status === 'FAILED' || task.status === 'CANCELLED') && task.error && (
          <div className={`queue-error${task.status === 'CANCELLED' ? ' is-neutral' : ''}`}>
            <AlertTriangle size={13} aria-hidden="true" />
            <div>
              <p className="queue-error-reason">
                {failedStage ? <>{fill(t.pqFailedAtStage, { stage: stageLabel(t, failedStage.name) })} </> : null}{task.error}
              </p>
              {task.status === 'FAILED' && (
                <p className="queue-error-hint">
                  {retryIn !== null
                    ? fill(t.pqRetryIn, { n: retryIn })
                    : !task.retryable
                      ? t.pqNotRetryable
                      : task.attempts >= task.max_attempts
                        ? t.pqExhausted
                        : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="module-card queue-card">
      <div className="module-header">
        <h3 className="module-title"><Play size={18} aria-hidden="true" /> {t.pqTitle}</h3>
        <span className="queue-live" title={fill(t.pqLiveTitle, { n: Math.round(intervalMs / 1000) })}>
          <span className={`live-dot${paused ? ' is-paused' : ''}`} aria-hidden="true" />
          {paused ? t.pqPaused : fill(t.pqAuto, { n: Math.round(intervalMs / 1000) })}
        </span>
      </div>

      <div className="queue-summary" role="group" aria-label={t.pqSummaryAria}>
        {summary.length === 0 ? (
          <span className="queue-summary-empty">{t.pqSummaryEmpty}</span>
        ) : (
          summary.map(({ status, n }, i) => (
            <span key={status} className="queue-summary-part">
              {i > 0 && <span aria-hidden="true">·</span>}
              <button type="button" className={`queue-count tone-${VOCAB[status].tone}`} onClick={() => jumpTo(status)}
                aria-label={fill(t.pqCountAria, { n, label: t[VOCAB[status].sumKey] })}>
                <strong>{n}</strong> {t[VOCAB[status].sumKey]}
              </button>
            </span>
          ))
        )}
      </div>

      <div className="queue-toolbar">
        <div className="queue-tabs" role="tablist" aria-label={t.pqTabsAria}>
          <button type="button" role="tab" aria-selected={tab === 'active'} className={`queue-tab${tab === 'active' ? ' is-selected' : ''}`} onClick={() => switchTab('active')}>
            {t.pqTabActive} <span className="queue-tab-count">{activeTasks.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'history'} className={`queue-tab${tab === 'history' ? ' is-selected' : ''}`} onClick={() => switchTab('history')}>
            {t.pqTabHistory} <span className="queue-tab-count">{historyTasks.length}</span>
          </button>
        </div>
        <select className="monitoring-select" value={filter} onChange={e => applyFilter(e.target.value as Filter)} aria-label={t.pqFilterAria}>
          <option value="ALL">{fill(t.pqFilterAll, { n: inTab.length })}</option>
          {filterOptions.map(s => <option key={s} value={s}>{fill(t.pqFilterOpt, { label: t[VOCAB[s].labelKey], n: countIn(s) })}</option>)}
        </select>
      </div>

      <div className="module-content queue-content" tabIndex={0} role="tabpanel" aria-live="off">
        {shown.length === 0 ? (
          <div className="empty-state">
            <Play size={24} aria-hidden="true" />
            <span>
              {inTab.length === 0
                ? tab === 'active' ? t.pqEmptyActive : t.pqEmptyHistory
                : t.pqEmptyFilter}
            </span>
          </div>
        ) : (
          <ul className="queue-list">{shown.map(renderRow)}</ul>
        )}
      </div>

      {(remaining > 0 || visible > PAGE_SIZE) && filtered.length > PAGE_SIZE && (
        <div className="queue-more">
          <span className="pager-range">{fill(t.pqPager, { shown: shown.length, total: filtered.length })}</span>
          {remaining > 0 && (
            <button type="button" className="module-btn quiet" onClick={() => setVisible(v => v + PAGE_SIZE)}>
              {fill(t.pqMore, { n: Math.min(PAGE_SIZE, remaining) })}
            </button>
          )}
          {visible > PAGE_SIZE && remaining <= 0 && (
            <button type="button" className="module-btn quiet" onClick={() => setVisible(PAGE_SIZE)}>{t.pqLess}</button>
          )}
        </div>
      )}
      <p className="table-footnote">{t.pqFoot}</p>
    </div>
  );
}
