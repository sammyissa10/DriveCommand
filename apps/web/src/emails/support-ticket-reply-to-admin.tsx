import * as React from 'react';
import { Shell, Button, colors, fonts, fontSizes, lineHeights, space } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface SupportTicketReplyToAdminEmailProps {
  ticketNumber: string;
  title: string;
  body: string;
  submitterEmail: string;
  ticketUrl: string;
}

// No explicit `color` — see fleet-message-notification.tsx for why an inline
// colour here would defeat the body cell's dark-mode override.
const quoteStyle: React.CSSProperties = {
  fontFamily: fonts.bodyStack,
  fontSize: fontSizes.small,
  lineHeight: lineHeights.small,
  margin: `0 0 ${space[4]} 0`,
  padding: `${space[3]} ${space[4]}`,
  borderLeft: `3px solid ${colors.signalBlue}`,
  backgroundColor: colors.bone,
  whiteSpace: 'pre-wrap',
};

export function SupportTicketReplyToAdminEmail({
  ticketNumber,
  title,
  body,
  submitterEmail,
  ticketUrl,
}: SupportTicketReplyToAdminEmailProps) {
  // Truncate message preview to 300 chars
  const preview = body.length > 300 ? body.slice(0, 300) + '...' : body;

  return (
    <Shell
      preheader={`Owner reply on ticket ${ticketNumber} — ${title}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Owner reply — support ticket</h2>
      <p>An owner has replied to their support ticket.</p>
      <p><strong>Ticket:</strong> {ticketNumber}</p>
      <p><strong>Title:</strong> {title}</p>
      <p><strong>From:</strong> {submitterEmail}</p>
      <p><strong>Message preview:</strong></p>
      <blockquote style={quoteStyle}>{preview}</blockquote>
      <Button href={ticketUrl} label="View thread" />
      <p>This is an automated notification from the DriveCommand support system.</p>
    </Shell>
  );
}
