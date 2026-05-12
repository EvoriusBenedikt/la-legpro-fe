import { AlertCircle, CheckCircle, AlertTriangle, XCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';

// Shared interfaces
export interface SupportingRegulation {
  jenis: string;
  nomor: string;
  sektor: string;
  teks: string;
}

export interface ComplianceResult {
  pasal: string;
  isi_pasal: string;
  status: string;
  penjelasan: string;
  pasal_regulasi_terkait?: string;
  rekomendasi: string;
  ai_analysis?: string;
  supporting_regulations: SupportingRegulation[];
}

export interface ComplianceSummary {
  jenis_dokumen: string;
  sektor_bisnis: string;
  pihak_pertama: string;
  pihak_kedua: string;
  pokok_perjanjian: string;
  tanggal_berakhir?: string | null;
  skor_kepatuhan: number;
  sesuai: number;
  beresiko: number;
  fatal: number;
}

interface ComplianceResultsViewerProps {
  filename?: string;
  summary: ComplianceSummary | null;
  results: ComplianceResult[] | null;
  headerActions?: React.ReactNode;
}

export default function ComplianceResultsViewer({ filename, summary, results, headerActions }: ComplianceResultsViewerProps) {
  if (!results) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SESUAI': return <CheckCircle size={20} className="text-emerald-500" />;
      case 'BERESIKO': return <AlertTriangle size={20} className="text-orange-500" />;
      case 'FATAL': return <XCircle size={20} className="text-red-500" />;
      default: return <AlertCircle size={20} className="text-slate-400" />;
    }
  };

  const getStatusChipClass = (status: string) => {
    switch (status) {
      case 'SESUAI': return 'status-chip--unchanged';
      case 'BERESIKO': return 'status-chip--changed';
      case 'FATAL': return 'status-chip--fatal'; 
      default: return 'status-chip--new';
    }
  };

  return (
    <div className="results-section">
      <div className="results-header">
        <h3>Hasil Analisis: {filename || 'Dokumen'}</h3>
        {headerActions && (
          <div style={{ display: 'flex', gap: '12px' }}>
            {headerActions}
          </div>
        )}
      </div>

      {/* ── Summary Dashboard ── */}
      {summary && (
        <div className="compliance-summary-card">
          <div className="compliance-score-ring" style={{
            background: `conic-gradient(
              ${summary.skor_kepatuhan >= 70 ? '#10b981' : summary.skor_kepatuhan >= 40 ? '#f59e0b' : '#ef4444'} 
              ${summary.skor_kepatuhan * 3.6}deg, rgba(255,255,255,0.05) 0deg)`
          }}>
            <div className="compliance-score-inner">
              <span className="compliance-score-number">{summary.skor_kepatuhan}%</span>
              <span className="compliance-score-label">Kepatuhan</span>
            </div>
          </div>
          <div className="compliance-summary-info">
            <div className="compliance-summary-meta">
              <span className="summary-tag">{summary.jenis_dokumen}</span>
              <span className="summary-tag">{summary.sektor_bisnis}</span>
              <span className="summary-tag" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                Kadaluarsa: {summary.tanggal_berakhir ? new Date(summary.tanggal_berakhir).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Tidak terdeteksi'}
              </span>
            </div>
            <p className="compliance-summary-parties" style={{ fontSize: '1.1rem', marginTop: '8px' }}>
              <strong>{summary.pihak_pertama}</strong> <span style={{ color: '#64748b', margin: '0 6px' }}>&harr;</span> <strong>{summary.pihak_kedua}</strong>
            </p>
            <p className="compliance-summary-subject" style={{ fontSize: '0.95rem', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', width: '4px', height: '4px', borderRadius: '50%', background: '#64748b' }}></span>
              {summary.pokok_perjanjian}
            </p>
            <div className="compliance-tally">
              <span className="tally-sesuai">✓ {summary.sesuai} Sesuai</span>
              <span className="tally-beresiko">⚠ {summary.beresiko} Beresiko</span>
              <span className="tally-fatal">✕ {summary.fatal} Fatal</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="compliance-table-wrap">
        <table className="compliance-table">
          <thead>
            <tr>
              <th>Pasal</th>
              <th>Analisis</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item, idx) => (
              <tr key={idx}>
                <td style={{ verticalAlign: 'top', width: '50%' }}>
                  <div className="compliance-pasal-cell">
                    <strong>{item.pasal}</strong>
                    <p>{item.isi_pasal}</p>
                    
                    {item.supporting_regulations && item.supporting_regulations.length > 0 && (
                      <div className="mt-6 flex flex-col gap-2">
                        <div className="text-sm font-semibold text-slate-400 mb-2">Sumber Dokumen Yang Ditemukan:</div>
                        {item.supporting_regulations.map((reg, rIdx) => (
                          <SupportingRegulationAccordion key={rIdx} reg={reg} />
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ verticalAlign: 'top', width: '50%' }}>
                  <span className={['status-chip', getStatusChipClass(item.status)].join(' ')}
                        style={item.status === 'FATAL' ? { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' } : {}}>
                    {getStatusIcon(item.status)} {item.status}
                  </span>

                  {item.pasal_regulasi_terkait && (
                    <div className="regulation-citation mt-2">
                      <span className="citation-badge">📌 {item.pasal_regulasi_terkait}</span>
                    </div>
                  )}

                  <p className="compliance-analysis-text mt-3">{item.penjelasan}</p>
                  
                  {item.rekomendasi && item.rekomendasi !== "-" && (
                    <p className="compliance-recommendation mt-3"><strong>Saran:</strong> {item.rekomendasi}</p>
                  )}
                  
                  {(item.status === 'BERESIKO' || item.status === 'FATAL') && item.ai_analysis && (
                    <div className="mt-3">
                      <strong className="text-slate-200 mb-1 flex items-center gap-1" style={{ fontSize: '0.85rem' }}>
                        <AlertCircle size={14} className="text-slate-300" /> AI Analysis (Dampak Bisnis)
                      </strong>
                      <p className="compliance-recommendation mt-1 text-slate-300" style={{ color: '#cbd5e1' }}>
                        {item.ai_analysis}
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SupportingRegulationAccordion({ reg }: { reg: SupportingRegulation }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`source-item ${isOpen ? 'open' : ''}`}>
      <button className="source-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="source-title">
          <span className="source-tag">{reg.sektor}</span>
          {reg.jenis} {reg.nomor}
        </div>
        <ChevronDown size={16} className="source-icon" />
      </button>
      <div className="source-content whitespace-pre-line">
        {reg.teks}
      </div>
    </div>
  );
}
