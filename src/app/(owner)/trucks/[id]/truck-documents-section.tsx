'use client';

/**
 * Client wrapper for truck documents section.
 * Manages document list state with optimistic updates and server-side refresh.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentUploadModal } from '@/components/documents/document-upload-modal';
import { DocumentList } from '@/components/documents/document-list';

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

interface TruckDocumentsSectionProps {
  truckId: string;
  initialDocuments: Document[];
}

export function TruckDocumentsSection({
  truckId,
  initialDocuments,
}: TruckDocumentsSectionProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);

  // Sync local state when server re-fetches initialDocuments after router.refresh()
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const handleRefresh = () => {
    // Trigger server-side re-fetch using Next.js App Router pattern
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <DocumentUploadModal
        entityType="truck"
        entityId={truckId}
        onUploadComplete={handleRefresh}
      />
      <DocumentList documents={documents} onDocumentDeleted={handleRefresh} />
    </div>
  );
}
