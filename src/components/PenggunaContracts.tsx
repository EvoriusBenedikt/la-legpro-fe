import ContractMonitor from './ContractMonitor';
import PenggunaShell from './PenggunaShell';
import './PenggunaContracts.css';

/* FEAT phase-2 (2026-10-24): pengguna-only Contracts page inside the
   standalone PenggunaShell (topbar + footer chrome, App.tsx routes it
   outside the classic sidebar shell). The whole ContractMonitor keeps its
   data flow, upload flow, filter tabs, CSV export and result viewer —
   only the page header is re-dressed into the phase-1 visual language
   (.pcm-hero in PenggunaContracts.css; header edit in ContractMonitor.tsx),
   and surfaces are harmonized via scoped .pcm-* CSS overrides. Every other
   role's /contracts still renders the classic shell untouched. */
export default function PenggunaContracts() {
  return (
    <PenggunaShell>
      <main className="pcm-main">
        <ContractMonitor />
      </main>
    </PenggunaShell>
  );
}
