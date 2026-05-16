/**
 * WRAPPER (quick-352): Mirrors send-driver-invitation.ts but routes through the
 * dedicated `manager.invited` trigger so team-permission invites get their own
 * template + audit log rather than reusing `driver.invited`.
 * Legacy Gmail SMTP path is preserved as the fallback inside the try/catch.
 */

import { sendEmail } from './gmail-client';
import { DriverInvitationEmail } from '@/emails/driver-invitation';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface ManagerInvitationEmailData {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
  /** Tenant the email is being sent on behalf of — drives template lookup and audit log. */
  tenantId: string;
}

/**
 * Send a team-member (manager) invitation email.
 * Routes through dispatchNotification('manager.invited'). Falls back to legacy Gmail SMTP
 * only when the dispatcher itself throws.
 */
export async function sendManagerInvitation(
  toEmail: string,
  data: ManagerInvitationEmailData
): Promise<{ id: string }> {
  try {
    const result = await dispatchNotification('manager.invited', {
      tenantId: data.tenantId,
      payload: {
        managerEmail: toEmail,
        firstName: data.firstName,
        tenantName: data.organizationName,
        inviteUrl: data.acceptUrl,
      },
      relatedEntity: { type: 'DriverInvitation', id: toEmail },
    });
    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendManagerInvitation(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. Reuses DriverInvitationEmail react template
 *  to avoid introducing a new email component in this quick task; copy is generic enough. */
async function legacySendManagerInvitation(
  toEmail: string,
  data: ManagerInvitationEmailData
): Promise<{ id: string }> {
  const subject = `You're invited to join ${data.organizationName} on DriveCommand`;

  return sendEmail({
    to: toEmail,
    subject,
    react: DriverInvitationEmail(data),
  });
}
