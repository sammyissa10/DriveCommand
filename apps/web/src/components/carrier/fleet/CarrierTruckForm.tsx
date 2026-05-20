'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

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

      {/* Basic info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="unitNumber">
            Unit Number <span className="text-destructive">*</span>
          </label>
          <Input
            id="unitNumber"
            name="unitNumber"
            value={values.unitNumber}
            onChange={handleChange}
            placeholder="TRK-001"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="displayName">
            Display Name
          </label>
          <Input
            id="displayName"
            name="displayName"
            value={values.displayName}
            onChange={handleChange}
            placeholder="e.g. Big Red, Unit Alpha, Truck 7"
          />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <label className="text-sm font-medium text-foreground" htmlFor="vin">
            VIN
          </label>
          <div className="flex gap-2">
            <Input
              id="vin"
              name="vin"
              value={values.vin}
              onChange={handleChange}
              placeholder="1HGBH41JXMN109186"
              className="font-mono flex-1"
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
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="year">
            Year
          </label>
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
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="make">
            Make
          </label>
          <Input
            id="make"
            name="make"
            value={values.make}
            onChange={handleChange}
            placeholder="Kenworth"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="model">
            Model
          </label>
          <Input
            id="model"
            name="model"
            value={values.model}
            onChange={handleChange}
            placeholder="T680"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="truckType">
            Truck Type
          </label>
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
        </div>
      </div>

      {/* Weight & capacity */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Weight &amp; Capacity
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="grossWeightLbs">
              GVWR (lbs)
            </label>
            <Input
              id="grossWeightLbs"
              name="grossWeightLbs"
              type="number"
              min="0"
              value={values.grossWeightLbs}
              onChange={handleChange}
              placeholder="80000"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="payloadCapacityLbs">
              Payload Capacity (lbs)
            </label>
            <Input
              id="payloadCapacityLbs"
              name="payloadCapacityLbs"
              type="number"
              min="0"
              value={values.payloadCapacityLbs}
              onChange={handleChange}
              placeholder="44000"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="currentOdometerMiles">
              Odometer (miles)
            </label>
            <Input
              id="currentOdometerMiles"
              name="currentOdometerMiles"
              type="number"
              min="0"
              value={values.currentOdometerMiles}
              onChange={handleChange}
              placeholder="125000"
            />
          </div>
        </div>
      </div>

      {/* Registration & compliance */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Registration &amp; Compliance
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="licensePlate">
              License Plate
            </label>
            <Input
              id="licensePlate"
              name="licensePlate"
              value={values.licensePlate}
              onChange={handleChange}
              placeholder="ABC1234"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="licenseState">
              License State
            </label>
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
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="registrationExpiry">
              Registration Expiry
            </label>
            <Input
              id="registrationExpiry"
              name="registrationExpiry"
              type="date"
              value={values.registrationExpiry}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="licenseExpiry">
              License Expiry
            </label>
            <Input
              id="licenseExpiry"
              name="licenseExpiry"
              type="date"
              value={values.licenseExpiry}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="insuranceExpiry">
              Insurance Expiry
            </label>
            <Input
              id="insuranceExpiry"
              name="insuranceExpiry"
              type="date"
              value={values.insuranceExpiry}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="truckStatus">
              Status
            </label>
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
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="truckNotes">
          Notes
        </label>
        <Textarea
          id="truckNotes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          placeholder="Additional notes about this truck..."
          rows={3}
        />
      </div>

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
