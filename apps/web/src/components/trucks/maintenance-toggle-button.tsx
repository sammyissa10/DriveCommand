'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import { toggleTruckMaintenance } from '@/app/(owner)/actions/trucks';

interface MaintenanceToggleButtonProps {
  truckId: string;
  inMaintenance: boolean;
}

export function MaintenanceToggleButton({ truckId, inMaintenance }: MaintenanceToggleButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await toggleTruckMaintenance(truckId, !inMaintenance);
      router.refresh();
    });
  }

  if (inMaintenance) {
    return (
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Mark Available
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wrench className="h-4 w-4" />
      )}
      Put in Maintenance
    </button>
  );
}
