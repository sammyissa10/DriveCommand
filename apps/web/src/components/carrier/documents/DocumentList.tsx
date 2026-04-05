'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string | null;
  verified: boolean;
  url: string | null;
}

interface DocumentListProps {
  parentType: 'stop' | 'load' | 'dispatch' | 'contract';
  parentId: string;
  userRole?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOC_TYPE_BADGE: Record<string, string> = {
  bol: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  pod: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  rate_confirmation: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  bol: 'BOL',
  pod: 'POD',
  rate_confirmation: 'Rate Conf.',
  other: 'Other',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DocumentSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="h-4 w-14 bg-muted animate-pulse rounded-full" />
          <div className="h-4 flex-1 bg-muted animate-pulse rounded" />
          <div className="h-4 w-12 bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentList({ parentType, parentId, userRole }: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const showActions = !userRole || userRole === 'owner' || userRole === 'dispatcher';

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ parent_type: parentType, parent_id: parentId });
      const res = await fetch(`/api/v1/carrier/documents?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to load documents');
      }
      const data = await res.json() as { documents: DocumentItem[] };
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [parentType, parentId]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/carrier/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete document');
      }
      toast.success('Document deleted');
      await fetchDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleVerify(id: string) {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/v1/carrier/documents/${id}/verify`, { method: 'PATCH' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to verify document');
      }
      toast.success('Document verified');
      await fetchDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify document');
    } finally {
      setVerifyingId(null);
    }
  }

  if (loading) return <DocumentSkeleton />;

  if (error) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No documents uploaded</p>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const badgeClass = DOC_TYPE_BADGE[doc.documentType] ?? DOC_TYPE_BADGE.other;
        const typeLabel = DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType;
        const isDeleting = deletingId === doc.id;
        const isVerifying = verifyingId === doc.id;

        return (
          <div
            key={doc.id}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
          >
            {/* Type badge */}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${badgeClass}`}
            >
              {typeLabel}
            </span>

            {/* Filename + size + uploader */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{doc.fileName}</span>
                {doc.verified && (
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-green-500 flex-shrink-0"
                    aria-label="Verified"
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{formatFileSize(doc.fileSize)}</span>
                {doc.uploadedByName && (
                  <>
                    <span>·</span>
                    <span>{doc.uploadedByName}</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {doc.url && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => window.open(doc.url!, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
              )}

              {showActions && (
                <>
                  {!doc.verified && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                      disabled={isVerifying}
                      onClick={() => void handleVerify(doc.id)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      {isVerifying ? 'Verifying…' : 'Verify'}
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {isDeleting ? 'Deleting…' : 'Delete'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Document?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{doc.fileName}</strong>. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => void handleDelete(doc.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
