/**
 * Resend email client for transactional email.
 *
 * Environment variables:
 * - RESEND_API_KEY   — Resend API key
 * - RESEND_FROM_EMAIL / RESEND_FROM_NAME — sender identity fallback; the
 *   database row in `NotificationEmailConfig` takes precedence. See
 *   `sender-config.ts`.
 * - RESEND_REPLY_TO  — reply-to fallback
 *
 * Every send carries a plain-text alternative and List-Unsubscribe headers. See
 * `html-to-text.ts` and `unsubscribe.ts` for what each of those can and cannot
 * do today.
 */

import { Resend } from 'resend';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { resolveSenderConfig } from './sender-config';
import { htmlToPlainText } from './html-to-text';
import { buildUnsubscribeHeaders } from './unsubscribe';

// Lazy-initialized Resend client singleton (only throws when actually used)
let _resendClient: Resend | null = null;

export const resend = new Proxy({} as Resend, {
  get(target, prop) {
    if (!_resendClient) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY environment variable is required. Add it to .env.local — get your key from https://resend.com/api-keys');
      }
      _resendClient = new Resend(apiKey);
    }
    return (_resendClient as any)[prop];
  },
});

/**
 * @deprecated Prefer `resolveSenderConfig()`, which reads the database first.
 *
 * Kept as a named export because it is imported in several places; it now
 * resolves from env ONLY and is a fallback, not the source of truth. It is
 * evaluated lazily rather than at module load so a test can set env first.
 */
export function getEnvFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || 'DriveCommand <team@drivecommand.app>';
}

export const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO || 'team@drivecommand.io';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
  /**
   * Overrides the app-level preferences URL in the List-Unsubscribe header.
   * There is no per-recipient unsubscribe token today — see unsubscribe.ts.
   */
  preferencesUrl?: string;
}

/**
 * Send an email using Resend.
 * Returns { id } — the real Resend message ID.
 * Throws on Resend API error so callers' catch logic works as expected.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const html = await render(options.react);

  // Generated from the FINAL html, so it reflects the shell, the transforms and
  // the button — not the raw body. See html-to-text.ts.
  const text = htmlToPlainText(html);

  const sender = await resolveSenderConfig();
  const replyTo = options.replyTo ?? sender.replyTo;

  const { data, error } = await resend.emails.send({
    from: sender.from,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html,
    text,
    replyTo,
    headers: buildUnsubscribeHeaders(options.preferencesUrl),
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }

  return { id: data!.id };
}
