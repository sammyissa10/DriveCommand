import { auth, clerkClient } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";

export default async function OnboardingPage() {
  const { userId, sessionClaims } = await auth();

  // Not authenticated - redirect to sign-in
  if (!userId) {
    redirect("/sign-in");
  }

  // Check if tenant is provisioned (from session claims first)
  const privateMetadata = sessionClaims?.privateMetadata as
    | { tenantId?: string }
    | undefined;
  let tenantId = privateMetadata?.tenantId;

  // Fallback: directly fetch user metadata from Clerk API
  // (session token may not have updated claims yet)
  if (!tenantId) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      tenantId = (user.privateMetadata as { tenantId?: string })?.tenantId;
    } catch (e) {
      console.error("Failed to fetch user metadata from Clerk:", e);
    }
  }

  // Tenant is ready - onboarding complete, redirect to dashboard
  if (tenantId) {
    redirect("/dashboard");
  }

  // Waiting for webhook to provision tenant
  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content="3" />
      </head>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
              <Truck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Setting up your workspace...
            </h1>
            <p className="text-muted-foreground">This usually takes a few seconds.</p>
            <div className="mt-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
            <div className="mt-8">
              <SignOutButton redirectUrl="/sign-in">
                <button className="text-sm text-muted-foreground/60 hover:text-muted-foreground underline transition-colors">
                  Sign out and try again
                </button>
              </SignOutButton>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
