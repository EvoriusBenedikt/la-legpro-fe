/* Chat attachment UI pieces (2026-10-12). Task 5 scope: the composer's
   pending-chip row (pick → upload → process → ready/failed). Task 6 adds
   the history-side chips + lightbox to this module. Styles live in
   components.css under the .attach-chip* block (house chip grammar:
   glass-element surface, --radius-sm corners, 0.8rem text). */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, FileText, Loader2, X, AlertCircle } from 'lucide-react';
import { useStrings, fill } from '../i18n';
import { fetchAttachmentBlob } from '../services/api';
import type { AttachmentMeta } from '../services/api';

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

/* Chip size text (2026-10-12 critique, clarify): KB below 1 MB, one-decimal
   MB above — "10138 KB" made users do mental arithmetic on every PDF. */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    <div className="attach-chip-row" role="list" aria-label={t.opAttachPendingList}>
      {chips.map((c) => {
        const busy = c.status === 'uploading' || c.status === 'processing';
        const failed = c.status === 'failed';
        const failedText = failed
          ? fill(t.opAttachFailed, { e: ERROR_TEXT[c.error ?? ''] ?? t.errUnexpected })
          : '';
        return (
          <span
            key={c.key}
            role="listitem"
            className={failed ? 'attach-chip attach-chip--failed' : 'attach-chip'}
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
            {failed ? (
              /* Hardening P1-1 (2026-10-12 critique): the reason rides in the
                 chip body — the title-only explanation never reached touch
                 users, and the chip row is the failure's only surface. */
              <span className="attach-chip-status attach-chip-reason">{failedText}</span>
            ) : (
              <span className="attach-chip-size">{formatSize(c.file.size)}</span>
            )}
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

/* ── History side (Task 6) ─────────────────────────────────────────────────
   Rendered under a stored USER message's content. `metas` is the
   conversation's server list (null while loading → render nothing, so a
   conversation switch never ghost-flashes); an id missing from a LOADED
   list renders the ghost chip — its row was deleted server-side. The
   brief's {ids, meta, onOpen} sketch is refined to {ids, metas} with the
   lightbox state kept local: hoisting per-message preview state into
   LegalOpinion would buy nothing (ledger ruling, Task 6). */

function ImageChip({
  meta,
  onOpen,
}: {
  meta: AttachmentMeta;
  onOpen: (url: string, filename: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAttachmentBlob(meta.id)
      .then((blob) => {
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        urlRef.current = u;
        setUrl(u);
      })
      .catch(() => undefined);
    /* Revoke on unmount — the object URL belongs to this chip alone
       (the lightbox reuses the same URL while mounted). */
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [meta.id]);
  if (!url) {
    /* Same 64px footprint as the loaded thumb so the chip row never jumps
       when the blob lands (2026-10-12 critique, polish). */
    return (
      <span className="attach-thumb-loading" title={meta.filename}>
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="attach-thumb"
      onClick={() => onOpen(url, meta.filename)}
      title={meta.filename}
    >
      <img src={url} alt={meta.filename} />
    </button>
  );
}

function PdfChip({ meta }: { meta: AttachmentMeta }) {
  /* window.open must start synchronously inside the click gesture or the
     popup blocker eats it; the blank tab navigates once the blob lands.
     The URL is deliberately never revoked — the opened tab must keep it
     (it dies with that tab). */
  const open = () => {
    const w = window.open('', '_blank');
    fetchAttachmentBlob(meta.id)
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        if (w) w.location.href = u;
      })
      .catch(() => {
        if (w) w.close();
      });
  };
  return (
    <button
      type="button"
      className="attach-chip attach-chip--clickable"
      onClick={open}
      title={meta.filename}
    >
      <FileText size={14} className="attach-chip-icon" aria-hidden="true" />
      <span className="attach-chip-name">{truncateName(meta.filename)}</span>
    </button>
  );
}

export function ImageLightbox({
  url,
  filename,
  onClose,
}: {
  url: string;
  filename: string;
  onClose: () => void;
}) {
  const t = useStrings();
  const closeRef = useRef<HTMLButtonElement>(null);
  /* Hardening P1-2 (2026-10-12 critique): an aria-modal dialog must own
     focus — move it to the close button on mount and hand it back to the
     opening thumb on unmount, so Tab and screen readers stop working the
     page behind the veil (house pattern: AppDialog). */
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="attach-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={filename}
      onClick={onClose}
    >
      <img src={url} alt={filename} onClick={(e) => e.stopPropagation()} />
      <button
        ref={closeRef}
        type="button"
        className="attach-lightbox-x"
        onClick={onClose}
        aria-label={t.opAttachClose}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export function MessageAttachmentChips({
  ids,
  metas,
}: {
  ids: string[];
  metas: AttachmentMeta[] | null;
}) {
  const t = useStrings();
  const [lightbox, setLightbox] = useState<{ url: string; filename: string } | null>(null);
  if (!metas || ids.length === 0) return null;
  return (
    <div className="attach-chip-row attach-chip-row--msg">
      {ids.map((id) => {
        const meta = metas.find((m) => m.id === id);
        if (!meta) {
          return (
            <span key={id} className="attach-chip attach-chip--ghost" title={t.opAttachGhost}>
              <AlertCircle size={14} className="attach-chip-icon" aria-hidden="true" />
              <span className="attach-chip-name">{t.opAttachGhost}</span>
            </span>
          );
        }
        return meta.kind === 'image' ? (
          <ImageChip key={id} meta={meta} onOpen={(url, fn) => setLightbox({ url, filename: fn })} />
        ) : (
          <PdfChip key={id} meta={meta} />
        );
      })}
      {/* Portal to document.body: bubble ancestors create stacking
          contexts that would trap a fixed z-1100 overlay (house
          precedent: the portaled row menu). */}
      {lightbox &&
        createPortal(
          <ImageLightbox
            url={lightbox.url}
            filename={lightbox.filename}
            onClose={() => setLightbox(null)}
          />,
          document.body
        )}
    </div>
  );
}
