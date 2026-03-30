import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Sentry configs are loaded via sentry.*.config.ts files.
  // This hook adds process-level error handling for unhandled promise rejections
  // and uncaught exceptions that occur outside of request handlers.

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    process.on('unhandledRejection', (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      console.error('[FATAL] Unhandled promise rejection:', error);
      Sentry.captureException(error, {
        extra: { type: 'unhandledRejection' },
      });
    });

    process.on('uncaughtException', (error) => {
      console.error('[FATAL] Uncaught exception:', error);
      Sentry.captureException(error, {
        extra: { type: 'uncaughtException' },
      });
      // Let Node.js exit naturally after Sentry flush
    });
  }
}
