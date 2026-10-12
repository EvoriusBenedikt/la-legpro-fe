import axios from 'axios';
import { API_BASE } from '../config';

const api = axios.create({
  baseURL: API_BASE,
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('la_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if unauthorized
      localStorage.removeItem('la_token');
      localStorage.removeItem('la_user');
      window.dispatchEvent(new Event('auth-error'));
    }
    return Promise.reject(error);
  }
);

export interface HttpError {
  response: {
    status: number;
    data?: { detail?: string; message?: string };
  };
}

/** True when a caught value is an axios error carrying a server response (4xx/5xx).
    Lets call sites keep the old fetch-style split between HTTP errors and network errors. */
export function isHttpError(e: unknown): e is HttpError {
  return axios.isAxiosError(e) && !!e.response;
}

/** True when an axios request failed with no server response at all — backend
    unreachable, DNS failure, timeout, or CORS. Distinct from isHttpError: an
    infrastructure failure, not an HTTP status, so auth surfaces must not
    report it as a credential problem (critique P2 2026-10-06). */
export function isNetworkError(e: unknown): boolean {
  return axios.isAxiosError(e) && !e.response;
}

/** True when the request was canceled through its AbortController — the user
    pressed the stop control (critique remediation P1-2, 2026-10-08). Checked
    BEFORE isNetworkError at call sites: a canceled request also carries no
    response, but it is the user's decision, not an infrastructure failure. */
export function isAbortError(e: unknown): boolean {
  return axios.isCancel(e) || (axios.isAxiosError(e) && e.code === 'ERR_CANCELED');
}

/** True when axios' own per-request timeout fired before the server answered
    (critique remediation P1-2, 2026-10-08). Also response-less — same
    ordering caveat as isAbortError. */
export function isTimeoutError(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT');
}

// ── Chat attachments (2026-10-12) ──────────────────────────────────────────
// Clients for the /api/chat-attachments endpoints (BE Task 1). Exported as
// named helpers — like isHttpError above — because three surfaces share them
// (composer chips, history chips, delete handlers) and the error-code mapping
// must live in exactly one place.

export interface AttachmentMeta {
  id: string;
  kind: 'image' | 'pdf';
  filename: string;
  mime: string;
  bytes: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  storage_mode: string | null;
}

/** BE 413/415/422 carry machine codes ('oversize' | 'type' | 'limit') in
    `detail`. Rethrow those as Error(code) so chip callers can map to i18n
    strings; every other failure passes through untouched for the generic
    isHttpError/isNetworkError handling at call sites. */
function rethrowUploadCode(e: unknown): never {
  if (isHttpError(e)) {
    const code = e.response.data?.detail;
    if (code === 'oversize' || code === 'type' || code === 'limit') {
      throw new Error(code);
    }
  }
  throw e;
}

/** Upload one file (multipart, one file per POST — BE contract). Images come
    back status 'ready'; PDFs 'processing' until the BE pipeline flips them. */
export async function uploadAttachment(
  conversationId: string,
  file: File
): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append('conversation_id', conversationId);
  form.append('file', file);
  try {
    const res = await api.post('/api/chat-attachments', form);
    return res.data as AttachmentMeta;
  } catch (e) {
    rethrowUploadCode(e);
  }
}

/** All attachment metadata for one conversation (single GET per conversation
    switch — history chips hydrate from this). */
export async function listAttachments(conversationId: string): Promise<AttachmentMeta[]> {
  const res = await api.get('/api/chat-attachments', {
    params: { conversation_id: conversationId },
  });
  return res.data as AttachmentMeta[];
}

/** Content fetch through axios so the JWT rides in the header (never in a
    URL). Blob feeds <img> object URLs and the PDF new-tab window. */
export async function fetchAttachmentBlob(id: string): Promise<Blob> {
  const res = await api.get(`/api/chat-attachments/${id}/content`, {
    responseType: 'blob',
  });
  return res.data as Blob;
}

export async function deleteAttachment(id: string): Promise<void> {
  await api.delete(`/api/chat-attachments/${id}`);
}

/** Bulk delete — fired by conversation delete, bulk delete, and
    clear-messages so server storage never outlives the FE conversation. */
export async function deleteConversationAttachments(conversationId: string): Promise<void> {
  await api.delete('/api/chat-attachments', {
    params: { conversation_id: conversationId },
  });
}

export default api;
