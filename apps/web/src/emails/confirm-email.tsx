import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

interface ConfirmEmailTemplateProps {
  firstName: string;
  confirmUrl: string;
}

export function ConfirmEmailTemplate({ firstName, confirmUrl }: ConfirmEmailTemplateProps) {
  return (
    <Shell
      preheader={`Confirm your email, ${firstName} — this link is valid for 24 hours`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Hi {firstName},</h2>
      <p>
        Thanks for signing up! Please confirm your email address to keep your
        account secure. This link is valid for 24 hours.
      </p>
      <Button href={confirmUrl} label="Confirm my email" />
      <p>
        If you didn&apos;t create a DriveCommand account, you can safely ignore
        this email.
      </p>
    </Shell>
  );
}
