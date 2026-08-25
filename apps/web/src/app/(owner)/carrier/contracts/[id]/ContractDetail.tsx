'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, X, FileText, Download, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContractForm, ContractData } from '@/components/carrier/contracts/ContractForm';
import { DocumentUploadModal } from '@/components/carrier/documents/DocumentUploadModal';
import { toast } from 'sonner';
import { isOneTimeContract, ONE_TIME_LABEL } from '@/lib/carrier/one-time-contract';
import { formatDateOnly } from '@/lib/utils/date';

interface ContractSerialized {
  id: string;
  contractNumber: string;
  contractName: string | null;
  clientId: string;
  clientName: string;
  contractType: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
  detentionFreeMinutes: number;
  detentionRatePerHour: string | null;
  tonuRate: string | null;
  layoverRatePerDay: string | null;
  paymentTermsOverride: string | null;
  autoRenew: boolean;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  notes: string | null;
  routeTemplateCount: number;
  totalLoads: number;
  totalRevenue: string | null;
}

interface LoadsSummary {
  totalLoads: number;
  totalRevenue: string | null;
  totalInvoiced: string | null;
  totalPaid: string | null;
  avgRate: string | null;
}

interface DocumentRow {
  id: string;
  documentType: string;
  documentTypeName: string | null;
  filename: string;
  fileSizeBytes: number | null;
  uploadedByName: string | null;
  uploadedAt: string;
  verified: boolean;
  notes: string | null;
  stopId: string | null;
  stopName: string | null;
  loadId: string | null;
  loadReferenceNumber: string | null;
  dispatchId: string | null;
  dispatchShortId: string | null;
}

const CONTRACT_STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  draft: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  expired: 'border-red-500 text-red-600 dark:text-red-400',
  cancelled: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

