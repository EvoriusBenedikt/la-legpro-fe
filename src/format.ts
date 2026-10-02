/**
 * Shared date/time formatting driven by the `dateFormat` preference
 * (Settings › Bahasa & Format › Format Tanggal). 'id-ID' is the app
 * default (Indonesian), 'en-US' serves English-locale users, and 'iso'
 * renders YYYY-MM-DD — unambiguous for deadline work. Formatting options
 * are pinned per format so output never depends on the browser locale.
 *
 * React components use useDateFormatters() so views re-render live when
 * the preference flips; render-external code (module-level helpers like
 * ContractMonitor's getExpiryInfo) takes an explicit DateFormat and calls
 * the pure *With variants.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { getSettingsSnapshot, subscribeSettings, type DateFormat } from './settings';

/** 'numeric' = dd/mm/yyyy style; 'short' = abbreviated month name. */
export type DateStyle = 'numeric' | 'short';

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Em dash for unparseable values, matching the app's empty-cell glyph. */
const INVALID = '—';

export function formatDateWith(
  fmt: DateFormat,
  value: Date | string,
  style: DateStyle = 'numeric',
): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return INVALID;
  if (fmt === 'iso') return isoDate(d);
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(fmt, opts);
}

export function formatDateTimeWith(fmt: DateFormat, value: Date | string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return INVALID;
  if (fmt === 'iso') {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${isoDate(d)} ${hh}:${mm}`;
  }
  return d.toLocaleString(fmt);
}

/** Time-of-day only ("refreshed at" stamps): id-ID → "14.32",
    en-US → "02:32 PM", iso → "14:32". Added 2026-09-30 so the admin
    dashboard's refresh clock honors the dateFormat preference like
    every other rendered time (format.ts contract). */
export function formatTimeWith(fmt: DateFormat, value: Date | string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return INVALID;
  if (fmt === 'iso') {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return d.toLocaleTimeString(fmt, { hour: '2-digit', minute: '2-digit' });
}

/** Bound formatters for the active preference; the component re-renders
    when the user flips the date format mid-session (the settings dialog
    can sit on top of a live view). */
export function useDateFormatters() {
  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
  const { dateFormat } = JSON.parse(snapshot) as { dateFormat: DateFormat };
  return useMemo(
    () => ({
      dateFormat,
      formatDate: (value: Date | string, style?: DateStyle) =>
        formatDateWith(dateFormat, value, style),
      formatDateTime: (value: Date | string) => formatDateTimeWith(dateFormat, value),
      formatTime: (value: Date | string) => formatTimeWith(dateFormat, value),
    }),
    [dateFormat],
  );
}
