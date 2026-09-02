import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface OwnerInvitationEmailProps {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
}

export function OwnerInvitationEmail({
  firstName,
  lastName,
  organizationName,
  acceptUrl,
  expiresAt,
}: OwnerInvitationEmailProps) {
  return (
    <Shell
      preheader={`${organizationName} is ready — set up your DriveCommand owner account`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Welcome to DriveCommand</h2>
      <p>Hello {firstName} {lastName},</p>
      <p>
        {organizationName} has been created on DriveCommand and you have been
        designated as the owner. Click the button below to create your account
        and start managing your fleet.
      </p>
      <Button href={acceptUrl} label="Set up your account" />
      <p>This invitation expires on {expiresAt}.</p>
      <p>If you did not expect this invitation, you can safely ignore this email.</p>
    </Shell>
  );
}
