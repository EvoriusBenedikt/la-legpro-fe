import { BotAvatar } from 'bot-avatars';
import type { BotAvatarType } from 'bot-avatars';
import useAppearance from '../useAppearance';

/** The app's single AI-identity mascot, built on bot-avatars
    (libraries.dev, MIT). The shape is a user preference since the
    2026-10-01 review: the `botAvatar` setting in la_settings (default
    'droid', whitelisted against the library's `botAvatarTypes` in
    settings.ts), picked in Settings › Conversation. The body colour is
    a preference too (`botAvatarColor`, swatch row beside the shape
    picker); empty means the active theme's Chancery Blue accent —
    canvas can't read CSS custom properties, so the tokens.css
    --accent-color hexes are pinned below; keep them in sync if the
    accent ever changes.

    States (same review): 'working' while an answer is pending and
    'sleeping' after a chat-inactivity timeout are derived in Legal
    Opinion and handed in; 'default' is the idle pose.

    interactive={false}: the chat log is a reading surface and the mascot
    must not hop on clicks. The library self-gates on the OS
    prefers-reduced-motion setting and exposes role="img" with per-state
    aria-labels; the app's own Reduce-motion setting is invisible to it
    (canvas rAF ignores the CSS kill-switch), so the wrapper pauses it. */
const ACCENT_LIGHT = '#2563EB'; // tokens.css light --accent-color
const ACCENT_DARK = '#3b82f6'; // tokens.css dark-theme --accent-color

export interface BotIdentityProps {
  /** 'working' while the AI answer is pending, 'sleeping' after the
      chat-inactivity timeout (Legal Opinion derives both); 'default'
      is the idle pose. */
  state?: 'default' | 'working' | 'sleeping';
  /** Canvas box size in px. @default 20 */
  size?: number;
  /** Override the stored botAvatar setting — the avatar picker uses it
      to preview every library shape. @default the stored setting */
  shape?: BotAvatarType;
  /** Force a still canvas regardless of Reduce-motion — the picker grid
      renders 18 previews at once and keeps them calm. */
  paused?: boolean;
}

export default function BotIdentity({ state = 'default', size = 20, shape, paused }: BotIdentityProps) {
  const { theme, reduceMotion, botAvatar, botAvatarColor } = useAppearance();
  return (
    <BotAvatar
      type={shape ?? botAvatar}
      state={state}
      size={size}
      color={botAvatarColor || (theme === 'dark' ? ACCENT_DARK : ACCENT_LIGHT)}
      theme={theme}
      interactive={false}
      paused={paused ?? reduceMotion}
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}
