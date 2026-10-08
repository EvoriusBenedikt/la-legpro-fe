// Production builds default to SAME-ORIGIN (''): the FE nginx reverse-proxies
// /api/ to the backend (nginx.conf), so a co-located stack needs no baked URL
// and cannot ship a wrong-host API base. Dev defaults to the local backend
// container; an explicit VITE_API_URL / FE_API_URL build arg still wins for
// split-host deployments.
export const API_BASE =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '');

// Legacy two-panel login escape hatch (Wise-style redesign rollout, user
// decision 2026-10-09): default ON so power users keep /login/legacy during
// the transition; set VITE_LEGACY_LOGIN=0 at build time to hide the route.
// Build-time only (Vite inlines import.meta.env) — flipping it needs a rebuild.
export const LEGACY_LOGIN = import.meta.env.VITE_LEGACY_LOGIN !== '0';
