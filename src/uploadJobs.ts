import type { UploadJob } from './hooks/useContractUpload';

/* Storage + retention data layer for the Contracts upload-job records,
   split out of context/ContractUploadContext.tsx (2026-10-13, critique
   P1·1 remediation) so the settings dialog can count a retention
   window's impact without reaching into the provider. The provider
   stays the only writer of live job state; this module owns the
   persisted-record contract: storage key, cap, load migration,
   retention pruning and the impact count. */

export const MAX_JOBS = 20;
const JOBS_STORAGE_KEY = 'la_upload_jobs';

/* Job records persist to localStorage (critique P1 #1): a refresh
   mid-analysis used to evaporate every trace of the work. The File itself
   cannot survive a reload, so restored 'processing' records come back as
   honest 'interrupted' entries with a re-upload hint; failures that happen
   within the session keep their File handle and offer a real retry. */
export function loadPersistedJobs(): UploadJob[] {
  try {
    const raw = window.localStorage.getItem(JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UploadJob[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.slice(-MAX_JOBS).map(j => ({
      ...j,
      status: j.status === 'processing' ? ('interrupted' as const) : j.status,
      // Records persisted before createdAt existed get stamped at load:
      // conservative — they will not auto-prune until a full retention
      // window has elapsed from today.
      createdAt: j.createdAt ?? now,
    }));
  } catch {
    return []; // corrupt or blocked storage: start clean rather than crash
  }
}

/** Mirror of the provider's persistence effect: capped, and silent when
    storage is full or blocked (the jobs panel still works in-session). */
export function persistJobs(jobs: UploadJob[]): void {
  try {
    window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(-MAX_JOBS)));
  } catch {
    // storage full or blocked: the jobs panel still works in-session
  }
}

/** Drops finished job records older than the retention window (Settings ›
    Advanced › Analysis history; 0 = keep forever). In-flight jobs are never
    pruned — they are live work in this session. Analyzed documents are
    server-side data and are never touched here. */
export function pruneByRetention(list: UploadJob[], retentionDays: number): UploadJob[] {
  if (retentionDays <= 0) return list;
  const cutoff = Date.now() - retentionDays * 86400000;
  // Missing createdAt (shouldn't happen — load stamps it) counts as exactly
  // at the cutoff: kept.
  return list.filter(j => j.status === 'processing' || (j.createdAt ?? cutoff) >= cutoff);
}

/** How many persisted records a retention window would delete right now —
    the impact figure the retention row reports when the window changes
    (critique P1·1: the prune used to be silent). Shares pruneByRetention,
    so the number cannot drift from what the provider actually drops.
    Read before setSetting: the provider's subscriber prunes its state
    synchronously afterwards and its persistence effect writes later, so
    storage still holds the pre-prune list at this point. */
export function countPrunableJobs(retentionDays: number): number {
  if (retentionDays <= 0) return 0;
  const list = loadPersistedJobs();
  return list.length - pruneByRetention(list, retentionDays).length;
}
