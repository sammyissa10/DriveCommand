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

interface DocumentUploadModalProps {
  parentType: 'stop' | 'load' | 'dispatch' | 'contract';
  parentId: string;
  stopId?: string;
  documentType: 'bol' | 'pod' | 'rate_confirmation' | 'other';
  onSuccess: () => void;
  triggerLabel?: string;
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'bol', label: 'Bill of Lading (BOL)' },
  { value: 'pod', label: 'Proof of Delivery (POD)' },
  { value: 'rate_confirmation', label: 'Rate Confirmation' },
  { value: 'other', label: 'Other' },
];

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
  onSuccess,
  triggerLabel = 'Upload',
}: DocumentUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [docType, setDocType] = useState(documentType);
  const [notes, setNotes] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const isUploading = uploadProgress !== null;

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

  function handleDialogClose(nextOpen: boolean) {
    if (!nextOpen && !isUploading) {
      setOpen(false);
      clearFile();
      setNotes('');
      setDocType(documentType);
      setUploadProgress(null);
      setUploadError(null);
    } else if (nextOpen) {
      setOpen(true);
    }
  }

  function doUpload() {
    if (!selectedFile) return;
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('parent_type', parentType);
    formData.append('parent_id', parentId);
    if (stopId) formData.append('stop_id', stopId);
    formData.append('document_type', docType);
    if (notes.trim()) formData.append('notes', notes.trim());

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
        setDocType(documentType);
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

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>
        <button
          className="text-xs text-primary underline hover:text-primary/80 transition-colors"
          type="button"
        >
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
            <label className="text-sm font-medium text-foreground">Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as typeof docType)}
              disabled={isUploading}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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
              onClick={() => handleDialogClose(false)}
            >
              Cancel
            </Button>
            {uploadError ? (
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile}
                onClick={doUpload}
              >
                Retry
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || !!fileSizeError || isUploading}
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
