'use client';

/**
 * The end stop row on the summary card (spec Section 9, Part A).
 *
 * ```
 *   Ends at   MILWAUKEE YARD          (i)  [pencil]
 *             Your company's default
 * ```
 *
 * Loads its own slot rather than reading one off `ImportView`, for the same
 * reason `StopResolutionPanel` does: the GET is read-only on the server — it
 * resolves the tenant default, the template override and the per-trip choice and
 * describes the answer, committing nothing — so opening this row cannot write.
 *
 * ---------------------------------------------------------------------------
 * "USE MY COMPANY DEFAULT" IS A POST, NOT A REFRESH
 * ---------------------------------------------------------------------------
 * The server short-circuits on the presence of `resolution_provenance.endStop`,
 * so once a person has chosen, re-reading returns their choice forever. Undoing
 * it means DELETING the key, which is `action: 'reset'`. Wiring that control to
 * a re-fetch would make it look broken while behaving exactly as written — the
 * bug quick-516 fixed on the template slot, and the reason this comment is here
 * rather than in a commit message.
 *
 * There is no policy value that means "undecided". `NONE` says this trip ends
 * nowhere, which is a real answer and a different one.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Home, Loader2, Pencil, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EndStopSlotView } from '@/lib/document-import/end-stop-lookup';

interface Props {
  importId: string;
  /** Re-render the card when the end stop changes something it displays. */
  onChanged?: (slot: EndStopSlotView) => void;
}

export function EndStopDecision({ importId, onChanged }: Props) {
  const [slot, setSlot] = useState<EndStopSlotView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/carrier/document-imports/${importId}/end-stop`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? 'Could not load the end stop.');
    return json.data as EndStopSlotView;
  }, [importId]);

  useEffect(() => {
    let live = true;
    load()
      .then((v) => {
        if (live) setSlot(v);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the end stop.');
      });
    return () => {
      live = false;
    };
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/end-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not change the end stop.');
      const next = json.data as EndStopSlotView;
      setSlot(next);
      setOpen(false);
      onChanged?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the end stop.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !slot) return <p className="py-3 text-sm text-destructive">{error}</p>;
  if (!slot) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Working out where the day ends…
      </p>
    );
  }

  const value =
    slot.state === 'RESOLVED' && slot.facility
      ? slot.facility.name
      : slot.options.find((o) => o.policy === slot.policy)?.label ?? '—';

  return (
    <>
      <div className="flex items-center gap-3 py-3">
        <dt className="w-24 shrink-0 text-sm text-muted-foreground">Ends at</dt>
        <dd className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            {slot.facility?.isDriverResidence ? (
              <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            {value}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {slot.blockedReason ?? slot.facility?.address ?? slot.why.detail}
          </span>
        </dd>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Change end stop"
          aria-expanded={open}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground',
            open && 'bg-muted text-foreground',
          )}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div className="space-y-3 py-3">
          <p className="text-xs text-muted-foreground">
            Where this truck finishes the day. It becomes a real stop, so the arrival is tracked and
            the miles and hours close out.
          </p>

          <ul className="space-y-1.5">
            {slot.options.map((option) => {
              const selected = option.policy === slot.policy;
              return (
                <li key={option.policy}>
                  <button
                    type="button"
                    disabled={busy || !option.available}
                    onClick={() =>
                      void post(
                        option.policy === 'DESIGNATED_PARKING'
                          ? { action: 'select', policy: option.policy, facilityId: null }
                          : { action: 'select', policy: option.policy },
                      )
                    }
                    className={cn(
                      'flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                      selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                      !option.available && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                    <span className="flex-1">
                      <span className="font-medium">{option.label}</span>
                      {option.unavailableReason ? (
                        <span className="block text-xs text-muted-foreground">
                          {option.unavailableReason}
                        </span>
                      ) : null}
                    </span>
                    {option.policy === 'DRIVER_RESIDENCE' ? (
                      <ShieldAlert
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="Only you, the owner and permitted dispatchers can see this address"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* The parking picker, only when it is the answer. It is a separate
              choice rather than a fifth option because Section 9 makes this one
              "per template or trip" — the policy names a kind of place and the
              person names the place. */}
          {slot.policy === 'DESIGNATED_PARKING' ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">Which yard?</p>
              {slot.parkingCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No yards or terminals are set up yet. Add one under Facilities.
                </p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {slot.parkingCandidates.map((facility) => (
                    <li key={facility.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void post({
                            action: 'select',
                            policy: 'DESIGNATED_PARKING',
                            facilityId: facility.id,
                          })
                        }
                        className={cn(
                          'flex min-h-[44px] w-full flex-col rounded-lg border px-3 py-2 text-left',
                          slot.facility?.id === facility.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted',
                        )}
                      >
                        <span className="text-sm font-medium">{facility.name}</span>
                        <span className="text-xs text-muted-foreground">{facility.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            {/* A POST that DELETES the stored key. Shown only when there is one
                to delete — offering "use the default" on a row that is already
                the default would be a button that does nothing. */}
            {slot.persisted && !slot.materialised ? (
              <Button
                variant="ghost"
                className="min-h-[44px]"
                disabled={busy}
                onClick={() => void post({ action: 'reset' })}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Use my company default
              </Button>
            ) : null}
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
