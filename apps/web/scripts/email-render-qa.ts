/**
 * email-render-qa.ts
 *
 * Renders the dispatcher shell with a representative body and screenshots it in
 * the four states that actually break email: light, dark, images-on and
 * images-blocked.
 *
 * WHY THE PAGE IS SERVED OVER HTTP AND NOT OPENED AS file://
 * ----------------------------------------------------------
 * Playwright's request interception does not apply to `file://` subresources,
 * so an images-blocked run loaded from disk would quietly load the logo anyway
 * and the screenshot would be indistinguishable from images-on. The check would
 * pass by proving nothing — the same shape as a green test that never ran. A
 * throwaway static server makes both the load and the block real, and the run
 * reports how many requests it actually intercepted so a vacuous pass is
 * visible rather than silent.
 *
 * WHY IMAGES-BLOCKED IS ONE OF THE FOUR
 * -------------------------------------
 * Roughly a third of recipients have remote images off by default. The header
 * pairs the mark IMAGE with the wordmark as live TEXT precisely so that state
 * degrades to "DriveCommand in white on navy, minus a small chevron" rather
 * than to an empty band. That claim is only worth making if it is checked.
 *
 * Dark mode is forced with Playwright's `colorScheme`, which drives the real
 * `prefers-color-scheme` media query the shell's dark rules are gated on. Note
 * this exercises a Chromium-class client (Apple Mail, iOS Mail); Outlook
 * Windows evaluates no media query at all and always sees the light inline
 * styles — the property the shell is designed around, and one no browser
 * screenshot can verify.
 *
 * Usage (from apps/web/):
 *   npx tsx scripts/email-render-qa.ts
 *
 * Output: apps/web/.email-qa/*.png plus the rendered .html for byte accounting.
 */

import { chromium, type Browser } from '@playwright/test';
import { render } from '@react-email/render';
import * as React from 'react';
import { createServer, type Server } from 'http';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';

import DynamicTemplateEmail from '../src/emails/dynamic-template';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../.email-qa');
const PUBLIC_DIR = join(__dirname, '../public');

/**
 * A representative body — the `trip.reminder` template's Tiptap output, i.e.
 * exactly the unstyled markup the dispatcher injects: bare h2, bare p, bare
 * anchor. Anything that looks good here looks good because the shell's reset
 * did the work, not because the fixture was pre-styled.
 */
const BODY_HTML = [
  '<h2>Trip coming up</h2>',
  '<p>Mike Rodriguez, trip DC-2026-00412 has not been started. ',
  'Truck T-104, first stop Hall Ford, West Bend, departure Tue 26 Aug, 06:30.</p>',
  '<p><a href="https://app.drivecommand.com/carrier/trips/trip_abc">Open trip</a></p>',
].join('');

const VIEWPORT = { width: 700, height: 1200 };
const SCALE = 2;
const GMAIL_CLIP_LIMIT = 102 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
};

/**
 * Serves the rendered email at / and the real public/ tree beneath it.
 *
 * Bound ONCE, before the email is rendered, so the logo <img> can be rendered
 * against the origin the screenshots will actually load from. The HTML lives in
 * a mutable box and is filled in after render — binding, closing and rebinding
 * on the same port would be a race against anything else on the machine.
 */
function startServer(box: { html: string }): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(box.html);
      return;
    }

    // Contain path traversal — this serves a real directory.
    const filePath = normalize(join(PUBLIC_DIR, decodeURIComponent(url)));
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
      res.writeHead(403).end();
      return;
    }

    try {
      const buf = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function shoot(
  browser: Browser,
  pageUrl: string,
  name: string,
  opts: { dark: boolean; blockImages: boolean },
): Promise<number> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: opts.dark ? 'dark' : 'light',
  });

  let intercepted = 0;
  if (opts.blockImages) {
    // Block at the route level — what a mail client actually does.
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route) => {
      intercepted++;
      return route.abort();
    });
  }

  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
  await context.close();

  console.log(`  ${name}.png`);
  return intercepted;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const box = { html: '' };
  const { server, origin } = await startServer(box);

  try {
    box.html = await render(
      React.createElement(DynamicTemplateEmail, {
        bodyHtml: BODY_HTML,
        statusBar: {
          tone: 'attention' as const,
          label: 'Not started — departs in under 24 hours',
        },
        preferencesUrl: 'https://app.drivecommand.com/settings/my-notifications',
        logoBaseUrl: origin,
      }),
    );

    const bytes = Buffer.byteLength(box.html, 'utf8');
    console.log(`\nRendered HTML: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`);
    console.log(`Gmail clip limit: ${GMAIL_CLIP_LIMIT} bytes (102 KB)`);
    console.log(
      bytes < GMAIL_CLIP_LIMIT
        ? `PASS — ${((1 - bytes / GMAIL_CLIP_LIMIT) * 100).toFixed(1)}% headroom`
        : 'FAIL — Gmail will clip this email',
    );

    writeFileSync(join(OUT_DIR, 'preview.html'), box.html, 'utf8');

    // The preheader must be DERIVED, not the constant the old shell emitted.
    console.log(
      `\nPreheader derived from body: ${
        box.html.includes('Trip coming up') ? 'yes' : 'NO — check derivePreheader'
      }`,
    );
    console.log(
      `Old "DriveCommand notification" constant gone: ${
        box.html.includes('DriveCommand notification') ? 'NO — still present' : 'yes'
      }`,
    );
    console.log(`Container is 600px: ${box.html.includes('600px') ? 'yes' : 'NO'}`);
    console.log(`No flex/grid in output: ${/display:\s*(flex|grid)/.test(box.html) ? 'NO' : 'yes'}`);

    console.log('\nScreenshots:');
    const browser = await chromium.launch();
    let intercepted = 0;
    try {
      await shoot(browser, origin, 'light-images-on', { dark: false, blockImages: false });
      intercepted += await shoot(browser, origin, 'light-images-blocked', {
        dark: false,
        blockImages: true,
      });
      await shoot(browser, origin, 'dark-images-on', { dark: true, blockImages: false });
      intercepted += await shoot(browser, origin, 'dark-images-blocked', {
        dark: true,
        blockImages: true,
      });
    } finally {
      await browser.close();
    }

    // If nothing was intercepted, the two images-blocked runs proved nothing.
    console.log(
      `\nImage requests intercepted: ${intercepted} ${
        intercepted > 0
          ? '(blocking is real)'
          : '— WARNING: nothing was blocked, that check is vacuous'
      }`,
    );
    console.log(`Wrote 4 PNGs + preview.html to ${OUT_DIR}`);

    if (bytes >= GMAIL_CLIP_LIMIT) process.exit(1);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
