'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@/lib/logger';

export default function OwnerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to browser console so it's visible in Vercel function logs and browser devtools.
    //
    // quick-603 — HAND-EDITED, not part of Task 5's mechanical sweep. `error`
    // here is a real `Error` arriving as a PROP, not a caught value, so there is
    // no `catch` binding for the classifier to find; it proposed bucket (b) and
    // a human read moved it to (a). The error goes in slot 2, which is what
    // gets Sentry the real exception instead of `new Error('[object Object]')`.
    // `digest` stays in the context because it is Next's own identifier for the
    // server-side error and is not a property of the Error itself.
    logger.error('[owner-error-boundary] Server Component render error:', error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-lg mx-auto text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-muted-foreground">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/carrier/dashboard"
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
