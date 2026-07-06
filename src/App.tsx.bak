import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import LegalOpinion from './components/LegalOpinion';
import LegalRepository from './components/LegalRepository';
import DocumentMaker from './components/DocumentMaker';
import Auth from './components/Auth';
import Account from './components/Account';
import TopBar from './components/TopBar';
import ContractMonitor from './components/ContractMonitor';
import AdminDashboard from './components/AdminDashboard';
import KnowledgeGraph from './components/KnowledgeGraph';
import { useAuth } from './context/AuthContext';
import SystemMonitoring from './components/SystemMonitoring';
import TaxonomyManager from './components/TaxonomyManager';

import './index.css';

type MainTab = 'legal_repository' | 'legal_opinion' | 'document_maker' | 'contract_monitor' | 'account' | 'admin_dashboard' | 'knowledge_graph' | 'monitoring' | 'taxonomy_manager';
const TAB_STORAGE_KEY = 'legal_analyzer_active_tab';

function App() {
  const { isAuthenticated, user } = useAuth();
  const role = user?.role?.toLowerCase() || '';
  const isITAdmin = role === 'admin';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isEngineer = role === 'insinyur ti';

  const [activeTab, setActiveTab] = useState<MainTab | 'monitoring'>(() => {
    const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as any;
    const validAdmin: string[] = ['admin_dashboard', 'account'];
    const validRegular: string[] = ['legal_repository', 'legal_opinion', 'document_maker', 'contract_monitor', 'account', 'knowledge_graph'];
    const validSekretaris: string[] = [...validRegular, 'admin_dashboard', 'taxonomy_manager'];
    const validEngineer: string[] = ['monitoring', 'account'];
    
    if (isEngineer) {
      if (savedTab && validEngineer.includes(savedTab)) return savedTab;
      return 'monitoring';
    }
    if (isITAdmin) {
      if (savedTab && validAdmin.includes(savedTab)) return savedTab;
      return 'admin_dashboard';
    }
    if (isSekretaris) {
      if (savedTab && validSekretaris.includes(savedTab)) return savedTab;
      return 'admin_dashboard';
    }
    if (savedTab && validRegular.includes(savedTab)) return savedTab;
    return 'legal_opinion';
  });

  // Redirect strict admin to their dashboard if they somehow end up on a restricted tab
  useEffect(() => {
    if (isITAdmin && activeTab !== 'account' && activeTab !== 'admin_dashboard') {
      setActiveTab('admin_dashboard');
    }
    if (isEngineer && activeTab !== 'account' && activeTab !== 'monitoring') {
      setActiveTab('monitoring');
    }
  }, [isITAdmin, isEngineer, activeTab]);

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <div className="layout-container dashboard-main">
      <div className="dashboard-content-row">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="dashboard-center" style={{ flex: 1, minWidth: 0 }}>
          <TopBar />

          <div className="main-content" style={{ padding: 0, marginTop: '24px' }}>
            {/* Engineer-only view */}
            {isEngineer ? (
              <>
                <div className={`tab-panel ${activeTab === 'monitoring' ? 'tab-panel--active' : ''}`}>
                  <SystemMonitoring />
                </div>
                <div className={`tab-panel ${activeTab === 'account' ? 'tab-panel--active' : ''}`}>
                  <Account />
                </div>
              </>
            ) : isITAdmin ? (
              <>
                <div className={`tab-panel ${activeTab === 'admin_dashboard' ? 'tab-panel--active' : ''}`}>
                  <AdminDashboard />
                </div>
                <div className={`tab-panel ${activeTab === 'account' ? 'tab-panel--active' : ''}`}>
                  <Account />
                </div>
              </>
            ) : (
              <>
                {(isSekretaris) && (
                  <div className={`tab-panel ${activeTab === 'admin_dashboard' ? 'tab-panel--active' : ''}`}>
                    <AdminDashboard />
                  </div>
                )}
                <div className={`tab-panel ${activeTab === 'legal_repository' ? 'tab-panel--active' : ''}`}>
                  <LegalRepository />
                </div>
                <div className={`tab-panel ${activeTab === 'legal_opinion' ? 'tab-panel--active' : ''}`}>
                  <LegalOpinion />
                </div>
                <div className={`tab-panel ${activeTab === 'document_maker' ? 'tab-panel--active' : ''}`}>
                  <DocumentMaker />
                </div>
                <div className={`tab-panel ${activeTab === 'contract_monitor' ? 'tab-panel--active' : ''}`}>
                  <ContractMonitor />
                </div>
                <div className={`tab-panel ${activeTab === 'knowledge_graph' ? 'tab-panel--active' : ''}`}
                  style={{ padding: 0 }}>
                  <KnowledgeGraph
                    onOpenDocument={(docId) => {
                      // Switch to repository tab so user can see the drawer open
                      setActiveTab('legal_repository');
                    }}
                  />
                </div>
                <div className={`tab-panel ${activeTab === 'account' ? 'tab-panel--active' : ''}`}>
                  <Account />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
