import LegalOpinion from './LegalOpinion';
import PenggunaShell from './PenggunaShell';
import { useStrings } from '../i18n';
import './PenggunaOpinion.css';

/* FEAT phase-3 (2026-10-25, user request: "when I press chatbot it currently
   goes back to the old ui"): the pengguna /opinion route renders INSIDE the
   standalone PenggunaShell instead of the classic sidebar chrome — same
   treatment PenggunaContracts gave /contracts. The whole LegalOpinion keeps
   its production data flow untouched: per-account localStorage history,
   /api/chat generation with background runs + abort, attachments, source
   drawer, greeting/error bubbles and i18n. Only the shell around it changes:
   footer is skipped (footer={false}) so the app-like view owns the full
   remaining viewport height, and scoped .po-* overrides fit the view into
   the shell's flex column. Every other role's /opinion still renders the
   classic shell, unchanged. */
export default function PenggunaOpinion() {
  const t = useStrings();
  return (
    <PenggunaShell
      footer={false}
      crumbs={[{ label: t.navHome, to: '/home' }, { label: 'Legal Opinion' }]}
    >
      <main className="po-main">
        {/* Default ('global') scope: keeps the original per-account history
            keys — the pre-split shared history lives on this page only. */}
        <LegalOpinion scope="global" />
      </main>
    </PenggunaShell>
  );
}
