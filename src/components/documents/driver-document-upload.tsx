'use client';

/**
 * Driver document upload component with multipart support for large files.
 * Handles both small files (<5MB single PUT) and large files (>=5MB multipart).
 */

import { useState, useRef } from 'react';
import { requestDriverUploadUrl, completeDriverDocumentUpload } from '@/app/(owner)/actions/driver-documents';

interface DriverDocumentUploadProps {
  driverId: string;
  onUploadComplete: () => void;
}

interface ProgressState {
  percentage: number;
  currentPart: number;
  totalParts: number;
  uploadedBytes: number;
  totalBytes: number;
}

const PART_SIZE = 10 * 1024 * 1024; // 10MB per part
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

type UploadState = 'idle' | 'uploading' | 'saving' | 'cancelling';

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'DRIVER_LICENSE', label: 'Driver License' },
  { value: 'DRIVER_APPLICATION', label: 'Driver Application' },
  { value: 'GENERAL', label: 'General Document' },
];

export function DriverDocumentUpload({ driverId, onUploadComplete }: DriverDocumentUploadProps) {
  const [documentType, setDocumentType] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    percentage: 0,
    currentPart: 0,
    totalParts: 0,
    uploadedBytes: 0,
    totalBytes: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setDocumentType('');
    setExpiryDate('');
    setNotes('');
    setSelectedFile(null);
    setUploadState('idle');
    setError(null);
    setProgress({
      percentage: 0,
      currentPart: 0,
      totalParts: 0,
      uploadedBytes: 0,
      totalBytes: 0,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      return;
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('File type not allowed. Please upload a PDF, JPEG, or PNG file.');
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !documentType) {
      setError('Please select a file and document type');
      return;
    }

    setError(null);
    abortControllerRef.current = new AbortController();

    try {
      // Determine upload strategy based on file size
      if (selectedFile.size < 5 * 1024 * 1024) {
        // Small file: use single PUT
        await uploadSmallFile();
      } else {
        // Large file: use multipart
        await uploadLargeFile();
      }

      // Success - reset form and notify parent
      resetForm();
      onUploadComplete();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload cancelled');
        setUploadState('idle');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setUploadState('idle');
      }
    }
  };

  const uploadSmallFile = async () => {
    if (!selectedFile) return;

    setUploadState('uploading');

    // Step 1: Request presigned URL
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('driverId', driverId);
    formData.append('documentType', documentType);
    if (expiryDate) formData.append('expiryDate', expiryDate);
    if (notes) formData.append('notes', notes);

    const urlResult = await requestDriverUploadUrl(formData);

    if ('error' in urlResult && urlResult.error) {
      throw new Error(urlResult.error);
    }

    if (!('uploadUrl' in urlResult) || !urlResult.uploadUrl) {
      throw new Error('Invalid response from server');
    }

    // Step 2: Upload to S3
    const uploadResponse = await fetch(urlResult.uploadUrl, {
      method: 'PUT',
      body: selectedFile,
      headers: {
        'Content-Type': urlResult.contentType,
      },
      signal: abortControllerRef.current?.signal,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    // Step 3: Complete upload
    setUploadState('saving');

    const completeResult = await completeDriverDocumentUpload({
      s3Key: urlResult.s3Key,
      fileName: urlResult.fileName,
      contentType: urlResult.contentType,
      sizeBytes: urlResult.sizeBytes,
      driverId,
      documentType,
      expiryDate: expiryDate || undefined,
      notes: notes || undefined,
    });

    if ('error' in completeResult) {
      throw new Error(
        typeof completeResult.error === 'string'
          ? completeResult.error
          : 'Failed to save document metadata'
      );
    }
  };

  const uploadLargeFile = async () => {
    if (!selectedFile) return;

    setUploadState('uploading');

    const totalParts = Math.ceil(selectedFile.size / PART_SIZE);

    setProgress({
      percentage: 0,
      currentPart: 0,
      totalParts,
      uploadedBytes: 0,
      totalBytes: selectedFile.size,
    });

    // Step 1: Initiate multipart upload
    const initiateResponse = await fetch('/api/documents/multipart/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        fileSize: selectedFile.size,
        entityType: 'driver',
        entityId: driverId,
        totalParts,
      }),
      signal: abortControllerRef.current?.signal,
    });

    if (!initiateResponse.ok) {
      const error = await initiateResponse.json();
      throw new Error(error.error || 'Failed to initiate upload');
    }

    const { uploadId, s3Key } = await initiateResponse.json();

    // Step 2: Upload parts
    const parts: Array<{ PartNumber: number; ETag: string }> = [];
    let uploadedBytes = 0;

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, selectedFile.size);
      const chunk = selectedFile.slice(start, end);

      // Get presigned URL for this part with retry logic
      const partUrl = await getPartUrlWithRetry(s3Key, uploadId, partNumber, 3);

      // Upload part with progress tracking
      const etag = await uploadPartWithProgress(partUrl, chunk, partNumber, uploadedBytes);

      parts.push({ PartNumber: partNumber, ETag: etag });
      uploadedBytes += chunk.size;

      setProgress({
        percentage: Math.round((uploadedBytes / selectedFile.size) * 100),
        currentPart: partNumber,
        totalParts,
        uploadedBytes,
        totalBytes: selectedFile.size,
      });
    }

    // Step 3: Complete multipart upload
    setUploadState('saving');

    const completeResponse = await fetch('/api/documents/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        s3Key,
        uploadId,
        parts,
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        sizeBytes: selectedFile.size,
        entityType: 'driver',
        entityId: driverId,
        documentType,
        expiryDate: expiryDate || undefined,
        notes: notes || undefined,
      }),
      signal: abortControllerRef.current?.signal,
    });

    if (!completeResponse.ok) {
      const error = await completeResponse.json();
      throw new Error(error.error || 'Failed to complete upload');
    }
  };

  const getPartUrlWithRetry = async (
    s3Key: string,
    uploadId: string,
    partNumber: number,
    maxRetries: number
  ): Promise<string> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('/api/documents/multipart/part-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key, uploadId, partNumber }),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to get part URL');
        }

        const { uploadUrl } = await response.json();
        return uploadUrl;
      } catch (err) {
        if (attempt === maxRetries) throw err;
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
    throw new Error('Failed to get part URL after retries');
  };

  const uploadPartWithProgress = async (
    url: string,
    chunk: Blob,
    partNumber: number,
    uploadedBytes: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', selectedFile?.type || 'application/octet-stream');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && selectedFile) {
          const totalUploaded = uploadedBytes + event.loaded;
          const percentage = Math.round((totalUploaded / selectedFile.size) * 100);

          setProgress((prev) => ({
            ...prev,
            percentage,
            uploadedBytes: totalUploaded,
          }));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const etag = xhr.getResponseHeader('ETag');
          if (!etag) {
            reject(new Error('No ETag in response'));
            return;
          }
          // Remove quotes from ETag if present
          resolve(etag.replace(/"/g, ''));
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(new Error('Upload aborted'));

      if (abortControllerRef.current) {
        abortControllerRef.current.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      xhr.send(chunk);
    });
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      setUploadState('cancelling');
      abortControllerRef.current.abort();
    }
  };

  const isUploading = uploadState === 'uploading' || uploadState === 'saving' || uploadState === 'cancelling';
  const canUpload = selectedFile && documentType && !isUploading;

  const getProgressText = () => {
    if (uploadState === 'saving') return 'Saving...';
    if (uploadState === 'cancelling') return 'Cancelling...';
    if (progress.totalParts > 1) {
      return `Uploading... ${progress.percentage}% (Part ${progress.currentPart} of ${progress.totalParts})`;
    }
    return `Uploading... ${progress.percentage}%`;
  };

  return (
    <div className="space-y-4">
      {/* Form fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="documentType" className="block text-sm font-medium text-gray-700 mb-1">
            Document Type <span className="text-red-500">*</span>
          </label>
          <select
            id="documentType"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={isUploading}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select type...</option>
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700 mb-1">
            Expiry Date
            {documentType === 'DRIVER_LICENSE' && (
              <span className="ml-1 text-xs text-gray-500">(License documents typically have an expiry date)</span>
            )}
          </label>
          <input
            type="date"
            id="expiryDate"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={isUploading}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-xs text-gray-500">(optional, max 500 characters)</span>
          </label>
          <input
            type="text"
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            disabled={isUploading}
            placeholder="e.g., State of CA, Class A"
            maxLength={500}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* File input */}
      <div>
        <label
          htmlFor="file-upload"
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

          {selectedFile ? (
            <div className="text-center">
              <p className="mb-1 text-sm font-medium text-gray-700">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-gray-700">Click to select file</p>
              <p className="text-xs text-gray-500">PDF, JPEG, or PNG. Max 100MB.</p>
            </>
          )}
        </label>

        <input
          ref={fileInputRef}
          id="file-upload"
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          disabled={isUploading}
          className="hidden"
        />
      </div>

      {/* Progress bar */}
      {isUploading && (
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">{getProgressText()}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleUpload}
          disabled={!canUpload}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Upload Document
        </button>

        {isUploading && (
          <button
            onClick={handleCancel}
            disabled={uploadState === 'cancelling'}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
