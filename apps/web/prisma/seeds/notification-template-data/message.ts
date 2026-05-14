import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const messageTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'message.received',
    category: NotificationCategory.MESSAGE,
    displayName: 'New Message Received',
    description: 'Sent when a user receives a new direct message in the fleet messaging system.',
    defaultSubject: 'New message from {{senderName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'New message',
      paragraphTextWithVars:
        '{{senderName}} sent you a message: "{{preview}}"',
      ctaLabel: 'View Message',
      ctaUrl: '{{threadUrl}}',
      footerNote: 'Reply directly in DriveCommand.',
    }),
    availableVariables: [
      { name: 'senderId', description: 'Internal ID of the message sender', sampleValue: 'user_abc' },
      { name: 'senderName', description: 'Full name of the message sender', sampleValue: 'John Smith' },
      { name: 'preview', description: 'Short preview of the message content', sampleValue: 'Can you confirm the pickup time?' },
      { name: 'threadUrl', description: 'URL to the message thread', sampleValue: 'https://app.drivecommand.com/driver/messages' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'senderId' }],
    isActive: true,
    inAppEnabled: true,
  },
  {
    triggerKey: 'message.broadcast',
    category: NotificationCategory.MESSAGE,
    displayName: 'Fleet Broadcast Sent',
    description: 'Sent to all drivers when an owner sends a broadcast fleet message.',
    defaultSubject: 'Fleet announcement from {{senderName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Fleet announcement',
      paragraphTextWithVars:
        '{{senderName}} sent a message to all drivers ({{recipientCount}} recipients): "{{preview}}"',
      ctaLabel: 'View Messages',
      ctaUrl: 'https://app.drivecommand.com/driver/messages',
    }),
    availableVariables: [
      { name: 'senderName', description: 'Full name of the broadcaster', sampleValue: 'John Smith' },
      { name: 'preview', description: 'Short preview of the broadcast content', sampleValue: 'All drivers: new fuel card policy effective Monday.' },
      { name: 'recipientCount', description: 'Number of drivers receiving the broadcast', sampleValue: '12' },
    ],
    defaultRecipients: [{ type: 'role', role: 'DRIVER' }],
    isActive: true,
    inAppEnabled: true,
  },
];
