import { Database, Scale, FileText, User, BarChart2 } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const tabs = [
    { id: 'legal_repository', name: 'Legal Repository', icon: <Database size={20} /> },
    { id: 'legal_opinion', name: 'Legal Opinion', icon: <Scale size={20} /> },
    { id: 'document_maker', name: 'Compliance Checker', icon: <FileText size={20} /> },
    { id: 'contract_monitor', name: 'Contract Monitor', icon: <BarChart2 size={20} /> },
    { id: 'account', name: 'Account Settings', icon: <User size={20} /> },
  ];
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #A855F7, #38BDF8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)'
        }}>
          <Scale size={22} color="white" />
        </div>
      </div>
      <div className="sidebar-menu">
        {tabs.map(tab => (
          <button
            key={tab.id}
            title={tab.name}
            className={`sidebar-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
