import { formatDateWith } from './format';
import type { DateFormat } from './settings';

/* Expiry-status logic shared by the Contracts page and the compliance
   results viewer (critique 2026-10-06, P1 #2 + P2 #5):
   - every color is a semantic token, so the dark theme flips them — the old
     hardcoded deep hexes measured ~2-3:1 on dark glass, sub-AA on the
     countdown itself;
   - the former ≤7d "critical" orange folded into the warning amber: the
     Verdict Triad stays three hues, and `imminent` keeps the escalation
     copy/icon without inventing a fourth color. */

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

export function getExpiryInfo(expiration_date: string | null, fmt: DateFormat): ExpiryInfo {
  if (!expiration_date) return {
    status: 'none', label: 'Tidak terdeteksi', daysLeft: null, imminent: false,
    badgeColor: 'var(--text-secondary)', badgeBg: 'rgba(100,116,139,0.15)', badgeBorder: 'rgba(100,116,139,0.3)',
    notifText: '', notifColor: ''
  };

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const exp = new Date(expiration_date); exp.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  const dateStr = formatDateWith(fmt, exp, 'short');

  if (daysLeft < 0) return {
    status: 'expired', label: `Kedaluwarsa ${Math.abs(daysLeft)} hari lalu`, daysLeft, imminent: false,
    badgeColor: 'var(--danger-text)', badgeBg: 'var(--danger-bg)', badgeBorder: 'var(--danger-border)',
    notifText: `Dokumen telah kedaluwarsa sejak ${dateStr}`, notifColor: 'var(--danger-text)'
  };
  if (daysLeft <= 31) return {
    status: 'warning', label: `${daysLeft} hari lagi`, daysLeft, imminent: daysLeft <= 7,
    badgeColor: 'var(--warning-text)', badgeBg: 'var(--warning-bg)', badgeBorder: 'var(--warning-border)',
    notifText: daysLeft <= 7
      ? `Kurang dari 1 minggu — kedaluwarsa ${dateStr}`
      : `Kurang dari 1 bulan — kedaluwarsa ${dateStr}`,
    notifColor: 'var(--warning-text)'
  };
  return {
    status: 'active', label: dateStr, daysLeft, imminent: false,
    badgeColor: 'var(--success-text)', badgeBg: 'var(--success-bg)', badgeBorder: 'var(--success-border)',
    notifText: '', notifColor: ''
  };
}

/** Fixed-vocabulary status words (PRODUCT.md) for KPI labels and CSV export. */
export function expiryStatusWord(status: ExpiryStatus): string {
  switch (status) {
    case 'active': return 'Aktif';
    case 'warning': return 'Segera Berakhir';
    case 'expired': return 'Kedaluwarsa';
    case 'none': return 'Tidak terdeteksi';
  }
}
