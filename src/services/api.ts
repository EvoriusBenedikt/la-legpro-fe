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

export default api;
