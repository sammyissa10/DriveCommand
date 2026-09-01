# Email Rendering Path Inventory

**Task:** quick-571 · Diagnostic, read-only
**Date:** 2026-09-01
**Scope:** `apps/web/src/emails/**`, `apps/web/src/lib/email/**`, `apps/web/src/lib/notifications/**`, every `resend.emails.send` call site
**Files changed:** none. This document is the only output.

---

## Summary up front

There are **two independent send paths**, not one.

| | Path A — hand-written templates | Path B — dispatcher / tenant-configurable |
|---|---|---|
| Entry point | `sendEmail()` in `src/lib/email/resend-client.ts` | `dispatchNotification()` in `src/lib/notifications/dispatcher.ts` |
| Body source | one `.tsx` React Email component per email | Tiptap HTML cached in the DB, variable-substituted |
| Shell | **none — each component renders its own `<Html>`** | `DynamicTemplateEmail` (`src/emails/dynamic-template.tsx`) |
| Template count | 29 files | 1 shell, ~45 DB rows |
| Calls `resend.emails.send` | indirectly, via `sendEmail` | directly, inline in the dispatcher |

`resend.emails.send` is called from exactly **two** places in `src/`:

- `src/lib/email/resend-client.ts:56`
- `src/lib/notifications/dispatcher.ts:340`

(A third grep hit, `src/app/(owner)/carrier/fleet/drivers/[id]/DriverDetailMobile.tsx`, is a `resend` local variable in an invite-resend handler, not the mail client.)

---

## 1. Does a shared email shell component exist?

**Yes — one, and it serves Path B only.**

**Path:** `apps/web/src/emails/dynamic-template.tsx`

Full current source:

```tsx
/**
 * DynamicTemplateEmail — React Email shell for dispatcher-rendered notifications.
 *
 * This is the ONLY place `dangerouslySetInnerHTML` is used in the notification system.
 * The `bodyHtml` prop must be Tiptap-generated and variable-substituted by the
 * template renderer BEFORE being passed here. Never pass raw user input.
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import React from 'react';

export type DynamicTemplateEmailProps = {
  /** Already-substituted, Tiptap-generated HTML. The sole HTML injection site. */
  bodyHtml: string;
  /** Defaults to "DriveCommand" */
  brandName?: string;
  /** Optional postal address line; rendered only when provided. */
  footerAddress?: string;
};

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f6f7f9',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '40px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: '#0f62fe',
  padding: '24px 32px',
};

const brandStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '-0.3px',
};

const bodySectionStyle: React.CSSProperties = {
  padding: '32px 32px 24px 32px',
  color: '#1a1a1a',
  fontSize: '15px',
  lineHeight: '1.6',
};

const hrStyle: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '0 32px',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 32px 24px 32px',
};

const footerTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '0 0 4px 0',
  lineHeight: '1.5',
};

export const DynamicTemplateEmail: React.FC<DynamicTemplateEmailProps> = ({
  bodyHtml,
  brandName = 'DriveCommand',
  footerAddress,
}) => {
  return (
    <Html lang="en">
      <Head />
      <Preview>{brandName} notification</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={brandStyle}>{brandName}</Text>
          </Section>

          <Section style={bodySectionStyle}>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>

          <Hr style={hrStyle} />

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>Sent by {brandName}</Text>
            {footerAddress ? (
              <Text style={footerTextStyle}>{footerAddress}</Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default DynamicTemplateEmail;
```

**It has exactly one importer in application code:** `src/lib/notifications/template-renderer.ts:18`. Grep for `DynamicTemplateEmail` across `src/` returns only that file, the component itself, and `src/lib/notifications/README.md`. **No file under `src/emails/` imports it.**

Two properties worth noting before any redesign:

- `brandName` and `footerAddress` are props with no non-default caller. `renderTemplate` constructs the element as `React.createElement(DynamicTemplateEmail, { bodyHtml })` — so `brandName` is always the literal `'DriveCommand'` and `footerAddress` is always `undefined`, meaning the address line **never renders today**.
- Its header colour is `#0f62fe`. Every hand-written template uses `#1e40af` (see §4). The two paths are already visibly different blues.

