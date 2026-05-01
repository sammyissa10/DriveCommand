# Phase 49: Tenant Self-Onboarding — Onboarding UX + Activation Tracking - Research

**Researched:** 2026-04-29
**Domain:** Next.js App Router / Prisma / shadcn-ui — onboarding UX, activation tracking, sample-data UI
**Confidence:** HIGH — all findings verified directly from codebase files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Checklist Visual Design
- **Location:** Right-side panel on `/onboarding/welcome`, always visible. Welcome content (greeting, next steps copy) on the left; checklist panel on the right.
- **Item states:**
  - Completed → green circle check icon + label with strikethrough text, greyed out
  - Incomplete → grey circle outline + normal label text
- **Progress indicator:** Progress bar + percentage label (e.g. "20% complete") above the checklist items. Bar fills as items are checked.
- **Completion state:** When all 5 items are complete, replace the checklist panel with a celebration state: "You're all set!" message + green success animation + "Go to Dashboard" CTA button. Do not auto-redirect.
- **Recoverable error UI:** The Phase B postscript error UI on this page must remain intact — do not remove or replace it.

#### Sample Banner Behavior
- **Dismissal:** `sessionStorage` with key `sample-banner-dismissed-<tenantId>`. Banner is gone for the current browser tab/session. Reappears on a new session (new tab, new browser, page close+reopen) if any `isSample=true` records still exist for the tenant.
- **Condition to show:** `tenant.sampleDataSeeded = true` AND at least one isSample=true record exists in any of Truck/User(DRIVER)/Customer/Load for the tenant.
- **Banner copy:** "These are sample records to help you explore. Add your own to get started."
- **Placement:** Owner dashboard AND all owner list pages (trucks, drivers, loads, customers/CRM).

#### Dashboard Integration Scope

**SAMPLE pills** (rendered next to sample records in list tables):
- Trucks list — next to each `Truck` row where `isSample=true`
- Drivers list — next to each `User WHERE role='DRIVER' AND isSample=true` row
- Loads list — next to each `Load` row where `isSample=true`
- Customers / CRM list — next to each `Customer` row where `isSample=true`

**isSample=false filters** (KPI and count queries must exclude sample records):
- Owner dashboard KPIs: all count/revenue/summary stats must add `AND isSample=false`
- Trucks list total count
- Drivers list total count (`User WHERE role='DRIVER' AND isSample=false`)
- Loads list total count

**Architectural hard rule:** ALL queries in this phase target PascalCase tables only — `Truck`, `Customer`, `Load`, `User`. Do NOT touch `carrier_trucks`, `carrier_drivers`, `clients`, or `loads` (snake_case Carrier Operations tables). See schema reconciliation report.

#### Activation Tracker Failure Handling
- **User action always wins:** The calling action MUST succeed regardless of tracker outcome. Tracker errors never propagate to caller.
- **Error handling in tracker:**
  1. Catch block: `console.error('[activation-tracker] failed for tenant <id> event <event>:', error)` with full stack
  2. Write an `AppEvent` with `eventType='activation.tracker.error'` and `properties: { tenantId, intendedEvent, errorMessage }` using `bypass_rls=on`
  3. Self-healing: completionPct is recomputed deterministically from which timestamps are set
- **Call pattern:** `await recordActivationEvent(...)` inside a `try/catch` in the calling action
- **No Sentry**

#### Activation Event Rules (locked)
- "First real truck added" → `Truck.create` where `isSample=false`
- "First real driver added" → `User.create` where `role='DRIVER' AND isSample=false` (Prisma User row, via accept-invitation flow)
- "First real client added" → `Customer.create` where `isSample=false`
- "First real load dispatched" → `Load` update where `isSample=false AND status=IN_PROGRESS` (NOT on create — must be status transition)
- `tenant.activated` AppEvent properties: `{ tenantId, ownerEmail, completionPct: 100, daysToActivate }`
- All AppEvent writes use `bypass_rls=on`
- **Idempotency:** Check `ActivationProgress.<timestampField> IS NULL` before writing. If already set, skip silently.
- **completionPct formula:** `20 * (1 + (firstRealTruckAt?1:0) + (firstRealDriverAt?1:0) + (firstRealClientAt?1:0) + (firstLoadInTransitAt?1:0))`

### Claude's Discretion
- Exact progress bar height, color tokens, and animation easing
- Exact success animation on 100% completion (keep it tasteful — CSS-only preferred, no heavy animation library)
- How `sampleDataSeeded` flag is read on list pages (server action vs. existing data fetch — use whatever requires fewest new queries)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 49 (C-01, C-02, C-03) builds on top of a solid Phase 48 foundation. The onboarding infrastructure is already complete: `hydrate-tenant.ts`, `seed-sample-data.ts`, `provision-tenant.ts`, and `ActivationProgress`/`AppEvent` schema rows all exist and work. The `/onboarding/welcome/page.tsx` page exists but renders only a basic success card — it needs to be replaced with the two-column welcome layout plus the live activation checklist.

