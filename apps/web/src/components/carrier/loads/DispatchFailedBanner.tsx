'use client';

import { useState } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, X } from 'lucide-react';

export function DispatchFailedBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [dismissed, setDismissed] = useState(false);

  const reason = searchParams.get('dispatch_failed');

  if (!reason || dismissed) return null;

  const driverName = searchParams.get('driver') || '';

  const message =
    reason === 'other'
      ? "This load isn't on a trip yet - the trip couldn't be started. You can add it to a trip later using Add to Trip."
      : `This load isn't on a trip yet - ${driverName || 'the selected driver'} wasn't dispatch-ready when you tried to start it. Complete their onboarding checklist, then use Add to Trip.`;

  function handleDismiss() {
    setDismissed(true);
    const params = new URLSearchParams(searchParams);
    params.delete('dispatch_failed');
    params.delete('driver');
    router.replace(pathname + (params.toString() ? `?${params}` : ''));
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
