import { useRef, useState } from 'react';
import { FileText, Upload, UploadCloud, X } from 'lucide-react';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useStrings, msg, type Msg } from '../i18n';
import api from '../services/api';
import { apiErrorMsg } from '../apiErrors';

interface InternalRefUploadModalProps {
  /** Close the modal (close button, overlay click, Escape) */
  onClose: () => void;
  /** Current workspace (notebook) the reference is scoped to. */
  reportId: string;
  /** Parent refetches the LEFT reference list on success. */
  onUploaded: () => void;
}

/* PDF-only, matching the /api/upload-internal backend contract. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT = /\.pdf$/i;

/* B3: the LEFT "Add reference" upload. Unlike ContractUploadModal (the MIDDLE
   contract/compliance job pipeline), this POSTs a PDF directly to
   /api/upload-internal with the current workspace's report_id, so the file
   lands in this workspace's reference base — not the middle uploaded-docs list. */
export default function InternalRefUploadModal({ onClose, reportId, onUploaded }: InternalRefUploadModalProps) {
  const t = useStrings();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Msg | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(true, onClose, dialogRef);

  const acceptFile = (candidate: File) => {
    if (!ALLOWED_EXT.test(candidate.name)) {
      setErr({ key: 'nbRefUploadPdfOnly' });
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setErr({ key: 'cuErrSize', params: { mb: Math.max(1, Math.round(candidate.size / (1024 * 1024))) } });
      return;
    }
    setErr(null);
    setFile(candidate);
  };

  const clearFile = () => {
    setFile(null);
    setErr(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) acceptFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  };

  const handleSubmit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('report_id', reportId);
      await api.post('/api/upload-internal', form);
      onUploaded();   // parent refetches /api/rag-sources/list?report_id=...
      onClose();
    } catch (e) {
      setErr(apiErrorMsg(e, 'nbRefUploadError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="upload-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="internal-ref-upload-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="upload-modal-header">
          <h3 id="internal-ref-upload-modal-title">{t.nbRefUploadTitle}</h3>
          <button className="upload-modal-close" onClick={onClose} aria-label={t.cuClose}>
            <X size={18} />
          </button>
        </div>
        <p className="upload-modal-subtitle">{t.nbRefUploadSubtitle}</p>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf"
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className={`upload-box upload-box--modal${dragOver ? ' upload-box--dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <UploadCloud size={40} className="upload-icon-main" />
          <span className="upload-box-title">{t.cuBoxTitle}</span>
          <span className="upload-box-hint">{t.nbRefUploadPdfOnly}</span>
          {file && (
            <span className="selected-file">
              <FileText size={16} />
              <span>{file.name}</span>
            </span>
          )}
        </button>
        {file && (
          <div className="upload-file-clear-row">
            <button type="button" className="btn-modal-secondary upload-file-clear" onClick={clearFile} disabled={busy}>
              <X size={14} aria-hidden="true" /> {t.cuClearFile}
            </button>
          </div>
        )}
        {err && <p className="upload-file-error" role="alert">{msg(t, err)}</p>}

        <div className="upload-modal-actions">
          <button className="btn-modal-secondary" onClick={onClose} disabled={busy}>{t.cuCancel}</button>
          <button className="upload-btn" onClick={handleSubmit} disabled={!file || busy}>
            <Upload size={18} />
            {busy ? t.nbRefUploadBusy : t.nbRefUploadCta}
          </button>
        </div>
      </div>
    </div>
  );
}