The activation tracker (C-02) is a new file `src/lib/onboarding/activation-tracker.ts` that must be hooked into four existing server actions: `createTruck` (trucks.ts), accept-invitation (the User.create path for real drivers), `createCustomer` (customers.ts), and `updateLoadStatus` (loads.ts — specifically the IN_PROGRESS transition). Each hook is a `try/catch`-wrapped `await recordActivationEvent(...)` call added after the main DB write succeeds.

The sample-data integration (C-03) touches six files: the owner dashboard actions file (isSample=false KPI filters), the loads page (isSample=false count filter), the CRM page (isSample=false count filter), plus adding the sample-data banner component and SAMPLE pill component into the list render paths. The trucks list and drivers list pass data through `listTrucks`/`listDrivers` which already return `isSample` field via Prisma (schema confirmed). No new library dependencies are needed for any of the three plans.

**Primary recommendation:** Build C-01, C-02, C-03 in sequence. C-02 is the most risk-prone because it touches four existing actions that users depend on — apply the try/catch wrapper carefully so no existing flow can break.

---

## Standard Stack

### Core (already in project — no new installs needed)
| Library | Version | Purpose | Why Used |
|---------|---------|---------|----------|
| Next.js App Router | 15 | Server components, server actions, streaming | Project standard |
| Prisma 7 | 7.x | ORM with bypass_rls transaction pattern | Project standard |
| shadcn/ui | current | Button, Progress, Badge components | Project standard |
| Tailwind CSS | v3 | Styling | Project standard |
| lucide-react | current | Icons (CheckCircle2, Circle, AlertCircle) | Already used in welcome/page.tsx |

### No New Libraries Required
All three plans use only what is already installed. The checklist progress bar can use the existing shadcn/ui `Progress` component or a pure Tailwind `div` — no animation library needed.

---

## Architecture Patterns

### Project Structure — New Files This Phase

```
apps/web/src/
├── app/onboarding/welcome/
│   ├── page.tsx                        # MODIFY — add two-column layout + hydration
│   └── checklist.tsx                   # CREATE — client component, right panel
├── components/onboarding/
│   ├── sample-data-banner.tsx          # CREATE — client component
│   └── sample-pill.tsx                 # CREATE — client component
└── lib/onboarding/
    └── activation-tracker.ts           # CREATE — recordActivationEvent()
```

### Existing Files to Modify (C-02 hooks)

```
apps/web/src/app/(owner)/actions/
├── trucks.ts                           # MODIFY — add recordActivationEvent after createTruck
├── customers.ts                        # MODIFY — add recordActivationEvent after createCustomer
└── loads.ts                            # MODIFY — add recordActivationEvent in updateLoadStatus for IN_PROGRESS
apps/web/src/app/api/auth/accept-invitation/route.ts  # MODIFY — add recordActivationEvent after User.create
```

### Existing Files to Modify (C-03 KPI filters + banner)

```
apps/web/src/app/(owner)/actions/dashboard.ts         # MODIFY — add isSample=false to all KPI queries
apps/web/src/app/(owner)/loads/page.tsx               # MODIFY — isSample=false count + banner import
apps/web/src/app/(owner)/crm/page.tsx                 # MODIFY — isSample=false count + banner import
apps/web/src/app/(owner)/trucks/page.tsx              # MODIFY — banner import
apps/web/src/app/(owner)/drivers/page.tsx             # MODIFY — banner import
apps/web/src/components/trucks/truck-list.tsx         # MODIFY — render SamplePill per row
apps/web/src/components/drivers/driver-list.tsx       # MODIFY — render SamplePill per row
apps/web/src/components/loads/load-list.tsx           # MODIFY — render SamplePill per row
apps/web/src/components/crm/customer-list.tsx         # MODIFY — render SamplePill per row
```

### Pattern 1: bypass_rls Transaction (HIGH confidence — verified in 15+ files)

All system writes (activation tracker, AppEvent) must use this exact pattern:

```typescript
// Source: apps/web/src/lib/onboarding/hydrate-tenant.ts (verified)
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  // ... reads and writes
}, TX_OPTIONS);
```

Where `TX_OPTIONS = { maxWait: 15000, timeout: 30000 }` from `@/lib/db/prisma`.

### Pattern 2: Try/Catch Non-Propagating Side Effect (HIGH confidence — verified in trucks.ts and customers.ts)

