'use client';

/**
 * Driver document list with expiry badges, download, edit, and delete actions.
 * Uses optimistic UI for instant delete feedback and inline editing for metadata.
 */

import { useOptimistic, useState } from 'react';
import { getDownloadUrl } from '@/app/(owner)/actions/documents';
import { deleteDriverDocument, updateDriverDocument } from '@/app/(owner)/actions/driver-documents';
import { ExpiryStatusBadge } from './expiry-status-badge';

interface DriverDocument {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentType: string | null;
  expiryDate: Date | string | null;
  notes: string | null;
  createdAt: Date;
}

interface DriverDocumentListProps {
  documents: DriverDocument[];
  onDocumentChanged: () => void;
}

type OptimisticDocument = DriverDocument & { pending?: boolean };

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'DRIVER_LICENSE', label: 'Driver License' },
  { value: 'DRIVER_APPLICATION', label: 'Driver Application' },
  { value: 'GENERAL', label: 'General Document' },
];

export function DriverDocumentList({ documents, onDocumentChanged }: DriverDocumentListProps) {
  const [optimisticDocuments, setOptimisticDocuments] = useOptimistic<
    OptimisticDocument[],
    string
  >(documents, (state, deletedId) => state.filter((doc) => doc.id !== deletedId));

  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    documentType: string;
    expiryDate: string;
    notes: string;
  }>({ documentType: '', expiryDate: '', notes: '' });

  const handleDownload = async (docId: string, fileName: string) => {
    setDownloading(docId);
    try {
      const result = await getDownloadUrl(docId);

      if ('error' in result) {
        alert(`Download failed: ${result.error}`);
        return;
      }

      window.open(result.downloadUrl, '_blank');
    } catch (error) {
      alert(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (docId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setDeleting(docId);
    setOptimisticDocuments(docId);

    try {
      const result = await deleteDriverDocument(docId);

      if ('error' in result) {
        alert(`Delete failed: ${result.error}`);
        return;
      }

      onDocumentChanged();
    } catch (error) {
      alert(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (doc: DriverDocument) => {
    setEditing(doc.id);
    setEditFormData({
      documentType: doc.documentType || '',
      expiryDate: doc.expiryDate
        ? new Date(doc.expiryDate).toISOString().split('T')[0]
        : '',
      notes: doc.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditFormData({ documentType: '', expiryDate: '', notes: '' });
  };

  const handleEditSave = async (docId: string) => {
    try {
      const result = await updateDriverDocument(docId, {
        documentType: editFormData.documentType || undefined,
        expiryDate: editFormData.expiryDate || undefined,
        notes: editFormData.notes || undefined,
      });

      if ('error' in result) {
        alert(`Update failed: ${result.error}`);
        return;
      }

      setEditing(null);
      setEditFormData({ documentType: '', expiryDate: '', notes: '' });
      onDocumentChanged();
    } catch (error) {
      alert(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  const getDocumentTypeBadge = (docType: string | null): { label: string; color: string } => {
    if (!docType) return { label: 'General', color: 'bg-gray-100 text-gray-800' };

    switch (docType) {
      case 'DRIVER_LICENSE':
        return { label: 'Driver License', color: 'bg-blue-100 text-blue-800' };
      case 'DRIVER_APPLICATION':
        return { label: 'Driver Application', color: 'bg-purple-100 text-purple-800' };
      case 'GENERAL':
      default:
        return { label: 'General', color: 'bg-gray-100 text-gray-800' };
    }
  };

  const getDocumentTypeLabel = (value: string): string => {
    const option = DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === value);
    return option ? option.label : value;
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
        <p className="mt-2 text-sm text-gray-500">No driver documents uploaded yet.</p>
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
          const isEditing = editing === doc.id;
          const docTypeBadge = getDocumentTypeBadge(doc.documentType);

          if (isEditing) {
            // Inline edit form
            return (
              <li key={doc.id} className="p-4 bg-blue-50">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${getFileTypeBadgeColor(doc.contentType)}`}
                    >
                      {getFileTypeBadge(doc.contentType)}
                    </span>
                    <p className="truncate text-sm font-medium text-gray-900">{doc.fileName}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Document Type
                      </label>
                      <select
                        value={editFormData.documentType}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, documentType: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {DOCUMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Expiry Date
                      </label>
                      <input
                        type="date"
                        value={editFormData.expiryDate}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, expiryDate: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={editFormData.notes}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, notes: e.target.value.slice(0, 500) })
                        }
                        placeholder="e.g., State of CA, Class A"
                        maxLength={500}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditSave(doc.id)}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </li>
            );
          }

          // Regular document display
          return (
            <li key={doc.id} className={`p-4 ${isPending ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${getFileTypeBadgeColor(doc.contentType)}`}
                    >
                      {getFileTypeBadge(doc.contentType)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${docTypeBadge.color}`}
                    >
                      {docTypeBadge.label}
                    </span>
                    {doc.expiryDate && <ExpiryStatusBadge expiryDate={doc.expiryDate} />}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-gray-900">{doc.fileName}</p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                    <span>{formatFileSize(doc.sizeBytes)}</span>
                    <span>•</span>
                    <span>{formatDate(doc.createdAt)}</span>
                  </div>
                  {doc.notes && (
                    <p className="mt-1 text-xs text-gray-600 italic">{doc.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(doc)}
                    disabled={isPending}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
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
