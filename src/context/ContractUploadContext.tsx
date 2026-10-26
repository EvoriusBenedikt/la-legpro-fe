import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, X } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { getSettings, subscribeSettings } from '../settings';
import { useStrings, msg, LocalizedError, type Msg } from '../i18n';
import { apiErrorMsg } from '../apiErrors';
import { ContractUploadContext, type UploadJob } from '../hooks/useContractUpload';
import { MAX_JOBS, loadPersistedJobs, persistJobs, pruneByRetention } from '../uploadJobs';
import { useJobStatus } from './JobStatusContext';

interface UploadToast {
  id: number;
  kind: 'info' | 'success' | 'error';
  /* A Msg, not text: toasts re-render in the active language. */
  message: Msg;
}

/* Lives above the router so contract-analysis uploads survive navigation:
   the modal only hands the file over, the provider runs the pipeline,
   notifies via toasts, and tells subscribers (Contracts page) when done. */
export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<UploadJob[]>(() =>
    pruneByRetention(loadPersistedJobs(), getSettings().jobRetentionDays)
  );
  const t = useStrings();
  const [toasts, setToasts] = useState<UploadToast[]>([]);
  const listenersRef = useRef<Set<(job: UploadJob) => void>>(new Set());
  const toastIdRef = useRef(0);
  const fileRefs = useRef<Map<string, { file: File; useOCR: boolean; notebookId?: string }>>(new Map());

  const { addJob, updateJob } = useJobStatus();

  useEffect(() => {
    persistJobs(jobs);
  }, [jobs]);

  // Retention changes apply immediately: the moment a window is picked in
  // Settings › Advanced, older finished records are pruned. Identity is
  // preserved when nothing qualifies, so the persistence effect does not
  // re-fire pointlessly.
  useEffect(
    () =>
      subscribeSettings(() => {
        const days = getSettings().jobRetentionDays;
        setJobs(prev => {
          const next = pruneByRetention(prev, days);
          return next.length === prev.length ? prev : next;
        });
      }),
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((kind: UploadToast['kind'], message: Msg, ttl: number) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), ttl);
  }, [dismissToast]);

  /** Shared toast entry point for pages (delete/save/load failures) so the
      whole app speaks through one notification system. */
  const notify = useCallback((kind: UploadToast['kind'], message: Msg, ttl?: number) => {
    pushToast(kind, message, ttl ?? (kind === 'error' ? 12000 : 6000));
  }, [pushToast]);

  const subscribe = useCallback((listener: (job: UploadJob) => void) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  /** The analyze → save pipeline for one job id. The job record must already
      exist in state (startUpload/retryJob put it there as 'processing').
      notebookId: set when the upload was started inside a notebook so the
      new document JOINS that notebook's document list (grouped notebooks). */
  const runJob = (id: string, filename: string, file: File, useOCR: boolean, notebookId?: string) => {
    (async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('use_ocr', useOCR.toString());
        // B3: a contract analyzed inside a workspace checks its clauses against
        // THAT workspace's internal refs + global public law; a top-level
        // analysis (no notebookId) omits it -> global behavior.
        if (notebookId) formData.append('report_id', notebookId);

        // axios sets the multipart boundary for FormData automatically
        const response = await api.post('/api/check-compliance', formData).catch((e) => {
          throw new LocalizedError(apiErrorMsg(e, 'errProcessDoc'));
        });
        const data = response.data;
        const results = data.report;
        const summary = data.summary || null;

        const saved = await api.post('/api/compliance-history', {
          filename,
          company_name: summary?.pihak_pertama && summary?.pihak_kedua
            ? `${summary.pihak_pertama} & ${summary.pihak_kedua}`
            : summary?.pihak_pertama || summary?.pihak_kedua || null,
          expiration_date: summary?.tanggal_berakhir || null,
          results: { summary, results },
          notebook_id: notebookId ?? null,
        }).catch((e) => {
          throw new LocalizedError({ key: isHttpError(e) ? 'errSaveAnalysis' : 'errNetwork' });
        });

        // FEAT phase-2b (2026-10-24): persist the original document bytes so
        // the pengguna notebook preview can render the real file (the
        // analyze endpoint deleted its temp copy). Best-effort: a failed
        // source-file storage only drops the pdf preview — the report row
        // and every other feature keep working with the summary card.
        const savedReportId = saved?.data?.report_id;
        if (savedReportId) {
          const fileForm = new FormData();
          fileForm.append('file', file);
          await api.post(`/api/compliance-history/${savedReportId}/file`, fileForm)
            .catch(() => { /* non-fatal: preview falls back to the summary card */ });
        }

        // Spread onto the record so createdAt survives for retention aging;
        // error: undefined clears a stale retry-failure message. reportId
        // lets subscribers (notebook page) follow the NEW document.
        const doneJob: UploadJob = { id, filename, status: 'done', error: undefined, reportId: savedReportId };
        fileRefs.current.delete(id);
        setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...doneJob } : j)));
        pushToast('success', { key: 'ucDone', params: { filename } }, 8000);
        updateJob(id, 'completed');
        listenersRef.current.forEach(listener => listener(doneJob));
      } catch (err) {
        // Persist the reason as a Msg so the failure re-renders in the active language.
        const reason: Msg = err instanceof LocalizedError ? err.msg : { key: 'errSystem' };
        const errJob: UploadJob = { id, filename, status: 'error', error: reason };
        // Keep the fileRef: the jobs panel offers "Coba lagi" for in-session
        // failures — a failed job is no longer a dead end (critique P1 #1).
        // Spread preserves createdAt for retention aging.
        setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...errJob } : j)));
        pushToast('error', { key: 'ucFailed', params: { filename, reason } }, 12000);
        updateJob(id, 'failed');
        listenersRef.current.forEach(listener => listener(errJob));
      }
    })();
  };

  const startUpload = (file: File, useOCR: boolean, notebookId?: string) => {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = file.name;
    // The notebook context must survive a retry: keep it beside the file ref.
    fileRefs.current.set(id, { file, useOCR, notebookId });
    setJobs(prev => [...prev, { id, filename, status: 'processing' as const, createdAt: Date.now() }].slice(-MAX_JOBS));
    pushToast('info', { key: 'ucRunning', params: { filename } }, 5000);
    addJob(id, 'uploading', filename, 'contract');
    runJob(id, filename, file, useOCR, notebookId);
  };

  const retryJob = (id: string) => {
    const ref = fileRefs.current.get(id);
    const job = jobs.find(j => j.id === id);
    if (!ref || !job) {
      // Restored from storage after a reload — the File is gone for good.
      pushToast('error', {
        key: 'ucFileGone',
        params: { filename: job?.filename ?? { key: 'ucFileGoneName' } },
      }, 12000);
      return;
    }
    // Spread preserves createdAt; error: undefined clears the failure message.
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, status: 'processing' as const, error: undefined } : j)));
    pushToast('info', { key: 'ucRetrying', params: { filename: job.filename } }, 5000);
    addJob(id, 'uploading', job.filename, 'contract');
    runJob(id, job.filename, ref.file, ref.useOCR, ref.notebookId);
  };

  const clearJobs = () => {
    // In-flight jobs stay (they still own a pending promise + toast);
    // terminal records leave the panel and the storage.
    jobs.forEach(j => { if (j.status !== 'processing') fileRefs.current.delete(j.id); });
    setJobs(prev => prev.filter(j => j.status === 'processing'));
  };

  return (
    <ContractUploadContext.Provider value={{ jobs, startUpload, retryJob, clearJobs, notify, subscribe }}>
      {children}
      {/* Single live region: the container announces insertions; per-toast
          role="alert"/"status" would nest a second live region and make
          every toast double-announce (critique minor, 2026-10-06). */}
      <div className="upload-toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`upload-toast upload-toast--${toast.kind}`}>
            {toast.kind === 'success' ? <CheckCircle size={16} /> : toast.kind === 'error' ? <AlertTriangle size={16} /> : <RefreshCw size={16} className="animate-spin-slow" />}
            <span>{msg(t, toast.message)}</span>
            <button type="button" className="upload-toast-close" onClick={() => dismissToast(toast.id)} aria-label={t.notifClose}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ContractUploadContext.Provider>
  );
};
