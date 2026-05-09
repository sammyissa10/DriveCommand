# Phase 46: Workflow Engine 5 — Polish & Analytics - Research

**Researched:** 2026-04-24
**Domain:** Next.js 15 App Router, Prisma 7, tRPC v11, Recharts, Nodemailer/react-email, Vercel Cron
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Skip-with-reason audit trail
- Step rows on the instance detail page show a **SKIPPED badge** inline (visible without extra taps)
- A separate **"Audit Log" section** appears at the bottom of the instance detail page
- Audit section content: **skip events only** — "Skipped by [user] — Reason: [text]" with timestamp
- Other state changes (completions, failures) are NOT shown in the audit section — those are already represented by the step status badges

#### Overdue alerts — per-step due dates
- Due date is configured **at the template level** (StepTemplate gets a `dueWithinHours` field — e.g. "24h") as a default
- Dispatchers can **override the due date per step when starting a checklist** (instance-level override)
- Overdue alert recipient is also **configurable at the template level** — when building a playbook, the admin selects who gets notified (DRIVER, OWNER, or BOTH) per step
- If a step has no `dueWithinHours` set, the cron skips it entirely (no hardcoded fallback)
- Cron sweeps PENDING/IN_PROGRESS steps only — completed and skipped steps are ignored

### Claude's Discretion
- Preview Panel layout (slide-in from right, width, phone frame dimensions) — standard approach
- Analytics page location (new /checklists/analytics route vs section on /checklists) — Claude decides what fits the existing layout
- Chart types for analytics (completion rate bar/line, time avg, drop-off funnel) — Claude decides
- Time range default for analytics (last 30 days) — Claude decides
- Safety Manager digest format (HTML email, one per day at 8am tenant timezone) — Claude decides
- SMS provider choice (Twilio is the industry default) — Claude decides if SMS infrastructure needs to be added or if it's already present

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 46 is a pure-polish phase that completes the Workflow Engine feature set without adding new schema entities. It operates on top of the fully built Phases 42–45 foundation: all Prisma models exist, all tRPC routers exist, the 3-column builder UI exists, the instance detail page exists, and the `workflow-notifications` cron route exists (but is not yet registered in `vercel.json`).

The six work streams are: (1) Preview Panel in the builder, (2) SMS delivery via Twilio (new dependency), (3) overdue alerts with per-step `dueWithinHours` + `overdueRecipient` fields on `PlaybookStep`, (4) analytics dashboard using the already-installed Recharts library, (5) daily Safety Manager email digest using the existing Nodemailer/react-email pipeline, and (6) the skip audit trail on the instance detail page (already partially implemented — `skipReason` and `skippedByUserId` already exist on `StepInstance`, and the current UI already shows skip reason inline on the step row).

**Primary recommendation:** The skip audit trail and overdue cron are the most invasive changes (schema migration needed for `PlaybookStep.dueWithinHours` and `PlaybookStep.overdueRecipient`). Build those first. The Preview Panel, analytics, digest, and SMS are additive and lower risk.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.15.4 | Analytics charts | Already installed, used in revenue report page |
| @react-email/components | ^1.0.7 | Email templates | Used for all existing workflow emails |
| @react-email/render | ^2.0.4 | HTML email render | Used by gmail-client.ts |
| nodemailer | ^8.0.1 | Gmail SMTP | Existing email transport |
| @trpc/server + client | ^11.16.0 | API layer | Existing workflow routers |

### New Dependency Required
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| twilio | ^5.x | SMS delivery | No SMS provider installed; spec Section 10 calls out Twilio; TODO comments in notifications.ts say `TODO(phase-5): send SMS via Twilio` |

**Installation:**
```bash
cd apps/web && npm install twilio
cd apps/web && npm install --save-dev @types/twilio  # if types not bundled
```

