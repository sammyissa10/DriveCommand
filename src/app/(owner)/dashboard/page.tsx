/**
 * Dashboard page - Owner portal landing page
 *
 * This is the post-login destination (NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard).
 * Real dashboard content will be implemented in Phase 10.
 */
export default function DashboardPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-3xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-lg text-gray-600">
        Welcome to DriveCommand. Your fleet management dashboard will appear here.
      </p>
    </div>
  );
}
