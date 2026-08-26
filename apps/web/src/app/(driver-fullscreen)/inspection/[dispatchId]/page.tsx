import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getSession, getRole } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { resolveInspectionAccess } from '@/lib/carrier/inspection-access';
import {
  handleGetChecklist,
  handleGetGate,
  type InspectionChecklistView,
} from '@/lib/carrier/inspection-handlers';
import { InspectionClient } from './InspectionClient';

export const dynamic = 'force-dynamic';

/**
 * `/inspection/[dispatchId]` — the driver's full-screen walkaround.
 *
 * Outside `(driver)/` on purpose: see `(driver-fullscreen)/layout.tsx` for why
 * the chrome and the auth guard had to be separated, and what that costs.
 *
 * This page READS ONLY. `handleGetGate` and `handleGetChecklist` are both pure
 * reads; the one call that can create a `PlaybookInstance` is
 * `openInspectionChecklist`, and it is behind a button in `InspectionClient`.
 * A page that spawned a checklist on render would write once per refresh.
 */
export default async function DriverInspectionPage({
  params,
}: {
  params: Promise<{ dispatchId: string }>;
}) {
  const { dispatchId } = await params;

  const session = await getSession();
  // The layout already redirected an anonymous request; this is belt and braces
  // for the case where a session expires between the layout and the page.
  if (!session) redirect('/sign-in');

  const role = await getRole();

  // ── The guard ─────────────────────────────────────────────────────────────
  // Role AND ownership. `resolveInspectionAccess` is the single function that
  // answers both, is called again by every mutation in `../actions.ts`, and is
  // what the integration test drives against real rows.
  const access = await resolveInspectionAccess({
    role,
    userId: session.userId,
    tenantId: session.tenantId,
    dispatchId,
  });

  if (!access.allowed) {
    logger.warn('[inspection page] access denied', {
      dispatchId,
      userId: session.userId,
      tenantId: session.tenantId,
      reason: access.reason,
    });
    return <NotYourTrip />;
  }

  // ── Read the gate ─────────────────────────────────────────────────────────
  let gate;
  try {
    gate = await handleGetGate({ orgId: session.tenantId, dispatchId });
  } catch (err) {
    logger.error('[inspection page] gate read threw', err, {
      dispatchId,
      orgId: session.tenantId,
      error: serializeError(err),
    });
    return <CouldNotLoad dispatchId={dispatchId} />;
  }

  if (!gate.ok) {
    logger.warn('[inspection page] gate unavailable', {
      dispatchId,
      status: gate.status,
      code: gate.code,
    });
    return <CouldNotLoad dispatchId={dispatchId} />;
  }

  const view = gate.data;

  // ── There is deliberately NO redirect on BLOCKED here (quick-549) ──────────
  //
  // This page used to send a BLOCKED trip straight to `./blocked` during render.
  // It must not, and each of the following is a reason someone would otherwise
  // put it back:
  //
  //   1. Every BLOCKED side effect hangs off SUBMIT, not off the gate read.
  //      `recordInspectionDefects`, `notifyDispatchOfBlock` and the
  //      `inspection.failed` catalogue emit all live in `applyVerdictSideEffects`,
  //      which is called from `handleSubmitInspection` — never from a render.
  //   2. A render-time redirect skipped every one of them (quick-548). The
  //      evidence was production: zero `carrier_truck_defects` rows across all
  //      tenants, while FAILED steps and BLOCKED instances existed. A failed
  //      brake check left nothing durable against the truck.
  //   3. The driver must therefore be allowed to reach `Review & sign` and
  //      submit. BLOCKED has `canStart: false` and a non-null
  //      `playbookInstanceId`, so it falls through below and renders the
  //      checklist — which is the intent, not an oversight.
  //   4. The blocked screen is still reached, from `InspectionClient.onOutcome`,
  //      AFTER the submit that ran the side effects. That is the only route to
  //      it now, and it is the correct one.
  //
  // Already clear — inspection not required, overridden, a valid one earlier
  // today, or this one already passed. Say which, and offer the road.
  if (view.canStart) {
    return <AlreadyClear message={view.message} />;
  }

  // ── Otherwise: the checklist ──────────────────────────────────────────────
  let checklist: InspectionChecklistView | null = null;
  if (view.playbookInstanceId) {
    try {
      const res = await handleGetChecklist({
        orgId: session.tenantId,
        dispatchId,
        playbookInstanceId: view.playbookInstanceId,
      });
      if (res.ok) checklist = res.data;
    } catch (err) {
      logger.error('[inspection page] checklist read threw', err, {
        dispatchId,
        orgId: session.tenantId,
        error: serializeError(err),
      });
      return <CouldNotLoad dispatchId={dispatchId} />;
    }
  }

  return (
    <InspectionClient
      dispatchId={dispatchId}
      truckUnitNumber={view.truckUnitNumber}
      checklist={checklist}
    />
  );
}

// ---------------------------------------------------------------------------
// The three ways this page can end without a checklist
// ---------------------------------------------------------------------------

/**
 * Not a 404.
 *
 * This route has no navigation of its own — that is the point of the group —
 * so `notFound()` here would strand the driver on a chrome-free error page with
 * no way out but the browser's back button. Every terminal state in this group
 * carries a way home.
 */
function NotYourTrip() {
  return (
    <Shell
      tone="warn"
      title="This trip is not yours"
      body="It may have been reassigned. Your dispatcher can tell you which trip you are on."
    />
  );
}

function CouldNotLoad({ dispatchId }: { dispatchId: string }) {
  return (
    <Shell
      tone="warn"
      title="Could not load the inspection"
      body="Something went wrong reading this trip's checklist. Nothing has been recorded either way."
      retryHref={`/inspection/${dispatchId}`}
    />
  );
}

function AlreadyClear({ message }: { message: string }) {
  return <Shell tone="ok" title="No walkaround needed" body={message} homeLabel="Back to my trips" />;
}

function Shell({
  tone,
  title,
  body,
  retryHref,
  homeLabel = 'Back to my trips',
}: {
  tone: 'ok' | 'warn';
  title: string;
  body: string;
  retryHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-between px-5 py-8">
      <div className="space-y-4">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
            tone === 'ok' ? 'bg-green-100 dark:bg-green-950' : 'bg-amber-100 dark:bg-amber-950'
          }`}
        >
          {tone === 'ok' ? (
            <CheckCircle2 className="h-7 w-7 text-green-700 dark:text-green-400" />
          ) : (
            <AlertTriangle className="h-7 w-7 text-amber-700 dark:text-amber-400" />
          )}
        </div>
        <h1 className="text-2xl font-bold leading-tight text-foreground">{title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
      </div>

      <div className="space-y-3">
        {retryHref && (
          <Link
            href={retryHref}
            className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </Link>
        )}
        <Link
          href="/home"
          className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
