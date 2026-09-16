import { redirect } from "next/navigation";
import { getSession, getRole } from "@/lib/auth/supabase";
import { UserRole } from "@/lib/auth/roles";
import { OwnerShell } from "@/components/navigation/owner-shell";
import { TX_OPTIONS } from "@/lib/db/prisma";
import { getTenantPrismaForOrg } from "@/lib/context/tenant-context";
import { TRPCReactProvider } from "@/trpc/Provider";

// All owner-portal pages require auth — force dynamic rendering so Next.js
// never attempts static pre-rendering (which has no session context).
export const dynamic = 'force-dynamic';

/**
 * Owner portal layout
 *
 * Accessible by OWNER and MANAGER roles only.
 * Unauthorized users are redirected to /unauthorized.
 *
 * IMPORTANT: Layout auth checks run on initial access only (Next.js optimization).
 * For security, ALWAYS enforce authorization in server actions too.
 */
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Run auth checks in parallel — both read from the Supabase session, no DB calls
  const [session, role] = await Promise.all([getSession(), getRole()]);

  if (!session) {
    redirect("/sign-in");
  }

  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    redirect("/unauthorized");
  }

  /*
   * quick-621: the shell's three reads — tenant name, activation state, first-run tour
   * flag — run on a tenant-scoped client. They were bare-prisma $queryRaw calls with no
   * tenant GUC, so as app_user each one raised TC001 on a cold connection (or read 0 rows
   * with the tripwire off). Each sat in a `catch {}` that rendered a default, so the
   * portal rendered HTTP 200 with a blank name, the onboarding ribbon forced on and the
   * tour suppressed, and nothing was logged. userId is deliberately NOT passed.
   *
   * A MISSING ROW keeps its deliberate default (no ActivationProgress row = onboarding
   * not complete; no User row = tour not seen). A FAILED QUERY is no longer swallowed: it
   * propagates to src/app/error.tsx, which logs it and renders an error page. A layout
   * that renders as if its data loaded when it did not is the defect being removed here.
   */
  const db = await getTenantPrismaForOrg(session.tenantId);
  const [tenant, activation, user] = await db.$transaction(async (tx) => {
    // Tenant is extension-exempt; the id predicate and tenant_self_read isolate it.
    const tenantRow = await tx.tenant.findUnique({
      where: { id: session.tenantId },
      select: { name: true },
    });
    const activationRow = await tx.activationProgress.findUnique({
      where: { tenantId: session.tenantId },
      select: { isActivated: true, congratsShownAt: true },
    });
    const userRow = await tx.user.findUnique({
      where: { id: session.userId },
      select: { onboardingTourSeen: true },
    });
    return [tenantRow, activationRow, userRow] as const;
  }, TX_OPTIONS);

  const tenantName: string | null = tenant?.name ?? null;
  const onboardingComplete = activation?.isActivated ?? false;
  const congratsShownAt: string | null = activation?.congratsShownAt
    ? activation.congratsShownAt.toISOString()
    : null;
  const tourSeen = user?.onboardingTourSeen ?? false;

  return (
    <TRPCReactProvider>
      <OwnerShell
        tenantName={tenantName}
        onboardingComplete={onboardingComplete}
        congratsShownAt={congratsShownAt}
        tourSeen={tourSeen}
      >
        {children}
      </OwnerShell>
    </TRPCReactProvider>
  );
}
