import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { hydrateTenant } from '@/lib/onboarding/hydrate-tenant';
import { ActivationChecklist } from './checklist';

export const metadata = { title: 'Welcome to DriveCommand' };

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
      console.error('[welcome] hydrateTenant failed — full error:', err instanceof Error ? err.stack : err);
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
            </div>
          </div>
        </div>
      );
    }

    // Fetch ActivationProgress for authenticated tenant
    const activation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.activationProgress.findUnique({
        where: { tenantId },
        select: {
          completionPct: true,
          firstRealTruckAt: true,
          firstRealDriverAt: true,
          firstRealClientAt: true,
          firstLoadInTransitAt: true,
        },
      });
    }, TX_OPTIONS);

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
                completionPct={activation?.completionPct ?? 20}
                firstRealTruckAt={activation?.firstRealTruckAt ?? null}
                firstRealDriverAt={activation?.firstRealDriverAt ?? null}
                firstRealClientAt={activation?.firstRealClientAt ?? null}
                firstLoadInTransitAt={activation?.firstLoadInTransitAt ?? null}
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
              completionPct={20}
              firstRealTruckAt={null}
              firstRealDriverAt={null}
              firstRealClientAt={null}
              firstLoadInTransitAt={null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
