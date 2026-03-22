/**
 * Send owner invitation email via Gmail SMTP.
 */

import { sendEmail } from './gmail-client';
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

  return sendEmail({
    to: toEmail,
    subject,
    react: OwnerInvitationEmail(data),
  });
}
