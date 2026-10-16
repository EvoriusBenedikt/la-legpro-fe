import React, { createContext, useContext, useState, useCallback } from 'react';

export type JobStatus = 'idle' | 'uploading' | 'completed' | 'failed';

export type JobType = 'opinion' | 'contract' | 'repository';

export interface JobEntry {
  id: string;
  status: JobStatus;
  label: string;
  type: JobType;
  /** epoch ms when the status last changed to completed/failed */
  finishedAt?: number;
  /** true until the user opens the notification panel */
  unread: boolean;
}

export interface JobStatusContextProps {
  jobs: JobEntry[];
  /** Create or update a job entry */
  addJob: (id: string, status: JobStatus, label: string, type: JobType) => void;
  /** Update only the status (and finishedAt) of an existing job */
  updateJob: (id: string, status: JobStatus) => void;
  /** Remove a job entirely */
  clearJob: (jobId: string) => void;
  /** Clear all terminal (completed/failed) jobs */
  clearFinished: () => void;
  /** Mark all jobs as read (badge goes to 0) */
  markAllRead: () => void;
  /** Count of unread completed/failed jobs — drives the badge */
  unreadCount: number;

  // ── legacy compat (NotificationDock + wiring sites still use these) ──
  /** @deprecated use addJob */
  addStatus: (jobId: string, status: JobStatus) => void;
  /** @deprecated use clearJob */
  clearStatus: (jobId: string) => void;
}

export const JobStatusContext = createContext<JobStatusContextProps | undefined>(undefined);

export const JobStatusProvider: React.FC<{ children: React.ReactNode; userId: string }> = ({
  children,
  userId: _userId,
}) => {
  const [jobs, setJobs] = useState<JobEntry[]>([]);

  const addJob = useCallback((id: string, status: JobStatus, label: string, type: JobType) => {
    setJobs(prev => {
      const existing = prev.find(j => j.id === id);
      const terminal = status === 'completed' || status === 'failed';
      if (existing) {
        return prev.map(j =>
          j.id === id
            ? {
                ...j,
                status,
                label,
                type,
                finishedAt: terminal ? Date.now() : j.finishedAt,
                unread: terminal ? true : j.unread,
              }
            : j,
        );
      }
      return [
        ...prev,
        {
          id,
          status,
          label,
          type,
          finishedAt: terminal ? Date.now() : undefined,
          unread: terminal,
        },
      ];
    });
  }, []);

  const updateJob = useCallback((id: string, status: JobStatus) => {
    setJobs(prev =>
      prev.map(j => {
        if (j.id !== id) return j;
        const terminal = status === 'completed' || status === 'failed';
        return {
          ...j,
          status,
          finishedAt: terminal ? Date.now() : j.finishedAt,
          unread: terminal ? true : j.unread,
        };
      }),
    );
  }, []);

  const clearJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === 'uploading' || j.status === 'idle'));
  }, []);

  const markAllRead = useCallback(() => {
    setJobs(prev => prev.map(j => ({ ...j, unread: false })));
  }, []);

  const unreadCount = jobs.filter(j => j.unread && (j.status === 'completed' || j.status === 'failed')).length;

  // ── legacy shim ──
  const addStatus = useCallback(
    (jobId: string, status: JobStatus) => {
      // Legacy callers don't supply a label/type; we infer a minimal entry.
      addJob(jobId, status, jobId, 'repository');
    },
    [addJob],
  );

  const clearStatus = useCallback((jobId: string) => clearJob(jobId), [clearJob]);

  // SSE connection – uncomment once the backend /notifications/{userId} endpoint is live.
  // useEffect(() => {
  //   const source = new EventSource(`/notifications/${_userId}`);
  //   source.addEventListener('message', (event) => {
  //     const data = JSON.parse(event.data);
  //     updateJob(data.jobId, data.status as JobStatus);
  //   });
  //   return () => { source.close(); };
  // }, [_userId]);

  return (
    <JobStatusContext.Provider
      value={{ jobs, addJob, updateJob, clearJob, clearFinished, markAllRead, unreadCount, addStatus, clearStatus }}
    >
      {children}
    </JobStatusContext.Provider>
  );
};

export const useJobStatus = () => {
  const ctx = useContext(JobStatusContext);
  if (!ctx) throw new Error('useJobStatus must be used within JobStatusProvider');
  return ctx;
};
