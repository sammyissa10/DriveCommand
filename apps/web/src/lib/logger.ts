import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Turn a caught value into something `JSON.stringify` will actually render.
 *
 * `logger.warn(msg, { err })` stringifies its context, and `JSON.stringify(new
 * Error('boom'))` is `{}` — `message`, `stack` and `name` are non-enumerable own
 * properties. That is how "page cache read failed" logged `err: {}` for every
 * page of every run and told nobody what had gone wrong.
 *
 * Prisma's error codes (`code`, `meta`) ARE enumerable and survive, so they are
 * picked up by the own-property sweep along with everything else.
 */
export function serializeError(err: unknown): Record<string, unknown> | string {
  if (err === null || err === undefined) return String(err);
  if (typeof err !== 'object') return String(err);

  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(err)) {
    const value = (err as Record<string, unknown>)[key];
    // Keep the stack, but not all forty frames of it.
    out[key] = key === 'stack' && typeof value === 'string'
      ? value.split('\n').slice(0, 6).join('\n')
      : value;
  }
  if (err instanceof Error && !out.name) out.name = err.name;
  return out;
}

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
