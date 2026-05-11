'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const US_FEDERAL_HOLIDAYS: string[] = [
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-10-12',
  '2026-11-11',
  '2026-11-26',
  '2026-12-25',
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-05-31',
  '2027-06-18',
  '2027-07-05',
  '2027-09-06',
  '2027-10-11',
  '2027-11-11',
  '2027-11-25',
  '2027-12-24',
];

const HOLIDAY_NAMES: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'MLK Day',
  '2026-02-16': "Presidents' Day",
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-10-12': 'Columbus Day',
  '2026-11-11': "Veterans Day",
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day",
  '2027-01-18': 'MLK Day',
  '2027-02-15': "Presidents' Day",
  '2027-05-31': 'Memorial Day',
  '2027-06-18': 'Juneteenth (observed)',
  '2027-07-05': 'Independence Day (observed)',
  '2027-09-06': 'Labor Day',
  '2027-10-11': 'Columbus Day',
  '2027-11-11': "Veterans Day",
  '2027-11-25': 'Thanksgiving',
  '2027-12-24': 'Christmas Day (observed)',
};

interface AssignDriverModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loadId: string;
  load: {
    hazmat: boolean;
    referenceNumber: string | null;
    rateAmount: number | null;
    createdAt: string;
  };
  drivers: { id: string; firstName: string; lastName: string; status?: string }[];
  onAssigned: (a: SerializedAssignment) => void;
}

export function AssignDriverModal({
  open,
  onOpenChange,
  loadId,
  load,
  drivers,
  onAssigned,
}: AssignDriverModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'MAIN_DRIVER' | 'CO_DRIVER' | null>(null);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateKey = new Date(load.createdAt).toISOString().slice(0, 10);
  const isHoliday = US_FEDERAL_HOLIDAYS.includes(dateKey);
  const holidayName = HOLIDAY_NAMES[dateKey] ?? 'a federal holiday';

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  const filteredDrivers = drivers.filter((d) => {
    const name = `${d.firstName} ${d.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function handleClose() {
    onOpenChange(false);
    setStep(1);
    setSelectedDriverId(null);
    setSelectedRole(null);
    setSearch('');
    setError(null);
  }

  async function handleAssign() {
    if (!selectedDriverId || !selectedRole) return;
    setIsSubmitting(true);
    setError(null);

    const result = await createAssignment(loadId, {
      driverId: selectedDriverId,
      driverRole: selectedRole,
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.data) {
      const driverName = selectedDriver
        ? `${selectedDriver.firstName} ${selectedDriver.lastName}`
        : 'Driver';
      toast.success(`${driverName} assigned to this load.`);

      // Build a partial SerializedAssignment for optimistic update
      const partial: SerializedAssignment = {
        id: result.data.id,
        tenantId: '',
        loadId,
        driverId: selectedDriverId,
        driverRole: selectedRole,
        templateId: null,
        payType: '',
        baseRate: '0',
        rateUnit: '',
        currency: 'USD',
        loadedMilesOnly: false,
        fuelSurchargeRate: null,
        perDiemEnabled: false,
        perDiemRate: null,
        estimatedMiles: null,
        overrideReason: null,
        payStatus: 'DRAFT',
        createdAt: new Date().toISOString(),
        deletedAt: null,
        driver: {
          id: selectedDriverId,
          firstName: selectedDriver?.firstName ?? '',
          lastName: selectedDriver?.lastName ?? '',
        },
        template: null,
      };

      onAssigned(partial);
      handleClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && 'Select Driver'}
            {step === 2 && 'Select Role'}
            {step === 3 && 'Confirm Assignment'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Driver picker */}
        {step === 1 && (
          <div className="space-y-3">
            <Input
              placeholder="Search drivers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredDrivers.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No drivers found.</p>
              )}
              {filteredDrivers.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setSelectedDriverId(d.id);
                    setStep(2);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm font-medium"
                >
                  {d.firstName} {d.lastName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Role selector */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Assigning:{' '}
              <span className="font-medium text-foreground">
                {selectedDriver?.firstName} {selectedDriver?.lastName}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedRole('MAIN_DRIVER')}
                className={`p-4 rounded-lg border-2 text-center transition-colors ${
                  selectedRole === 'MAIN_DRIVER'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-medium text-sm">Main Driver</p>
                <p className="text-xs text-muted-foreground mt-1">Primary driver for this load</p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole('CO_DRIVER')}
                className={`p-4 rounded-lg border-2 text-center transition-colors ${
                  selectedRole === 'CO_DRIVER'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-medium text-sm">Co-Driver</p>
                <p className="text-xs text-muted-foreground mt-1">Secondary driver for this load</p>
              </button>
            </div>
            <DialogFooter className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!selectedRole} onClick={() => selectedRole && setStep(3)}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Confirm + smart hints */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm">
              Ready to assign{' '}
              <span className="font-medium">
                {selectedDriver?.firstName} {selectedDriver?.lastName}
              </span>{' '}
              as{' '}
              <span className="font-medium">
                {selectedRole === 'MAIN_DRIVER' ? 'Main Driver' : 'Co-Driver'}
              </span>{' '}
              to this load.
            </p>

            {/* Hazmat hint */}
            {load.hazmat && (
              <div className="rounded-md px-3 py-2 text-sm text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                <p className="font-medium">Hazmat load</p>
                <p className="mt-0.5 text-xs">
                  This load is marked hazmat. Standard pay doesn&apos;t include a hazmat premium.
                  Note: hazmat premium must be applied as an override after assigning.
                </p>
              </div>
            )}

            {/* Holiday hint */}
            {isHoliday && (
              <div className="rounded-md px-3 py-2 text-sm text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                <p className="font-medium">Federal holiday</p>
                <p className="mt-0.5 text-xs">
                  This load was created on {holidayName}. Standard rates apply — apply a holiday
                  multiplier as an override after assigning if needed.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <DialogFooter className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button disabled={isSubmitting} onClick={handleAssign}>
                {isSubmitting ? 'Assigning...' : 'Assign Driver'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
