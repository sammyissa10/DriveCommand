'use client';

import { useState, useTransition } from 'react';
import { CheckCircle } from 'lucide-react';

interface LoadStatusButtonProps {
  loadId: string;
  currentStatus: string;
  advanceAction: (loadId: string) => Promise<{ success?: boolean; error?: string; newStatus?: string }>;
}

const BUTTON_LABELS: Record<string, string> = {
  DISPATCHED: 'Mark Picked Up',
  PICKED_UP: 'Mark In Transit',
  IN_TRANSIT: 'Mark Delivered',
};

export function LoadStatusButton({ loadId, currentStatus, advanceAction }: LoadStatusButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buttonLabel = BUTTON_LABELS[currentStatus];

  // DELIVERED — no more actions, just show confirmation
  if (currentStatus === 'DELIVERED') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium text-base">Load Delivered</span>
      </div>
    );
  }

  // No button for statuses not in the progression map
  if (!buttonLabel) {
    return null;
  }

  function handleAdvance() {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await advanceAction(loadId);
      if (result.error) {
        setErrorMessage(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleAdvance}
        disabled={isPending}
        className="w-full sm:w-auto min-h-[44px] px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-base shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Updating...' : buttonLabel}
      </button>
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
