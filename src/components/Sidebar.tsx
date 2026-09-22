import { useState } from 'react';
import { Database, Scale, FileText, User, BarChart2, ShieldCheck, Network, FolderTree, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('la_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      try {
        localStorage.setItem('la_sidebar_collapsed', prev ? '0' : '1');
      } catch {
        /* private mode — collapse just won't persist */
      }
      return !prev;
    });
  };
  const role = user?.role?.toLowerCase() || '';
  const isITAdmin = role === 'admin';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isEngineer = role === 'insinyur ti';
  
  const userLevel = user?.role ? getRoleLevel(user.role) : 1;

  function getRoleLevel(role: string): number {
    const levels: Record<string, number> = {
      pengguna: 1, manajer: 2, direktur: 3, admin: 4, 'sekretaris perusahaan': 5, 'insinyur ti': 6
    };
    return levels[role.toLowerCase()] ?? 1;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const adminTabs = [
    { path: '/admin', name: 'Admin Dashboard', icon: <ShieldCheck size={20} /> },
    { path: '/account', name: 'Account Settings', icon: <User size={20} /> },
  ];

  const regularTabs = [
    { path: '/repository', name: 'Legal Repository', icon: <Database size={20} /> },
    { path: '/opinion', name: 'Legal Opinion', icon: <Scale size={20} /> },
    { path: '/maker', name: 'Compliance Checker', icon: <FileText size={20} /> },
    { path: '/contracts', name: 'Contract Monitor', icon: <BarChart2 size={20} /> },
    ...(userLevel >= 2 ? [{ path: '/graph', name: 'Knowledge Graph', icon: <Network size={20} /> }] : []),
  ];

  const engineerTabs = [
    { path: '/monitoring', name: 'System Monitoring', icon: <BarChart2 size={20} /> },
    { path: '/account', name: 'Account Settings', icon: <User size={20} /> },
  ];

  let tabs = regularTabs;
  if (isEngineer) {
    tabs = engineerTabs;
  } else if (isITAdmin) {
    tabs = adminTabs;
  } else if (isSekretaris) {
    tabs = [
      { path: '/admin', name: 'Admin Dashboard', icon: <ShieldCheck size={20} /> },
      { path: '/taxonomy', name: 'Taxonomy Manager', icon: <FolderTree size={20} /> },
      ...regularTabs
    ];
  }

  return (
    <>
    {mobileOpen && <div className="sidebar-backdrop open" onClick={onClose} aria-hidden="true" />}
    <div className={`sidebar${mobileOpen ? ' open' : ''}${!mobileOpen && collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-icon" style={{
          width: '40px', height: '40px', borderRadius: '12px',
          background: isEngineer ? 'linear-gradient(135deg, #10B981, #059669)' 
            : (isITAdmin || isSekretaris) ? 'linear-gradient(135deg, #F59E0B, #F43F5E)'
            : 'var(--gradient-brand)',
          backgroundSize: '200% 200%',
          animation: 'gradientShift 5s ease infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 15px ${isEngineer ? 'rgba(16, 185, 129, 0.4)' : (isITAdmin || isSekretaris) ? 'rgba(245,158,11,0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
        }}>
          {isEngineer ? <Network size={22} color="white" /> 
            : (isITAdmin || isSekretaris) ? <ShieldCheck size={22} color="white" /> 
            : <Scale size={22} color="white" />}
        </div>
        <h2>LA Legal-Analyzer</h2>
        <button
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      
      <div className="sidebar-menu" role="navigation" aria-label="Main">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            title={tab.name}
            aria-label={tab.name}
            onClick={onClose}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <div className="item-icon">{tab.icon}</div>
            <span className="item-label">{tab.name}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <div 
          className="sidebar-user" 
          onClick={() => navigate('/account')}
          style={{ cursor: 'pointer' }}
          title="Go to Account Settings"
        >
          <div className="avatar-small" style={{ position: 'relative' }}>
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', background: 'var(--success)', borderRadius: '50%', border: '2px solid var(--bg-dark)' }} />
          </div>
          <div className="user-info">
            <span className="user-name">{user?.username || 'User'}</span>
            <span className="user-role">{user?.role || 'Pengguna'}</span>
          </div>
        </div>
        
        <button className="logout-btn" onClick={handleLogout} title="Logout" aria-label="Logout">
          <LogOut size={20} className="item-icon" />
          <span className="item-label">Logout</span>
        </button>
      </div>
    </div>
    </>
  );
}
