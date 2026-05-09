import { sendEmail } from '@/lib/email/gmail-client';
import { SupportTicketCreatedEmail } from '@/emails/support-ticket-created';
import { SupportTicketReplyToAdminEmail } from '@/emails/support-ticket-reply-to-admin';
import React from 'react';
import { logger } from '@/lib/logger';

// The DriveCommand team inbox — falls back to GMAIL_USER if not set
function getSupportRecipient(): string {
  return process.env.DRIVECOMMAND_SUPPORT_EMAIL || process.env.GMAIL_USER || '';
}

// Domains that have no mailbox and will always bounce. Easy to extend — just add entries.
const UNDELIVERABLE_DOMAINS = new Set([
  'drivecommand.com',
  'example.com',
  'test.com',
  'localhost',
]);

/**
 * Returns false for empty emails or emails whose domain is known to be non-deliverable.
 * Used to skip fire-and-forget notifications before they reach Gmail and bounce.
 */
function isDeliverableEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !UNDELIVERABLE_DOMAINS.has(domain);
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
    logger.warn('[sendNewTicketNotification] No support email recipient configured (DRIVECOMMAND_SUPPORT_EMAIL or GMAIL_USER)');
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
 * Skips silently when the owner's email is on a non-deliverable domain (e.g. demo accounts).
 */
export async function sendAdminReplyNotification(params: AdminReplyNotificationParams): Promise<void> {
  if (!isDeliverableEmail(params.ownerEmail)) {
    logger.warn('[sendAdminReplyNotification] Skipping email to undeliverable address', { email: params.ownerEmail, ticketNumber: params.ticketNumber });
    return;
  }

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
    logger.warn('[sendOwnerReplyNotification] No support email recipient configured (DRIVECOMMAND_SUPPORT_EMAIL or GMAIL_USER)');
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
