import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X } from 'lucide-react';
import { useStrings } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';

/* Sidebar footer help (2026-10-11 sidebar redesign): a tiny modal
   listing the shell's keyboard shortcuts and the build version. The
   trigger renders as a sidebar row — icon + label expanded, icon-only
   on the collapsed rail (label stays in the DOM for screen readers).
   A11y mirrors SettingsDialog: useDialogA11y traps focus, Esc closes,
   focus restores to the trigger. */
export default function HelpDialog({ triggerLabel }: { triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useStrings();

  useDialogA11y(open, () => setOpen(false), panelRef);

  return (
    <>
      <button
        className="sb-row sb-row--footer"
        onClick={() => setOpen(true)}
        data-tip={triggerLabel}
        aria-haspopup="dialog"
      >
        <CircleHelp size={20} className="sb-icon" />
        <span className="sb-label">{triggerLabel}</span>
      </button>

      {open && createPortal(
        <div
          className="help-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="help-window"
            role="dialog"
            aria-modal="true"
            aria-label={t.sbHelpTitle}
            tabIndex={-1}
            ref={panelRef}
          >
            <div className="help-head">
              <h2>{t.sbHelpTitle}</h2>
              <button
                className="help-close"
                onClick={() => setOpen(false)}
                aria-label={t.sbHelpClose}
              >
                <X size={16} />
              </button>
            </div>
            <ul className="help-list">
              <li><kbd>↑</kbd><kbd>↓</kbd><span>{t.sbHelpKeysNav}</span></li>
              <li><kbd>Enter</kbd><span>{t.sbHelpKeysOpen}</span></li>
              <li><kbd>Esc</kbd><span>{t.sbHelpKeysClose}</span></li>
            </ul>
            <p className="help-version">{t.sbHelpVersion} 2.0.0</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