---

## 2. Was Phase 41 (Tenant-Configurable Notification System) shipped?

**Present.** Both artefacts named in the brief exist and are wired.

- `apps/web/prisma/schema.prisma:3798` — `model NotificationTemplate`:

```prisma
model NotificationTemplate {
  id                 String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  triggerKey         String               @unique
  category           NotificationCategory
  displayName        String
  description        String               @db.Text
  defaultSubject     String
  defaultBlockJson   Json
  defaultHtmlCache   String?              @db.Text
  availableVariables Json
  defaultRecipients  Json
  isActive           Boolean              @default(true)
  inAppEnabled       Boolean              @default(true)
  /// Phase 10. DEFAULT FALSE is precisely what stops the dispatcher's new PUSH
  /// branch from changing any existing trigger's behaviour — all 37 pre-Phase-10
  /// templates take the default, verified as 0 rows true after the apply.
  pushEnabled        Boolean              @default(false)
  createdAt          DateTime             @default(now()) @db.Timestamptz
  updatedAt          DateTime             @updatedAt @db.Timestamptz

  @@index([category])
  @@index([isActive])
}
```

- `apps/web/src/lib/notifications/dispatcher.ts` — present, ~600 lines, exporting `dispatchNotification`.

Supporting models also present in `schema.prisma`: `TenantNotificationSettings` (3823), `NotificationSubscription` (3842), `UserNotificationPreference` (3859), `NotificationSendLog` (3887), `NotificationEmailConfig` (3912), `InAppNotification` (2971).

The dispatcher's own header states the flow:

```
 *   1. Fetch global NotificationTemplate (short-circuit if missing or isActive=false)
 *   2. Fetch TenantNotificationSettings (short-circuit if isActive=false)
 *   3. Resolve recipients via resolveRecipients()
 *   4. Pick template content (tenant customBlockJson/customSubject ?? global defaults)
 *   5. Render once: Tiptap blockJson + variables -> HTML (shared by all recipients)
```

Body HTML is **not** rendered from Tiptap at request time. `src/lib/notifications/template-renderer.ts` records why:

```ts
 * Tiptap is NOT invoked on the server. The cached HTML is produced at template
 * save time in the browser (block-editor.tsx -> editor.getHTML()) and persisted
 * to NotificationTemplate.defaultHtmlCache / TenantNotificationSettings.customHtmlCache.
```

and the wrap happens here:

```ts
export async function renderTemplate(
  cachedHtml: string,
  payload: Record<string, string>,
  subject: string,
): Promise<{ html: string; subjectFinal: string }> {
  const bodyHtml = substituteVariables(cachedHtml, payload);
  const subjectFinal = substituteVariables(subject, payload);
  const html = await render(
    React.createElement(DynamicTemplateEmail, { bodyHtml }),
  );
  return { html, subjectFinal };
}
```

---

## 3. The "Trip coming up" reminder

This email is produced by Path B. There is **no `.tsx` file for it** — its body lives in a seed that writes a Tiptap document into `NotificationTemplate.defaultBlockJson`, and the delivered markup is `DynamicTemplateEmail` wrapping the cached HTML rendered from that document.

Three files are involved.

### 3a. Body template source — `apps/web/prisma/seeds/notification-template-data/trip.ts:93–125`

Subject-line construction is the `defaultSubject` string literal:

```ts
  {
    triggerKey: 'trip.reminder',
    category: NotificationCategory.TRIP,
    displayName: 'Trip Reminder',
    description:
      'Reminder to the driver about a trip that has not started yet. Fired by the daily cron. Channels: push and in-app.',
    defaultSubject: 'Reminder: trip {{tripNumber}} departs {{scheduledDeparture}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Trip coming up',
      paragraphTextWithVars:
        '{{driverName}}, trip {{tripNumber}} has not been started. Truck {{truckUnit}}, first stop {{firstStop}}, departure {{scheduledDeparture}}.',
      ctaLabel: 'Open trip',
      ctaUrl: `${APP}/carrier/trips/{{tripId}}`,
    }),
    availableVariables: [ /* driverUserId, tripId, tripNumber, driverName, truckUnit, firstStop, scheduledDeparture */ ],
    defaultRecipients: [{ type: 'related', payloadKey: 'driverUserId' }],
    isActive: true,
    inAppEnabled: true,
    pushEnabled: true,
  },
```

