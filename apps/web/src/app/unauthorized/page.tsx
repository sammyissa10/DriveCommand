import Link from "next/link";
import { ShieldX } from "lucide-react";

/**
 * Unauthorized access page
 *
 * Shown when users try to access a portal they don't have permission for.
 * Portal layouts redirect unauthorized users here.
 */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <ShieldX className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="mb-3 text-3xl font-bold text-foreground">Access Denied</h1>
        <p className="mb-8 text-muted-foreground">
          You don&apos;t have permission to access this page.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}
