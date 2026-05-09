/**
 * Email transport — re-exports from resend-client.ts (Resend API).
 *
 * TODO: Once this Resend migration is verified in production, remove
 * GMAIL_USER and GMAIL_APP_PASSWORD from Vercel env vars and .env.local.
 */

export { FROM_EMAIL, sendEmail } from './resend-client';
export type { SendEmailOptions } from './resend-client';
