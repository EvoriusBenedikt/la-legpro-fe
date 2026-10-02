import { Database, Scale, User, BarChart2, ShieldCheck, Network, FolderTree } from 'lucide-react';
import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStrings } from '../i18n';

interface SidebarProps {
  /** Mobile: off-canvas drawer open state */
  mobileOpen?: boolean;
  /** Mobile: close the drawer (backdrop click / nav selection) */
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps = {}) {
  const { user } = useAuth();
  const t = useStrings();
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
    { path: '/admin', name: t.navAdmin, icon: <ShieldCheck size={20} /> },
    { path: '/account', name: t.navAccount, icon: <User size={20} /> },
  ];

  const regularTabs = [
    { path: '/repository', name: t.navRepository, icon: <Database size={20} /> },
    { path: '/opinion', name: t.navOpinion, icon: <Scale size={20} /> },
    { path: '/contracts', name: t.navContracts, icon: <BarChart2 size={20} /> },
    ...(userLevel >= 2 ? [{ path: '/graph', name: t.navGraph, icon: <Network size={20} /> }] : []),
  ];

  const engineerTabs = [
    { path: '/monitoring', name: t.navMonitoring, icon: <BarChart2 size={20} /> },
    { path: '/account', name: t.navAccount, icon: <User size={20} /> },
  ];

  let tabs = regularTabs;
  if (isEngineer) {
    tabs = engineerTabs;
  } else if (isITAdmin) {
    tabs = adminTabs;
  } else if (isSekretaris) {
    tabs = [
      { path: '/admin', name: t.navAdmin, icon: <ShieldCheck size={20} /> },
      { path: '/taxonomy', name: t.navTaxonomy, icon: <FolderTree size={20} /> },
      ...regularTabs
    ];
  }

  /* Rest mid-height of the wrapped rail menu (16px row inset + 12px
     padding ×2 + 44px items + 8px gaps, halved). The nav-edge hover
     strip is vertically LIMITED to this midpoint ±64px (bugfix
     2026-10-01: a full-height strip surfaced the rail on ANY left-edge
     hover, far from the visible wall tab; the first ±40px band left
     only 8px of grace around the 64px tab, and a user video the same
     day showed a cursor parked ~25px above the tab never surfacing the
     rail — ±64px keeps the zone local to the tab but aim-forgiving). */
  const railMidY = 16 + (24 + tabs.length * 44 + (tabs.length - 1) * 8) / 2;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop open" onClick={onClose} aria-hidden="true" />}
      <div className={`sidebar${mobileOpen ? ' open' : ''}`} id="app-sidebar">
        <div className="sidebar-menu" role="navigation" aria-label={t.mainNav}>
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

        {/* Wall cue (2026-10-01 review): child of the rail at its right
            seam (left: 100%) and mid-height (top: 50%) — parked on the
            wall by a counter-transform at rest, riding the expanding
            seam while surfaced. The hover trigger is the .nav-edge
            strip rendered after the rail below. */}
        <div className="nav-cue" aria-hidden="true" />
      </div>

      {/* Desktop auto-submerge hover trigger (2026-10-01 review; bugfix
          pass): an invisible strip over the wall gap — the off-canvas
          rail cannot catch :hover itself. Vertically limited to the
          wall tab's rest zone (railMidY ±40px, inline below) so only
          hovering the tab's neighborhood surfaces the rail, not the
          whole left edge. Follows .sidebar in DOM order so surface
          states can use plain sibling/ancestor selectors. */}
      <div
        className="nav-edge"
        aria-hidden="true"
        style={{ top: `${railMidY - 64}px`, height: '128px', bottom: 'auto' } as CSSProperties}
      />
    </>
  );
}
