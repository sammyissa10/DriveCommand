import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const userTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'user.welcome',
    category: NotificationCategory.USER,
    displayName: 'Welcome Email',
    description: 'Sent to a user after they complete signup or accept an invite.',
    defaultSubject: 'Welcome to DriveCommand, {{firstName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Welcome to DriveCommand',
      paragraphTextWithVars:
        'Hi {{firstName}}, your account is ready. Log in to start managing loads, drivers, and trucks.',
      ctaLabel: 'Open DriveCommand',
      ctaUrl: 'https://app.drivecommand.com',
      footerNote: 'Questions? Reply to this email and we will help.',
    }),
    availableVariables: [
      { name: 'firstName', description: "The user's first name", sampleValue: 'Sammy' },
      { name: 'email', description: "The user's email address", sampleValue: 'sammy@example.com' },
      { name: 'userId', description: "The user's internal ID", sampleValue: 'usr_123' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'userId' }],
    // Deactivated (quick-325, Phase 41 wire-up batch 1):
    // Supabase Auth sends the welcome email natively. Wiring this trigger
    // would cause duplicate emails to land in the user's inbox.
    // Re-activate ONLY if Supabase Auth's native welcome email is disabled.
    isActive: false,
    inAppEnabled: true,
  },
  {
    triggerKey: 'user.invited',
    category: NotificationCategory.USER,
    displayName: 'User Invited',
    description: 'Sent to a newly invited user with their invite link.',
    defaultSubject: '{{inviterName}} invited you to {{tenantName}} on DriveCommand',
    defaultBlockJson: buildDefaultTemplate({
      headerText: "You've been invited",
      paragraphTextWithVars:
        '{{inviterName}} has invited you to join {{tenantName}} on DriveCommand. Accept your invite to get started.',
      ctaLabel: 'Accept Invitation',
      ctaUrl: '{{inviteUrl}}',
      footerNote: 'If you did not expect this invitation, you can ignore this email.',
    }),
    availableVariables: [
      { name: 'invitedEmail', description: 'Email address the invite was sent to', sampleValue: 'driver@example.com' },
      { name: 'inviterName', description: 'Full name of the person who sent the invite', sampleValue: 'John Smith' },
      { name: 'tenantName', description: 'Name of the company on DriveCommand', sampleValue: 'Acme Trucking' },
      { name: 'inviteUrl', description: 'URL to accept the invitation', sampleValue: 'https://app.drivecommand.com/accept-invite?token=abc123' },
    ],
    defaultRecipients: [{ type: 'external_email', payloadKey: 'invitedEmail' }],
    isActive: true,
    inAppEnabled: false,
  },
  {
    triggerKey: 'user.password_reset',
    category: NotificationCategory.USER,
    displayName: 'Password Reset',
    description: 'Sent when a user requests a password reset link.',
    defaultSubject: 'Reset your DriveCommand password',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Password Reset Request',
      paragraphTextWithVars:
        'Hi {{firstName}}, we received a request to reset your DriveCommand password. Click the link below to set a new password.',
      ctaLabel: 'Reset Password',
      ctaUrl: '{{resetUrl}}',
      footerNote: 'If you did not request this, no action is needed. The link expires in 1 hour.',
    }),
    availableVariables: [
      { name: 'userId', description: "The user's internal ID", sampleValue: 'usr_123' },
      { name: 'firstName', description: "The user's first name", sampleValue: 'Sammy' },
      { name: 'resetUrl', description: 'Password reset URL', sampleValue: 'https://app.drivecommand.com/reset-password?token=xyz' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'userId' }],
    // Deactivated (quick-325, Phase 41 wire-up batch 1):
    // Supabase Auth sends password reset emails natively via auth.resetPasswordForEmail().
    // Wiring this trigger would cause duplicate emails. Re-activate ONLY if
    // Supabase Auth's native password reset email is disabled.
    isActive: false,
    inAppEnabled: false,
  },
  {
    triggerKey: 'user.role_changed',
    category: NotificationCategory.USER,
    displayName: 'Role Changed',
    description: 'Sent to a user when their role in the system is updated.',
    defaultSubject: 'Your DriveCommand role has been updated',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Your role has changed',
      paragraphTextWithVars:
        'Hi {{firstName}}, your DriveCommand role has been changed from {{oldRole}} to {{newRole}}. Your access level has been updated accordingly.',
      footerNote: 'Contact your account owner if you believe this was a mistake.',
    }),
    availableVariables: [
      { name: 'userId', description: "The user's internal ID", sampleValue: 'usr_123' },
      { name: 'firstName', description: "The user's first name", sampleValue: 'Sammy' },
      { name: 'oldRole', description: 'Previous role name', sampleValue: 'DRIVER' },
      { name: 'newRole', description: 'New role name', sampleValue: 'MANAGER' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'userId' }],
    isActive: true,
    inAppEnabled: true,
  },
];
