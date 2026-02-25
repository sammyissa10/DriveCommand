import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import Link from "next/link";

export default async function OnboardingPage() {
  const session = await getSession();

  // Not authenticated - redirect to sign-in
  if (!session) {
    redirect("/sign-in");
  }

  // Tenant is ready - redirect to appropriate portal based on role
  if (session.tenantId) {
    redirect(session.role === 'DRIVER' ? '/my-route' : '/dashboard');
  }

  // No tenant assigned - show message
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-6">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
          <Truck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          Account Setup Required
        </h1>
        <p className="text-muted-foreground">
          Your account is being set up. Please contact your administrator to complete the process.
        </p>
        <div className="mt-8">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-sm text-muted-foreground/60 hover:text-muted-foreground underline transition-colors"
            >
              Sign out and try again
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
