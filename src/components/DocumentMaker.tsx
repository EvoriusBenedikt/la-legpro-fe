import { useState, useRef } from 'react';
import { FileText, RefreshCw, UploadCloud } from 'lucide-react';

import ComplianceResultsViewer from './ComplianceResultsViewer';
import type { ComplianceResult, ComplianceSummary } from './ComplianceResultsViewer';

import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export default function DocumentMaker() {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ComplianceResult[] | null>(null);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [useOCR, setUseOCR] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResults(null);
    setSummary(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('use_ocr', useOCR.toString());

    try {
      const response = await fetch(API_BASE + '/api/check-compliance', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Gagal memproses dokumen.');
      }

      const data = await response.json();
      setResults(data.report);
      if (data.summary) setSummary(data.summary);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReport = async () => {
    if (!results || !file || !summary) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const response = await fetch(API_BASE + '/api/compliance-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: file.name,
          company_name: summary.pihak_pertama && summary.pihak_kedua ? `${summary.pihak_pertama} & ${summary.pihak_kedua}` : summary.pihak_pertama || summary.pihak_kedua || null,
          expiration_date: (summary as any).tanggal_berakhir || null,
          results: { summary, results }
        })
      });

      if (!response.ok) throw new Error('Gagal menyimpan hasil analisis');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan hasil analisis.');
    } finally {
      setIsSaving(false);
    }
  };



  return (
    <div className="view-container">
      <div className="view-header">
        <h2>Compliance Checker</h2>
        <p>Cross-check klausul dokumen PKS dengan Database Regulasi OJK secara otomatis.</p>
      </div>

      <div className="checker-content">
        {!results && !loading && (
          <div className="upload-section">
            <div className="upload-box" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={48} className="upload-icon-main" />
              <h3>Upload Dokumen PKS</h3>
              <p>Format PDF, Word, Excel, PPT, JPG, PNG & TXT didukung.</p>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf,.docx,.xlsx,.pptx,image/jpeg,image/png,text/plain" 
                style={{ display: 'none' }} 
              />
              
              {file && (
                <div className="selected-file">
                  <FileText size={16} />
                  <span>{file.name}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setUseOCR(!useOCR)}>
              <input 
                type="checkbox" 
                checked={useOCR} 
                onChange={() => {}} 
                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#f59e0b' }} 
              />
              <span style={{ fontSize: '0.85rem', color: useOCR ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: useOCR ? 600 : 400 }}>Gunakan OCR Tradisional (Sesuai FR-2)</span>
            </div>

            <button 
              className="analyze-btn-large" 
              onClick={handleUpload} 
              disabled={!file}
            >
              <RefreshCw size={18} />
              Analisis Kepatuhan
            </button>

            {error && <div className="error-message">{error}</div>}
          </div>
        )}

        {loading && (
          <div className="deep-loading" style={{ flex: 1, marginTop: '10vh' }}>
            <div className="deep-loading-icon">
              <RefreshCw size={36} className="animate-spin-slow" />
            </div>
            <h4>Menganalisis Dokumen...</h4>
            <p>Pipeline 4-tahap sedang berjalan:<br/>
              <strong>Pass 0</strong>: Ekstraksi teks &amp; pemahaman kontrak →{' '}
              <strong>Pass 1</strong>: Identifikasi klausul →{' '}
              <strong>Pass 2</strong>: RAG + validasi relevansi →{' '}
              <strong>Pass 3</strong>: Audit kepatuhan mendalam.<br/>
              Proses ini membutuhkan waktu 2-4 menit.
            </p>
            <div className="deep-loading-bar"><div className="deep-loading-bar-inner"></div></div>
          </div>
        )}

        {results && (
          <ComplianceResultsViewer
            filename={file?.name}
            summary={summary}
            results={results}
            headerActions={
              <>
                <button className="reset-btn" onClick={handleSaveReport} disabled={isSaving || saveSuccess} style={saveSuccess ? { background: '#10b981', color: 'white' } : { background: 'var(--accent-color)', color: 'white' }}>
                  {isSaving ? 'Menyimpan...' : saveSuccess ? 'Tersimpan ✓' : 'Simpan Hasil Analisis'}
                </button>
                <button className="reset-btn" onClick={() => { setResults(null); setSummary(null); setFile(null); }}>
                  Analisis Ulang
                </button>
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
