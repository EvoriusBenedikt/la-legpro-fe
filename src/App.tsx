import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import LoadingOrb from './components/LoadingOrb';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useStrings } from './i18n';
import { LEGACY_LOGIN } from './config';
import { JobStatusProvider } from './context/JobStatusContext';
import { UploadProvider } from './context/ContractUploadContext';
import './index.css';

// Lazy load heavy components
const LegalOpinion = React.lazy(() => import('./components/LegalOpinion'));
const LegalRepository = React.lazy(() => import('./components/LegalRepository'));
const ContractMonitor = React.lazy(() => import('./components/ContractMonitor'));
const Account = React.lazy(() => import('./components/Account'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const KnowledgeGraph = React.lazy(() => import('./components/KnowledgeGraph'));
const SystemMonitoring = React.lazy(() => import('./components/SystemMonitoring'));
const TaxonomyManager = React.lazy(() => import('./components/TaxonomyManager'));
const ScraperConfig = React.lazy(() => import('./components/ScraperConfig'));
const LandingPage = React.lazy(() => import('./components/LandingPage'));
const AuthLegacy = React.lazy(() => import('./components/AuthLegacy'));
/* FEAT phase-1 (2026-10-23): pengguna-only home dashboard; other roles
   never import it. */
const PenggunaHome = React.lazy(() => import('./components/PenggunaHome'));
/* FEAT phase-2 (2026-10-24): pengguna-only contracts page inside the
   standalone shell. Other roles' /contracts routes are untouched. */
const PenggunaContracts = React.lazy(() => import('./components/PenggunaContracts'));
/* FEAT phase-2b (2026-10-24): pengguna-only notebook detail page for
   /contracts/{id} — opened when a contract card is clicked. */
const PenggunaNotebook = React.lazy(() => import('./components/PenggunaNotebook'));
/* FEAT phase-2c (2026-10-24): pengguna-only document workspace opened by
   double-clicking the uploaded document on the notebook page. */
const PenggunaWorkspace = React.lazy(() => import('./components/PenggunaWorkspace'));
const PenggunaOpinion = React.lazy(() => import('./components/PenggunaOpinion'));
function App() {
  const { isAuthenticated, user } = useAuth();
  const role = user?.role?.toLowerCase() || '';
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Reset the shared route scroller on every navigation. The
  // .tab-panel--active element persists across route swaps, so without
  // this the previous page's scrollTop carries into the new route and
  // gets clamped to the new content's max — on Legal Opinion that lands
  // on the footer band, so the page opened at the bottom instead of the
  // top (bug 2026-09-29). Pathname-only dep: query-string updates
  // (repository filters) must not yank the scroll.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Sign-in focus landing (critique P1 2026-10-06): login() swaps the whole
  // route tree, and focus used to fall to <body> in the new document with no
  // announcement — screen-reader users could not tell the sign-in succeeded.
  // Only the false→true transition counts as a sign-in: AuthContext restores
  // a stored session synchronously, so a refresh starts authenticated and
  // never replays the beat. The note rides a role="status" region that
  // mounts empty with the shell before the effect fills it, so the change is
  // announced; on logout the note is cleared so the next sign-in remounts
  // the region empty again. Main is focused via tabIndex={-1} and exempted
  // from the global focus-visible floor (index.css) — a ring around the
  // whole content area is noise, and the caret position is self-evident at
  // the top of a fresh view.
  const t = useStrings();
  const mainRef = useRef<HTMLDivElement>(null);
  const wasAuthed = useRef(isAuthenticated);
  // Flag, not text: the note is resolved at render so it follows the locale.
  const [showSignedInNote, setShowSignedInNote] = useState(false);
  useEffect(() => {
    if (isAuthenticated && !wasAuthed.current) {
      mainRef.current?.focus();
      setShowSignedInNote(true);
    } else if (!isAuthenticated && wasAuthed.current) {
      setShowSignedInNote(false);
    }
    wasAuthed.current = isAuthenticated;
  }, [isAuthenticated]);

  const isITAdmin = role === 'admin';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isDeveloper = role === 'developer';
  const isEngineer = role === 'insinyur ti';
  // Unofficial developer role (2026-10-07): union of every route group below.
  const isDewa = role === 'dewa';
  /* FEAT phase-1 (2026-10-23) / phase-2 (2026-10-24) / phase-3 (2026-10-25):
     pengguna home, contracts and the Legal Opinion chat render as their own
     full-bleed shell (glass topbar, hero, cover cards) matching the approved
     Notebookly reference — outside the classic Sidebar/TopBar chrome, and
     only for the pengguna role. Every other role keeps today's shell and
     defaults, including the classic /contracts and /opinion routes below. */
  const isPengguna = role === 'pengguna';

  if (isAuthenticated && isPengguna && (location.pathname === '/home' || location.pathname === '/contracts' || location.pathname === '/opinion' || location.pathname.startsWith('/contracts/'))) {
    return (
      <JobStatusProvider userId={user!.id}>
        <UploadProvider>
          <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center' }}>{t.appLoading}</div>}>
            {location.pathname === '/home' && <PenggunaHome />}
            {location.pathname === '/contracts' && <PenggunaContracts />}
            {location.pathname === '/opinion' && <PenggunaOpinion />}
            {location.pathname.startsWith('/contracts/') && (/\/workspace$/.test(location.pathname) ? <PenggunaWorkspace /> : <PenggunaNotebook />)}
          </Suspense>
        </UploadProvider>
      </JobStatusProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center' }}>{t.appLoading}</div>}>
        {/* Keyed boundary (2026-10-12): a rejected lazy chunk (LandingPage /
            AuthLegacy) degrades to a reload panel instead of blanking the
            document; the pathname key remounts it fresh on navigation. */}
        <RouteErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/login" element={<Auth />} />
            {LEGACY_LOGIN && <Route path="/login/legacy" element={<AuthLegacy />} />}
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteErrorBoundary>
      </Suspense>
    );
  }

  /* App shell (2026-10-11 sidebar redesign): the persistent sidebar is
     the root container's first flex child, spanning the full viewport
     height; the shell (topbar + content row) sits beside it. On mobile
     the sidebar is a fixed-position drawer, so the shell naturally
     takes the full width. */
  return (
    <JobStatusProvider userId={user!.id}>
    <UploadProvider>
    <div className="layout-container dashboard-main">
      <Sidebar
        mobileOpen={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="dashboard-shell">
        <TopBar onMenu={() => setNavOpen(true)} />
        <div className="dashboard-content-row">
        <div className="dashboard-center">
          <div
            className="main-content"
            style={{ padding: 0 }}
            role="main"
            tabIndex={-1}
            ref={mainRef}
          >
            <span className="visually-hidden" role="status">{showSignedInNote ? t.signedInNote : ''}</span>
            <Suspense fallback={
              <div style={{ padding: '24px' }}>
                <LoadingOrb label={t.appLoading} />
              </div>
            }>
            <div className="tab-panel--active" ref={scrollerRef}>
              <div className="route-inset">
                {/* Route-level boundary (2026-10-12): wraps only the routed
                    content, so a page crash or rejected lazy chunk shows a
                    reload panel while sidebar/topbar/footer stay usable.
                    key={location.pathname} gives every navigation a fresh
                    boundary — leaving a broken route recovers without a
                    reload; the reload button covers React.lazy's cached
                    import rejection. See RouteErrorBoundary.tsx. */}
                <RouteErrorBoundary key={location.pathname}>
                <Routes>
                  {/* Role-based default redirects */}
                  <Route path="/" element={
                    <Navigate to={
                      isDewa ? "/admin" :
                      isEngineer ? "/monitoring" :
                      isITAdmin ? "/admin" :
                      isSekretaris ? "/admin" :
                      isPengguna ? "/home" :
                      "/opinion"
                    } replace />
                  } />

                  {/* Common Routes */}
                  <Route path="/account" element={<Account />} />

                  {/* Engineer Routes */}
                  {isEngineer && (
                    <>
                      <Route path="/monitoring" element={<SystemMonitoring />} />
                      {/* Taxonomy: admin + engineer gained the UI route with the
                          usage-based hard-delete gate (2026-10-06); the BE already
                          permitted both roles on the taxonomy API. */}
                      <Route path="/taxonomy" element={<TaxonomyManager />} />
                      <Route path="*" element={<Navigate to="/monitoring" replace />} />
                    </>
                  )}

                  {/* Admin Routes */}
                  {isITAdmin && (
                    <>
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/taxonomy" element={<TaxonomyManager />} />
                      <Route path="*" element={<Navigate to="/admin" replace />} />
                    </>
                  )}

                  {/* Sekretaris Routes */}
                  {isSekretaris && (
                    <>
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/taxonomy" element={<TaxonomyManager />} />
                      <Route path="/repository/scraping" element={<ScraperConfig />} />
                      {/* They also get access to regular routes below */}
                    </>
                  )}

                  {/* Literal developer role: scraper configuration only. */}
                  {isDeveloper && (
                    <>
                      <Route path="/repository/scraping" element={<ScraperConfig />} />
                      <Route path="*" element={<Navigate to="/repository/scraping" replace />} />
                    </>
                  )}

                  {/* Dewa (unofficial developer role): every route exactly
                      once — engineer, admin, sekretaris and regular surfaces. */}
                  {isDewa && (
                    <>
                      <Route path="/monitoring" element={<SystemMonitoring />} />
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/taxonomy" element={<TaxonomyManager />} />
                      <Route path="/repository/scraping" element={<ScraperConfig />} />
                      <Route path="/repository" element={<LegalRepository />} />
                      <Route path="/opinion" element={<LegalOpinion />} />
                      <Route path="/contracts" element={<ContractMonitor />} />
                      <Route path="/graph" element={<KnowledgeGraph />} />
                      <Route path="*" element={<Navigate to="/admin" replace />} />
                    </>
                  )}

                  {/* Regular Routes (available to Regular and Sekretaris) */}
                  {(!isITAdmin && !isEngineer && !isDeveloper && !isDewa) && (
                    <>
                      {/* FEAT phase-1: pengguna's /home renders as its own
                          standalone shell (branch above), so it has no route
                          here; unknown paths for pengguna still fall back to
                          /home via the wildcard below. */}
                      <Route path="/repository" element={<LegalRepository />} />
                      <Route path="/opinion" element={<LegalOpinion />} />
                      <Route path="/contracts" element={<ContractMonitor />} />
                      <Route path="/graph" element={<KnowledgeGraph />} />
                      <Route path="*" element={<Navigate to={isPengguna ? "/home" : "/opinion"} replace />} />
                    </>
                  )}
                </Routes>
                </RouteErrorBoundary>
              </div>
              <Footer />
            </div>
            </Suspense>
          </div>
        </div>
        </div>
      </div>
    </div>
    </UploadProvider>
    </JobStatusProvider>
  );
}

export default App;
