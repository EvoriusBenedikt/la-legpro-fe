import { useEffect, useState } from 'react';
import { getSettings, resolveTheme, subscribeSettings } from './settings';
import type { SettingsState } from './settings';

/** Reactive resolved appearance for components that must pass explicit
    theme/motion flags to third-party libraries whose own `auto` modes
    only read OS media queries (border-beam resolves `auto` against
    prefers-color-scheme, not our data-theme; bot-avatars can't see the
    app's Reduce-motion setting at all). Also carries the botAvatar
     shape slug — likewise a value bot-avatars must be handed
     explicitly, chosen in the conversation-panel footer picker.

    Deliberately NOT useSyncExternalStore(subscribeSettings,
    getSettingsSnapshot): the snapshot is JSON of the store state, which
    does not change when the OS theme flips under the 'system' preference
    (settings.ts only re-applies side effects and notifies), so snapshot
    consumers would keep the stale theme. This hook re-reads the live
    state on every notification instead. */
export interface AppAppearance {
  /** Resolved app theme — the value settings.ts paints onto <html data-theme>. */
  theme: 'light' | 'dark';
  /** The app's own Reduce-motion setting (settings dialog). */
  reduceMotion: boolean;
  /** Stored bot-avatar shape slug (picker in the conversation-panel
      footer); BotIdentity and the picker read it through this hook. */
  botAvatar: SettingsState['botAvatar'];
  /** Stored bot-avatar body colour ('' = theme accent); BotIdentity
      reads it through this hook. */
  botAvatarColor: SettingsState['botAvatarColor'];
}

function readAppearance(): AppAppearance {
  const s = getSettings();
  return {
    theme: resolveTheme(s),
    reduceMotion: s.reduceMotion,
    botAvatar: s.botAvatar,
    botAvatarColor: s.botAvatarColor,
  };
}

export default function useAppearance(): AppAppearance {
  const [appearance, setAppearance] = useState(readAppearance);
  useEffect(() => subscribeSettings(() => setAppearance(readAppearance())), []);
  return appearance;
}
