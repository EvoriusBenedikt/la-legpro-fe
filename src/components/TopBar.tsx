import { useState } from 'react';
import { Search, Bell, ShieldCheck, User, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

interface TopBarProps {
  /** Mobile (≤767px): opens the off-canvas drawer */
  onMenu?: () => void;
}

export default function TopBar({ onMenu }: TopBarProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/admin')) return 'Admin Dashboard';
    if (path.includes('/repository')) return 'Legal Repository';
    if (path.includes('/opinion')) return 'Legal Opinion';
    if (path.includes('/contracts')) return 'Contracts';
    if (path.includes('/graph')) return 'Knowledge Graph';
    if (path.includes('/monitoring')) return 'System Monitoring';
    if (path.includes('/taxonomy')) return 'Taxonomy Manager';
    if (path.includes('/account')) return 'Account Settings';
    return 'Dashboard';
  };

  const getRoleIcon = () => {
    const role = user?.role?.toLowerCase() || '';
    if (role === 'admin' || role === 'sekretaris perusahaan') return <ShieldCheck size={14} className="role-icon" />;
    return <User size={14} className="role-icon" />;
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <img src="/LegalAnalyzerLogo.png" alt="" className="topbar-brand-logo" />
          <span className="topbar-brand-name">Legal Analyzer</span>
        </div>

        {onMenu && (
          <button className="menu-btn" onClick={onMenu} aria-label="Open navigation menu">
            <Menu size={20} />
          </button>
        )}

        <div className="breadcrumb">
          <span className="breadcrumb-brand">Legal Analyzer</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{getPageTitle()}</span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="search-bar-top">
          <Search size={16} />
          <input type="text" placeholder="Search everywhere..." aria-label="Search everywhere" />
        </div>

        <button
          className="search-toggle-btn"
          onClick={() => setMobileSearchOpen(o => !o)}
          aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
          aria-expanded={mobileSearchOpen}
        >
          {mobileSearchOpen ? <X size={20} /> : <Search size={20} />}
        </button>

        <button className="icon-btn-top" aria-label="Notifications">
          <Bell size={18} />
        </button>
        
        <div 
          className="topbar-user-pill"
          onClick={() => navigate('/account')}
          style={{ cursor: 'pointer' }}
          title="Go to Account Settings"
        >
          <div className="avatar-small">
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="topbar-role-badge">
            {getRoleIcon()}
            <span>{user?.role || 'Pengguna'}</span>
          </div>
        </div>
      </div>
      {mobileSearchOpen && (
        <div className="topbar-search-expand">
          <Search size={16} />
          <input type="text" placeholder="Search everywhere..." aria-label="Search everywhere" autoFocus />
        </div>
      )}
    </div>
  );
}
