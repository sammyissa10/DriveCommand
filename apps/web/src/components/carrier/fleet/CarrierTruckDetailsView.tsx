'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CarrierTruckData } from './CarrierTruckForm';
import { TruckPhotoUploadModal } from './TruckPhotoUploadModal';

// ---------------------------------------------------------------------------
// Local extended type (CarrierTruckForm is not modified)
// ---------------------------------------------------------------------------

type TruckWithPhoto = CarrierTruckData & { photoS3Key?: string | null };

// ---------------------------------------------------------------------------
// Lookup tables
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

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  maintenance: 'border-amber-500 text-amber-600 dark:text-amber-400',
  out_of_service: 'border-red-500 text-red-600 dark:text-red-400',
};

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

// ---------------------------------------------------------------------------
// TruckPhotoSection
// ---------------------------------------------------------------------------

function TruckPhotoSection({ truck }: { truck: TruckWithPhoto }) {
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
        const data = await res.json() as { viewUrl: string };
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
          className="h-48 w-full max-w-md rounded-md border border-border object-cover"
          unoptimized
        />
        <div className="flex items-center gap-2">
          <TruckPhotoUploadModal
            truckId={truck.id}
            hasExistingPhoto
            onSuccess={() => router.refresh()}
          />
          <Button variant="outline" size="sm" type="button" onClick={() => void handleRemove()}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Remove Photo
          </Button>
        </div>
      </div>
    );
  }

  // Photo present but URL loading (skeleton)
  if (photoS3Key && !viewUrl && !viewUrlError) {
    return (
      <div className="h-48 w-full max-w-md rounded-md bg-muted animate-pulse" />
    );
  }

  // No photo (or failed to load)
  return (
    <div className="space-y-3">
      <div className="h-48 w-full max-w-md rounded-md border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-muted-foreground">
        <ImageIcon className="h-8 w-8 mb-2" />
        <p className="text-sm">No photo uploaded</p>
      </div>
      <TruckPhotoUploadModal
        truckId={truck.id}
        hasExistingPhoto={false}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CarrierTruckDetailsViewProps {
  truck: CarrierTruckData;
}

export function CarrierTruckDetailsView({ truck }: CarrierTruckDetailsViewProps) {
  const truckWithPhoto = truck as TruckWithPhoto;

  return (
    <div className="space-y-6">
      {/* Photo */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Photo
        </h3>
        <TruckPhotoSection truck={truckWithPhoto} />
      </div>

      {/* Identity */}
      <div className="space-y-3 pt-4 border-t border-border">
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
