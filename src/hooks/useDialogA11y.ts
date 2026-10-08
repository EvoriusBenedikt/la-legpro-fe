import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared dialog accessibility behavior for overlays (modals + drawer):
 * - Escape closes the dialog
 * - focus moves into the panel on open and is restored on close
 * - Tab / Shift+Tab are trapped inside the panel
 *
 * The panel element must carry tabIndex={-1} plus role="dialog" and
 * aria-modal="true" in markup. onClose is read through a ref so inline
 * arrow handlers do not retrigger the effect (and steal focus) per render.
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLDivElement | null>,
) {
  const closeRef = useRef(onClose);
  // Latest-ref pattern, updated post-commit (react-hooks/refs forbids ref
  // writes during render). Escape handlers read closeRef.current at event
  // time, so an effect-assigned ref is always current when it matters.
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      // Visible-rect filter: display:none elements (e.g. the upload modal's
      // hidden file input) are not focusable, and counting them would break
      // the wrap — first.focus() on a hidden node silently does nothing.
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
