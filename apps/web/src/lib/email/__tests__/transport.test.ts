/**
 * Transport-layer guards: sender identity, the plain-text alternative part, and
 * the unsubscribe headers.
 *
 * The plain-text tests deliberately run against the FINAL SHELL RENDER of the
 * real `trip.reminder` body — not a hand-written HTML fixture. A fixture would
 * be written to pass: the three things that actually leak into the text part
 * (the preheader's zero-width padding, the `<style>` block, and the bulletproof
 * button's nested table) only exist once the shell has rendered.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@react-email/render';
import * as React from 'react';

import { htmlToPlainText } from '../html-to-text';
import { formatAddress, parseAddress } from '../sender-config';
import { buildUnsubscribeHeaders } from '../unsubscribe';
import DynamicTemplateEmail from '@/emails/dynamic-template';
import { transformBodyHtml } from '@/lib/notifications/body-html-transform';

/** The real trip.reminder body, as Tiptap emits it. */
const TRIP_REMINDER_BODY = [
  '<h2>Trip coming up</h2>',
  '<p>Mike Rodriguez, trip DC-2026-00412 has not been started. ',
  'Truck T-104, first stop Hall Ford, West Bend, departure Tue 26 Aug, 06:30.</p>',
  '<p><a href="https://app.drivecommand.com/carrier/trips/trip_abc">Open trip</a></p>',
].join('');

async function renderTripReminder(): Promise<string> {
  return render(
    React.createElement(DynamicTemplateEmail, {
      bodyHtml: transformBodyHtml(TRIP_REMINDER_BODY).html,
      statusBar: { tone: 'attention' as const, label: 'Not started — departs in under 24 hours' },
      preferencesUrl: 'https://app.drivecommand.com/settings/my-notifications',
      logoBaseUrl: 'https://app.drivecommand.com',
    }),
  );
}