Verify Twilio bundles its own types (it does as of v5+, no @types/twilio needed).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Twilio | Vonage, Sinch, AWS SNS | Twilio is the spec default; TODO comments name it explicitly; don't substitute |
| Recharts BarChart | FunnelChart lib | Recharts has no built-in funnel; use a vertical BarChart sorted descending to simulate drop-off |

---

## Architecture Patterns

### Recommended File Additions
```
apps/web/src/
  app/(owner)/checklists/
    analytics/
      page.tsx                          # NEW — analytics route
      _components/
        AnalyticsDashboard.tsx          # client component
        PlaybookCompletionChart.tsx     # recharts BarChart wrapper
        StepDropOffChart.tsx            # recharts BarChart (sorted desc)
        AvgTimeCard.tsx                 # stat card
    playbooks/[id]/edit/
      _components/
        PreviewPanel.tsx                # NEW slide-in panel
  emails/
    workflow-safety-digest.tsx          # NEW — daily digest template
  app/api/cron/
    workflow-digest/
      route.ts                         # NEW — 8am daily digest cron

server/api/routers/workflows/
  analytics.ts                         # NEW tRPC router for analytics queries

prisma/migrations/
  XXXXXX_add_playbook_step_overdue_fields/
    migration.sql                      # dueWithinHours + overdueRecipient on PlaybookStep

packages/validation/src/workflows/
  analytics.ts                         # NEW Zod schemas for analytics input
```

### Pattern 1: Preview Panel (Slide-in from Right)
**What:** A 4th panel added to the existing 3-column DnD layout in BuilderClient.tsx. Triggered by a header "Preview" button. Slides in from the right, replacing the StepDetailEditor slot or stacking alongside it.
**When to use:** Builder has selectedStep open AND preview is open — close StepDetailEditor, show PreviewPanel. Or dedicate a new panel slot.
**Example:**
```typescript
// Source: existing BuilderClient.tsx pattern (line 310–336)
// The right panel slot (360px) already conditionally renders StepDetailEditor.
// PreviewPanel takes the same slot when preview mode is active:

const [previewMode, setPreviewMode] = useState<'driver' | 'dispatcher' | null>(null);

// In JSX:
{previewMode ? (
  <div className="w-[380px] flex-shrink-0 border-l border-border overflow-y-auto bg-background">
    <PreviewPanel steps={steps} mode={previewMode} onClose={() => setPreviewMode(null)} />
  </div>
) : selectedStep ? (
  <div className="w-[360px] ...">
    <StepDetailEditor ... />
  </div>
) : null}
```
**Phone frame dimensions:** Use a CSS phone frame mockup (375px wide, ~812px tall proportions) via inline styles, no external library needed.

### Pattern 2: Schema Migration — Add `dueWithinHours` and `overdueRecipient` to PlaybookStep
**What:** Two new optional fields on `PlaybookStep`. `dueWithinHours` (Int?) is the step-level default SLA. `overdueRecipient` (new enum, or a String?) controls who gets the overdue push.

**Recommendation on `overdueRecipient` type:** Use a new enum `OverdueRecipient` with values `DRIVER`, `OWNER`, `BOTH`. This matches the locked decision and the existing `AssigneeRole` pattern in the schema.

```prisma
enum OverdueRecipient {
  DRIVER
  OWNER
  BOTH
}

model PlaybookStep {
  // ... existing fields ...
  dueWithinHours    Int?             // e.g. 24 = "must complete within 24h of instance start"
  overdueRecipient  OverdueRecipient @default(OWNER)
}
```

The `StepInstance.dueDate` field already exists. The cron already checks `dueDate < now-24h`. What changes: (a) `generatePlaybookInstance` must compute `dueDate = startedAt + dueWithinHours` when creating StepInstances, and (b) the cron must read `overdueRecipient` from `stepSnapshot` to target the right user(s).

