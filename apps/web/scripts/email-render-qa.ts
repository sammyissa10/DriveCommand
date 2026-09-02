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
import { transformBodyHtml } from '../src/lib/notifications/body-html-transform';

// --- quick-578 Task 7: the 20 migrated templates, rendered + screenshotted
// in a second phase below. The dispatcher run above is untouched.
import { WelcomeOwnerEmail } from '../src/emails/welcome-owner';
import { ActivationCelebrationEmail } from '../src/emails/activation-celebration';
import { NoProgressNudgeEmail } from '../src/emails/no-progress-nudge';
import { AddDriverNudgeEmail } from '../src/emails/add-driver-nudge';
import { DispatchLoadNudgeEmail } from '../src/emails/dispatch-load-nudge';
import { TrialEndingSoonEmail } from '../src/emails/trial-ending-soon';
import { ConfirmEmailTemplate } from '../src/emails/confirm-email';
import { DriverInvitationEmail } from '../src/emails/driver-invitation';
import { OwnerInvitationEmail } from '../src/emails/owner-invitation';
import { AccountExistsEmail } from '../src/emails/account-exists';
import { DriverDocumentExpiryReminderEmail } from '../src/emails/driver-document-expiry-reminder';
import { FleetMessageNotificationEmail } from '../src/emails/fleet-message-notification';
import { GeofenceArrivalAlert } from '../src/emails/geofence-arrival-alert';
import { LoadStatusNotificationEmail } from '../src/emails/load-status-notification';
import { SysAdminInvoiceEmail } from '../src/emails/sysadmin-invoice';
import { SupportTicketCreatedEmail } from '../src/emails/support-ticket-created';
import { SupportTicketReplyToAdminEmail } from '../src/emails/support-ticket-reply-to-admin';
import { SupportTicketReplyToOwnerEmail } from '../src/emails/support-ticket-reply-to-owner';
import { WorkflowInstanceBlockedEmail } from '../src/emails/workflow-instance-blocked';
import { WorkflowSafetyDigestEmail } from '../src/emails/workflow-safety-digest';

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

