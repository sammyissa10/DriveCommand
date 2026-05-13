'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SerializedAttachment = {
  id: string;
  componentId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedBy: string;
  createdAt: string;
};

type UploadEntry = {
  id: string;
  filename: string;
  progress: number;
  error?: string;
};

type Props = {
  assignmentId: string;
  componentId: string;
  payStatus: string;
  onUploaded: (attachment: SerializedAttachment) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// AttachmentUploader
// ---------------------------------------------------------------------------

export function AttachmentUploader({ assignmentId, componentId, payStatus, onUploaded }: Props) {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPaid = payStatus === 'PAID';

  // -------------------------------------------------------------------------
  // Upload a single file through presign → PUT → confirm
  // -------------------------------------------------------------------------
  async function uploadFile(file: File) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('File type not allowed. Use JPEG, PNG, HEIC, or PDF.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('File too large — max 10MB');
      return;
    }

    const entryId = crypto.randomUUID();
    setUploads((prev) => [...prev, { id: entryId, filename: file.name, progress: 0 }]);

    function updateProgress(progress: number) {
      setUploads((prev) =>
        prev.map((u) => (u.id === entryId ? { ...u, progress } : u)),
      );
    }
    function setError(err: string) {
      setUploads((prev) =>
        prev.map((u) => (u.id === entryId ? { ...u, error: err } : u)),
      );
    }
    function removeEntry() {
      setUploads((prev) => prev.filter((u) => u.id !== entryId));
    }

    try {
      // Step 1: Presign
      const presignRes = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/components/${componentId}/attachments?action=presign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        },
      );
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({ error: 'Presign failed' }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${presignRes.status}`);
      }
      const { uploadUrl, storageKey } = (await presignRes.json()) as {
        uploadUrl: string;
        storageKey: string;
        expiresIn: number;
      };

      // Step 2: PUT to S3 via XHR for progress events
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 90); // reserve 10% for confirm
            updateProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`S3 upload failed: HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      updateProgress(92);

      // Step 3: Confirm
      const confirmRes = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/components/${componentId}/attachments?action=confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storageKey,
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        },
      );
      if (!confirmRes.ok) {
        const err = await confirmRes.json().catch(() => ({ error: 'Confirm failed' }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${confirmRes.status}`);
      }
      const { attachment } = (await confirmRes.json()) as { attachment: SerializedAttachment };

      updateProgress(100);
      removeEntry();
      onUploaded(attachment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      toast.error('Something went wrong while saving the receipt. Try again in a moment.');
    }
  }

  // -------------------------------------------------------------------------
  // Drop handler
  // -------------------------------------------------------------------------
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (isPaid) return;
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach(uploadFile);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const dropZoneClasses = [
    'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
    isPaid
      ? 'border-border opacity-50 cursor-not-allowed bg-muted/10'
      : isDragOver
        ? 'border-primary bg-primary/5 cursor-copy'
        : 'border-border cursor-pointer hover:border-primary',
  ].join(' ');

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Drop zone */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={dropZoneClasses}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isPaid) setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => {
                if (!isPaid) inputRef.current?.click();
              }}
              role="button"
              tabIndex={isPaid ? -1 : 0}
              onKeyDown={(e) => {
                if (!isPaid && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
              }}
              aria-disabled={isPaid}
            >
              <p className="text-sm text-muted-foreground">
                No receipts uploaded. Drag a photo or PDF here, or click to browse.
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/heic,application/pdf"
                className="hidden"
                onChange={handleFileChange}
                disabled={isPaid}
              />
            </div>
          </TooltipTrigger>
          {isPaid && (
            <TooltipContent>
              <p>Paid — attachments locked</p>
            </TooltipContent>
          )}
        </Tooltip>

        {/* Per-file upload progress */}
        {uploads.length > 0 && (
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li key={u.id} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate max-w-[200px]">{u.filename}</span>
                  {u.error ? (
                    <span className="text-xs text-destructive">Failed</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{u.progress}%</span>
                  )}
                </div>
                {u.error ? (
                  <p className="text-xs text-destructive">{u.error}</p>
                ) : (
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}
