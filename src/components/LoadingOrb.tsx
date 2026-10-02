import { ThinkingOrb, type OrbSize, type OrbState, type OrbTheme } from 'thinking-orbs';

/** App-wide indeterminate loader built on thinking-orbs (libraries.dev,
    MIT). The orb's `auto` theme reads the same `data-theme` attribute
    settings.ts maintains on <html>, so it inverts with the app; pass
    `theme="dark"` on surfaces whose background does not follow the app
    theme (e.g. the always-dark knowledge-graph wash). Reduced-motion
    users get a static frame from the library itself.

    With a `label` the wrapper is a live region (role="status"); without
    one the orb is decorative and the surrounding copy carries meaning. */
interface LoadingOrbProps {
  label?: string;
  state?: OrbState;
  size?: OrbSize;
  theme?: OrbTheme;
  /** Row layout for inline contexts (chat bubble). */
  inline?: boolean;
  /** Keep the label for screen readers only (copy rendered elsewhere). */
  hiddenLabel?: boolean;
  /** Extra root class (e.g. loading-orb--padded / --on-dark). */
  className?: string;
}

export default function LoadingOrb({
  label,
  state = 'connecting',
  size = 64,
  theme = 'auto',
  inline = false,
  hiddenLabel = false,
  className = '',
}: LoadingOrbProps) {
  const rootClass = `loading-orb${inline ? ' loading-orb--row' : ''}${className ? ` ${className}` : ''}`;
  const orb = <ThinkingOrb state={state} size={size} theme={theme} aria-hidden="true" />;
  if (!label) {
    return <div className={rootClass}>{orb}</div>;
  }
  return (
    <div className={rootClass} role="status">
      {orb}
      <span className={hiddenLabel ? 'visually-hidden' : 'loading-orb-label'}>{label}</span>
    </div>
  );
}
