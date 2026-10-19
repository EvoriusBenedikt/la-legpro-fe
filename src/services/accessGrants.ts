import api from './api';

export type GrantPermission = 'full' | 'read';
export type GrantStatus = 'active' | 'expired';
export type GrantSort = 'newest' | 'expiry' | 'last_accessed' | 'username';

export interface AccessGrant {
  id: string;
  doc_id: string;
  granted_to: string;
  username: string | null;
  email: string | null;
  granted_by: string;
  granted_by_username: string;
  /** null when the reason is hidden (reason_hidden) */
  reason: string | null;
  reason_hidden: boolean;
  expires_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
  permission: GrantPermission;
  judul: string | null;
  klasifikasi: string | null;
  expiring_soon: boolean;
  status: GrantStatus;
}

export interface GrantFilters {
  status: GrantStatus;
  search: string;
  permission: '' | GrantPermission;
  expiry: '' | 'expiring' | 'never';
  grantedBy: string;
  sort: GrantSort;
}

export interface GrantList {
  grants: AccessGrant[];
  total: number;
  page: number;
  page_size: number;
  active_total: number;
  expiring_soon_days: number;
  granters: { id: string; username: string }[];
}

export type ExpirySpec =
  | { mode: 'extend'; days: number }
  | { mode: 'set'; expires_at: string }
  | { mode: 'never' };

export interface GrantEvent {
  id: number;
  grant_id: string;
  event_type: string;
  actor_name: string | null;
  grantee_name: string | null;
  doc_title: string | null;
  doc_id: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface BulkResult {
  results: { id: string; ok: boolean; code?: string; username?: string | null }[];
  ok_count: number;
  fail_count: number;
}

const BASE = '/api/admin/access-grants';

const filterParams = (f: GrantFilters) => ({
  status: f.status,
  sort: f.sort,
  ...(f.search.trim() ? { search: f.search.trim() } : {}),
  ...(f.permission ? { permission: f.permission } : {}),
  ...(f.expiry === 'expiring' ? { expiring: true } : {}),
  ...(f.expiry === 'never' ? { never_expires: true } : {}),
  ...(f.grantedBy ? { granted_by: f.grantedBy } : {}),
});

export const listGrants = async (f: GrantFilters, page: number, pageSize: number, signal?: AbortSignal) =>
  (await api.get<GrantList>(BASE, { params: { ...filterParams(f), page, page_size: pageSize }, signal })).data;

export const listGrantIds = async (f: GrantFilters) =>
  (await api.get<{ ids: string[]; total: number; truncated: boolean }>(`${BASE}/ids`, { params: filterParams(f) })).data;

export const listHistory = async (
  p: { search: string; eventType: string; from: string; to: string },
  page: number, pageSize: number, signal?: AbortSignal,
) =>
  (await api.get<{ events: GrantEvent[]; total: number }>(`${BASE}/history`, {
    params: {
      page, page_size: pageSize,
      ...(p.search.trim() ? { search: p.search.trim() } : {}),
      ...(p.eventType ? { event_type: p.eventType } : {}),
      ...(p.from ? { date_from: p.from } : {}),
      ...(p.to ? { date_to: p.to } : {}),
    },
    signal,
  })).data;

export const revokeGrant = (id: string) => api.post(`${BASE}/${id}/revoke`, {});
export const setGrantExpiry = (id: string, spec: ExpirySpec) => api.patch(`${BASE}/${id}/expiry`, spec);
export const setGrantPermission = (id: string, permission: GrantPermission) =>
  api.patch(`${BASE}/${id}/permission`, { permission });
export const setGrantReasonVisible = (id: string, reason_visible: boolean) =>
  api.patch(`${BASE}/${id}/reason-visibility`, { reason_visible });
export const revealGrantReason = async (id: string) =>
  (await api.post<{ reason: string | null }>(`${BASE}/${id}/reveal-reason`)).data.reason;

export const bulkGrants = async (
  body: { action: 'revoke' } | { action: 'extend'; expiry: ExpirySpec } | { action: 'reason_visibility'; reason_visible: boolean },
  ids: string[],
) => (await api.post<BulkResult>(`${BASE}/bulk`, { ...body, ids })).data;
