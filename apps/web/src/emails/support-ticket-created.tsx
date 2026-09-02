import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface SupportTicketCreatedEmailProps {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  submitterEmail: string;
  ticketUrl: string;
}

export function SupportTicketCreatedEmail({
  ticketNumber,
  title,
  category,
  priority,
  submitterEmail,
  ticketUrl,
}: SupportTicketCreatedEmailProps) {
  return (
    <Shell
      preheader={`Ticket ${ticketNumber} received — ${priority} priority`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>New support ticket</h2>
      <p>A new support ticket has been submitted.</p>
      <p><strong>Ticket:</strong> {ticketNumber}</p>
      <p><strong>Title:</strong> {title}</p>
      <p><strong>Category:</strong> {category}</p>
      <p><strong>Priority:</strong> {priority}</p>
      <p><strong>From:</strong> {submitterEmail}</p>
      <Button href={ticketUrl} label="View ticket in admin dashboard" />
      <p>This is an automated notification from the DriveCommand support system.</p>
    </Shell>
  );
}
