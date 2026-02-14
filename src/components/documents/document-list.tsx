'use client';

/**
 * Document list component with download and delete actions.
 * Uses optimistic UI for instant delete feedback.
 */

import { useOptimistic, useState } from 'react';
import { getDownloadUrl, deleteDocument } from '@/app/(owner)/actions/documents';

interface Document {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

interface DocumentListProps {
  documents: Document[];
  onDocumentDeleted: () => void;
}

type OptimisticDocument = Document & { pending?: boolean };

export function DocumentList({ documents, onDocumentDeleted }: DocumentListProps) {
  const [optimisticDocuments, setOptimisticDocuments] = useOptimistic<
    OptimisticDocument[],
    string
  >(documents, (state, deletedId) => state.filter((doc) => doc.id !== deletedId));

  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDownload = async (docId: string, fileName: string) => {
    setDownloading(docId);
    try {
      const result = await getDownloadUrl(docId);

      if ('error' in result) {
        alert(`Download failed: ${result.error}`);
        return;
      }

      // Open download URL in new tab
      window.open(result.downloadUrl, '_blank');
    } catch (error) {
      alert(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (docId: string, fileName: string) => {
    // Confirmation prompt
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setDeleting(docId);

    // Optimistic update: remove from list immediately
    setOptimisticDocuments(docId);

    try {
      const result = await deleteDocument(docId);

      if ('error' in result) {
        alert(`Delete failed: ${result.error}`);
        // Don't call onDocumentDeleted - let the list revert optimistic change
        return;
      }

      // Success - notify parent to refresh
      onDocumentDeleted();
    } catch (error) {
      alert(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileTypeBadge = (contentType: string): string => {
    if (contentType === 'application/pdf') return 'PDF';
    if (contentType === 'image/jpeg') return 'JPEG';
    if (contentType === 'image/png') return 'PNG';
    return 'FILE';
  };

  const getFileTypeBadgeColor = (contentType: string): string => {
    if (contentType === 'application/pdf') return 'bg-red-100 text-red-800';
    if (contentType.startsWith('image/')) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (optimisticDocuments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-2 text-sm text-gray-500">No documents uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-200">
        {optimisticDocuments.map((doc) => {
          const isPending = doc.pending;
          const isDownloading = downloading === doc.id;
          const isDeleting = deleting === doc.id;

          return (
            <li
              key={doc.id}
              className={`p-4 ${isPending ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${getFileTypeBadgeColor(doc.contentType)}`}
                    >
                      {getFileTypeBadge(doc.contentType)}
                    </span>
                    <p className="truncate text-sm font-medium text-gray-900">
                      {doc.fileName}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                    <span>{formatFileSize(doc.sizeBytes)}</span>
                    <span>•</span>
                    <span>{formatDate(doc.createdAt)}</span>
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    disabled={isDownloading || isPending}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? 'Downloading...' : 'Download'}
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id, doc.fileName)}
                    disabled={isDeleting || isPending}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
