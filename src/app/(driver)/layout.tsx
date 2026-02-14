import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getRole } from "@/lib/auth/server";
import { UserRole } from "@/lib/auth/roles";
import { UserMenu } from "@/components/navigation/user-menu";

/**
 * Driver portal layout
 *
 * Accessible by DRIVER role only.
 * Unauthorized users are redirected to /unauthorized.
 *
 * IMPORTANT: Layout auth checks run on initial access only (Next.js optimization).
 * For security, ALWAYS enforce authorization in server actions too.
 */
export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Check driver authorization
  const role = await getRole();
  if (role !== UserRole.DRIVER) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white border-b border-blue-800">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold">DriveCommand</h1>
          <UserMenu />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
