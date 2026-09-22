import React, { Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import TopBar from './components/TopBar';
import { useAuth } from './context/AuthContext';
import './index.css';

// Lazy load heavy components
const LegalOpinion = React.lazy(() => import('./components/LegalOpinion'));
const LegalRepository = React.lazy(() => import('./components/LegalRepository'));
const DocumentMaker = React.lazy(() => import('./components/DocumentMaker'));
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
      <div className="dashboard-content-row">
        <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

        <div className="dashboard-center">
          <TopBar onMenu={() => setNavOpen(true)} />
          <div className="main-content" style={{ padding: 0 }}>
            <Suspense fallback={
              <div style={{ padding: '24px' }}>
                <div className="skeleton" style={{ height: '40px', width: '30%', marginBottom: '24px' }} />
                <div className="skeleton" style={{ height: '200px', width: '100%', marginBottom: '16px' }} />
                <div className="skeleton" style={{ height: '200px', width: '100%' }} />
              </div>
            }>
            <div className="tab-panel--active">
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
                    <Route path="/maker" element={<DocumentMaker />} />
                    <Route path="/contracts" element={<ContractMonitor />} />
                    <Route path="/graph" element={
                      <KnowledgeGraph onOpenDocument={() => {}} />
                    } />
                    <Route path="*" element={<Navigate to="/opinion" replace />} />
                  </>
                )}
              </Routes>
            </div>
            </Suspense>
          </div>
          <footer className="app-footer">
            <div className="app-footer-top">
              <div className="app-footer-brand">
                <img src="/logoLintas-removebg-preview.png" alt="Lintasarta" className="app-footer-logo" />
                <p className="app-footer-tagline">
                  Solusi teknologi informasi terpercaya untuk transformasi digital Indonesia.
                </p>
                <div className="app-footer-socials">
                  <a href="https://www.linkedin.com/company/lintasarta" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </a>
                  <a href="https://twitter.com/lintasarta" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.259 5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                  <a href="https://www.instagram.com/lintasarta" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  </a>
                  <a href="https://www.facebook.com/lintasarta" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                  <a href="https://www.youtube.com/@lintasarta" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </a>
                </div>
              </div>
              <div className="app-footer-links">
                <div className="app-footer-col">
                  <h4>Produk & Layanan</h4>
                  <ul>
                    <li>LA Legal-Analyzer</li>
                    <li>Legal Repository</li>
                    <li>Compliance Checker</li>
                    <li>Contract Monitor</li>
                  </ul>
                </div>
                <div className="app-footer-col">
                  <h4>Tentang Kami</h4>
                  <ul>
                    <li><a href="https://lintasarta.co.id" target="_blank" rel="noopener noreferrer">lintasarta.co.id</a></li>
                    <li>Keberlanjutan</li>
                    <li>Karir</li>
                  </ul>
                </div>
                <div className="app-footer-col">
                  <h4>Dukungan</h4>
                  <ul>
                    <li>14052</li>
                    <li>support@lintasarta.co.id</li>
                    <li>Privacy Notice</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="app-footer-bottom">
              <span className="app-footer-copyright">
                Copyright &copy; {new Date().getFullYear()} PT Aplikanusa Lintasarta. All rights reserved.
              </span>
              <span className="app-footer-version">LA Legal-Analyzer v1.0</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
