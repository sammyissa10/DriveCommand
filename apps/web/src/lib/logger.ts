import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${ctx}`;
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatMessage('debug', message, context));
    }
  },
  info(message: string, context?: Record<string, unknown>) {
    console.log(formatMessage('info', message, context));
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(formatMessage('warn', message, context));
    Sentry.captureMessage(message, { level: 'warning', extra: context });
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    const errorObj = error instanceof Error ? error : new Error(String(error ?? message));
    console.error(formatMessage('error', message, context), errorObj);
    Sentry.captureException(errorObj, { extra: { ...context, originalMessage: message } });
  },
};
