import * as React from 'react';
import { Shell, colors, fonts, fontSizes, lineHeights, space } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface FleetMessageNotificationEmailProps {
  recipientName: string;
  senderName: string;
  senderRole: 'DRIVER' | 'OWNER';
  messagePreview: string;
  routeName?: string;
}

// No explicit `color` here — the body cell already sets one (light) and its
// `dc-dark-text` class overrides it (dark) with `!important`; an inline
// colour on this element would win over the ancestor and break dark mode.
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

export function FleetMessageNotificationEmail({
  recipientName,
  senderName,
  senderRole,
  messagePreview,
  routeName,
}: FleetMessageNotificationEmailProps) {
  // Truncate message preview to 300 chars
  const preview =
    messagePreview.length > 300 ? messagePreview.slice(0, 300) + '...' : messagePreview;

  const roleLabel = senderRole === 'DRIVER' ? 'Driver' : 'Dispatch';

  return (
    <Shell
      preheader={`New message from ${senderName} (${roleLabel})${routeName ? ` — ${routeName}` : ''}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>New fleet message</h2>
      <p>
        Hi {recipientName}, you have a new message from {senderName} ({roleLabel}).
      </p>
      {routeName ? (
        <p><strong>Route:</strong> {routeName}</p>
      ) : null}
      <p><strong>{senderName}</strong> ({roleLabel}) sent a message:</p>
      <blockquote style={quoteStyle}>{preview}</blockquote>
      <p>This is an automated notification from the DriveCommand fleet messaging system.</p>
    </Shell>
  );
}
