import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle2, XCircle, Loader2, X, Trash2 } from 'lucide-react';
import { useJobStatus, type JobEntry, type JobType } from '../context/JobStatusContext';
import { useStrings, fill, formatAgo, type Dict } from '../i18n';

/* ── helpers ── */
function typeLabel(t: Dict, type: JobType): string {
  if (type === 'opinion') return t.notifTypeOpinion;
  if (type === 'contract') return t.notifTypeContract;
  return t.notifTypeRepository;
}

function statusIcon(status: JobEntry['status']) {
  if (status === 'completed') return <CheckCircle2 size={14} className="notif-icon notif-icon--ok" aria-hidden />;
  if (status === 'failed')    return <XCircle      size={14} className="notif-icon notif-icon--err" aria-hidden />;
  return <Loader2 size={14} className="notif-icon notif-icon--spin" aria-hidden />;
}

function relativeTime(t: Dict, ts: number | undefined): string {
  if (!ts) return '';
  return formatAgo(t, (Date.now() - ts) / 1000);
}

/* ── component ── */
export default function NotificationDock() {
  const { jobs, unreadCount, markAllRead, clearJob, clearFinished } = useJobStatus();
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });

  /* Position the panel above/beside the trigger button */
  const reposition = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPanelPos({
      bottom: window.innerHeight - r.top + 6,
      left: r.right + 8,
    });
  };

  /* Open: measure + mark read */
  const handleOpen = () => {
    reposition();
    setOpen(true);
    // Delay markAllRead by one frame so the badge count doesn't vanish
    // before the panel finishes opening (the user can see the badge go away).
    requestAnimationFrame(() => markAllRead());
  };

  /* Close on outside click or Escape */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  /* Reposition when window resizes while open */
  useEffect(() => {
    if (!open) return;
    const onResize = () => reposition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const activeJobs   = jobs.filter(j => j.status === 'uploading' || j.status === 'idle');
  const finishedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
  const hasFinished  = finishedJobs.length > 0;

  const panel = open ? (
    <div
      ref={panelRef}
      className="notif-panel"
      style={{ bottom: panelPos.bottom, left: panelPos.left }}
      role="dialog"
      aria-label={t.notifications}
    >
      {/* Header */}
      <div className="notif-panel-head">
        <span className="notif-panel-title">{t.notifications}</span>
        <div className="notif-panel-actions">
          {hasFinished && (
            <button
              type="button"
              className="notif-clear-btn"
              onClick={() => clearFinished()}
              title={t.notifClearFinished}
              aria-label={t.notifClearFinishedAria}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            className="notif-close-btn"
            onClick={() => setOpen(false)}
            aria-label={t.notifClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {jobs.length === 0 && (
        <div className="notif-empty">{t.notifEmpty}</div>
      )}

      {/* In-progress */}
      {activeJobs.length > 0 && (
        <div className="notif-section">
          <div className="notif-section-label">{t.notifRunning}</div>
          {activeJobs.map(job => (
            <div key={job.id} className="notif-row notif-row--active">
              {statusIcon(job.status)}
              <div className="notif-text">
                <span className="notif-label">{job.label}</span>
                <span className="notif-meta">{typeLabel(t, job.type)}</span>
              </div>
              <button
                type="button"
                className="notif-dismiss"
                onClick={() => clearJob(job.id)}
                aria-label={t.notifRemove}
              ><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Finished */}
      {hasFinished && (
        <div className="notif-section">
          <div className="notif-section-label">{t.notifFinished}</div>
          {finishedJobs.map(job => (
            <div
              key={job.id}
              className={`notif-row${job.status === 'failed' ? ' notif-row--err' : ' notif-row--ok'}`}
            >
              {statusIcon(job.status)}
              <div className="notif-text">
                <span className="notif-label">{job.label}</span>
                <span className="notif-meta">
                  {typeLabel(t, job.type)}
                  {job.finishedAt ? ` · ${relativeTime(t, job.finishedAt)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="notif-dismiss"
                onClick={() => clearJob(job.id)}
                aria-label={t.notifRemove}
              ><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      {/* Bell trigger — sits in the sb-footer like Settings and Help */}
      <button
        ref={btnRef}
        type="button"
        className={`sb-row notif-trigger${open ? ' sb-active' : ''}`}
        onClick={open ? () => setOpen(false) : handleOpen}
        aria-label={t.notifications}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-tip={t.notifications}
      >
        <Bell size={20} className="sb-icon" aria-hidden />
        <span className="sb-label">{t.notifications}</span>
        {unreadCount > 0 && (
          <span className="sb-badge notif-badge" aria-label={fill(t.notifNewCount, { n: unreadCount })}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel rendered into a portal so it escapes sidebar overflow:hidden */}
      {createPortal(panel, document.body)}
    </>
  );
}
