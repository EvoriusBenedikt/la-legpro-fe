import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown, ChevronsLeft, ChevronsRight, Layers, Scale, Search,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useStrings } from '../i18n';
import { buildNav, type NavItem } from '../navConfig';
import { useNavCounts } from '../hooks/useNavCounts';
import SettingsDialog from './SettingsDialog';
import HelpDialog from './HelpDialog';

interface SidebarProps {
  /** Mobile: off-canvas drawer open state */
  mobileOpen?: boolean;
  /** Mobile: close the drawer (backdrop click / nav selection) */
  onClose?: () => void;
}

/* Desktop collapse state persists across sessions. */
const COLLAPSE_KEY = 'la_sidebar_collapsed';

/* Persistent monochrome sidebar (2026-10-11 redesign; replaces the
   2026-10-01 auto-submerge hover rail — nav-cue/nav-edge are gone).
   Grammar and tokens: styles/sidebar.css + the --sb-* set in
   tokens.css; normative record in ui_ux_design.md §Sidebar.

   Desktop (≥768px): a static left column spanning the full viewport
   height; the shell (topbar + content) sits beside it. The header
   chevron collapses the column to a 64px icon rail with dark tooltips
   on the right; the state persists in localStorage. Mobile: the
   off-canvas drawer contract is unchanged (mobileOpen/onClose props +
   backdrop), and the drawer always shows the expanded layout.

   Nav structure is data (src/navConfig.ts buildNav), rendered
   generically here: primary group → content group (Repository parent +
   indented ?tab children with the live pending badge) → collapsible
   "more" group → pinned footer (settings + help). Active detection is
   manual (Link + aria-current rather than NavLink) because the
   Repository children differ only by ?tab, which NavLink ignores. */
export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps = {}) {
  const { user } = useAuth();
  const t = useStrings();
  const location = useLocation();
  const role = user?.role?.toLowerCase() || '';
  const model = useMemo(() => buildNav(role), [role]);
  const counts = useNavCounts();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(true);
  const navRef = useRef<HTMLElement>(null);

  /* Client-side menu search over the current-language labels. A
     content group survives when its parent matches (children all stay)
     or any child matches; the "more" group force-opens while searching
     so a hit can never hide inside a collapsed group. */
  const q = query.trim().toLowerCase();
  const matches = (item: NavItem) =>
    !q || t[item.labelKey].toLowerCase().includes(q);

  const primary = model.primary.filter(matches);
  let content = model.content;
  if (content && q && !matches(content.parent)) {
    const kids = content.children.filter(matches);
    content = kids.length ? { parent: content.parent, children: kids } : null;
  }
  const secondary = model.secondary.filter(matches);
  const searching = q.length > 0;
  const moreExpanded = searching || moreOpen;
  const noMatch =
    searching && primary.length === 0 && !content && secondary.length === 0;

  /* Active state: pathname exact-match, plus ?tab discrimination for
     the Repository family (a child owns its tab; the parent owns every
     other tab and the bare path). */
  const tab = new URLSearchParams(location.search).get('tab');
  const isActive = (item: NavItem): boolean => {
    if (location.pathname !== item.to) return false;
    if (item.tab !== undefined) return tab === item.tab;
    if (item.tabExclude) return tab === null || !item.tabExclude.includes(tab);
    return true;
  };

  /* Rail mode = the collapsed rail is what the user sees (desktop only:
     the mobile drawer always renders the expanded layout, so mobileOpen
     excludes it). In rail mode children are display:none, so an active
     child would leave the rail with no highlight at all — the parent
     inherits it there (sb-active + aria-current="true"; the hidden
     child keeps aria-current="page" but is out of the a11y tree). */
  const railMode = collapsed && !mobileOpen;

  /* Roving keyboard navigation: ArrowUp/Down walk the visible rows,
     Home/End jump to the ends. Enter/Space stay native (rows are real
     links and buttons). Display-none rows (collapsed group, hidden
     children) drop out via the offsetParent check. */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const rows = Array.from(
      navRef.current?.querySelectorAll<HTMLElement>('a.sb-row, button.sb-row') ?? [],
    ).filter((el) => el.offsetParent !== null);
    if (rows.length === 0) return;
    e.preventDefault();
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? rows.length - 1
      : e.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1)
      : Math.max(0, idx - 1);
    rows[next]?.focus();
  };

  const renderRow = (item: NavItem, child = false, inheritActive = false) => {
    const Icon = item.icon;
    const own = isActive(item);
    const active = own || inheritActive;
    const badge = item.badge === 'pending' ? counts.pending : null;
    const label = t[item.labelKey];
    return (
      <Link
        key={item.id}
        to={item.tab ? `${item.to}?tab=${item.tab}` : item.to}
        className={`sb-row${child ? ' sb-row--child' : ''}${active ? ' sb-active' : ''}`}
        aria-current={own ? 'page' : active ? 'true' : undefined}
        data-tip={label}
        onClick={onClose}
      >
        {Icon && <Icon size={20} className="sb-icon" aria-hidden="true" />}
        <span className="sb-label">{label}</span>
        {badge !== null && <span className="sb-badge">{badge}</span>}
      </Link>
    );
  };

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop open" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        id="app-sidebar"
        className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' open' : ''}`}
      >
        <div className="sb-header">
          <span className="sb-mark" aria-hidden="true">
            <Scale size={20} />
          </span>
          <span className="sb-brand">
            <span className="sb-brand-name">Legal Analyzer</span>
            <span className="sb-brand-sub">LA Lintasarta Core</span>
          </span>
          <button
            type="button"
            className="sb-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.sbExpand : t.sbCollapse}
            title={collapsed ? t.sbExpand : t.sbCollapse}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>

        <div className="sb-search">
          <Search size={16} className="sb-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="sb-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.sbSearchPlaceholder}
            aria-label={t.sbSearchPlaceholder}
          />
        </div>

        <nav
          className="sb-scroll"
          ref={navRef}
          onKeyDown={onKeyDown}
          aria-label={t.mainNav}
        >
          {primary.length > 0 && (
            <div className="sb-group">
              {primary.map((item) => renderRow(item))}
            </div>
          )}

          {content && (
            <div className="sb-group">
              {renderRow(content.parent, false, railMode && content.children.some(isActive))}
              <div className="sb-group-children">
                {content.children.map((item) => renderRow(item, true))}
              </div>
            </div>
          )}

          {(!searching || secondary.length > 0) && (
            <div className="sb-group">
              <button
                type="button"
                className="sb-row sb-group-btn"
                aria-expanded={moreExpanded}
                aria-controls="sb-more"
                onClick={() => setMoreOpen((o) => !o)}
                data-tip={t.sbMore}
              >
                <Layers size={20} className="sb-icon" aria-hidden="true" />
                <span className="sb-label">{t.sbMore}</span>
                <ChevronDown size={16} className="sb-chevron" aria-hidden="true" />
              </button>
              <div className="sb-group-children" id="sb-more">
                {secondary.map((item) => renderRow(item))}
              </div>
            </div>
          )}

          {noMatch && <div className="sb-empty">{t.sbNoMatch}</div>}
        </nav>

        <div className="sb-footer">
          <SettingsDialog variant="sidebar" triggerLabel={t.settings} />
          <HelpDialog triggerLabel={t.sbHelp} />
        </div>
      </aside>
    </>
  );
}