### Pattern 3: Analytics tRPC Queries
**What:** A new `analytics` router under `server/api/routers/workflows/analytics.ts` with Prisma aggregate queries. Added to the workflows router index.
**Query pattern follows existing codebase — use Prisma `groupBy` and `aggregate`:**
```typescript
// Source: verified Prisma 7 docs pattern, consistent with existing prisma usage in the project
const completionsByPlaybook = await prisma.playbookInstance.groupBy({
  by: ['playbookId'],
  where: { tenantId: ctx.tenantId, createdAt: { gte: since } },
  _count: { id: true },
});
const completedByPlaybook = await prisma.playbookInstance.groupBy({
  by: ['playbookId'],
  where: { tenantId: ctx.tenantId, status: 'COMPLETED', createdAt: { gte: since } },
  _count: { id: true },
});
// completionRate = completed / total per playbookId
```

**Average completion time:**
```typescript
// startedAt → completedAt delta, only for COMPLETED instances
const completed = await prisma.playbookInstance.findMany({
  where: { tenantId: ctx.tenantId, status: 'COMPLETED', completedAt: { not: null }, startedAt: { not: null }, createdAt: { gte: since } },
  select: { startedAt: true, completedAt: true, playbookId: true },
});
// Compute mean of (completedAt - startedAt) in JS
```

**Step drop-off:**
```typescript
// For a given playbookId, count StepInstances by status across all instances in range
const stepCounts = await prisma.stepInstance.groupBy({
  by: ['stepTemplateId', 'status'],
  where: { playbookInstance: { tenantId: ctx.tenantId, playbookId, createdAt: { gte: since } } },
  _count: { id: true },
});
```

### Pattern 4: Safety Manager Daily Digest
**What:** A new cron at `/api/cron/workflow-digest` that fires at 8am UTC (acceptable approximation for "tenant timezone" — the spec says Claude decides the format). It queries all SAFETY_MANAGER-role StepInstances that became overdue or were completed in the last 24h, then emails all users with `assigneeRole = SAFETY_MANAGER` in that tenant.

**Key finding:** `UserRole` enum in schema is `OWNER | MANAGER | DRIVER` — there is NO `SAFETY_MANAGER` UserRole. `SAFETY_MANAGER` is only an `AssigneeRole` value (in the workflow engine). This means you cannot query `User.role = SAFETY_MANAGER` to find digest recipients. **Recipients must be identified by their assigned StepInstance rows where `assigneeRole = 'SAFETY_MANAGER'`** — extract unique `assignedUserId` values and look them up. Alternatively, treat all `MANAGER` or `OWNER` users as digest recipients (more practical — Safety Managers in the current auth system are modeled as MANAGER role users). Recommend: send digest to all active `OWNER` + `MANAGER` users per tenant who have at least one SAFETY_MANAGER-role step active.

**Email template pattern (follows workflow-instance-blocked.tsx):**
```typescript
// apps/web/src/emails/workflow-safety-digest.tsx
// Props: { tenantName, period, overdueItems: Array<{stepName, playbookName, assigneeName, dueDate}>, completedItems: ..., dashboardUrl }
// Use @react-email/components Html/Body/Container/Section/Text/Button pattern
// Subject: "[Company] Daily Workflow Summary — April 24, 2026"
```

### Pattern 5: SMS via Twilio
**What:** Add Twilio SMS sending to the existing `sendStepAssigned` function in `notifications.ts`. The existing TODO comment is explicit: `TODO(phase-5): send SMS via Twilio`.

**Key finding:** There is NO Twilio SDK in package.json. It must be installed. Environment variables needed: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

**Twilio integration pattern:**
```typescript
// Source: Twilio Node.js SDK docs (verified 2026)
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

await client.messages.create({
  body: `DriveCommand task from ${tenantName}: ${stepName}. Complete here: ${link}`,
  from: process.env.TWILIO_FROM_NUMBER,
  to: recipientPhoneNumber,
});
```

**Critical gap:** The `User` model must have a `phoneNumber` field for SMS delivery. Check if it exists.

