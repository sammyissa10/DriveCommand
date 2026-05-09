'use client';

import { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface SampleDataBannerProps {
  tenantId: string;
}

export function SampleDataBanner({ tenantId }: SampleDataBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = `sample-banner-dismissed-${tenantId}`;
    if (sessionStorage.getItem(key)) {
      setDismissed(true);
    }
  }, [tenantId]);

  if (dismissed) return null;

  function handleDismiss() {
    sessionStorage.setItem(`sample-banner-dismissed-${tenantId}`, '1');
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <Info className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        These are sample records to help you explore. Add your own to get started.
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
