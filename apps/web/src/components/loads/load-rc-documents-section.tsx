'use client';

/**
 * Rate Confirmations section for the load detail page.
 * Combines upload form and document list for uploaded RC files.
 */

import { useState, useTransition } from 'react';
import { Upload, FileText, Trash2, Eye, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { uploadLoadDocument, listLoadDocuments, deleteLoadDocument } from '@/app/(owner)/actions/load-documents';
import { getDownloadUrl } from '@/app/(owner)/actions/documents';
import { logger } from '@/lib/logger';

interface LoadDocument {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentType: string | null;
  notes: string | null;
  createdAt: Date | string;
}

interface LoadRCDocumentsSectionProps {
  loadId: string;
  initialDocuments: LoadDocument[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LoadRCDocumentsSection({ loadId, initialDocuments }: LoadRCDocumentsSectionProps) {
  const [documents, setDocuments] = useState<LoadDocument[]>(initialDocuments);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refreshDocuments = async () => {
    try {
      const updated = await listLoadDocuments(loadId);
      setDocuments(updated);
    } catch (error) {
      logger.error('Failed to refresh documents:', error);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('loadId', loadId);
      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }

      const result = await uploadLoadDocument(formData);

      if ('error' in result && result.error) {
        const errorMsg = typeof result.error === 'string'
          ? result.error
          : JSON.stringify(result.error);
        setUploadError(errorMsg);
        return;
      }

      // Reset form on success
      setSelectedFile(null);
      setNotes('');
      setUploadOpen(false);
      // Reset file input
      const fileInput = document.getElementById('rc-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      startTransition(() => {
        refreshDocuments();
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (docId: string) => {
    const win = window.open('', '_blank');
    if (!win) return;
    setViewing(docId);
    try {
      const result = await getDownloadUrl(docId);
      if ('error' in result) {
        win.close();
        alert(`Failed to open document: ${result.error}`);
      } else {
        win.location.href = result.downloadUrl;
      }
    } catch {
      win.close();
      alert('Failed to open document');
    } finally {
      setViewing(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this rate confirmation document? This cannot be undone.')) return;

    // Optimistic remove
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    setDeleting(docId);

    try {
      const result = await deleteLoadDocument(docId);
      if ('error' in result && result.error) {
        // Restore on failure
        startTransition(() => {
          refreshDocuments();
        });
        alert(`Failed to delete: ${result.error}`);
      }
    } catch {
      startTransition(() => {
        refreshDocuments();
      });
      alert('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Rate Confirmations
        </h3>
        <button
          type="button"
          onClick={() => {
            setUploadOpen((v) => !v);
            setUploadError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload RC
          {uploadOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Upload form (collapsible) */}
      {uploadOpen && (
        <form
          onSubmit={handleUpload}
          className="mb-5 rounded-lg border border-border bg-muted/30 p-4 space-y-3"
        >
          <div>
            <label
              htmlFor="rc-file-input"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              File <span className="text-destructive">*</span>
            </label>
            <input
              id="rc-file-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              required
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-card file:text-xs file:font-medium file:cursor-pointer hover:file:bg-accent transition-colors"
            />
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, or PNG — max 10 MB</p>
          </div>

          <div>
            <label
              htmlFor="rc-notes-input"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              Notes (optional)
            </label>
            <textarea
              id="rc-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Broker: XYZ Freight, load date..."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadOpen(false);
                setUploadError(null);
                setSelectedFile(null);
                setNotes('');
              }}
              className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No uploaded rate confirmations</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border bg-muted/20 p-3"
            >
              {/* File info */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.sizeBytes)} &middot;{' '}
                    {new Date(doc.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {doc.notes && (
                      <> &middot; {doc.notes}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleView(doc.id)}
                  disabled={viewing === doc.id}
                  title="View document"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[36px]"
                >
                  {viewing === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  View
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleting === doc.id}
                  title="Delete document"
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-card px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[36px]"
                >
                  {deleting === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
