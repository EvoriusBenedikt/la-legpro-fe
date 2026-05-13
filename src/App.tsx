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
import { useAuth } from './context/AuthContext';
import './index.css';

type MainTab = 'legal_repository' | 'legal_opinion' | 'document_maker' | 'contract_monitor' | 'account' | 'admin_dashboard';
const TAB_STORAGE_KEY = 'legal_analyzer_active_tab';

function App() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as MainTab | null;
    const validAdmin: MainTab[] = ['admin_dashboard', 'account'];
    const validRegular: MainTab[] = ['legal_repository', 'legal_opinion', 'document_maker', 'contract_monitor', 'account'];
    
    if (isAdmin) {
      if (savedTab && validAdmin.includes(savedTab)) return savedTab;
      return 'admin_dashboard';
    }
    if (savedTab && validRegular.includes(savedTab)) return savedTab;
    return 'legal_opinion';
  });

  // Redirect admin to their dashboard if they somehow end up on a restricted tab
  useEffect(() => {
    if (isAdmin && activeTab !== 'account' && activeTab !== 'admin_dashboard') {
      setActiveTab('admin_dashboard');
    }
  }, [isAdmin, activeTab]);

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
            {/* Admin-only view */}
            {isAdmin ? (
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
