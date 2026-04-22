'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, X, FileText, Download, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientForm, ClientData } from '@/components/carrier/clients/ClientForm';
import { ClientFinancials } from '@/components/carrier/clients/ClientFinancials';
import { DocumentUploadModal } from '@/components/carrier/documents/DocumentUploadModal';
import { toast } from 'sonner';

interface ContractRow {
  id: string;
  contractNumber: string;
  contractType: string | null;
  rateType: string | null;
  baseRate: string | null;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
}

interface LoadRow {
  id: string;
  referenceNumber: string | null;
  status: string;
  totalRevenue: string | null;
  createdAt: string;
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

interface ClientSerialized {
  id: string;
  name: string;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  taxId: string | null;
  status: string;
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  portalAccess: boolean;
  portalEmail: string | null;
  paymentTerms?: number | null;
  creditLimit?: string | null;
  notes: string | null;
  openLoadsCount: number;
  outstandingAR: string | null;
}

type Tab = 'overview' | 'contracts' | 'loads' | 'financials' | 'documents';

const STATUS_BADGE_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  blocked: 'border-red-500 text-red-600 dark:text-red-400',
};

const CONTRACT_STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  pending: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  expired: 'border-red-500 text-red-600 dark:text-red-400',
  terminated: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

const LOAD_STATUS_CLASSES: Record<string, string> = {
  pending: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  in_transit: 'border-blue-500 text-blue-600 dark:text-blue-400',
  delivered: 'border-green-500 text-green-600 dark:text-green-400',
  invoiced: 'border-purple-500 text-purple-600 dark:text-purple-400',
  cancelled: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

function formatRateDisplay(rateType: string | null, baseRate: string | null): string {
  if (!baseRate) return '—';
  const n = parseFloat(baseRate);
  const formatted = n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (rateType) {
    case 'per_mile': return `${formatted}/mi`;
    case 'flat': return `${formatted} flat`;
    case 'per_hour': return `${formatted}/hr`;
    case 'per_load': return `${formatted}/load`;
    default: return formatted;
  }
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

export function ClientDetail({
  client,
  initialEdit,
  role,
}: {
  client: ClientSerialized;
  initialEdit: boolean;
  role?: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loadsLoading, setLoadsLoading] = useState(false);
  const [loadsError, setLoadsError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [portalAccess, setPortalAccess] = useState(client.portalAccess);
  const [portalUpdating, setPortalUpdating] = useState(false);

  // Fetch contracts when tab is selected
  useEffect(() => {
    if (activeTab !== 'contracts' || contracts.length > 0) return;
    setContractsLoading(true);
    fetch(`/api/v1/carrier/contracts?client_id=${client.id}`)
      .then((r) => r.json())
      .then((json) => setContracts(json.data?.items ?? json.items ?? []))
      .catch(() => setContracts([]))
      .finally(() => setContractsLoading(false));
  }, [activeTab, client.id, contracts.length]);

  // Fetch loads when tab is selected
  useEffect(() => {
    if (activeTab !== 'loads') return;
    setLoadsLoading(true);
    setLoadsError(null);
    fetch(`/api/v1/carrier/loads?client_id=${client.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('endpoint_unavailable');
        return r.json();
      })
      .then((json) => setLoads(json.data?.items ?? json.items ?? []))
      .catch((err) => {
        if (err.message === 'endpoint_unavailable') {
          setLoadsError('placeholder');
        } else {
          setLoadsError('Failed to load loads.');
        }
      })
      .finally(() => setLoadsLoading(false));
  }, [activeTab, client.id]);

  function fetchDocuments() {
    setDocumentsLoading(true);
    setDocumentsError(null);
    fetch(`/api/v1/carrier/clients/${client.id}/documents`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch_failed');
        return r.json();
      })
      .then((json) => setDocuments(json.data ?? []))
      .catch(() => setDocumentsError('Failed to load documents.'))
      .finally(() => setDocumentsLoading(false));
  }

  // Fetch documents when tab is selected
  useEffect(() => {
    if (activeTab !== 'documents') return;
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, client.id]);

  async function handlePortalToggle(val: boolean) {
    setPortalUpdating(true);
    try {
      const res = await fetch(`/api/v1/carrier/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalAccess: val }),
      });
      if (!res.ok) throw new Error('Failed to update portal access');
      setPortalAccess(val);
      toast.success(val ? 'Portal access enabled' : 'Portal access disabled');
    } catch {
      toast.error('Failed to update portal access');
    } finally {
      setPortalUpdating(false);
    }
  }

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

  const editFormData: ClientData = {
    id: client.id,
    name: client.name,
    dbaName: client.dbaName,
    mcNumber: client.mcNumber,
    dotNumber: client.dotNumber,
    taxId: client.taxId,
    primaryContact: client.primaryContact,
    email: client.email,
    phone: client.phone,
    website: client.website,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    city: client.city,
    state: client.state,
    zip: client.zip,
    country: client.country,
    portalAccess: client.portalAccess,
    portalEmail: client.portalEmail,
    paymentTerms: client.paymentTerms ?? null,
    creditLimit: client.creditLimit ?? null,
    notes: client.notes,
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'contracts', label: 'Contracts' },
    { key: 'loads', label: 'Loads' },
    { key: 'financials', label: 'Financials' },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/carrier/clients"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Clients
          </Link>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {client.name}
            </h1>
            <Badge
              variant="outline"
              className={STATUS_BADGE_CLASSES[client.status] ?? 'border-border text-muted-foreground'}
            >
              {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
            </Badge>
          </div>
          {client.dbaName && (
            <p className="mt-1 text-sm text-muted-foreground">DBA: {client.dbaName}</p>
          )}
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            Edit Client
          </Button>
        )}
      </div>

      {/* Edit mode */}
      {isEditing ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Edit Client</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          </div>
          <ClientForm initialData={editFormData} />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b border-border">
            <nav className="-mb-px flex gap-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`whitespace-nowrap pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">Open Loads</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{client.openLoadsCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">Outstanding AR</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {client.outstandingAR
                      ? parseFloat(client.outstandingAR).toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        })
                      : '$0.00'}
                  </p>
                </div>
              </div>

              {/* Identity */}
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Identity
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="MC Number" value={client.mcNumber} />
                  <Field label="DOT Number" value={client.dotNumber} />
                  <Field label="Tax ID / EIN" value={client.taxId} />
                </div>
              </div>

              {/* Address */}
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Address
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Address" value={[client.addressLine1, client.addressLine2].filter(Boolean).join(', ')} />
                  <Field label="City" value={client.city} />
                  <Field label="State" value={client.state} />
                  <Field label="ZIP" value={client.zip} />
                  <Field label="Country" value={client.country} />
                </div>
              </div>

              {/* Contact */}
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Contact
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Primary Contact" value={client.primaryContact} />
                  <Field label="Email" value={client.email} />
                  <Field label="Phone" value={client.phone} />
                  <Field label="Website" value={client.website} />
                </div>
              </div>

              {/* Billing */}
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Billing
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field
                    label="Payment Terms"
                    value={client.paymentTerms != null ? `${client.paymentTerms} days` : '30 days'}
                  />
                  <Field
                    label="Credit Limit"
                    value={
                      client.creditLimit
                        ? parseFloat(client.creditLimit).toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          })
                        : null
                    }
                  />
                </div>
              </div>

              {/* Portal Access */}
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Portal Access
                </h3>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="portalAccessToggle"
                    checked={portalAccess}
                    disabled={portalUpdating}
                    onChange={(e) => handlePortalToggle(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <label htmlFor="portalAccessToggle" className="text-sm font-medium text-foreground">
                    Client portal access {portalUpdating ? '(saving…)' : portalAccess ? 'enabled' : 'disabled'}
                  </label>
                </div>
                {portalAccess && (
                  <Field label="Portal Email" value={client.portalEmail ?? 'Not set — edit to add portal email'} />
                )}
              </div>

              {/* Notes */}
              {client.notes && (
                <div className="rounded-lg border border-border bg-card p-6 space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Notes
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Contracts */}
          {activeTab === 'contracts' && (
            <div className="space-y-4">
              {role !== 'MANAGER' && (
                <div className="flex justify-end">
                  <Link
                    href={`/carrier/contracts/new?clientId=${client.id}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    New Contract
                  </Link>
                </div>
              )}
              {contractsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : contracts.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <p className="text-sm text-muted-foreground">No contracts found for this client.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contract #</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rate</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contracts.map((c) => (
                          <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/carrier/contracts/${c.id}`}
                                className="font-medium text-foreground hover:text-primary transition-colors"
                              >
                                {c.contractNumber}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground capitalize">
                              {c.contractType?.replace(/_/g, ' ') ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatRateDisplay(c.rateType, c.baseRate)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={CONTRACT_STATUS_CLASSES[c.status] ?? 'border-border text-muted-foreground'}
                              >
                                {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {c.expirationDate
                                ? new Date(c.expirationDate).toLocaleDateString()
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Loads */}
          {activeTab === 'loads' && (
            <div className="space-y-4">
              {loadsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : loadsError === 'placeholder' ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Loads tab coming soon</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The loads list by client is not yet available via the carrier loads API.
                  </p>
                </div>
              ) : loadsError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {loadsError}
                </div>
              ) : loads.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <p className="text-sm text-muted-foreground">No loads found for this client.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference #</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {loads.map((l) => (
                          <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">
                              {l.referenceNumber ?? l.id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={LOAD_STATUS_CLASSES[l.status] ?? 'border-border text-muted-foreground'}
                              >
                                {l.status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {l.totalRevenue
                                ? parseFloat(l.totalRevenue).toLocaleString('en-US', {
                                    style: 'currency',
                                    currency: 'USD',
                                  })
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(l.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Financials */}
          {activeTab === 'financials' && (
            <ClientFinancials clientId={client.id} outstandingAR={client.outstandingAR} />
          )}

          {/* Tab: Documents */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <DocumentUploadModal
                  parentType="client"
                  parentId={client.id}
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
              ) : documentsError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {documentsError}
                </div>
              ) : documents.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No documents uploaded for this client yet. Documents will appear here automatically when uploaded on loads and dispatches linked to this client.
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
          )}
        </>
      )}
    </div>
  );
}
