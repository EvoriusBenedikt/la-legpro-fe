# LA LegPro — Frontend

React 19 + TypeScript + Vite SPA for the Legal Analyzer platform (Indonesian
regulatory compliance). Talks to the FastAPI backend (`la-legpro-be`, :8000).

## Quick start (local dev)

```bash
npm install
# point at your backend:
#   .env → VITE_API_URL=http://localhost:8000
npm run dev        # Vite dev server with HMR (default http://localhost:5173)
```

Other scripts: `npm run build` (type-check + production bundle → `dist/`),
`npm run lint`, `npm run preview`.

## Production (what gets deployed)

The deployed image does **not** run the Vite dev server. `Dockerfile` is a
multi-stage build: `vite build` → static `dist/` served by nginx on port 80
(see `nginx.conf` for the SPA fallback).

```bash
docker build --build-arg VITE_API_URL=https://legal-analyzer.lintasarta.dev .
docker compose up --build
```

> `VITE_API_URL` is baked into the JS **at build time** — a runtime env var
> cannot change it. Rebuild per environment.

## Conventions

* **Single API host:** every component imports `API_BASE` from `src/config.ts`.
  Never inline `import.meta.env.VITE_API_URL` in components.
* **Auth:** JWT via `src/context/AuthContext.tsx` (`Bearer` header). Registration
  passwords need ≥1 number + ≥1 symbol; password changes live in the Account →
  Security Settings tab (`POST /api/auth/change-password`).
* **Routing:** `react-router-dom` with lazy-loaded pages (the Knowledge Graph is
  heavy — never import it eagerly).
* **Design:** vanilla CSS variables in `src/index.css` (light theme).

## Layout

```
src/
  config.ts            # API_BASE — the one place the API host is defined
  App.tsx / main.tsx   # root, tab router
  context/AuthContext.tsx
  services/api.ts        # shared axios client
  components/
    LegalOpinion.tsx     # RAG chat
    DocumentMaker.tsx + ComplianceResultsViewer.tsx
    LegalRepository.tsx  # browse/search/export regulations
    ContractMonitor.tsx + AnalyzedDocumentsDashboard.tsx
    KnowledgeGraph.tsx
    SystemMonitoring.tsx # IT engineer dashboard
    AdminDashboard.tsx + TaxonomyManager.tsx
    Auth.tsx / Account.tsx / Sidebar.tsx / TopBar.tsx /
    ActivityFeed.tsx / DocumentDrawer.tsx / ProtectedRoute.tsx
```

Backend API contract and knowledge-base pipeline: see `la-legpro-be/README.md`.
Project overview and diagrams: see `la-legpro-doc/flow.md`.
