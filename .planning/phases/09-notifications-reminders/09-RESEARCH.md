# Phase 9: Notifications & Reminders - Research

**Researched:** 2026-02-14
**Domain:** Automated email notifications and background job scheduling in Next.js
**Confidence:** MEDIUM-HIGH

## Summary

Phase 9 implements automated email reminders for upcoming maintenance and expiring documents using a background job system. The phase builds on existing Phase 8 maintenance scheduling (dual-trigger time/mileage) and Phase 6 document storage with expiry metadata to send proactive email notifications before deadlines.

The standard approach for Next.js applications on Vercel uses Vercel Cron Jobs (configured via vercel.json) to trigger API route handlers at scheduled intervals. These handlers query the database for upcoming due dates, compose email notifications using React Email components, and send via a transactional email service (Resend is the modern standard for Next.js). A notification tracking table records sent status to prevent duplicate sends and enable retry logic.

The research shows this is a well-established pattern with clear best practices: secure cron routes with CRON_SECRET environment variable, prevent duplicate execution with database locking, track notification state for idempotency, use React Email for template consistency, and implement exponential backoff retry logic for failed sends.

**Primary recommendation:** Use Vercel Cron Jobs with secured API routes, Resend + React Email for transactional emails, and a NotificationLog table for deduplication and retry tracking. Query for "upcoming" items using PostgreSQL INTERVAL calculations (Phase 8 pattern). Follow tenant isolation patterns for multi-tenant email delivery.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vercel Cron Jobs | N/A | Background job scheduling | Native Vercel integration, no external service needed |
| Resend | 4.x | Transactional email API | Modern, React-friendly, generous free tier (100/day) |
| React Email | 3.x | Email template components | Official companion to Resend, JSX for emails |
| Prisma | 7.4.0 | ORM for notification tracking | Already in use, proven tenant isolation |
| PostgreSQL INTERVAL | N/A | Date calculations for "upcoming" | Native date arithmetic, DST-safe |
| Zod | 4.3.6 | Email notification validation | Already in use, compose schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-email/components | 0.x | Pre-built email components | All email templates (Button, Link, Container, etc.) |
| nanoid | 5.x | Idempotency keys for notifications | Already in use from Phase 6 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel Cron Jobs | node-cron in long-running server | Vercel cron is simpler, no server management, but requires Vercel deployment |
| Resend | SendGrid, AWS SES, Nodemailer | Resend has better DX for React/Next.js, others have more features but steeper learning curve |
| React Email | MJML, HTML strings | React Email uses familiar JSX, better type safety, integrates with existing component knowledge |
| Database polling | Webhook-based triggers | Database polling is simpler for MVP, webhooks add complexity but reduce latency |

**Installation:**
```bash
npm install resend react-email @react-email/components
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   └── api/
│       └── cron/
│           └── send-reminders/
│               └── route.ts          # Cron job handler (secured with CRON_SECRET)
├── emails/
│   ├── maintenance-reminder.tsx     # React Email template for maintenance due
│   └── document-expiry-reminder.tsx # React Email template for expiring docs
├── lib/
│   ├── email/
│   │   ├── client.ts                # Resend client singleton
│   │   ├── send-maintenance-reminder.ts
│   │   └── send-document-expiry-reminder.ts
│   ├── notifications/
│   │   ├── check-upcoming-maintenance.ts  # Query logic for due services
│   │   ├── check-expiring-documents.ts    # Query logic for expiring docs
│   │   └── notification-deduplication.ts  # Idempotency key generation
│   └── validations/
│       └── notification.schemas.ts  # Zod schemas for NotificationLog
├── prisma/
│   └── schema.prisma                # Add NotificationLog model
└── vercel.json                      # Cron job configuration
```

### Pattern 1: Vercel Cron Job with API Route Handler

**What:** Use vercel.json to schedule background jobs that trigger Next.js API route handlers via HTTP GET requests.

**When to use:** When deploying to Vercel and need recurring background jobs (daily reminders, cleanup tasks, data syncing).

**Example:**

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Cron Expression:** `0 9 * * *` = Every day at 9:00 AM UTC
- Minute: `0` (9:00)
- Hour: `9` (9 AM)
- Day of Month: `*` (every day)
- Month: `*` (every month)
- Day of Week: `*` (every day of week)

**API Route Handler:**

```typescript
// app/api/cron/send-reminders/route.ts
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic'; // CRITICAL: Prevent caching

export async function GET(request: NextRequest) {
  // 1. Verify cron secret (SECURITY)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Execute background job logic
  try {
    const results = await sendAllReminders();
    return Response.json({ success: true, results });
  } catch (error) {
    console.error('Cron job failed:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Key Points:**
- Always use `export const dynamic = 'force-dynamic'` to prevent Next.js from caching the route
- Vercel automatically includes CRON_SECRET as bearer token when triggering scheduled jobs
- Cron jobs only run on production deployments
- Timezone is always UTC (no support for other timezones)
- Cannot use both day-of-month and day-of-week (one must be `*`)

**Sources:** [Vercel Cron Jobs Docs](https://vercel.com/docs/cron-jobs), [Securing Vercel Cron Routes](https://codingcat.dev/post/how-to-secure-vercel-cron-job-routes-in-next-js-14-app-router)

### Pattern 2: React Email Templates with Resend

**What:** Use React components to build email templates, render to HTML, and send via Resend API.

**When to use:** All transactional emails (notifications, confirmations, alerts) where design consistency and type safety matter.

**Example:**

```typescript
// emails/maintenance-reminder.tsx
import { Html, Head, Body, Container, Section, Text, Button } from '@react-email/components';