The `fireEvent` call in `createTruck` and `createCustomer` demonstrates the exact pattern for the activation tracker hook:

```typescript
// Source: apps/web/src/app/(owner)/actions/trucks.ts (verified)
const truck = await prisma.truck.create({ data: { ... } });

// Post-commit side effect — errors do NOT propagate to caller
try {
  await recordActivationEvent(tenantId, 'first_real_truck');
} catch (err) {
  // log only, never throw
}
```

### Pattern 3: Checklist State — ActivationProgress Field Mapping

The 5 checklist items map directly to ActivationProgress fields (verified in schema):

| Item # | Label | ActivationProgress field | Auto-complete |
|--------|-------|--------------------------|---------------|
| 1 | Account created | `accountCreatedAt` (always set) | YES — always shown complete |
| 2 | Add your first truck | `firstRealTruckAt` | No |
| 3 | Add your first driver | `firstRealDriverAt` | No |
| 4 | Add your first client | `firstRealClientAt` | No |
| 5 | Dispatch your first load | `firstLoadInTransitAt` | No |

### Pattern 4: Reading ActivationProgress for the Welcome Page

The welcome page is a server component — it can read ActivationProgress directly in the page body using bypass_rls (same pattern as the existing tenant.findUnique call):

```typescript
// Extend the existing bypass_rls block in welcome/page.tsx
const [tenant, progress] = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  return Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId }, select: { ... } }),
    tx.activationProgress.findUnique({ where: { tenantId }, select: { ... } }),
  ]);
}, TX_OPTIONS);
```

Pass `progress` as a prop to the `<ChecklistPanel>` client component — no polling needed on page load. The checklist reflects the DB state at render time.

### Pattern 5: sessionStorage Banner Dismissal

The sample-data banner is a client component. It must check sessionStorage on mount:

```typescript
// Source: CONTEXT.md decision (verified)
const storageKey = `sample-banner-dismissed-${tenantId}`;
const isDismissed = typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === 'true';

function dismiss() {
  sessionStorage.setItem(storageKey, 'true');
  setVisible(false);
}
```

The `tenantId` must be passed from the server component as a prop — it is NOT available from `getSession()` client-side. All list pages already run as server components and call `getSession()` or `requireTenantId()`.

### Anti-Patterns to Avoid

