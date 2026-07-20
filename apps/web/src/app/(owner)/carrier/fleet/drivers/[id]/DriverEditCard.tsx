'use client';

import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * View/edit toggle wrapper for the driver detail form (TKT-0073).
 *
 * The driver detail page previously rendered the edit form always-open, so the
 * grid "View" action (and the driver-name link) dropped the user straight into
 * an editable form. This mirrors the truck detail pattern (CarrierTruckDetailClient):
 * default to a read-only state with an "Edit" button; open the form when the
 * button is pressed or the page is loaded with ?mode=edit (used by the grid
 * "Edit" quick action).
 *
 * The driver's read-only details are already shown in the cards above this one,
 * so view mode only needs to surface the Edit affordance.
 */
export function DriverEditCard({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'view' | 'edit'>(
    searchParams.get('mode') === 'edit' ? 'edit' : 'view'
  );

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {mode === 'edit' ? 'Edit Driver' : 'Driver Details'}
        </h2>
        {mode === 'view' ? (
          <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      {mode === 'edit' ? (
        <div className="mt-4">{children}</div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Review this driver&apos;s information above, or click Edit to make changes.
        </p>
      )}
    </div>
  );
}
