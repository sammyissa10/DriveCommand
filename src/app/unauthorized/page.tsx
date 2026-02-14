import Link from "next/link";

/**
 * Unauthorized access page
 *
 * Shown when users try to access a portal they don't have permission for.
 * Portal layouts redirect unauthorized users here.
 */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">Access Denied</h1>
        <p className="mb-8 text-lg text-gray-600">
          You don't have permission to access this page.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}
