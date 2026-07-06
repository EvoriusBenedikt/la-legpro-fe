import React, { Suspense } from 'react';
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

function App() {
  const { isAuthenticated, user } = useAuth();
  const role = user?.role?.toLowerCase() || '';
  const isITAdmin = role === 'admin';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isEngineer = role === 'insinyur ti';

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <div className="layout-container dashboard-main">
      <div className="dashboard-content-row">
        <Sidebar activeTab="" setActiveTab={() => {}} />

        <div className="dashboard-center" style={{ flex: 1, minWidth: 0 }}>
          <TopBar />
          <div className="main-content" style={{ padding: 0, marginTop: '24px' }}>
            <Suspense fallback={<div className="loading-state">Loading Module...</div>}>
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
        </div>
      </div>
    </div>
  );
}

export default App;
