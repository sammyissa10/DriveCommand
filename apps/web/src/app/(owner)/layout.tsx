import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getRole } from "@/lib/auth/server";
import { UserRole } from "@/lib/auth/roles";
import { OwnerShell } from "@/components/navigation/owner-shell";
import { SupportBadge } from "@/components/navigation/support-badge";
import { prisma } from "@/lib/db/prisma";

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
  // Run auth checks in parallel — both are fast JWT decrypts, no DB calls
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

  return (
    <OwnerShell tenantName={tenantName} supportBadge={<Suspense fallback={null}><SupportBadge /></Suspense>}>
      {children}
    </OwnerShell>
  );
}
