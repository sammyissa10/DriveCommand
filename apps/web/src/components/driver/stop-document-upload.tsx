'use client';

/**
 * Per-stop document upload component for the driver portal.
 * Supports BOL, POD, Weight Ticket, Fuel Receipt, and Other document types.
 * Works on both active and completed stops — does not change stop status.
 */

import { useState, useRef } from 'react';
import { FileText, Upload, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  bol: 'BOL',
  pod: 'POD',
  weight_ticket: 'Weight Ticket',
  fuel_receipt: 'Fuel Receipt',
  other: 'Other',
};

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'bol', label: 'Bill of Lading (BOL)' },
  { value: 'pod', label: 'Proof of Delivery (POD)' },
  { value: 'weight_ticket', label: 'Weight Ticket' },
  { value: 'fuel_receipt', label: 'Fuel Receipt' },
  { value: 'other', label: 'Other' },
];

interface DocItem {
  id: string;
  documentType: string;
  filename: string;
  createdAt: string | Date;
}

interface StopDocumentUploadProps {
  stopId: string;
  existingDocs?: DocItem[];
}

function formatUploadTime(date: string | Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function StopDocumentUpload({ stopId, existingDocs = [] }: StopDocumentUploadProps) {
  const [docs, setDocs] = useState<DocItem[]>(existingDocs);
  const [showForm, setShowForm] = useState(false);
  const [docType, setDocType] = useState('bol');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setDocType('bol');
    setFile(null);
    setSuccessMsg(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleToggleForm() {
    if (showForm) {
      resetForm();
    }
    setShowForm((prev) => !prev);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Please select a file.');
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', docType);

      const res = await fetch(`/api/driver/stops/${stopId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }

      const newDoc: DocItem = await res.json();
      setDocs((prev) => [newDoc, ...prev]);
      setSuccessMsg('Document uploaded successfully.');
      resetForm();
      setShowForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-2">
      {/* Section header */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" />
          Documents {docs.length > 0 && `(${docs.length})`}
        </p>
        <button
          type="button"
          onClick={handleToggleForm}
          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <Upload className="h-3 w-3" />
          {showForm ? (
            <>
              Cancel <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Upload <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      </div>

      {/* Existing docs list */}
      {docs.length > 0 && (
        <ul className="space-y-1 mb-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="font-medium text-foreground">
                {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType.replace(/_/g, ' ')}
              </span>
              <span className="truncate max-w-[120px]">{doc.filename}</span>
              <span className="ml-auto shrink-0">{formatUploadTime(doc.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 mb-2">
          <Check className="h-3.5 w-3.5" />
          {successMsg}
        </div>
      )}

      {/* Upload form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border border-border rounded-md p-3 bg-muted/30 space-y-2.5">
          {/* Document type */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`doctype-${stopId}`}>
              Document Type
            </label>
            <select
              id={`doctype-${stopId}`}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* File input */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor={`file-${stopId}`}>
              File
            </label>
            <input
              id={`file-${stopId}`}
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-foreground file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-muted/80"
            />
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <X className="h-3.5 w-3.5" />
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={uploading || !file}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-3 w-3" />
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </form>
      )}
    </div>
  );
}
