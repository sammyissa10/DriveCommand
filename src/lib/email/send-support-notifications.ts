import { sendEmail } from '@/lib/email/gmail-client';
import { SupportTicketCreatedEmail } from '@/emails/support-ticket-created';
import { SupportTicketReplyToAdminEmail } from '@/emails/support-ticket-reply-to-admin';
import React from 'react';

// The DriveCommand team inbox — falls back to GMAIL_USER if not set
function getSupportRecipient(): string {
  return process.env.DRIVECOMMAND_SUPPORT_EMAIL || process.env.GMAIL_USER || '';
}

export interface NewTicketNotificationParams {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  submitterEmail: string;
  tenantId: string;
  ticketUrl: string;
}

export interface OwnerReplyNotificationParams {
  ticketNumber: string;
  title: string;
  body: string;
  submitterEmail: string;
  ticketUrl: string;
}

/**
 * Notify the DriveCommand team when a new support ticket is submitted.
 */
export async function sendNewTicketNotification(params: NewTicketNotificationParams): Promise<void> {
  const to = getSupportRecipient();
  if (!to) {
    console.warn('[sendNewTicketNotification] No support email recipient configured (DRIVECOMMAND_SUPPORT_EMAIL or GMAIL_USER)');
    return;
  }

  await sendEmail({
    to,
    subject: `[DriveCommand Support] New Ticket ${params.ticketNumber}: ${params.title}`,
    react: React.createElement(SupportTicketCreatedEmail, {
      ticketNumber: params.ticketNumber,
      title: params.title,
      category: params.category,
      priority: params.priority,
      submitterEmail: params.submitterEmail,
      ticketUrl: params.ticketUrl,
    }),
  });
}

export interface AdminReplyNotificationParams {
  ticketNumber: string;
  title: string;
  body: string;
  ownerEmail: string;
  ticketUrl: string;
}

/**
 * Notify the ticket owner (by email) when an admin replies to their support ticket.
 */
export async function sendAdminReplyNotification(params: AdminReplyNotificationParams): Promise<void> {
  const { SupportTicketReplyToOwnerEmail } = await import('@/emails/support-ticket-reply-to-owner');
  await sendEmail({
    to: params.ownerEmail,
    subject: `[${params.ticketNumber}] Support Team Reply — ${params.title}`,
    react: SupportTicketReplyToOwnerEmail(params),
  });
}

/**
 * Notify the DriveCommand team when an owner replies to a support ticket.
 */
export async function sendOwnerReplyNotification(params: OwnerReplyNotificationParams): Promise<void> {
  const to = getSupportRecipient();
  if (!to) {
    console.warn('[sendOwnerReplyNotification] No support email recipient configured (DRIVECOMMAND_SUPPORT_EMAIL or GMAIL_USER)');
    return;
  }

  await sendEmail({
    to,
    subject: `[DriveCommand Support] Owner Reply on ${params.ticketNumber}: ${params.title}`,
    react: React.createElement(SupportTicketReplyToAdminEmail, {
      ticketNumber: params.ticketNumber,
      title: params.title,
      body: params.body,
      submitterEmail: params.submitterEmail,
      ticketUrl: params.ticketUrl,
    }),
  });
}
