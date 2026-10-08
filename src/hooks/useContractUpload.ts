import { createContext, useContext } from 'react';

/* Context object, types and consumer hook split out of
   context/ContractUploadContext.tsx (2026-10-06):
   react-refresh/only-export-components requires component files to export
   only components, so the provider file now keeps just UploadProvider and
   imports the context from here. */

export interface UploadJob {
  id: string;
  filename: string;
  /** Epoch ms at queue time; used by retention pruning (Settings ›
      Advanced › Analysis history). Optional: records persisted before
      it existed are stamped at load time, so they are never pruned
      earlier than promised. */
  createdAt?: number;
  /** 'interrupted': the job was in flight when the page reloaded. Records
      persist in localStorage, the File itself cannot — so an interrupted
      job is honest history, not a resumable transfer (critique P1 #1). */
  status: 'processing' | 'done' | 'error' | 'interrupted';
  error?: string;
}

export interface ContractUploadContextType {
  jobs: UploadJob[];
  /** Queue an analyze → save-to-history job that keeps running across route changes */
  startUpload: (file: File, useOCR: boolean) => void;
  /** Re-run a failed job whose File is still held in memory (same session).
      Jobs restored from storage have no file left — the provider says so
      via toast instead of failing silently. */
  retryJob: (id: string) => void;
  /** Drop finished records (done/error/interrupted) from the panel + storage */
  clearJobs: () => void;
  /** Push a message onto the shared toast stack; ttl defaults per kind
      (errors stay longer). Lets pages reuse the one notification system. */
  notify: (kind: 'info' | 'success' | 'error', message: string, ttl?: number) => void;
  /** Listen for finished jobs (done or error); returns an unsubscribe function */
  subscribe: (listener: (job: UploadJob) => void) => () => void;
}

export const ContractUploadContext = createContext<ContractUploadContextType | undefined>(undefined);

export const useContractUpload = () => {
  const context = useContext(ContractUploadContext);
  if (context === undefined) {
    throw new Error('useContractUpload must be used within an UploadProvider');
  }
  return context;
};
