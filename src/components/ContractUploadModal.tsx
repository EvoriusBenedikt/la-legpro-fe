import { useState, useRef } from 'react';
import { FileText, Upload, UploadCloud, X } from 'lucide-react';
import { useContractUpload } from '../hooks/useContractUpload';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface ContractUploadModalProps {
  /** Close the modal (close button, overlay click, Escape) */
  onClose: () => void;
}

/* Mirrors the BE limit (PRODUCT.md: PDF/DOCX/XLSX/PPTX/images ≤ 50 MB).
   Checked on pick AND drop — the accept attribute only filters the picker,
   so a dragged 400 MB zip used to fail minutes later as a transient toast
   (critique P1, error prevention). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|docx|xlsx|pptx|jpe?g|png|txt)$/i;

/* Upload flow of the former Compliance Checker page, rendered as an
   accessible modal on top of the Contracts page. Submitting hands the file
   to the ContractUploadContext, which runs analyze → save-to-history as a
   background job (survives route changes, toasts on completion, listed in
   the page's Riwayat Analisis panel) — the modal closes immediately.
   One consistent term: "Upload Dokumen". */
export default function ContractUploadModal({ onClose }: ContractUploadModalProps) {
  const { startUpload } = useContractUpload();
  const [file, setFile] = useState<File | null>(null);
  const [useOCR, setUseOCR] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Shared dialog behavior: Escape closes, focus moves into the panel on
  // open, Tab is trapped, focus restores on unmount — the same hook the
  // system dialogs use (the panel's hidden file input is skipped by the
  // hook's visible-rect filter).
  useDialogA11y(true, onClose, dialogRef);

  const acceptFile = (candidate: File) => {
    if (!ALLOWED_EXT.test(candidate.name)) {
      setFileError('Format tidak didukung — gunakan PDF, Word, Excel, PPT, JPG, PNG, atau TXT.');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFileError(`Ukuran maksimum 50 MB — file ini ${Math.max(1, Math.round(candidate.size / (1024 * 1024)))} MB.`);
      return;
    }
    setFileError(null);
    setFile(candidate);
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
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
          <span className="upload-box-hint">Format PDF, Word, Excel, PPT, JPG, PNG & TXT didukung · maksimal 50 MB.</span>
          {file && (
            <span className="selected-file">
              <FileText size={16} />
              <span>{file.name}</span>
            </span>
          )}
        </button>
        {/* Clear control lives outside the dropzone button — a <button> cannot
            nest another <button>, and "pick another file" was the only exit. */}
        {file && (
          <div className="upload-file-clear-row">
            <button type="button" className="btn-modal-secondary upload-file-clear" onClick={clearFile}>
              <X size={14} aria-hidden="true" /> Hapus file terpilih
            </button>
          </div>
        )}
        {fileError && <p className="upload-file-error" role="alert">{fileError}</p>}

        <label className="ocr-row">
          <input
            type="checkbox"
            checked={useOCR}
            onChange={(e) => setUseOCR(e.target.checked)}
          />
          <span>Gunakan OCR Tradisional (untuk dokumen hasil pindaian)</span>
        </label>

        <div className="upload-modal-note">
          <p>
            Pipeline 4-tahap (ekstraksi teks → identifikasi klausul → validasi relevansi →
            audit kepatuhan) berjalan di latar belakang ±2–4 menit. Anda bebas berpindah
            halaman — notifikasi muncul saat selesai dan dokumen baru otomatis masuk ke daftar Kontrak.
          </p>
        </div>

        <div className="upload-modal-actions">
          <button className="btn-modal-secondary" onClick={onClose}>Batal</button>
          {/* No inline colors: .upload-btn's ink-on-accent pairing is the
              documented AA-safe face in both themes (theme-dark.css). */}
          <button
            className="upload-btn"
            onClick={handleSubmit}
            disabled={!file}
          >
            <Upload size={18} />
            Upload Dokumen
          </button>
        </div>
      </div>
    </div>
  );
}
