import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import {
  Settings, X, ChevronRight, Palette, SunMoon, SlidersHorizontal,
  MessagesSquare, Sun, Moon, Monitor, Type, Languages,
  CalendarDays, Settings2, Database, Download, Upload, RotateCcw, History,
} from 'lucide-react';
import { botAvatarTypes, type BotAvatarType } from 'bot-avatars';
import { FlagId, FlagUs } from './LangFlags';
import {
  getSettingsSnapshot, getSettings, setSetting, subscribeSettings,
  importSettings, resetSettings,
  CHAT_FONTS, UI_SCALE_PRESETS, BOT_AVATAR_COLORS,
  JOB_RETENTION_PRESETS, JOB_RETENTION_MAX_DAYS,
  type SettingsState, type ThemePref, type Locale,
  type DateFormat, type ReadingSpacing,
} from '../settings';
import { countPrunableJobs } from '../uploadJobs';
import { formatDateTimeWith } from '../format';
import { useStrings, fill, type StringKey } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';
import BotIdentity from './BotIdentity';

/**
 * Settings dialog (topbar gear): full-screen modal with a category nav
 * (single-open accordion), a breadcrumb, and content sections built from
 * title/description rows with a right-aligned control (switch or
 * segmented radiogroup) — the pattern locked in ui_ux_design.md.
 *
 * The section registry below is the growth point: new settings mean a
 * new row inside an existing section component, or a new entry in
 * buildCategories. Copy comes from src/i18n.ts (Indonesian baseline,
 * English second locale).
 *
 * A11y: aria-modal dialog via useDialogA11y (Esc closes, focus moves in
 * and restores to the gear, Tab trapped). Switches are role="switch"
 * buttons wired to the row title/description via aria-labelledby/
 * aria-describedby; segmented controls and the avatar/swatch pickers are
 * native radiogroups so arrow keys work for free. The content pane is a
 * labelled region with an sr-only h2 (rows are h3) that receives focus on
 * section switches; Close is the last tab stop (2026-10-13, critique
 * P1·2 / P2·4 / P2·5).
 */

type Icon = typeof Sun;

function useSettingsState(): SettingsState {
  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
  return JSON.parse(snapshot) as SettingsState;
}

/* ---------- row + control primitives ---------- */

function Row({
  id, title, desc, children,
}: {
  id: string;
  title: string;
  desc: string;
  children: (ids: { labelledBy: string; describedBy: string }) => ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <h3 className="settings-row-title" id={`${id}-title`}>{title}</h3>
        <div className="settings-row-desc" id={`${id}-desc`}>{desc}</div>
      </div>
      <div className="settings-row-control">
        {children({ labelledBy: `${id}-title`, describedBy: `${id}-desc` })}
      </div>
    </div>
  );
}

