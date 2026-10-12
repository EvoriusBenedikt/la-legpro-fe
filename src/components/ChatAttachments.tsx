/* Chat attachment UI pieces (2026-10-12). Task 5 scope: the composer's
   pending-chip row (pick → upload → process → ready/failed). Task 6 adds
   the history-side chips + lightbox to this module. Styles live in
   components.css under the .attach-chip* block (house chip grammar:
   glass-element surface, --radius-sm corners, 0.8rem text). */
import { Image as ImageIcon, FileText, Loader2, X, AlertCircle } from 'lucide-react';
import { useStrings, fill } from '../i18n';

/* A composer-side attachment from pick until the server says ready/failed.
   `key` is the client identity — the brief's onRemove(id) needs a stable
   handle BEFORE the POST resolves, and the server `id` only arrives with
   the response (ledger ruling, Task 5). `convId` pins the chip to the
   conversation it uploaded against so LegalOpinion can show only the
   active conversation's chips and clear exactly those on send. */
export interface PendingAttachment {
  key: string;
  convId: string;
  id?: string;
  file: File;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  error?: string;
}

/* BE machine codes (413/415/422 detail) → compact human text for the
   opAttachFailed template; unknown codes pass through verbatim. */
const ERROR_TEXT: Record<string, string> = {
  oversize: '>10 MB',
  type: 'PNG/JPEG/WebP/PDF',
  limit: 'max 20',
};

function truncateName(name: string, max = 24): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function PendingChipRow({
  chips,
  onRemove,
}: {
  chips: PendingAttachment[];
  onRemove: (key: string) => void;
}) {
  const t = useStrings();
  if (chips.length === 0) return null;
  return (
    <div className="attach-chip-row" role="list" aria-label={t.opAttach}>
      {chips.map((c) => {
        const busy = c.status === 'uploading' || c.status === 'processing';
        const failed = c.status === 'failed';
        const failedText = failed
          ? fill(t.opAttachFailed, { e: ERROR_TEXT[c.error ?? ''] ?? c.error ?? '?' })
          : '';
        return (
          <span
            key={c.key}
            role="listitem"
            className={failed ? 'attach-chip attach-chip--failed' : 'attach-chip'}
            title={failed ? failedText : undefined}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin attach-chip-icon" aria-hidden="true" />
            ) : failed ? (
              <AlertCircle size={14} className="attach-chip-icon" aria-hidden="true" />
            ) : c.file.type.startsWith('image/') ? (
              <ImageIcon size={14} className="attach-chip-icon" aria-hidden="true" />
            ) : (
              <FileText size={14} className="attach-chip-icon" aria-hidden="true" />
            )}
            <span className="attach-chip-name">{truncateName(c.file.name)}</span>
            <span className="attach-chip-size">{Math.max(1, Math.round(c.file.size / 1024))} KB</span>
            {busy && <span className="attach-chip-status">{t.opAttachProcessing}</span>}
            <button
              type="button"
              className="attach-chip-x"
              onClick={() => onRemove(c.key)}
              aria-label={t.opAttachRemove}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
