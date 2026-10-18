import { formatDateWith } from './format';
import { STRINGS, fill, plural } from './i18n';
import type { DateFormat, Locale } from './settings';

/* Expiry-status logic shared by the Contracts page and the compliance
   results viewer (critique 2026-10-06, P1 #2 + P2 #5):
   - every color is a semantic token, so the dark theme flips them — the old
     hardcoded deep hexes measured ~2-3:1 on dark glass, sub-AA on the
     countdown itself;
   - the former ≤7d "critical" orange folded into the warning amber: the
     Verdict Triad stays three hues, and `imminent` keeps the escalation
     copy/icon without inventing a fourth color.

   Text is resolved for the `locale` passed in at CALL time and never
   stored: callers invoke this during render (they re-render on a
   language flip via useDateFormatters), so labels cannot go stale. */

export type ExpiryStatus = 'expired' | 'warning' | 'active' | 'none';

export interface ExpiryInfo {
  status: ExpiryStatus;
  label: string;
  daysLeft: number | null;
  /** Warning-state document expiring within 7 days — drives the escalation
      copy ("Kurang dari 1 minggu") and the AlertTriangle badge icon. */
  imminent: boolean;
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  notifText: string;
  notifColor: string;
}

export function getExpiryInfo(expiration_date: string | null, fmt: DateFormat, locale: Locale): ExpiryInfo {
  const t = STRINGS[locale];
  if (!expiration_date) return {
    status: 'none', label: t.expNone, daysLeft: null, imminent: false,
    badgeColor: 'var(--text-secondary)', badgeBg: 'rgba(100,116,139,0.15)', badgeBorder: 'rgba(100,116,139,0.3)',
    notifText: '', notifColor: ''
  };

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const exp = new Date(expiration_date); exp.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  const dateStr = formatDateWith(fmt, exp, 'short', locale);

  if (daysLeft < 0) return {
    status: 'expired', label: plural(t, 'expExpiredAgo', Math.abs(daysLeft), { n: Math.abs(daysLeft) }), daysLeft, imminent: false,
    badgeColor: 'var(--danger-text)', badgeBg: 'var(--danger-bg)', badgeBorder: 'var(--danger-border)',
    notifText: fill(t.expExpiredSince, { date: dateStr }), notifColor: 'var(--danger-text)'
  };
  if (daysLeft <= 31) return {
    status: 'warning', label: plural(t, 'expDaysLeft', daysLeft, { n: daysLeft }), daysLeft, imminent: daysLeft <= 7,
    badgeColor: 'var(--warning-text)', badgeBg: 'var(--warning-bg)', badgeBorder: 'var(--warning-border)',
    notifText: fill(daysLeft <= 7 ? t.expUnderWeek : t.expUnderMonth, { date: dateStr }),
    notifColor: 'var(--warning-text)'
  };
  return {
    status: 'active', label: dateStr, daysLeft, imminent: false,
    badgeColor: 'var(--success-text)', badgeBg: 'var(--success-bg)', badgeBorder: 'var(--success-border)',
    notifText: '', notifColor: ''
  };
}

/** Fixed-vocabulary status words (PRODUCT.md) for KPI labels and CSV export. */
export function expiryStatusWord(status: ExpiryStatus, locale: Locale): string {
  const t = STRINGS[locale];
  switch (status) {
    case 'active': return t.expWordActive;
    case 'warning': return t.expWordSoon;
    case 'expired': return t.expWordExpired;
    case 'none': return t.expNone;
  }
}