function Switch({
  checked, onChange, labelledBy, describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelledBy: string;
  describedBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`settings-switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-knob" />
    </button>
  );
}

interface SegOption {
  value: string;
  label: string;
  /* ComponentType (not the lucide Icon alias) so non-lucide glyphs — the
     shared LangFlags SVGs on the language row, 2026-10-12 — can occupy
     the slot; lucide icons remain assignable since size is optional. */
  icon?: ComponentType<{ size?: number | string }>;
}

/** Segmented radiogroup: native radios visually hidden inside segment
    labels keep arrow-key navigation; the checked segment and the
    :has(input:focus-visible) ring carry the visible state. */
function Segmented({
  options, value, name, onChange, labelledBy, describedBy,
}: {
  options: SegOption[];
  value: string;
  name: string;
  onChange: (v: string) => void;
  labelledBy: string;
  describedBy: string;
}) {
  return (
    <div
      className="settings-segmented"
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {options.map((o) => {
        const SegIcon = o.icon;
        return (
          <label
            key={o.value}
            className={`settings-segment${value === o.value ? ' checked' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {SegIcon ? <SegIcon size={14} /> : null}
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ---------- sections ---------- */

function ThemeSection() {
  const s = useSettingsState();
  const t = useStrings();
  const options: SegOption[] = [
    { value: 'light', label: t.optLight, icon: Sun },
    { value: 'dark', label: t.optDark, icon: Moon },
    { value: 'system', label: t.optSystem, icon: Monitor },
  ];
  return (
    <div className="settings-section">
      <Row
        id="set-theme"
        title={t.themeTitle}
        desc={t.themeDesc}
      >
        {(ids) => (
          <Segmented
            options={options}
            value={s.theme}
            name="settings-theme"
            onChange={(v) => setSetting('theme', v as ThemePref)}
            {...ids}
          />
        )}
      </Row>
    </div>
  );
}

/** Line-heights of the spacing preview sample; mirror the .bubble calc
    (1.6 × the --reading-lh-mult multiplier in components.css). */
const SPACING_PREVIEW_LH: Record<ReadingSpacing, number> = {
  compact: 1.4,
  cozy: 1.6,
  wide: 1.84,
};

function TypographySection() {
  const s = useSettingsState();
  const t = useStrings();
  const font = CHAT_FONTS.find((f) => f.slug === s.chatFont) ?? CHAT_FONTS[0];
  return (
    <div className="settings-section">
      <Row
        id="set-ui-scale"
        title={t.scaleTitle}
        desc={fill(t.scaleDesc, { v: s.uiScale })}
      >
        {(ids) => (
          <Segmented
            options={UI_SCALE_PRESETS.map((p) => ({ value: String(p), label: `${p}%` }))}
            value={String(s.uiScale)}
            name="settings-ui-scale"
            onChange={(v) => setSetting('uiScale', Number(v))}
            {...ids}
          />
        )}
      </Row>
      <Row
        id="set-chat-font"
        title={t.fontTitle}
        desc={t.fontDesc}
      >
        {(ids) => (
          <div className="settings-control-group">
            <select
              className="settings-select"
              value={s.chatFont}
              aria-labelledby={ids.labelledBy}
              aria-describedby={ids.describedBy}
              onChange={(e) => setSetting('chatFont', e.target.value)}
            >
              {CHAT_FONTS.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.slug === 'default' ? t.fontDefault : f.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="settings-link-btn"
              onClick={() => setSetting('chatFont', 'default')}
              disabled={s.chatFont === 'default'}
            >
              {t.useThemeFont}
            </button>
          </div>
        )}
      </Row>
      <Row
        id="set-reading-spacing"
        title={t.spacingTitle}
        desc={t.spacingDesc}
      >
        {(ids) => (
          <Segmented
            options={[
              { value: 'compact', label: t.spacingCompact },
              { value: 'cozy', label: t.spacingCozy },
              { value: 'wide', label: t.spacingWide },
            ]}
            value={s.readingSpacing}
            name="settings-reading-spacing"
            onChange={(v) => setSetting('readingSpacing', v as ReadingSpacing)}
            {...ids}
          />
        )}
      </Row>
      <div className="settings-preview">
        <span>{t.preview}</span>
        <span
          className="settings-preview-text"
          style={font.stack ? { fontFamily: font.stack } : undefined}
        >
          The quick brown fox jumps over the lazy dog. 0123456789
        </span>
      </div>
      <div className="settings-preview settings-preview--block">
        <span>{t.preview}</span>
        <span
          className="settings-preview-text"
          style={{ lineHeight: SPACING_PREVIEW_LH[s.readingSpacing] }}
        >
          {t.spacingSample}
        </span>
      </div>
    </div>
  );
}

function GeneralSection() {
  const s = useSettingsState();
  const t = useStrings();
  return (
    <div className="settings-section">
      <Row
        id="set-motion"
        title={t.motionTitle}
        desc={t.motionDesc}
      >
        {(ids) => (
          <Switch
            checked={s.reduceMotion}
            onChange={(v) => setSetting('reduceMotion', v)}
            {...ids}
          />
        )}
      </Row>
    </div>
  );
}

/** Shape slug → display-name i18n key (critique P1·2: the raw library
    slugs like "droid" were the pickers' accessible names). Typed as
    Record<BotAvatarType, StringKey> so a new library shape without a
    name fails compilation. */
const AVATAR_NAME_KEYS: Record<BotAvatarType, StringKey> = {
  clover: 'avatarNameClover',
  flower: 'avatarNameFlower',
  triangle: 'avatarNameTriangle',
  square: 'avatarNameSquare',
  blob: 'avatarNameBlob',
  ghost: 'avatarNameGhost',
  circle: 'avatarNameCircle',
  drop: 'avatarNameDrop',
  star: 'avatarNameStar',
  droid: 'avatarNameDroid',
  mech: 'avatarNameMech',
  alien: 'avatarNameAlien',
  hexagon: 'avatarNameHexagon',
  cat: 'avatarNameCat',
  cloud: 'avatarNameCloud',
  pill: 'avatarNamePill',
  pebble: 'avatarNamePebble',
  puddle: 'avatarNamePuddle',
};

/** Swatch slug → display-name i18n key. BOT_AVATAR_COLORS slugs are
    plain strings, so an unmapped slug falls back to the slug text. */
const COLOR_NAME_KEYS: Record<string, StringKey> = {
  violet: 'avatarColorViolet',
  rose: 'avatarColorRose',
  emerald: 'avatarColorEmerald',
  amber: 'avatarColorAmber',
  teal: 'avatarColorTeal',
  slate: 'avatarColorSlate',
};

function ChatGeneralSection() {
  const s = useSettingsState();
  const t = useStrings();
  return (
    <div className="settings-section">
      <Row
        id="set-autoscroll"
        title={t.autoTitle}
        desc={t.autoDesc}
      >
        {(ids) => (
          <Switch
            checked={s.chatAutoScroll}
            onChange={(v) => setSetting('chatAutoScroll', v)}
            {...ids}
          />
        )}
      </Row>
      {/* gemma avatar picker (moved here 2026-10-01 from the Legal Opinion
          conversation-panel footer, user review): a radiogroup grid of
          paused still previews, one per bot-avatars shape; the choice is
          the botAvatar setting and every BotIdentity instance follows it
          through useAppearance. */}
      <Row
        id="set-avatar"
        title={t.avatarTitle}
        desc={t.avatarDesc}
      >
        {(ids) => (
          <div
            className="settings-avatar-grid"
            role="radiogroup"
            aria-labelledby={ids.labelledBy}
            aria-describedby={ids.describedBy}
          >
            {botAvatarTypes.map((type) => (
              <label
                key={type}
                className={`settings-avatar-item${type === s.botAvatar ? ' selected' : ''}`}
                title={t[AVATAR_NAME_KEYS[type]]}
              >
                {/* Visually-hidden native radio (the Segmented idiom):
                    arrow keys, "5 of 18" position announcements and one
                    tab stop per group come for free (critique P1·2). */}
                <input
                  type="radio"
                  name="settings-bot-avatar-shape"
                  value={type}
                  checked={type === s.botAvatar}
                  aria-label={t[AVATAR_NAME_KEYS[type]]}
                  onChange={() => setSetting('botAvatar', type)}
                />
                <BotIdentity shape={type} size={28} paused />
              </label>
            ))}
          </div>
        )}
      </Row>
      {/* gemma avatar body colour (2026-10-01 review): swatch radiogroup
          beside the shape picker; the first chip is '' = the theme
          accent (default, split light/dark), the rest are the curated
          BOT_AVATAR_COLORS hexes. Every BotIdentity follows through
          useAppearance, picker previews included. */}
      <Row
        id="set-avatar-color"
        title={t.avatarColorTitle}
        desc={t.avatarColorDesc}
      >
        {(ids) => (
          <div
            className="settings-swatch-row"
            role="radiogroup"
            aria-labelledby={ids.labelledBy}
            aria-describedby={ids.describedBy}
          >
            <label
              className={`settings-swatch-item${s.botAvatarColor === '' ? ' selected' : ''}`}
              style={{ background: 'linear-gradient(135deg, #2563eb 0 50%, #3b82f6 50% 100%)' }}
              title={t.avatarColorAccent}
            >
              <input
                type="radio"
                name="settings-bot-avatar-color"
                value=""
                checked={s.botAvatarColor === ''}
                aria-label={t.avatarColorAccent}
                onChange={() => setSetting('botAvatarColor', '')}
              />
            </label>
            {BOT_AVATAR_COLORS.map((c) => {
              // Display name instead of the slug (critique P1·2); an
              // unmapped slug falls back to its own text.
              const name = COLOR_NAME_KEYS[c.slug] ? t[COLOR_NAME_KEYS[c.slug]] : c.slug;
              return (
                <label
                  key={c.slug}
                  className={`settings-swatch-item${s.botAvatarColor === c.hex ? ' selected' : ''}`}
                  style={{ background: c.hex }}
                  title={name}
                >
                  <input
                    type="radio"
                    name="settings-bot-avatar-color"
                    value={c.slug}
                    checked={s.botAvatarColor === c.hex}
                    aria-label={name}
                    onChange={() => setSetting('botAvatarColor', c.hex)}
                  />
                </label>
              );
            })}
          </div>
        )}
      </Row>
    </div>
  );
}

function LanguageSection() {
  const s = useSettingsState();
  const t = useStrings();
  return (
    <div className="settings-section">
      <Row
        id="set-language"
        title={t.langTitle}
        desc={t.langDesc}
      >
        {(ids) => (
          <Segmented
            options={[
              { value: 'id', label: 'Indonesia', icon: FlagId },
              { value: 'en', label: 'English', icon: FlagUs },
            ]}
            value={s.locale}
            name="settings-language"
            onChange={(v) => setSetting('locale', v as Locale)}
            {...ids}
          />
        )}
      </Row>
    </div>
  );
}

function DateFormatSection() {
  const s = useSettingsState();
  const t = useStrings();
  // Live sample in the row description: re-renders on every flip because
  // useSettingsState subscribes to the store. Segment labels are fixed
  // sample dates (locale-independent glyphs) so the row reads at a glance.
  return (
    <div className="settings-section">
      <Row
        id="set-date-format"
        title={t.dateFmtTitle}
        desc={fill(t.dateFmtDesc, { v: formatDateTimeWith(s.dateFormat, new Date()) })}
      >
        {(ids) => (
          <Segmented
            options={[
              { value: 'id-ID', label: '31/12/2025' },
              { value: 'en-US', label: '12/31/2025' },
              { value: 'iso', label: '2025-12-31' },
            ]}
            value={s.dateFormat}
            name="settings-date-format"
            onChange={(v) => setSetting('dateFormat', v as DateFormat)}
            {...ids}
          />
        )}
      </Row>
    </div>
  );
}

function SettingsDataSection() {
  const t = useStrings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(getSettings(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'la_settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // importSettings never throws and never persists invalid keys; the
  // try/catch only covers malformed JSON in the chosen file.
  const handleImport = async (file: File) => {
    try {
      const result = importSettings(JSON.parse(await file.text()));
      setStatus(
        result.applied > 0
          ? fill(t.importDone, { n: result.applied, x: result.ignored })
          : t.importEmpty,
      );
    } catch {
      setStatus(t.importError);
    }
  };

  return (
    <div className="settings-section">
      <Row id="set-export" title={t.exportTitle} desc={t.exportDesc}>
        {({ describedBy }) => (
          <button
            type="button"
            className="settings-link-btn settings-action-btn"
            aria-describedby={describedBy}
            onClick={handleExport}
          >
            <Download size={14} /> {t.exportBtn}
          </button>
        )}
      </Row>
      <Row id="set-import" title={t.importTitle} desc={t.importDesc}>
        {({ describedBy }) => (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="settings-link-btn settings-action-btn"
              aria-describedby={describedBy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} /> {t.importBtn}
            </button>
          </>
        )}
      </Row>
      <Row id="set-reset" title={t.resetTitle} desc={t.resetDesc}>
        {({ describedBy }) => (
          <button
            type="button"
            className="settings-link-btn settings-action-btn settings-link-btn--danger"
            aria-describedby={describedBy}
            onClick={() => {
              if (window.confirm(t.resetConfirm)) {
                resetSettings();
                setStatus('');
              }
            }}
          >
            <RotateCcw size={14} /> {t.resetBtn}
          </button>
        )}
      </Row>
      {status && (
        <div className="settings-status" role="status">
          {status}
        </div>
      )}
    </div>
  );
}

/** Retention preset ages (days) → i18n label keys. Kept beside the
    section so preset copy and preset values stay in one view. */
const RETENTION_LABEL_KEYS: Record<number, StringKey> = {
  7: 'jobsRetWeek',
  30: 'jobsRetMonth1',
  90: 'jobsRetMonth3',
  180: 'jobsRetMonth6',
  270: 'jobsRetMonth9',
  365: 'jobsRetMonth12',
};

/** Contracts "Riwayat Analisis" retention (2026-10-08, user decision):
    finished job records are pruned from localStorage after N days;
    0 = off (keep until "Bersihkan"). Analyzed documents are server-side
    data and are never touched here. The select carries presets + custom;
    choosing custom reveals a days input (committed on blur/Enter).
    Every application reports how many old entries it deleted, and a
    rejected draft snaps back with the valid range spoken (2026-10-13,
    critique P1·1 + P2·3). */
function JobsDataSection() {
  const s = useSettingsState();
  const t = useStrings();
  const days = s.jobRetentionDays;
  const isPreset = days === 0 || JOB_RETENTION_PRESETS.includes(days);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [draft, setDraft] = useState(!isPreset ? String(days) : '');
  /** Line under the row (critique P1·1 + P2·3): 'status' reports how many
      old entries the new window just deleted; 'error' names the valid
      range when a draft is rejected. null = quiet. */
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);

  const current =
    days === 0
      ? t.jobsRetOff
      : isPreset
        ? t[RETENTION_LABEL_KEYS[days]]
        : `${days} ${t.jobsRetDaysUnit}`;

  /** Applies the window and reports its impact. The count is read before
      setSetting: the provider's subscriber prunes synchronously right
      after, but its persistence effect writes localStorage later, so
      storage still holds the pre-prune list. countPrunableJobs shares
      the prune code, so the figure cannot drift from what is dropped. */
  const applyRetention = (n: number) => {
    const pruned = countPrunableJobs(n);
    setSetting('jobRetentionDays', n);
    setFeedback(
      pruned > 0
        ? {
            kind: 'status',
            text:
              pruned === 1
                ? fill(t.jobsRetPrunedOne, { n: pruned })
                : fill(t.jobsRetPrunedMany, { n: pruned }),
          }
        : null,
    );
  };

  const commitDraft = () => {
    const n = Math.floor(Number(draft));
    if (draft.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= JOB_RETENTION_MAX_DAYS) {
      applyRetention(n);
    } else {
      // Rejections speak (critique P2·3): snap back to the stored value
      // and name the range in the reason. Enter keeps focus on the input
      // naturally; blur has already moved it away, so it is not dragged
      // back on the way out.
      setDraft(isPreset ? '' : String(days));
      setFeedback({
        kind: 'error',
        text: fill(t.jobsRetDaysInvalid, { min: 1, max: JOB_RETENTION_MAX_DAYS }),
      });
    }
  };

  return (
    <div className="settings-section">
      <Row id="set-job-retention" title={t.jobsRetTitle} desc={fill(t.jobsRetDesc, { v: current })}>
        {(ids) => (
          <div className="settings-control-group">
            <select
              className="settings-select"
              value={customMode ? 'custom' : String(days)}
              aria-labelledby={ids.labelledBy}
              aria-describedby={ids.describedBy}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') {
                  setCustomMode(true);
                  setDraft(days > 0 ? String(days) : '30');
                  setFeedback(null);
                } else {
                  setCustomMode(false);
                  setDraft('');
                  applyRetention(Number(v));
                }
              }}
            >
              <option value="0">{t.jobsRetOff}</option>
              {JOB_RETENTION_PRESETS.map((p) => (
                <option key={p} value={String(p)}>{t[RETENTION_LABEL_KEYS[p]]}</option>
              ))}
              <option value="custom">{t.jobsRetCustom}</option>
            </select>
            {customMode && (
              <input
                type="number"
                className="settings-days-input"
                min={1}
                max={JOB_RETENTION_MAX_DAYS}
                value={draft}
                placeholder="30"
                aria-label={t.jobsRetDaysAria}
                aria-describedby={`${ids.describedBy} set-job-retention-days-line`}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (feedback?.kind === 'error') setFeedback(null);
                }}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft();
                }}
              />
            )}
          </div>
        )}
      </Row>
      {feedback?.kind === 'status' && (
        <div className="settings-status" role="status">
          {feedback.text}
        </div>
      )}
      {customMode &&
        (feedback?.kind === 'error' ? (
          /* The error replaces the range hint in the same slot and keeps
             its id, so the input's aria-describedby never dangles; the
             message itself names the valid range. */
          <div
            className="settings-status settings-status--error"
            id="set-job-retention-days-line"
            role="alert"
          >
            {feedback.text}
          </div>
        ) : (
          <div className="settings-status" id="set-job-retention-days-line">
            {fill(t.jobsRetDaysHint, { min: 1, max: JOB_RETENTION_MAX_DAYS })}
          </div>
        ))}
    </div>
  );
}

