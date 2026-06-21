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
  UserX,
  UserCheck,
  Clock,
  FileText,
  Truck,
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
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';
import {
  computeDriverStatus,
  getDriverComplianceAlerts,
  type DriverWithRelations,
} from '@/lib/drivers/compute-driver-status';
import { deactivateDriver, reactivateDriver } from '@/app/(owner)/actions/drivers';
import { cn } from '@/lib/utils';
import type { ActionState } from '@drivecommand/types';

/**
 * DriverRecord — Unified component for driver view and edit pages.
 *
 * Design rules:
 * - View and edit share the same layout (one component, two modes)
 * - View mode: read-only fields in clean, non-interactive style
 * - Edit mode: unlocked fields with Save, Cancel, unsaved-changes indicator
 * - Right rail: compliance health, current assignment, documents quick view
 */

export type DriverRecordMode = 'view' | 'edit';

interface DriverRecordProps {
  driver: DriverWithRelations;
  mode: DriverRecordMode;
  updateAction?: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

// Map status variant to StatusBadge variant
function mapStatusVariant(
  variant: 'success' | 'warning' | 'danger' | 'neutral'
): 'success' | 'warning' | 'danger' | 'neutral' {
  return variant;
}

// Format date for display
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function DriverRecord({ driver, mode, updateAction }: DriverRecordProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEditMode = mode === 'edit';

  // Get driver status
  const { status: driverStatus, variant: driverStatusVariant } =
    computeDriverStatus(driver);

  // Get compliance alerts for rail
  const complianceAlerts = getDriverComplianceAlerts(driver);

  // Edit state - track form values and dirty state
  const [formValues, setFormValues] = useState({
    firstName: driver.firstName ?? '',
    lastName: driver.lastName ?? '',
    licenseNumber: driver.licenseNumber ?? '',
  });

  const [isDirty, setIsDirty] = useState(false);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Track changes
  useEffect(() => {
    const originalValues = {
      firstName: driver.firstName ?? '',
      lastName: driver.lastName ?? '',
      licenseNumber: driver.licenseNumber ?? '',
    };

    const hasChanges = Object.keys(formValues).some(
      (key) =>
        formValues[key as keyof typeof formValues] !==
        originalValues[key as keyof typeof originalValues]
    );
    setIsDirty(hasChanges);
  }, [formValues, driver]);

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
        router.push(`/drivers/${driver.id}`);
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
    router.push(`/drivers/${driver.id}`);
  };

  // Handle deactivate/reactivate
  const handleToggleActive = async () => {
    setIsDeactivating(true);
    try {
      if (driver.isActive) {
        await deactivateDriver(driver.id);
      } else {
        await reactivateDriver(driver.id);
      }
      router.refresh();
    } finally {
      setIsDeactivating(false);
    }
  };

  // Field errors from action state
  const fieldErrors =
    typeof actionState?.error === 'object' ? actionState.error : undefined;

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          href="/drivers"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Drivers
        </Link>

