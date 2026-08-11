'use client';

/**
 * The optimisation card (spec Section 9, Part B).
 *
 * ```
 *  +---------------------------------------------+
 *  | Suggested order saves 18 miles and 34 min   |
 *  |                                             |
 *  | [ Keep current order ]  [ Use suggested ]   |
 *  +---------------------------------------------+
 * ```
 *
 * ---------------------------------------------------------------------------
 * WHEN THIS RENDERS NOTHING, THAT IS THE FEATURE
 * ---------------------------------------------------------------------------
 * Section 9: *"Below a configurable floor, do not offer it at all — noise erodes
 * trust."* The floor lives in `optimisation-constants.ts` and is applied on the
 * server; this component compares nothing to a number and has no threshold in
 * it. It draws a card when the server says `offered`, and returns null
 * otherwise — including when the saving exists but is small, when the order is
 * already the best one, and when the stops have not changed since the template
 * that was applied.
 *
 * "Keep current order" writes nothing, deliberately. Declining a suggestion is
 * the absence of a request, not a request; it dismisses the card for this visit
 * and the sequence a person set stays exactly as it was. The only endpoint is
 * apply, and even that recomputes the suggestion server-side rather than sending
 * an order up from here.
 *
 * The sentence is ONE string from `optimisation-copy.ts`, not four JSX children
 * around two counts. See that file — the same shape rendered "4 stopswill" on
 * screen twice before quick-517.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OptimisationView } from '@/lib/document-import/optimisation-service';
import {
  KEEP_CURRENT_ORDER_LABEL,
  USE_SUGGESTED_ORDER_LABEL,
} from '@/lib/document-import/optimisation-copy';

interface Props {
  importId: string;
  /** Called after the order was applied, so the stop list re-reads itself. */
  onApplied: () => void;
}

export function OptimisationSuggestion({ importId, onApplied }: Props) {
  const [view, setView] = useState<OptimisationView | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/carrier/document-imports/${importId}/optimisation`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? 'Could not check the order.');
    return json.data as OptimisationView;
  }, [importId]);

  useEffect(() => {
    let live = true;
    load()
      .then((v) => {
        if (live) setView(v);
      })
      // Silent: a routing engine that is unavailable must not put an error on a
      // screen the dispatcher did not ask a question on. No suggestion is the
      // correct degraded state.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/optimisation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not apply that order.');
      setDismissed(true);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that order.');
    } finally {
      setBusy(false);
    }
  }

  if (dismissed) return null;
  if (!view?.offered || !view.sentence) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* One string. See the header. */}
        {view.sentence}
      </p>
      <p className="mt-1 pl-6 text-xs text-muted-foreground">
        Pickups still come before their deliveries, firm appointments keep their order, and the end
        stop stays last.
      </p>

      {error ? <p className="mt-2 pl-6 text-sm text-destructive">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        <Button className="min-h-[44px]" disabled={busy} onClick={() => void apply()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {USE_SUGGESTED_ORDER_LABEL}
        </Button>
        {/* Writes nothing. See the header. */}
        <Button variant="ghost" className="min-h-[44px]" onClick={() => setDismissed(true)}>
          {KEEP_CURRENT_ORDER_LABEL}
        </Button>
      </div>
    </div>
  );
}