describe('htmlToPlainText — against the real shell render', () => {
  it('renders the CTA as "label (url)" on a single line', async () => {
    const text = htmlToPlainText(await renderTripReminder());

    expect(text).toContain('Open trip (https://app.drivecommand.com/carrier/trips/trip_abc)');

    // …and exactly once. The button is a VML twin plus a table plus a
    // plain-text URL note; a naive strip prints the label or URL three times.
    const labelCount = (text.match(/Open trip/g) ?? []).length;
    expect(labelCount).toBe(1);
    const urlCount = (text.match(/carrier\/trips\/trip_abc/g) ?? []).length;
    expect(urlCount).toBe(1);
  });

  it('contains no table, div or style remnants', async () => {
    const text = htmlToPlainText(await renderTripReminder());

    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(text).not.toMatch(/border-collapse|background-color|font-family/);
    expect(text).not.toMatch(/roundrect|endif|mso/i);
  });

  it('does not contain the preheader or its zero-width padding', async () => {
    const html = await renderTripReminder();
    const text = htmlToPlainText(html);

    // The preheader IS in the html…
    expect(html).toContain('dc-preheader');
    // …and must not survive into the text part.
    expect(text).not.toContain('dc-preheader');
    // No zero-width joiners / hair spaces anywhere.
    expect(text).not.toMatch(/[​-‍  ﻿]/);
  });

  it('keeps the body readable and wrapped', async () => {
    const text = htmlToPlainText(await renderTripReminder());

    expect(text).toContain('Trip coming up');
    expect(text).toContain('Mike Rodriguez,');
    expect(text).toContain('Truck T-104');
    // Footer survives.
    expect(text).toContain('You run the trucks. We run the rest.');

    for (const line of text.split('\n')) {
      // Long unbreakable tokens (URLs) are allowed to exceed the column.
      if (line.includes('http')) continue;
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  it('never throws and returns empty for empty input', () => {
    expect(htmlToPlainText('')).toBe('');
    // @ts-expect-error — deliberately wrong type
    expect(() => htmlToPlainText(null)).not.toThrow();
  });
});

describe('sender-config — address composition', () => {
  it('composes a correct from string from a bare address with no display name', () => {
    expect(formatAddress('DriveCommand', 'team@drivecommand.app')).toBe(
      'DriveCommand <team@drivecommand.app>',
    );
  });

  it('quotes a display name containing a comma, which would otherwise split the header', () => {
    expect(formatAddress('Acme, Inc.', 'team@drivecommand.app')).toBe(
      '"Acme, Inc." <team@drivecommand.app>',
    );
  });

  it('parses a pre-composed env value rather than treating it as an address', () => {
    // The value currently deployed. Treating it as bare would emit
    // `Name <DriveCommand <team@…>>` and every send would be rejected.
    expect(parseAddress('DriveCommand <team@drivecommand.app>')).toEqual({
      name: 'DriveCommand',
      email: 'team@drivecommand.app',
    });
  });

  it('parses a bare address', () => {
    expect(parseAddress('team@drivecommand.app')).toEqual({ email: 'team@drivecommand.app' });
  });

  it('unwraps a quoted display name', () => {
    expect(parseAddress('"Acme, Inc." <team@drivecommand.app>')).toEqual({
      name: 'Acme, Inc.',
      email: 'team@drivecommand.app',
    });
  });
});

describe('sender-config — resolveSenderConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('prefers the database row over env', async () => {
    vi.doMock('@/lib/db/prisma', () => ({
      prisma: {
        $transaction: async (fn: (tx: unknown) => unknown) =>
          fn({
            $executeRaw: async () => 0,
            notificationEmailConfig: {
              findFirst: async () => ({
                fromName: 'Fleet Ops',
                fromEmail: 'ops@drivecommand.app',
                replyTo: 'reply@drivecommand.io',
              }),
            },
          }),
      },
    }));
    vi.stubEnv('RESEND_FROM_EMAIL', 'EnvName <env@drivecommand.app>');

    const { resolveSenderConfig, __clearSenderConfigCache } = await import('../sender-config');
    __clearSenderConfigCache();
    const config = await resolveSenderConfig();

    expect(config.source).toBe('database');
    expect(config.from).toBe('Fleet Ops <ops@drivecommand.app>');
    expect(config.replyTo).toBe('reply@drivecommand.io');
  });

  it('falls back to env when there is no row, keeping the display name', async () => {
    vi.doMock('@/lib/db/prisma', () => ({
      prisma: {
        $transaction: async (fn: (tx: unknown) => unknown) =>
          fn({
            $executeRaw: async () => 0,
            notificationEmailConfig: { findFirst: async () => null },
          }),
      },
    }));
    vi.stubEnv('RESEND_FROM_EMAIL', 'team@drivecommand.app');
    vi.stubEnv('RESEND_FROM_NAME', 'DriveCommand');

    const { resolveSenderConfig, __clearSenderConfigCache } = await import('../sender-config');
    __clearSenderConfigCache();
    const config = await resolveSenderConfig();

    expect(config.source).toBe('env');
    // The defect this replaces: a bare address used to lose the display name.
    expect(config.from).toBe('DriveCommand <team@drivecommand.app>');
  });

  it('falls back to env rather than throwing when the read fails', async () => {
    vi.doMock('@/lib/db/prisma', () => ({
      prisma: {
        $transaction: async () => {
          throw new Error('connection refused');
        },
      },
    }));
    vi.stubEnv('RESEND_FROM_EMAIL', 'team@drivecommand.app');
    vi.stubEnv('RESEND_FROM_NAME', 'DriveCommand');

    const { resolveSenderConfig, __clearSenderConfigCache } = await import('../sender-config');
    __clearSenderConfigCache();

    await expect(resolveSenderConfig()).resolves.toMatchObject({
      source: 'env',
      from: 'DriveCommand <team@drivecommand.app>',
    });
  });
});

describe('unsubscribe headers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('always sets List-Unsubscribe with a working mailto first', () => {
    const headers = buildUnsubscribeHeaders('https://app.drivecommand.com/settings/my-notifications');

    expect(headers['List-Unsubscribe']).toContain('<mailto:');
    expect(headers['List-Unsubscribe'].indexOf('mailto:')).toBeLessThan(
      headers['List-Unsubscribe'].indexOf('https://'),
    );
    expect(headers['List-Unsubscribe']).toContain('/settings/my-notifications');
  });

  it('omits List-Unsubscribe-Post when no one-click endpoint is configured', () => {
    // RFC 8058 one-click POSTs with no session. Our preferences page is
    // login-gated, so advertising it would make the provider record a FAILED
    // unsubscribe — worse than not advertising it at all.
    expect(buildUnsubscribeHeaders()['List-Unsubscribe-Post']).toBeUndefined();
  });

  it('sets List-Unsubscribe-Post once a real endpoint is configured', () => {
    vi.stubEnv('EMAIL_ONE_CLICK_UNSUBSCRIBE_URL', 'https://app.drivecommand.com/api/unsubscribe');

    const headers = buildUnsubscribeHeaders();
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(headers['List-Unsubscribe']).toContain('/api/unsubscribe');
  });
});
