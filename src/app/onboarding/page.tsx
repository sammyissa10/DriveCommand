import { auth, clerkClient } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";

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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold text-gray-900">
              Setting up your workspace...
            </h1>
            <p className="text-gray-600">This usually takes a few seconds.</p>
            <div className="mt-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            </div>
            <div className="mt-8">
              <SignOutButton redirectUrl="/sign-in">
                <button className="text-sm text-gray-400 hover:text-gray-600 underline">
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
