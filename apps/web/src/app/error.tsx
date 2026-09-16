'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@/lib/logger';

/**
 * Root error boundary.
 *
 * quick-621 — a route group's error.tsx does NOT catch an error thrown by that group's
 * own layout.tsx; the PARENT segment's boundary does. For (owner)/layout.tsx (and every
 * other group layout) the parent is the app root, which had no error.tsx, so a layout
 * error fell through to global-error.tsx — an unstyled page that also replaces the root
 * layout. That absence is part of why (owner)/layout.tsx swallowed its data failures
 * behind a default render: throwing had nowhere reasonable to land. This boundary is
 * where a failed layout read now goes, inside the root layout, logged with the error in
 * slot 2 (quick-603's arity).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('[root-error-boundary] render error:', error, { digest: error.digest });
  }, [error]);

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-lg mx-auto text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-muted-foreground">
          We couldn&apos;t load this page. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
