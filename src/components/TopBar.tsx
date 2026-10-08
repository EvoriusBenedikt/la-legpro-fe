import { Bell, ShieldCheck, User, Menu, Code } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStrings } from '../i18n';
import SettingsDialog from './SettingsDialog';

interface TopBarProps {
  /** Mobile (≤767px): opens the off-canvas drawer */
  onMenu?: () => void;
}

export default function TopBar({ onMenu }: TopBarProps) {
  const { user } = useAuth();
  const t = useStrings();
  const location = useLocation();
  const navigate = useNavigate();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/admin')) return t.navAdmin;
    if (path.includes('/repository')) return t.navRepository;
    if (path.includes('/opinion')) return t.navOpinion;
    if (path.includes('/contracts')) return t.navContracts;
    if (path.includes('/graph')) return t.navGraph;
    if (path.includes('/monitoring')) return t.navMonitoring;
    if (path.includes('/taxonomy')) return t.navTaxonomy;
    if (path.includes('/account')) return t.navAccount;
    return t.navDashboard;
  };

  const getRoleIcon = () => {
    const role = user?.role?.toLowerCase() || '';
    if (role === 'dewa') return <Code size={14} className="role-icon" />;
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
          <button className="menu-btn" onClick={onMenu} aria-label={t.openNav}>
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
        <button className="icon-btn-top" aria-label={t.notifications}>
          <Bell size={18} />
        </button>

        <SettingsDialog />

        <div 
          className="topbar-user-pill"
          onClick={() => navigate('/account')}
          style={{ cursor: 'pointer' }}
          title={t.goToAccount}
        >
          <div className="avatar-small">
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="topbar-role-badge">
            {getRoleIcon()}
            <span>{user?.role?.toLowerCase() === 'dewa' ? 'Developer' : (user?.role || t.fallbackRole)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