### Pattern 6: Skip Audit Trail on Instance Detail
**What:** The `ChecklistDetailClient.tsx` already shows skip reason inline on the step row (line 442–444: `{step.status === 'SKIPPED' && step.skipReason && <span className="italic">Skipped — {step.skipReason}</span>}`). Phase 46 adds:
1. A SKIPPED badge (replace the italic text with a proper `<Badge>` component).
2. An "Audit Log" Card section at the bottom of the page listing only SKIPPED steps with full context.

**`skippedByUserId` is already on StepInstance but the `get` procedure does not fetch user details.** The tRPC `instance.get` procedure (instance.ts line 82–88) uses `include: { stepInstances: true }` — it returns `skippedByUserId` (a UUID string) but not the user's name. To show "Skipped by [user name]", either:
- (a) Extend `instance.get` to join User on `skippedByUserId` — adds a query but is clean.
- (b) Pass `skippedByUserId` to the client and fetch user display separately — unnecessary complexity.

**Recommendation:** Extend `instance.get` to include `stepInstances: { include: { skippedBy: { select: { firstName: true, lastName: true, email: true } } } }`. This requires adding a Prisma relation `skippedBy User? @relation("StepSkippedBy", fields: [skippedByUserId], references: [id])` to `StepInstance`. Currently `skippedByUserId` is a plain String, not a FK relation.

**However:** No new schema entities are allowed per the phase boundary. A new relation on `StepInstance` is a schema migration (adding a FK constraint), not a new entity. This is acceptable within the stated constraint "no new schema entities." A migration adding `dueWithinHours`, `overdueRecipient`, and the `skippedBy` relation can be bundled into a single migration.

**Alternative if relation is too risky:** Fetch user display names in the tRPC router by doing a second query for all unique `skippedByUserId` values, returning them as a map alongside stepInstances. This avoids schema changes for the audit trail portion.

### Pattern 7: Vercel Cron Registration
**What:** `workflow-notifications` cron is implemented but NOT in `vercel.json`. Phase 46 needs:
- `workflow-notifications` added (hourly for overdue sweep)
- `workflow-digest` added (daily at 8am UTC)

```json
// vercel.json additions:
{ "path": "/api/cron/workflow-notifications", "schedule": "0 * * * *" },
{ "path": "/api/cron/workflow-digest", "schedule": "0 8 * * *" }
```

### Anti-Patterns to Avoid
- **Adding `SAFETY_MANAGER` to `UserRole` enum:** It doesn't exist there and the auth system doesn't use it. Keep it in `AssigneeRole` only.
- **Hardcoding 24h fallback for overdue:** The locked decision says cron skips steps with no `dueWithinHours` set. Do not add a fallback.
- **Using Prisma `$queryRaw` for analytics:** Use typed `groupBy` + `aggregate` so TypeScript catches schema changes.
- **Building a custom chart library:** Recharts is already installed and used. Use `BarChart` with `ResponsiveContainer`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charts | Custom SVG chart | recharts (already installed) | Axes, tooltips, animation, responsive — all built in |
| Email templates | Raw HTML strings | @react-email/components + sendEmail() | Already the established pattern; gmail-client.ts handles everything |
| SMS sending | HTTP fetch to Twilio REST API | twilio npm SDK | SDK handles auth, retries, error codes |
| Phone frame CSS | External library | Inline CSS box-shadow + border-radius | A few lines of CSS, no library needed |
| Audit log timestamps | Manual date formatting | date-fns (already installed) | `format(date, 'MMM d, yyyy h:mm a')` |

**Key insight:** Every infrastructure concern (email, push, cron auth, DB queries) has an established pattern in this codebase. Phase 46 should compose existing pieces, not invent new ones.

---

## Common Pitfalls

### Pitfall 1: User Phone Numbers May Not Exist
**What goes wrong:** SMS sending fails at runtime because `User.phoneNumber` doesn't exist in the schema or the field is null for most users.
**Why it happens:** The User model was not built with SMS in mind. Phone numbers were never required.
**How to avoid:** Check the User model for a `phoneNumber` field before implementing SMS. If absent, the migration must add it, and `sendStepAssigned` must guard `if (!user.phoneNumber) return` before sending SMS.
**Warning signs:** TypeScript error when accessing `user.phoneNumber`.

