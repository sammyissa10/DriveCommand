import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const { userId, sessionClaims } = await auth();

  // Not authenticated - redirect to sign-in
  if (!userId) {
    redirect("/sign-in");
  }

  // Check if tenant is provisioned
  const privateMetadata = sessionClaims?.privateMetadata as
    | { tenantId?: string }
    | undefined;
  const tenantId = privateMetadata?.tenantId;

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
          </div>
        </div>
      </body>
    </html>
  );
}
