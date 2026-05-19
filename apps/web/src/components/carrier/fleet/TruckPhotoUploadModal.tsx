'use client';

import { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
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
// Constants
// ---------------------------------------------------------------------------

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TruckPhotoUploadModalProps {
  truckId: string;
  hasExistingPhoto: boolean;
  onSuccess: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TruckPhotoUploadModal({
  truckId,
  hasExistingPhoto,
  onSuccess,
}: TruckPhotoUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Dialog open/close
  // ---------------------------------------------------------------------------

  function handleDialogOpen(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
    } else if (!uploading) {
      setOpen(false);
      clearFile();
      setUploadError(null);
    }
  }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  function handleFileSelect(file: File) {
    setFileError(null);
    setUploadError(null);
    if (!ALLOWED.includes(file.type)) {
      setFileError('Use JPEG, PNG, or WebP');
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError('Photo exceeds 5MB limit');
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
    setFileError(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ---------------------------------------------------------------------------
  // Upload: presign → PUT → PATCH
  // ---------------------------------------------------------------------------

  async function doUpload() {
    if (!selectedFile) return;
    setUploadError(null);
    setUploading(true);

    try {
      // Step 1: Get presigned upload URL
      const presignRes = await fetch(
        `/api/v1/carrier/fleet/trucks/${truckId}/photo-upload-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selectedFile.name,
            contentType: selectedFile.type,
            sizeBytes: selectedFile.size,
          }),
        }
      );
      if (!presignRes.ok) {
        const data = await presignRes.json() as { error?: string };
        setUploadError(data.error ?? 'Failed to get upload URL');
        return;
      }
      const { uploadUrl, s3Key } = await presignRes.json() as {
        uploadUrl: string;
        s3Key: string;
      };

      // Step 2: PUT file directly to S3/R2
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });
      if (!putRes.ok) {
        setUploadError('Upload failed — please try again');
        return;
      }

      // Step 3: PATCH truck with new s3Key
      const patchRes = await fetch(`/api/v1/carrier/fleet/trucks/${truckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoS3Key: s3Key }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json() as { error?: string };
        setUploadError(data.error ?? 'Failed to save photo');
        return;
      }

      // Success
      toast.success(hasExistingPhoto ? 'Photo replaced' : 'Photo uploaded');
      setOpen(false);
      clearFile();
      onSuccess();
    } catch {
      setUploadError('Network error — please check your connection and retry');
    } finally {
      setUploading(false);
    }
  }

  const canUpload = !!selectedFile && !fileError && !uploading;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Upload className="h-4 w-4 mr-1.5" />
          {hasExistingPhoto ? 'Replace Photo' : 'Upload Photo'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasExistingPhoto ? 'Replace Truck Photo' : 'Upload Truck Photo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={[
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50',
              uploading ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleInputChange}
              disabled={uploading}
            />
            <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag photo here or{' '}
              <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPEG, PNG, or WebP — max 5MB
            </p>
          </div>

          {/* File error (validation) */}
          {fileError && (
            <p className="text-sm text-red-600 dark:text-red-400">{fileError}</p>
          )}

          {/* Selected file preview row */}
          {selectedFile && !fileError && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => handleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canUpload}
              onClick={() => void doUpload()}
            >
              {uploading ? 'Uploading…' : uploadError ? 'Retry' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
