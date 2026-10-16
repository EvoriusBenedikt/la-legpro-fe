/* Sidebar navigation model (2026-10-11 monochrome sidebar redesign).
   Nav is data, not JSX: buildNav() reproduces the role gating the
   App.tsx routes enforce (pengguna → dewa) as a typed tree the Sidebar
   renders generically. Labels are i18n keys; icons are lucide
   components so the collapsed rail and the expanded rows share one
   source of truth. Adding/removing a destination = editing this file. */
import {
  BarChart2, CalendarClock, Database, FolderTree, Network, Scale,
  ShieldCheck, User, type LucideIcon,
} from 'lucide-react';
import type { StringKey } from './i18n';

export interface NavItem {
  id: string;
  to: string;
  /** Omitted for indented child rows (text-only, per design brief). */
  icon?: LucideIcon;
  labelKey: StringKey;
  /** Child row: active only when ?tab equals this value. */
  tab?: string;
  /** Parent row: active when ?tab is absent or not listed here. */
  tabExclude?: string[];
  /** Right-aligned count badge fed by useNavCounts. */
  badge?: 'pending';
}

export interface NavContentGroup {
  parent: NavItem;
  children: NavItem[];
}

export interface NavModel {
  primary: NavItem[];
  content: NavContentGroup | null;
  secondary: NavItem[];
}

export function getRoleLevel(role: string): number {
  const levels: Record<string, number> = {
    pengguna: 1, manajer: 2, direktur: 3, admin: 4,
    'sekretaris perusahaan': 5, 'insinyur ti': 6, dewa: 7,
  };
  return levels[role.toLowerCase()] ?? 1;
}

export function buildNav(role: string): NavModel {
  const level = getRoleLevel(role);
  const isAdmin = role === 'admin';
  const isEngineer = role === 'insinyur ti';
  const isSekretaris = role === 'sekretaris perusahaan';
  const isDewa = role === 'dewa';

  const opinion: NavItem = { id: 'opinion', to: '/opinion', icon: Scale, labelKey: 'navOpinion' };
  const contracts: NavItem = { id: 'contracts', to: '/contracts', icon: CalendarClock, labelKey: 'navContracts' };
  const graph: NavItem = { id: 'graph', to: '/graph', icon: Network, labelKey: 'navGraph' };
  const admin: NavItem = { id: 'admin', to: '/admin', icon: ShieldCheck, labelKey: 'navAdmin' };
  const monitoring: NavItem = { id: 'monitoring', to: '/monitoring', icon: BarChart2, labelKey: 'navMonitoring' };
  const repository: NavItem = {
    id: 'repository', to: '/repository', icon: Database, labelKey: 'navRepository',
    tabExclude: ['pending', 'history'],
  };

  /* Repository lives in the content group (parent + children), never in
     the primary list, for roles that have it at all. */
  const regularPrimary: NavItem[] = [
    opinion, contracts, ...(level >= 2 ? [graph] : []),
  ];

  let primary: NavItem[];
  if (isDewa) primary = [admin, monitoring, ...regularPrimary];
  else if (isEngineer) primary = [monitoring];
  else if (isAdmin) primary = [admin];
  else if (isSekretaris) primary = [admin, ...regularPrimary];
  else primary = regularPrimary;

  /* Content group: Repository parent + indented children deep-linking
     into the Repository's URL-persisted tabs (?tab=pending|history).
     The pending child (with its live count badge) only exists for
     roles the backend queue endpoint serves (level ≥ 5). */
  const hasRepository = !isAdmin && !isEngineer;
  const content: NavContentGroup | null = hasRepository
    ? {
        parent: repository,
        children: [
          { id: 'repo-docs', to: '/repository', labelKey: 'sbChildDocs' as StringKey, tabExclude: ['pending', 'history'] },
          ...(level >= 5
            ? [{
                id: 'repo-pending', to: '/repository', tab: 'pending',
                labelKey: 'sbChildPending' as StringKey, badge: 'pending' as const,
              }]
            : []),
          { id: 'repo-history', to: '/repository', tab: 'history', labelKey: 'sbChildHistory' as StringKey },
        ],
      }
    : null;

  /* Collapsible "Lainnya/More" group: the role's remaining surfaces. */
  const secondary: NavItem[] =
    isAdmin || isEngineer || isSekretaris || isDewa
      ? [
          { id: 'taxonomy', to: '/taxonomy', icon: FolderTree, labelKey: 'navTaxonomy' },
          { id: 'account', to: '/account', icon: User, labelKey: 'navAccount' },
        ]
      : [{ id: 'account', to: '/account', icon: User, labelKey: 'navAccount' }];

  return { primary, content, secondary };
}