`buildDefaultTemplate` is `src/lib/notifications/build-template.ts`; it emits a Tiptap `doc` of an h2 heading, a paragraph, and a link paragraph. That is the entire body — the heading `Trip coming up`, one sentence, and one CTA link. There is no other markup.

**Caveat that matters for a redesign:** the seed is `INSERT`-only for `defaultHtmlCache`, and a tenant may hold its own `TenantNotificationSettings.customHtmlCache`. The row in production, not this file, is what the dispatcher actually renders.

### 3b. Subject substitution — `src/lib/notifications/template-renderer.ts:31–43`

```ts
export function substituteVariables(
  text: string,
  payload: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name) => {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      return payload[name];
    }
    console.warn(`[notifications] missing variable: ${name}`);
    return '';
  });
}
```

The dispatcher picks the template to substitute at `dispatcher.ts:186`:

```ts
    const subjectTemplate = (tenantSettings?.customSubject ?? template.defaultSubject) as string;
```

### 3c. What fires it — `src/app/api/cron/trip-reminders/route.ts`

Function: **`GET`** (the route's only export). Emit at line 125:

```ts
          await emitNotification('trip.reminder', {
            tenantId: tenant.id,
            relatedEntity: { type: 'trip', id: trip.id },
            payload: {
              driverUserId,
              tripId: trip.id,
              tripNumber: match ? match[1] : trip.id.slice(0, 8),
              driverName:
                [trip.primaryDriver?.firstName, trip.primaryDriver?.lastName]
                  .filter(Boolean)
                  .join(' ') || 'Driver',
              truckUnit: trip.truck?.unitNumber ?? 'Truck',
              firstStop: first
                ? [first.name, first.city].filter(Boolean).join(', ')
                : 'No stops yet',
              // `scheduled_departure` is `@db.Timestamptz` — a real instant, so
              // local rendering is correct. quick-541's date-only helpers are
              // for `@db.Date` columns and would be the inverse bug here.
              scheduledDeparture: formatDateInTenantTimezone(trip.scheduledDeparture, 'UTC'),
            },
          });
```

`emitNotification` is `src/lib/notifications/emit.ts`, which calls `dispatchNotification` with `NOTIFICATION_DEDUP_WINDOW_MS`.

---

## 4. Every template file under `src/emails/`

**29 hand-written templates + 1 shell = 30 `.tsx` files.**

**Every one of the 29 renders its own `<Html>` root. Not one imports `DynamicTemplateEmail` or any other shell.** They are structurally identical by convention only: each declares a local `const styles = { ... }` object and hand-repeats a header / content / footer arrangement.

| # | File | Trigger (importing sender) | Shell? |
|---|---|---|---|
| 1 | `activation-celebration.tsx` | automation `activation-celebration` via `lib/automations/template-registry.ts` | own `<Html>` |
| 2 | `add-driver-nudge.tsx` | automation `add-driver-nudge` via `template-registry.ts` | own `<Html>` |
| 3 | `confirm-email.tsx` | sign-up, `app/(auth)/sign-up/actions.tsx` | own `<Html>` |
| 4 | `dispatch-load-nudge.tsx` | automation `dispatch-load-nudge` via `template-registry.ts` | own `<Html>` |
| 5 | `document-expiry-reminder.tsx` | `lib/email/send-document-expiry-reminder.ts` (truck/company doc expiry cron) | own `<Html>` |
| 6 | `driver-document-expiry-reminder.tsx` | `lib/email/send-driver-document-expiry-reminder.ts` | own `<Html>` |
| 7 | `driver-invitation.tsx` | `lib/email/send-driver-invitation.ts` **and** `send-manager-invitation.ts` | own `<Html>` |
| 8 | `fleet-message-notification.tsx` | `lib/email/send-fleet-message-notifications.ts` | own `<Html>` |
| 9 | `geofence-arrival-alert.tsx` | `lib/email/send-geofence-alert.ts` | own `<Html>` |
| 10 | `load-status-notification.tsx` | `lib/email/customer-notifications.ts` | own `<Html>` |
| 11 | `maintenance-reminder.tsx` | `lib/email/send-maintenance-reminder.ts` | own `<Html>` |
| 12 | `no-progress-nudge.tsx` | automation `no-progress-nudge` via `template-registry.ts` | own `<Html>` |
| 13 | `owner-invitation.tsx` | `lib/email/send-owner-invitation.ts` | own `<Html>` |
| 14 | `support-ticket-created.tsx` | `lib/email/send-support-notifications.ts` | own `<Html>` |
| 15 | `support-ticket-reply-to-admin.tsx` | `lib/email/send-support-notifications.ts` | own `<Html>` |
| 16 | `support-ticket-reply-to-owner.tsx` | `lib/email/send-support-notifications.ts:91` (dynamic `import()`) | own `<Html>` |
| 17 | `sysadmin-invoice.tsx` | `lib/email/send-sysadmin-invoice.ts` | own `<Html>` |
| 18 | `trial-ending-soon.tsx` | automation `trial-ending-soon` via `template-registry.ts` | own `<Html>` |
| 19 | `welcome-owner.tsx` | automation `welcome-owner` via `template-registry.ts` | own `<Html>` |
| 20 | `workflow-instance-blocked.tsx` | `src/server/services/workflows/notifications.ts:593` | own `<Html>` |
| 21 | `workflow-safety-digest.tsx` | `app/api/cron/workflow-digest/route.ts:152` | own `<Html>` |
| 22 | `carrier/client-invoice-ready.tsx` | `lib/carrier/notifications.ts` | own `<Html>` |
| 23 | `carrier/client-shipment-update.tsx` | `lib/carrier/notifications.ts` (pickup + delivered) | own `<Html>` |
| 24 | `carrier/compliance-alert.tsx` | `lib/carrier/notifications.ts` | own `<Html>` |
| 25 | `carrier/dispatch-assigned.tsx` | `lib/carrier/notifications.ts` → `sendDispatchAssignedNotification` | own `<Html>` |
| 26 | `carrier/invoice-generated.tsx` | `lib/carrier/notifications.ts` | own `<Html>` |
| 27 | `carrier/load-delivered.tsx` | `lib/carrier/notifications.ts` | own `<Html>` |
| 28 | `carrier/pay-record-ready.tsx` | `lib/carrier/notifications.ts` | own `<Html>` |
| 29 | `carrier/stop-completed.tsx` | `lib/carrier/notifications.ts` | own `<Html>` |
| — | `dynamic-template.tsx` | **is** the shell; used only by `template-renderer.ts` | n/a |

Representative full source, `src/emails/driver-invitation.tsx` — this is the shape all 29 repeat:

```tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components';

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
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>You&apos;re Invited to DriveCommand</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hello {firstName},</Text>
            <Text style={styles.message}>
              {organizationName} has invited you to join their fleet on DriveCommand
              as a driver. Click the button below to create your account and get
              started.
            </Text>

            <Section style={styles.ctaSection}>
              <Button href={acceptUrl} style={styles.button}>
                Accept Invitation
              </Button>
            </Section>

            <Text style={styles.expiryNote}>
              This invitation expires on {expiresAt}.
            </Text>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              DriveCommand - Fleet Management
            </Text>
            <Text style={styles.footerSubtext}>
              If you did not expect this invitation, you can safely ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#f6f9fc',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  container: {
    margin: '0 auto',
    padding: '20px 0',
    maxWidth: '600px',
  },
  header: {
    backgroundColor: '#1e40af',
    padding: '20px',
    borderRadius: '8px 8px 0 0',
  },
  headerText: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0',
    textAlign: 'center' as const,
  },
  content: {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '0 0 8px 8px',
  },
  // … greeting, message, ctaSection, button, expiryNote, divider, footer,
  //    footerText, footerSubtext all follow, ~90 lines total
};
```

Note `styles` is a plain object literal with **no shared import** — each of the 29 files carries its own copy. `<Tailwind>` from `@react-email/components` is used in **zero** files.

Header background colour across all 30, as a measure of how much they actually agree:

- `#1e40af` — 26 files
- `#0f62fe` — `dynamic-template.tsx` (the shell)
- `#111827` — `sysadmin-invoice.tsx`
- `#dc2626` — `workflow-instance-blocked.tsx`
- no `header:` style key at all — `geofence-arrival-alert.tsx`, `workflow-safety-digest.tsx`

---

## 5. How the logo is rendered

**Absent as an image. It is inline text only.**

`grep -rn "<Img" src/emails` returns **0 matches**. There is no `<Img>`, no `src=`, no inline SVG, and no embedded data URI in any of the 30 files.

The brand appears only as a `<Text>` string, in three different wordings:

- `src/emails/confirm-email.tsx:24` — `<Text style={styles.headerText}>DriveCommand</Text>`
- `src/emails/carrier/dispatch-assigned.tsx:53` — `<Text style={styles.headerText}>DriveCommand - {companyName}</Text>` (the pattern all 8 `carrier/*` files use)
- `src/emails/driver-invitation.tsx:33` — `<Text style={styles.headerText}>You&apos;re Invited to DriveCommand</Text>` — this file has **no brand header at all**; the header slot is the subject sentence.
- `src/emails/dynamic-template.tsx:84,92` — `brandName = 'DriveCommand'` rendered as `<Text style={brandStyle}>{brandName}</Text>`

Footer brand line is likewise text, and inconsistent in its dash: `DriveCommand - Fleet Management` (hyphen) in 15 files, `DriveCommand — Fleet Management` (em dash) in 6.

---

## 6. Preheader / dark mode / unsubscribe / postal address / plain-text

Measured across all 30 files. Counts are files containing at least one match.

| Feature | Present in |
|---|---|
| Preheader (`<Preview>`) | **2 of 30** — `dynamic-template.tsx` and `workflow-safety-digest.tsx` |
| Dark-mode meta or media query (`prefers-color-scheme`, `color-scheme`) | **0 of 30** |
| Unsubscribe / notification-preferences link | **0 of 30** |
| Physical mailing address | **0 of 30** rendered |
| Plain-text fallback body | **0** — see below |

Details:

- **Preheader.** `dynamic-template.tsx:90` is `<Preview>{brandName} notification</Preview>` — a constant, identical on every dispatcher email regardless of trigger, so the inbox preview line reads "DriveCommand notification" for `trip.reminder`, `inspection.failed` and every other. `workflow-safety-digest.tsx:39` is the only one with a real per-send value, `<Preview>{previewText}</Preview>`. The other 28 have none, so the client falls back to the first body text.
- **Dark mode.** Every file uses `<Head />` with no children. No `<meta name="color-scheme">`, no `<style>` block, no media query anywhere in `src/emails/`.
- **Unsubscribe.** Nothing links to the in-app preferences screen (`/settings/my-notifications`), and there is no `List-Unsubscribe` header — neither `sendEmail` nor the dispatcher passes `headers` to Resend. This applies to Path B too, where `UserNotificationPreference` genuinely does let a recipient turn a channel off; the email never says so.
- **Postal address.** `DynamicTemplateEmail` has a `footerAddress` prop and renders it when provided — but `renderTemplate` never passes it (`React.createElement(DynamicTemplateEmail, { bodyHtml })`), so the branch is dead in practice. No hand-written template has an address at all.
- **Plain text.** `grep -rn "text:" src/lib/email/*.ts src/lib/notifications/dispatcher.ts` returns **0 matches**. Both send calls pass `html` only:

```ts
  // src/lib/email/resend-client.ts:56
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html,
    replyTo,
  });
```

```ts
  // src/lib/notifications/dispatcher.ts:340
              const { error: sendError } = await resend.emails.send({
                from: FROM_EMAIL,
                to: r.email,
                subject: subjectFinal,
                html: html,
                replyTo: REPLY_TO_EMAIL,
              });
```

`SendEmailOptions` has no `text` field to pass one through:

```ts
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}
```

---

## 7. From-address and from-name construction

Both send paths read the **same two module-level constants**, in `apps/web/src/lib/email/resend-client.ts:33–35`:

```ts
// Sender must be on a Resend-VERIFIED domain. drivecommand.app is verified;
// drivecommand.io is not (its DNS is on an inaccessible Vercel account), so
// sending as @drivecommand.io gets rejected by Resend (550 unverified domain).
// Replies still go to the real team@drivecommand.io inbox via REPLY_TO_EMAIL.
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DriveCommand <team@drivecommand.app>';
export const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO || 'team@drivecommand.io';
```

- **Source: environment variable, not the database.** `RESEND_FROM_EMAIL` / `RESEND_REPLY_TO`.
- **From-name is not constructed separately.** There is no `fromName` variable — the display name is baked into the single `Name <addr>` string, and a deployment that sets `RESEND_FROM_EMAIL` to a bare address silently loses the display name. `.env.example:33` is `RESEND_FROM_EMAIL=DriveCommand <onboarding@resend.dev>`.
- **Read at module load**, not per call, so a change requires a redeploy.
- **No call site can override `from`.** `SendEmailOptions` exposes only `replyTo`. `sendEmail` defaults it to a hardcoded literal rather than the constant — `const replyTo = options.replyTo ?? 'team@drivecommand.io';` — which happens to equal `REPLY_TO_EMAIL`'s default but would diverge the moment `RESEND_REPLY_TO` were set.

**A database-backed sender identity exists and is not used.** `schema.prisma:3912`:

```prisma
model NotificationEmailConfig {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  singletonKey String   @default("singleton")
  fromName     String
  fromEmail    String
  replyTo      String?
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz
}
```

Its only readers/writers in `src/` are `app/(admin)/actions/notifications.ts`, `app/(admin)/notifications/page.tsx` and `app/(admin)/notifications/email-config-tab.tsx` — a SysAdmin screen that persists the values. Neither `resend-client.ts` nor `dispatcher.ts` imports it. **Editing that screen changes nothing about what recipients see.** Reported, not fixed.

**One dead configuration path.** Five templates carry a header comment claiming a Gmail sender, e.g. `src/emails/welcome-owner.tsx:3`:

```
//   from: "Sammy from DriveCommand <...>" (set via GMAIL_FROM_NAME=Sammy from DriveCommand)
```

`GMAIL_FROM_NAME` is read nowhere in `src/`, and `src/lib/email/gmail-client.ts` is now a pure re-export:

```ts
/**
 * Email transport — re-exports from resend-client.ts (Resend API).
 *
 * TODO: Once this Resend migration is verified in production, remove
 * GMAIL_USER and GMAIL_APP_PASSWORD from Vercel env vars and .env.local.
 */

export { FROM_EMAIL, sendEmail } from './resend-client';
export type { SendEmailOptions } from './resend-client';
```

So `lib/carrier/notifications.ts`, `server/services/workflows/notifications.ts` and `api/cron/workflow-digest/route.ts` — which all import `sendEmail` from `@/lib/email/gmail-client` — are on Resend with `FROM_EMAIL` like everything else. Those five comments are stale and describe a from-name that has not been applied since the migration.

---

## Would one shell change propagate?

**No.** A change to `DynamicTemplateEmail` would reach only Path B — the dispatcher-rendered, tenant-configurable notifications, which is one file's worth of work covering roughly 45 `NotificationTemplate` rows including `trip.reminder`, and it is genuinely a single edit there. It would reach **none** of the 29 files under `src/emails/`, because not one of them imports it: every one opens its own `<Html>`, carries its own ~90-line `const styles` object, and hand-writes its own header, content and footer. They agree on `#1e40af` and a 600px container by copy-paste convention, not by a shared dependency, and three of them already diverge on header colour. So a brand redesign is two distinct pieces of work: one edit to the shell for the dispatcher path, plus a per-file migration of 29 templates onto a shell that does not yet exist for them — and the missing pieces identified above (no logo image anywhere, preheaders in 2 of 30, no dark-mode handling, no unsubscribe link, no postal address, no plain-text part on either path, and a `NotificationEmailConfig` table the send path never reads) are all absent from **both** paths, so each has to be built once in the new shared shell and once at the transport layer in `resend-client.ts` / `dispatcher.ts`, not solved by the component swap alone.
