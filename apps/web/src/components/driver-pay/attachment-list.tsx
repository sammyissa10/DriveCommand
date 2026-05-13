'use client';

import { useState } from 'react';
import Image from 'next/image';
import { FileText, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import type { SerializedAttachment } from './attachment-uploader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  assignmentId: string;
  componentId: string;
  payStatus: string;
  attachments: SerializedAttachment[];
  onChanged: (next: SerializedAttachment[]) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateFilename(name: string, maxLen = 30): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0) {
    const extPart = name.slice(ext);
    const base = name.slice(0, maxLen - extPart.length - 1);
    return `${base}…${extPart}`;
  }
  return `${name.slice(0, maxLen - 1)}…`;
}

// ---------------------------------------------------------------------------
// AttachmentList
// ---------------------------------------------------------------------------

export function AttachmentList({
  assignmentId,
  componentId,
  payStatus,
  attachments,
  onChanged,
}: Props) {
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const isPaid = payStatus === 'PAID';

  if (attachments.length === 0) return null;

  // -------------------------------------------------------------------------
  // Fetch a download URL on demand
  // -------------------------------------------------------------------------
  async function fetchDownloadUrl(attachmentId: string): Promise<string | null> {
    if (resolvedUrls[attachmentId]) return resolvedUrls[attachmentId];
    if (loadingUrls.has(attachmentId)) return null;

    setLoadingUrls((prev) => new Set(prev).add(attachmentId));

    try {
      const res = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/components/${componentId}/attachments/${attachmentId}/download-url`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      setResolvedUrls((prev) => ({ ...prev, [attachmentId]: url }));
      return url;
    } catch {
      return null;
    } finally {
      setLoadingUrls((prev) => {
        const next = new Set(prev);
        next.delete(attachmentId);
        return next;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Click an attachment card
  // -------------------------------------------------------------------------
  async function handleCardClick(a: SerializedAttachment) {
    const url = await fetchDownloadUrl(a.id);
    if (!url) return;

    if (a.contentType?.startsWith('image/')) {
      setExpandedImageUrl(url);
    } else {
      // PDF → new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  async function handleDelete(a: SerializedAttachment) {
    if (!confirm(`Delete "${a.filename}"?`)) return;

    try {
      const res = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/components/${componentId}/attachments/${a.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      onChanged(attachments.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete attachment.');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {attachments.map((a) => {
          const isImage = a.contentType?.startsWith('image/');
          const resolvedUrl = resolvedUrls[a.id];
          const isLoading = loadingUrls.has(a.id);

          return (
            <div
              key={a.id}
              className="relative flex flex-col items-center rounded-lg border border-border bg-muted/20 p-2 w-[110px] group"
            >
              {/* Thumbnail / icon */}
              <button
                type="button"
                className="w-[80px] h-[80px] flex items-center justify-center rounded overflow-hidden bg-muted/30 hover:opacity-80 transition-opacity cursor-pointer"
                onClick={() => handleCardClick(a)}
                aria-label={`View ${a.filename}`}
              >
                {isLoading && (
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
                {!isLoading && isImage && resolvedUrl ? (
                  <Image
                    src={resolvedUrl}
                    alt={a.filename}
                    width={80}
                    height={80}
                    unoptimized
                    loading="lazy"
                    className="object-cover w-full h-full"
                  />
                ) : !isLoading && isImage && !resolvedUrl ? (
                  <span className="text-xs text-muted-foreground text-center px-1">
                    Click to view
                  </span>
                ) : (
                  !isLoading && <FileText size={36} className="text-muted-foreground" />
                )}
              </button>

              {/* Filename + size */}
              <p className="mt-1.5 text-xs text-center leading-tight text-muted-foreground w-full truncate">
                {truncateFilename(a.filename)}
              </p>
              {a.sizeBytes !== null && (
                <p className="text-xs text-center text-muted-foreground/70">
                  {formatBytes(a.sizeBytes)}
                </p>
              )}

              {/* Delete button — ≥44×44 touch target via negative margin / padding trick */}
              <button
                type="button"
                className="absolute -top-2 -right-2 w-[22px] h-[22px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-destructive/80 disabled:cursor-not-allowed disabled:opacity-30"
                style={{ minWidth: 44, minHeight: 44, margin: -11 }} // expand hit area to 44×44
                onClick={() => handleDelete(a)}
                disabled={isPaid}
                aria-label={`Delete ${a.filename}`}
                title={isPaid ? 'Paid — attachments locked' : `Delete ${a.filename}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Full-size image preview dialog */}
      <Dialog open={!!expandedImageUrl} onOpenChange={(open) => !open && setExpandedImageUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {expandedImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={expandedImageUrl}
              alt="Receipt preview"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
