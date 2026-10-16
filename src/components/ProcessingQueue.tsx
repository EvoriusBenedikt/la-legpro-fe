import { useState } from 'react';
import {
  Play, Clock, CheckCircle, AlertTriangle, Ban, RotateCcw, Loader2, Circle, Check, X, User, RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import { useDateFormatters } from '../format';

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
const VOCAB: Record<QueueStatus, { label: string; plural: string; tone: 'success' | 'danger' | 'info' | 'neutral' }> = {
  QUEUED: { label: 'Menunggu', plural: 'menunggu', tone: 'neutral' },
  RUNNING: { label: 'Memproses', plural: 'memproses', tone: 'info' },
  COMPLETED: { label: 'Selesai', plural: 'selesai', tone: 'success' },
  FAILED: { label: 'Gagal', plural: 'gagal', tone: 'danger' },
  CANCELLED: { label: 'Dibatalkan', plural: 'dibatalkan', tone: 'neutral' },
};

/* A failed task still waiting on its automatic retry is live work, not history. */
const isActive = (t: QueueTask) =>
  t.status === 'QUEUED' || t.status === 'RUNNING' || (t.status === 'FAILED' && !!t.next_retry_at);

const ACTIVE_FILTERS: QueueStatus[] = ['QUEUED', 'RUNNING', 'FAILED'];
const HISTORY_FILTERS: QueueStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt${s % 60 ? ` ${s % 60} dtk` : ''}`;
  const h = Math.floor(m / 60);
  return `${h} j${m % 60 ? ` ${m % 60} mnt` : ''}`;
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
  pushToast: (kind: 'success' | 'error' | 'info', message: string, ttl?: number) => void;
}

export default function ProcessingQueue({ data, now, paused, intervalMs, onOpenDocument, onChanged, pushToast }: Props) {
  const { formatTime, formatDateTime } = useDateFormatters();
  const [tab, setTab] = useState<Tab>('active');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeTasks = data.tasks.filter(isActive);
  const historyTasks = data.tasks.filter(t => !isActive(t));
  const inTab = tab === 'active' ? activeTasks : historyTasks;
  const filtered = filter === 'ALL' ? inTab : inTab.filter(t => t.status === filter);
  // History reads newest-first by end time; active keeps server order (newest activity first).
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  const filterOptions = tab === 'active' ? ACTIVE_FILTERS : HISTORY_FILTERS;
  const countIn = (s: QueueStatus) => inTab.filter(t => t.status === s).length;

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
    const failedLive = s === 'FAILED' && activeTasks.some(t => t.status === 'FAILED');
    setTab(failedLive ? 'active' : target);
    setFilter(s);
    setVisible(PAGE_SIZE);
  };

  const errMsg = (e: unknown, fallback: string) => {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
  };

  const cancelTask = async (t: QueueTask) => {
    setBusyId(t.id);
    try {
      const res = await api.post(`/api/engineer/queue/${encodeURIComponent(t.id)}/cancel`);
      pushToast('info', res.data?.result === 'requested'
        ? 'Pembatalan diminta. Tugas berhenti setelah tahap yang sedang berjalan selesai.'
        : 'Tugas dibatalkan.');
      await onChanged();
    } catch (e) {
      pushToast('error', errMsg(e, 'Gagal membatalkan tugas.'));
    } finally {
      setBusyId(null);
      setConfirmCancelId(null);
    }
  };

  const retryTask = async (t: QueueTask) => {
    setBusyId(t.id);
    try {
      await api.post(`/api/engineer/queue/${encodeURIComponent(t.id)}/retry`);
      pushToast('success', 'Tugas dimasukkan kembali ke antrean.');
      await onChanged();
    } catch (e) {
      pushToast('error', errMsg(e, 'Gagal mengulang tugas.'));
    } finally {
      setBusyId(null);
    }
  };

  const timeLine = (t: QueueTask) => {
    const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
    if (t.status === 'QUEUED') {
      return { text: `Masuk ${formatTime(t.queued_at ?? '')} · menunggu ${fmtDuration(now - ms(t.queued_at))}`, title: formatDateTime(t.queued_at ?? '') };
    }
    if (t.status === 'RUNNING') {
      return { text: `Mulai ${formatTime(t.start_time ?? '')} · berjalan ${fmtDuration(now - ms(t.start_time))}`, title: formatDateTime(t.start_time ?? '') };
    }
    const dur = t.start_time && t.end_time ? ` · durasi ${fmtDuration(ms(t.end_time) - ms(t.start_time))}` : '';
    const verb = t.status === 'COMPLETED' ? 'Selesai' : t.status === 'FAILED' ? 'Gagal' : 'Dibatalkan';
    return { text: `${verb} ${formatDateTime(t.end_time ?? '')}${dur}`, title: `Masuk ${formatDateTime(t.queued_at ?? '')}` };
  };

  const renderRow = (t: QueueTask) => {
    const vocab = VOCAB[t.status];
    const displayName = t.filename || t.name || t.id;
    const time = timeLine(t);
    const busy = busyId === t.id;
    const canCancel = !t.cancel_requested && (t.status === 'QUEUED' || t.status === 'RUNNING' || (t.status === 'FAILED' && !!t.next_retry_at));
    const canRetry = (t.status === 'FAILED' || t.status === 'CANCELLED') && t.retryable;
    const confirming = confirmCancelId === t.id;
    const stageTotal = t.stages.length;
    const stageDone = t.stages.filter(s => s.status === 'done').length;
    const currentIdx = t.stages.findIndex(s => s.status === 'running');
    const failedStage = t.stages.find(s => s.status === 'failed');
    const showStages = stageTotal > 0 && (t.status === 'RUNNING' || t.status === 'FAILED' || (t.status === 'CANCELLED' && stageDone > 0));
    const pct = t.status === 'RUNNING' && stageTotal > 0 ? Math.min(100, Math.round(((stageDone + 0.5) / stageTotal) * 100)) : 0;
    const retryIn = t.next_retry_at ? Math.max(0, Math.ceil((new Date(t.next_retry_at).getTime() - now) / 1000)) : null;

    return (
      <li key={t.id} className={`queue-row tone-${vocab.tone}`}>
        <div className="queue-row-main">
          <span className={`status-pill ${vocab.tone}`}><StatusIcon status={t.status} /> {vocab.label}</span>
          {t.doc_id ? (
            <button
              type="button"
              className="queue-file queue-file-link"
              onClick={() => onOpenDocument(t.doc_id!)}
              title={`Buka dokumen: ${displayName}`}
            >
              <FileLabel name={displayName} />
            </button>
          ) : (
            <span className="queue-file" title={displayName}><FileLabel name={displayName} /></span>
          )}
          <div className="queue-actions">
            {confirming ? (
              <span className="queue-confirm" role="group" aria-label={`Konfirmasi pembatalan ${displayName}`}>
                <span className="queue-confirm-note">Batalkan tugas ini?</span>
                <button type="button" className="module-btn danger" onClick={() => cancelTask(t)} disabled={busy}>
                  {busy ? 'Membatalkan…' : 'Ya'}
                </button>
                <button type="button" className="module-btn quiet" onClick={() => setConfirmCancelId(null)} disabled={busy}>Tidak</button>
              </span>
            ) : (
              <>
                {canRetry && (
                  <button type="button" className="module-btn quiet" onClick={() => retryTask(t)} disabled={busy} aria-label={`Ulangi ${displayName}`}>
                    <RotateCcw size={13} aria-hidden="true" /> {busy ? 'Mengulang…' : 'Ulangi'}
                  </button>
                )}
                {canCancel && (
                  <button type="button" className="module-btn quiet" onClick={() => setConfirmCancelId(t.id)} aria-label={`Batalkan ${displayName}`}>
                    <X size={13} aria-hidden="true" /> Batalkan
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="queue-meta">
          <span className="queue-meta-item" title={time.title}><Clock size={12} aria-hidden="true" /> {time.text}</span>
          {t.uploader && <span className="queue-meta-item"><User size={12} aria-hidden="true" /> {t.uploader}</span>}
          {t.attempts > 0 && (
            <span className={`queue-meta-item${t.status === 'FAILED' && t.attempts >= t.max_attempts ? ' is-exhausted' : ''}`}>
              <RefreshCw size={12} aria-hidden="true" /> Percobaan {t.attempts}/{t.max_attempts}
            </span>
          )}
        </div>

        {t.status === 'RUNNING' && stageTotal > 0 && (
          <div className="queue-progress">
            <div className="progress-track queue-progress-track" role="progressbar"
              aria-label={`Progres ${displayName}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
              aria-valuetext={`Tahap ${currentIdx + 1} dari ${stageTotal}: ${t.stage ?? ''}`}>
              <div className="progress-fill level-ok" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <span className="queue-progress-label">
              {t.cancel_requested
                ? 'Pembatalan diminta, berhenti setelah tahap ini'
                : `Tahap ${currentIdx + 1}/${stageTotal} · ${t.stage ?? '…'}`}
            </span>
          </div>
        )}

        {showStages && (
          <ol className="queue-stages" aria-label="Status per tahap">
            {t.stages.map(s => (
              <li key={s.name} className={`queue-stage is-${s.status}`}>
                {s.status === 'done' ? <Check size={11} aria-hidden="true" />
                  : s.status === 'running' ? <Loader2 size={11} className="admin-spin" aria-hidden="true" />
                    : s.status === 'failed' ? <X size={11} aria-hidden="true" />
                      : <Circle size={9} aria-hidden="true" />}
                <span>{s.name}</span>
                <span className="queue-sr">
                  {s.status === 'done' ? ' selesai' : s.status === 'running' ? ' sedang berjalan' : s.status === 'failed' ? ' gagal' : ' menunggu'}
                </span>
              </li>
            ))}
          </ol>
        )}

        {(t.status === 'FAILED' || t.status === 'CANCELLED') && t.error && (
          <div className={`queue-error${t.status === 'CANCELLED' ? ' is-neutral' : ''}`}>
            <AlertTriangle size={13} aria-hidden="true" />
            <div>
              <p className="queue-error-reason">
                {failedStage ? <>Gagal di tahap “{failedStage.name}”: </> : null}{t.error}
              </p>
              {t.status === 'FAILED' && (
                <p className="queue-error-hint">
                  {retryIn !== null
                    ? `Coba ulang otomatis dalam ${retryIn} dtk.`
                    : !t.retryable
                      ? 'Tidak dapat diulang. Unggah ulang dokumen.'
                      : t.attempts >= t.max_attempts
                        ? 'Percobaan otomatis habis. Ulangi secara manual.'
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
        <h3 className="module-title"><Play size={18} aria-hidden="true" /> Antrean Pemrosesan</h3>
        <span className="queue-live" title={`Antrean diperbarui otomatis setiap ${Math.round(intervalMs / 1000)} detik saat ada aktivitas.`}>
          <span className={`live-dot${paused ? ' is-paused' : ''}`} aria-hidden="true" />
          {paused ? 'Dijeda' : `Otomatis ${Math.round(intervalMs / 1000)} dtk`}
        </span>
      </div>

      <div className="queue-summary" role="group" aria-label="Ringkasan antrean">
        {summary.length === 0 ? (
          <span className="queue-summary-empty">Tidak ada tugas berjalan atau menunggu.</span>
        ) : (
          summary.map(({ status, n }, i) => (
            <span key={status} className="queue-summary-part">
              {i > 0 && <span aria-hidden="true">·</span>}
              <button type="button" className={`queue-count tone-${VOCAB[status].tone}`} onClick={() => jumpTo(status)}
                aria-label={`${n} ${VOCAB[status].plural}, tampilkan`}>
                <strong>{n}</strong> {VOCAB[status].plural}
              </button>
            </span>
          ))
        )}
      </div>

      <div className="queue-toolbar">
        <div className="queue-tabs" role="tablist" aria-label="Tampilan antrean">
          <button type="button" role="tab" aria-selected={tab === 'active'} className={`queue-tab${tab === 'active' ? ' is-selected' : ''}`} onClick={() => switchTab('active')}>
            Aktif <span className="queue-tab-count">{activeTasks.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'history'} className={`queue-tab${tab === 'history' ? ' is-selected' : ''}`} onClick={() => switchTab('history')}>
            Riwayat <span className="queue-tab-count">{historyTasks.length}</span>
          </button>
        </div>
        <select className="monitoring-select" value={filter} onChange={e => applyFilter(e.target.value as Filter)} aria-label="Saring berdasarkan status">
          <option value="ALL">Semua status ({inTab.length})</option>
          {filterOptions.map(s => <option key={s} value={s}>{VOCAB[s].label} ({countIn(s)})</option>)}
        </select>
      </div>

      <div className="module-content queue-content" tabIndex={0} role="tabpanel" aria-live="off">
        {shown.length === 0 ? (
          <div className="empty-state">
            <Play size={24} aria-hidden="true" />
            <span>
              {inTab.length === 0
                ? tab === 'active' ? 'Antrean kosong. Semua tugas sudah selesai.' : 'Belum ada riwayat tugas sejak backend dimulai.'
                : 'Tidak ada tugas dengan status ini.'}
            </span>
          </div>
        ) : (
          <ul className="queue-list">{shown.map(renderRow)}</ul>
        )}
      </div>

      {(remaining > 0 || visible > PAGE_SIZE) && filtered.length > PAGE_SIZE && (
        <div className="queue-more">
          <span className="pager-range">{shown.length} dari {filtered.length}</span>
          {remaining > 0 && (
            <button type="button" className="module-btn quiet" onClick={() => setVisible(v => v + PAGE_SIZE)}>
              Tampilkan lebih banyak ({Math.min(PAGE_SIZE, remaining)})
            </button>
          )}
          {visible > PAGE_SIZE && remaining <= 0 && (
            <button type="button" className="module-btn quiet" onClick={() => setVisible(PAGE_SIZE)}>Ringkas</button>
          )}
        </div>
      )}
      <p className="table-footnote">Riwayat disimpan di memori backend dan hilang saat backend dimulai ulang. Pembatalan tugas berjalan berlaku di batas tahap.</p>
    </div>
  );
}
