import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getRole } from "@/lib/auth/server";
import { UserRole } from "@/lib/auth/roles";
import { UserMenu } from "@/components/navigation/user-menu";
import { Truck } from "lucide-react";
import { DriverNav } from "@/components/driver/driver-nav";

/**
 * Driver portal layout
 *
 * Accessible by DRIVER role only.
 * Unauthorized users are redirected to /unauthorized.
 */
export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const role = await getRole();
  if (role !== UserRole.DRIVER) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white">
              <Truck className="h-4 w-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">DriveCommand</h1>
          </div>
          <UserMenu />
        </div>
        <DriverNav />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