interface MaintenanceReminderProps {
  truckName: string;
  serviceType: string;
  dueDate: string;
  dueMileage: number;
  currentMileage: number;
  dashboardUrl: string;
}

export function MaintenanceReminderEmail({
  truckName,
  serviceType,
  dueDate,
  dueMileage,
  currentMileage,
  dashboardUrl,
}: MaintenanceReminderProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'sans-serif' }}>
        <Container style={{ margin: '0 auto', padding: '20px 0' }}>
          <Section style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '8px' }}>
            <Text style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
              Maintenance Reminder: {truckName}
            </Text>
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
              Your {truckName} has upcoming maintenance:
            </Text>
            <Section style={{ backgroundColor: '#f0f0f0', padding: '16px', borderRadius: '4px', marginTop: '16px' }}>
              <Text style={{ margin: 0, fontWeight: 'bold' }}>{serviceType}</Text>
              <Text style={{ margin: '8px 0 0 0' }}>Due by: {dueDate}</Text>
              <Text style={{ margin: '4px 0 0 0' }}>
                or {dueMileage.toLocaleString()} miles (current: {currentMileage.toLocaleString()} mi)
              </Text>
            </Section>
            <Button
              href={dashboardUrl}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '4px',
                textDecoration: 'none',
                display: 'inline-block',
                marginTop: '24px',
              }}
            >
              View Dashboard
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

**Sending the email:**

```typescript
// lib/email/send-maintenance-reminder.ts
import { Resend } from 'resend';
import { MaintenanceReminderEmail } from '@/emails/maintenance-reminder';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMaintenanceReminder(
  toEmail: string,
  data: MaintenanceReminderProps
) {
  const { data: result, error } = await resend.emails.send({
    from: 'DriveCommand <notifications@yourdomain.com>',
    to: [toEmail],
    subject: `Maintenance Reminder: ${data.serviceType} for ${data.truckName}`,
    react: MaintenanceReminderEmail(data),
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return result;
}
```

