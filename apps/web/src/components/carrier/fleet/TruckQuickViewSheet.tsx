'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';

// ---------------------------------------------------------------------------
// CarrierTruckItem type (previously imported from CarrierTruckList, now inline)
// ---------------------------------------------------------------------------

export interface CarrierTruckItem {
  id: string;
  vehicleId: string;
  displayName: string | null;
  unitNumber: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  truckType: string;
  currentOdometerMiles: number | null;
  registrationExpiry: Date | string | null;
  licenseExpiry: Date | string | null;
  status: string;
  isSample: boolean;
  photoS3Key: string | null;
  insuranceExpiry: Date | string | null;
  licensePlate: string | null;
  licenseState: string | null;
  assignedDriver: { id: string; firstName: string; lastName: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers (self-contained copies)
// ---------------------------------------------------------------------------

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryColor(date: Date | string | null): string {
  const days = daysUntil(date);
  if (days === null) return 'text-muted-foreground';
  if (days < 30) return 'text-red-600 dark:text-red-400';
  if (days < 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatExpiryLabel(date: Date | string | null): string {
  const days = daysUntil(date);
  if (days === null) return '—';
  if (days < 0) return `${formatDate(date)} (${Math.abs(days)}d overdue)`;
  if (days === 0) return `${formatDate(date)} (expires today)`;
  return `${formatDate(date)} (${days}d remaining)`;
}

// ---------------------------------------------------------------------------
// Badge maps (shared with list, but kept self-contained)
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

const TRUCK_TYPE_BADGE_CLASSES: Record<string, string> = {
  semi: 'border-blue-500 text-blue-600 dark:text-blue-400',
  box_truck: 'border-orange-500 text-orange-600 dark:text-orange-400',
  flatbed: 'border-amber-500 text-amber-600 dark:text-amber-400',
  reefer: 'border-cyan-500 text-cyan-600 dark:text-cyan-400',
  tanker: 'border-purple-500 text-purple-600 dark:text-purple-400',
  day_cab: 'border-green-500 text-green-600 dark:text-green-400',
  straight_truck: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  maintenance: 'border-amber-500 text-amber-600 dark:text-amber-400',
  out_of_service: 'border-red-500 text-red-600 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Field label helper
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TruckQuickViewSheetProps {
  truck: CarrierTruckItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TruckQuickViewSheet({ truck, open, onOpenChange }: TruckQuickViewSheetProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Fetch signed photo URL whenever the sheet opens for a truck that has a photo
  useEffect(() => {
    if (!open || !truck?.id || !truck?.photoS3Key) {
      setPhotoUrl(null);
      return;
    }

    let cancelled = false;

    fetch(`/api/v1/carrier/fleet/trucks/${truck.id}/photo-view-url`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch photo URL');
        return res.json() as Promise<{ viewUrl: string }>;
      })
      .then((data) => {
        if (!cancelled) setPhotoUrl(data.viewUrl);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, truck?.id, truck?.photoS3Key]);

  // Reset photo when sheet closes
  useEffect(() => {
    if (!open) setPhotoUrl(null);
  }, [open]);

  const t = truck;
  const statusLabel = t.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const licensePlateDisplay = t.licensePlate
    ? `${t.licensePlate}${t.licenseState ? ` (${t.licenseState})` : ''}`
    : '—';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full max-w-sm p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>Truck Details</SheetTitle>
          <SheetDescription>Quick summary — click below to view or edit in full.</SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Photo + unit number + status */}
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <img
                src={photoUrl}
                className="h-20 w-20 rounded-md object-cover border border-border flex-shrink-0"
                alt="Truck photo"
              />
            ) : (
              <div className="h-20 w-20 rounded-md bg-muted border border-border flex items-center justify-center flex-shrink-0">
                <Truck className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground truncate">
                {t.displayName || t.unitNumber}
              </p>
              {t.displayName && t.displayName !== t.unitNumber && (
                <p className="text-xs text-muted-foreground">{t.unitNumber}</p>
              )}
              <Badge
                variant="outline"
                className={`mt-1 ${STATUS_CLASSES[t.status] ?? 'border-border text-muted-foreground'}`}
              >
                {statusLabel}
              </Badge>
            </div>
          </div>

          {/* Truck type */}
          <div>
            <FieldLabel>Type</FieldLabel>
            <Badge
              variant="outline"
              className={TRUCK_TYPE_BADGE_CLASSES[t.truckType] ?? 'border-border text-muted-foreground'}
            >
              {TRUCK_TYPE_LABELS[t.truckType] ?? t.truckType}
            </Badge>
          </div>

          {/* Make / Model / Year */}
          <div>
            <FieldLabel>Make / Model / Year</FieldLabel>
            <p className="text-sm text-muted-foreground">
              {[t.year, t.make, t.model].filter(Boolean).join(' ') || '—'}
            </p>
          </div>

          {/* Assigned driver */}
          <div>
            <FieldLabel>Assigned Driver</FieldLabel>
            {t.assignedDriver ? (
              <Link
                href={`/carrier/drivers/${t.assignedDriver.id}`}
                className="text-sm text-primary hover:underline"
              >
                {t.assignedDriver.firstName} {t.assignedDriver.lastName}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Unassigned</p>
            )}
          </div>

          {/* VIN */}
          <div>
            <FieldLabel>VIN</FieldLabel>
            <p className="text-xs font-mono text-foreground">{t.vin ?? '—'}</p>
          </div>

          {/* License plate */}
          <div>
            <FieldLabel>License Plate</FieldLabel>
            <p className="text-sm text-foreground">{licensePlateDisplay}</p>
          </div>

          {/* Registration expiry */}
          <div>
            <FieldLabel>Registration Expiry</FieldLabel>
            <p className={`text-sm font-medium ${expiryColor(t.registrationExpiry)}`}>
              {formatExpiryLabel(t.registrationExpiry)}
            </p>
          </div>

          {/* License expiry */}
          <div>
            <FieldLabel>License Expiry</FieldLabel>
            <p className={`text-sm font-medium ${expiryColor(t.licenseExpiry)}`}>
              {formatExpiryLabel(t.licenseExpiry)}
            </p>
          </div>

          {/* Insurance expiry */}
          <div>
            <FieldLabel>Insurance Expiry</FieldLabel>
            <p className={`text-sm font-medium ${expiryColor(t.insuranceExpiry)}`}>
              {formatExpiryLabel(t.insuranceExpiry)}
            </p>
          </div>
        </div>

        {/* Footer CTAs */}
        <SheetFooter className="px-6 py-4 border-t border-border gap-2 sm:gap-2">
          <Button variant="outline" asChild className="flex-1">
            <Link href={`/carrier/fleet/trucks/${t.id}`}>View Full Details</Link>
          </Button>
          <Button variant="default" asChild className="flex-1">
            <Link href={`/carrier/fleet/trucks/${t.id}?mode=edit`}>Edit</Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
