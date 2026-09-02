import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface DriverInvitationEmailProps {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
}

export function DriverInvitationEmail({
  firstName,
  lastName,
  organizationName,
  acceptUrl,
  expiresAt,
}: DriverInvitationEmailProps) {
  return (
    <Shell
      preheader={`${organizationName} invited you to join their fleet on DriveCommand`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>You&apos;re invited to DriveCommand</h2>
      <p>Hello {firstName} {lastName},</p>
      <p>
        {organizationName} has invited you to join their fleet on DriveCommand as
        a driver. Click the button below to create your account and get started.
      </p>
      <Button href={acceptUrl} label="Accept invitation" />
      <p>This invitation expires on {expiresAt}.</p>
      <p>If you did not expect this invitation, you can safely ignore this email.</p>
    </Shell>
  );
}
