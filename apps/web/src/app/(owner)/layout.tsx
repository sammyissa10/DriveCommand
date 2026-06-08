import { redirect } from "next/navigation";
import { getSession, getRole } from "@/lib/auth/supabase";
import { UserRole } from "@/lib/auth/roles";
import { OwnerShell } from "@/components/navigation/owner-shell";
import { prisma } from "@/lib/db/prisma";
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

  // Fetch the tenant's business name to display in the sidebar
  let tenantName: string | null = null;
  try {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM "Tenant" WHERE id = ${session.tenantId}::uuid LIMIT 1
    `;
    tenantName = rows[0]?.name ?? null;
  } catch {
    // Non-fatal — sidebar falls back to "DriveCommand"
  }

  // Fetch onboarding completion status — default to false (incomplete) if row is missing or query errors.
  // A missing ActivationProgress row means the tenant has not completed onboarding yet.
  let onboardingComplete = false;
  try {
    const activationRows = await prisma.$queryRaw<{ isActivated: boolean }[]>`
      SELECT "isActivated" FROM "ActivationProgress" WHERE "tenantId" = ${session.tenantId}::uuid LIMIT 1
    `;
    onboardingComplete = activationRows[0]?.isActivated ?? false;
  } catch {
    // Non-fatal — default to showing the ribbon (treat as incomplete)
    onboardingComplete = false;
  }

  return (
    <TRPCReactProvider>
      <OwnerShell tenantName={tenantName} onboardingComplete={onboardingComplete}>
        {children}
      </OwnerShell>
    </TRPCReactProvider>
  );
}
