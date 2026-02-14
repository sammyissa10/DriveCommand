'use client';

/**
 * Client wrapper for truck documents section.
 * Manages document list state with optimistic updates and server-side refresh.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentUpload } from '@/components/documents/document-upload';
import { DocumentList } from '@/components/documents/document-list';

interface Document {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
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

  const handleRefresh = () => {
    // Trigger server-side re-fetch using Next.js App Router pattern
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <DocumentUpload
        entityType="truck"
        entityId={truckId}
        onUploadComplete={handleRefresh}
      />
      <DocumentList documents={documents} onDocumentDeleted={handleRefresh} />
    </div>
  );
}