// ---------------------------------------------------------------------------
// quick-578 Task 7: the 20 migrated templates.
// ---------------------------------------------------------------------------
// Representative props, not placeholders — the screenshots are only worth
// reviewing if the data is shaped like real data. A few entries deliberately
// carry their optional prop (fleet-message routeName, load-status
// estimatedDelivery, invoice notes) so the conditional branches render, and
// workflow-safety-digest's overdueCount is > 0 so its attention path fires.
const TEMPLATES: Array<{
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous props across 20 distinct components
  Component: React.ComponentType<any>;
  props: Record<string, unknown>;
}> = [
  {
    name: 'welcome-owner',
    Component: WelcomeOwnerEmail,
    props: {
      firstName: 'Maria',
      companyName: 'Rodriguez Logistics',
      trialEndsAt: 'March 15, 2027',
      dashboardUrl: 'https://app.drivecommand.com/dashboard',
    },
  },
  {
    name: 'activation-celebration',
    Component: ActivationCelebrationEmail,
    props: {
      firstName: 'Maria',
      companyName: 'Rodriguez Logistics',
      dashboardUrl: 'https://app.drivecommand.com/dashboard',
    },
  },
  {
    name: 'no-progress-nudge',
    Component: NoProgressNudgeEmail,
    props: {
      firstName: 'Carlos',
      companyName: 'Carlos Trucking LLC',
      dashboardUrl: 'https://app.drivecommand.com/dashboard',
    },
  },
  {
    name: 'add-driver-nudge',
    Component: AddDriverNudgeEmail,
    props: {
      firstName: 'Denise',
      companyName: 'Ironclad Freight',
      driversUrl: 'https://app.drivecommand.com/carrier/drivers',
    },
  },
  {
    name: 'dispatch-load-nudge',
    Component: DispatchLoadNudgeEmail,
    props: {
      firstName: 'Tyrell',
      companyName: 'Summit Hauling',
      loadsUrl: 'https://app.drivecommand.com/carrier/loads',
    },
  },
  {
    name: 'trial-ending-soon',
    Component: TrialEndingSoonEmail,
    props: {
      firstName: 'Priya',
      companyName: 'Blue Ridge Transport',
      daysLeft: 3,
      subscriptionUrl: 'https://app.drivecommand.com/settings/billing',
    },
  },
  {
    name: 'confirm-email',
    Component: ConfirmEmailTemplate,
    props: {
      firstName: 'Jordan',
      confirmUrl: 'https://app.drivecommand.com/confirm?token=abc123',
    },
  },
  {
    name: 'driver-invitation',
    Component: DriverInvitationEmail,
    props: {
      firstName: 'Miguel',
      lastName: 'Torres',
      organizationName: 'Lonestar Freight Co',
      acceptUrl: 'https://app.drivecommand.com/accept-invite?token=xyz',
      expiresAt: 'March 10, 2027',
    },
  },
  {
    name: 'owner-invitation',
    Component: OwnerInvitationEmail,
    props: {
      firstName: 'Angela',
      lastName: 'Kim',
      organizationName: 'Kim Family Trucking',
      acceptUrl: 'https://app.drivecommand.com/accept-invite?token=abc',
      expiresAt: 'March 10, 2027',
    },
  },
  {
    name: 'account-exists',
    Component: AccountExistsEmail,
    props: {
      signInUrl: 'https://app.drivecommand.com/sign-in',
    },
  },
  {
    name: 'driver-document-expiry-reminder',
    Component: DriverDocumentExpiryReminderEmail,
    props: {
      driverName: 'Miguel Torres',
      documentType: 'Driver License',
      expiryDate: 'March 5, 2027',
      daysUntilExpiry: 5,
      dashboardUrl: 'https://app.drivecommand.com/carrier/drivers/drv_123',
    },
  },
  {
    name: 'fleet-message-notification',
    Component: FleetMessageNotificationEmail,
    props: {
      recipientName: 'Angela Kim',
      senderName: 'Miguel Torres',
      senderRole: 'DRIVER',
      messagePreview:
        'Running about 20 minutes behind schedule due to traffic on I-80, should still make the delivery window.',
      routeName: 'Chicago → Indianapolis',
    },
  },
  {
    name: 'geofence-arrival-alert',
    Component: GeofenceArrivalAlert,
    props: {
      loadNumber: 'DC-2026-00512',
      stopType: 'delivery',
      stopAddress: '4501 W Diversey Ave, Chicago, IL',
      driverName: 'Miguel Torres',
      licensePlate: 'IL-TRK4821',
      loadUrl: 'https://app.drivecommand.com/carrier/loads/load_512',
    },
  },
  {
    name: 'load-status-notification',
    Component: LoadStatusNotificationEmail,
    props: {
      customerName: 'Acme Manufacturing',
      loadNumber: 'DC-2026-00512',
      status: 'IN_TRANSIT',
      origin: 'Chicago, IL',
      destination: 'Indianapolis, IN',
      driverName: 'Miguel Torres',
      truckInfo: 'T-104 · IL-TRK4821',
      estimatedDelivery: 'March 3, 2027, 2:00 PM',
      trackingUrl: 'https://app.drivecommand.com/track/tok_abc123',
    },
  },
  {
    name: 'sysadmin-invoice',
    Component: SysAdminInvoiceEmail,
    props: {
      invoiceNumber: 'INV-2027-0142',
      tenantName: 'Kim Family Trucking',
      ownerName: 'Angela Kim',
      issueDate: 'March 1, 2027',
      dueDate: 'March 15, 2027',
      items: [
        { description: 'DriveCommand Pro — Monthly Subscription', quantity: '1', unitPrice: '$249.00', amount: '$249.00' },
        { description: 'Additional driver seats (3)', quantity: '3', unitPrice: '$15.00', amount: '$45.00' },
      ],
      subtotal: '$294.00',
      total: '$294.00',
      notes: 'Thank you for your business — reach out with any billing questions.',
    },
  },
  {
    name: 'support-ticket-created',
    Component: SupportTicketCreatedEmail,
    props: {
      ticketNumber: 'TCK-4821',
      title: 'Unable to upload rate confirmation PDF',
      category: 'Document Import',
      priority: 'High',
      submitterEmail: 'angela@kimtrucking.com',
      ticketUrl: 'https://app.drivecommand.com/sysadmin/support/tck_4821',
    },
  },
  {
    name: 'support-ticket-reply-to-admin',
    Component: SupportTicketReplyToAdminEmail,
    props: {
      ticketNumber: 'TCK-4821',
      title: 'Unable to upload rate confirmation PDF',
      body: 'Thanks for looking into this — I tried again this morning and the upload succeeded. Feel free to close this out.',
      submitterEmail: 'angela@kimtrucking.com',
      ticketUrl: 'https://app.drivecommand.com/sysadmin/support/tck_4821',
    },
  },
  {
    name: 'support-ticket-reply-to-owner',
    Component: SupportTicketReplyToOwnerEmail,
    props: {
      ticketNumber: 'TCK-4821',
      title: 'Unable to upload rate confirmation PDF',
      body: 'We identified the issue — a file size limit — and shipped a fix. Please try your upload again and let us know if it still fails.',
      ownerEmail: 'angela@kimtrucking.com',
      ticketUrl: 'https://app.drivecommand.com/support/tck_4821',
    },
  },
  {
    name: 'workflow-instance-blocked',
    Component: WorkflowInstanceBlockedEmail,
    props: {
      driverName: 'Miguel Torres',
      stepName: 'Pre-trip brake inspection',
      playbookName: 'DVIR — Pre-Trip Walkaround',
      tenantName: 'Kim Family Trucking',
      hoursBlocked: 6,
      dashboardUrl: 'https://app.drivecommand.com/carrier/drivers/drv_123',
    },
  },
  {
    name: 'workflow-safety-digest',
    Component: WorkflowSafetyDigestEmail,
    props: {
      tenantName: 'Kim Family Trucking',
      date: 'March 2, 2027',
      overdueCount: 2,
      completedTodayCount: 9,
      activeInstanceCount: 14,
      dashboardUrl: 'https://app.drivecommand.com/carrier/workflows',
    },
  },
];

