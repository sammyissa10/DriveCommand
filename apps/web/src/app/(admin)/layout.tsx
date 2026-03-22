import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSystemAdmin } from "@/lib/auth/server";
import { UserMenu } from "@/components/navigation/user-menu";
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const admin = await isSystemAdmin();
  if (!admin) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white border-b border-gray-800">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <AppLogo size={32} variant="light" />
              <DriveCommandWordmark size="md" className="text-white" />
              <span className="text-white/60 text-sm font-medium">Admin</span>
            </div>
            <nav className="flex items-center gap-6">
              <Link
                href="/admin-dashboard"
                className="text-white hover:text-gray-300 font-medium"
              >
                Dashboard
              </Link>
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
              <Link
                href="/billing"
                className="text-white hover:text-gray-300 font-medium"
              >
                Billing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
