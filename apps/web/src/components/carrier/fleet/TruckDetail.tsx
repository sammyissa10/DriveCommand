'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Pencil,
  X,
  ArrowLeft,
  Save,
  Truck as TruckIcon,
  Image as ImageIcon,
  Trash2,
  AlertTriangle,
  Shield,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  RecordLayout,
  RecordSection,
  RecordField,
  RecordFieldGrid,
  RecordHeader,
  StatusBadge,
  getStatusVariant,
  AlertBadge,
  getExpiryVariant,
  formatExpiryMessage,
  FormField,
  FormRow,
} from '@/components/design-system';
import { TruckPhotoUploadModal } from './TruckPhotoUploadModal';
import type { CarrierTruckData } from './CarrierTruckForm';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TruckDetailProps {
  truck: CarrierTruckData & { photoS3Key?: string | null };
  dispatches?: DispatchRow[];
  audit?: {
    createdAt: Date;
    createdByName?: string | null;
    createdByEmail?: string | null;
    updatedAt: Date;
    updatedByName?: string | null;
    updatedByEmail?: string | null;
  } | null;
  initialMode?: 'view' | 'edit';
}

interface DispatchRow {
  id: string;
  scheduledDeparture?: Date | string | null;
  status: string;
  actualMiles?: number | null;
  plannedMiles?: number | null;
  primaryDriver?: {
    firstName: string | null;
    lastName: string | null;
  } | null;
}

type TruckStatus = 'active' | 'inactive' | 'maintenance' | 'out_of_service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRUCK_TYPE_LABELS: Record<string, string> = {
  semi: 'Semi',
  box_truck: 'Box Truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
  tanker: 'Tanker',
  day_cab: 'Day Cab',
  straight_truck: 'Straight Truck',
};

const STATUS_LABELS: Record<TruckStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  maintenance: 'In Maintenance',
  out_of_service: 'Out of Service',
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateInput(date: Date | string | null): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// TruckPhotoSection (same logic, extracted)
// ---------------------------------------------------------------------------

