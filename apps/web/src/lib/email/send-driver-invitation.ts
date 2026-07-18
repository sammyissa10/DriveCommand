/**
 * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
 * The original implementation is preserved below as `legacy*` and serves as the
 * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
 * two weeks of stable production operation.
 */

import { sendEmail } from './gmail-client';
import { DriverInvitationEmail } from '@/emails/driver-invitation';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface DriverInvitationEmailData {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
  /** Tenant the email is being sent on behalf of — drives template lookup and audit log. */
  tenantId: string;
}

/**
 * Send a driver invitation email.
 * Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when
 * the dispatcher itself throws.
 */
export async function sendDriverInvitation(
  toEmail: string,
  data: DriverInvitationEmailData
): Promise<{ id: string }> {
  try {
    const result = await dispatchNotification('driver.invited', {
      tenantId: data.tenantId,
      payload: {
        driverEmail: toEmail,
        driverFirstName: data.firstName,
        tenantName: data.organizationName,
        inviteUrl: data.acceptUrl,
      },
      relatedEntity: { type: 'DriverInvitation', id: toEmail },
    });

    if (result.sent === 0 && result.failed > 0) {
      console.warn('[notifications] dispatcher reported failure (sent:0 failed:%d), falling back to legacy sender', result.failed);
      return legacySendDriverInvitation(toEmail, data);
    }

    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendDriverInvitation(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. */
async function legacySendDriverInvitation(
  toEmail: string,
  data: DriverInvitationEmailData
): Promise<{ id: string }> {
  const subject = `You're invited to join ${data.organizationName} on DriveCommand`;

  return sendEmail({
    to: toEmail,
    subject,
    react: DriverInvitationEmail(data),
  });
}
