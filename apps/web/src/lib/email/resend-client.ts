/**
 * Resend email client singleton for transactional emails.
 *
 * Environment variables:
 * - RESEND_API_KEY: Resend API key
 * - RESEND_FROM_EMAIL: Sender email address (defaults to testing address)
 */

import { Resend } from 'resend';

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

// Sender email address
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DriveCommand <onboarding@resend.dev>';