**Key Points:**
- React Email components are type-safe and familiar to React developers
- Resend API uses `react` parameter to accept JSX components
- Email templates should be in a top-level `emails/` or `src/emails/` directory
- Use inline styles (email clients don't support external CSS)
- Resend free tier: 100 emails/day, 3,000/month
- MUST verify domain in Resend dashboard before sending from custom domain

**Sources:** [Resend Next.js Guide](https://resend.com/docs/send-with-nextjs), [React Email Documentation](https://react.email)

### Pattern 3: Notification Deduplication with Database Tracking

**What:** Track sent notifications in a database table with idempotency keys to prevent duplicate sends and enable retry logic.

**When to use:** All email notifications to ensure exactly-once delivery (or at-least-once with manual retry).

**Example:**

```prisma
// prisma/schema.prisma
enum NotificationStatus {
  PENDING
  SENT
  FAILED
  CANCELLED
}

model NotificationLog {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String              @db.Uuid

  // Idempotency key: unique per notification intent
  idempotencyKey    String              @unique

  // What notification
  notificationType  String              // "maintenance_reminder", "document_expiry"
  entityType        String?             // "scheduled_service", "document"
  entityId          String?             @db.Uuid

  // Who receives it
  recipientEmail    String
  recipientUserId   String?             @db.Uuid

  // Status tracking
  status            NotificationStatus  @default(PENDING)
  sentAt            DateTime?           @db.Timestamptz
  failedAt          DateTime?           @db.Timestamptz
  errorMessage      String?
  retryCount        Int                 @default(0)

  // Email metadata
  emailSubject      String?
  externalId        String?             // Resend email ID for tracking

  createdAt         DateTime            @default(now()) @db.Timestamptz
  updatedAt         DateTime            @updatedAt @db.Timestamptz

  tenant            Tenant              @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([status])
  @@index([idempotencyKey])
  @@index([recipientEmail])
  @@index([createdAt])
}
```

**Idempotency Key Generation:**

```typescript
// lib/notifications/notification-deduplication.ts
import { nanoid } from 'nanoid';

/**
 * Generate idempotency key for a notification.
 * Format: {type}:{entityId}:{date}:{random}
 *
 * Example: "maintenance_reminder:550e8400-e29b-41d4-a716-446655440000:2026-02-14:abc123"
 */
export function generateIdempotencyKey(
  notificationType: string,
  entityId: string,
  scheduledDate: Date
): string {
  const dateStr = scheduledDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const random = nanoid(8); // Short random suffix for daily uniqueness
  return `${notificationType}:${entityId}:${dateStr}:${random}`;
}

/**
 * Check if notification was already sent (idempotency check).
 */
export async function wasNotificationSent(
  prisma: any,
  idempotencyKey: string
): Promise<boolean> {
  const existing = await prisma.notificationLog.findUnique({
    where: { idempotencyKey },
    select: { status: true },
  });

  return existing?.status === 'SENT';
}

/**
 * Record notification attempt.
 */
export async function recordNotification(
  prisma: any,
  data: {
    tenantId: string;
    idempotencyKey: string;
    notificationType: string;
    entityType?: string;
    entityId?: string;
    recipientEmail: string;
    recipientUserId?: string;
    emailSubject: string;
  }
): Promise<string> {
  const log = await prisma.notificationLog.create({
    data: {
      ...data,
      status: 'PENDING',
    },
  });

  return log.id;
}

/**
 * Mark notification as sent.
 */
export async function markNotificationSent(
  prisma: any,
  logId: string,
  externalId: string
): Promise<void> {
  await prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      externalId,
    },
  });
}

/**
 * Mark notification as failed (for retry).
 */
export async function markNotificationFailed(
  prisma: any,
  logId: string,
  errorMessage: string
): Promise<void> {
  await prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      errorMessage,
      retryCount: { increment: 1 },
    },
  });
}
```

**Key Points:**
- Idempotency key prevents duplicate sends if cron job runs twice or retries
- Status tracking enables retry logic for FAILED notifications
- externalId links to email provider (Resend) for delivery tracking
- retryCount enables exponential backoff strategy
- Append-only log provides audit trail

**Sources:** [Notification Deduplication Best Practices](https://www.systemdesignsandbox.com/learn/idempotency-deduplication), [Designing a Notification System](https://blog.algomaster.io/p/design-a-scalable-notification-service)

### Pattern 4: Querying Upcoming Maintenance with PostgreSQL INTERVAL

**What:** Use PostgreSQL's native INTERVAL calculations to find maintenance due within a notification window (e.g., 7 days).

**When to use:** Calculating "upcoming" events based on future dates or mileage thresholds.

**Example:**

```typescript
// lib/notifications/check-upcoming-maintenance.ts
import { getTenantPrisma } from '@/lib/context/tenant-context';

interface UpcomingMaintenance {
  scheduledServiceId: string;
  truckId: string;
  truckName: string;
  serviceType: string;
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  currentMileage: number;
  ownerEmail: string;
  tenantId: string;
}

/**
 * Find scheduled services due within the next 7 days (by date).
 */
export async function findUpcomingMaintenanceByDate(
  tenantId: string
): Promise<UpcomingMaintenance[]> {
  const prisma = await getTenantPrisma();

  // Use raw SQL for INTERVAL calculation
  const results = await prisma.$queryRaw<any[]>`
    SELECT
      ss.id as "scheduledServiceId",
      ss."truckId",
      CONCAT(t.year, ' ', t.make, ' ', t.model) as "truckName",
      ss."serviceType",
      (ss."baselineDate" + (ss."intervalDays" || ' days')::interval) as "nextDueDate",
      CASE WHEN ss."intervalMiles" IS NOT NULL
        THEN ss."baselineOdometer" + ss."intervalMiles"
        ELSE NULL
      END as "nextDueMileage",
      t.odometer as "currentMileage",
      u.email as "ownerEmail",
      ss."tenantId"
    FROM "ScheduledService" ss
    JOIN "Truck" t ON ss."truckId" = t.id
    JOIN "Tenant" tenant ON ss."tenantId" = tenant.id
    JOIN "User" u ON tenant.id = u."tenantId" AND u.role = 'OWNER'
    WHERE
      ss."isCompleted" = false
      AND ss."intervalDays" IS NOT NULL
      AND ss."tenantId" = ${tenantId}::uuid
      AND (ss."baselineDate" + (ss."intervalDays" || ' days')::interval)
          BETWEEN NOW() AND (NOW() + INTERVAL '7 days')
  `;

  return results;
}

/**
 * Find scheduled services due within the next 500 miles (by mileage).
 */
export async function findUpcomingMaintenanceByMileage(
  tenantId: string
): Promise<UpcomingMaintenance[]> {
  const prisma = await getTenantPrisma();

  const results = await prisma.$queryRaw<any[]>`
    SELECT
      ss.id as "scheduledServiceId",
      ss."truckId",
      CONCAT(t.year, ' ', t.make, ' ', t.model) as "truckName",
      ss."serviceType",
      (ss."baselineDate" + (ss."intervalDays" || ' days')::interval) as "nextDueDate",
      (ss."baselineOdometer" + ss."intervalMiles") as "nextDueMileage",
      t.odometer as "currentMileage",
      u.email as "ownerEmail",
      ss."tenantId"
    FROM "ScheduledService" ss
    JOIN "Truck" t ON ss."truckId" = t.id
    JOIN "Tenant" tenant ON ss."tenantId" = tenant.id
    JOIN "User" u ON tenant.id = u."tenantId" AND u.role = 'OWNER'
    WHERE
      ss."isCompleted" = false
      AND ss."intervalMiles" IS NOT NULL
      AND ss."tenantId" = ${tenantId}::uuid
      AND (ss."baselineOdometer" + ss."intervalMiles") - t.odometer BETWEEN 0 AND 500
  `;

  return results;
}
```

**Key Points:**
- PostgreSQL INTERVAL syntax: `baselineDate + (intervalDays || ' days')::interval`
- Use `BETWEEN NOW() AND (NOW() + INTERVAL '7 days')` for date-based windows
- Mileage check: `(nextDueMileage - currentMileage) BETWEEN 0 AND 500`
- Filter on `isCompleted = false` to exclude finished services
- Join to User table with `role = 'OWNER'` to get notification recipient
- INTERVAL calculations are timezone-aware (uses UTC from Timestamptz)

**Sources:** [PostgreSQL Date/Time Functions](https://www.postgresql.org/docs/current/functions-datetime.html), Phase 8 Research (existing patterns)

### Pattern 5: Dashboard Widgets for Upcoming Items

**What:** Display upcoming maintenance and expiring documents on dashboard with visual indicators (badges, color coding).

**When to use:** Providing at-a-glance visibility into upcoming deadlines without requiring users to check emails.

**Example:**

```typescript
// components/dashboard/upcoming-maintenance-widget.tsx
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface UpcomingMaintenanceItem {
  truckName: string;
  serviceType: string;
  daysUntilDue: number | null;
  milesUntilDue: number | null;
  isDue: boolean;
}

interface UpcomingMaintenanceWidgetProps {
  items: UpcomingMaintenanceItem[];
}

export function UpcomingMaintenanceWidget({ items }: UpcomingMaintenanceWidgetProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Upcoming Maintenance</h2>
        <p className="text-gray-600">No upcoming maintenance scheduled</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Upcoming Maintenance</h2>
        <Badge variant={items.some(i => i.isDue) ? 'destructive' : 'default'}>
          {items.length}
        </Badge>
      </div>

      <ul className="space-y-3">
        {items.map((item, index) => (
          <li
            key={index}
            className={`p-3 rounded-md border ${
              item.isDue
                ? 'border-red-300 bg-red-50'
                : item.daysUntilDue !== null && item.daysUntilDue <= 3
                ? 'border-yellow-300 bg-yellow-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{item.truckName}</p>
                <p className="text-sm text-gray-600">{item.serviceType}</p>
              </div>
              <div className="text-right text-sm">
                {item.isDue ? (
                  <span className="text-red-600 font-semibold">OVERDUE</span>
                ) : (
                  <>
                    {item.daysUntilDue !== null && (
                      <p className="text-gray-700">
                        {item.daysUntilDue} days
                      </p>
                    )}
                    {item.milesUntilDue !== null && (
                      <p className="text-gray-700">
                        {item.milesUntilDue.toLocaleString()} mi
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/trucks"
        className="mt-4 inline-block text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        View all trucks →
      </Link>
    </div>
  );
}
```

**Key Points:**
- Color coding: red for overdue, yellow for urgent (<=3 days), white for upcoming
- Badge shows count with variant based on urgency
- Display both time-based (days) and mileage-based (miles) indicators
- Link to detailed view for action
- Empty state for no upcoming items

**Sources:** [React Badge UI Patterns](https://www.magicbell.com/blog/react-notification-badges), [MUI Badge Component](https://mui.com/material-ui/react-badge/)

### Anti-Patterns to Avoid

- **Don't send emails without idempotency keys** - Cron jobs can run twice, network retries happen, always use deduplication
- **Don't use local time in cron expressions** - Vercel cron always uses UTC, convert notification times to UTC
- **Don't skip CRON_SECRET validation** - Anyone can hit your API route if it's not secured
- **Don't query all tenants in a single cron job** - Multi-tenant systems should loop through tenants and use RLS-scoped queries to prevent data leakage
- **Don't use client-side env vars for secrets** - RESEND_API_KEY and CRON_SECRET must be server-only (no NEXT_PUBLIC_ prefix)
- **Don't store notification content in database** - Store metadata only, regenerate email body at send time for latest data
- **Don't hardcode email sender address** - Use environment variable for "from" address to support different environments (dev/staging/prod)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email HTML generation | Manual HTML strings with tables | React Email components | Email client compatibility is hard (Outlook, Gmail render differently), React Email handles it |
| Background job scheduling | Custom long-running Node process with setInterval | Vercel Cron Jobs or dedicated service | Cron is infrastructure, not application logic - use platform primitives |
| Email delivery reliability | Direct SMTP with Nodemailer | Transactional email service (Resend, SendGrid) | Deliverability requires IP reputation, SPF/DKIM/DMARC setup, bounce handling - services solve this |
| Duplicate execution prevention | Manual in-memory flags | Database locking with unique constraints | Race conditions in distributed systems require atomic operations |
| Retry logic with exponential backoff | Custom retry loops | Notification status table + scheduled retry job | State management complexity, need persistent queue |
| Date/time calculations | Manual millisecond math | PostgreSQL INTERVAL or native Date methods | Edge cases: DST, leap years, month boundaries |

**Key insight:** Email deliverability is deceptively complex (spam filters, authentication, reputation management, bounce handling). Transactional email services are commoditized and affordable - use them instead of building custom SMTP infrastructure. Similarly, background job scheduling is infrastructure - use platform primitives (Vercel Cron) or managed services (Inngest, Trigger.dev) rather than custom process management.

## Common Pitfalls

### Pitfall 1: Cron Job Runs Multiple Times (Duplicate Sends)

**What goes wrong:** Cron job triggers twice due to infrastructure issues, sends duplicate notification emails to users.

**Why it happens:** Distributed systems are unreliable - network timeouts, retries, infrastructure failures can cause duplicate invocations. Vercel may invoke the same cron job multiple times if the first request times out.

**How to avoid:**
- Use idempotency keys (unique per notification intent)
- Check `NotificationLog` for existing `SENT` status before sending
- Use database unique constraint on `idempotencyKey` to prevent duplicates at DB level
- Implement try-catch with proper error handling so partial failures don't corrupt state

**Warning signs:**
- Users report receiving multiple identical emails
- NotificationLog shows duplicate entries with same idempotencyKey
- Cron job logs show multiple executions at same time

**Sources:** [Preventing Duplicate Cron Execution](https://medium.com/@WMRayan/preventing-duplicate-cron-job-execution-in-scaled-environments-52ab0a13f258), [Cronitor Duplicate Prevention Guide](https://cronitor.io/guides/how-to-prevent-duplicate-cron-executions)

### Pitfall 2: Missing `force-dynamic` Causes Cached Cron Responses

**What goes wrong:** Cron job API route returns cached response instead of executing background job logic, notifications never send.

**Why it happens:** Next.js App Router aggressively caches route handlers by default. Without `export const dynamic = 'force-dynamic'`, the first cron invocation's response is cached and returned for all subsequent invocations.

**How to avoid:**
```typescript
// ALWAYS add this to cron job route handlers
export const dynamic = 'force-dynamic';
```

**Warning signs:**
- Cron job appears to succeed (200 OK) but no side effects occur
- Logs show same response data every time
- Notifications sent on first run, but not subsequent runs

**Sources:** [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs), [Next.js Route Handler Caching](https://nextjs.org/docs/app/building-your-application/caching)

### Pitfall 3: Timezone Confusion (UTC vs Local)

**What goes wrong:** Cron job scheduled for "9 AM" runs at 9 AM UTC, which is 1 AM PST - users receive emails at wrong time.

**Why it happens:** Vercel cron expressions always use UTC timezone, developers often think in local time.

**How to avoid:**
- Document all cron schedules in UTC with comment showing local equivalent
- Use timezone conversion tools when configuring: [crontab.guru](https://crontab.guru)
- Store user timezone preferences in database, but schedule cron jobs in UTC
- For user-specific notification times, use a single daily cron job that checks preferred time per user

**Warning signs:**
- User complaints about email timing
- Notifications arrive at unexpected hours
- Confusion about cron expression meaning

**Sources:** [Vercel Cron Jobs - Timezone](https://vercel.com/docs/cron-jobs), Phase 8 Research (UTC timestamptz pattern)

### Pitfall 4: Multi-Tenant Data Leakage in Notifications

**What goes wrong:** Cron job queries all tenants' data without RLS scoping, accidentally sends Tenant A's data to Tenant B's email.

**Why it happens:** Cron jobs bypass normal request context, developers forget to iterate tenants and set tenant context per iteration.

**How to avoid:**
```typescript
// BAD: Single query across all tenants
const allUpcoming = await prisma.scheduledService.findMany({
  where: { isCompleted: false },
  include: { truck: true, tenant: true },
});

// GOOD: Loop through tenants, use RLS-scoped queries
const tenants = await prisma.tenant.findMany({ where: { isActive: true } });

for (const tenant of tenants) {
  const prisma = await getTenantPrisma(tenant.id);
  const upcoming = await findUpcomingMaintenance(tenant.id);

  for (const item of upcoming) {
    // Send notification with tenant isolation verified
    await sendNotification(tenant.id, item);
  }
}
```

**Warning signs:**
- Cross-tenant data in notification emails
- RLS policies bypassed in cron job context
- Missing tenant isolation in error logs

**Sources:** [Multi-Tenant SaaS Best Practices](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture), Phase 8 Research (RLS patterns)

### Pitfall 5: Email Domain Not Verified (Deliverability Issues)

**What goes wrong:** Emails sent from unverified domain go to spam or bounce, users never receive notifications.

**Why it happens:** Email services (Resend, SendGrid) require domain verification via DNS records (SPF, DKIM, DMARC) to prove domain ownership. Using default "onboarding@resend.dev" works for testing but has low deliverability.

**How to avoid:**
- Verify domain in Resend dashboard BEFORE sending production emails
- Add required DNS records (TXT for SPF/DKIM, MX for DMARC)
- Use verified domain in `from` field: `notifications@yourdomain.com`
- Test email deliverability with [Mail Tester](https://www.mail-tester.com/)
- Monitor bounce rate in Resend dashboard

**Warning signs:**
- High bounce rate in email service dashboard
- Users report not receiving emails (check spam folders)
- Email service shows "domain not verified" warnings
- SPF/DKIM checks failing in email headers

**Sources:** [Resend Domain Verification](https://resend.com/docs/dashboard/domains/introduction), [AWS SES Tenant Management](https://aws.amazon.com/blogs/messaging-and-targeting/improve-email-deliverability-with-tenant-management-in-amazon-ses/)

### Pitfall 6: Cron Job Timeout (Long-Running Operations)

**What goes wrong:** Cron job processes 1000+ notifications, hits Vercel function timeout (10s default, 300s max on Pro), job terminates mid-execution leaving partial state.

**Why it happens:** Processing all notifications synchronously in a single request exceeds function execution time limits.

**How to avoid:**
- Batch processing: Process N notifications per cron invocation (e.g., 50)
- Use `LIMIT` in database queries to cap batch size
- Mark notifications as `PENDING` when selected, `SENT` when complete - next run picks up remaining
- For large workloads, consider dedicated job queue (Inngest, Trigger.dev)
- Monitor function execution time in Vercel logs

**Warning signs:**
- Function timeout errors in logs
- Notifications stuck in `PENDING` status
- Inconsistent processing (some days work, high-volume days fail)
- Vercel logs show 504 Gateway Timeout

**Sources:** [Vercel Function Limits](https://vercel.com/docs/functions/runtimes), [Managing Cron Jobs on Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Cron Job Handler with Security and Error Handling

```typescript
// app/api/cron/send-reminders/route.ts
import { NextRequest } from 'next/server';
import { sendMaintenanceReminders } from '@/lib/notifications/send-maintenance-reminders';
import { sendDocumentExpiryReminders } from '@/lib/notifications/send-document-expiry-reminders';

export const dynamic = 'force-dynamic'; // Prevent caching

export async function GET(request: NextRequest) {
  // 1. Verify cron secret (SECURITY - CRITICAL)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron job attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('[CRON] Starting reminder job at', new Date().toISOString());

  try {
    // 2. Process maintenance reminders
    const maintenanceResults = await sendMaintenanceReminders();
    console.log('[CRON] Maintenance reminders:', maintenanceResults);

    // 3. Process document expiry reminders
    const documentResults = await sendDocumentExpiryReminders();
    console.log('[CRON] Document expiry reminders:', documentResults);

    // 4. Return success with summary
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        maintenance: maintenanceResults,
        documents: documentResults,
      },
    });
  } catch (error) {
    console.error('[CRON] Job failed:', error);

    // Return 500 so Vercel marks job as failed (helpful for monitoring)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
```

### Send Maintenance Reminders (Multi-Tenant Loop with Deduplication)

```typescript
// lib/notifications/send-maintenance-reminders.ts
import { prisma } from '@/lib/db/client';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { sendMaintenanceReminder } from '@/lib/email/send-maintenance-reminder';
import {
  generateIdempotencyKey,
  wasNotificationSent,
  recordNotification,
  markNotificationSent,
  markNotificationFailed,
} from './notification-deduplication';
import { findUpcomingMaintenanceByDate, findUpcomingMaintenanceByMileage } from './check-upcoming-maintenance';

interface ReminderResults {
  totalProcessed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function sendMaintenanceReminders(): Promise<ReminderResults> {
  const results: ReminderResults = {
    totalProcessed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // Get all active tenants (bypass RLS for infrastructure operation)
  await prisma.$executeRaw`SET app.bypass_rls = 'on'`;
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  await prisma.$executeRaw`SET app.bypass_rls = 'off'`;

  console.log(`[MAINTENANCE_REMINDERS] Processing ${tenants.length} tenants`);

  // Process each tenant with RLS scoping
  for (const tenant of tenants) {
    try {
      const tenantPrisma = await getTenantPrisma(tenant.id);

      // Find upcoming maintenance (7 days for date-based, 500 miles for mileage-based)
      const upcomingByDate = await findUpcomingMaintenanceByDate(tenant.id);
      const upcomingByMileage = await findUpcomingMaintenanceByMileage(tenant.id);

      // Combine and deduplicate (same service might appear in both lists)
      const allUpcoming = [...upcomingByDate, ...upcomingByMileage];
      const uniqueServices = Array.from(
        new Map(allUpcoming.map(item => [item.scheduledServiceId, item])).values()
      );

      console.log(`[MAINTENANCE_REMINDERS] Tenant ${tenant.name}: ${uniqueServices.length} upcoming services`);

      // Send reminder for each service
      for (const service of uniqueServices) {
        results.totalProcessed++;

        // Generate idempotency key
        const idempotencyKey = generateIdempotencyKey(
          'maintenance_reminder',
          service.scheduledServiceId,
          new Date() // Today's date
        );

        // Skip if already sent
        if (await wasNotificationSent(tenantPrisma, idempotencyKey)) {
          console.log(`[MAINTENANCE_REMINDERS] Skipping (already sent): ${idempotencyKey}`);
          results.skipped++;
          continue;
        }

        // Record notification attempt
        const logId = await recordNotification(tenantPrisma, {
          tenantId: tenant.id,
          idempotencyKey,
          notificationType: 'maintenance_reminder',
          entityType: 'scheduled_service',
          entityId: service.scheduledServiceId,
          recipientEmail: service.ownerEmail,
          emailSubject: `Maintenance Reminder: ${service.serviceType} for ${service.truckName}`,
        });

        try {
          // Send email
          const emailResult = await sendMaintenanceReminder(service.ownerEmail, {
            truckName: service.truckName,
            serviceType: service.serviceType,
            dueDate: service.nextDueDate?.toLocaleDateString() || 'Not scheduled',
            dueMileage: service.nextDueMileage || 0,
            currentMileage: service.currentMileage,
            dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/trucks/${service.truckId}`,
          });

          // Mark as sent
          await markNotificationSent(tenantPrisma, logId, emailResult.id);
          results.sent++;

          console.log(`[MAINTENANCE_REMINDERS] Sent: ${service.ownerEmail} - ${service.serviceType}`);
        } catch (error) {
          // Mark as failed
          await markNotificationFailed(
            tenantPrisma,
            logId,
            error instanceof Error ? error.message : 'Unknown error'
          );
          results.failed++;

          console.error(`[MAINTENANCE_REMINDERS] Failed to send to ${service.ownerEmail}:`, error);
        }
      }
    } catch (error) {
      console.error(`[MAINTENANCE_REMINDERS] Error processing tenant ${tenant.name}:`, error);
      // Continue to next tenant instead of failing entire job
    }
  }

  return results;
}
```

### React Email Template for Maintenance Reminder

```typescript
// emails/maintenance-reminder.tsx
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

interface MaintenanceReminderProps {
  truckName: string;
  serviceType: string;
  dueDate: string;
  dueMileage: number;
  currentMileage: number;
  dashboardUrl: string;
}

export function MaintenanceReminderEmail({
  truckName,
  serviceType,
  dueDate,
  dueMileage,
  currentMileage,
  dashboardUrl,
}: MaintenanceReminderProps) {
  const milesRemaining = dueMileage - currentMileage;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={title}>Maintenance Reminder</Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              Your <strong>{truckName}</strong> has upcoming maintenance that needs attention:
            </Text>

            <Section style={card}>
              <Text style={cardTitle}>{serviceType}</Text>
              <Text style={cardDetail}>
                <strong>Due by:</strong> {dueDate}
              </Text>
              <Text style={cardDetail}>
                <strong>Or at:</strong> {dueMileage.toLocaleString()} miles
              </Text>
              <Text style={cardDetail}>
                <strong>Current mileage:</strong> {currentMileage.toLocaleString()} miles
              </Text>
              <Text style={cardDetail}>
                <strong>Remaining:</strong> ~{milesRemaining.toLocaleString()} miles
              </Text>
            </Section>

            <Text style={paragraph}>
              Schedule this service soon to keep your fleet running smoothly and avoid costly repairs.
            </Text>

            <Button href={dashboardUrl} style={button}>
              View Dashboard
            </Button>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              DriveCommand - Fleet Management System
            </Text>
            <Text style={footerText}>
              You're receiving this because you manage a fleet with scheduled maintenance.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Inline styles (email clients don't support external CSS)
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0',
  maxWidth: '600px',
};

const header = {
  padding: '24px 24px 0',
};

const title = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#1f2937',
  margin: '0 0 8px',
};

const content = {
  padding: '24px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 16px',
};

const card = {
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  padding: '20px',
  margin: '16px 0',
};

const cardTitle = {
  fontSize: '20px',
  fontWeight: 'bold',
  color: '#1f2937',
  margin: '0 0 12px',
};

const cardDetail = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#4b5563',
  margin: '4px 0',
};

const button = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  marginTop: '16px',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const footer = {
  padding: '0 24px 24px',
};

const footerText = {
  fontSize: '12px',
  lineHeight: '16px',
  color: '#6b7280',
  margin: '4px 0',
};
```

### Dashboard Widget with Server Component Data Fetching

```typescript
// app/(owner)/dashboard/page.tsx
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { getUpcomingMaintenance } from './actions';
import { UpcomingMaintenanceWidget } from '@/components/dashboard/upcoming-maintenance-widget';

export default async function DashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const tenantId = await requireTenantId();

  // Fetch upcoming maintenance
  const upcomingMaintenance = await getUpcomingMaintenance();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UpcomingMaintenanceWidget items={upcomingMaintenance} />
        {/* Other widgets */}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron in long-running server | Vercel Cron Jobs or managed services | 2020+ | Eliminates server management, auto-scales with platform |
| Manual HTML email strings | React Email components | 2022+ | Better DX, type safety, email client compatibility handled |
| SendGrid, Mailgun | Resend | 2023+ | Modern API, React-first, better pricing for small-medium scale |
| Polling database every minute | Cron job at optimal frequency (daily) | Always | Reduces database load, matches business requirements |
| In-memory deduplication | Database-backed idempotency | Standard practice | Survives restarts, handles distributed systems |
| Single cron job for all logic | Separate cron jobs per concern | Best practice | Isolated failures, easier monitoring, independent schedules |

**Deprecated/outdated:**
- **node-cron for serverless**: Doesn't work in serverless environments (no always-running process)
- **Nodemailer direct SMTP**: Deliverability issues, requires managing IP reputation, bounces, authentication
- **Moment.js for date calculations**: Use native Date API or Temporal (upcoming standard)
- **Storing email HTML in database**: Stale data when truck/service details change, regenerate at send time

## Open Questions

1. **Should notifications be tenant-configurable (enable/disable per reminder type)?**
   - What we know: Enterprise SaaS often has notification preferences per user/tenant
   - What's unclear: MVP scope vs future enhancement, adds UI complexity
   - Recommendation: Start with all notifications enabled, add preferences in future phase if requested

2. **What retry strategy for failed email sends?**
   - What we know: Exponential backoff is standard (retry after 1min, 5min, 30min, stop after 3 failures)
   - What's unclear: Whether to implement retry in same cron job or separate retry job
   - Recommendation: Log failures in this phase, implement retry in future phase if failure rate is significant

3. **Should dashboard show notification history (what was sent, when)?**
   - What we know: NotificationLog table tracks all sends
   - What's unclear: Whether users care about audit trail or just upcoming items
   - Recommendation: Not in MVP - focus on upcoming items widget, add history view if requested

4. **How to handle multiple owners per tenant (who gets notifications)?**
   - What we know: Current schema allows multiple users with OWNER role
   - What's unclear: Send to all owners, or primary contact only?
   - Recommendation: Send to all OWNER-role users (simple query, ensures coverage), add "primary contact" field to Tenant in future if needed

5. **Should email include "snooze" or "mark as complete" links?**
   - What we know: Modern transactional emails often have quick actions
   - What's unclear: Adds complexity (signed URLs, API endpoints for actions)
   - Recommendation: Out of scope for MVP - users can click "View Dashboard" and take action there

## Sources

### Primary (HIGH confidence)
- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs) - Official cron configuration, limits, security
- [Resend Next.js Integration](https://resend.com/docs/send-with-nextjs) - Official setup guide, API usage
- [React Email Documentation](https://react.email) - Component library, best practices
- [PostgreSQL Date/Time Functions](https://www.postgresql.org/docs/current/functions-datetime.html) - INTERVAL calculations
- Existing codebase: `prisma/schema.prisma`, Phase 8 maintenance patterns

### Secondary (MEDIUM confidence)
- [Securing Vercel Cron Routes](https://codingcat.dev/post/how-to-secure-vercel-cron-job-routes-in-next-js-14-app-router) - CRON_SECRET implementation
- [Preventing Duplicate Cron Execution](https://medium.com/@WMRayan/preventing-duplicate-cron-job-execution-in-scaled-environments-52ab0a13f258) - Deduplication strategies
- [Design a Scalable Notification Service](https://blog.algomaster.io/p/design-a-scalable-notification-service) - System design patterns
- [Idempotency and Deduplication](https://www.systemdesignsandbox.com/learn/idempotency-deduplication) - Best practices
- [Notification Retry Best Practices](https://fuze.finance/blog/oops-that-notification-failed-heres-how-to-retry-like-a-pro/) - Retry strategies
- [Multi-Tenant Email with AWS SES](https://aws.amazon.com/blogs/messaging-and-targeting/improve-email-deliverability-with-tenant-management-in-amazon-ses/) - Tenant isolation
- [React Notification Badges](https://www.magicbell.com/blog/react-notification-badges) - UI patterns

### Tertiary (LOW confidence)
- [Transactional Email Services 2026](https://www.courier.com/blog/transactional-email-services) - Market overview (not technical)
- [Next.js Environment Variables](https://blog.logrocket.com/configure-environment-variables-next-js/) - General guide (not specific to cron/emails)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH - Vercel Cron + Resend + React Email is well-documented, but less battle-tested than older solutions
- Architecture: HIGH - Patterns are standard (cron security, deduplication, React Email), verified with official docs
- Pitfalls: MEDIUM - Common issues well-documented (duplicate sends, timezone, caching), but some are Vercel-specific

**Research date:** 2026-02-14
**Valid until:** 2026-03-07 (21 days - email services and cron patterns are stable, but Next.js 15 is recent)