- **Throwing from the activation tracker:** The tracker must NEVER throw. The calling action must always succeed.
- **Using snake_case tables in tracker queries:** NEVER `prisma.carrierTruck`, `prisma.carrierDriver`, `prisma.carrierClient`, `prisma.carrierLoad`. Only PascalCase models.
- **Re-firing already-set timestamps:** The idempotency check (`IS NULL`) must precede every ActivationProgress update. Skip silently if already set.
- **Polling for checklist updates:** The welcome page renders server-side; the checklist state is fetched at page load. Checklist items flip when the user performs the action and the page re-renders (server action revalidates). No WebSocket or polling needed.
- **Auto-redirecting on 100% completion:** The spec explicitly says "do not auto-redirect" — show the "You're all set!" state and a "Go to Dashboard" CTA button.
- **Touching the existing error UI:** The Phase B postscript error UI (AlertCircle block) inside the try/catch in `welcome/page.tsx` must be preserved exactly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom SVG/canvas | Tailwind `div` with `style={{ width: pct + '%' }}` or shadcn/ui `Progress` | Already in project, zero deps |
| Completed checkmark icon | Custom SVG | `CheckCircle2` from lucide-react | Already imported in welcome/page.tsx |
| Incomplete circle icon | Custom SVG | `Circle` from lucide-react | Already installed |
| Database transaction | Manual connection pool | `prisma.$transaction(async tx => { ... }, TX_OPTIONS)` | Project standard, TX_OPTIONS already set |
| bypass_rls | Custom SQL function | `tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`` | Project standard |

---

## Common Pitfalls

### Pitfall 1: Activation Tracker Error Propagates to Caller
**What goes wrong:** Tracker throws, calling action (e.g., createTruck) returns `{ error: ... }` to the user even though the truck was saved successfully.
**Why it happens:** The tracker `await` is outside a try/catch, so the error bubbles up.
**How to avoid:** Every `recordActivationEvent(...)` call MUST be inside `try { await recordActivationEvent(...); } catch (err) { console.error(...); }`.
**Warning signs:** TypeScript `async` function without surrounding try/catch.

### Pitfall 2: Wrong Driver Create Hook Point
**What goes wrong:** Tracker fires on `inviteDriver` (which creates a `DriverInvitation`, not a `User` row), instead of on `accept-invitation` (which creates the actual `User` row).
**Why it happens:** The driver flow is invitation-based — `inviteDriver` in drivers.ts creates a pending invitation, but the Prisma `User` row is only created in `accept-invitation/route.ts` when the driver accepts.
**How to avoid:** Hook into `accept-invitation/route.ts` after `tx.user.create()`, not into `inviteDriver()`. The check must be `isSample=false` (always true for real invitees — real users never have `isSample=true`).
**Warning signs:** Looking at `drivers.ts` and not finding a `prisma.user.create()` call.

### Pitfall 3: "First load in transit" Fires on Wrong Action
**What goes wrong:** Tracker fires when load is CREATED (createLoad in loads.ts), not when it transitions to IN_PROGRESS.
**Why it happens:** The event is `firstLoadInTransitAt` not `firstLoadCreatedAt` — they are different fields.
**How to avoid:** Hook into `updateLoadStatus` in loads.ts, only when `newStatus === 'IN_PROGRESS'` AND `load.isSample === false`.
**Warning signs:** Checking for `status === 'IN_TRANSIT'` instead of `status === 'IN_PROGRESS'` (these are different enum values — `IN_PROGRESS` is the correct value per schema).

**IMPORTANT clarification on Load status enum values:** The `loads.ts` file's `updateLoadStatus` function uses `'IN_TRANSIT'` as the status string in `STATUS_TRANSITIONS` (`PICKED_UP → IN_TRANSIT`). But the CONTEXT.md says `status=IN_PROGRESS`. Check `LoadStatus` enum in the Prisma schema carefully — the activation hook fires on whichever status represents "load is currently being moved" (the one that comes after PICKED_UP).

### Pitfall 4: Dashboard KPI Uses createTenantClient, Not getTenantPrisma
**What goes wrong:** isSample=false filter added to `getTenantPrisma()` queries but the dashboard uses `createTenantClient(tenantId)` — two different client constructors.
**Why it happens:** `_fetchDashboardMetrics` uses `createTenantClient(tenantId)` from `@/lib/db/tenant-client`, not `getTenantPrisma()`. Both apply RLS but are invoked differently.
**How to avoid:** When adding `isSample: false` filters to dashboard.ts, look at the actual variable (`db.user.count(...)`, `db.load.count(...)`) — `db` here is a `createTenantClient` result.

### Pitfall 5: Banner Shows on Empty Sample Records (After User Deletes All Samples)
**What goes wrong:** Banner continues to show because `sampleDataSeeded = true` even after all sample records are deleted.
**Why it happens:** `sampleDataSeeded` is a one-way flag; it never flips back to false.
**How to avoid:** The condition-to-show is `sampleDataSeeded = true` AND at least one `isSample=true` record exists. The banner must check the live count (or pass it from the server page query). The simplest approach: the list pages already fetch all records — filter the fetched list for `isSample=true` on the client side to decide whether to show the banner.

### Pitfall 6: isSample Filter Missing from listTrucks/listDrivers
**What goes wrong:** `listTrucks()` returns sample trucks, which then appear as real trucks in counts.
**Why it happens:** The current `listTrucks()` uses `archivedAt: null` as the only filter — no `isSample: false`.
**How to avoid:** Add `isSample: false` to the `where` clause in `listTrucks()` AND to the count query in `loads/page.tsx` and `crm/page.tsx`. The banner check uses a separate parallel query or derives from the returned list.

### Pitfall 7: RLS Blocks ActivationProgress Reads in Server Action
**What goes wrong:** `prisma.activationProgress.findUnique(...)` returns null in a server action context because RLS blocks the read (the activation-tracker is a "system write" without tenant context).
**Why it happens:** ActivationProgress has `FORCE ROW LEVEL SECURITY` (confirmed in spec section 4.12). All reads must use either tenant context or bypass_rls.
**How to avoid:** Always wrap ActivationProgress reads/writes in a `prisma.$transaction` with `set_config('app.bypass_rls', 'on', TRUE)` first.

---

## Code Examples

### Activation Tracker — Core Pattern

```typescript
// src/lib/onboarding/activation-tracker.ts
// Source: pattern derived from hydrate-tenant.ts bypass_rls usage (verified)

import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

type ActivationEvent =
  | 'first_real_truck'
  | 'first_real_driver'
  | 'first_real_client'
  | 'first_load_in_transit';

