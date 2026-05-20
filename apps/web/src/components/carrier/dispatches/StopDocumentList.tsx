'use client';

import { useEffect, useState } from 'react';
import { Eye, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocItem {
  id: string;
  documentType: string;
  documentTypeName: string | null;
  fileName: string | null;
  fileSize: number;
  uploadedByName: string | null;
  uploadedAt: string;
  url: string | null;
  verified: boolean;
}

interface StopDocumentListProps {
  stopId: string;
  canManage: boolean;
  refreshKey?: number;
  onDeleted?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

const DOC_TYPE_BADGE: Record<string, string> = {
  bol: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  pod: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  rate_confirmation: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  invoice: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function docTypeBadgeClass(docType: string): string {
  return DOC_TYPE_BADGE[docType.toLowerCase()] ?? DOC_TYPE_BADGE.other;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopDocumentList({
  stopId,
  canManage,
  refreshKey,
  onDeleted,
}: StopDocumentListProps) {
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/v1/carrier/documents?parent_type=stop&parent_id=${stopId}`)
      .then((res) => res.json())
      .then((json: { data?: DocItem[] }) => {
        if (!cancelled) {
          setDocuments(json.data ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stopId, refreshKey]);

  async function handleView(doc: DocItem) {
    setViewingId(doc.id);
    try {
      const res = await fetch(`/api/v1/carrier/documents/${doc.id}/signed-url`);
      if (!res.ok) throw new Error('Failed to get signed URL');
      const json = (await res.json()) as { signedUrl?: string };
      if (!json.signedUrl) throw new Error('No signed URL returned');
      window.open(json.signedUrl, '_blank');
    } catch {
      toast.error('Could not open document. Please try again.');
    } finally {
      setViewingId(null);
    }
  }

  async function handleDelete(doc: DocItem) {
    const confirmed = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmed) return;

    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/v1/carrier/documents/${doc.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete document');
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success('Document deleted');
      onDeleted?.();
    } catch {
      toast.error('Could not delete document. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="h-7 w-full animate-pulse rounded bg-muted/50" />
      </div>
    );
  }

  if (documents.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 dark:bg-muted/10"
        >
          {/* Left: type badge + filename + uploader + time */}
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span
              className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${docTypeBadgeClass(doc.documentType)}`}
            >
              {doc.documentType.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground leading-tight">
                {doc.fileName ?? 'Unnamed file'}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {doc.uploadedByName ?? 'Unknown'} &middot; {relativeTime(doc.uploadedAt)}
              </p>
            </div>
          </div>

          {/* Right: View + Delete buttons */}
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={viewingId === doc.id}
              onClick={() => handleView(doc)}
              title="View document"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              {viewingId === doc.id ? '…' : 'View'}
            </Button>

            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={deletingId === doc.id}
                onClick={() => handleDelete(doc)}
                title="Delete document"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
