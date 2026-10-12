import { Bell, ShieldCheck, User, Menu, Code } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useStrings } from '../i18n';

interface TopBarProps {
  /** Mobile (≤767px): opens the off-canvas drawer */
  onMenu?: () => void;
}

export default function TopBar({ onMenu }: TopBarProps) {
  const { user } = useAuth();
  const t = useStrings();
  const navigate = useNavigate();

  const getRoleIcon = () => {
    const role = user?.role?.toLowerCase() || '';
    if (role === 'dewa') return <Code size={14} className="role-icon" />;
    if (role === 'admin' || role === 'sekretaris perusahaan') return <ShieldCheck size={14} className="role-icon" />;
    return <User size={14} className="role-icon" />;
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        {onMenu && (
          <button className="menu-btn" onClick={onMenu} aria-label={t.openNav}>
            <Menu size={20} />
          </button>
        )}
        {/* Page chip removed 2026-10-12 (user decision): the sidebar's
            active-row highlight already marks the current page, so the
            chip was a duplicate orientation cue. */}
      </div>

      <div className="topbar-right">
        <button className="icon-btn-top" aria-label={t.notifications}>
          <Bell size={18} />
        </button>

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
