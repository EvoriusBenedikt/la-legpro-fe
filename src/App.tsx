import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import LoadingOrb from './components/LoadingOrb';
import { useAuth } from './context/AuthContext';
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
  const isITAdmin = role === 'admin';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isEngineer = role === 'insinyur ti';

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center' }}>Loading…</div>}>
        <Routes>
          <Route path="/login" element={<Auth />} />
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
          <div className="main-content" style={{ padding: 0 }}>
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
                      <Route path="*" element={<Navigate to="/monitoring" replace />} />
                    </>
                  )}

                  {/* Admin Routes */}
                  {isITAdmin && (
                    <>
                      <Route path="/admin" element={<AdminDashboard />} />
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

                  {/* Regular Routes (available to Regular and Sekretaris) */}
                  {(!isITAdmin && !isEngineer) && (
                    <>
                      <Route path="/repository" element={<LegalRepository />} />
                      <Route path="/opinion" element={<LegalOpinion />} />
                      <Route path="/contracts" element={<ContractMonitor />} />
                      <Route path="/graph" element={
                        <KnowledgeGraph onOpenDocument={() => {}} />
                      } />
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
