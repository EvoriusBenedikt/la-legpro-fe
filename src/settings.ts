/**
 * App settings store: typed preferences persisted in localStorage
 * (`la_settings`) and applied as attributes on <html>. The inline
 * pre-paint script in index.html reads the same key before the bundle
 * loads (theme + reduce-motion + scale + font + locale + reading spacing,
 * so none flash);
 * this module owns runtime changes (the settings dialog) and tracks the
 * OS media query while the theme preference is 'system'. Components read
 * state through useSyncExternalStore(subscribeSettings, getSettingsSnapshot)
 * (or useStrings()/useLocale() in src/i18n.ts for the locale).
 *
 * Adding a preference: extend SettingsState + DEFAULTS, validate it in
 * load(), mirror the pre-paint read in index.html when it must apply
 * before first paint, then surface it in SettingsDialog.tsx.
 */
import type { BotAvatarType } from 'bot-avatars';
import { botAvatarTypes } from 'bot-avatars';

export type ThemePref = 'light' | 'dark' | 'system';

/** Interface language. 'id' (Indonesian) is the default and the baseline
    copy of every dictionary in src/i18n.ts. */
export type Locale = 'id' | 'en';

export const LOCALES: Locale[] = ['id', 'en'];

/** Date/time render format used app-wide through src/format.ts. 'id-ID' is
    the default (Indonesian); 'iso' renders YYYY-MM-DD for unambiguous
    deadline reading. No <html> attribute — read at render time. */
export type DateFormat = 'id-ID' | 'en-US' | 'iso';

/** Line-spacing preset for long-form reading surfaces (chat answers,
    evidence quotes, compliance text); applied as data-reading-spacing and
    consumed as a calc() multiplier in components.css. */
export type ReadingSpacing = 'compact' | 'cozy' | 'wide';

export const DATE_FORMATS: DateFormat[] = ['id-ID', 'en-US', 'iso'];
export const READING_SPACINGS: ReadingSpacing[] = ['compact', 'cozy', 'wide'];

export interface SettingsState {
  theme: ThemePref;
  /** Collapses animations/transitions app-wide (data-reduce-motion). */
  reduceMotion: boolean;
  /** Legal Opinion: follow the newest message when messages change. */
  chatAutoScroll: boolean;
  /** UI scale preset in % (data-ui-scale); scales the rem base. */
  uiScale: number;
  /** Interface font slug from CHAT_FONTS (data-chat-font); the key/attribute
      keep their original "chat" names so stored prefs stay valid, but the
      setting has applied app-wide since 2026-09-30. 'default' = theme font. */
  chatFont: string;
  /** Interface language slug (lang attribute + data-locale). */
  locale: Locale;
  /** Date/time format for every rendered date (src/format.ts). */
  dateFormat: DateFormat;
  /** Long-form line spacing (data-reading-spacing). */
  readingSpacing: ReadingSpacing;
  /** bot-avatars shape slug for the Sage identity; BotIdentity renders it
      everywhere (hero, message rows, pending row, picker toggle).
      Render-time only: no <html> attribute, no pre-paint mirror. */
  botAvatar: BotAvatarType;
  /** Body colour of the Sage mascot: '' follows the active theme's
      accent (the default); otherwise one of the BOT_AVATAR_COLORS
      hexes, chosen in Settings › Conversation. Render-time only,
      like botAvatar. */
  botAvatarColor: string;
}

/** Curated body colours offered for the Sage mascot (Settings ›
    Conversation swatch row). '' — the theme accent — is the default and
    gets its own split chip in the dialog instead of a list entry. */
export const BOT_AVATAR_COLORS: { slug: string; hex: string }[] = [
  { slug: 'violet', hex: '#7c3aed' },
  { slug: 'rose', hex: '#e11d48' },
  { slug: 'emerald', hex: '#059669' },
  { slug: 'amber', hex: '#d97706' },
  { slug: 'teal', hex: '#0d9488' },
  { slug: 'slate', hex: '#64748b' },
];

/** Discrete UI-scale presets offered by the typography section. */
export const UI_SCALE_PRESETS = [90, 100, 110, 125, 150, 175];

/** Built-in chat fonts; stacks are mirrored in components.css rules. */
export interface ChatFontOption {
  slug: string;
  label: string;
  /** CSS font-family stack; empty = theme font. */
  stack: string;
}

