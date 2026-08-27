'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Truck } from 'lucide-react';
import type {
  InspectionChecklistView,
  InspectionGateView,
} from '@/lib/carrier/inspection-handlers';
import { TakeoverAlert, TakeoverScreen } from '../../TakeoverScreen';
import { InspectionRunner } from './InspectionRunner';
import { openInspectionChecklist } from '../actions';
import { startTrip } from '@/app/(driver)/actions/driver-routes';

/**
 * The three states a driver can be in on this route, and the transitions
 * between them. Deliberately one client component rather than three routes:
 * finishing a walkaround and being told the outcome is one continuous moment,
 * and a redirect in the middle of it loses the "you just did this" context.
 *
 * The exception is BLOCKED, which IS its own route — see `onOutcome`.
 */
export function InspectionClient({
  dispatchId,
  truckUnitNumber,
  checklist,
}: {
  dispatchId: string;
  truckUnitNumber: string;
  checklist: InspectionChecklistView | null;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<InspectionGateView | null>(null);

  /**
   * quick-547 — the checklist `openInspectionChecklist` just handed back.
   *
   * `BeginScreen` used to answer a successful open with `router.refresh()` alone
   * and hope the server tree came back with a non-null `checklist`. That is the
   * same single point of failure as the missing ticks: one revalidation signal,
   * and a screen that shows nothing at all if it does not arrive. The action has
   * ALWAYS returned the built view — it was simply thrown away — so the button
   * now renders from it directly and the refresh becomes a convergence step
   * rather than the mechanism.
   *
   * The server still wins: `checklist ?? opened` prefers the prop the moment the
   * page supplies one. Same rule as `applyOptimisticAnswers` — a locally held
   * value is only ever a stand-in for a server value that has not arrived yet,
   * and never something that can outrank one that has.
   */
  const [opened, setOpened] = useState<InspectionChecklistView | null>(null);
  const active = checklist ?? opened;

  if (outcome) {
    return <OutcomeScreen dispatchId={dispatchId} gate={outcome} />;
  }

  if (!active) {
    return (
      <BeginScreen
        dispatchId={dispatchId}
        truckUnitNumber={truckUnitNumber}
        onOpened={(view) => {
          setOpened(view);
          router.refresh();
        }}
      />
    );
  }

  return (
    <InspectionRunner
      view={active}
      onOutcome={(gate) => {
        if (gate.outcome === 'BLOCKED') {
          // A blocked trip is a different situation, not a different message —
          // it needs its own screen with its own actions, and it must survive a
          // refresh and a back button. `replace` rather than `push` so the back
          // button does not return the driver to a checklist they have already
          // submitted.
          router.replace(`/inspection/${dispatchId}/blocked`);
          return;
        }
        setOutcome(gate);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Begin — only reached on a tenant with no ON_DISPATCH_CREATE trigger
// ---------------------------------------------------------------------------

/**
 * Opening the checklist WRITES: `handleOpenChecklist` creates the
 * `PlaybookInstance` when the tenant has no trigger configured. That is why the
 * page does not do it on render — a GET that spawns a checklist would put the
 * creation path on a page load and every refresh would be another write
 * (quick-516). So it is a button, and the driver taps it.
 *
 * On a tenant whose trigger already ran, `createTrip` made the instance long
 * before the driver opened anything, the page finds it, and this screen is
 * never seen.
 */
function BeginScreen({
  dispatchId,
  truckUnitNumber,
  onOpened,
}: {
  dispatchId: string;
  truckUnitNumber: string;
  /** Handed the checklist the action returned, so the caller need not re-fetch it. */
  onOpened: (view: InspectionChecklistView) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // quick-546: held alongside the message so the driver has something short to
  // read out to dispatch. Cleared with the message at the start of every attempt.
  const [errorCode, setErrorCode] = useState<string | null>(null);

  return (
    <TakeoverScreen
      top={
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <ClipboardCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold leading-tight text-foreground">Pre-trip inspection</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Walk around unit {truckUnitNumber} and answer each item. You can go back at any point
            before you sign.
          </p>
        </>
      }
      /*
        quick-546: this banner used to live in the TOP block. The layout is
        `min-h-dvh ... justify-between`, so on a phone it rendered roughly a
        screen-height away from the button being tapped — the feedback existed
        and was off-screen, which is why the failure was reported as "nothing
        happens". quick-562 turned that fix into the shell's rule: `feedback` is
        rendered as the first child of the action region, so it can no longer be
        put anywhere else without leaving the shell.
      */
      feedback={error && <TakeoverAlert message={error} code={errorCode} />}
      actions={
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setErrorCode(null);
                const res = await openInspectionChecklist(dispatchId);
                if (!res.success) {
                  setError(res.error);
                  setErrorCode(res.code ?? null);
                  return;
                }
                onOpened(res.data);
              })
            }
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : null}
            Start the walkaround
          </button>
          <Link
            href="/home"
            className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80"
          >
            Not now
          </Link>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Outcome — passed, or passed with defects
// ---------------------------------------------------------------------------

function OutcomeScreen({ dispatchId, gate }: { dispatchId: string; gate: InspectionGateView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const withDefects = gate.outcome === 'PASSED_WITH_DEFECTS';

  return (
    <TakeoverScreen
      top={
        <>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              withDefects ? 'bg-amber-100 dark:bg-amber-950' : 'bg-green-100 dark:bg-green-950'
            }`}
          >
            {withDefects ? (
              <AlertTriangle className="h-7 w-7 text-amber-700 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-green-700 dark:text-green-400" />
            )}
          </div>

          <h1 className="text-2xl font-bold leading-tight text-foreground">
            {withDefects ? 'Inspection complete, with faults' : 'Inspection complete'}
          </h1>

          {/*
            The gate's own sentence, rendered whole. `inspectionCopy` builds it
            server-side as one string precisely so it is never reassembled from
            fragments here.
          */}
          <p className="text-base leading-relaxed text-muted-foreground">{gate.message}</p>

          {gate.failures.length > 0 && (
            <ul className="space-y-2 rounded-2xl bg-card p-4 shadow-sm">
              {gate.failures.map((f) => (
                <li key={f.stepInstanceId} className="text-sm">
                  <span className="font-medium text-foreground">{f.name}</span>
                  {f.note ? <span className="text-muted-foreground"> — {f.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      }
      /*
        quick-562 — this banner was in the TOP block, which is the defect
        quick-546 fixed one screen away and did not carry across. `startTrip`
        can fail (HOS, a licence, a truck), and its message rendered at the end
        of a block that already holds an icon, a heading, the gate's sentence
        and the whole defect list, while the button that produced it sits at the
        other end of a `justify-between` viewport. Same layout, same distance,
        same "nothing happens".
      */
      feedback={error && <TakeoverAlert message={error} />}
      actions={
        <>
          {/*
            Starting is a SEPARATE, explicit tap. `handleSubmitInspection` never
            starts the trip, so a driver who finishes a walkaround at 04:50 is not
            put on the road at 04:50.
          */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = (await startTrip(dispatchId)) as { error?: string };
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                router.replace('/my-route');
              })
            }
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <Truck className="h-5 w-5 shrink-0" />
            )}
            Start trip
          </button>
          <Link
            href="/home"
            className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80"
          >
            Back to my trips
          </Link>
        </>
      }
    />
  );
}
