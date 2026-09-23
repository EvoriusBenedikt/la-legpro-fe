import { Database, Scale, User, BarChart2, ShieldCheck, Network, FolderTree } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  /** Mobile: off-canvas drawer open state */
  mobileOpen?: boolean;
  /** Mobile: close the drawer (backdrop click / nav selection) */
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps = {}) {
  const { user } = useAuth();
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

  const adminTabs = [
    { path: '/admin', name: 'Admin Dashboard', icon: <ShieldCheck size={20} /> },
    { path: '/account', name: 'Account Settings', icon: <User size={20} /> },
  ];

  const regularTabs = [
    { path: '/repository', name: 'Legal Repository', icon: <Database size={20} /> },
    { path: '/opinion', name: 'Legal Opinion', icon: <Scale size={20} /> },
    { path: '/contracts', name: 'Contracts', icon: <BarChart2 size={20} /> },
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
      <div className={`sidebar${mobileOpen ? ' open' : ''}`}>
        <div className="sidebar-menu" role="navigation" aria-label="Main">
          {tabs.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              aria-label={tab.name}
              onClick={onClose}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <div className="item-icon">{tab.icon}</div>
              <span className="item-label">{tab.name}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
}
