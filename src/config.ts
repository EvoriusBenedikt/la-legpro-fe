// Production builds default to SAME-ORIGIN (''): the FE nginx reverse-proxies
// /api/ to the backend (nginx.conf), so a co-located stack needs no baked URL
// and cannot ship a wrong-host API base. Dev defaults to the local backend
// container; an explicit VITE_API_URL / FE_API_URL build arg still wins for
// split-host deployments.
export const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '');
