'use client';

import { useRouter } from 'next/navigation';
import { DocumentUploadModal } from '@/components/carrier/documents/DocumentUploadModal';

interface Doc {
  id: string;
  documentType: string;
  filename: string | null;
  uploaderName: string | null;
  createdAt: string;
}

interface Props {
  stopId: string;
  dispatchId: string;
  loadId?: string;
  documents: Doc[];
}

const DOC_TYPE_BADGE: Record<string, string> = {
  bol: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  pod: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  weight_ticket: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  fuel_receipt: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export function StopDocumentsSection({ stopId, dispatchId, loadId, documents }: Props) {
  const router = useRouter();

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Documents</h3>
          {documents.length > 0 && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {documents.length}
            </span>
          )}
        </div>
        <DocumentUploadModal
          parentType="stop"
          parentId={stopId}
          stopId={stopId}
          dispatchId={dispatchId}
          loadId={loadId}
          onSuccess={() => router.refresh()}
          triggerLabel="Upload Document"
        />
      </div>

      {documents.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No documents uploaded for this stop yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((doc) => {
            const badgeClass = DOC_TYPE_BADGE[doc.documentType] ?? DOC_TYPE_BADGE.other;
            const typeLabel = doc.documentType
              .replace('_', ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${badgeClass}`}
                >
                  {typeLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{doc.filename ?? 'Untitled'}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.uploaderName ? `Uploaded by ${doc.uploaderName}` : 'Unknown uploader'}
                    {' · '}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
