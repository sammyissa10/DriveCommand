'use client';

/**
 * Loads the stop ladder on demand and hands it to `StopResolutionList`.
 *
 * Separate from the list so the list stays a pure render of a view it is given
 * — which is what makes it the same component the mobile surface can be built
 * against, and what keeps the fetch out of a component that also renders
 * buttons that write.
 *
 * The GET is read-only on the server (`getStopResolution` loads, decides and
 * describes; every write in the phase lives behind a POST), so opening this
 * panel cannot commit anything. That is the property Phase 3's quick-508
 * bought and it is not given back here.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { StopResolutionView } from '@/lib/document-import/facility-lookup';
import { StopResolutionList } from './StopResolutionList';

export function StopResolutionPanel({ importId }: { importId: string }) {
  const [view, setView] = useState<StopResolutionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/v1/carrier/document-imports/${importId}/stops`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Could not load the stops.');
        if (live) setView(json.data as StopResolutionView);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the stops.');
      }
    })();
    return () => {
      live = false;
    };
  }, [importId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  if (!view) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Matching stops to your facilities…
      </p>
    );
  }

  return <StopResolutionList importId={importId} view={view} onChange={setView} />;
}
