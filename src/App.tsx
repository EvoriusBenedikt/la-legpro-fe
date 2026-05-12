import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import LegalOpinion from './components/LegalOpinion';
import LegalRepository from './components/LegalRepository';
import DocumentMaker from './components/DocumentMaker';
import Auth from './components/Auth';
import Account from './components/Account';
import TopBar from './components/TopBar';
import ContractMonitor from './components/ContractMonitor';
import { useAuth } from './context/AuthContext';
import './index.css';

type MainTab = 'legal_repository' | 'legal_opinion' | 'document_maker' | 'contract_monitor' | 'account';
const TAB_STORAGE_KEY = 'legal_analyzer_active_tab';

function App() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    const savedTab = localStorage.getItem(TAB_STORAGE_KEY) as MainTab | null;
    const valid: MainTab[] = ['legal_repository', 'legal_opinion', 'document_maker', 'contract_monitor', 'account'];
    if (savedTab && valid.includes(savedTab)) return savedTab;
    return 'legal_opinion';
  });

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const { isAuthenticated } = useAuth();

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
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
