'use client';

/**
 * The optimisation card on the route template screen (spec Section 9, Part B).
 *
 * ```
 *  +---------------------------------------------+
 *  | Suggested order saves 18 miles and 34 min   |
 *  |                                             |
 *  | [ Use suggested order ]  [ Keep current ]   |
 *  +---------------------------------------------+
 * ```
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL (quick-525)
 * ---------------------------------------------------------------------------
 * Section 9: *"Runs on the template when created or edited — optimise once,
 * reuse daily."* The server half of that has existed since Phase 7 —
 * `GET`/`POST /api/v1/carrier/templates/[id]/optimisation`, both handlers, both
 * service functions — and until this component **nothing in the product ever
 * called it**. `applyTemplateOptimisation` was unreachable from any UI, which is
 * also why `route_matrix_cache` never held a row: `persist: true` comes only
 * from the two `apply*` mutations, and this was the one nobody could reach.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PARENT DOES NOT AWAIT THIS
 * ---------------------------------------------------------------------------
 * The form bumps `token` after a save and moves on. It never awaits, catches or
 * branches on the request made here, so a routing provider that is slow or down
 * cannot delay a save, fail a save, or change what the save reports. That is a
 * property of the wiring rather than of a `.catch()` someone has to remember to
 * keep.
 *
 * `token === 0` means "no save yet on this page load" — nothing is fetched and
 * nothing is drawn. Optimisation is a thing that happens *to a save*, not a
 * thing that happens when a screen opens.
 *
 * ---------------------------------------------------------------------------
 * DISMISSAL IS THE ABSENCE OF THE VIEW, NOT A FLAG BESIDE IT (quick-516)
 * ---------------------------------------------------------------------------
 * quick-516: a stored decision short-circuits a view on the **key's presence**,
 * so undoing it means DELETING the key, never writing a falsy value next to it.
 * The client-side shape of that same trap is a `dismissed: boolean` living
 * alongside the view — nothing resets it on the next save, so a single "Keep
 * current order" would suppress the card for the rest of the page's life, and
 * the bug would look exactly like the one quick-525 just finished diagnosing:
 * a card that never appears.
 *
 * So there is no `dismissed` flag here. Visibility IS presence of `view`;
 * "Keep current order" sets it to null — removal — and the next save installs a
 * fresh view that no stale flag can suppress.
 *
 * The import-side `OptimisationSuggestion.tsx` does carry a `dismissed` boolean
 * and is correct to: it evaluates once on mount and never re-evaluates, so
 * there is no second evaluation for a stale flag to suppress. That component is
 * deliberately left alone rather than generalised — the two have different
 * lifecycles, and one component serving both would have to carry both.
 *
 * The sentence is ONE string from `optimisation-copy.ts`, not JSX children
 * around two counts. See that file — the same shape rendered "4 stopswill" on
 * screen twice before quick-517.
 */

import { useEffect, useState } from 'react';
import { Loader2, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StopBuilderStop } from '@/components/carrier/stops/StopBuilder';
import type { OptimisationView } from '@/lib/document-import/optimisation-service';
import {
  KEEP_CURRENT_ORDER_LABEL,
  USE_SUGGESTED_ORDER_LABEL,
} from '@/lib/document-import/optimisation-copy';

interface Props {
  templateId: string;
  /**
   * Bumped by the parent on every successful save. A new value is a new
   * evaluation; `0` means no save has happened on this page load.
   */
  token: number;
  /** The template's stops as the server holds them after an apply. */
  onApplied: (stops: StopBuilderStop[]) => void;
}

/** The shape the route template GET returns for one stop. */
interface ApiTemplateStop {
  id: string;
  facilityId: string;
  sequenceOrder: number;
  stopType: string;
  contactName: string | null;
  contactPhone: string | null;
  expectedDwellMinutes: number | null;
  commodityDescription: string | null;
  bolRequired: boolean;
  podRequired: boolean;
  specialInstructions: string | null;
  apptWindowStartOffsetMin: number | null;
  apptWindowEndOffsetMin: number | null;
  facility: { id: string; name: string; city: string | null; state: string | null } | null;
}

/**
 * Re-read the template and map its stops into the shape the builder holds.
 *
 * The apply response carries `{ applied, savedMiles, savedMinutes }` and NOT the
 * new order, so the order has to be read back. Deliberately a re-read rather
 * than replaying `movedOrder` on the client: the server recomputes the
 * suggestion at apply time, so the permutation it actually committed can differ
 * from the one this card was drawn from, and applying the stale one locally
 * would leave the screen disagreeing with the database.
 */
async function readStops(templateId: string): Promise<StopBuilderStop[]> {
  const res = await fetch(`/api/v1/carrier/route-templates/${templateId}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Could not re-read the stops.');
  const stops = (json.data?.stops ?? []) as ApiTemplateStop[];
  return stops.map((s) => ({
    id: s.id,
    facility_id: s.facilityId,
    facility_name: s.facility?.name ?? '',
    facility_city: s.facility?.city ?? null,
    facility_state: s.facility?.state ?? null,
    sequence_order: s.sequenceOrder,
    stop_type: s.stopType as StopBuilderStop['stop_type'],
    contact_name: s.contactName ?? null,
    contact_phone: s.contactPhone ?? null,
    expected_dwell_minutes: s.expectedDwellMinutes ?? null,
    commodity_description: s.commodityDescription ?? null,
    bol_required: s.bolRequired,
    pod_required: s.podRequired,
    special_instructions: s.specialInstructions ?? null,
    appt_window_start_offset_min: s.apptWindowStartOffsetMin ?? null,
    appt_window_end_offset_min: s.apptWindowEndOffsetMin ?? null,
    appointment_start: null,
    appointment_end: null,
  }));
}

export function TemplateOptimisationSuggestion({ templateId, token, onApplied }: Props) {
  const [view, setView] = useState<OptimisationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No save yet on this page load — Section 9 runs this on a save, not on a
    // screen opening.
    if (token === 0) return;

    let live = true;
    setError(null);
    fetch(`/api/v1/carrier/templates/${templateId}/optimisation`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Could not check the order.');
        return json.data as OptimisationView;
      })
      .then((v) => {
        if (live) setView(v);
      })
      // Silent, like the import card: a routing engine that is unavailable must
      // not put an error on a screen whose save just succeeded. No suggestion is
      // the correct degraded state, and the save is already reported.
      .catch(() => {
        if (live) setView(null);
      });

    return () => {
      live = false;
    };
  }, [templateId, token]);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/templates/${templateId}/optimisation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not apply that order.');

      onApplied(await readStops(templateId));
      // Removal, not a flag. See the header.
      setView(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that order.');
    } finally {
      setBusy(false);
    }
  }

  // Nothing offered is drawn as nothing at all — no empty card, no placeholder.
  // Section 9: *"below a configurable floor, do not offer it at all."* The floor
  // is applied on the server; this component compares nothing to a number.
  if (!view?.offered || !view.sentence) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* One string. See the header. */}
        {view.sentence}
      </p>
      <p className="mt-1 pl-6 text-xs text-muted-foreground">
        Pickups still come before their deliveries, appointment windows keep their order, and the
        end stop stays last.
      </p>

      {error ? <p className="mt-2 pl-6 text-sm text-destructive">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        <Button type="button" className="min-h-[44px]" disabled={busy} onClick={() => void apply()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {USE_SUGGESTED_ORDER_LABEL}
        </Button>
        {/* Writes nothing — declining is the absence of a request. */}
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => setView(null)}
        >
          {KEEP_CURRENT_ORDER_LABEL}
        </Button>
      </div>
    </div>
  );
}
