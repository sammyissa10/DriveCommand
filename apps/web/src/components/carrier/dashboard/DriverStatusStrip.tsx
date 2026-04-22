'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriverStatus {
  id: string;
  firstName: string;
  lastName: string;
  hosStatus: 'DRIVING' | 'ON_DUTY' | 'OFF_DUTY' | 'SLEEPER_BERTH' | null;
  dispatchId: string | null;
  dispatchNumber: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusDotClass(
  hosStatus: DriverStatus['hosStatus'],
  hasDispatch: boolean
): string {
  if (hosStatus === 'DRIVING' || hosStatus === 'ON_DUTY') {
    return 'bg-green-500';
  }
  if (hasDispatch) {
    return 'bg-blue-500';
  }
  return 'bg-muted-foreground/30';
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DriverStatusStrip() {
  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/dashboard/drivers-status')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => setDrivers(Array.isArray(json) ? json : []))
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Driver Status</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 rounded-full h-12 w-24 bg-muted animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-2">Driver Status</h2>
        <p className="text-xs text-muted-foreground">No active drivers.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Driver Status</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {drivers.map((driver) => {
          const dotClass = getStatusDotClass(driver.hosStatus, !!driver.dispatchId);
          const chipContent = (
            <div className="rounded-full bg-card border border-border px-3 py-2 flex items-center gap-2 flex-shrink-0 hover:bg-accent transition-colors">
              {/* Initials circle */}
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {getInitials(driver.firstName, driver.lastName)}
              </div>
              {/* Name + dispatch */}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground whitespace-nowrap">
                  {driver.firstName}
                </p>
                {driver.dispatchNumber && (
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {driver.dispatchNumber}
                  </p>
                )}
              </div>
              {/* Status dot */}
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dotClass}`} />
            </div>
          );

          return driver.dispatchId ? (
            <Link
              key={driver.id}
              href={`/carrier/dispatches/${driver.dispatchId}`}
              aria-label={`${driver.firstName} ${driver.lastName} — view dispatch`}
            >
              {chipContent}
            </Link>
          ) : (
            <div key={driver.id}>{chipContent}</div>
          );
        })}
      </div>
    </div>
  );
}
