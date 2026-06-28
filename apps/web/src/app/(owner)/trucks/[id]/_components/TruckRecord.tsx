'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  X,
  Loader2,
  Wrench,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  getExpiryVariant,
  formatExpiryMessage,
} from '@/components/design-system';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { MaintenanceToggleButton } from '@/components/trucks/maintenance-toggle-button';
import {
  computeTruckStatus,
  type TruckWithRelations,
} from '@/lib/trucks/compute-truck-status';
import { cn } from '@/lib/utils';
import type { ActionState } from '@drivecommand/types';

/**
 * TruckRecord — Unified component for truck view and edit pages.
 *
 * Design rules:
 * - View and edit share the same layout (one component, two modes)
 * - View mode: read-only fields in clean, non-interactive style
 * - Edit mode: unlocked fields with Save, Cancel, unsaved-changes indicator
 * - Right rail: compliance health, current driver assignment
 */

export type TruckRecordMode = 'view' | 'edit';

interface TruckRecordProps {
  truck: TruckWithRelations;
  mode: TruckRecordMode;
  updateAction?: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

// Map status variant to StatusBadge variant
function mapStatusVariant(
  variant: 'blue' | 'amber' | 'red' | 'green'
): 'info' | 'warning' | 'danger' | 'success' {
  const map = {
    blue: 'info' as const,
    amber: 'warning' as const,
    red: 'danger' as const,
    green: 'success' as const,
  };
  return map[variant];
}

// Calculate days until expiry
function getDaysUntilExpiry(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Format date for display
function formatDate(dateString: string | undefined): string {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function TruckRecord({ truck, mode, updateAction }: TruckRecordProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEditMode = mode === 'edit';

  // Get truck status
  const { status: truckStatus, variant: truckStatusVariant } =
    computeTruckStatus(truck);

  // Parse document metadata
  const docMeta = truck.documentMetadata as {
    registrationNumber?: string;
    registrationExpiry?: string;
    insuranceNumber?: string;
    insuranceExpiry?: string;
  } | null;

  // Edit state - track form values and dirty state
  const [formValues, setFormValues] = useState({
    make: truck.make,
    model: truck.model,
    licensePlate: truck.licensePlate,
    odometer: truck.odometer.toString(),
    registrationNumber: docMeta?.registrationNumber ?? '',
    registrationExpiry: docMeta?.registrationExpiry ?? '',
    insuranceNumber: docMeta?.insuranceNumber ?? '',
    insuranceExpiry: docMeta?.insuranceExpiry ?? '',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [actionState, setActionState] = useState<ActionState | null>(null);

  // Track changes
  useEffect(() => {
    const originalValues = {
      make: truck.make,
      model: truck.model,
      licensePlate: truck.licensePlate,
      odometer: truck.odometer.toString(),
      registrationNumber: docMeta?.registrationNumber ?? '',
      registrationExpiry: docMeta?.registrationExpiry ?? '',
      insuranceNumber: docMeta?.insuranceNumber ?? '',
      insuranceExpiry: docMeta?.insuranceExpiry ?? '',
    };

    const hasChanges = Object.keys(formValues).some(
      (key) =>
        formValues[key as keyof typeof formValues] !==
        originalValues[key as keyof typeof originalValues]
    );
    setIsDirty(hasChanges);
  }, [formValues, truck, docMeta]);

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
  const handleChange = (field: keyof typeof formValues, value: string) => {
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
        router.push(`/trucks/${truck.id}`);
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
    router.push(`/trucks/${truck.id}`);
  };

  // Calculate expiry alerts for rail
  const registrationDays = getDaysUntilExpiry(docMeta?.registrationExpiry);
  const insuranceDays = getDaysUntilExpiry(docMeta?.insuranceExpiry);

  // Compliance health items for rail
  const complianceItems = [
    {
      label: 'Registration',
      days: registrationDays,
      date: docMeta?.registrationExpiry,
    },
    {
      label: 'Insurance',
      days: insuranceDays,
      date: docMeta?.insuranceExpiry,
    },
  ];

  // Field errors from action state
  const fieldErrors =
    typeof actionState?.error === 'object' ? actionState.error : undefined;

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          href="/trucks"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Trucks
        </Link>

        <RecordHeader
          title={`${truck.year} ${truck.make} ${truck.model}`}
          subtitle={truck.vin}
          badge={
            <StatusBadge variant={mapStatusVariant(truckStatusVariant)}>
              {truckStatus}
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
                    form="truck-edit-form"
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
                <>
                  <MaintenanceToggleButton
                    truckId={truck.id}
                    inMaintenance={(truck as any).inMaintenance ?? false}
                  />
                  <Link href={`/trucks/${truck.id}/maintenance`}>
                    <Button variant="outline">
                      <Wrench className="h-4 w-4 mr-1.5" />
                      Maintenance
                    </Button>
                  </Link>
                  <Link href={`/trucks/${truck.id}/edit`}>
                    <Button>
                      <Pencil className="h-4 w-4 mr-1.5" />
                      Edit
                    </Button>
                  </Link>
                </>
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
            {/* Compliance Health */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Compliance Health
              </h4>
              <div className="space-y-2">
                {complianceItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-foreground">{item.label}</span>
                    {item.days !== null ? (
                      <AlertBadge variant={getExpiryVariant(item.days)}>
                        {formatExpiryMessage(item.days)}
                      </AlertBadge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Not set
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Current Assignment */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Current Assignment
              </h4>
              {truck.assignedRoutes?.length > 0 || truck.loads?.length > 0 ? (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {truck.assignedRoutes?.length > 0
                      ? 'On active route'
                      : `${truck.loads?.length} active load(s)`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Available
                  </span>
                </div>
              )}
            </div>
          </div>
        }
        railTitle="Summary"
      >
        {isEditMode ? (
          <EditContent
            truck={truck}
            formValues={formValues}
            fieldErrors={fieldErrors}
            onChange={handleChange}
            onSubmit={handleSubmit}
            isPending={isPending}
          />
        ) : (
          <ViewContent truck={truck} docMeta={docMeta} />
        )}
      </RecordLayout>

      {/* Audit trail */}
      <AuditTrailFooter
        createdAt={truck.createdAt}
        createdByName={
          truck.createdBy
            ? `${truck.createdBy.firstName ?? ''} ${truck.createdBy.lastName ?? ''}`.trim() ||
              null
            : null
        }
        createdByEmail={truck.createdBy?.email ?? null}
        updatedAt={truck.updatedAt}
        updatedByName={
          truck.updatedBy
            ? `${truck.updatedBy.firstName ?? ''} ${truck.updatedBy.lastName ?? ''}`.trim() ||
              null
            : null
        }
        updatedByEmail={truck.updatedBy?.email ?? null}
      />
    </div>
  );
}

// View mode content
function ViewContent({
  truck,
  docMeta,
}: {
  truck: TruckWithRelations;
  docMeta: {
    registrationNumber?: string;
    registrationExpiry?: string;
    insuranceNumber?: string;
    insuranceExpiry?: string;
  } | null;
}) {
  return (
    <>
      <RecordSection title="Vehicle Information">
        <RecordFieldGrid columns={2}>
          <RecordField label="VIN" value={truck.vin} mono />
          <RecordField label="License Plate" value={truck.licensePlate} />
          <RecordField label="Year" value={truck.year} />
          <RecordField label="Make" value={truck.make} />
          <RecordField label="Model" value={truck.model} />
          <RecordField
            label="Odometer"
            value={`${truck.odometer.toLocaleString()} miles`}
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="Registration & Compliance">
        <RecordFieldGrid columns={2}>
          <RecordField
            label="Registration Number"
            value={docMeta?.registrationNumber}
          />
          <RecordField
            label="Registration Expiry"
            value={formatDate(docMeta?.registrationExpiry)}
          />
          <RecordField
            label="Insurance Number"
            value={docMeta?.insuranceNumber}
          />
          <RecordField
            label="Insurance Expiry"
            value={formatDate(docMeta?.insuranceExpiry)}
          />
        </RecordFieldGrid>
      </RecordSection>
    </>
  );
}

// Edit mode content
function EditContent({
  truck,
  formValues,
  fieldErrors,
  onChange,
  onSubmit,
  isPending,
}: {
  truck: TruckWithRelations;
  formValues: {
    make: string;
    model: string;
    licensePlate: string;
    odometer: string;
    registrationNumber: string;
    registrationExpiry: string;
    insuranceNumber: string;
    insuranceExpiry: string;
  };
  fieldErrors: Record<string, string[] | undefined> | undefined;
  onChange: (field: keyof typeof formValues, value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}) {
  // Format odometer with commas
  const formatOdometer = (value: string) => {
    const num = parseInt(value.replace(/,/g, ''), 10);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US');
  };

  const handleOdometerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    onChange('odometer', raw);
  };

  return (
    <form id="truck-edit-form" onSubmit={onSubmit} className="space-y-6">
      <RecordSection title="Vehicle Information">
        <div className="space-y-4">
          {/* VIN - read-only */}
          <FormField label="VIN" name="vin-display">
            <Input
              value={truck.vin}
              readOnly
              className="uppercase font-mono bg-muted cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              VIN cannot be changed after creation
            </p>
          </FormField>

          <FormRow>
            <FormField
              label="Make"
              name="make"
              required
              error={fieldErrors?.make?.[0]}
            >
              <Input
                name="make"
                value={formValues.make}
                onChange={(e) => onChange('make', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField
              label="Model"
              name="model"
              required
              error={fieldErrors?.model?.[0]}
            >
              <Input
                name="model"
                value={formValues.model}
                onChange={(e) => onChange('model', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField
              label="License Plate"
              name="licensePlate"
              required
              error={fieldErrors?.licensePlate?.[0]}
            >
              <Input
                name="licensePlate"
                value={formValues.licensePlate}
                onChange={(e) =>
                  onChange('licensePlate', e.target.value.toUpperCase())
                }
                maxLength={20}
                className="uppercase"
                disabled={isPending}
              />
            </FormField>
            <FormField
              label="Odometer"
              name="odometer-field"
              required
              error={fieldErrors?.odometer?.[0]}
              helperText="Current reading in miles"
            >
              <Input
                type="text"
                inputMode="numeric"
                value={formatOdometer(formValues.odometer)}
                onChange={handleOdometerChange}
                disabled={isPending}
              />
              <input
                type="hidden"
                name="odometer"
                value={formValues.odometer}
              />
            </FormField>
          </FormRow>
        </div>
      </RecordSection>

      <RecordSection title="Registration & Compliance">
        <div className="space-y-4">
          <FormRow>
            <FormField
              label="Registration Number"
              name="registrationNumber"
              helperText="Optional"
            >
              <Input
                name="registrationNumber"
                value={formValues.registrationNumber}
                onChange={(e) => onChange('registrationNumber', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField
              label="Registration Expiry"
              name="registrationExpiry"
              helperText="Optional"
            >
              <Input
                type="date"
                name="registrationExpiry"
                value={formValues.registrationExpiry}
                onChange={(e) => onChange('registrationExpiry', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField
              label="Insurance Number"
              name="insuranceNumber"
              helperText="Optional"
            >
              <Input
                name="insuranceNumber"
                value={formValues.insuranceNumber}
                onChange={(e) => onChange('insuranceNumber', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField
              label="Insurance Expiry"
              name="insuranceExpiry"
              helperText="Optional"
            >
              <Input
                type="date"
                name="insuranceExpiry"
                value={formValues.insuranceExpiry}
                onChange={(e) => onChange('insuranceExpiry', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>
        </div>
      </RecordSection>
    </form>
  );
}
