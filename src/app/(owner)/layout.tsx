import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getRole } from "@/lib/auth/server";
import { UserRole } from "@/lib/auth/roles";
import { OwnerShell } from "@/components/navigation/owner-shell";

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

  return <OwnerShell>{children}</OwnerShell>;
}
