'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { DispatchLoadModal } from './DispatchLoadModal';

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
  loadStatus: string;
  dispatchId: string | null | undefined;
  dispatchNumber: string | null | undefined;
  drivers: DriverOption[];
  trucks: TruckOption[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadDetailActions({
  loadId,
  loadStatus,
  dispatchId,
  dispatchNumber,
  drivers,
  trucks,
}: LoadDetailActionsProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  // Load already has a dispatch — show badge/link
  if (dispatchId) {
    return (
      <Link
        href={`/carrier/dispatches/${dispatchId}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors shrink-0"
      >
        <Truck className="h-3.5 w-3.5" />
        {dispatchNumber ? `Dispatched on ${dispatchNumber}` : 'View Dispatch'}
      </Link>
    );
  }

  // Only show the dispatch button for pending loads without a dispatch
  if (loadStatus !== 'pending') {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
      >
        <Truck className="h-4 w-4" />
        Dispatch This Load
      </button>

      <DispatchLoadModal
        loadId={loadId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={(_dispatchId, _dispatchNumber) => {
          setModalOpen(false);
          router.refresh();
        }}
        drivers={drivers}
        trucks={trucks}
      />
    </>
  );
}
