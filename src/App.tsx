import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import LoadingOrb from './components/LoadingOrb';
import { useAuth } from './hooks/useAuth';
import { useStrings } from './i18n';
import { LEGACY_LOGIN } from './config';
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
const LandingPage = React.lazy(() => import('./components/LandingPage'));
const AuthLegacy = React.lazy(() => import('./components/AuthLegacy'));

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
  const [signedInNote, setSignedInNote] = useState('');
  useEffect(() => {
    if (isAuthenticated && !wasAuthed.current) {
      mainRef.current?.focus();
      setSignedInNote(t.signedInNote);
    } else if (!isAuthenticated && wasAuthed.current) {
      setSignedInNote('');
    }
    wasAuthed.current = isAuthenticated;
  }, [isAuthenticated, t.signedInNote]);

  const isITAdmin = role === 'admin';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isEngineer = role === 'insinyur ti';
  // Unofficial developer role (2026-10-07): union of every route group below.
  const isDewa = role === 'dewa';

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center' }}>Loading…</div>}>
        <Routes>
          <Route path="/login" element={<Auth />} />
          {LEGACY_LOGIN && <Route path="/login/legacy" element={<AuthLegacy />} />}
          <Route path="/" element={<LandingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <div className="layout-container dashboard-main">
      <TopBar onMenu={() => setNavOpen(true)} />
      <div className="dashboard-content-row">
        <Sidebar
          mobileOpen={navOpen}
          onClose={() => setNavOpen(false)}
        />

        <div className="dashboard-center">
          <div
            className="main-content"
            style={{ padding: 0 }}
            role="main"
            tabIndex={-1}
            ref={mainRef}
          >
            <span className="visually-hidden" role="status">{signedInNote}</span>
            <Suspense fallback={
              <div style={{ padding: '24px' }}>
                <LoadingOrb label="Memuat..." />
              </div>
            }>
            <div className="tab-panel--active" ref={scrollerRef}>
              <div className="route-inset">
                <Routes>
                  {/* Role-based default redirects */}
                  <Route path="/" element={
                    <Navigate to={
                      isDewa ? "/admin" :
                      isEngineer ? "/monitoring" :
                      isITAdmin ? "/admin" :
                      isSekretaris ? "/admin" :
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
                      {/* They also get access to regular routes below */}
                    </>
                  )}

                  {/* Dewa (unofficial developer role): every route exactly
                      once — engineer, admin, sekretaris and regular surfaces. */}
                  {isDewa && (
                    <>
                      <Route path="/monitoring" element={<SystemMonitoring />} />
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/taxonomy" element={<TaxonomyManager />} />
                      <Route path="/repository" element={<LegalRepository />} />
                      <Route path="/opinion" element={<LegalOpinion />} />
                      <Route path="/contracts" element={<ContractMonitor />} />
                      <Route path="/graph" element={<KnowledgeGraph />} />
                      <Route path="*" element={<Navigate to="/admin" replace />} />
                    </>
                  )}

                  {/* Regular Routes (available to Regular and Sekretaris) */}
                  {(!isITAdmin && !isEngineer && !isDewa) && (
                    <>
                      <Route path="/repository" element={<LegalRepository />} />
                      <Route path="/opinion" element={<LegalOpinion />} />
                      <Route path="/contracts" element={<ContractMonitor />} />
                      <Route path="/graph" element={<KnowledgeGraph />} />
                      <Route path="*" element={<Navigate to="/opinion" replace />} />
                    </>
                  )}
                </Routes>
              </div>
              <Footer />
            </div>
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
