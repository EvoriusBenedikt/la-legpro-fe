import { createContext, useContext } from 'react';

/* Context object, types and consumer hook split out of
   context/ContractUploadContext.tsx (2026-10-06):
   react-refresh/only-export-components requires component files to export
   only components, so the provider file now keeps just UploadProvider and
   imports the context from here. */

export interface UploadJob {
  id: string;
  filename: string;
  status: 'processing' | 'done' | 'error';
  error?: string;
}

export interface ContractUploadContextType {
  jobs: UploadJob[];
  /** Queue an analyze → save-to-history job that keeps running across route changes */
  startUpload: (file: File, useOCR: boolean) => void;
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
