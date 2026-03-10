'use client';

/**
 * Modal dialog for uploading documents with richer metadata fields.
 * Supports both file uploads (presigned S3 flow) and link-only documents.
 */

import { useState } from 'react';
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { requestUploadUrl, completeUpload } from '@/app/(owner)/actions/documents';

interface DocumentUploadModalProps {
  entityType: 'truck' | 'route';
  entityId: string;
  onUploadComplete: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export function DocumentUploadModal({
  entityType,
  entityId,
  onUploadComplete,
}: DocumentUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [documentName, setDocumentName] = useState('');
  const [description, setDescription] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');

  // Inline validation errors
  const [nameError, setNameError] = useState('');
  const [fileOrLinkError, setFileOrLinkError] = useState('');

  const resetForm = () => {
    setDocumentName('');
    setDescription('');
    setExternalUrl('');
    setFile(null);
    setExpiryDate('');
    setNameError('');
    setFileOrLinkError('');
    setError(null);
    setSubmitting(false);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      resetForm();
    }
    setOpen(value);
  };

  const validate = (): boolean => {
    let valid = true;

    if (!documentName.trim()) {
      setNameError('Document name is required');
      valid = false;
    } else {
      setNameError('');
    }

    if (!file && !externalUrl.trim()) {
      setFileOrLinkError('Either a file or a link is required');
      valid = false;
    } else {
      setFileOrLinkError('');
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      if (file) {
        // File upload flow: requestUploadUrl → S3 PUT → completeUpload
        if (file.size > MAX_FILE_SIZE) {
          setError('File size exceeds maximum of 10MB');
          setSubmitting(false);
          return;
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
          setError('File type not allowed. Please upload a PDF, JPEG, or PNG file.');
          setSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('entityType', entityType);
        formData.append('entityId', entityId);

        const urlResult = await requestUploadUrl(formData);

        if ('error' in urlResult && urlResult.error) {
          setError(
            typeof urlResult.error === 'string'
              ? urlResult.error
              : 'Failed to prepare upload'
          );
          setSubmitting(false);
          return;
        }

        if (!('uploadUrl' in urlResult) || !urlResult.uploadUrl) {
          setError('Invalid response from server');
          setSubmitting(false);
          return;
        }

        const uploadResponse = await fetch(urlResult.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': urlResult.contentType! },
        });

        if (!uploadResponse.ok) {
          setError(`Upload failed: ${uploadResponse.statusText}`);
          setSubmitting(false);
          return;
        }

        const completeResult = await completeUpload({
          s3Key: urlResult.s3Key!,
          fileName: urlResult.fileName!,
          contentType: urlResult.contentType!,
          sizeBytes: urlResult.sizeBytes!,
          entityType,
          entityId,
          description: description.trim() || undefined,
          externalUrl: externalUrl.trim() || undefined,
          expiryDate: expiryDate || undefined,
          documentName: documentName.trim(),
        });

        if ('error' in completeResult) {
          setError(
            typeof completeResult.error === 'string'
              ? completeResult.error
              : 'Failed to save document metadata'
          );
          setSubmitting(false);
          return;
        }
      } else {
        // Link-only flow: call completeUpload directly
        const completeResult = await completeUpload({
          s3Key: '',
          fileName: documentName.trim(),
          contentType: '',
          sizeBytes: 0,
          entityType,
          entityId,
          description: description.trim() || undefined,
          externalUrl: externalUrl.trim(),
          expiryDate: expiryDate || undefined,
          documentName: documentName.trim(),
        });

        if ('error' in completeResult) {
          setError(
            typeof completeResult.error === 'string'
              ? completeResult.error
              : 'Failed to save document'
          );
          setSubmitting(false);
          return;
        }
      }

      // Success — close modal and notify parent
      setOpen(false);
      resetForm();
      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Document Name */}
          <div className="space-y-1">
            <Label htmlFor="doc-name">
              Document Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="doc-name"
              type="text"
              placeholder="e.g. Insurance Certificate 2026"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              disabled={submitting}
            />
            {nameError && (
              <p className="text-red-500 text-sm">{nameError}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="doc-description">Description</Label>
            <Textarea
              id="doc-description"
              rows={3}
              placeholder="Optional notes about this document"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* External Link */}
          <div className="space-y-1">
            <Label htmlFor="doc-link">Online Link (optional)</Label>
            <Input
              id="doc-link"
              type="url"
              placeholder="https://..."
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* File Upload */}
          <div className="space-y-1">
            <Label htmlFor="doc-file">File Upload (optional)</Label>
            <Input
              id="doc-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            <p className="text-xs text-gray-500">
              Required if no link provided. Max 10MB. PDF, JPEG, PNG.
            </p>
          </div>

          {/* Expiry Date */}
          <div className="space-y-1">
            <Label htmlFor="doc-expiry">Expiry Date (optional)</Label>
            <Input
              id="doc-expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* File or link validation error */}
          {fileOrLinkError && (
            <p className="text-red-500 text-sm">{fileOrLinkError}</p>
          )}

          {/* Server error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Uploading...
                </>
              ) : (
                'Upload'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
