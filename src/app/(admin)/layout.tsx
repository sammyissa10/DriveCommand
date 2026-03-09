import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAdminSession } from "@/lib/auth/admin-session";
import { isSystemAdmin } from "@/lib/auth/server";
import { UserMenu } from "@/components/navigation/user-menu";
import Link from "next/link";

/**
 * Admin portal layout
 *
 * Supports two auth mechanisms:
 * 1. ADMIN_SECRET_KEY-based admin_session cookie — for DriveCommand team members
 *    who don't have a user account in any tenant database.
 * 2. Legacy isSystemAdmin() DB flag — for existing system admins with a tenant session.
 *
 * Unauthorized users (neither mechanism) are redirected to /admin/login.
 *
 * IMPORTANT: Layout auth checks run on initial access only (Next.js optimization).
 * For security, ALWAYS enforce authorization in server actions too.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check new ADMIN_SECRET_KEY-based session first
  const adminSession = await getAdminSession();

  // Fall back to legacy isSystemAdmin DB flag only when no admin_session
  let legacyAdmin = false;
  let session = null;

  if (!adminSession) {
    session = await getSession();
    if (session) {
      legacyAdmin = await isSystemAdmin();
    }
  }

  // Deny access if neither auth mechanism is satisfied
  if (!adminSession && !legacyAdmin) {
    redirect("/admin/login");
  }

  // For legacy admin users, session is the tenant session (already fetched above)
  // For admin_session users, we still try to get the tenant session for UserMenu
  // (it may be null — admin-session-only users won't have a tenant session)
  if (adminSession && !session) {
    session = await getSession().catch(() => null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white border-b border-gray-800">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">DriveCommand Admin</h1>
            <nav className="flex items-center gap-6">
              <Link
                href="/tenants"
                className="text-white hover:text-gray-300 font-medium"
              >
                Tenants
              </Link>
              <Link
                href="/admin-support"
                className="text-white hover:text-gray-300 font-medium"
              >
                Support
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {session ? (
              <UserMenu />
            ) : (
              <Link
                href="/api/admin/logout"
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                Logout
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
