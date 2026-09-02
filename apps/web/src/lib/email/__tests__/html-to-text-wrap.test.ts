/**
 * quick-575 — the plain-text footer must never orphan a label from its URL.
 *
 * quick-574 shipped `<a href="{BASE}/settings/my-notifications">Notification
 * preferences</a>` in `Footer.tsx`. `WRAP_COLUMN` is 78 and `hardWrap`'s
 * greedy fill breaks on the FIRST word that would push a line over that
 * limit — so at `https://drive-command.vercel.app` (the Vercel preview
 * domain) the label was already orphaned on its own line with the URL
 * starting the next; at the production domain it survived by only two
 * characters. This file drives the REAL `htmlToPlainText` (not a
 * reimplementation of `hardWrap`) over footer-shaped HTML.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { htmlToPlainText } from '../html-to-text';

const SUPPORT_ANCHOR = '<a href="mailto:team@drivecommand.io">Support</a>';

function footerHtml(preferencesUrl: string): string {
  return `<p><a href="${preferencesUrl}">Notification preferences</a> · ${SUPPORT_ANCHOR}</p>`;
}

describe('htmlToPlainText — footer label/URL cohesion', () => {
  const BASE_URLS = [
    'https://drivecommand.app',
    // The case that was orphaned before this fix.
    'https://drive-command.vercel.app',
    'http://localhost:3000',
  ];

  for (const base of BASE_URLS) {
    it(`keeps "Notification preferences" with its URL at base "${base}"`, () => {
      const url = `${base}/settings/my-notifications`;
      const text = htmlToPlainText(footerHtml(url));
      const lines = text.split('\n');

      const labelLine = lines.find((l) => l.includes('Notification preferences'));

      expect(
        labelLine,
        `No line contained the full "Notification preferences" label. Lines:\n${text}`,
      ).toBeDefined();
      expect(labelLine).toContain('/settings/my-notifications');
    });
  }

  it('keeps the pair together even when the base URL is far past 78 characters', () => {
    // Deliberately absurd length so the fix cannot be passing by coincidence
    // of the pair "happening to fit".
    const longBase =
      'https://a-very-long-subdomain-chosen-to-blow-past-the-wrap-column-by-a-wide-margin.example.com';
    const url = `${longBase}/settings/my-notifications`;
    const text = htmlToPlainText(footerHtml(url));
    const lines = text.split('\n');

    const labelLine = lines.find((l) => l.includes('Notification preferences'));

    expect(
      labelLine,
      `No line contained the full "Notification preferences" label. Lines:\n${text}`,
    ).toBeDefined();
    expect(labelLine).toContain('/settings/my-notifications');
    expect(labelLine).toContain(longBase);
  });

  it('does not double a bare URL whose anchor text already IS the URL', () => {
    const bare = 'https://drivecommand.app/track/abc123';
    const html = `<p>Track it at <a href="${bare}">${bare}</a></p>`;
    const text = htmlToPlainText(html);

    const occurrences = text.split(bare).length - 1;
    expect(occurrences).toBe(1);
    expect(text).toContain(bare);
  });

  it('still wraps a long ordinary sentence with no links at 78 columns', () => {
    const sentence =
      'This is a perfectly ordinary sentence with no links in it whatsoever, ' +
      'written specifically to be long enough that it must wrap onto more ' +
      'than one line under the standard plain-text convention used everywhere else.';
    const html = `<p>${sentence}</p>`;
    const text = htmlToPlainText(html);
    const lines = text.split('\n').filter(Boolean);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  it('contains no hardcoded "Notification preferences" literal in the source', () => {
    const filePath = path.join(__dirname, '..', 'html-to-text.ts');
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');

    // "was it actually found" floor (quick-546) — this file is well over 1000
    // characters; a near-empty read would mean the path resolved to nothing.
    expect(raw.length).toBeGreaterThan(1000);

    expect(raw).not.toContain('Notification preferences');
  });
});
