/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { sendEmail } from './gmail-client';
import { OwnerInvitationEmail } from '@/emails/owner-invitation';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface OwnerInvitationEmailData {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
  /** Optional: if provided, routes through dispatchNotification. */
  tenantId?: string;
}

/**
 * Send an owner invitation email.
 * Routes through dispatchNotification when tenantId is available; falls back to
 * legacy Gmail SMTP on dispatcher error.
 */
export async function sendOwnerInvitation(
  toEmail: string,
  data: OwnerInvitationEmailData
): Promise<{ id: string }> {
  try {
    if (!data.tenantId) {
      return await legacySendOwnerInvitation(toEmail, data);
    }
    const result = await dispatchNotification('user.invited', {
      tenantId: data.tenantId,
      payload: {
        invitedEmail: toEmail,
        inviterName: data.organizationName,
        tenantName: data.organizationName,
        inviteUrl: data.acceptUrl,
      },
      relatedEntity: { type: 'UserInvitation', id: toEmail },
    });
    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendOwnerInvitation(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendOwnerInvitation(
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
