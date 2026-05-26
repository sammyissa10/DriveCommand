'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, XCircle } from 'lucide-react';
import { DispatchLoadModal } from './DispatchLoadModal';
import { CancelLoadModal } from './CancelLoadModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriverOption {
  id: string;
  name: string;
  status: string;
}

interface TruckOption {
  id: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
}

interface LoadDetailActionsProps {
  loadId: string;
  loadRefNumber: string;
  loadStatus: string;
  dispatchId: string | null | undefined;
  dispatchNumber: string | null | undefined;
  pendingStopCount: number;
  drivers: DriverOption[];
  trucks: TruckOption[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadDetailActions({
  loadId,
  loadRefNumber,
  loadStatus,
  dispatchId,
  dispatchNumber,
  pendingStopCount,
  drivers,
  trucks,
}: LoadDetailActionsProps) {
  const router = useRouter();
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // Load is already cancelled — no actions
  if (loadStatus === 'cancelled') {
    return null;
  }

  // Load already has a dispatch — show badge/link + cancel button
  if (dispatchId) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/carrier/dispatches/${dispatchId}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors shrink-0"
        >
          <Truck className="h-3.5 w-3.5" />
          {dispatchNumber ? `On Trip ${dispatchNumber}` : 'View Trip'}
        </Link>

        {loadStatus === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Load
            </button>

            <CancelLoadModal
              open={cancelModalOpen}
              onOpenChange={setCancelModalOpen}
              loadId={loadId}
              loadRefNumber={loadRefNumber}
              dispatchId={dispatchId}
              pendingStopCount={pendingStopCount}
            />
          </>
        )}
      </div>
    );
  }

  // Only show the dispatch button for pending loads without a dispatch
  if (loadStatus !== 'pending') {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => setDispatchModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
      >
        <Truck className="h-4 w-4" />
        Add to Trip
      </button>

      <button
        type="button"
        onClick={() => setCancelModalOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors shrink-0"
      >
        <XCircle className="h-3.5 w-3.5" />
        Cancel Load
      </button>

      <DispatchLoadModal
        loadId={loadId}
        open={dispatchModalOpen}
        onOpenChange={setDispatchModalOpen}
        onSuccess={(_dispatchId, _dispatchNumber) => {
          setDispatchModalOpen(false);
          router.refresh();
        }}
        drivers={drivers}
        trucks={trucks}
      />

      <CancelLoadModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        loadId={loadId}
        loadRefNumber={loadRefNumber}
        dispatchId={null}
        pendingStopCount={0}
      />
    </div>
  );
}