/* ---------- registry ---------- */

interface SectionDef {
  id: string;
  label: string;
  icon: Icon;
  Component: () => ReactNode;
}

interface CategoryDef {
  id: string;
  label: string;
  icon: Icon;
  sections: SectionDef[];
}

/** Category tree with labels resolved from the active dictionary. Section
    and category ids are locale-independent, so selection state survives a
    language switch mid-dialog. */
function buildCategories(t: Record<StringKey, string>): CategoryDef[] {
  return [
    {
      id: 'appearance',
      label: t.catAppearance,
      icon: Palette,
      sections: [
        { id: 'theme', label: t.secTheme, icon: SunMoon, Component: ThemeSection },
        { id: 'typography', label: t.secTypography, icon: Type, Component: TypographySection },
        { id: 'appearance-general', label: t.secGeneral, icon: SlidersHorizontal, Component: GeneralSection },
      ],
    },
    {
      id: 'language',
      label: t.catLanguage,
      icon: Languages,
      sections: [
        { id: 'language-general', label: t.secLanguage, icon: Languages, Component: LanguageSection },
        { id: 'date-format', label: t.secDateFormat, icon: CalendarDays, Component: DateFormatSection },
      ],
    },
    {
      id: 'conversation',
      label: t.catConversation,
      icon: MessagesSquare,
      sections: [
        { id: 'conversation-general', label: t.secGeneral, icon: MessagesSquare, Component: ChatGeneralSection },
      ],
    },
    {
      id: 'advanced',
      label: t.catAdvanced,
      icon: Settings2,
      sections: [
        { id: 'settings-data', label: t.secSettingsData, icon: Database, Component: SettingsDataSection },
        { id: 'jobs-data', label: t.secJobsData, icon: History, Component: JobsDataSection },
      ],
    },
  ];
}

