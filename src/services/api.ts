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

export default api;
