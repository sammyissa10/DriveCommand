'use client';

import { useRef, useState } from 'react';
import { Upload, File, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentType {
  id: string;
  name: string;
  slug: string;
}

interface DocumentUploadModalProps {
  parentType: 'stop' | 'load' | 'dispatch' | 'contract' | 'client';
  parentId: string;
  stopId?: string;
  /** Slug hint — used to pre-select a matching type from the fetched catalog (e.g. "bol", "pod"). */
  documentType?: string;
  /** Explicit document type UUID — overrides slug-based pre-selection. */
  documentTypeId?: string;
  /** Context FK — passed to API when uploading from a load context. */
  loadId?: string;
  /** Context FK — passed to API when uploading from a dispatch context. */
  dispatchId?: string;
  /** Context FK — passed to API when uploading from a contract context. */
  contractId?: string;
  onSuccess: () => void;
  triggerLabel?: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentUploadModal({
  parentType,
  parentId,
  stopId,
  documentType,
  documentTypeId: documentTypeIdProp,
  loadId,
  dispatchId,
  contractId,
  onSuccess,
  triggerLabel = 'Upload',
}: DocumentUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [notes, setNotes] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Document types from catalog
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [docTypesLoading, setDocTypesLoading] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(documentTypeIdProp ?? '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const isUploading = uploadProgress !== null;

  // ---------------------------------------------------------------------------
  // Fetch types on dialog open (lazy)
  // ---------------------------------------------------------------------------

  async function fetchDocTypes() {
    setDocTypesLoading(true);
    try {
      const res = await fetch('/api/v1/carrier/document-types?active_only=true');
      if (!res.ok) return;
      const data = await res.json() as { data: DocumentType[] };
      const types = data.data ?? [];
      setDocTypes(types);

      // Pre-select: explicit ID first, then slug hint match
      if (documentTypeIdProp) {
        setSelectedTypeId(documentTypeIdProp);
      } else if (documentType) {
        const match = types.find((t) => t.slug === documentType);
        if (match) setSelectedTypeId(match.id);
      }
    } catch {
      // Non-fatal — user can still manually select
    } finally {
      setDocTypesLoading(false);
    }
  }

  function handleDialogOpen(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      void fetchDocTypes();
    } else if (!isUploading) {
      setOpen(false);
      clearFile();
      setNotes('');
      setSelectedTypeId(documentTypeIdProp ?? '');
      setUploadProgress(null);
      setUploadError(null);
    }
  }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  function handleFileSelect(file: File) {
    setFileSizeError(null);
    setUploadError(null);
    if (file.size > MAX_FILE_SIZE) {
      setFileSizeError('File exceeds 25MB limit');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function clearFile() {
    setSelectedFile(null);
    setFileSizeError(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------

  function doUpload() {
    if (!selectedFile || !selectedTypeId) return;
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('parent_type', parentType);
    formData.append('parent_id', parentId);
    if (stopId) formData.append('stop_id', stopId);
    formData.append('document_type_id', selectedTypeId);
    // Keep slug for backward compat
    const selectedSlug = docTypes.find((t) => t.id === selectedTypeId)?.slug ?? documentType ?? 'other';
    formData.append('document_type', selectedSlug);
    if (notes.trim()) formData.append('notes', notes.trim());
    if (loadId) formData.append('load_id', loadId);
    if (dispatchId) formData.append('dispatch_id', dispatchId);
    if (contractId) formData.append('contract_id', contractId);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success('Document uploaded successfully');
        setOpen(false);
        clearFile();
        setNotes('');
        setSelectedTypeId(documentTypeIdProp ?? '');
        onSuccess();
      } else {
        let errorMsg = 'Upload failed';
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) errorMsg = body.error;
        } catch {
          // use default message
        }
        setUploadError(errorMsg);
      }
    };

    xhr.onerror = () => {
      setUploadProgress(null);
      setUploadError('Network error — please check your connection and retry');
    };

    xhr.open('POST', '/api/v1/carrier/documents');
    xhr.send(formData);
    setUploadProgress(0);
  }

  const canUpload = !!selectedFile && !fileSizeError && !!selectedTypeId && !isUploading;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          type="button"
        >
          <Upload className="h-4 w-4" />
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }
              ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
              className="hidden"
              onChange={handleInputChange}
              disabled={isUploading}
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag file here or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, JPG, PNG, HEIC, WEBP — max 25MB
            </p>
          </div>

          {/* File size error */}
          {fileSizeError && (
            <p className="text-sm text-red-600 dark:text-red-400">{fileSizeError}</p>
          )}

          {/* Selected file preview */}
          {selectedFile && !fileSizeError && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Document type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Document Type <span className="text-red-500">*</span>
            </label>
            {docTypesLoading ? (
              <div className="h-9 w-full bg-muted animate-pulse rounded-md" />
            ) : (
              <select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                disabled={isUploading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Select document type…</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isUploading}
              rows={2}
              placeholder="Add any notes about this document…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
            />
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => handleDialogOpen(false)}
            >
              Cancel
            </Button>
            {uploadError ? (
              <Button
                type="button"
                size="sm"
                disabled={!canUpload}
                onClick={doUpload}
              >
                Retry
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!canUpload}
                onClick={doUpload}
              >
                {isUploading ? `Uploading… ${uploadProgress}%` : 'Upload'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
