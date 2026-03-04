/**
 * Send owner invitation email via Resend.
 */

import { resend, FROM_EMAIL } from './resend-client';
import { OwnerInvitationEmail } from '@/emails/owner-invitation';

export interface OwnerInvitationEmailData {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
}

/**
 * Send an owner invitation email.
 * Throws error if send fails.
 */
export async function sendOwnerInvitation(
  toEmail: string,
  data: OwnerInvitationEmailData
): Promise<{ id: string }> {
  const subject = `Set up your ${data.organizationName} account on DriveCommand`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject,
    react: OwnerInvitationEmail(data),
  });

  if (!result.data?.id) {
    throw new Error(
      `Failed to send owner invitation email: ${result.error?.message || 'Unknown error'}`
    );
  }

  return { id: result.data.id };
}
