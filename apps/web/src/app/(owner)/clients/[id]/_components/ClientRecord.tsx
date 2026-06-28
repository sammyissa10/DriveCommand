'use client';

import * as React from 'react';
import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  X,
  Loader2,
  Clock,
  Package,
  ExternalLink,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormField,
  FormSection,
  FormRow,
  RecordLayout,
  RecordSection,
  RecordField,
  RecordFieldGrid,
  RecordHeader,
  StatusBadge,
} from '@/components/design-system';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import {
  computeClientStatus,
  type ClientWithRelations,
} from '@/lib/clients/compute-client-status';
import { cn } from '@/lib/utils';
import type { ActionState } from '@drivecommand/types';

/**
 * ClientRecord — Unified component for client view and edit pages.
 *
 * Design rules:
 * - View and edit share the same layout (one component, two modes)
 * - View mode: read-only fields in clean, non-interactive style
 * - Edit mode: unlocked fields with Save, Cancel, unsaved-changes indicator
 * - Right rail: account summary
 */

export type ClientRecordMode = 'view' | 'edit';

interface ClientRecordProps {
  client: ClientWithRelations;
  mode: ClientRecordMode;
  updateAction?: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

// Status options for dropdown
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'prospect', label: 'Prospect' },
];

// Payment terms presets
const PAYMENT_TERM_PRESETS = [15, 30, 45, 60];

