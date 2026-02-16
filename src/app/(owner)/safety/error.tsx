'use client';

import Link from 'next/link';

export default function SafetyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto p-6">
      <div className="max-w-lg mx-auto text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Safety Dashboard Unavailable</h1>
        <p className="text-muted-foreground">
          {error.message || 'Failed to load safety data. The safety event tables may not be initialized yet.'}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
