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
  FileText,
  Package,
  Users,
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
  AlertBadge,
} from '@/components/design-system';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import {
  computeContractStatus,
  type ContractWithRelations,
} from '@/lib/contracts/compute-contract-status';
import { formatRate, formatDetentionTime } from '@/lib/contracts/format-rate';
import { cn } from '@/lib/utils';
import type { ActionState } from '@drivecommand/types';

/**
 * ContractRecord — Unified component for contract view and edit pages.
 *
 * Design rules:
 * - View and edit share the same layout (one component, two modes)
 * - View mode: read-only fields in clean, non-interactive style
 * - Edit mode: unlocked fields with Save, Cancel, unsaved-changes indicator
 * - Right rail: contract health summary
 */

export type ContractRecordMode = 'view' | 'edit';

interface ContractRecordProps {
  contract: ContractWithRelations;
  mode: ContractRecordMode;
  updateAction?: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

interface ClientItem {
  id: string;
  name: string;
}

export function ContractRecord({ contract, mode, updateAction }: ContractRecordProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEditMode = mode === 'edit';

  // Get contract status
  const { status: contractStatus, variant: contractStatusVariant, alert } =
    computeContractStatus(contract);

  // Fetch clients for edit mode picker
  const [clients, setClients] = useState<ClientItem[]>([]);

  useEffect(() => {
    if (!isEditMode) return;

    async function loadClients() {
      try {
        const res = await fetch('/api/v1/carrier/clients?pageSize=200');
        if (!res.ok) return;
        const data = await res.json();
        setClients((data.data?.items ?? []) as ClientItem[]);
      } catch {
        // Ignore
      }
    }
    loadClients();
  }, [isEditMode]);

  // Edit state - track form values and dirty state
  const [formValues, setFormValues] = useState({
    contractName: contract.contractName ?? '',
    clientId: contract.clientId,
    contractType: contract.contractType,
    effectiveDate: contract.effectiveDate
      ? new Date(contract.effectiveDate).toISOString().split('T')[0]
      : '',
    expirationDate: contract.expirationDate
      ? new Date(contract.expirationDate).toISOString().split('T')[0]
      : '',
    rateType: contract.rateType,
    baseRate: contract.baseRate?.toString() ?? '',
    autoRenew: contract.autoRenew,
    status: contract.status,
    fuelSurchargeMethod: contract.fuelSurchargeMethod,
    fuelSurchargeRate: contract.fuelSurchargeRate?.toString() ?? '',
    detentionFreeMinutes: contract.detentionFreeMinutes.toString(),
    detentionRatePerHour: contract.detentionRatePerHour?.toString() ?? '',
    tonuRate: contract.tonuRate?.toString() ?? '',
    layoverRatePerDay: contract.layoverRatePerDay?.toString() ?? '',
    paymentTermsOverride: contract.paymentTermsOverride ?? '',
    defaultFreeTimeMinutes: contract.defaultFreeTimeMinutes?.toString() ?? '',
    notes: contract.notes ?? '',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [actionState, setActionState] = useState<ActionState | null>(null);

  // Track changes
  useEffect(() => {
    const originalValues = {
      contractName: contract.contractName ?? '',
      clientId: contract.clientId,
      contractType: contract.contractType,
      effectiveDate: contract.effectiveDate
        ? new Date(contract.effectiveDate).toISOString().split('T')[0]
        : '',
      expirationDate: contract.expirationDate
        ? new Date(contract.expirationDate).toISOString().split('T')[0]
        : '',
      rateType: contract.rateType,
      baseRate: contract.baseRate?.toString() ?? '',
      autoRenew: contract.autoRenew,
      status: contract.status,
      fuelSurchargeMethod: contract.fuelSurchargeMethod,
      fuelSurchargeRate: contract.fuelSurchargeRate?.toString() ?? '',
      detentionFreeMinutes: contract.detentionFreeMinutes.toString(),
      detentionRatePerHour: contract.detentionRatePerHour?.toString() ?? '',
      tonuRate: contract.tonuRate?.toString() ?? '',
      layoverRatePerDay: contract.layoverRatePerDay?.toString() ?? '',
      paymentTermsOverride: contract.paymentTermsOverride ?? '',
      defaultFreeTimeMinutes: contract.defaultFreeTimeMinutes?.toString() ?? '',
      notes: contract.notes ?? '',
    };

    const hasChanges = Object.keys(formValues).some(
      (key) =>
        formValues[key as keyof typeof formValues] !==
        originalValues[key as keyof typeof originalValues]
    );
    setIsDirty(hasChanges);
  }, [formValues, contract]);

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
        router.push(`/contracts/${contract.id}`);
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
    router.push(`/contracts/${contract.id}`);
  };

  // Field errors from action state
  const fieldErrors =
    typeof actionState?.error === 'object' ? actionState.error : undefined;

  // Format dates for display
  const formatDate = (date: Date | null | undefined): string => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Compute contract duration
  const computeDuration = (): string => {
    if (!contract.effectiveDate || !contract.expirationDate) return '—';
    const start = new Date(contract.effectiveDate);
    const end = new Date(contract.expirationDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days} days`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} months`;
    const years = Math.round(days / 365);
    return `${years} year${years > 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          href="/contracts"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Contracts
        </Link>

        <RecordHeader
          title={contract.contractNumber}
          subtitle={contract.contractName || contract.client?.name || '—'}
          badge={
            <div className="flex items-center gap-2">
              <StatusBadge variant={contractStatusVariant}>
                {contractStatus}
              </StatusBadge>
              {alert && (
                <AlertBadge variant={alert.variant}>{alert.message}</AlertBadge>
              )}
            </div>
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
                    form="contract-edit-form"
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
                <Link href={`/contracts/${contract.id}/edit`}>
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
            {/* Contract Health */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Contract Health
              </h4>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="flex flex-col gap-1">
                    <StatusBadge variant={contractStatusVariant}>
                      {contractStatus}
                    </StatusBadge>
                    {alert && (
                      <AlertBadge variant={alert.variant} className="text-xs">
                        {alert.message}
                      </AlertBadge>
                    )}
                  </div>
                </div>

                {contract.autoRenew && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-status-info-foreground" />
                    <span className="text-sm text-muted-foreground">Auto-renews</span>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Client</span>
                  {contract.client ? (
                    <Link
                      href={`/clients/${contract.client.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {contract.client.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Duration</span>
                  <span className="text-sm text-foreground">{computeDuration()}</span>
                </div>
              </div>
            </div>

            {/* Usage Stats */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Usage
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {contract._count?.carrierLoads ?? 0} loads
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {contract._count?.routeTemplates ?? 0} route templates
                  </span>
                </div>
              </div>
            </div>
          </div>
        }
        railTitle="Contract Health"
      >
        {isEditMode ? (
          <EditContent
            contract={contract}
            formValues={formValues}
            fieldErrors={fieldErrors}
            clients={clients}
            onChange={handleChange}
            onSubmit={handleSubmit}
            isPending={isPending}
          />
        ) : (
          <ViewContent contract={contract} formatDate={formatDate} />
        )}
      </RecordLayout>

      {/* Audit trail */}
      <AuditTrailFooter
        createdAt={contract.createdAt}
        createdByName={
          contract.createdBy
            ? `${contract.createdBy.firstName ?? ''} ${contract.createdBy.lastName ?? ''}`.trim() ||
              null
            : null
        }
        createdByEmail={contract.createdBy?.email ?? null}
        updatedAt={contract.updatedAt}
        updatedByName={
          contract.updatedBy
            ? `${contract.updatedBy.firstName ?? ''} ${contract.updatedBy.lastName ?? ''}`.trim() ||
              null
            : null
        }
        updatedByEmail={contract.updatedBy?.email ?? null}
      />
    </div>
  );
}

// View mode content
function ViewContent({
  contract,
  formatDate,
}: {
  contract: ContractWithRelations;
  formatDate: (date: Date | null | undefined) => string;
}) {
  return (
    <>
      <RecordSection title="Contract Identity">
        <RecordFieldGrid columns={2}>
          <RecordField
            label="Contract Number"
            value={<span className="font-mono">{contract.contractNumber}</span>}
          />
          <RecordField label="Contract Name" value={contract.contractName} />
          <RecordField
            label="Client"
            value={
              contract.client ? (
                <Link
                  href={`/clients/${contract.client.id}`}
                  className="text-primary hover:underline"
                >
                  {contract.client.name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <RecordField
            label="Contract Type"
            value={
              contract.contractType === 'spot'
                ? 'Spot'
                : contract.contractType === 'dedicated'
                  ? 'Dedicated'
                  : contract.contractType === 'volume'
                    ? 'Volume'
                    : contract.contractType === 'broker'
                      ? 'Broker'
                      : contract.contractType
            }
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Contract Terms">
        <RecordFieldGrid columns={2}>
          <RecordField label="Effective Date" value={formatDate(contract.effectiveDate)} />
          <RecordField label="Expiration Date" value={formatDate(contract.expirationDate)} />
          <RecordField
            label="Auto-Renew"
            value={
              contract.autoRenew ? (
                <span className="inline-flex items-center gap-1.5 text-status-success-foreground">
                  Enabled
                </span>
              ) : (
                'Disabled'
              )
            }
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Rate Information">
        <RecordFieldGrid columns={2}>
          <RecordField
            label="Rate Type"
            value={
              contract.rateType === 'per_mile'
                ? 'Per Mile'
                : contract.rateType === 'flat'
                  ? 'Flat Rate'
                  : contract.rateType === 'percentage'
                    ? 'Percentage'
                    : contract.rateType === 'hourly'
                      ? 'Hourly'
                      : contract.rateType
            }
          />
          <RecordField
            label="Base Rate"
            value={formatRate(contract.baseRate, contract.rateType)}
          />
          <RecordField
            label="Fuel Surcharge Method"
            value={
              contract.fuelSurchargeMethod === 'none'
                ? 'None'
                : contract.fuelSurchargeMethod === 'percentage'
                  ? 'Percentage'
                  : contract.fuelSurchargeMethod === 'flat'
                    ? 'Flat Rate'
                    : contract.fuelSurchargeMethod
            }
          />
          <RecordField
            label="Fuel Surcharge Rate"
            value={contract.fuelSurchargeRate?.toString() ?? '—'}
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Accessorial Charges">
        <RecordFieldGrid columns={2}>
          <RecordField
            label="Detention Free Time"
            value={formatDetentionTime(contract.detentionFreeMinutes)}
          />
          <RecordField
            label="Detention Rate"
            value={
              contract.detentionRatePerHour
                ? `$${contract.detentionRatePerHour.toString()}/hr`
                : '—'
            }
          />
          <RecordField
            label="TONU Rate"
            value={contract.tonuRate ? `$${contract.tonuRate.toString()}` : '—'}
          />
          <RecordField
            label="Layover Rate"
            value={
              contract.layoverRatePerDay
                ? `$${contract.layoverRatePerDay.toString()}/day`
                : '—'
            }
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Payment & Settings">
        <RecordFieldGrid columns={2}>
          <RecordField
            label="Payment Terms Override"
            value={contract.paymentTermsOverride ?? '—'}
          />
          <RecordField
            label="Default Free Time"
            value={
              contract.defaultFreeTimeMinutes
                ? formatDetentionTime(contract.defaultFreeTimeMinutes)
                : '—'
            }
          />
          <RecordField
            label="Status"
            value={
              contract.status === 'draft'
                ? 'Draft'
                : contract.status === 'active'
                  ? 'Active'
                  : contract.status === 'expired'
                    ? 'Expired'
                    : contract.status === 'terminated'
                      ? 'Terminated'
                      : contract.status
            }
          />
          <RecordField label="Notes" value={contract.notes} />
        </RecordFieldGrid>
      </RecordSection>
    </>
  );
}

// Edit mode content
function EditContent({
  contract,
  formValues,
  fieldErrors,
  clients,
  onChange,
  onSubmit,
  isPending,
}: {
  contract: ContractWithRelations;
  formValues: any;
  fieldErrors: any;
  clients: ClientItem[];
  onChange: (field: any, value: string | boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}) {
  return (
    <form id="contract-edit-form" onSubmit={onSubmit} className="space-y-8">
      <FormSection title="Contract Identity">
        <FormField
          label="Contract Number"
          name="contractNumber"
          helperText="Contract number cannot be changed"
        >
          <Input
            name="contractNumber"
            value={contract.contractNumber}
            disabled
            className="font-mono bg-muted"
          />
        </FormField>

        <FormField
          label="Contract Name"
          name="contractName"
          error={fieldErrors?.contractName?.[0]}
        >
          <Input
            name="contractName"
            value={formValues.contractName as string}
            onChange={(e) => onChange('contractName', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Client" name="clientId" required error={fieldErrors?.clientId?.[0]}>
          <Select
            name="clientId"
            value={formValues.clientId as string}
            onValueChange={(v) => onChange('clientId', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Contract Type"
          name="contractType"
          error={fieldErrors?.contractType?.[0]}
        >
          <Select
            name="contractType"
            value={formValues.contractType as string}
            onValueChange={(v) => onChange('contractType', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spot">Spot</SelectItem>
              <SelectItem value="dedicated">Dedicated</SelectItem>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="broker">Broker</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Contract Terms">
        <FormRow>
          <FormField
            label="Effective Date"
            name="effectiveDate"
            error={fieldErrors?.effectiveDate?.[0]}
          >
            <Input
              type="date"
              name="effectiveDate"
              value={formValues.effectiveDate as string}
              onChange={(e) => onChange('effectiveDate', e.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormField
            label="Expiration Date"
            name="expirationDate"
            error={fieldErrors?.expirationDate?.[0]}
          >
            <Input
              type="date"
              name="expirationDate"
              value={formValues.expirationDate as string}
              onChange={(e) => onChange('expirationDate', e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </FormRow>

        <div className="flex items-center gap-3">
          <Switch
            id="autoRenew"
            name="autoRenew"
            checked={formValues.autoRenew as boolean}
            onCheckedChange={(checked) => onChange('autoRenew', checked)}
            disabled={isPending}
          />
          <Label htmlFor="autoRenew" className="cursor-pointer">
            Auto-renew contract
          </Label>
        </div>
      </FormSection>

      <FormSection title="Rate Information">
        <FormField label="Rate Type" name="rateType" error={fieldErrors?.rateType?.[0]}>
          <Select
            name="rateType"
            value={formValues.rateType as string}
            onValueChange={(v) => onChange('rateType', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_mile">Per Mile</SelectItem>
              <SelectItem value="flat">Flat Rate</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Base Rate" name="baseRate" error={fieldErrors?.baseRate?.[0]}>
          <Input
            type="number"
            step="0.01"
            name="baseRate"
            value={formValues.baseRate as string}
            onChange={(e) => onChange('baseRate', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Fuel Surcharge Method"
          name="fuelSurchargeMethod"
          error={fieldErrors?.fuelSurchargeMethod?.[0]}
        >
          <Select
            name="fuelSurchargeMethod"
            value={formValues.fuelSurchargeMethod as string}
            onValueChange={(v) => onChange('fuelSurchargeMethod', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="flat">Flat Rate</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Fuel Surcharge Rate"
          name="fuelSurchargeRate"
          error={fieldErrors?.fuelSurchargeRate?.[0]}
        >
          <Input
            type="number"
            step="0.01"
            name="fuelSurchargeRate"
            value={formValues.fuelSurchargeRate as string}
            onChange={(e) => onChange('fuelSurchargeRate', e.target.value)}
            disabled={isPending}
          />
        </FormField>
      </FormSection>

      <FormSection title="Accessorial Charges">
        <FormField
          label="Detention Free Minutes"
          name="detentionFreeMinutes"
          error={fieldErrors?.detentionFreeMinutes?.[0]}
        >
          <Input
            type="number"
            name="detentionFreeMinutes"
            value={formValues.detentionFreeMinutes as string}
            onChange={(e) => onChange('detentionFreeMinutes', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Detention Rate Per Hour"
          name="detentionRatePerHour"
          error={fieldErrors?.detentionRatePerHour?.[0]}
        >
          <Input
            type="number"
            step="0.01"
            name="detentionRatePerHour"
            value={formValues.detentionRatePerHour as string}
            onChange={(e) => onChange('detentionRatePerHour', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="TONU Rate" name="tonuRate" error={fieldErrors?.tonuRate?.[0]}>
          <Input
            type="number"
            step="0.01"
            name="tonuRate"
            value={formValues.tonuRate as string}
            onChange={(e) => onChange('tonuRate', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Layover Rate Per Day"
          name="layoverRatePerDay"
          error={fieldErrors?.layoverRatePerDay?.[0]}
        >
          <Input
            type="number"
            step="0.01"
            name="layoverRatePerDay"
            value={formValues.layoverRatePerDay as string}
            onChange={(e) => onChange('layoverRatePerDay', e.target.value)}
            disabled={isPending}
          />
        </FormField>
      </FormSection>

      <FormSection title="Payment & Settings">
        <FormField
          label="Payment Terms Override"
          name="paymentTermsOverride"
          helperText="Override client default payment terms"
          error={fieldErrors?.paymentTermsOverride?.[0]}
        >
          <Input
            name="paymentTermsOverride"
            value={formValues.paymentTermsOverride as string}
            onChange={(e) => onChange('paymentTermsOverride', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Default Free Time Minutes"
          name="defaultFreeTimeMinutes"
          error={fieldErrors?.defaultFreeTimeMinutes?.[0]}
        >
          <Input
            type="number"
            name="defaultFreeTimeMinutes"
            value={formValues.defaultFreeTimeMinutes as string}
            onChange={(e) => onChange('defaultFreeTimeMinutes', e.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Status" name="status" error={fieldErrors?.status?.[0]}>
          <Select
            name="status"
            value={formValues.status as string}
            onValueChange={(v) => onChange('status', v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Notes" name="notes" error={fieldErrors?.notes?.[0]}>
          <Textarea
            name="notes"
            value={formValues.notes as string}
            onChange={(e) => onChange('notes', e.target.value)}
            rows={4}
            disabled={isPending}
          />
        </FormField>
      </FormSection>
    </form>
  );
}
