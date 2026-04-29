import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSession } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { hydrateTenant } from '@/lib/onboarding/hydrate-tenant';

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
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-card shadow-sm p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome to DriveCommand!
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account is ready. We sent a confirmation email — click the link
            to verify your address. You can start exploring in the meantime.
          </p>
        </div>
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or contact{' '}
            <a
              href="mailto:support@drivecommand.app"
              className="text-primary hover:underline"
            >
              support
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
