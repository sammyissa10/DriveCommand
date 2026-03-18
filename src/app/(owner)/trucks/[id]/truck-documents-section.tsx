'use client';

/**
 * Client wrapper for truck documents section.
 * Manages document list state with optimistic updates and server-side refresh.
 */

import { useState, useEffect } from 'react';
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
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);

  // Sync local state when server re-fetches and passes new initialDocuments after reload
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const handleRefresh = () => {
    window.location.reload();
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
