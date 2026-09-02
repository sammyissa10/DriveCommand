/**
 * AccountExistsEmail — sent when someone attempts to sign up with an email
 * address that already has a DriveCommand account.
 *
 * Extracted out of `src/app/(auth)/sign-up/actions.tsx`, where it was a
 * "minimal inline template for duplicate-email path" — quick-577's hex audit
 * did not count it because it never lived under `src/emails/`. It is now a
 * sibling of every other template and renders through the Shell like the
 * other 19.
 *
 * This is an unsolicited, security-shaped email (the recipient did not ask
 * for it — someone else typed their address into the sign-up form), so the
 * preheader matters more here than anywhere else in the set: it is the only
 * line a wary recipient sees before deciding whether to open it.
 */
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

export function AccountExistsEmail({ signInUrl }: { signInUrl: string }) {
  return (
    <Shell
      preheader="Someone tried to sign up for DriveCommand with your email address"
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Someone tried to sign up with your email</h2>
      <p>
        Hi there — someone just tried to sign up for DriveCommand using your
        email address.
      </p>
      <p>If that was you, you already have an account. Sign in below:</p>
      <Button href={signInUrl} label="Sign in to DriveCommand" />
      <p>If it wasn&apos;t you, no action is needed. Your account is safe.</p>
    </Shell>
  );
}