function TruckPhotoSection({
  truck,
  isEditing,
  onPhotoChange,
}: {
  truck: CarrierTruckData & { photoS3Key?: string | null };
  isEditing: boolean;
  onPhotoChange: () => void;
}) {
  const router = useRouter();
  const photoS3Key = truck.photoS3Key ?? null;

  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewUrlError, setViewUrlError] = useState(false);

  useEffect(() => {
    if (!photoS3Key) {
      setViewUrl(null);
      setViewUrlError(false);
      return;
    }
    setViewUrl(null);
    setViewUrlError(false);

    fetch(`/api/v1/carrier/fleet/trucks/${truck.id}/photo-view-url`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load photo URL');
        const data = (await res.json()) as { viewUrl: string };
        setViewUrl(data.viewUrl);
      })
      .catch(() => {
        setViewUrlError(true);
      });
  }, [truck.id, photoS3Key]);

  async function handleRemove() {
    try {
      const res = await fetch(`/api/v1/carrier/fleet/trucks/${truck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoS3Key: null }),
      });
      if (!res.ok) throw new Error('Failed to remove photo');
      toast.success('Photo removed');
      onPhotoChange();
      router.refresh();
    } catch {
      toast.error('Failed to remove photo');
    }
  }

  // Photo present + URL loaded
  if (photoS3Key && viewUrl) {
    return (
      <div className="space-y-3">
        <Image
          src={viewUrl}
          alt="Truck photo"
          width={400}
          height={192}
          className="h-48 w-full rounded-md border border-border object-cover"
          unoptimized
        />
        {isEditing && (
          <div className="flex items-center gap-2">
            <TruckPhotoUploadModal
              truckId={truck.id}
              hasExistingPhoto
              onSuccess={() => {
                onPhotoChange();
                router.refresh();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => void handleRemove()}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Remove
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Photo present but URL loading (skeleton)
  if (photoS3Key && !viewUrl && !viewUrlError) {
    return (
      <div className="h-48 w-full rounded-md bg-muted animate-pulse" />
    );
  }

  // No photo (or failed to load)
  return (
    <div className="space-y-3">
      <div className="h-48 w-full rounded-md border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-muted-foreground">
        <ImageIcon className="h-8 w-8 mb-2" />
        <p className="text-sm">No photo uploaded</p>
      </div>
      {isEditing && (
        <TruckPhotoUploadModal
          truckId={truck.id}
          hasExistingPhoto={false}
          onSuccess={() => {
            onPhotoChange();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComplianceSummary Rail Component
// ---------------------------------------------------------------------------

function ComplianceSummary({
  truck,
  assignedDriver,
}: {
  truck: CarrierTruckData;
  assignedDriver?: { firstName: string | null; lastName: string | null } | null;
}) {
  const regDays = daysUntil(truck.registrationExpiry);
  const licDays = daysUntil(truck.licenseExpiry);
  const insDays = daysUntil(truck.insuranceExpiry);

  const items = [
    { label: 'Registration', days: regDays, date: truck.registrationExpiry },
    { label: 'License', days: licDays, date: truck.licenseExpiry },
    { label: 'Insurance', days: insDays, date: truck.insuranceExpiry },
  ].filter((i) => i.date);

  const hasIssues = items.some((i) => i.days !== null && i.days < 30);

  return (
    <div className="space-y-4">
      {/* Compliance Health */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Shield className="h-3.5 w-3.5" />
          Compliance
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expiry dates set</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.label} className="space-y-0.5">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <AlertBadge
                  variant={getExpiryVariant(item.days)}
                  className="w-full justify-start"
                >
                  {formatExpiryMessage(item.days)}
                </AlertBadge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current Driver Assignment */}
      <div className="space-y-2 pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <TruckIcon className="h-3.5 w-3.5" />
          Current Driver
        </div>
        {assignedDriver ? (
          <p className="text-sm text-foreground">
            {assignedDriver.firstName} {assignedDriver.lastName}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No driver assigned</p>
        )}
      </div>

      {/* Status Summary */}
      {hasIssues && (
        <div className="pt-3 border-t border-border">
          <AlertBadge variant="warning" className="w-full justify-start">
            <AlertTriangle className="h-3.5 w-3.5" />
            Attention needed
          </AlertBadge>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TruckDetail({
  truck: initialTruck,
  dispatches = [],
  audit,
  initialMode = 'view',
}: TruckDetailProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [formData, setFormData] = useState<CarrierTruckData>(initialTruck);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingNavigation = useRef<string | null>(null);

  // Track changes
  useEffect(() => {
    const isChanged = JSON.stringify(formData) !== JSON.stringify(initialTruck);
    setIsDirty(isChanged);
  }, [formData, initialTruck]);

  // Handle field changes
  const handleChange = useCallback(
    (
      field: keyof CarrierTruckData,
      value: string | number | Date | null
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Save handler
  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/carrier/fleet/trucks/${initialTruck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save');
      }

      toast.success('Truck updated successfully');
      setMode('view');
      setIsDirty(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  // Cancel with unsaved changes check
  function handleCancel() {
    if (isDirty) {
      pendingNavigation.current = null;
      setShowUnsavedDialog(true);
    } else {
      setMode('view');
      setFormData(initialTruck);
    }
  }

  function handleDiscardChanges() {
    setFormData(initialTruck);
    setIsDirty(false);
    setMode('view');
    setShowUnsavedDialog(false);
    if (pendingNavigation.current) {
      router.push(pendingNavigation.current);
    }
  }

  // Photo change callback
  function handlePhotoChange() {
    // Photos are saved immediately, not part of form state
  }

  // Get assigned driver from latest dispatch
  const assignedDriver = dispatches[0]?.primaryDriver ?? null;

  return (
    <>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/carrier/fleet/trucks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fleet Trucks
        </Link>

        {/* Header */}
        <RecordHeader
          title={formData.unitNumber || 'Untitled Truck'}
          subtitle={formData.vin ?? undefined}
          badge={
            <StatusBadge variant={getStatusVariant(formData.status)}>
              {STATUS_LABELS[formData.status as TruckStatus] ?? formData.status}
            </StatusBadge>
          }
          actions={
            mode === 'view' ? (
              <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                {isDirty && (
                  <span className="text-xs text-muted-foreground">
                    Unsaved changes
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || !isDirty}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Save
                </Button>
              </div>
            )
          }
        />

        {/* Year/Make/Model subtitle */}
        {(formData.year || formData.make || formData.model) && (
          <p className="-mt-4 text-sm text-muted-foreground">
            {[formData.year, formData.make, formData.model].filter(Boolean).join(' ')}
          </p>
        )}

        {/* Main Layout */}
        <RecordLayout
          rail={
            <ComplianceSummary
              truck={formData}
              assignedDriver={assignedDriver}
            />
          }
          railTitle="Summary"
        >
          {/* Photo Section */}
          <RecordSection title="Photo">
            <TruckPhotoSection
              truck={{ ...formData, photoS3Key: initialTruck.photoS3Key }}
              isEditing={mode === 'edit'}
              onPhotoChange={handlePhotoChange}
            />
          </RecordSection>

          {/* Identity Section */}
          <RecordSection title="Identity">
            {mode === 'view' ? (
              <RecordFieldGrid columns={3}>
                <RecordField label="Unit Number" value={formData.unitNumber} />
                <RecordField label="Display Name" value={formData.displayName} />
                <RecordField label="Vehicle ID" value={formData.vehicleId} mono />
                <RecordField label="VIN" value={formData.vin} mono />
              </RecordFieldGrid>
            ) : (
              <div className="space-y-4">
                <FormRow columns={2}>
                  <FormField label="Unit Number" name="unitNumber" required>
                    <Input
                      id="unitNumber"
                      value={formData.unitNumber ?? ''}
                      onChange={(e) => handleChange('unitNumber', e.target.value)}
                      placeholder="e.g. T-101"
                    />
                  </FormField>
                  <FormField label="Display Name" name="displayName">
                    <Input
                      id="displayName"
                      value={formData.displayName ?? ''}
                      onChange={(e) => handleChange('displayName', e.target.value)}
                      placeholder="e.g. Blue Peterbilt"
                    />
                  </FormField>
                </FormRow>
                <FormRow columns={2}>
                  <FormField
                    label="VIN"
                    name="vin"
                    helperText="17-character Vehicle Identification Number"
                  >
                    <Input
                      id="vin"
                      value={formData.vin ?? ''}
                      onChange={(e) => handleChange('vin', e.target.value.toUpperCase())}
                      maxLength={17}
                      className="font-mono"
                      placeholder="1XKYD49X8XR123456"
                    />
                  </FormField>
                  <FormField label="Vehicle ID" name="vehicleId" helperText="Internal ID if different from unit">
                    <Input
                      id="vehicleId"
                      value={formData.vehicleId ?? ''}
                      onChange={(e) => handleChange('vehicleId', e.target.value)}
                      className="font-mono"
                    />
                  </FormField>
                </FormRow>
              </div>
            )}
          </RecordSection>

          {/* Vehicle Specs Section */}
          <RecordSection title="Vehicle Specs">
            {mode === 'view' ? (
              <RecordFieldGrid columns={4}>
                <RecordField label="Year" value={formData.year} />
                <RecordField label="Make" value={formData.make} />
                <RecordField label="Model" value={formData.model} />
                <RecordField
                  label="Type"
                  value={
                    <StatusBadge variant="info">
                      {TRUCK_TYPE_LABELS[formData.truckType] ?? formData.truckType}
                    </StatusBadge>
                  }
                />
              </RecordFieldGrid>
            ) : (
              <FormRow columns={4}>
                <FormField label="Year" name="year">
                  <Input
                    id="year"
                    type="number"
                    value={formData.year ?? ''}
                    onChange={(e) =>
                      handleChange(
                        'year',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    placeholder="2024"
                    min={1900}
                    max={2100}
                  />
                </FormField>
                <FormField label="Make" name="make">
                  <Input
                    id="make"
                    value={formData.make ?? ''}
                    onChange={(e) => handleChange('make', e.target.value)}
                    placeholder="Peterbilt"
                  />
                </FormField>
                <FormField label="Model" name="model">
                  <Input
                    id="model"
                    value={formData.model ?? ''}
                    onChange={(e) => handleChange('model', e.target.value)}
                    placeholder="579"
                  />
                </FormField>
                <FormField label="Type" name="truckType" required>
                  <Select
                    value={formData.truckType}
                    onValueChange={(v) => handleChange('truckType', v)}
                  >
                    <SelectTrigger id="truckType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRUCK_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </FormRow>
            )}
          </RecordSection>

          {/* Weight & Capacity Section */}
          <RecordSection title="Weight & Capacity">
            {mode === 'view' ? (
              <RecordFieldGrid columns={3}>
                <RecordField
                  label="GVWR"
                  value={
                    formData.grossWeightLbs != null
                      ? `${formData.grossWeightLbs.toLocaleString()} lbs`
                      : null
                  }
                />
                <RecordField
                  label="Payload Capacity"
                  value={
                    formData.payloadCapacityLbs != null
                      ? `${formData.payloadCapacityLbs.toLocaleString()} lbs`
                      : null
                  }
                />
                <RecordField
                  label="Odometer"
                  value={
                    formData.currentOdometerMiles != null
                      ? `${formData.currentOdometerMiles.toLocaleString()} mi`
                      : null
                  }
                />
              </RecordFieldGrid>
            ) : (
              <FormRow columns={3}>
                <FormField label="GVWR (lbs)" name="grossWeightLbs">
                  <Input
                    id="grossWeightLbs"
                    type="number"
                    value={formData.grossWeightLbs ?? ''}
                    onChange={(e) =>
                      handleChange(
                        'grossWeightLbs',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    placeholder="80000"
                  />
                </FormField>
                <FormField label="Payload Capacity (lbs)" name="payloadCapacityLbs">
                  <Input
                    id="payloadCapacityLbs"
                    type="number"
                    value={formData.payloadCapacityLbs ?? ''}
                    onChange={(e) =>
                      handleChange(
                        'payloadCapacityLbs',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    placeholder="45000"
                  />
                </FormField>
                <FormField label="Odometer (miles)" name="currentOdometerMiles">
                  <Input
                    id="currentOdometerMiles"
                    type="number"
                    value={formData.currentOdometerMiles ?? ''}
                    onChange={(e) =>
                      handleChange(
                        'currentOdometerMiles',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    placeholder="125000"
                  />
                </FormField>
              </FormRow>
            )}
          </RecordSection>

          {/* Registration & Compliance Section */}
          <RecordSection title="Registration & Compliance">
            {mode === 'view' ? (
              <RecordFieldGrid columns={3}>
                <RecordField label="License Plate" value={formData.licensePlate} />
                <RecordField label="License State" value={formData.licenseState} />
                <RecordField
                  label="Status"
                  value={
                    <StatusBadge variant={getStatusVariant(formData.status)}>
                      {STATUS_LABELS[formData.status as TruckStatus] ?? formData.status}
                    </StatusBadge>
                  }
                />
                <RecordField
                  label="Registration Expiry"
                  value={
                    formData.registrationExpiry ? (
                      <div className="space-y-0.5">
                        <span>{formatDate(formData.registrationExpiry)}</span>
                        <AlertBadge
                          variant={getExpiryVariant(daysUntil(formData.registrationExpiry))}
                          className="mt-1"
                        >
                          {formatExpiryMessage(daysUntil(formData.registrationExpiry))}
                        </AlertBadge>
                      </div>
                    ) : null
                  }
                />
                <RecordField
                  label="License Expiry"
                  value={
                    formData.licenseExpiry ? (
                      <div className="space-y-0.5">
                        <span>{formatDate(formData.licenseExpiry)}</span>
                        <AlertBadge
                          variant={getExpiryVariant(daysUntil(formData.licenseExpiry))}
                          className="mt-1"
                        >
                          {formatExpiryMessage(daysUntil(formData.licenseExpiry))}
                        </AlertBadge>
                      </div>
                    ) : null
                  }
                />
                <RecordField
                  label="Insurance Expiry"
                  value={
                    formData.insuranceExpiry ? (
                      <div className="space-y-0.5">
                        <span>{formatDate(formData.insuranceExpiry)}</span>
                        <AlertBadge
                          variant={getExpiryVariant(daysUntil(formData.insuranceExpiry))}
                          className="mt-1"
                        >
                          {formatExpiryMessage(daysUntil(formData.insuranceExpiry))}
                        </AlertBadge>
                      </div>
                    ) : null
                  }
                />
              </RecordFieldGrid>
            ) : (
              <div className="space-y-4">
                <FormRow columns={3}>
                  <FormField label="License Plate" name="licensePlate">
                    <Input
                      id="licensePlate"
                      value={formData.licensePlate ?? ''}
                      onChange={(e) => handleChange('licensePlate', e.target.value.toUpperCase())}
                      placeholder="ABC-1234"
                    />
                  </FormField>
                  <FormField label="License State" name="licenseState">
                    <Select
                      value={formData.licenseState ?? ''}
                      onValueChange={(v) => handleChange('licenseState', v || null)}
                    >
                      <SelectTrigger id="licenseState">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Status" name="status" required>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => handleChange('status', v)}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </FormRow>
                <FormRow columns={3}>
                  <FormField label="Registration Expiry" name="registrationExpiry">
                    <Input
                      id="registrationExpiry"
                      type="date"
                      value={formatDateInput(formData.registrationExpiry)}
                      onChange={(e) =>
                        handleChange(
                          'registrationExpiry',
                          e.target.value ? new Date(e.target.value) : null
                        )
                      }
                    />
                  </FormField>
                  <FormField label="License Expiry" name="licenseExpiry">
                    <Input
                      id="licenseExpiry"
                      type="date"
                      value={formatDateInput(formData.licenseExpiry)}
                      onChange={(e) =>
                        handleChange(
                          'licenseExpiry',
                          e.target.value ? new Date(e.target.value) : null
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Insurance Expiry" name="insuranceExpiry">
                    <Input
                      id="insuranceExpiry"
                      type="date"
                      value={formatDateInput(formData.insuranceExpiry)}
                      onChange={(e) =>
                        handleChange(
                          'insuranceExpiry',
                          e.target.value ? new Date(e.target.value) : null
                        )
                      }
                    />
                  </FormField>
                </FormRow>
              </div>
            )}
          </RecordSection>

          {/* Notes Section */}
          <RecordSection title="Notes">
            {mode === 'view' ? (
              formData.notes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {formData.notes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes</p>
              )
            ) : (
              <FormField label="Notes" name="notes">
                <Textarea
                  id="notes"
                  value={formData.notes ?? ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={4}
                  placeholder="Additional notes about this vehicle..."
                />
              </FormField>
            )}
          </RecordSection>

          {/* Dispatch History */}
          {dispatches.length > 0 && (
            <RecordSection title="Dispatch History">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Dispatch #
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Miles
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Driver
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dispatches.map((d) => {
                      const miles = d.actualMiles ?? d.plannedMiles;
                      return (
                        <tr
                          key={d.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-2 px-3">
                            <Link
                              href={`/carrier/dispatches/${d.id}`}
                              className="font-mono text-xs text-foreground hover:text-primary transition-colors"
                            >
                              {d.id.slice(0, 8).toUpperCase()}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {d.scheduledDeparture
                              ? new Date(d.scheduledDeparture).toLocaleDateString(
                                  'en-US',
                                  {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  }
                                )
                              : '—'}
                          </td>
                          <td className="py-2 px-3">
                            <StatusBadge variant={getStatusVariant(d.status)}>
                              {d.status
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, (c) => c.toUpperCase())}
                            </StatusBadge>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {miles != null
                              ? `${Number(miles).toLocaleString()} mi`
                              : '—'}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {d.primaryDriver
                              ? `${d.primaryDriver.firstName} ${d.primaryDriver.lastName}`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </RecordSection>
          )}

          {/* Audit Trail */}
          {audit && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {audit.createdAt && (
                  <span>
                    Created{' '}
                    {new Date(audit.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {audit.createdByName && ` by ${audit.createdByName}`}
                  </span>
                )}
                {audit.updatedAt && (
                  <span>
                    Updated{' '}
                    {new Date(audit.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {audit.updatedByName && ` by ${audit.updatedByName}`}
                  </span>
                )}
              </div>
            </div>
          )}
        </RecordLayout>
      </div>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
