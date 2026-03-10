# Email System

How DriveCommand sends transactional emails, including Gmail SMTP configuration, email templates, all trigger points, and the idempotency system.

---

## Overview

DriveCommand sends transactional emails using **Gmail SMTP** via **Nodemailer**. Email templates are React components rendered to HTML using `@react-email/components` and `@react-email/render`.

**Active email client:** `src/lib/email/gmail-client.ts`

There is also a legacy `src/lib/email/resend-client.ts` from an earlier Resend-based implementation. It is kept for reference but is not called by any active code.

---

## Gmail SMTP Setup

**Required environment variables:**

| Variable | Description |
|---|---|
| `GMAIL_USER` | Your Gmail address (e.g. `notifications@yourcompany.com`) |
| `GMAIL_APP_PASSWORD` | 16-character Google App Password — **not** your Gmail login password |
| `GMAIL_FROM_NAME` | Optional display name in the From field (defaults to `"DriveCommand"`) |

**Note:** These variables are not in `.env.example` (which still lists `RESEND_API_KEY`). Add them manually to `.env.local` for local development and to the Vercel Environment Variables dashboard for production.

**How to create a Google App Password:**

1. Enable 2-Step Verification on your Google account: Google Account → Security → 2-Step Verification.
2. Go to Google Account → Security → 2-Step Verification → **App Passwords** (scroll to the bottom).
3. Create a new app password. Select "Mail" as the app.
4. Copy the 16-character code. Spaces are shown for readability — they are stripped automatically by the client.

---

## How Sending Works

The active client (`src/lib/email/gmail-client.ts`) works as follows:

**`getTransporter()`** — creates a lazy-initialized Nodemailer transporter singleton:

```typescript
nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''),
  },
});
```

The transporter is a module-level singleton (`let _transporter`) so it is reused across requests in a warm serverless function.

**`sendEmail({ to, subject, react })`** — renders the React email component to HTML, then calls `transporter.sendMail()`:

```typescript
const html = await render(options.react);
await transporter.sendMail({ from: FROM_EMAIL, to, subject, html });
return { id: nanoid() }; // compatible with previous Resend-based callers
```

The `FROM_EMAIL` export is constructed from `GMAIL_FROM_NAME` and `GMAIL_USER`:
- With name: `"DriveCommand <notifications@gmail.com>"`
- Without name: `"DriveCommand <notifications@gmail.com>"` (defaults to "DriveCommand")

---

## Email Templates

Templates are React components in `src/emails/` using `@react-email/components` primitives: `Html`, `Head`, `Body`, `Container`, `Text`, `Link`, `Button`, `Hr`.

Some sender files define their template inline rather than in a separate file. All templates render to HTML before being passed to Nodemailer.

---

## Email Trigger Points

Every email sender function, what triggers it, and what it sends:

| File | Trigger | Description |
|---|---|---|
| `src/lib/email/send-driver-invitation.ts` | Owner invites a new driver from `/drivers` | Sends invitation link to the driver's email. Driver clicks link to set password and join the tenant. |
| `src/lib/email/send-owner-invitation.ts` | SysAdmin creates a tenant from `/tenants` | Sends invitation link to the owner's email. Owner clicks link to set password and activate their account. |
| `src/lib/email/send-document-expiry-reminder.ts` | Daily cron job (`/api/cron/send-reminders`) | Alerts the owner when a **truck document** (registration, insurance) expiry is approaching (at 90/60/30/0-day milestones). |
| `src/lib/email/send-driver-document-expiry-reminder.ts` | Daily cron job (`/api/cron/send-reminders`) | Alerts the owner when a **driver document** (license, application) expiry is approaching (at 90/60/30/0-day milestones). |
| `src/lib/email/send-maintenance-reminder.ts` | Daily cron job (`/api/cron/send-reminders`) | Alerts the owner when a scheduled truck maintenance service is due. |
| `src/lib/email/send-geofence-alert.ts` | GPS geofence trigger after each GPS ping | Notifies the customer when a truck arrives within the geofence radius of a pickup or delivery location. |
| `src/lib/email/customer-notifications.ts` | Load status changes (`PICKED_UP`, `IN_TRANSIT`, `DELIVERED`) | Sends ETA and status update emails to the customer linked to the load. Fire-and-forget — email failure never blocks the load status update. |
| `src/lib/email/send-support-notifications.ts` | Support ticket activity | Notifies the DriveCommand team (via `DRIVECOMMAND_SUPPORT_EMAIL` or `GMAIL_USER`) when a new ticket is created; notifies the owner when the admin posts a reply. |

---

## Notification Log (Idempotency)

Every email send is recorded in the `NotificationLog` database table with a unique `idempotencyKey`. Before sending, the system checks whether a log entry already exists for that key. If it does, the email is skipped.

This prevents duplicate emails from:
- Cron job retries after a transient error
- Double form submissions
- Rapid repeated triggers

**Pattern used in cron email senders:**

```typescript
const existing = await prisma.notificationLog.findUnique({
  where: { idempotencyKey: key }
});
if (existing?.status === 'SENT') return; // skip — already sent

// ... send email ...

await prisma.notificationLog.create({
  data: { idempotencyKey: key, type: 'document-expiry', status: 'SENT' }
});
```

For document expiry reminders, the idempotency key includes the document ID and the milestone threshold (e.g. `doc-expiry-truck-abc123-30days`) so each milestone is tracked independently.

---

## Testing Email Locally

Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env.local`. Emails will be sent from your Gmail account during local development — there is no sandbox mode.

**Recommendation:** Use a test email address (e.g. a Gmail alias or a secondary account) as the recipient during development to avoid cluttering real inboxes.

To trigger the cron email job locally:

```bash
# Start the dev server, then:
curl -X POST http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer <your-CRON_SECRET-value>"
```
