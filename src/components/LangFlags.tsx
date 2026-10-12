/* Inline-SVG language flags, shared by the auth language pill and the
   Settings language row (extracted from Auth.tsx 2026-10-12 so both
   surfaces draw identical flags). Emoji regional indicators are
   deliberately avoided: Windows browsers render them as letter pairs
   ("ID", "US"), which would defeat the toggle. The US flag is simplified
   — 13 stripes plus a canton of star dots; real five-point stars are
   indistinguishable at 24px. SettingsDialog's Segmented slot calls its
   icon with size={14}; these take no props and ignore it — the drawn
   size is owned by CSS (.lang-flag context rules). */

export function FlagId() {
  return (
    <svg className="lang-flag" viewBox="0 0 24 16" aria-hidden="true" focusable="false">
      <rect width="24" height="8" fill="#FF0000" />
      <rect y="8" width="24" height="8" fill="#FFFFFF" />
    </svg>
  );
}

export function FlagUs() {
  const stripe = 16 / 13;
  return (
    <svg className="lang-flag" viewBox="0 0 24 16" aria-hidden="true" focusable="false">
      <rect width="24" height="16" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={i * stripe} width="24" height={stripe} fill="#B22234" />
      ))}
      <rect width="10" height={stripe * 7} fill="#3C3B6E" />
      {[1.5, 4.5, 7.5].map((y) =>
        [1.6, 4.0, 6.4, 8.8].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.62" fill="#FFFFFF" />
        ))
      )}
    </svg>
  );
}