export const CHAT_FONTS: ChatFontOption[] = [
  { slug: 'default', label: 'Font tema (bawaan)', stack: '' },
  { slug: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { slug: 'georgia', label: 'Georgia', stack: 'Georgia, serif' },
  { slug: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { slug: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { slug: 'courier', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
];

const STORAGE_KEY = 'la_settings';
/** Single-key storage of the first theme popover, kept as migration input. */
const LEGACY_THEME_KEY = 'la_theme_pref';

const DEFAULTS: SettingsState = {
  theme: 'system',
  reduceMotion: false,
  chatAutoScroll: true,
  uiScale: 100,
  chatFont: 'default',
  locale: 'id',
  dateFormat: 'id-ID',
  readingSpacing: 'cozy',
  botAvatar: 'droid',
  botAvatarColor: '',
};

const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

const isThemePref = (v: unknown): v is ThemePref =>
  v === 'light' || v === 'dark' || v === 'system';

/** Whitelist-validate an unknown payload (stored JSON, imported file) into
    a partial state. Shared by load() and importSettings() so an imported
    file can never smuggle in values the store wouldn't accept. */
function sanitize(raw: unknown): Partial<SettingsState> {
  const out: Partial<SettingsState> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const p = raw as Record<string, unknown>;
  if (isThemePref(p.theme)) out.theme = p.theme;
  if (typeof p.reduceMotion === 'boolean') out.reduceMotion = p.reduceMotion;
  if (typeof p.chatAutoScroll === 'boolean') out.chatAutoScroll = p.chatAutoScroll;
  if (typeof p.uiScale === 'number' && UI_SCALE_PRESETS.includes(p.uiScale)) {
    out.uiScale = p.uiScale;
  }
  if (typeof p.chatFont === 'string' && CHAT_FONTS.some((f) => f.slug === p.chatFont)) {
    out.chatFont = p.chatFont;
  }
  if (p.locale === 'id' || p.locale === 'en') out.locale = p.locale;
  if (p.dateFormat === 'id-ID' || p.dateFormat === 'en-US' || p.dateFormat === 'iso') {
    out.dateFormat = p.dateFormat;
  }
  if (p.readingSpacing === 'compact' || p.readingSpacing === 'cozy' || p.readingSpacing === 'wide') {
    out.readingSpacing = p.readingSpacing;
  }
  if (typeof p.botAvatar === 'string' && (botAvatarTypes as string[]).includes(p.botAvatar)) {
    out.botAvatar = p.botAvatar as BotAvatarType;
  }
  if (
    typeof p.botAvatarColor === 'string' &&
    (p.botAvatarColor === '' || BOT_AVATAR_COLORS.some((c) => c.hex === p.botAvatarColor))
  ) {
    out.botAvatarColor = p.botAvatarColor;
  }
  return out;
}

function load(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...sanitize(JSON.parse(raw)) };
    }
    // One-time migration from the legacy single-key popover storage.
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (isThemePref(legacy)) return { ...DEFAULTS, theme: legacy };
  } catch {
    /* storage blocked or corrupt JSON — run on defaults */
  }
  return { ...DEFAULTS };
}

let state: SettingsState = load();

export function resolveTheme(s: SettingsState = state): 'light' | 'dark' {
  return s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme;
}

function applySideEffects() {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme());
  root.setAttribute('data-reduce-motion', state.reduceMotion ? 'true' : 'false');
  root.setAttribute('data-ui-scale', String(state.uiScale));
  root.setAttribute('data-chat-font', state.chatFont);
  root.setAttribute('data-locale', state.locale);
  root.setAttribute('data-reading-spacing', state.readingSpacing);
  root.lang = state.locale;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: settings apply for this page life only */
  }
}

export function getSettings(): SettingsState {
  return state;
}

export function setSetting<K extends keyof SettingsState>(
  key: K,
  value: SettingsState[K],
) {
  state = { ...state, [key]: value };
  persist();
  applySideEffects();
  listeners.forEach((l) => l());
}

/** Merge a validated external payload (Settings › Lanjutan › Impor) into
    the live state. Unknown or invalid keys are ignored, never persisted;
    the counts feed the dialog's status line. */
export function importSettings(raw: unknown): { applied: number; ignored: number } {
  const clean = sanitize(raw);
  const offered = typeof raw === 'object' && raw !== null ? Object.keys(raw).length : 0;
  state = { ...state, ...clean };
  persist();
  applySideEffects();
  listeners.forEach((l) => l());
  return {
    applied: Object.keys(clean).length,
    ignored: Math.max(0, offered - Object.keys(clean).length),
  };
}

/** Restore every preference to its default (Settings › Lanjutan › reset). */
export function resetSettings() {
  state = { ...DEFAULTS };
  persist();
  applySideEffects();
  listeners.forEach((l) => l());
}

/** Store subscription for useSyncExternalStore. */
export function subscribeSettings(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Stable primitive snapshot (JSON of the state object). */
export function getSettingsSnapshot(): string {
  return JSON.stringify(state);
}

// Follow OS flips while the theme preference is 'system'.
media.addEventListener('change', () => {
  if (state.theme === 'system') {
    applySideEffects();
    listeners.forEach((l) => l());
  }
});

// Apply stored settings at module load. The pre-paint script in
// index.html normally wins the race; this covers stale cached HTML and
// keeps the attributes authoritative for the SPA session.
applySideEffects();
