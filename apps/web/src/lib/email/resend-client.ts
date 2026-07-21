/**
 * Resend email client singleton for transactional emails.
 *
 * Environment variables:
 * - RESEND_API_KEY: Resend API key
 * - RESEND_FROM_EMAIL: Sender email address (defaults to DriveCommand team address)
 */

import { Resend } from 'resend';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';

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

// Sender must be on a Resend-VERIFIED domain. drivecommand.app is verified;
// drivecommand.io is not (its DNS is on an inaccessible Vercel account), so
// sending as @drivecommand.io gets rejected by Resend (550 unverified domain).
// Replies still go to the real team@drivecommand.io inbox via REPLY_TO_EMAIL.
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DriveCommand <team@drivecommand.app>';
export const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO || 'team@drivecommand.io';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

/**
 * Send an email using Resend.
 * Returns { id } — the real Resend message ID.
 * Throws on Resend API error so callers' catch logic works as expected.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const html = await render(options.react);
  const replyTo = options.replyTo ?? 'team@drivecommand.io';

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html,
    replyTo,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }

  return { id: data!.id };
}
