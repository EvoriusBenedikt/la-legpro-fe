/**
 * Shared date/time formatting driven by the `dateFormat` preference
 * (Settings › Bahasa & Format › Format Tanggal). 'id-ID' is the app
 * default (Indonesian), 'en-US' serves English-locale users, and 'iso'
 * renders YYYY-MM-DD — unambiguous for deadline work. Formatting options
 * are pinned per format so output never depends on the browser locale.
 *
 * Two independent preferences meet here:
 *  - `dateFormat` decides numeric ordering and the 12h/24h clock;
 *  - the interface `locale` ('id' | 'en') decides month NAMES in the
 *    'short' style ("Mei" vs "May") and number grouping.
 *
 * React components use useDateFormatters() so views re-render live when
 * either preference flips; render-external code (module-level helpers like
 * expiry.ts) takes explicit arguments and calls the pure *With variants.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { getSettingsSnapshot, subscribeSettings, type DateFormat, type Locale } from './settings';

/** 'numeric' = dd/mm/yyyy style; 'short' = abbreviated month name. */
export type DateStyle = 'numeric' | 'short';

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** BCP-47 tag for the interface language (month names, number grouping). */
function localeTag(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'id-ID';
}

/** Em dash for unparseable values, matching the app's empty-cell glyph. */
const INVALID = '—';

/** 24-hour "HH:mm" with a colon (id-ID's native toLocaleTimeString uses a dot). */
function time24(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 12-hour "h:mm AM/PM" with a colon. */
function time12(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * `locale` only affects the 'short' style: month names follow the
 * interface language while numeric ordering keeps following `fmt`. When
 * omitted, month names fall back to `fmt` (legacy behavior).
 */
export function formatDateWith(
  fmt: DateFormat,
  value: Date | string,
  style: DateStyle = 'numeric',
  locale?: Locale,
): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return INVALID;
  if (fmt === 'iso') return isoDate(d);
  if (style === 'short') {
    return d.toLocaleDateString(locale ? localeTag(locale) : fmt, {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }
  return d.toLocaleDateString(fmt, { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** id-ID → "14/10/2026 14:32", en-US → "10/14/2026, 2:32 PM", iso → "2026-10-14 14:32". */
export function formatDateTimeWith(fmt: DateFormat, value: Date | string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return INVALID;
  if (fmt === 'iso') return `${isoDate(d)} ${time24(d)}`;
  if (fmt === 'en-US') {
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}, ${time12(d)}`;
  }
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${time24(d)}`;
}

/** Time-of-day only ("refreshed at" stamps): id-ID and iso → "14:32"
    (24-hour, colon), en-US → "2:32 PM". Honors the dateFormat preference
    like every other rendered time (format.ts contract). */
export function formatTimeWith(fmt: DateFormat, value: Date | string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return INVALID;
  return fmt === 'en-US' ? time12(d) : time24(d);
}

/** Locale-grouped number ("1.234,5" for id, "1,234.5" for en). */
export function formatNumber(locale: Locale, n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(localeTag(locale), opts);
}

/** Bound formatters for the active preferences; the component re-renders
    when the user flips the date format or the language mid-session (the
    settings dialog can sit on top of a live view). */
export function useDateFormatters() {
  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
  const parsed = JSON.parse(snapshot) as { dateFormat: DateFormat; locale?: unknown };
  const dateFormat = parsed.dateFormat;
  const locale: Locale = parsed.locale === 'en' ? 'en' : 'id';
  return useMemo(
    () => ({
      dateFormat,
      locale,
      formatDate: (value: Date | string, style?: DateStyle) =>
        formatDateWith(dateFormat, value, style, locale),
      formatDateTime: (value: Date | string) => formatDateTimeWith(dateFormat, value),
      formatTime: (value: Date | string) => formatTimeWith(dateFormat, value),
      formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => formatNumber(locale, n, opts),
    }),
    [dateFormat, locale],
  );
}