export function ClientRecord({ client, mode, updateAction }: ClientRecordProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEditMode = mode === 'edit';

  // Get client status
  const { status: clientStatus, variant: clientStatusVariant } =
    computeClientStatus(client);

  // Edit state - track form values and dirty state
  const [formValues, setFormValues] = useState({
    name: client.name,
    dbaName: client.dbaName ?? '',
    mcNumber: client.mcNumber ?? '',
    dotNumber: client.dotNumber ?? '',
    taxId: client.taxId ?? '',
    primaryContact: client.primaryContact ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    website: client.website ?? '',
    addressLine1: client.addressLine1 ?? '',
    addressLine2: client.addressLine2 ?? '',
    city: client.city ?? '',
    state: client.state ?? '',
    zip: client.zip ?? '',
    status: client.status,
    paymentTerms: client.paymentTerms.toString(),
    creditLimit: client.creditLimit?.toString() ?? '',
    portalAccess: client.portalAccess,
    portalEmail: client.portalEmail ?? '',
    notes: client.notes ?? '',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [actionState, setActionState] = useState<ActionState | null>(null);

  // Track changes
  useEffect(() => {
    const originalValues = {
      name: client.name,
      dbaName: client.dbaName ?? '',
      mcNumber: client.mcNumber ?? '',
      dotNumber: client.dotNumber ?? '',
      taxId: client.taxId ?? '',
      primaryContact: client.primaryContact ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      website: client.website ?? '',
      addressLine1: client.addressLine1 ?? '',
      addressLine2: client.addressLine2 ?? '',
      city: client.city ?? '',
      state: client.state ?? '',
      zip: client.zip ?? '',
      status: client.status,
      paymentTerms: client.paymentTerms.toString(),
      creditLimit: client.creditLimit?.toString() ?? '',
      portalAccess: client.portalAccess,
      portalEmail: client.portalEmail ?? '',
      notes: client.notes ?? '',
    };

    const hasChanges = Object.keys(formValues).some(
      (key) =>
        formValues[key as keyof typeof formValues] !==
        originalValues[key as keyof typeof originalValues]
    );
    setIsDirty(hasChanges);
  }, [formValues, client]);

  // Navigation guard for unsaved changes
  useEffect(() => {
    if (!isEditMode || !isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEditMode, isDirty]);

  // Handle form field changes
  const handleChange = (field: keyof typeof formValues, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!updateAction) return;

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateAction(null, formData);
      setActionState(result);

      if (!result.error) {
        // Success - redirect to view page
        router.push(`/clients/${client.id}`);
        router.refresh();
      }
    });
  };

  // Handle cancel
  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmed) return;
    }
    router.push(`/clients/${client.id}`);
  };

  // Field errors from action state
  const fieldErrors =
    typeof actionState?.error === 'object' ? actionState.error : undefined;

  // Format credit limit for display (handles Prisma Decimal type)
  const formatCreditLimit = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'No limit';
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) return 'No limit';
    return `$${num.toLocaleString()}`;
  };

  // Format address for display
  const formatAddress = (): string => {
    const parts = [
      client.addressLine1,
      client.addressLine2,
      [client.city, client.state, client.zip].filter(Boolean).join(', '),
    ].filter(Boolean);
    return parts.join('\n') || '—';
  };

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          href="/clients"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Clients
        </Link>

        <RecordHeader
          title={client.name}
          subtitle={client.primaryContact || '—'}
          badge={
            <StatusBadge variant={clientStatusVariant}>
              {clientStatus}
            </StatusBadge>
          }
          actions={
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <>
                  {/* Unsaved changes indicator */}
                  {isDirty && (
                    <span className="text-sm text-status-warning-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Unsaved changes
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isPending}
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="client-edit-form"
                    disabled={isPending || !isDirty}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </>
              ) : (
                <Link href={`/clients/${client.id}/edit`}>
                  <Button>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </Button>
                </Link>
              )}
            </div>
          }
        />
      </div>

      {/* General error message */}
      {actionState?.error && typeof actionState.error === 'string' && (
        <div className="rounded-lg bg-status-danger-bg border border-status-danger-foreground/20 p-4">
          <p className="text-sm text-status-danger-foreground">
            {actionState.error}
          </p>
        </div>
      )}

      {/* Main content with rail */}
      <RecordLayout
        rail={
          <div className="space-y-6">
            {/* Account Summary */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Account Summary
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Status</span>
                  <StatusBadge variant={clientStatusVariant}>
                    {clientStatus}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Payment Terms</span>
                  <span className="text-sm text-muted-foreground">
                    {client.paymentTerms} days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Credit Limit</span>
                  <span className="text-sm text-muted-foreground">
                    {formatCreditLimit(client.creditLimit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Load Activity */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Activity
              </h4>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {client._count?.carrierLoads ?? 0} total loads
                </span>
              </div>
            </div>
          </div>
        }
        railTitle="Account Summary"
      >
        {isEditMode ? (
          <EditContent
            client={client}
            formValues={formValues}
            fieldErrors={fieldErrors}
            onChange={handleChange}
            onSubmit={handleSubmit}
            isPending={isPending}
          />
        ) : (
          <ViewContent client={client} formatAddress={formatAddress} />
        )}
      </RecordLayout>

      {/* Audit trail */}
      <AuditTrailFooter
        createdAt={client.createdAt}
        createdByName={
          client.createdBy
            ? `${client.createdBy.firstName ?? ''} ${client.createdBy.lastName ?? ''}`.trim() ||
              null
            : null
        }
        createdByEmail={client.createdBy?.email ?? null}
        updatedAt={client.updatedAt}
        updatedByName={
          client.updatedBy
            ? `${client.updatedBy.firstName ?? ''} ${client.updatedBy.lastName ?? ''}`.trim() ||
              null
            : null
        }
        updatedByEmail={client.updatedBy?.email ?? null}
      />
    </div>
  );
}

// View mode content
function ViewContent({
  client,
  formatAddress,
}: {
  client: ClientWithRelations;
  formatAddress: () => string;
}) {
  const formatCreditLimit = (value: any): string => {
    if (value === null || value === undefined) return 'No limit';
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) return 'No limit';
    return `$${num.toLocaleString()}`;
  };

  return (
    <>
      <RecordSection title="Company Information">
        <RecordFieldGrid columns={2}>
          <RecordField label="Company Name" value={client.name} />
          <RecordField label="DBA Name" value={client.dbaName} />
          <RecordField label="MC Number" value={client.mcNumber} />
          <RecordField label="DOT Number" value={client.dotNumber} />
          <RecordField label="Tax ID" value={client.taxId ? '••••••' + client.taxId.slice(-4) : null} />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Contact Information">
        <RecordFieldGrid columns={2}>
          <RecordField label="Contact Name" value={client.primaryContact} />
          <RecordField label="Email" value={client.email} />
          <RecordField label="Phone" value={client.phone} />
          <RecordField
            label="Website"
            value={
              client.website ? (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {client.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null
            }
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Billing Address">
        <RecordField
          label="Address"
          value={
            <span className="whitespace-pre-line">{formatAddress()}</span>
          }
        />
      </RecordSection>

      <RecordSection title="Account Settings">
        <RecordFieldGrid columns={2}>
          <RecordField label="Payment Terms" value={`${client.paymentTerms} days`} />
          <RecordField label="Credit Limit" value={formatCreditLimit(client.creditLimit)} />
          <RecordField
            label="Portal Access"
            value={client.portalAccess ? 'Enabled' : 'Disabled'}
          />
          {client.portalAccess && (
            <RecordField label="Portal Email" value={client.portalEmail} />
          )}
        </RecordFieldGrid>
        {client.notes && (
          <div className="mt-4">
            <RecordField
              label="Notes"
              value={
                <span className="whitespace-pre-line">{client.notes}</span>
              }
            />
          </div>
        )}
      </RecordSection>
    </>
  );
}

// Edit mode content
function EditContent({
  client,
  formValues,
  fieldErrors,
  onChange,
  onSubmit,
  isPending,
}: {
  client: ClientWithRelations;
  formValues: {
    name: string;
    dbaName: string;
    mcNumber: string;
    dotNumber: string;
    taxId: string;
    primaryContact: string;
    email: string;
    phone: string;
    website: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    status: string;
    paymentTerms: string;
    creditLimit: string;
    portalAccess: boolean;
    portalEmail: string;
    notes: string;
  };
  fieldErrors: Record<string, string[] | undefined> | undefined;
  onChange: (field: keyof typeof formValues, value: string | boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}) {
  // Format credit limit with commas
  const formatCreditLimitDisplay = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString('en-US');
  };

  const handleCreditLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    onChange('creditLimit', raw);
  };

  return (
    <form id="client-edit-form" onSubmit={onSubmit} className="space-y-6">
      <RecordSection title="Company Information">
        <div className="space-y-4">
          <FormField
            label="Company Name"
            name="name"
            required
            error={fieldErrors?.name?.[0]}
          >
            <Input
              name="name"
              value={formValues.name}
              onChange={(e) => onChange('name', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormField label="DBA Name" name="dbaName">
            <Input
              name="dbaName"
              value={formValues.dbaName}
              onChange={(e) => onChange('dbaName', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormRow>
            <FormField label="MC Number" name="mcNumber">
              <Input
                name="mcNumber"
                value={formValues.mcNumber}
                onChange={(e) => onChange('mcNumber', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField label="DOT Number" name="dotNumber">
              <Input
                name="dotNumber"
                value={formValues.dotNumber}
                onChange={(e) => onChange('dotNumber', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>

          <FormField label="Tax ID" name="taxId" helperText="EIN or SSN">
            <Input
              name="taxId"
              value={formValues.taxId}
              onChange={(e) => onChange('taxId', e.target.value)}
              disabled={isPending}
              placeholder="XX-XXXXXXX"
            />
          </FormField>
        </div>
      </RecordSection>

      <RecordSection title="Contact Information">
        <div className="space-y-4">
          <FormField label="Contact Name" name="primaryContact">
            <Input
              name="primaryContact"
              value={formValues.primaryContact}
              onChange={(e) => onChange('primaryContact', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormRow>
            <FormField label="Email" name="email" error={fieldErrors?.email?.[0]}>
              <Input
                type="email"
                name="email"
                value={formValues.email}
                onChange={(e) => onChange('email', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField label="Phone" name="phone">
              <Input
                type="tel"
                name="phone"
                value={formValues.phone}
                onChange={(e) => onChange('phone', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>

          <FormField label="Website" name="website" error={fieldErrors?.website?.[0]}>
            <Input
              type="url"
              name="website"
              value={formValues.website}
              onChange={(e) => onChange('website', e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </div>
      </RecordSection>

      <RecordSection title="Billing Address">
        <div className="space-y-4">
          <FormField label="Address Line 1" name="addressLine1">
            <Input
              name="addressLine1"
              value={formValues.addressLine1}
              onChange={(e) => onChange('addressLine1', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormField label="Address Line 2" name="addressLine2">
            <Input
              name="addressLine2"
              value={formValues.addressLine2}
              onChange={(e) => onChange('addressLine2', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormRow>
            <FormField label="City" name="city">
              <Input
                name="city"
                value={formValues.city}
                onChange={(e) => onChange('city', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField label="State" name="state">
              <Input
                name="state"
                value={formValues.state}
                onChange={(e) => onChange('state', e.target.value.toUpperCase())}
                disabled={isPending}
                maxLength={2}
                className="uppercase"
              />
            </FormField>
            <FormField label="ZIP" name="zip">
              <Input
                name="zip"
                value={formValues.zip}
                onChange={(e) => onChange('zip', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>
        </div>
      </RecordSection>

      <RecordSection title="Account Settings">
        <div className="space-y-4">
          <FormField label="Status" name="status">
            <Select
              name="status"
              value={formValues.status}
              onValueChange={(v) => onChange('status', v)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Payment Terms"
            name="paymentTerms-field"
            helperText="Days until payment due"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {PAYMENT_TERM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange('paymentTerms', preset.toString())}
                    disabled={isPending}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      'border border-border hover:bg-muted',
                      formValues.paymentTerms === preset.toString() &&
                        'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                    )}
                  >
                    Net {preset}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                name="paymentTerms"
                value={formValues.paymentTerms}
                onChange={(e) => onChange('paymentTerms', e.target.value)}
                disabled={isPending}
                min={0}
                max={365}
                className="w-32"
              />
            </div>
          </FormField>

          <FormField
            label="Credit Limit"
            name="creditLimit-field"
            helperText="Leave blank for no limit"
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                type="text"
                inputMode="decimal"
                value={formatCreditLimitDisplay(formValues.creditLimit)}
                onChange={handleCreditLimitChange}
                disabled={isPending}
                placeholder="0.00"
                className="pl-7"
              />
              <input type="hidden" name="creditLimit" value={formValues.creditLimit} />
            </div>
          </FormField>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="portalAccess" className="text-sm font-medium">
                Customer Portal Access
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow this client to access the tracking portal
              </p>
            </div>
            <Switch
              id="portalAccess"
              name="portalAccess"
              checked={formValues.portalAccess}
              onCheckedChange={(checked) => onChange('portalAccess', checked)}
              disabled={isPending}
            />
            <input
              type="hidden"
              name="portalAccess"
              value={formValues.portalAccess ? 'true' : 'false'}
            />
          </div>

          {formValues.portalAccess && (
            <FormField
              label="Portal Email"
              name="portalEmail"
              helperText="Email for portal login"
              error={fieldErrors?.portalEmail?.[0]}
            >
              <Input
                type="email"
                name="portalEmail"
                value={formValues.portalEmail}
                onChange={(e) => onChange('portalEmail', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          )}

          <FormField label="Notes" name="notes">
            <Textarea
              name="notes"
              value={formValues.notes}
              onChange={(e) => onChange('notes', e.target.value)}
              disabled={isPending}
              placeholder="Internal notes..."
              rows={3}
            />
          </FormField>
        </div>
      </RecordSection>
    </form>
  );
}
