/**
 * Send driver invitation email via Resend.
 */

import { resend, FROM_EMAIL } from './resend-client';
import { DriverInvitationEmail } from '@/emails/driver-invitation';

export interface DriverInvitationEmailData {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
}

/**
 * Send a driver invitation email.
 * Throws error if send fails.
 */
export async function sendDriverInvitation(
  toEmail: string,
  data: DriverInvitationEmailData
): Promise<{ id: string }> {
  const subject = `You're invited to join ${data.organizationName} on DriveCommand`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject,
    react: DriverInvitationEmail(data),
  });

  if (!result.data?.id) {
    throw new Error(
      `Failed to send driver invitation email: ${result.error?.message || 'Unknown error'}`
    );
  }

  return { id: result.data.id };
}