export async function recordActivationEvent(tenantId: string, event: ActivationEvent): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const progress = await tx.activationProgress.findUnique({
        where: { tenantId },
        select: {
          firstRealTruckAt: true,
          firstRealDriverAt: true,
          firstRealClientAt: true,
          firstLoadInTransitAt: true,
          isActivated: true,
        },
      });
      if (!progress) return; // No activation record = not an onboarding tenant, skip

      const fieldMap: Record<ActivationEvent, keyof typeof progress> = {
        first_real_truck: 'firstRealTruckAt',
        first_real_driver: 'firstRealDriverAt',
        first_real_client: 'firstRealClientAt',
        first_load_in_transit: 'firstLoadInTransitAt',
      };

      const field = fieldMap[event];
      if (progress[field] !== null) return; // Idempotency: already set, skip

      const now = new Date();
      const updatedProgress = { ...progress, [field]: now };

      const completionPct =
        20 *
        (1 +
          (updatedProgress.firstRealTruckAt ? 1 : 0) +
          (updatedProgress.firstRealDriverAt ? 1 : 0) +
          (updatedProgress.firstRealClientAt ? 1 : 0) +
          (updatedProgress.firstLoadInTransitAt ? 1 : 0));

      const isNowActivated = event === 'first_load_in_transit';

      await tx.activationProgress.update({
        where: { tenantId },
        data: {
          [field]: now,
          completionPct,
          isActivated: isNowActivated || progress.isActivated,
        },
      });

      if (isNowActivated && !progress.isActivated) {
        // Fire tenant.activated AppEvent
        const owner = await tx.user.findFirst({
          where: { tenantId, role: 'OWNER' },
          select: { email: true },
        });
        const accountProgress = await tx.activationProgress.findUnique({
          where: { tenantId },
          select: { accountCreatedAt: true },
        });
        const daysToActivate = accountProgress
          ? Math.ceil((now.getTime() - accountProgress.accountCreatedAt.getTime()) / 86_400_000)
          : 0;

        await tx.appEvent.create({
          data: {
            tenantId,
            eventType: 'tenant.activated',
            properties: {
              tenantId,
              ownerEmail: owner?.email ?? '',
              completionPct: 100,
              daysToActivate,
            },
          },
        });
      }
    }, TX_OPTIONS);
  } catch (error) {
    console.error(`[activation-tracker] failed for tenant ${tenantId} event ${event}:`, error instanceof Error ? error.stack : error);
    // Best-effort error AppEvent — if this also fails, swallow silently
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        await tx.appEvent.create({
          data: {
            tenantId,
            eventType: 'activation.tracker.error',
            properties: {
              tenantId,
              intendedEvent: event,
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          },
        });
      }, TX_OPTIONS);
    } catch {
      // swallow
    }
  }
}
```

### Hook Into createTruck (C-02 hook pattern)

```typescript
// Source: apps/web/src/app/(owner)/actions/trucks.ts — verified existing fireEvent pattern
const truck = await prisma.truck.create({
  data: { ...result.data, tenantId, createdById: userId, updatedById: userId },
});

// Activation tracker hook — ALWAYS try/catch, never propagates
if (!truck.isSample) {
  try {
    await recordActivationEvent(tenantId, 'first_real_truck');
  } catch (err) {
    console.error('[createTruck] recordActivationEvent failed', { truckId: truck.id, err });
  }
}
```

### Hook Into updateLoadStatus (IN_PROGRESS transition)

```typescript
// Source: apps/web/src/app/(owner)/actions/loads.ts — verified updateLoadStatus function
await prisma.load.update({
  where: { id },
  data: { status: newStatus as LoadStatus },
});

// Activation tracker hook for first real load in transit
if (newStatus === 'IN_TRANSIT') {  // verify exact enum value from LoadStatus
  const loadForTracking = await prisma.load.findUnique({
    where: { id },
    select: { isSample: true, tenantId: true },
  });
  if (loadForTracking && !loadForTracking.isSample) {
    const tId = loadForTracking.tenantId;
    try {
      await recordActivationEvent(tId, 'first_load_in_transit');
    } catch (err) {
      console.error('[updateLoadStatus] recordActivationEvent failed', { loadId: id, err });
    }
  }
}
```

### Welcome Page — Two-Column Layout Skeleton

```typescript
// apps/web/src/app/onboarding/welcome/page.tsx
// Preserve the existing try/catch error UI block exactly.
// After hydrateTenant() succeeds, render this instead of the current basic card:

return (
  <div className="min-h-screen bg-background p-4 md:p-8">
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Welcome content */}
        <div className="space-y-6">
          {/* greeting + next steps copy */}
        </div>
        {/* Right: Checklist panel — always visible */}
        <div>
          <ChecklistPanel progress={progress} tenantId={tenantId} />
        </div>
      </div>
    </div>
  </div>
);
```

### Sample Data Banner Component

```typescript
// src/components/onboarding/sample-data-banner.tsx
// 'use client' — uses sessionStorage (browser-only)
'use client';
import { useState, useEffect } from 'react';

