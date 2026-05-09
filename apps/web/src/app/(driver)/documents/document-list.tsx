'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ExternalLink, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow, isPast, isWithinInterval, addDays } from 'date-fns';

interface Document {
  id: string;
  documentType: string | null;
  fileName: string;
  s3Key: string;
  expiryDate: Date | null;
  createdAt: Date;
  contentType: string;
  sizeBytes: number;
}

interface DocumentListProps {
  documents: Document[];
}

function getExpiryStatus(expiryDate: Date | null): {
  label: string;
  variant: 'destructive' | 'warning' | 'success' | 'outline';
  icon: React.ReactNode;
} {
  if (!expiryDate) {
    return {
      label: 'No Expiry',
      variant: 'outline',
      icon: <CheckCircle className="h-3 w-3" />,
    };
  }

  const now = new Date();
  const expiry = new Date(expiryDate);

  if (isPast(expiry)) {
    return {
      label: 'Expired',
      variant: 'destructive',
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }

  // Expiring within 30 days
  if (isWithinInterval(expiry, { start: now, end: addDays(now, 30) })) {
    return {
      label: `Expires ${formatDistanceToNow(expiry, { addSuffix: true })}`,
      variant: 'warning',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  return {
    label: `Valid until ${expiry.toLocaleDateString()}`,
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
  };
}

function formatDocumentType(type: string | null): string {
  if (!type) return 'Document';
  // Convert SNAKE_CASE to Title Case
  return type
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents }: DocumentListProps) {
  const [viewingId, setViewingId] = useState<string | null>(null);

  const handleView = async (doc: Document) => {
    setViewingId(doc.id);
    try {
      // Fetch presigned URL from API
      const response = await fetch(`/api/documents/download-url/${doc.id}`);
      if (!response.ok) {
        throw new Error('Failed to get download URL');
      }
      const { downloadUrl } = await response.json();
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Failed to open document:', error);
      alert('Failed to open document. Please try again.');
    } finally {
      setViewingId(null);
    }
  };

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">
            No documents uploaded yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contact your dispatcher to upload compliance documents.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group documents by type
  const groupedDocs = documents.reduce(
    (acc, doc) => {
      const type = doc.documentType || 'OTHER';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(doc);
      return acc;
    },
    {} as Record<string, Document[]>
  );

  return (
    <div className="space-y-6">
      {Object.entries(groupedDocs).map(([type, docs]) => (
        <div key={type}>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {formatDocumentType(type)}
          </h3>
          <div className="space-y-3">
            {docs.map((doc) => {
              const status = getExpiryStatus(doc.expiryDate);
              const isViewing = viewingId === doc.id;

              return (
                <Card key={doc.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">
                            {doc.fileName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              status.variant === 'warning'
                                ? 'outline'
                                : status.variant === 'success'
                                  ? 'secondary'
                                  : status.variant
                            }
                            className={
                              status.variant === 'warning'
                                ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                                : status.variant === 'success'
                                  ? 'border-green-500 text-green-600 dark:text-green-400'
                                  : ''
                            }
                          >
                            <span className="flex items-center gap-1">
                              {status.icon}
                              {status.label}
                            </span>
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(doc.sizeBytes)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Uploaded {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(doc)}
                        disabled={isViewing}
                        className="shrink-0"
                      >
                        {isViewing ? (
                          'Opening...'
                        ) : (
                          <>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
