'use client';

/**
 * Driver documents section combining upload and list components.
 * Manages document state and refresh after mutations.
 */

import { useState } from 'react';
import { listDriverDocuments } from '@/app/(owner)/actions/driver-documents';
import { DriverDocumentUpload } from '@/components/documents/driver-document-upload';
import { DriverDocumentList } from '@/components/documents/driver-document-list';

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

interface DriverDocumentsSectionProps {
  driverId: string;
  initialDocuments: DriverDocument[];
}

export function DriverDocumentsSection({
  driverId,
  initialDocuments,
}: DriverDocumentsSectionProps) {
  const [documents, setDocuments] = useState<DriverDocument[]>(initialDocuments);

  const refreshDocuments = async () => {
    try {
      const updated = await listDriverDocuments(driverId);
      setDocuments(updated);
    } catch (error) {
      console.error('Failed to refresh documents:', error);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-card-foreground">Driver Documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage driver compliance documents. Set expiry dates to receive renewal reminders.
        </p>
      </div>

      <div className="space-y-6">
        <DriverDocumentUpload driverId={driverId} onUploadComplete={refreshDocuments} />

        <DriverDocumentList documents={documents} onDocumentChanged={refreshDocuments} />
      </div>
    </section>
  );
}
