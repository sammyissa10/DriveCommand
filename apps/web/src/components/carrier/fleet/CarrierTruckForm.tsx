'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { FormField, FormSection, FormRow } from '@/components/design-system';
import { cn } from '@/lib/utils';

export interface CarrierTruckData {
  id: string;
  vehicleId: string | null;
  displayName: string | null;
  unitNumber: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  truckType: string;
  grossWeightLbs: number | null;
  payloadCapacityLbs: number | null;
  currentOdometerMiles: number | null;
  licensePlate: string | null;
  licenseState: string | null;
  registrationExpiry: Date | string | null;
  licenseExpiry: Date | string | null;
  insuranceExpiry: Date | string | null;
  status: string;
  notes: string | null;
}

interface CarrierTruckFormProps {
  truck?: CarrierTruckData;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function toDateInputValue(val: Date | string | null | undefined): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// Map NHTSA Body Class to our truck type enum values
function mapBodyClassToTruckType(bodyClass: string): string | null {
  const bc = bodyClass.toLowerCase();
  if (bc.includes('tractor')) return 'day_cab';
  if (bc.includes('truck') && bc.includes('box')) return 'box_truck';
  if (bc.includes('truck') && bc.includes('flat')) return 'flatbed';
  if (bc.includes('truck')) return 'semi';
  return null;
}

// Parse GVWR string like "Class 8: 33,001 lb (14,970 kg) and over" → extract numeric lbs
function parseGvwr(gvwrStr: string): number | null {
  if (!gvwrStr) return null;
  // Try to find a number followed by "lb"
  const match = gvwrStr.match(/([\d,]+)\s*lb/i);
  if (match) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

interface NhtsaResult {
  Variable: string;
  Value: string | null;
  ValueId: string | null;
  ErrorCode: string | null;
}

export function CarrierTruckForm({ truck, onSuccess, onCancel }: CarrierTruckFormProps) {
  const router = useRouter();
  const isEdit = Boolean(truck?.id);

  const [values, setValues] = useState({
    unitNumber: truck?.unitNumber ?? '',
    displayName: truck?.displayName ?? '',
    vin: truck?.vin ?? '',
    year: truck?.year != null ? String(truck.year) : '',
    make: truck?.make ?? '',
    model: truck?.model ?? '',
    truckType: truck?.truckType ?? 'semi',
    grossWeightLbs: truck?.grossWeightLbs != null ? String(truck.grossWeightLbs) : '',
    payloadCapacityLbs: truck?.payloadCapacityLbs != null ? String(truck.payloadCapacityLbs) : '',
    currentOdometerMiles: truck?.currentOdometerMiles != null ? String(truck.currentOdometerMiles) : '',
    licensePlate: truck?.licensePlate ?? '',
    licenseState: truck?.licenseState ?? '',
    registrationExpiry: toDateInputValue(truck?.registrationExpiry),
    licenseExpiry: toDateInputValue(truck?.licenseExpiry),
    insuranceExpiry: toDateInputValue(truck?.insuranceExpiry),
    status: truck?.status ?? 'active',
    notes: truck?.notes ?? '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [showCompleteness, setShowCompleteness] = useState(true);

  // Calculate form completeness
  const completeness = useMemo(() => {
    const fields = [
      values.unitNumber,
      values.vin,
      values.year,
      values.make,
      values.model,
      values.truckType,
      values.grossWeightLbs,
      values.licensePlate,
      values.licenseState,
      values.registrationExpiry,
      values.insuranceExpiry,
    ];
    const filled = fields.filter((f) => f && String(f).trim() !== '').length;
    return Math.round((filled / fields.length) * 100);
  }, [values]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleVinLookup() {
    const vin = values.vin.trim();
    if (!vin || vin.length !== 17) {
      toast.error('Enter a valid 17-character VIN first');
      return;
    }

    setIsLookingUp(true);
    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`
      );
      if (!res.ok) throw new Error('NHTSA API request failed');

      const data = await res.json() as { Results: NhtsaResult[] };
      const results: NhtsaResult[] = data.Results ?? [];

      const get = (variable: string) =>
        results.find((r) => r.Variable === variable)?.Value ?? null;

      const make = get('Make');
      const model = get('Model');
      const yearStr = get('Model Year');
      const bodyClass = get('Body Class') ?? '';
      const gvwrStr = get('Gross Vehicle Weight Rating From') ?? '';
      const errorCode = get('Error Code') ?? '';

      // If error code is not "0" (success), consider it no-data
      if (errorCode && !errorCode.startsWith('0')) {
        toast.error('VIN not found — please enter details manually');
        return;
      }

      const updates: Partial<typeof values> = {};
      if (make && make !== 'Not Applicable') updates.make = make;
      if (model && model !== 'Not Applicable') updates.model = model;
      if (yearStr && yearStr !== 'Not Applicable') {
        const yr = parseInt(yearStr, 10);
        if (!isNaN(yr)) updates.year = String(yr);
      }
      const mappedType = mapBodyClassToTruckType(bodyClass);
      if (mappedType) updates.truckType = mappedType;
      const gvwr = parseGvwr(gvwrStr);
      if (gvwr) updates.grossWeightLbs = String(gvwr);

      if (Object.keys(updates).length === 0) {
        toast.error('VIN not found — please enter details manually');
        return;
      }

      setValues((prev) => ({ ...prev, ...updates }));
      toast.success('Vehicle details filled from VIN');
    } catch {
      toast.error('VIN lookup failed — please enter details manually');
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!values.unitNumber.trim()) {
      toast.error('Unit number is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        unitNumber: values.unitNumber.trim(),
        ...(values.displayName ? { displayName: values.displayName.trim() } : {}),
        ...(values.vin ? { vin: values.vin } : {}),
        ...(values.year ? { year: parseInt(values.year, 10) } : {}),
        ...(values.make ? { make: values.make } : {}),
        ...(values.model ? { model: values.model } : {}),
        truckType: values.truckType,
        ...(values.grossWeightLbs ? { grossWeightLbs: parseInt(values.grossWeightLbs, 10) } : {}),
        ...(values.payloadCapacityLbs
          ? { payloadCapacityLbs: parseInt(values.payloadCapacityLbs, 10) }
          : {}),
        ...(values.currentOdometerMiles
          ? { currentOdometerMiles: parseInt(values.currentOdometerMiles, 10) }
          : {}),
        ...(values.licensePlate ? { licensePlate: values.licensePlate } : {}),
        ...(values.licenseState ? { licenseState: values.licenseState } : {}),
        registrationExpiry: values.registrationExpiry || null,
        licenseExpiry: values.licenseExpiry || null,
        insuranceExpiry: values.insuranceExpiry || null,
        status: values.status,
        ...(values.notes ? { notes: values.notes } : {}),
      };

      const url = isEdit
        ? `/api/v1/carrier/fleet/trucks/${truck!.id}`
        : '/api/v1/carrier/fleet/trucks';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to save truck');
      }

      toast.success(isEdit ? 'Truck updated' : 'Truck created');
      if (isEdit) {
        if (onSuccess) {
          onSuccess();
        } else {
          router.refresh();
        }
      } else {
        router.refresh();
        router.push('/carrier/fleet/trucks');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Vehicle ID badge (edit mode only) */}
      {isEdit && truck?.vehicleId && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium">Vehicle ID</span>
          <Badge variant="secondary" className="font-mono">
            {truck.vehicleId}
          </Badge>
        </div>
      )}

      {/* Completeness indicator (optional, dismissible, sticky) */}
      {!isEdit && showCompleteness && completeness < 100 && (
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/80 border border-border sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">Profile completeness</span>
                <span className="text-sm text-muted-foreground">{completeness}%</span>
              </div>
              <Progress value={completeness} className="h-2" />
            </div>
            {completeness === 100 && (
              <CheckCircle className="h-5 w-5 text-status-success-foreground flex-shrink-0" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCompleteness(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Section 1: Identity */}
      <FormSection title="Identity" description="Basic vehicle identification">
        <FormRow>
          <FormField label="Unit Number" name="unitNumber" required>
            <Input
              id="unitNumber"
              name="unitNumber"
              value={values.unitNumber}
              onChange={handleChange}
              placeholder="TRK-001"
            />
          </FormField>
          <FormField
            label="Display Name"
            name="displayName"
            helperText="Optional friendly name (e.g. Big Red)"
          >
            <Input
              id="displayName"
              name="displayName"
              value={values.displayName}
              onChange={handleChange}
              placeholder="e.g. Big Red, Unit Alpha"
            />
          </FormField>
        </FormRow>

        <FormField
          label="VIN"
          name="vin"
          helperText="Enter 17-character VIN and click Lookup to auto-fill vehicle details"
        >
          <div className="flex gap-2">
            <Input
              id="vin"
              name="vin"
              value={values.vin}
              onChange={handleChange}
              placeholder="1HGBH41JXMN109186"
              className="font-mono flex-1 uppercase"
              maxLength={17}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleVinLookup}
              disabled={isLookingUp || values.vin.length !== 17}
              className="shrink-0"
            >
              {isLookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-1.5">{isLookingUp ? 'Looking up…' : 'Lookup'}</span>
            </Button>
          </div>
        </FormField>

        <FormRow columns={4}>
          <FormField label="Year" name="year">
            <Input
              id="year"
              name="year"
              type="number"
              min="1900"
              max="2099"
              value={values.year}
              onChange={handleChange}
              placeholder="2022"
            />
          </FormField>
          <FormField label="Make" name="make">
            <Input
              id="make"
              name="make"
              value={values.make}
              onChange={handleChange}
              placeholder="Kenworth"
            />
          </FormField>
          <FormField label="Model" name="model">
            <Input
              id="model"
              name="model"
              value={values.model}
              onChange={handleChange}
              placeholder="T680"
            />
          </FormField>
          <FormField label="Truck Type" name="truckType">
            <Select
              value={values.truckType}
              onValueChange={(val) => setValues((prev) => ({ ...prev, truckType: val }))}
            >
              <SelectTrigger id="truckType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semi">Semi</SelectItem>
                <SelectItem value="box_truck">Box Truck</SelectItem>
                <SelectItem value="flatbed">Flatbed</SelectItem>
                <SelectItem value="reefer">Reefer</SelectItem>
                <SelectItem value="tanker">Tanker</SelectItem>
                <SelectItem value="day_cab">Day Cab</SelectItem>
                <SelectItem value="straight_truck">Straight Truck</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </FormRow>
      </FormSection>

      {/* Section 2: Weight & Capacity */}
      <FormSection title="Weight & Capacity" divider>
        <FormRow columns={3}>
          <FormField label="GVWR (lbs)" name="grossWeightLbs" helperText="Gross Vehicle Weight Rating">
            <Input
              id="grossWeightLbs"
              name="grossWeightLbs"
              type="number"
              min="0"
              value={values.grossWeightLbs}
              onChange={handleChange}
              placeholder="80000"
            />
          </FormField>
          <FormField label="Payload Capacity (lbs)" name="payloadCapacityLbs">
            <Input
              id="payloadCapacityLbs"
              name="payloadCapacityLbs"
              type="number"
              min="0"
              value={values.payloadCapacityLbs}
              onChange={handleChange}
              placeholder="44000"
            />
          </FormField>
          <FormField label="Odometer (miles)" name="currentOdometerMiles">
            <Input
              id="currentOdometerMiles"
              name="currentOdometerMiles"
              type="number"
              min="0"
              value={values.currentOdometerMiles}
              onChange={handleChange}
              placeholder="125000"
            />
          </FormField>
        </FormRow>
      </FormSection>

      {/* Section 3: Registration & Compliance */}
      <FormSection title="Registration & Compliance" divider>
        <FormRow>
          <FormField label="License Plate" name="licensePlate">
            <Input
              id="licensePlate"
              name="licensePlate"
              value={values.licensePlate}
              onChange={handleChange}
              placeholder="ABC1234"
              className="uppercase"
            />
          </FormField>
          <FormField label="License State" name="licenseState">
            <Select
              value={values.licenseState || undefined}
              onValueChange={(val) => setValues((prev) => ({ ...prev, licenseState: val }))}
            >
              <SelectTrigger id="licenseState">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
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
              name="registrationExpiry"
              type="date"
              value={values.registrationExpiry}
              onChange={handleChange}
            />
          </FormField>
          <FormField label="License Expiry" name="licenseExpiry">
            <Input
              id="licenseExpiry"
              name="licenseExpiry"
              type="date"
              value={values.licenseExpiry}
              onChange={handleChange}
            />
          </FormField>
          <FormField label="Insurance Expiry" name="insuranceExpiry">
            <Input
              id="insuranceExpiry"
              name="insuranceExpiry"
              type="date"
              value={values.insuranceExpiry}
              onChange={handleChange}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Status" name="status">
            <Select
              value={values.status}
              onValueChange={(val) => setValues((prev) => ({ ...prev, status: val }))}
            >
              <SelectTrigger id="truckStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="out_of_service">Out of Service</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </FormRow>
      </FormSection>

      {/* Notes */}
      <FormField label="Notes" name="notes">
        <Textarea
          id="truckNotes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          placeholder="Additional notes about this truck..."
          rows={3}
        />
      </FormField>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (onCancel) {
              onCancel();
            } else {
              router.push('/carrier/fleet/trucks');
            }
          }}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Truck'}
        </Button>
      </div>
    </form>
  );
}