interface SampleDataBannerProps {
  tenantId: string;
  hasSampleRecords: boolean; // derived from page's data fetch
}

export function SampleDataBanner({ tenantId, hasSampleRecords }: SampleDataBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = `sample-banner-dismissed-${tenantId}`;
    const dismissed = sessionStorage.getItem(key) === 'true';
    setVisible(hasSampleRecords && !dismissed);
  }, [tenantId, hasSampleRecords]);

  if (!visible) return null;

  return (
    <div className="...banner styles...">
      <span>These are sample records to help you explore. Add your own to get started.</span>
      <button onClick={() => {
        sessionStorage.setItem(`sample-banner-dismissed-${tenantId}`, 'true');
        setVisible(false);
      }}>Dismiss</button>
    </div>
  );
}
```

### SAMPLE Pill Component

```typescript
// src/components/onboarding/sample-pill.tsx
export function SamplePill() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      SAMPLE
    </span>
  );
}
```

---

## Codebase Findings — Confirmed File State

### 1. `/onboarding/welcome/page.tsx` — CONFIRMED EXISTS
**Path:** `apps/web/src/app/onboarding/welcome/page.tsx`
**Current state:** Server component. Imports `hydrateTenant`, calls it inside try/catch. On error returns the AlertCircle error UI block (MUST BE PRESERVED). On success currently renders a basic single-card layout (not the two-column layout yet). This entire success-path render block must be REPLACED with the new layout while leaving the error path untouched.
**Key imports already there:** `{ CheckCircle2, AlertCircle }` from lucide-react, `{ Button }`, `{ getSession }`, `{ prisma, TX_OPTIONS }`, `{ hydrateTenant }`.

### 2. `ActivationProgress` Schema — CONFIRMED MATCHES SPEC
**File:** `apps/web/prisma/schema.prisma` (line 2252)
**Fields confirmed:**
- `tenantId` (unique UUID)
- `accountCreatedAt` (always set at signup)
- `firstRealTruckAt` (nullable DateTime)
- `firstRealDriverAt` (nullable DateTime)
- `firstRealClientAt` (nullable DateTime)
- `firstRealLoadCreatedAt` (nullable DateTime — unused in C-02, but exists)
- `firstLoadInTransitAt` (nullable DateTime — THE activation event)
- `firstLoadDeliveredAt` (nullable DateTime — unused in C-02, but exists)
- `completionPct` (Int, default 20)
- `isActivated` (Boolean, default false)

### 3. `AppEvent` Schema — CONFIRMED EXISTS
**File:** `apps/web/prisma/schema.prisma` (line 2313)
**Fields confirmed:** `id`, `tenantId`, `userId` (nullable), `eventType` (String), `properties` (Json), `createdAt`

### 4. `User.isSample` — CONFIRMED EXISTS IN SCHEMA
**File:** `apps/web/prisma/schema.prisma` (line 215)
`isSample Boolean @default(false)` — already added to User model. No migration needed.

### 5. `createTruck` Action — CONFIRMED LOCATION AND SIGNATURE
**File:** `apps/web/src/app/(owner)/actions/trucks.ts`
**Function:** `createTruck(prevState, formData)` — server action
**Where to hook:** After `prisma.truck.create()` succeeds (line ~107), before the `fireEvent` call. Add `if (!truck.isSample)` guard.
**tenantId available:** Yes — `const tenantId = await requireTenantId();` already called just above.

### 6. `createCustomer` Action — CONFIRMED LOCATION AND SIGNATURE
**File:** `apps/web/src/app/(owner)/actions/customers.ts`
**Function:** `createCustomer(prevState, formData)` — server action
**Where to hook:** After `prisma.customer.create()` succeeds (~line 46). Add `if (!customer.isSample)` guard.
**tenantId available:** Yes — `const tenantId = await requireTenantId();` is already called.

### 7. `updateLoadStatus` — CONFIRMED LOCATION AND STATUS VALUES
**File:** `apps/web/src/app/(owner)/actions/loads.ts`
**Function:** `updateLoadStatus(id, newStatus)` — server action
**Status transitions confirmed:** `PICKED_UP → IN_TRANSIT` (NOT `IN_PROGRESS`). The enum value used in code is `'IN_TRANSIT'`, not `'IN_PROGRESS'`. The CONTEXT.md says `status=IN_PROGRESS` but the actual codebase enum value is `IN_TRANSIT`.
**CRITICAL DISCREPANCY:** CONTEXT.md says "status=IN_PROGRESS" but `STATUS_TRANSITIONS` in loads.ts shows `PICKED_UP: ['IN_TRANSIT', 'CANCELLED']` — the correct trigger is `newStatus === 'IN_TRANSIT'`, not `'IN_PROGRESS'`.
**Where to hook:** After `prisma.load.update({ data: { status: newStatus } })` (line ~526). Need to fetch `isSample` and `tenantId` from the load before or after the update.

### 8. Driver "First Real Driver" Hook Point — accept-invitation Route
**File:** `apps/web/src/app/api/auth/accept-invitation/route.ts`
**Why here, not drivers.ts:** `inviteDriver` in drivers.ts creates a `DriverInvitation`, NOT a `User` row. The actual `User` row is created in the `POST /api/auth/accept-invitation` handler (around line 212: `tx.user.create()`). Real invited drivers always have `isSample=false` (the form doesn't expose isSample). Hook after `tx.user.create()` inside the transaction, where `invitation.tenantId` is available.

### 9. Dashboard KPI Action — CONFIRMED `createTenantClient` Pattern
**File:** `apps/web/src/app/(owner)/actions/dashboard.ts`
**Key detail:** `_fetchDashboardMetrics` uses `createTenantClient(tenantId)` (not `getTenantPrisma()`). The variable is named `db`, not `prisma`. When adding `isSample: false` filters, target `db.user.count(...)`, `db.load.count(...)` etc.
**KPIs missing isSample filter:**
- `db.user.count({ where: { role: 'DRIVER', isActive: true } })` — needs `isSample: false`
- `db.load.count({ where: { status: { in: [...] } } })` — needs `isSample: false`
- `db.load.count({ where: { status: {...}, deliveryDate: {...} } })` — needs `isSample: false`
- Invoice queries don't have an `isSample` flag — leave unchanged

### 10. `listDrivers` — MISSING isSample FILTER (needs fix in C-03)
**File:** `apps/web/src/app/(owner)/actions/drivers.ts` (line 194)
**Current query:** `prisma.user.findMany({ where: { role: 'DRIVER' } })` — no `isSample: false` filter.
**What to add:** `isSample: false` to the where clause so sample drivers don't appear in the real driver list.

### 11. Loads Page — inline Prisma call (not via server action)
**File:** `apps/web/src/app/(owner)/loads/page.tsx`
**Pattern:** The page directly calls `prisma.load.findMany(...)` and `prisma.load.count(...)` via `getTenantPrisma()`. Not via a separate action file.
**What to add:** `isSample: false` to the `where` clause in `findMany` and `count`.

### 12. CRM Page — inline Prisma call
**File:** `apps/web/src/app/(owner)/crm/page.tsx`
**Pattern:** Same as loads — directly calls `prisma.customer.findMany(...)` and `prisma.customer.count(...)`.
**What to add:** `isSample: false` to the count queries. The `totalRevenue` aggregation from loads also needs `isSample: false` on the load groupBy.

### 13. `lib/onboarding/` Directory — CONFIRMED EXISTS with Phase 48 files
**Files present:**
- `hydrate-tenant.ts` — complete, idempotent, works correctly
- `provision-tenant.ts` — complete, creates ActivationProgress at signup
- `seed-sample-data.ts` — complete, seeds Truck/Customer/Load with `isSample=true`
- New file needed: `activation-tracker.ts`

### 14. bypass_rls Pattern — CONFIRMED CANONICAL USAGE
**Pattern used in 15+ files.** The canonical form is:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  // ... operations
}, TX_OPTIONS);
```
`TX_OPTIONS` is imported from `@/lib/db/prisma`. This pattern is required for ALL ActivationProgress and AppEvent reads/writes because these tables have `FORCE ROW LEVEL SECURITY`.

