import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSystemAdmin } from "@/lib/auth/server";
import { UserMenu } from "@/components/navigation/user-menu";
import Link from "next/link";

/**
 * Admin portal layout
 *
 * Only accessible by system administrators (users with isSystemAdmin = true).
 * Unauthorized users are redirected to /unauthorized.
 *
 * IMPORTANT: Layout auth checks run on initial access only (Next.js optimization).
 * For security, ALWAYS enforce authorization in server actions too.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  // Check system admin authorization
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) {
    redirect("/unauthorized");
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
          <UserMenu />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
