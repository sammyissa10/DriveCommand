'use client';

/**
 * Reusable file upload component for truck and route documents.
 * Handles presigned URL upload flow with client-side validation and progress feedback.
 */

import { useState } from 'react';
import { requestUploadUrl, completeUpload } from '@/app/(owner)/actions/documents';

interface DocumentUploadProps {
  entityType: 'truck' | 'route';
  entityId: string;
  onUploadComplete: () => void;
}

type ProgressState = 'idle' | 'validating' | 'uploading' | 'saving';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

export function DocumentUpload({
  entityType,
  entityId,
  onUploadComplete,
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>('idle');

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset state
    setError(null);
    setUploading(true);
    setProgress('validating');

    try {
      // Client-side pre-validation: file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        resetState();
        return;
      }

      // Client-side pre-validation: file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('File type not allowed. Please upload a PDF, JPEG, or PNG file.');
        resetState();
        return;
      }

      // Step 1: Request presigned upload URL
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);

      const urlResult = await requestUploadUrl(formData);

      if ('error' in urlResult && urlResult.error) {
        setError(urlResult.error);
        resetState();
        return;
      }

      // Type guard: ensure we have the success response
      if (!('uploadUrl' in urlResult) || !urlResult.uploadUrl) {
        setError('Invalid response from server');
        resetState();
        return;
      }

      // Extract values from success response (non-null assertions safe after type guard)
      const uploadUrl = urlResult.uploadUrl!;
      const s3Key = urlResult.s3Key!;
      const fileName = urlResult.fileName!;
      const contentType = urlResult.contentType!;
      const sizeBytes = urlResult.sizeBytes!;

      // Step 2: Upload file directly to S3
      setProgress('uploading');

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': contentType,
        },
      });

      if (!uploadResponse.ok) {
        setError(`Upload failed: ${uploadResponse.statusText}`);
        resetState();
        return;
      }

      // Step 3: Save metadata to database
      setProgress('saving');

      const completeResult = await completeUpload({
        s3Key,
        fileName,
        contentType,
        sizeBytes,
        entityType,
        entityId,
      });

      if ('error' in completeResult) {
        setError(
          typeof completeResult.error === 'string'
            ? completeResult.error
            : 'Failed to save document metadata'
        );
        resetState();
        return;
      }

      // Success! Reset state and notify parent
      resetState();
      onUploadComplete();

      // Clear the file input
      event.target.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      resetState();
    }
  };

  const resetState = () => {
    setUploading(false);
    setProgress('idle');
  };

  const getProgressText = () => {
    switch (progress) {
      case 'validating':
        return 'Validating file...';
      case 'uploading':
        return 'Uploading to storage...';
      case 'saving':
        return 'Saving metadata...';
      default:
        return '';
    }
  };

  return (
    <div className="w-full">
      <label
        htmlFor={`file-upload-${entityType}-${entityId}`}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 py-8 hover:border-blue-400 hover:bg-blue-50"
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <p className="mb-2 text-sm font-medium text-gray-700">
          {uploading ? getProgressText() : 'Click to upload file'}
        </p>

        {!uploading && (
          <p className="text-xs text-gray-500">PDF, JPEG, or PNG. Max 10MB.</p>
        )}

        {uploading && (
          <div className="mt-2 flex items-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          </div>
        )}
      </label>

      <input
        id={`file-upload-${entityType}-${entityId}`}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />

      {error && (
        <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