/* ---------- dialog shell ---------- */

export default function SettingsDialog({
  variant = 'topbar',
  triggerLabel,
}: {
  /** 'topbar' = the classic gear icon button; 'sidebar' = a footer row
      inside the sidebar (the 2026-10-11 redesign moved the settings
      entry point there). */
  variant?: 'topbar' | 'sidebar';
  /** Row label for the sidebar variant (falls back to t.settings). */
  triggerLabel?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState('appearance');
  const [sectionId, setSectionId] = useState('theme');
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const t = useStrings();
  const CATEGORIES = buildCategories(t);

  useDialogA11y(open, () => setOpen(false), panelRef);

  /* Section switches announce themselves (critique P2·4): the pane is a
     labelled region, and navigating moves focus into it so a screen
     reader reads the new section instead of swapping content silently.
     The first run is skipped — useDialogA11y focuses the dialog itself
     on open. */
  const firstSectionRender = useRef(true);
  useEffect(() => {
    if (firstSectionRender.current) {
      firstSectionRender.current = false;
      return;
    }
    const pane = contentRef.current;
    if (!pane) return; // dialog closed: the pane is unmounted
    pane.scrollTop = 0; // a new section starts at the top
    pane.focus();
  }, [sectionId]);

  const cat = CATEGORIES.find((c) => c.id === catId) ?? CATEGORIES[0];
  const section = cat.sections.find((s) => s.id === sectionId) ?? cat.sections[0];
  const SectionComp = section.Component;

  return (
    <>
      {variant === 'topbar' ? (
        <button
          className="icon-btn-top"
          onClick={() => setOpen(true)}
          aria-label={t.settings}
          title={t.settings}
          aria-haspopup="dialog"
        >
          <Settings size={18} />
        </button>
      ) : (
        <button
          className="sb-row sb-row--footer"
          onClick={() => setOpen(true)}
          data-tip={triggerLabel ?? t.settings}
          aria-haspopup="dialog"
        >
          <Settings size={20} className="sb-icon" />
          <span className="sb-label">{triggerLabel ?? t.settings}</span>
        </button>
      )}

      {open &&
        createPortal(
          <div
            className="settings-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              className="settings-window"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={t.settings}
              tabIndex={-1}
            >
              <nav className="settings-nav" aria-label={t.catNav}>
                {CATEGORIES.map((c) => {
                  const expanded = c.id === catId;
                  const CatIcon = c.icon;
                  return (
                    <div className="settings-nav-group" key={c.id}>
                      <button
                        className="settings-nav-cat"
                        aria-expanded={expanded}
                        onClick={() => {
                          // Single-open accordion: the expanded category stays
                          // open (collapsing it would leave no active section).
                          if (expanded) return;
                          setCatId(c.id);
                          setSectionId(c.sections[0].id);
                        }}
                      >
                        <CatIcon size={16} className="settings-nav-icon" />
                        <span className="settings-nav-label">{c.label}</span>
                        <ChevronRight
                          size={14}
                          className={`settings-nav-chevron${expanded ? ' open' : ''}`}
                        />
                      </button>
                      {expanded &&
                        c.sections.map((s) => {
                          const SecIcon = s.icon;
                          const active = s.id === sectionId;
                          return (
                            <button
                              key={s.id}
                              className={`settings-nav-item${active ? ' active' : ''}`}
                              aria-current={active ? 'true' : undefined}
                              onClick={() => setSectionId(s.id)}
                            >
                              <SecIcon size={14} className="settings-nav-icon" />
                              <span className="settings-nav-label">{s.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </nav>

              <div
                className="settings-content"
                ref={contentRef}
                role="region"
                aria-labelledby="settings-pane-heading"
                tabIndex={-1}
              >
                {/* The pane heading is screen-reader-only — the visible
                    title lives in the breadcrumb — and names the region
                    plus gives the pane(h2) → rows(h3) outline its h2. */}
                <h2 id="settings-pane-heading" className="visually-hidden">
                  {section.label}
                </h2>
                <nav className="settings-breadcrumb" aria-label={t.crumbNav}>
                  <span>{t.settings}</span>
                  <ChevronRight size={14} />
                  <span>{cat.label}</span>
                  <ChevronRight size={14} />
                  <span className="settings-breadcrumb-current" aria-current="page">
                    {section.label}
                  </span>
                </nav>
                <SectionComp />
              </div>

              {/* Close is the last DOM/tab stop (critique P2·5): nav →
                  settings → close. Absolute positioning keeps it
                  visually top-right. */}
              <button
                className="settings-close"
                onClick={() => setOpen(false)}
                aria-label={t.closeSettings}
              >
                <X size={18} />
              </button>
            </div>
          </div>,
          // Portal to <body>: the topbar's backdrop-filter makes it the
          // containing block for position:fixed descendants, which squashed
          // the inset:0 overlay into the topbar band (bug 2026-09-29).
          document.body,
        )}
    </>
  );
}
