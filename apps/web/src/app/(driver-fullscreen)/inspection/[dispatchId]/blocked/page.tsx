import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, MessageSquare, RefreshCw, XCircle } from 'lucide-react';
import { getSession, getRole } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { resolveInspectionAccess } from '@/lib/carrier/inspection-access';
import { handleGetGate, inspectionCopy } from '@/lib/carrier/inspection-handlers';

export const dynamic = 'force-dynamic';

/**
 * `/inspection/[dispatchId]/blocked` — Section 12's third outcome.
 *
 * Three things, in this order, because that is the order the driver needs them:
 *
 *   1. WHAT FAILED. Named items, with the driver's own note, and critical ones
 *      marked. "Inspection failed" on its own tells a driver nothing they can
 *      act on and nothing they can repeat down a phone.
 *   2. HOW DISPATCH FINDS OUT, AND WHAT TO DO MEANWHILE. This block used to
 *      assert that dispatch HAD been told, on the grounds that
 *      `notifyDispatchOfBlock` must already have run inside
 *      `handleSubmitInspection`. That invariant is exactly what failed: until
 *      quick-549 this page was also reachable by a render-time redirect from
 *      the walkaround, on a path where `handleSubmitInspection` had never run
 *      and no notification had been attempted. So the page now states how
 *      dispatch is alerted and points the driver at Contact dispatch, rather
 *      than asserting a delivery it cannot verify. A driver who thinks nobody
 *      knows must not sit in the yard waiting — hence "message them here"
 *      rather than silence.
 *
 *      No notified-count is carried, and three routes to one were rejected:
 *      passing `effects.dispatchNotified` through from submit survives only the
 *      immediate post-submit render (reload, direct URL and this page's own
 *      `Check again` all re-render from the pure `handleGetGate`, so it would
 *      not fix the stated problem); reading `in_app_notifications` is
 *      purity-safe but `notifyDispatchOfBlock` writes the shared
 *      `type: 'dispatch_assigned'`, so telling it from a genuine assignment
 *      means matching a title string, and asserting a safety fact off a brittle
 *      string match is worse than not asserting it; and a stored flag is DDL,
 *      which this task forbids.
 *   3. SOMETHING TO DO. Contact dispatch, and a re-check.
 *
 * NEVER A DEAD END. Every path off this page is a real one: messages, a
 * re-check that re-reads the gate, and the way home. The re-check matters
 * because the driver is not the person who unblocks this — an owner override or
 * a mechanic sign-off happens elsewhere, and the driver needs a way to find out
 * it happened without reinstalling anything or ringing back.
 */
export default async function InspectionBlockedPage({
  params,
}: {
  params: Promise<{ dispatchId: string }>;
}) {
  const { dispatchId } = await params;

  const session = await getSession();
  if (!session) redirect('/sign-in');

  const role = await getRole();
  const access = await resolveInspectionAccess({
    role,
    userId: session.userId,
    tenantId: session.tenantId,
    dispatchId,
  });

  if (!access.allowed) {
    logger.warn('[inspection blocked page] access denied', {
      dispatchId,
      userId: session.userId,
      tenantId: session.tenantId,
      reason: access.reason,
    });
    return (
      <Frame title="This trip is not yours">
        <p className="text-base leading-relaxed text-muted-foreground">
          It may have been reassigned. Your dispatcher can tell you which trip you are on.
        </p>
        <HomeLink />
      </Frame>
    );
  }

  let gate;
  try {
    gate = await handleGetGate({ orgId: session.tenantId, dispatchId });
  } catch (err) {
    logger.error('[inspection blocked page] gate read threw', err, {
      dispatchId,
      orgId: session.tenantId,
      error: serializeError(err),
    });
    return (
      <Frame title="Could not load this trip">
        <p className="text-base leading-relaxed text-muted-foreground">
          Something went wrong reading the inspection. Nothing has changed either way.
        </p>
        <RecheckLink dispatchId={dispatchId} />
        <HomeLink />
      </Frame>
    );
  }

  if (!gate.ok) {
    return (
      <Frame title="Could not load this trip">
        <p className="text-base leading-relaxed text-muted-foreground">{gate.error}</p>
        <RecheckLink dispatchId={dispatchId} />
        <HomeLink />
      </Frame>
    );
  }

  const view = gate.data;

  // Cleared while the driver was on this screen — an owner override or a
  // mechanic sign-off. Send them back rather than showing a stale wall.
  if (view.outcome !== 'BLOCKED') {
    redirect(`/inspection/${dispatchId}`);
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between px-5 py-8">
      <div className="space-y-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950">
          <XCircle className="h-7 w-7 text-red-700 dark:text-red-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight text-foreground">This trip cannot start</h1>
          {/* The gate's own sentence, whole. */}
          <p className="text-base leading-relaxed text-muted-foreground">{view.message}</p>
        </div>

        {/* 1 — What failed */}
        <section className="rounded-2xl bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What failed
          </h2>
          <ul className="mt-3 space-y-3">
            {view.failures.map((f) => (
              <li key={f.stepInstanceId} className="flex items-start gap-2.5">
                {f.isCritical ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {f.name}
                    {f.isCritical ? ' · critical' : ''}
                  </p>
                  {f.note && <p className="mt-0.5 text-sm text-muted-foreground">{f.note}</p>}
                  {f.photoCount > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Photo attached</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 2 — How dispatch finds out, and what to do meanwhile */}
        <p className="rounded-2xl bg-muted/60 p-4 text-sm leading-relaxed text-foreground">
          {inspectionCopy.dispatchAlerted}
        </p>
      </div>

      {/* 3 — Something to do */}
      <div className="mt-6 space-y-3">
        {/*
          Messages, not a phone number. It is in-app, it is logged against the
          tenant, and it does not depend on the driver having a dispatcher's
          number saved — the same call mobile's blocked screen makes.
        */}
        <Link
          href="/messages"
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          Contact dispatch
        </Link>
        <RecheckLink dispatchId={dispatchId} />
        <HomeLink />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RecheckLink({ dispatchId }: { dispatchId: string }) {
  return (
    <Link
      href={`/inspection/${dispatchId}/blocked`}
      className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80"
    >
      <RefreshCw className="h-5 w-5 shrink-0" />
      Check again
    </Link>
  );
}

function HomeLink() {
  return (
    <Link
      href="/home"
      className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-muted text-base font-semibold text-foreground hover:bg-muted/80"
    >
      Back to my trips
    </Link>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col justify-between px-5 py-8">
      <div className="space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950">
          <AlertTriangle className="h-7 w-7 text-amber-700 dark:text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold leading-tight text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  );
}