        <RecordHeader
          title={`${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || 'Unnamed Driver'}
          subtitle={driver.email}
          badge={
            <StatusBadge variant={mapStatusVariant(driverStatusVariant)}>
              {driverStatus}
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
                    form="driver-edit-form"
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
                  <Button
                    variant="outline"
                    onClick={handleToggleActive}
                    disabled={isDeactivating}
                  >
                    {isDeactivating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : driver.isActive ? (
                      <UserX className="h-4 w-4 mr-1.5" />
                    ) : (
                      <UserCheck className="h-4 w-4 mr-1.5" />
                    )}
                    {driver.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                  <Link href={`/drivers/${driver.id}/edit`}>
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
                {complianceAlerts.length > 0 ? (
                  complianceAlerts.map((alert) => (
                    <div
                      key={alert.type}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-foreground">{alert.label}</span>
                      {alert.days !== null ? (
                        <AlertBadge variant={getExpiryVariant(alert.days)}>
                          {formatExpiryMessage(alert.days)}
                        </AlertBadge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not set
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No compliance items tracked
                  </p>
                )}
              </div>
            </div>

            {/* Current Assignment */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Current Assignment
              </h4>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Available
                </span>
              </div>
            </div>

            {/* Documents Quick View */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Documents
              </h4>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">
                  {driver.documents?.length ?? 0} document(s)
                </span>
              </div>
            </div>
          </div>
        }
        railTitle="Summary"
      >
        {isEditMode ? (
          <EditContent
            driver={driver}
            formValues={formValues}
            fieldErrors={fieldErrors}
            onChange={handleChange}
            onSubmit={handleSubmit}
            isPending={isPending}
          />
        ) : (
          <ViewContent driver={driver} />
        )}
      </RecordLayout>

      {/* Audit trail */}
      {driver.createdAt && (
        <AuditTrailFooter
          createdAt={driver.createdAt}
          createdByName={
            driver.createdBy
              ? `${driver.createdBy.firstName ?? ''} ${driver.createdBy.lastName ?? ''}`.trim() ||
                null
              : null
          }
          createdByEmail={driver.createdBy?.email ?? null}
          updatedAt={driver.updatedAt ?? driver.createdAt}
          updatedByName={
            driver.updatedBy
              ? `${driver.updatedBy.firstName ?? ''} ${driver.updatedBy.lastName ?? ''}`.trim() ||
                null
              : null
          }
          updatedByEmail={driver.updatedBy?.email ?? null}
        />
      )}
    </div>
  );
}

// View mode content
function ViewContent({ driver }: { driver: DriverWithRelations }) {
  return (
    <>
      <RecordSection title="Personal Information">
        <RecordFieldGrid columns={2}>
          <RecordField label="First Name" value={driver.firstName} />
          <RecordField label="Last Name" value={driver.lastName} />
          <RecordField label="Email" value={driver.email} />
          <RecordField label="Phone" value={driver.phoneNumber} />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="License & Compliance">
        <RecordFieldGrid columns={2}>
          <RecordField label="License Number" value={driver.licenseNumber} mono />
          <RecordField
            label="License Expiration"
            value={formatDate(driver.licenseExpirationDate)}
          />
        </RecordFieldGrid>
      </RecordSection>

      <RecordSection title="System">
        <RecordFieldGrid columns={2}>
          <RecordField
            label="Dispatch Ready"
            value={driver.isDispatchReady ? 'Yes' : 'No'}
          />
          <RecordField
            label="Status"
            value={driver.isActive ? 'Active' : 'Deactivated'}
          />
        </RecordFieldGrid>
      </RecordSection>
    </>
  );
}

// Edit mode content
function EditContent({
  driver,
  formValues,
  fieldErrors,
  onChange,
  onSubmit,
  isPending,
}: {
  driver: DriverWithRelations;
  formValues: {
    firstName: string;
    lastName: string;
    licenseNumber: string;
  };
  fieldErrors: Record<string, string[] | undefined> | undefined;
  onChange: (field: keyof typeof formValues, value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}) {
  return (
    <form id="driver-edit-form" onSubmit={onSubmit} className="space-y-6">
      <RecordSection title="Personal Information">
        <div className="space-y-4">
          <FormRow>
            <FormField
              label="First Name"
              name="firstName"
              required
              error={fieldErrors?.firstName?.[0]}
            >
              <Input
                name="firstName"
                value={formValues.firstName}
                onChange={(e) => onChange('firstName', e.target.value)}
                disabled={isPending}
              />
            </FormField>
            <FormField
              label="Last Name"
              name="lastName"
              required
              error={fieldErrors?.lastName?.[0]}
            >
              <Input
                name="lastName"
                value={formValues.lastName}
                onChange={(e) => onChange('lastName', e.target.value)}
                disabled={isPending}
              />
            </FormField>
          </FormRow>

          {/* Email - read-only */}
          <FormField label="Email" name="email-display">
            <Input
              value={driver.email}
              readOnly
              className="bg-muted cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Email cannot be changed after creation
            </p>
          </FormField>
        </div>
      </RecordSection>

      <RecordSection title="License & Compliance">
        <div className="space-y-4">
          <FormField
            label="License Number"
            name="licenseNumber"
            error={fieldErrors?.licenseNumber?.[0]}
            helperText="CDL number (optional)"
          >
            <Input
              name="licenseNumber"
              value={formValues.licenseNumber}
              onChange={(e) => onChange('licenseNumber', e.target.value.toUpperCase())}
              disabled={isPending}
              className="uppercase font-mono"
            />
          </FormField>
        </div>
      </RecordSection>
    </form>
  );
}
