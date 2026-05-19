'use client';

import { Badge } from '@/components/ui/badge';
import type { CarrierTruckData } from './CarrierTruckForm';

const TRUCK_TYPE_LABELS: Record<string, string> = {
  semi: 'Semi',
  box_truck: 'Box Truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
  tanker: 'Tanker',
  day_cab: 'Day Cab',
  straight_truck: 'Straight Truck',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  maintenance: 'border-amber-500 text-amber-600 dark:text-amber-400',
  out_of_service: 'border-red-500 text-red-600 dark:text-red-400',
};

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryColorClass(date: Date | string | null): string {
  const days = daysUntil(date);
  if (days === null) return 'text-muted-foreground';
  if (days < 30) return 'text-red-600 dark:text-red-400';
  if (days < 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function daysLabel(days: number | null, date: Date | string | null): string {
  if (!date || days === null) return '';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Expires today';
  return `${days} days remaining`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function ComplianceDate({ date }: { date: Date | string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(date);
  const cls = expiryColorClass(date);
  return (
    <div>
      <span className={`font-medium ${cls}`}>{formatDate(date)}</span>
      <p className={`text-xs ${cls}`}>{daysLabel(days, date)}</p>
    </div>
  );
}

interface CarrierTruckDetailsViewProps {
  truck: CarrierTruckData;
}

export function CarrierTruckDetailsView({ truck }: CarrierTruckDetailsViewProps) {
  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Identity
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Unit Number">{truck.unitNumber || '—'}</Field>
          <Field label="Display Name">{truck.displayName || '—'}</Field>
          {truck.vehicleId && (
            <Field label="Vehicle ID">
              <span className="font-mono">{truck.vehicleId}</span>
            </Field>
          )}
          <Field label="VIN">
            {truck.vin ? <span className="font-mono">{truck.vin}</span> : '—'}
          </Field>
        </div>
      </div>

      {/* Vehicle Specs */}
      <div className="space-y-3 pt-4 border-t border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Vehicle Specs
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Year">{truck.year ?? '—'}</Field>
          <Field label="Make">{truck.make || '—'}</Field>
          <Field label="Model">{truck.model || '—'}</Field>
          <Field label="Type">
            <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400">
              {TRUCK_TYPE_LABELS[truck.truckType] ?? truck.truckType}
            </Badge>
          </Field>
        </div>
      </div>

      {/* Weight & Capacity */}
      <div className="space-y-3 pt-4 border-t border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Weight &amp; Capacity
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="GVWR (lbs)">
            {truck.grossWeightLbs != null ? truck.grossWeightLbs.toLocaleString() : '—'}
          </Field>
          <Field label="Payload Capacity (lbs)">
            {truck.payloadCapacityLbs != null ? truck.payloadCapacityLbs.toLocaleString() : '—'}
          </Field>
          <Field label="Odometer (miles)">
            {truck.currentOdometerMiles != null
              ? truck.currentOdometerMiles.toLocaleString()
              : '—'}
          </Field>
        </div>
      </div>

      {/* Registration & Compliance */}
      <div className="space-y-3 pt-4 border-t border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Registration &amp; Compliance
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="License Plate">{truck.licensePlate || '—'}</Field>
          <Field label="License State">{truck.licenseState || '—'}</Field>
          <Field label="Status">
            <Badge
              variant="outline"
              className={STATUS_CLASSES[truck.status] ?? 'border-border text-muted-foreground'}
            >
              {truck.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          </Field>
          <Field label="Registration Expiry">
            <ComplianceDate date={truck.registrationExpiry} />
          </Field>
          <Field label="License Expiry">
            <ComplianceDate date={truck.licenseExpiry} />
          </Field>
          <Field label="Insurance Expiry">
            <ComplianceDate date={truck.insuranceExpiry} />
          </Field>
        </div>
      </div>

      {/* Notes */}
      {truck.notes && (
        <div className="space-y-3 pt-4 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Notes
          </h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{truck.notes}</p>
        </div>
      )}
    </div>
  );
}