### Pitfall 2: `workflow-notifications` Cron Not in vercel.json
**What goes wrong:** Overdue alerts never fire in production even though the cron route works locally.
**Why it happens:** The cron was built in Phase 45 but never registered. The `vercel.json` was not updated.
**How to avoid:** Add both cron entries to `vercel.json` as part of this phase.
**Warning signs:** Checking `vercel.json` — `/api/cron/workflow-notifications` is absent (confirmed by research).

### Pitfall 3: `skippedByUserId` Has No Prisma Relation
**What goes wrong:** Cannot do `include: { skippedBy: true }` in Prisma because `skippedByUserId` is a plain String column with no `@relation`.
**Why it happens:** The field was added as a bare UUID string, not a typed FK in Prisma.
**How to avoid:** Either (a) add the relation via migration, or (b) do a second Prisma query to resolve user names. Option (b) avoids a migration.
**Warning signs:** `Property 'skippedBy' does not exist on type StepInstanceInclude` TypeScript error.

### Pitfall 4: Analytics `groupBy` on Non-Tenant-Scoped Subquery
**What goes wrong:** Step drop-off query returns data from other tenants because the `where` clause on the nested `playbookInstance` is not applied correctly with `groupBy`.
**Why it happens:** Prisma `groupBy` with nested `where` conditions can be tricky — the filter must be on the top-level model or via a relation filter.
**How to avoid:** For step drop-off, fetch the set of `playbookInstanceId`s for the tenant first, then filter `StepInstance.playbookInstanceId IN (...)`. Or use a raw aggregate query with explicit tenantId join.
**Warning signs:** Analytics data including records from the wrong tenantId — test with two tenants seeded.

### Pitfall 5: Preview Panel Breaks DnD
**What goes wrong:** Opening the preview panel while a drag is in progress causes the DnD layout to jump because the panel width changes the flex layout.
**Why it happens:** `DndContext` wraps the entire 3-column layout. Adding/removing the panel mid-drag changes column widths.
**How to avoid:** Disable DnD while preview is open, or use `position: absolute/fixed` overlay for the panel so it doesn't affect flex layout. A fixed-position right panel is simpler and avoids all layout interference.
**Warning signs:** DragOverlay ghost appears at wrong position after toggling preview.

### Pitfall 6: Safety Manager Digest Dedup
**What goes wrong:** Digest emails sent multiple times if cron fires twice (Vercel can fire cron routes more than once in edge cases).
**Why it happens:** No dedup guard on the digest cron.
**How to avoid:** Write a `PlaybookNotification` row with `notificationType = 'INSTANCE_BLOCKED'` + `channel = 'EMAIL'` after each digest send, and query for "no EMAIL digest sent in last 20h" before sending. Or use a simple date-based key: only send if no EMAIL PlaybookNotification with `createdAt > start_of_today`.

---

## Code Examples

### Analytics tRPC Router Pattern
```typescript
// Source: verified against existing instance.ts router and Prisma 7 groupBy docs
// apps/web/src/server/api/routers/workflows/analytics.ts
import { z } from 'zod';
import { router, tenantMemberProcedure } from '@/server/api/trpc';
import { prisma } from '@/lib/db/prisma';

const getPlaybookStats = tenantMemberProcedure
  .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
  .query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
    
    const [total, completed, playbooks] = await Promise.all([
      prisma.playbookInstance.groupBy({
        by: ['playbookId'],
        where: { tenantId: ctx.tenantId, createdAt: { gte: since } },
        _count: { id: true },
      }),
      prisma.playbookInstance.groupBy({
        by: ['playbookId'],
        where: { tenantId: ctx.tenantId, status: 'COMPLETED', createdAt: { gte: since } },
        _count: { id: true },
      }),
      prisma.playbook.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    return total.map((t) => {
      const c = completed.find((c) => c.playbookId === t.playbookId);
      const pb = playbooks.find((p) => p.id === t.playbookId);
      return {
        playbookId: t.playbookId,
        playbookName: pb?.name ?? 'Unknown',
        total: t._count.id,
        completed: c?._count.id ?? 0,
        completionRate: t._count.id > 0 ? (c?._count.id ?? 0) / t._count.id : 0,
      };
    });
  });
```

