import { useEffect, useState, type ReactNode } from 'react';
import { BorderBeam } from 'border-beam';
import useAppearance from '../useAppearance';

/** Work-moment border beam built on border-beam (libraries.dev, MIT).
    The beam only appears while work is in flight — around the chat
    composer while an AI answer is pending and around the upload card
    while the corpus ingests — and fades out through the library's
    `active` prop when the work ends, so the resting UI stays quiet.
    Settings follow the user's playground pick (2026-09-30): rotate
    family, Large type (`md`, full-border traveling beam), `colorful`
    rainbow, default 1.96s duration.

    The library's `auto` theme reads the OS preference, so the wrapper
    passes the resolved app theme instead. Intensity runs above the
    library defaults (full strength, widened halo, brighter glow) per the
    2026-09-30 visibility review — the initial restrained 0.7 read too
    faint in place. Reduced motion: the rotate family does not self-gate
    on prefers-reduced-motion, and neither family knows the app's
    Reduce-motion setting — the wrapper forces `active=false` under
    either, because the global CSS kill-switch would otherwise leave a
    frozen beam frame on screen. */
export interface WorkBeamProps {
  /** Beam fades in while true, fades out when false. */
  active: boolean;
  children: ReactNode;
}

function useOsReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function WorkBeam({ active, children }: WorkBeamProps) {
  const { theme, reduceMotion } = useAppearance();
  const osReduced = useOsReducedMotion();
  return (
    <BorderBeam
      size="md"
      colorVariant="colorful"
      strength={1}
      glowSize={1.35}
      brightness={1.5}
      theme={theme}
      active={active && !reduceMotion && !osReduced}
    >
      {children}
    </BorderBeam>
  );
}
