import { useState, useRef, useEffect } from 'react';
import { FileText, Upload, UploadCloud, X } from 'lucide-react';
import { useContractUpload } from '../context/ContractUploadContext';

interface ContractUploadModalProps {
  /** Close the modal (close button, overlay click, Escape) */
  onClose: () => void;
}

/* Upload flow of the former Compliance Checker page, rendered as an
   accessible modal on top of the Contracts page. Submitting hands the file
   to the ContractUploadContext, which runs analyze → save-to-history as a
   background job (survives route changes, toasts on completion) — the modal
   closes immediately. One consistent term: "Upload Dokumen". */
export default function ContractUploadModal({ onClose }: ContractUploadModalProps) {
  const { startUpload } = useContractUpload();
  const [file, setFile] = useState<File | null>(null);
  const [useOCR, setUseOCR] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape to close + restore focus on unmount
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreTo?.focus?.();
    };
  }, [onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const handleSubmit = () => {
    if (!file) return;
    startUpload(file, useOCR);
    onClose();
  };

  return (
    <div
      className="upload-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-upload-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="upload-modal-header">
          <h3 id="contract-upload-modal-title">Upload Dokumen</h3>
          <button className="upload-modal-close" onClick={onClose} aria-label="Tutup dialog upload">
            <X size={18} />
          </button>
        </div>
        <p className="upload-modal-subtitle">
          Cross-check klausul dokumen PKS dengan Database Regulasi OJK secara otomatis.
        </p>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.docx,.xlsx,.pptx,image/jpeg,image/png,text/plain"
          style={{ display: 'none' }}
        />
        {/* Dropzone as a real button: click, Enter/Space, and drag & drop */}
        <button
          type="button"
          className={`upload-box upload-box--modal${dragOver ? ' upload-box--dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <UploadCloud size={40} className="upload-icon-main" />
          <span className="upload-box-title">Upload Dokumen PKS</span>
          <span className="upload-box-hint">Format PDF, Word, Excel, PPT, JPG, PNG & TXT didukung.</span>
          {file && (
            <span className="selected-file">
              <FileText size={16} />
              <span>{file.name}</span>
            </span>
          )}
        </button>

        <label className="ocr-row">
          <input
            type="checkbox"
            checked={useOCR}
            onChange={(e) => setUseOCR(e.target.checked)}
          />
          <span>Gunakan OCR Tradisional (Sesuai FR-2)</span>
        </label>

        <div className="upload-modal-note">
          <p>
            Pipeline 4-tahap (ekstraksi teks → identifikasi klausul → validasi relevansi →
            audit kepatuhan) berjalan di latar belakang ±2–4 menit. Anda bebas berpindah
            halaman — notifikasi muncul saat selesai dan dokumen baru otomatis masuk ke daftar Contracts.
          </p>
        </div>

        <div className="upload-modal-actions">
          <button className="btn-modal-secondary" onClick={onClose}>Batal</button>
          <button
            className="upload-btn"
            onClick={handleSubmit}
            disabled={!file}
            style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', fontWeight: 600 }}
          >
            <Upload size={18} />
            Upload Dokumen
          </button>
        </div>
      </div>
    </div>
  );
}
