import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { API_BASE } from '../config';

export interface UploadJob {
  id: string;
  filename: string;
  status: 'processing' | 'done' | 'error';
  error?: string;
}

interface UploadToast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface ContractUploadContextType {
  jobs: UploadJob[];
  /** Queue an analyze → save-to-history job that keeps running across route changes */
  startUpload: (file: File, useOCR: boolean) => void;
  /** Listen for finished jobs (done or error); returns an unsubscribe function */
  subscribe: (listener: (job: UploadJob) => void) => () => void;
}

const ContractUploadContext = createContext<ContractUploadContextType | undefined>(undefined);

const MAX_JOBS = 20;

/* Lives above the router so contract-analysis uploads survive navigation:
   the modal only hands the file over, the provider runs the pipeline,
   notifies via toasts, and tells subscribers (Contracts page) when done. */
export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [toasts, setToasts] = useState<UploadToast[]>([]);
  const listenersRef = useRef<Set<(job: UploadJob) => void>>(new Set());
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((kind: UploadToast['kind'], message: string, ttl: number) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), ttl);
  }, [dismissToast]);

  const subscribe = useCallback((listener: (job: UploadJob) => void) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const startUpload = (file: File, useOCR: boolean) => {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = file.name;
    setJobs(prev => [...prev, { id, filename, status: 'processing' as const }].slice(-MAX_JOBS));
    pushToast('info', `Analisis "${filename}" berjalan di latar belakang.`, 5000);

    (async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('use_ocr', useOCR.toString());

        const response = await fetch(API_BASE + '/api/check-compliance', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Gagal memproses dokumen.');
        }
        const data = await response.json();
        const results = data.report;
        const summary = data.summary || null;

        const saveRes = await fetch(API_BASE + '/api/compliance-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            filename,
            company_name: summary?.pihak_pertama && summary?.pihak_kedua
              ? `${summary.pihak_pertama} & ${summary.pihak_kedua}`
              : summary?.pihak_pertama || summary?.pihak_kedua || null,
            expiration_date: summary?.tanggal_berakhir || null,
            results: { summary, results },
          }),
        });
        if (!saveRes.ok) throw new Error('Analisis selesai, tetapi gagal menyimpan hasil analisis.');

        const doneJob: UploadJob = { id, filename, status: 'done' };
        setJobs(prev => prev.map(j => (j.id === id ? doneJob : j)));
        pushToast('success', `Analisis "${filename}" selesai — dokumen ditambahkan ke Contracts.`, 8000);
        listenersRef.current.forEach(listener => listener(doneJob));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
        const errJob: UploadJob = { id, filename, status: 'error', error: message };
        setJobs(prev => prev.map(j => (j.id === id ? errJob : j)));
        pushToast('error', `Analisis "${filename}" gagal: ${message}`, 12000);
        listenersRef.current.forEach(listener => listener(errJob));
      }
    })();
  };

  return (
    <ContractUploadContext.Provider value={{ jobs, startUpload, subscribe }}>
      {children}
      <div className="upload-toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`upload-toast upload-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'success' ? <CheckCircle size={16} /> : t.kind === 'error' ? <AlertTriangle size={16} /> : <RefreshCw size={16} className="animate-spin-slow" />}
            <span>{t.message}</span>
            <button type="button" className="upload-toast-close" onClick={() => dismissToast(t.id)} aria-label="Tutup notifikasi">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ContractUploadContext.Provider>
  );
};

export const useContractUpload = () => {
  const context = useContext(ContractUploadContext);
  if (context === undefined) {
    throw new Error('useContractUpload must be used within an UploadProvider');
  }
  return context;
};