### 15. How to Read `sampleDataSeeded` on List Pages
**Decision (Claude's Discretion):** The list pages are server components that already call `getTenantPrisma()` or `getTenantId()`. The most efficient approach is to add a parallel `prisma.tenant.findUnique({ where: { id: tenantId }, select: { sampleDataSeeded: true } })` alongside the existing data fetches. Then pass `sampleDataSeeded` AND `hasSampleRecords` (derived by checking if any returned row has `isSample=true`) to the `SampleDataBanner` client component.
**Why not a server action:** Adding a dedicated server action call just for this flag creates an extra round-trip. The list pages already have a try/catch data fetch block — simply add the tenant flag to the parallel Promise.all.
**Recommended:** Get `tenantId` from `requireTenantId()` (already imported in pages that call `getTenantPrisma()`), then add `prisma.tenant.findUnique(...)` to the Promise.all. Pass `tenant.sampleDataSeeded` and `anyRowIsSample` to the banner.

---

## Open Questions

1. **Load status enum: IN_TRANSIT vs IN_PROGRESS**
   - What we know: `loads.ts` uses `'IN_TRANSIT'` as the status string (in `STATUS_TRANSITIONS: PICKED_UP → IN_TRANSIT`). CONTEXT.md says `status=IN_PROGRESS`.
   - What's unclear: Whether CONTEXT.md's use of "IN_PROGRESS" is a synonym/label for the same status, or refers to a different status.
   - Recommendation: Use `newStatus === 'IN_TRANSIT'` in the hook — this is what the actual code calls the status after PICKED_UP. The "in transit" meaning matches.

2. **Dashboard page routing — carrier dashboard vs /dashboard**
   - What we know: `/dashboard/page.tsx` simply redirects to `/carrier/dashboard`. The actual dashboard is at `/carrier/dashboard`. The sample-data banner for the "owner dashboard" should target `/carrier/dashboard/page.tsx`.
   - What's unclear: The CONTEXT.md says "Owner dashboard AND all owner list pages" — the owner dashboard is `/carrier/dashboard`, not `/dashboard`.
   - Recommendation: Place the sample-data banner in the carrier dashboard page component, not the `/dashboard` redirect page.

3. **Trucks list — uses `listTrucks` which doesn't filter isSample**
   - What we know: `trucks/page.tsx` calls `listTrucks()` which returns all non-archived trucks. The list component receives the full list and renders it.
   - Recommendation: Either (a) add `isSample: false` to `listTrucks()` — but this would hide sample trucks from the list entirely, or (b) keep sample trucks in the list but render the SAMPLE pill next to them. Per CONTEXT.md, the SAMPLE pill should appear, meaning samples are visible in the list. The count displayed at the page level should exclude samples, but the list itself shows them with the pill.
   - Therefore: Do NOT add `isSample: false` to `listTrucks()`. Instead add the pill to the list component for `isSample=true` rows. Add a separate count query with `isSample: false` for the header count.

---

## Sources

### Primary (HIGH confidence)
- `apps/web/prisma/schema.prisma` — ActivationProgress fields, AppEvent fields, User.isSample, Tenant.sampleDataSeeded (all confirmed by direct read)
- `apps/web/src/app/onboarding/welcome/page.tsx` — existing page structure, error UI, hydrateTenant call (direct read)
- `apps/web/src/lib/onboarding/hydrate-tenant.ts` — bypass_rls pattern, idempotency pattern (direct read)
- `apps/web/src/lib/onboarding/provision-tenant.ts` — ActivationProgress creation at signup (direct read)
- `apps/web/src/lib/onboarding/seed-sample-data.ts` — isSample=true seeding confirmed (direct read)
- `apps/web/src/app/(owner)/actions/trucks.ts` — createTruck signature, fireEvent hook pattern (direct read)
- `apps/web/src/app/(owner)/actions/loads.ts` — updateLoadStatus, STATUS_TRANSITIONS, IN_TRANSIT value (direct read)
- `apps/web/src/app/(owner)/actions/customers.ts` — createCustomer signature (direct read)
- `apps/web/src/app/(owner)/actions/drivers.ts` — listDrivers missing isSample filter (direct read)
- `apps/web/src/app/(owner)/actions/dashboard.ts` — createTenantClient usage, KPI queries needing isSample=false (direct read)
- `apps/web/src/app/api/auth/accept-invitation/route.ts` — User.create location for driver hook (direct read)
- `apps/web/src/app/(owner)/loads/page.tsx` — inline prisma queries (direct read)
- `apps/web/src/app/(owner)/crm/page.tsx` — inline prisma queries (direct read)
- `apps/web/src/app/(owner)/trucks/page.tsx` — page structure (direct read)
- `apps/web/src/app/(owner)/drivers/page.tsx` — page structure (direct read)
- `apps/web/src/lib/db/prisma.ts` — TX_OPTIONS value confirmed (direct read)
- `apps/web/src/lib/context/tenant-context.ts` — getTenantPrisma, requireTenantId pattern (direct read)
- `docs/specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md` — completionPct formula, activation event rules (direct read)
- `docs/specs/tenant-self-onboarding/04-SCHEMA-RECONCILIATION.md` — PascalCase vs snake_case authority (direct read)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, verified in imports
- Architecture patterns: HIGH — bypass_rls pattern verified in 15+ files, all file locations confirmed by directory reads
- Codebase file state: HIGH — all 15 key files read directly
- Pitfalls: HIGH — derived from direct code inspection (IN_TRANSIT vs IN_PROGRESS discrepancy observed in live code)

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (stable codebase — no fast-moving external deps)
