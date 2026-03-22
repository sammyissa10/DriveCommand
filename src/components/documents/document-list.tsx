'use client';

/**
 * Document list component with download and delete actions.
 * Uses optimistic UI for instant delete feedback.
 * Renders description, externalUrl, and expiryDate when present.
 */

import { useOptimistic, useState } from 'react';

interface Document {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  description?: string;
  externalUrl?: string;
  expiryDate?: Date | null;
  notes?: string;
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

  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleView = async (docId: string, fileName: string) => {
    setViewing(docId);
    try {
      const res = await fetch(`/api/documents/download-url/${docId}`);
      const result = await res.json();

      if (result.error) {
        alert(`Failed to open document: ${result.error}`);
        return;
      }

      window.open(result.downloadUrl, '_blank');
    } catch (error) {
      alert(`Failed to open document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setViewing(null);
    }
  };

  const handleDelete = async (docId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setDeleting(docId);
    setOptimisticDocuments(docId);

    try {
      const res = await fetch(`/api/documents/delete/${docId}`, { method: 'DELETE' });
      const result = await res.json();

      if (result.error) {
        alert(`Delete failed: ${result.error}`);
        return;
      }

      onDocumentDeleted();
    } catch (error) {
      alert(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '';
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

  const formatDateOnly = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFileTypeBadge = (contentType: string): string => {
    if (contentType === 'application/pdf') return 'PDF';
    if (contentType === 'image/jpeg') return 'JPEG';
    if (contentType === 'image/png') return 'PNG';
    return 'LINK';
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
          const isViewing = viewing === doc.id;
          const isDeleting = deleting === doc.id;
          // Link-only documents have empty s3Key
          const isLinkOnly = !doc.contentType || doc.contentType === '';

          return (
            <li
              key={doc.id}
              className={`p-4 ${isPending ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between">
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
                    {doc.sizeBytes > 0 && (
                      <>
                        <span>{formatFileSize(doc.sizeBytes)}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{formatDate(doc.createdAt)}</span>
                    {doc.expiryDate && (
                      <>
                        <span>•</span>
                        <span className="text-xs text-gray-500">
                          Expires: {formatDateOnly(doc.expiryDate)}
                        </span>
                      </>
                    )}
                  </div>
                  {doc.description && (
                    <p className="mt-1 text-xs text-gray-500">{doc.description}</p>
                  )}
                  {doc.externalUrl && (
                    <a
                      href={doc.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-xs text-blue-600 hover:underline"
                    >
                      View online
                    </a>
                  )}
                </div>

                <div className="ml-4 flex items-center gap-2">
                  {!isLinkOnly && (
                    <button
                      onClick={() => handleView(doc.id, doc.fileName)}
                      disabled={isViewing || isPending}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isViewing ? 'Opening...' : 'View'}
                    </button>
                  )}
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
