# Legal Analyzer — Frontend

React 19 + TypeScript + Vite SPA for the Legal Analyzer platform (Indonesian
regulatory compliance). Talks to the FastAPI backend (`la-legpro-be`, :8080
in Docker).

## Two run modes

| | Dev mode | Deploy mode |
|---|---|---|
| Start | `npm run dev` | `npm run deploy` (= `docker compose up -d --build frontend`) |
| URL | http://localhost:5173 — Vite dev server, full HMR | http://localhost — nginx serving the static bundle (host port via `FE_PORT`), no HMR |
| API endpoint | `VITE_API_URL` from `.env`, read at dev-server start (here: `http://localhost:8080`) | **same-origin by default**: the bundle's API base bakes empty when `FE_API_URL` is unset (`src/config.ts` falls back to `''`), so the browser calls `/api/` on its own origin and nginx reverse-proxies it to the backend's published port (`host.docker.internal:8080`). Set `FE_API_URL` at image build **only** for split-host deploys. The compose var is deliberately NOT named `VITE_API_URL` — Compose would otherwise read the dev value from this directory's `.env` and leak it into the production bundle |
| Code changes | instantly (hot reload) | only after an image rebuild |

```bash
npm install
npm run dev        # dev mode — http://localhost:5173, hot reload
npm run deploy     # deploy mode — rebuild + recreate the nginx container on :80
```

The dev server is pinned to port 5173 (`server.strictPort` in
`vite.config.ts`): if something else holds the port it fails loudly instead
of silently drifting to 5174. Both modes can run at the same time on their
own ports; browser storage is per-origin, so :5173 and :80 keep separate
logins and chat histories. The backend CORS whitelist (`ALLOWED_ORIGINS`)
already includes `http://localhost:5173`.

Other scripts: `npm run build` (type-check + production bundle → `dist/`),
`npm run lint`, `npm run preview`.

## Production (what gets deployed)

The deployed image does **not** run the Vite dev server. `Dockerfile` is a
multi-stage build: `vite build` → static `dist/` served by nginx on port 80
(see `nginx.conf` for the SPA fallback). `npm run deploy` wraps the compose
build; the raw equivalent is:

```bash
docker compose up -d --build frontend     # same-origin /api/ proxy — no env needed
# split-host deploys only (API on another origin):
# FE_API_URL=https://api.example.com docker compose up -d --build frontend
```

> `VITE_API_URL` is baked into the JS **at build time** — a runtime env var
> cannot change it. Default builds bake an EMPTY base, so all `/api/*` calls go
> to the page's own origin, where `nginx.conf` proxies them to the backend
> (before that proxy existed, every deployed POST returned 405 — see
> `la-legpro-doc/bug_reports.md`, 2026-10-02). Set `FE_API_URL` (not
> `VITE_API_URL`) only when the API truly lives on another origin: Compose
> interpolates `${VITE_API_URL}` from this directory's `.env` — the dev file —
> which would bake `localhost` into the production bundle. `.dockerignore`
> additionally keeps `.env` out of the image. `nginx.conf` marks `index.html`
> no-cache so redeployed bundles reach browsers immediately instead of
> lingering behind heuristic caching.

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