### Cron Auth Pattern (follows existing convention exactly)
```typescript
// Source: existing workflow-notifications/route.ts (line 34–44)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... sweep logic
}
```

### Recharts BarChart for Completion Rate
```typescript
// Source: existing apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx pattern
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// data shape: [{ playbookName: 'CDL Onboarding', completionRate: 0.72 }, ...]
<ResponsiveContainer width="100%" height={240}>
  <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="playbookName" tick={{ fontSize: 12 }} />
    <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
    <Tooltip formatter={(v: number) => `${Math.round(v * 100)}%`} />
    <Bar dataKey="completionRate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Skip Audit Log Section (No Schema Change Required)
```typescript
// Resolve skipped-by user names in the tRPC router (option b — avoids schema migration)
// In instance.ts `get` procedure:
const stepInstances = instance.stepInstances;
const skippedUserIds = [...new Set(
  stepInstances.filter(s => s.skippedByUserId).map(s => s.skippedByUserId!)
)];
const skippedByUsers = skippedUserIds.length > 0
  ? await prisma.user.findMany({
      where: { id: { in: skippedUserIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
  : [];

return { ...instance, skippedByUsers }; // client receives user map alongside stepInstances
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| SMS via hand-rolled HTTP | Twilio SDK | SDK handles auth, retry, error codes |
| Overdue: hardcoded 24h globally | Per-step `dueWithinHours` on PlaybookStep | Configurable per step at template level |
| Overdue: always notify dispatchers | Per-step `overdueRecipient` enum | Configurable recipient per step |
| Skip: inline italic text only | Badge + dedicated audit section | Compliance-grade audit trail |
| Cron not registered | vercel.json entry added | Overdue alerts actually fire in production |

**Deprecated/outdated:**
- `TODO(phase-5)` comments in `notifications.ts`: resolve all of them in this phase. There are two: SMS for STEP_ASSIGNED, and a general SMS note. Both should be resolved.

---

## Open Questions

1. **Does `User` have a `phoneNumber` field?**
   - What we know: Not visible in the schema excerpt read. The User model was built for Supabase auth and doesn't show a phoneNumber column in what was read.
   - What's unclear: Whether it was added in an earlier quick task.
   - Recommendation: The planner should have the executor read the User model in schema.prisma (lines ~180–230) before writing SMS code. If absent, add `phoneNumber String?` to User in the migration.

2. **Twilio staging number for SMS verification**
   - What we know: No Twilio account credentials are in `.env.example` or `.env.local`.
   - What's unclear: Whether the user has a Twilio account set up.
   - Recommendation: The plan should include a task for the user to add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to Vercel env vars. The implementation task should make SMS fail gracefully (log + skip) if env vars are absent rather than crashing.

3. **Analytics page location**
   - What we know: `/checklists` page uses `DashboardClient` which renders `WorkBoardSection` + `PlaybookCard` grid. Adding a full analytics section to this page would make it very long.
   - Recommendation: Add a `/checklists/analytics` sub-route with its own page. Add a nav tab/link in the checklists section header ("Checklists" | "Analytics"). This matches how other multi-section features work in this codebase (e.g., driver tabs).

4. **Safety Manager digest dedup strategy**
   - What we know: `PlaybookNotification` table has `notificationType` and `channel` fields. Using `notificationType = INSTANCE_BLOCKED | channel = EMAIL | createdAt > today_start` as a dedup key is technically overloading INSTANCE_BLOCKED for the digest.
   - Recommendation: Introduce a new `NotifType` value `DAILY_DIGEST` in the schema enum to avoid semantic overloading. This is a non-breaking enum addition (one migration line).

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `apps/web/src/server/services/workflows/notifications.ts` — full file read, confirms TODO(phase-5) SMS markers
- Direct codebase read: `apps/web/src/app/(owner)/checklists/instances/[id]/_components/ChecklistDetailClient.tsx` — confirms skip display is partial, no audit section exists
- Direct codebase read: `apps/web/prisma/schema.prisma` lines 1939–2111 — confirms all Workflow Engine models, `dueWithinHours` field exists on PlaybookStep but `overdueRecipient` does NOT exist yet
- Direct codebase read: `apps/web/src/app/api/cron/workflow-notifications/route.ts` — confirms cron logic works; cron sweeps `dueDate < now-24h AND isOverdue=false`
- Direct codebase read: `apps/web/vercel.json` — confirms `/api/cron/workflow-notifications` is NOT registered
- Direct codebase read: `apps/web/package.json` — confirms recharts ^2.15.4 installed, Twilio NOT installed
- Direct codebase read: `apps/web/src/lib/email/gmail-client.ts` — confirms sendEmail() pattern
- Direct codebase read: `apps/web/src/emails/workflow-instance-blocked.tsx` — confirms email template pattern
- Direct codebase read: `apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx` — confirms recharts BarChart pattern used in production
- Direct codebase read: `apps/web/src/app/(owner)/checklists/playbooks/[id]/edit/_components/BuilderClient.tsx` — confirms 3-column layout, selectedStep conditional panel

### Secondary (MEDIUM confidence)
- Spec `docs/specs/DriveCommand_Workflow_Engine_v2.md` Section 14 (Phase 5 DoD), Section 10 (Notifications) — read directly
- Twilio Node.js SDK docs: standard install pattern `npm install twilio`, credentials via `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`

### Tertiary (LOW confidence)
- None — all key facts verified against the codebase directly.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against package.json and lib/ files
- Architecture patterns: HIGH — derived directly from reading existing BuilderClient.tsx, ChecklistDetailClient.tsx, instance.ts router, and notifications.ts
- Pitfalls: HIGH — derived from actual code state (missing vercel.json entry, missing Twilio, skippedByUserId without relation)
- Open questions: MEDIUM — phoneNumber field existence not confirmed; requires one additional schema read

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days — stable stack)

---

## Key Implementation Notes for Planner

These are not in any section above but are critical for task sequencing:

1. **`dueWithinHours` already exists on `PlaybookStep` in the schema** (line 1993: `dueDaysFromStart Int?`). However, the locked decision uses `dueWithinHours` (hours, not days). This is a different granularity. The existing `dueDaysFromStart` field is in days. **The migration must add a new `dueWithinHours Int?` field** — do not reuse `dueDaysFromStart`. The old field can coexist; just add the new one.

2. **`overdueRecipient` does NOT exist on `PlaybookStep`** — it must be added via migration. Recommend new enum `OverdueRecipient { DRIVER OWNER BOTH }`.

3. **The cron `workflow-notifications` already sweeps `dueDate < now-24h`** but the current logic notifies all dispatchers (OWNER/MANAGER). With per-step `overdueRecipient`, the cron must be updated to read `overdueRecipient` from `stepSnapshot` and fan out accordingly. The `stepSnapshot` already contains a copy of the PlaybookStep configuration — check if `overdueRecipient` will be captured in the snapshot at instance generation time (it must be added to the snapshot when `generatePlaybookInstance` is updated to include it).

4. **The skip audit section requires resolving user names.** The safest approach (no schema change) is a second lookup in the `instance.get` tRPC procedure returning a `skippedByUsers` map alongside stepInstances.

5. **Analytics route should be `/checklists/analytics`** — new page.tsx file needed. The DashboardClient on `/checklists` should gain an "Analytics" link/tab in the header.
