import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { hydrateTenant } from '@/lib/onboarding/hydrate-tenant';
import { ActivationChecklist } from './checklist';

// Force dynamic rendering — activation progress is per-tenant and must never be statically cached.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Welcome to DriveCommand' };

/**
 * Onboarding step completion, derived from real records (not click-tracking).
 * Sample/seeded rows and soft-deleted rows are excluded so demo data never
 * marks a step done. bypass_rls: this page runs before the tenant has an
 * interactive session context set for RLS.
 */
async function getOnboardingFlags(tenantId: string): Promise<{
  hasClient: boolean;
  hasContract: boolean;
  hasLoad: boolean;
  hasTrip: boolean;
}> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    const [clients, contracts, loads, trips] = await Promise.all([
      tx.carrierClient.count({ where: { orgId: tenantId, isSample: false, deletedAt: null } }),
      tx.carrierContract.count({ where: { orgId: tenantId, deletedAt: null } }),
      tx.carrierLoad.count({ where: { orgId: tenantId, isSample: false, deletedAt: null } }),
      tx.trip.count({ where: { orgId: tenantId, deletedAt: null } }),
    ]);
    return {
      hasClient: clients > 0,
      hasContract: contracts > 0,
      hasLoad: loads > 0,
      hasTrip: trips > 0,
    };
  }, TX_OPTIONS);
}

export default async function WelcomePage() {
  const session = await getSession();

  if (session?.tenantId) {
    const tenantId = session.tenantId;

    const tenant = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.tenant.findUnique({
        where: { id: tenantId },
        select: { provisioningPhase: true },
      });
    }, TX_OPTIONS);

    console.log('[welcome] tenantId:', tenantId, 'phase:', tenant?.provisioningPhase);

    try {
      await hydrateTenant(tenantId);
    } catch (err) {
      console.error('[welcome] hydrateTenant failed — checking tenant state before showing error', err instanceof Error ? err.stack : err);

      // Check actual DB state — hydrateTenant may have completed before the client-side timeout
      let shouldShowError = true;
      let catchFlags: Awaited<ReturnType<typeof getOnboardingFlags>> | null = null;

      try {
        const tenantState = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.tenant.findUnique({
            where: { id: tenantId },
            select: { provisioningPhase: true, sampleDataSeeded: true },
          });
        }, TX_OPTIONS);

        if (tenantState?.provisioningPhase === 'HYDRATED') {
          // Case (a) and (b): tenant is HYDRATED — hydrateTenant error was a false alarm (e.g. client timeout)
          console.warn('[welcome] hydrateTenant threw but tenant is HYDRATED — ignoring error');
          shouldShowError = false;

          // Derive checklist state from real records for the normal render path
          catchFlags = await getOnboardingFlags(tenantId);
        }
        // Case (c): provisioningPhase is still MINIMAL (or null) — genuine failure, show error UI
      } catch (stateCheckErr) {
        // State check itself failed — fall back to showing error UI
        console.error('[welcome] tenant state check in catch block failed', stateCheckErr);
      }

      if (!shouldShowError) {
        // Render normal welcome page with freshly-fetched activation data (or defaults if no row yet)
        return (
          <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-4xl">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: welcome content */}
                <div className="flex flex-col justify-center space-y-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                      Welcome to DriveCommand!
                    </h1>
                    <p className="text-muted-foreground leading-relaxed">
                      Your account is set up and ready. Complete the steps on the right
                      to get your fleet fully operational.
                    </p>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>We sent a confirmation email — click the link to verify your address.</p>
                    <p>
                      Didn&apos;t receive it? Check your spam folder or{' '}
                      <a href="mailto:support@drivecommand.app" className="text-primary hover:underline">
                        contact support
                      </a>
                      .
                    </p>
                  </div>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit" className="text-xs text-muted-foreground hover:underline cursor-pointer">
                      Sign out
                    </button>
                  </form>
                </div>
                {/* Right: activation checklist */}
                <div className="rounded-xl border border-border bg-card shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Get started checklist</h2>
                  <ActivationChecklist
                    hasClient={catchFlags?.hasClient ?? false}
                    hasContract={catchFlags?.hasContract ?? false}
                    hasLoad={catchFlags?.hasLoad ?? false}
                    hasTrip={catchFlags?.hasTrip ?? false}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Case (c): genuine failure — render error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full rounded-xl border border-destructive/40 bg-card shadow-sm p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950">
                <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                Setup incomplete
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We couldn&apos;t finish setting up your workspace. Please refresh the
                page to try again, or contact support if this continues.
              </p>
            </div>
            <div className="space-y-3">
              <Button asChild className="w-full">
                <a href="/onboarding/welcome">Refresh and retry</a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Still stuck? Email{' '}
                <a
                  href="mailto:support@drivecommand.app"
                  className="text-primary hover:underline"
                >
                  support@drivecommand.app
                </a>
              </p>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-xs text-muted-foreground hover:underline cursor-pointer">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }

    // Derive checklist step completion from real records for this tenant
    const flags = await getOnboardingFlags(tenantId);

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: welcome content */}
            <div className="flex flex-col justify-center space-y-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Welcome to DriveCommand!
                </h1>
                <p className="text-muted-foreground leading-relaxed">
                  Your account is set up and ready. Complete the steps on the right
                  to get your fleet fully operational.
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>We sent a confirmation email — click the link to verify your address.</p>
                <p>
                  Didn&apos;t receive it? Check your spam folder or{' '}
                  <a href="mailto:support@drivecommand.app" className="text-primary hover:underline">
                    contact support
                  </a>
                  .
                </p>
              </div>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-xs text-muted-foreground hover:underline cursor-pointer">
                  Sign out
                </button>
              </form>
            </div>
            {/* Right: activation checklist */}
            <div className="rounded-xl border border-border bg-card shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Get started checklist</h2>
              <ActivationChecklist
                hasClient={flags.hasClient}
                hasContract={flags.hasContract}
                hasLoad={flags.hasLoad}
                hasTrip={flags.hasTrip}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No session — unauthenticated preview with fresh account defaults
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: welcome content */}
          <div className="flex flex-col justify-center space-y-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Welcome to DriveCommand!
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                Your account is set up and ready. Complete the steps on the right
                to get your fleet fully operational.
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>We sent a confirmation email — click the link to verify your address.</p>
              <p>
                Didn&apos;t receive it? Check your spam folder or{' '}
                <a href="mailto:support@drivecommand.app" className="text-primary hover:underline">
                  contact support
                </a>
                .
              </p>
            </div>
          </div>
          {/* Right: activation checklist */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Get started checklist</h2>
            <ActivationChecklist
              hasClient={false}
              hasContract={false}
              hasLoad={false}
              hasTrip={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
