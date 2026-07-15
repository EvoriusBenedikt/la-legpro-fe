import { Search, Bell, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

export default function TopBar() {
  const { user } = useAuth();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/admin')) return 'Admin Dashboard';
    if (path.includes('/repository')) return 'Legal Repository';
    if (path.includes('/opinion')) return 'Legal Opinion';
    if (path.includes('/maker')) return 'Compliance Checker';
    if (path.includes('/contracts')) return 'Contract Monitor';
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
    <div className="topbar glass-panel" style={{ borderRadius: '0 0 0 24px', margin: '0 0 0 24px', borderTop: 'none', borderRight: 'none' }}>
      <div className="topbar-left">
        <div className="breadcrumb">
          <span className="breadcrumb-brand">LA LegPro</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{getPageTitle()}</span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="search-bar-top">
          <Search size={16} />
          <input type="text" placeholder="Search everywhere..." />
        </div>
        
        <button className="icon-btn-top">
          <Bell size={18} />
        </button>
        
        <div className="topbar-user-pill">
          <div className="avatar-small">
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="topbar-role-badge">
            {getRoleIcon()}
            <span>{user?.role || 'Pengguna'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
