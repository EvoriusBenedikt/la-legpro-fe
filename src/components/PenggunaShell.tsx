import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Moon, Search, Settings, Sun, X } from 'lucide-react';
import NotificationDock from './NotificationDock';
import { useAuth } from '../hooks/useAuth';
import { useStrings } from '../i18n';
import { setSetting } from '../settings';
import useAppearance from '../useAppearance';
import './PenggunaShell.css';

/* FEAT phase-2 (2026-10-24): the standalone glass chrome from the phase-1
   pengguna home, extracted so more than one page can mount inside it.
   Used ONLY by pengguna-facing pages (home, contracts) which App.tsx routes
   outside the classic sidebar shell; every other role keeps the classic
   chrome. All styling is production tokens (PenggunaShell.css), so both
   themes hold with no per-theme overrides. */

export interface PenggunaSearchBoxProps {
  value: string;
  onChange: (next: string) => void;
  /** Placeholder + aria-label for the field (i18n). */
  label: string;
  /** aria-label for the clear (X) button (i18n). */
  clearAria: string;
}

/* One node of the topbar path trail (user request 2026-10-25: users go back
   and forth via clickable crumbs like Home > notebook > document). Nodes
   WITH `to` render as links; the FINAL node (no `to`) is the current page —
   plain text, aria-current="page". */
export interface PenggunaCrumb {
  label: string;
  to?: string;
}

interface PenggunaShellProps {
  children: ReactNode;
  /** Optional topbar search field wired to the page (home filters its
     library). Omitted on pages that carry their own search UI (contracts). */
  search?: PenggunaSearchBoxProps;
  /** Clickable path trail after the divider, e.g. Beranda > notebook >
     document. The last node is the current page (plain). Omitted = divider
     followed by nothing. */
  crumbs?: PenggunaCrumb[];
  /** False hides the page footer — for app-like views (Legal Opinion) that
     fill their full remaining viewport height with internal scrolling. */
  footer?: boolean;
}

/** Standalone full-bleed chrome for pengguna pages: glass topbar (brand,
    divider, optional document crumb, optional search, theme toggle,
    notification dock, account-settings gear, avatar pill) wrapping the page
    body, plus the workspace footer. */
/** Mobile-only in-content back control (2026-10-26, user request: phones
 *  get a back arrow next to the page's section kicker instead of the topbar
 *  trail — the topbar keeps brand + actions only). Hidden ≥681px via CSS;
 *  history-aware so a deep link that opened the page directly never exits
 *  the app — it falls back to home. */
export function PenggunaBackButton() {
  const t = useStrings();
  const navigate = useNavigate();
  const goBack = () => {
    const st = window.history.state as { idx?: number } | null;
    if (st && typeof st.idx === 'number' && st.idx > 0) navigate(-1);
    else navigate('/home');
  };
  return (
    <button type="button" className="ph-back" onClick={goBack} aria-label={t.phBackAria}>
      <ArrowLeft size={15} aria-hidden="true" />
    </button>
  );
}

export default function PenggunaShell({ children, search, crumbs, footer = true }: PenggunaShellProps) {
  const { user } = useAuth();
  const t = useStrings();
  const appearance = useAppearance();
  const initials = (user?.username?.trim() || '?')
    .split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const toggleTheme = () => setSetting('theme', appearance.theme === 'dark' ? 'light' : 'dark');

  return (
    <div className="ph-shell">
      <header className="ph-topbar">
        <Link className="ph-brand" to="/home" aria-label="Legal Analyzer">
          <img src="/LegalAnalyzerLogo.png" alt="" className="ph-brand-logo" />
          <span className="ph-brand-name">Legal Analyzer</span>
        </Link>
        <span className="ph-topbar-divider" aria-hidden="true" />
        {crumbs && crumbs.length > 0 && (
          <nav className="ph-crumbs" aria-label={t.phCrumbsAria}>
            {crumbs.map((node, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span className="ph-crumb-seg" key={`${node.label}-${i}`}>
                  {i > 0 && <ChevronRight size={12} className="ph-crumb-sep" aria-hidden="true" />}
                  {!last && node.to ? (
                    <Link className="ph-crumb-link" to={node.to} title={node.label}>
                      {node.label}
                    </Link>
                  ) : (
                    <span className="ph-crumb-here" title={node.label} aria-current={last ? 'page' : undefined}>
                      {node.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        <div className="ph-topbar-actions">
          {search && (
            <label className="ph-search">
              <Search size={15} aria-hidden="true" />
              <input
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.label}
                aria-label={search.label}
              />
              {search.value && (
                <button type="button" className="ph-clear" onClick={() => search.onChange('')} aria-label={search.clearAria}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </label>
          )}
          <button type="button" className="ph-icon-btn" onClick={toggleTheme} aria-label={t.homeThemeToggle}>
            {appearance.theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
          <div className="ph-dock-slot"><NotificationDock /></div>
          {/* Pengaturan Akun: gear icon button beside the notification dock
              (user request 2026-10-24: the workspace path dropdown is gone).
              `ph-account-gear` = mobile-only drop (the avatar pill links the
              same /account). */}
          <Link className="ph-icon-btn ph-account-gear" to="/account" title={t.navAccount} aria-label={t.navAccount}>
            <Settings size={17} aria-hidden="true" />
          </Link>
          <Link className="ph-avatar" to="/account" aria-label={t.navAccount}>
            <span className="ph-avatar-initials" aria-hidden="true">{initials}</span>
            <span className="ph-avatar-name" title={user?.username}>{user?.username}</span>
          </Link>
        </div>
      </header>

      {children}

      {footer && (
        <footer className="ph-footer">
          <span>{t.homeFooterLeft}</span>
          <span>{t.homeFooterRight}</span>
        </footer>
      )}
    </div>
  );
}