function fmt(val: string | null | undefined): string {
  if (!val) return '$0.00';
  const n = parseFloat(val);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatRateDisplay(rateType: string | null, baseRate: string | null): string {
  if (!baseRate) return '—';
  const n = parseFloat(baseRate);
  const formatted = n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (rateType) {
    case 'per_mile': return `${formatted}/mi`;
    case 'flat': return `${formatted} flat`;
    case 'hourly': return `${formatted}/hr`;
    case 'per_load': return `${formatted}/load`;
    default: return formatted;
  }
}

function formatLabel(val: string | null | undefined): string {
  if (!val) return '—';
  return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

function formatRelativeDate(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLinkedTo(doc: DocumentRow): string {
  if (doc.stopName) return `Stop: ${doc.stopName}`;
  if (doc.loadReferenceNumber) return `Load: #${doc.loadReferenceNumber}`;
  if (doc.dispatchShortId) return `Dispatch: ${doc.dispatchShortId}`;
  return '—';
}

export function ContractDetail({
  contract,
  loadsSummary,
  initialEdit = false,
}: {
  contract: ContractSerialized;
  loadsSummary: LoadsSummary | null;
  initialEdit?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  function fetchDocuments() {
    setDocumentsLoading(true);
    fetch(`/api/v1/carrier/contracts/${contract.id}/documents`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setDocuments(json.data ?? []))
      .catch(() => setDocuments([]))
      .finally(() => setDocumentsLoading(false));
  }

  useEffect(() => {
    if (isEditing) return;
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id, isEditing]);

  async function handleViewDocument(docId: string) {
    try {
      const res = await fetch(`/api/v1/carrier/documents/${docId}/signed-url`);
      if (!res.ok) throw new Error('Failed to get signed URL');
      const json = await res.json();
      window.open(json.signedUrl, '_blank');
    } catch {
      toast.error('Failed to open document');
    }
  }

  async function handleDownloadDocument(docId: string, filename: string) {
    try {
      const res = await fetch(`/api/v1/carrier/documents/${docId}/signed-url`);
      if (!res.ok) throw new Error('Failed to get signed URL');
      const json = await res.json();
      const a = document.createElement('a');
      a.href = json.signedUrl;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error('Failed to download document');
    }
  }

  const editFormData: ContractData = {
    id: contract.id,
    clientId: contract.clientId,
    contractName: contract.contractName,
    contractType: contract.contractType,
    rateType: contract.rateType,
    baseRate: contract.baseRate,
    fuelSurchargeMethod: contract.fuelSurchargeMethod,
    fuelSurchargeRate: contract.fuelSurchargeRate,
    effectiveDate: contract.effectiveDate,
    expirationDate: contract.expirationDate,
    detentionFreeMinutes: contract.detentionFreeMinutes,
    detentionRatePerHour: contract.detentionRatePerHour,
    tonuRate: contract.tonuRate,
    layoverRatePerDay: contract.layoverRatePerDay,
    paymentTermsOverride: contract.paymentTermsOverride,
    autoRenew: contract.autoRenew,
    status: contract.status,
    notes: contract.notes,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/carrier/contracts"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Contracts
          </Link>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {contract.contractName ?? contract.contractNumber}
            </h1>
            <Badge
              variant="outline"
              className={CONTRACT_STATUS_CLASSES[contract.status] ?? 'border-border text-muted-foreground'}
            >
              {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
            </Badge>
            {/* An agreement for one trip, not a standing one. Derived from the
                contract's single-day term, so a rename cannot lose it. */}
            {isOneTimeContract(contract) ? (
              <Badge variant="warning">{ONE_TIME_LABEL}</Badge>
            ) : null}
          </div>
          {contract.contractName && (
            <p className="mt-0.5 text-sm text-muted-foreground font-mono">{contract.contractNumber}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Client:{' '}
            <Link
              href={`/carrier/clients/${contract.clientId}`}
              className="text-primary hover:underline"
            >
              {contract.clientName}
            </Link>
          </p>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            Edit Contract
          </Button>
        )}
      </div>

      {/* Edit mode */}
      {isEditing ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Edit Contract</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          </div>
          <ContractForm initialData={editFormData} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Basic Info
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field
                label="Contract Type"
                value={contract.contractType ? formatLabel(contract.contractType) : null}
              />
              <Field
                label="Effective Date"
                value={contract.effectiveDate ? formatDateOnly(contract.effectiveDate) : null}
              />
              <Field
                label="Expiration Date"
                value={contract.expirationDate ? formatDateOnly(contract.expirationDate) : null}
              />
              <Field
                label="Status"
                value={contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
              />
              <Field
                label="Payment Terms"
                value={contract.paymentTermsOverride
                  ? formatLabel(contract.paymentTermsOverride)
                  : 'Client Default'}
              />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auto-Renew</p>
                <p className="text-sm text-foreground">{contract.autoRenew ? 'Yes' : 'No'}</p>
              </div>
            </div>
            {contract.notes && (
              <div className="space-y-1 pt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{contract.notes}</p>
              </div>
            )}
          </div>

          {/* Rate & Accessorials */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Rate &amp; Accessorials
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field
                label="Rate Type"
                value={contract.rateType ? formatLabel(contract.rateType) : null}
              />
              <Field
                label="Base Rate"
                value={formatRateDisplay(contract.rateType, contract.baseRate)}
              />
              <Field
                label="Fuel Surcharge Method"
                value={contract.fuelSurchargeMethod
                  ? formatLabel(contract.fuelSurchargeMethod)
                  : 'None'}
              />
              {contract.fuelSurchargeMethod && contract.fuelSurchargeMethod !== 'none' && (
                <Field
                  label="Fuel Surcharge Rate"
                  value={contract.fuelSurchargeRate ? fmt(contract.fuelSurchargeRate) : null}
                />
              )}
            </div>

            {/* Detention / TONU / Layover */}
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Detention / TONU / Layover
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field
                  label="Free Minutes"
                  value={String(contract.detentionFreeMinutes ?? 120)}
                />
                <Field
                  label="Detention Rate/hr"
                  value={contract.detentionRatePerHour ? fmt(contract.detentionRatePerHour) : null}
                />
                <Field
                  label="TONU Rate"
                  value={contract.tonuRate ? fmt(contract.tonuRate) : null}
                />
                <Field
                  label="Layover Rate/day"
                  value={contract.layoverRatePerDay ? fmt(contract.layoverRatePerDay) : null}
                />
              </div>
            </div>
          </div>

          {/* Linked Route Templates */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Linked Route Templates
            </h3>
            {contract.routeTemplateCount === 0 ? (
              <p className="text-sm text-muted-foreground">No linked route templates.</p>
            ) : (
              <p className="text-sm text-foreground">
                <span className="font-semibold">{contract.routeTemplateCount}</span> route template
                {contract.routeTemplateCount !== 1 ? 's' : ''} linked to this contract.
              </p>
            )}
          </div>

          {/* Loads Summary */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Loads Summary
            </h3>
            {loadsSummary ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Loads</p>
                  <p className="text-2xl font-bold text-foreground">{loadsSummary.totalLoads}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Revenue</p>
                  <p className="text-2xl font-bold text-foreground">{fmt(loadsSummary.totalRevenue)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Invoiced</p>
                  <p className="text-xl font-semibold text-foreground">{fmt(loadsSummary.totalInvoiced)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Paid</p>
                  <p className="text-xl font-semibold text-foreground">{fmt(loadsSummary.totalPaid)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Rate</p>
                  <p className="text-xl font-semibold text-foreground">{fmt(loadsSummary.avgRate)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No loads data available.</p>
            )}
          </div>

          {/* Documents */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Documents
              </h3>
              <DocumentUploadModal
                parentType="contract"
                parentId={contract.id}
                contractId={contract.id}
                onSuccess={fetchDocuments}
                triggerLabel="+ Upload Document"
              />
            </div>
            {documentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="flex items-center gap-3 py-4">
                <FileText className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  No documents uploaded under this contract yet.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Filename</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Linked To</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Uploaded By</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="border-border text-muted-foreground capitalize">
                              {doc.documentTypeName ?? doc.documentType.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-foreground max-w-[200px] truncate" title={doc.filename}>
                            {doc.filename}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {getLinkedTo(doc)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {doc.uploadedByName || '—'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatRelativeDate(doc.uploadedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleViewDocument(doc.id)}
                                title="View document"
                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDownloadDocument(doc.id, doc.filename)}
                                title="Download document"
                                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