/** Extracts the `.dc-preheader` text content, stripped of the ZWNJ/hair-space
 * padding run Preheader.tsx appends (see that file's header). React inserts
 * an HTML comment between the two adjacent JSX expressions, so cutting at the
 * first `<!--` after the opening tag yields exactly the preheader sentence. */
function extractPreheader(html: string): string {
  const match = html.match(/<div class="dc-preheader"[^>]*>([\s\S]*?)<!--/);
  return match ? match[1] : 'NOT FOUND';
}

/** Serves an arbitrary map of path -> html, for the templates phase. Kept
 * separate from `startServer` above so the dispatcher's existing four-state
 * run is untouched by this addition. */
function startTemplateServer(pages: Record<string, string>): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];

    if (pages[url]) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(pages[url]);
      return;
    }

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

async function runTemplatesPhase(): Promise<void> {
  const TEMPLATES_OUT_DIR = join(OUT_DIR, 'templates');
  mkdirSync(TEMPLATES_OUT_DIR, { recursive: true });

  console.log('\n=== Phase 2: the 20 migrated templates ===\n');

  const pages: Record<string, string> = {};
  const rendered: Array<{ name: string; html: string; bytes: number }> = [];

  const { server, origin } = await startTemplateServer(pages);
  try {
    for (const t of TEMPLATES) {
      const html = await render(React.createElement(t.Component, { ...t.props, logoBaseUrl: origin }));
      pages[`/${t.name}`] = html;
      writeFileSync(join(TEMPLATES_OUT_DIR, `${t.name}.html`), html, 'utf8');
      const bytes = Buffer.byteLength(html, 'utf8');
      rendered.push({ name: t.name, html, bytes });
    }

    console.log('Byte size vs Gmail clip limit (102 KB):');
    let anyOverLimit = false;
    for (const r of rendered) {
      const pass = r.bytes < GMAIL_CLIP_LIMIT;
      if (!pass) anyOverLimit = true;
      console.log(
        `  ${r.name}: ${r.bytes} bytes (${(r.bytes / 1024).toFixed(1)} KB) — ${pass ? 'PASS' : 'FAIL — Gmail will clip this'}`,
      );
    }

    console.log('\nScreenshots (light mode):');
    const browser = await chromium.launch();
    try {
      for (const t of TEMPLATES) {
        const context = await browser.newContext({
          viewport: VIEWPORT,
          deviceScaleFactor: SCALE,
          colorScheme: 'light',
        });
        const page = await context.newPage();
        await page.goto(`${origin}/${t.name}`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: join(TEMPLATES_OUT_DIR, `${t.name}.png`), fullPage: true });
        await context.close();
        console.log(`  ${t.name}.png`);
      }
    } finally {
      await browser.close();
    }

    console.log('\nPreheaders (name -> preheader):');
    const preheaders: Array<{ name: string; preheader: string }> = [];
    for (const r of rendered) {
      const preheader = extractPreheader(r.html);
      preheaders.push({ name: r.name, preheader });
      console.log(`  ${r.name} -> "${preheader}"`);
    }

    const seen = new Map<string, string[]>();
    for (const p of preheaders) {
      const list = seen.get(p.preheader) ?? [];
      list.push(p.name);
      seen.set(p.preheader, list);
    }
    const duplicates = [...seen.entries()].filter(([, names]) => names.length > 1);
    if (duplicates.length > 0) {
      console.log('\nFAIL — duplicate preheaders found:');
      for (const [preheader, names] of duplicates) {
        console.log(`  "${preheader}" shared by: ${names.join(', ')}`);
      }
    } else {
      console.log('\nPASS — all 20 preheaders are distinct');
    }

    console.log(`\nWrote ${TEMPLATES.length} HTML + ${TEMPLATES.length} PNG files to ${TEMPLATES_OUT_DIR}`);

    if (anyOverLimit || duplicates.length > 0) process.exitCode = 1;
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const box = { html: '' };
  const { server, origin } = await startServer(box);

  try {
    box.html = await render(
      React.createElement(DynamicTemplateEmail, {
        // Through the transform, exactly as template-renderer.ts does — otherwise
      // the screenshot would show a shape the dispatcher never actually sends.
      bodyHtml: transformBodyHtml(BODY_HTML).html,
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

    if (bytes >= GMAIL_CLIP_LIMIT) process.exitCode = 1;
  } finally {
    server.close();
  }

  await runTemplatesPhase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
