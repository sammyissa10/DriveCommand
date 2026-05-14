---
phase: quick-306
plan: 306
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/driver-pay/me/settlements/route.ts
  - apps/web/src/app/api/driver-pay/me/settlements/[id]/route.ts
  - apps/web/src/app/api/driver-pay/me/settlements/[id]/pdf/route.ts
  - apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts
  - apps/web/src/app/api/driver-pay/me/bonuses/route.ts
  - apps/web/src/app/api/driver-pay/me/deductions/route.ts
  - apps/web/src/app/api/driver-pay/me/current-period/route.ts
  - apps/web/src/app/(driver)/pay/page.tsx
  - apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
  - apps/web/src/app/(driver)/pay/_components/DisputeForm.tsx
  - apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx
  - apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
  - apps/web/src/components/driver/driver-nav.tsx
  - apps/web/src/components/driver/driver-bottom-nav.tsx
  - apps/mobile/app/(driver)/pay/index.tsx
  - apps/mobile/app/(driver)/pay/settlements/[id].tsx
  - apps/mobile/app/(driver)/pay/settlements/[id]/dispute.tsx
  - apps/mobile/app/(driver)/_layout.tsx
  - apps/web/src/app/api/driver-pay/__tests__/driver-portal-api.test.ts
autonomous: true

must_haves:
  truths:
    - "Driver can see a list of their finalized/paid/voided settlements"
    - "Driver can open a settlement and see its full breakdown (earnings, bonuses, deductions, net pay)"
    - "Driver can download the settlement PDF if one exists"
    - "Driver can see assignments in their current period that are not yet settled"
    - "Driver can see their active deductions with installment progress"
    - "Driver can see their bonuses (paid + pending) with installment labeling"
    - "Driver can submit a dispute on a FINALIZED settlement with category + message (min 50 chars)"
    - "Driver cannot access another driver's settlement/bonus/deduction data (403)"
    - "Driver pay portal is reachable from web driver nav and mobile driver tab bar"
    - "Mobile driver pay screens render the same data set with NativeWind v4 + theme tokens"
  artifacts:
    - path: "apps/web/src/app/api/driver-pay/me/settlements/route.ts"
      provides: "GET own settlements (paginated, status != DRAFT)"
    - path: "apps/web/src/app/api/driver-pay/me/settlements/[id]/route.ts"
      provides: "GET own settlement detail with assignments/components/bonuses/deductions"
    - path: "apps/web/src/app/api/driver-pay/me/settlements/[id]/pdf/route.ts"
      provides: "GET own settlement PDF URL"
    - path: "apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts"
      provides: "POST dispute (FINALIZED only, audit_log write)"
    - path: "apps/web/src/app/api/driver-pay/me/bonuses/route.ts"
      provides: "GET own bonuses (visibleToDriver=true)"
    - path: "apps/web/src/app/api/driver-pay/me/deductions/route.ts"
      provides: "GET own deductions with decimal.js progress"
    - path: "apps/web/src/app/api/driver-pay/me/current-period/route.ts"
      provides: "GET own PENDING_REVIEW/APPROVED unsettled assignments"
    - path: "apps/web/src/app/(driver)/pay/page.tsx"
      provides: "Web pay portal entry (server component with data fetch)"
    - path: "apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx"
      provides: "4-tab portal UI: Settlements | Current Period | Deductions | Bonuses"
    - path: "apps/web/src/app/(driver)/pay/_components/DisputeForm.tsx"
      provides: "Dispute submission modal with category + message + confirmation"
    - path: "apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx"
      provides: "Read-only mirror of owner SettlementDetailView with dispute trigger"
    - path: "apps/mobile/app/(driver)/pay/index.tsx"
      provides: "Mobile pay hub with 4 tabs (FlashList, pull-to-refresh)"
    - path: "apps/mobile/app/(driver)/pay/settlements/[id].tsx"
      provides: "Mobile settlement detail with PDF link via expo-web-browser"
    - path: "apps/mobile/app/(driver)/pay/settlements/[id]/dispute.tsx"
      provides: "Mobile dispute form screen"
    - path: "apps/web/src/app/api/driver-pay/__tests__/driver-portal-api.test.ts"
      provides: "vitest suite covering RBAC + tenant isolation + dispute validation"
  key_links:
    - from: "apps/web/src/app/(driver)/pay/page.tsx"
      to: "/api/driver-pay/me/* routes"
      via: "fetch in server component or direct getTenantPrisma() queries with driverId guard"
      pattern: "carrierDriver.findFirst.*userId.*session\\.userId"
    - from: "apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts"
      to: "DriverDispute table + DriverPayAuditLog"
      via: "prisma.driverDispute.create + prisma.driverPayAuditLog.create"
      pattern: "prisma\\.driverDispute\\.create"
    - from: "apps/mobile/app/(driver)/pay/*"
      to: "/api/driver-pay/me/* routes"
      via: "Bearer token via @drivecommand/api-client (or fetch with token header)"
      pattern: "Authorization.*Bearer|api-client"
    - from: "apps/web/src/components/driver/driver-nav.tsx + driver-bottom-nav.tsx"
      to: "/pay"
      via: "Nav link with DollarSign icon"
      pattern: "href.*['\"]\/pay['\"]"
---

<objective>
Build Phase 9 of the Driver Pay module — the Driver Pay Portal across web and mobile, with end-to-end dispute flow.

Purpose: Drivers currently have no read view into their own pay data. This phase delivers a read-only portal so drivers can see settlements, current period earnings, deductions, and bonuses, plus a dispute submission flow that pauses payment and notifies dispatchers (per spec section 8.9 Flow D).

Output:
- 7 new driver-scoped /me/ API routes (RBAC: DRIVER only, filter by carrierDriver.id == userId mapping)
- Web pay portal under (driver)/pay with 4 tabs + settlement detail + dispute modal
- Mobile pay screens (hub + detail + dispute) under (driver)/pay/
- Driver nav updates (sidebar + bottom nav + mobile tab)
- Vitest suite verifying RBAC, tenant isolation, dispute eligibility
- DriverDispute Prisma model already exists in schema (verified at apps/web/prisma/schema.prisma:2828) — NO migration needed
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/DriverPay_TechnicalSpec_v4.md
@apps/web/prisma/schema.prisma
@apps/web/src/app/api/driver-pay/settlements/[settlementId]/route.ts
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/roles.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/app/(driver)/layout.tsx
@apps/web/src/components/driver/driver-nav.tsx
@apps/web/src/components/driver/driver-bottom-nav.tsx
@apps/mobile/app/(driver)/_layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Seven driver-scoped /me/ API routes (RBAC + dispute flow)</name>
  <files>
    apps/web/src/app/api/driver-pay/me/settlements/route.ts
    apps/web/src/app/api/driver-pay/me/settlements/[id]/route.ts
    apps/web/src/app/api/driver-pay/me/settlements/[id]/pdf/route.ts
    apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts
    apps/web/src/app/api/driver-pay/me/bonuses/route.ts
    apps/web/src/app/api/driver-pay/me/deductions/route.ts
    apps/web/src/app/api/driver-pay/me/current-period/route.ts
  </files>
  <action>
NOTE on schema: DriverDispute model ALREADY EXISTS in apps/web/prisma/schema.prisma (line 2828) along with DisputeTargetType, DisputeIssueCategory, DisputeStatus enums. DO NOT create a new migration. Original task spec mentioned adding the model — that step is unnecessary; verify the model in schema before writing routes and reuse the existing enum types.

Pattern reference: apps/web/src/app/api/driver-pay/settlements/[settlementId]/route.ts already implements the DRIVER vs MANAGER guard. Mirror it.

Shared helpers (inline at top of each route file or extracted to a small helper used across the 7 files — your call, keep it consistent):
```ts
import { NextRequest, NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';

async function requireDriver() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const role = session.role.toUpperCase();
  if (role !== UserRole.DRIVER && session.role !== 'driver') {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }
  const prisma = await getTenantPrisma();
  const driver = await prisma.carrierDriver.findFirst({
    where: { userId: session.userId },
    select: { id: true, tenantId: true },
  });
  if (!driver) return { error: NextResponse.json({ error: 'Driver record not found.' }, { status: 404 }) };
  return { session, prisma, driver };
}
```

Routes to implement:

1) **GET /api/driver-pay/me/settlements** (route.ts)
   - Query params: `page` (default 1), `limit` (default 20, max 50)
   - `prisma.driverSettlement.findMany({ where: { driverId: driver.id, tenantId: session.tenantId, status: { not: 'DRAFT' }, deletedAt: null }, orderBy: { periodStart: 'desc' }, skip, take })`
   - Return `{ settlements, total, page, limit }`

2) **GET /api/driver-pay/me/settlements/[id]** ([id]/route.ts)
   - Load settlement with `where: { id, driverId: driver.id, tenantId: session.tenantId }` (filtering by driverId is the 403 guard — findFirst returning null → 404 since the row either doesn't exist or isn't theirs)
   - Include: `assignments: { include: { payComponents: { where: { visibleToDriver: true, deletedAt: null } }, load: { select: { id: true, referenceNumber: true, status: true } } } }, bonuses: { where: { deletedAt: null, visibleToDriver: true } }`
   - Also load deductions snapshot for this settlement: `prisma.driverDeduction.findMany({ where: { driverId: driver.id, tenantId: session.tenantId, deletedAt: null, visibleToDriver: true } })` and any per-settlement deduction transactions if such a table exists; otherwise include the current snapshot
   - Return `{ settlement, deductions }`

3) **GET /api/driver-pay/me/settlements/[id]/pdf** ([id]/pdf/route.ts)
   - Verify ownership same as #2
   - Return `{ url: settlement.pdfUrl }` (200) or 404 with `{ error: 'PDF not generated yet.' }`

4) **POST /api/driver-pay/me/settlements/[id]/dispute** ([id]/dispute/route.ts)
   - Zod schema:
     ```ts
     const disputeSchema = z.object({
       issueCategory: z.enum(['WRONG_AMOUNT', 'MISSING_PAY', 'WRONG_MILES', 'MISSING_RECEIPT', 'OTHER']),
       driverMessage: z.string().min(50, 'Message must be at least 50 characters').max(2000),
     });
     ```
   - Verify settlement ownership (driverId match) → 403 if not
   - Verify `settlement.status === 'FINALIZED'` → 400 `{ error: 'Only FINALIZED settlements can be disputed.' }` otherwise
   - `prisma.$transaction([ driverDispute.create({...}), driverPayAuditLog.create({...}) ])`
   - DriverDispute fields: tenantId, driverId, targetType: 'SETTLEMENT', targetId: settlementId, issueCategory, driverMessage, status: 'OPEN', createdBy: session.userId
   - AuditLog fields: tenantId, entityType: 'SETTLEMENT', entityId: settlementId, action: 'DISPUTE_OPENED', userId: session.userId, metadata: { disputeId, issueCategory } — match the existing DriverPayAuditLog field names (check the model; it may use different column names like newValue/previousValue)
   - Return 201 `{ dispute: { id, status, issueCategory, driverMessage, createdAt } }`

5) **GET /api/driver-pay/me/bonuses** (bonuses/route.ts)
   - `prisma.driverBonus.findMany({ where: { driverId: driver.id, tenantId: session.tenantId, visibleToDriver: true, deletedAt: null }, orderBy: { triggerDate: 'desc' } })`
   - Return `{ bonuses }`

6) **GET /api/driver-pay/me/deductions** (deductions/route.ts)
   - `prisma.driverDeduction.findMany({ where: { driverId: driver.id, tenantId: session.tenantId, deletedAt: null, visibleToDriver: true } })`
   - For each, compute progress with decimal.js (no native float):
     ```ts
     const collected = new Decimal(d.amountCollected ?? 0);
     const total = new Decimal(d.totalAmount ?? 0);
     const remaining = total.minus(collected);
     const pct = total.isZero() ? 0 : collected.div(total).times(100).toDecimalPlaces(0).toNumber();
     ```
   - Return `{ deductions: [...d, progress: { collected: collected.toString(), total: total.toString(), remaining: remaining.toString(), pct } }`

7) **GET /api/driver-pay/me/current-period** (current-period/route.ts)
   - `prisma.loadDriverAssignment.findMany({ where: { driverId: driver.id, tenantId: session.tenantId, payStatus: { in: ['PENDING_REVIEW', 'APPROVED'] }, settlementId: null, deletedAt: null }, include: { payComponents: { where: { visibleToDriver: true, deletedAt: null } }, load: { select: { id: true, referenceNumber: true, status: true } } }, orderBy: { createdAt: 'desc' } })`
   - Return `{ assignments }`

Constraints:
- All money math: decimal.js — NEVER native float
- Drivers are read-only; reject any non-GET method on read routes (Next.js handles that by only exporting GET)
- Use `session.tenantId` as a defense-in-depth filter (RLS may already scope, but explicit is safer)

After implementing all 7 routes, commit:
```
git add apps/web/src/app/api/driver-pay/me
git commit -m "feat(driver-pay): add driver-scoped /me/ API routes"
```
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit
    Confirm 7 files created in apps/web/src/app/api/driver-pay/me/
    Check each file uses requireDriver pattern + decimal.js for money + status filters
    Manual smoke: in a route, log `await prisma.driverDispute.create({...})` compiles — confirms model/enum types resolved
  </verify>
  <done>
    All 7 routes return correct JSON shape, DRIVER role required, driverId guard in place, dispute route enforces FINALIZED status + min 50 char message, decimal.js used for progress math, tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Web driver pay portal pages + dispute modal + nav links</name>
  <files>
    apps/web/src/app/(driver)/pay/page.tsx
    apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
    apps/web/src/app/(driver)/pay/_components/DisputeForm.tsx
    apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx
    apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
    apps/web/src/components/driver/driver-nav.tsx
    apps/web/src/components/driver/driver-bottom-nav.tsx
  </files>
  <action>
Read first: apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx (mirror it for read-only driver view). Also read apps/web/src/components/driver/driver-nav.tsx and apps/web/src/components/driver/driver-bottom-nav.tsx before editing.

**page.tsx** (server component — entry):
```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import Decimal from 'decimal.js';
import { DriverPayPage } from './_components/DriverPayPage';

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role.toUpperCase() !== UserRole.DRIVER && session.role !== 'driver') redirect('/');

  const prisma = await getTenantPrisma();
  const driver = await prisma.carrierDriver.findFirst({
    where: { userId: session.userId },
    include: { activeTemplate: true /* if relation exists; otherwise omit */ },
  });
  if (!driver) redirect('/driver/home');

  // Parallel fetch
  const [settlements, currentPeriod, bonuses, deductions] = await Promise.all([
    prisma.driverSettlement.findMany({
      where: { driverId: driver.id, tenantId: session.tenantId, status: { not: 'DRAFT' }, deletedAt: null },
      orderBy: { periodStart: 'desc' },
      take: 20,
    }),
    prisma.loadDriverAssignment.findMany({
      where: { driverId: driver.id, tenantId: session.tenantId, payStatus: { in: ['PENDING_REVIEW', 'APPROVED'] }, settlementId: null, deletedAt: null },
      include: { payComponents: { where: { visibleToDriver: true, deletedAt: null } }, load: { select: { id: true, referenceNumber: true, status: true } } },
    }),
    prisma.driverBonus.findMany({
      where: { driverId: driver.id, tenantId: session.tenantId, visibleToDriver: true, deletedAt: null },
      orderBy: { triggerDate: 'desc' },
    }),
    prisma.driverDeduction.findMany({
      where: { driverId: driver.id, tenantId: session.tenantId, deletedAt: null, visibleToDriver: true },
    }),
  ]);

  // Serialize Decimal/Date fields for client component (JSON.stringify-safe)
  return <DriverPayPage driver={driver} settlements={settlements} currentPeriod={currentPeriod} bonuses={bonuses} deductions={deductions} />;
}
```

**_components/DriverPayPage.tsx** ('use client'):
- Use shadcn/ui `Tabs` with 4 tabs: Settlements | Current Period | Deductions | Bonuses
- Header card at top: driver name | employment type | pay model (template name)
- Tab 1 — Settlements list:
  - Table rows (or Card list on mobile): `period (formatted "May 4–10")` | status Badge | net pay (large, right-aligned, formatted as currency) | PDF download icon (lucide `Download`)
  - Status badge colors: FINALIZED=blue (Badge variant secondary), PAID=green (variant default with `bg-green-600`), VOIDED=muted (variant outline), DISPUTED=amber (custom class)
  - Click row → `router.push('/pay/settlements/' + id)`
  - Empty: `<EmptyState>No settlements yet. They'll show here once approved loads are settled.</EmptyState>`
- Tab 2 — Current Period:
  - Cards: load referenceNumber | status chip | total pay = `payComponents.reduce((sum, c) => sum.plus(c.amount), new Decimal(0)).toFixed(2)` — use a small client-side decimal helper or do server-side
  - Status sublabel: APPROVED → "Approved by manager • awaiting settlement" / PENDING_REVIEW → "Pending manager review"
  - Empty: "Quiet period so far. Your next completed load will show up here."
- Tab 3 — Deductions:
  - Rows: deduction type label | $X/period | progress bar (use shadcn `Progress`) for FIXED_INSTALLMENTS
  - Show `"{pct}% paid off"` label (computed server-side already if you pass deductions with progress; otherwise compute client-side with decimal.js)
  - Empty: "No active deductions."
- Tab 4 — Bonuses:
  - Rows: type | description | amount (currency) | paid/pending Badge | "Installment N of M" sub-label if `installmentNumber && totalInstallments`
  - Empty: "No bonuses on record yet."

**_components/DisputeForm.tsx** ('use client'):
- Props: `{ settlementId: string; isOpen: boolean; onClose: () => void }`
- shadcn/ui `Dialog` with form fields:
  - `Select` for issueCategory: WRONG_AMOUNT, MISSING_PAY, WRONG_MILES, MISSING_RECEIPT, OTHER (use friendly labels)
  - `Textarea` for driverMessage with min 50 chars validation, show live char count `{message.length}/50 minimum`
- On submit click: open `AlertDialog` confirmation "Submit dispute? This will pause payment and notify your dispatcher."
- On confirm: `fetch('/api/driver-pay/me/settlements/' + settlementId + '/dispute', { method: 'POST', body: JSON.stringify({ issueCategory, driverMessage }), headers: { 'Content-Type': 'application/json' } })`
- Success: `toast.success('Sent to your dispatcher. Most disputes get a reply within 24 hours.')` then `onClose()` and `router.refresh()`
- Error: `toast.error(err.message)`

**settlements/[id]/page.tsx** (server):
```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const prisma = await getTenantPrisma();
  const driver = await prisma.carrierDriver.findFirst({ where: { userId: session.userId } });
  if (!driver) redirect('/driver/home');

  const settlement = await prisma.driverSettlement.findFirst({
    where: { id, driverId: driver.id, tenantId: session.tenantId },
    include: {
      assignments: { include: { payComponents: { where: { visibleToDriver: true, deletedAt: null } }, load: { select: { id: true, referenceNumber: true, status: true } } } },
      bonuses: { where: { deletedAt: null, visibleToDriver: true } },
    },
  });
  if (!settlement) notFound(); // 404 via next/navigation
  return <DriverSettlementDetailView settlement={settlement} />;
}
```

**_components/DriverSettlementDetailView.tsx** ('use client'):
- Mirror owner SettlementDetailView but READ-ONLY (no edit buttons, no add component buttons)
- Sections: Earnings (sum of LINEHAUL/FSC/etc payComponents) | Bonuses | Deductions
- Net pay prominent at top (large bold currency)
- Back link (top-left): `<Link href="/pay">← Back to Pay</Link>`
- "Download PDF" button if `settlement.pdfUrl` exists (opens in new tab)
- "Dispute this settlement" button (only if `settlement.status === 'FINALIZED'`) → opens DisputeForm dialog with local `isOpen` state
- If `settlement.status === 'PAID'` or `'VOIDED'` show informational note about dispute window passed

**driver-nav.tsx** — read first, then add:
```tsx
{ href: '/pay', label: 'Pay', icon: DollarSign }
```
in the right place in the nav array. Import `DollarSign` from 'lucide-react' if not already.

**driver-bottom-nav.tsx** — read first, then add a Pay tab with DollarSign icon. Place it logically (likely between Loads/Documents and More). Keep tab count reasonable (mobile bottom nav usually 4-5 visible).

After both implementation files + nav updates done, commit:
```
git add apps/web/src/app/\(driver\)/pay apps/web/src/components/driver/driver-nav.tsx apps/web/src/components/driver/driver-bottom-nav.tsx
git commit -m "feat(driver-pay): add web driver pay portal + nav links"
```
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit
    Visit /pay logged in as DRIVER — 4 tabs render, settlements list loads
    Click a FINALIZED settlement → detail view renders with Dispute button
    Click Dispute → dialog opens, < 50 char message disabled submit, ≥ 50 char with category → confirmation alert → success toast
    Verify /pay redirect to /login if unauthenticated; non-driver redirected away
    Check sidebar + bottom nav both show Pay link with DollarSign icon
  </verify>
  <done>
    Web driver pay portal usable end-to-end: list → detail → dispute. All read-only. Nav links present. tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mobile driver pay screens (hub + detail + dispute) + tab registration</name>
  <files>
    apps/mobile/app/(driver)/pay/index.tsx
    apps/mobile/app/(driver)/pay/settlements/[id].tsx
    apps/mobile/app/(driver)/pay/settlements/[id]/dispute.tsx
    apps/mobile/app/(driver)/_layout.tsx
  </files>
  <action>
Read first: apps/mobile/app/(driver)/_layout.tsx (to see existing tab structure), apps/mobile/app/(driver)/loads/index.tsx (as a reference for FlashList + theme tokens + pull-to-refresh pattern), apps/mobile/hooks/useThemeColors.ts.

Mobile patterns required:
- `useThemeColors()` for all colors (NEVER hardcode color hex)
- NativeWind v4 className for styling
- `FlashList` from '@shopify/flash-list' (NOT FlatList)
- `expo-image` for any imagery (none expected here)
- Bearer token via existing api-client OR via direct fetch with session token from MMKV
- Animations: wrap screens in AnimatedScreen if that's the convention
- Haptics on button presses via existing haptics utility

**apps/mobile/app/(driver)/pay/index.tsx** — Pay hub
```tsx
- State: { activeTab: 'settlements' | 'current' | 'deductions' | 'bonuses' }
- Use TanStack Query to fetch all 4 datasets in parallel (4 useQuery hooks calling apiClient methods or fetch with Bearer)
- Top header card: driver name + employment type + pay model
- Tab bar (custom 4-tab segmented control)
- Per-tab FlashList of rows; pull-to-refresh on the active list (refetch the active query)
- Each row tappable where appropriate:
  - Settlements → router.push('/(driver)/pay/settlements/' + id)
  - Other rows: not tappable in v1
- Empty states with EmptyState component matching web copy
```

If api-client doesn't already have `/me/` methods, add them in `packages/api-client/src/driver.ts` (or wherever driverApi lives) with new methods: `getMySettlements`, `getMySettlement`, `getMyBonuses`, `getMyDeductions`, `getMyCurrentPeriod`, `submitDispute`. If you'd rather not edit the shared package in this task, use direct `fetch` with the Bearer token from MMKV session (cleaner scope for a quick task).

**apps/mobile/app/(driver)/pay/settlements/[id].tsx** — Detail
- `useLocalSearchParams<{ id: string }>()` → fetch settlement detail
- Render sections: Earnings / Bonuses / Deductions / Net Pay (large)
- "Download PDF" button → `expo-web-browser`.openBrowserAsync(pdfUrl) if pdfUrl
- "Dispute this settlement" button (only if status === 'FINALIZED') → `router.push('/(driver)/pay/settlements/' + id + '/dispute')`
- Back arrow in header (haptics.light on press)

**apps/mobile/app/(driver)/pay/settlements/[id]/dispute.tsx** — Dispute form
- Form: Picker for issueCategory + Textarea (TextInput multiline) for driverMessage + char count
- Submit button disabled until message ≥ 50 chars and category selected
- Confirmation Alert (`Alert.alert`): "Submit dispute? This will pause payment and notify your dispatcher."
- POST /api/driver-pay/me/settlements/[id]/dispute with Bearer token
- Success: show toast/Alert "Sent to your dispatcher" and `router.back()`
- Add a `// TODO: trigger push notification to dispatcher (handled server-side in future task)` comment near the API call

**apps/mobile/app/(driver)/_layout.tsx** — Read existing file first. Add a `<Tabs.Screen name="pay" options={{ title: 'Pay', tabBarIcon: ({ color, size }) => <DollarSign color={color} size={size} /> }} />` entry. Import DollarSign from 'lucide-react-native'. Place it in the order matching the web nav (likely after Loads).

Mobile API auth: any /api/driver-pay/me/* call from mobile requires the mobile Bearer token. CRITICAL CAVEAT: the new /me/ web routes were implemented in Task 1 using `getSession()` (Supabase cookie). Mobile sends Bearer tokens validated via `validateMobileToken`. There are two options:
  - Option A (preferred for this quick task): Keep the web /me/ routes session-based, AND duplicate the read endpoints under `/api/mobile/driver/pay/*` using `validateMobileToken`. To keep the quick task tight, instead reuse Task 1's routes but extend `requireDriver()` to accept either a Supabase session OR a Bearer token (call validateMobileToken if no session). The mobile screens then call the same /me/ URLs with Bearer auth.
  - Update `requireDriver()` in Task 1's routes to try `getSession()` first; if null, try `validateMobileToken(req)`; if neither, return 401. Both paths produce a `{ userId, tenantId, role }` shape — use that to look up carrierDriver.

Implement this dual-auth helper as part of Task 3 (or backport into Task 1 — your call; if you choose to do it during Task 1, document it there). Either way, the helper file should live at `apps/web/src/lib/driver-pay/require-driver.ts` and be imported by all 7 /me/ routes.

After mobile screens + tab + dual-auth helper:
```
git add apps/mobile/app/\(driver\)/pay apps/mobile/app/\(driver\)/_layout.tsx apps/web/src/lib/driver-pay/require-driver.ts apps/web/src/app/api/driver-pay/me
git commit -m "feat(driver-pay): add mobile driver pay screens + dual-auth helper"
```
  </action>
  <verify>
    cd apps/mobile && npx tsc --noEmit
    cd apps/web && npx tsc --noEmit
    Mobile: Pay tab appears in driver bottom nav
    Mobile: Tap Pay → 4-tab hub renders with theme tokens (test dark + light mode if possible)
    Mobile: Tap a settlement → detail screen renders with Dispute button on FINALIZED
    Mobile: Submit dispute → confirmation → success → returns to detail
    Web /me/ routes still work from web session (regression check)
    Mobile /me/ routes accept Bearer token
  </verify>
  <done>
    Mobile pay portal navigable; submits disputes; reuses same /me/ routes via dual-auth helper. Web session still works. Both apps tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 4: Vitest suite for driver portal API (RBAC + tenant isolation + dispute validation) + final tsc</name>
  <files>
    apps/web/src/app/api/driver-pay/__tests__/driver-portal-api.test.ts
  </files>
  <action>
Read existing tests in apps/web/src/app/api/driver-pay/__tests__/ for the mocking pattern (Prisma mock setup, session mock, etc).

Create driver-portal-api.test.ts with vitest tests covering:

1. **GET /me/settlements returns only this driver's settlements**
   - Mock session as DRIVER, mock carrierDriver lookup → driverId=X
   - Mock prisma.driverSettlement.findMany to return list filtered by driverId
   - Assert call to findMany has `where.driverId === X` and `where.tenantId === session.tenantId`

2. **GET /me/settlements/[id] returns 404 when settlement is another driver's**
   - Mock carrierDriver lookup → driverId=A
   - Mock prisma.driverSettlement.findFirst to return null (since findFirst is filtered by driverId)
   - Expect 404 (not 403, since findFirst filtering returns null when row not owned)

3. **POST /me/dispute rejects message shorter than 50 chars**
   - Body: `{ issueCategory: 'WRONG_AMOUNT', driverMessage: 'too short' }`
   - Expect 400 with Zod error

4. **POST /me/dispute rejects PAID settlement**
   - Mock settlement with status='PAID'
   - Expect 400 `{ error: /FINALIZED/ }`

5. **POST /me/dispute creates DriverDispute + audit log on valid FINALIZED**
   - Mock settlement status='FINALIZED'
   - Use prisma.$transaction mock; assert driverDispute.create called with targetType='SETTLEMENT', issueCategory passed-through, createdBy=session.userId
   - Assert driverPayAuditLog.create called with action='DISPUTE_OPENED'
   - Expect 201

6. **GET /me/settlements/[id]/pdf returns 404 for another driver's settlement**
   - Mock findFirst returning null due to driverId mismatch → 404

7. **Tenant isolation: driver in tenant A cannot read tenant B data**
   - Mock session with tenantId='A', carrierDriver with tenantId='A'
   - findFirst with tenantId='A' returns null when called with id from tenant B's data
   - Assert prisma calls always pass `tenantId: 'A'` in where clause

Vitest config notes:
- Use `vi.mock('@/lib/auth/supabase', () => ({ getSession: vi.fn() }))`
- Use `vi.mock('@/lib/context/tenant-context', () => ({ getTenantPrisma: vi.fn() }))`
- Mock prisma as `{ carrierDriver: { findFirst: vi.fn() }, driverSettlement: { findFirst: vi.fn(), findMany: vi.fn() }, driverDispute: { create: vi.fn() }, driverPayAuditLog: { create: vi.fn() }, $transaction: vi.fn((ops) => Promise.all(ops)) }`
- Import the route handlers directly and call them with mock NextRequest

Run tests:
```
cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/driver-portal-api.test.ts
```

After all tests pass, final TypeScript check across web + mobile:
```
cd apps/web && npx tsc --noEmit
cd apps/mobile && npx tsc --noEmit
```

Fix any type errors that surface, then commit:
```
git add apps/web/src/app/api/driver-pay/__tests__/driver-portal-api.test.ts
git commit -m "test(driver-pay): add driver portal API tests"
```

If tsc surfaces fixes needed in earlier files, commit those separately:
```
git commit -m "fix(driver-pay): TypeScript cleanup for portal phase 9"
```
  </action>
  <verify>
    cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/driver-portal-api.test.ts — all 7 tests pass
    cd apps/web && npx tsc --noEmit — 0 errors
    cd apps/mobile && npx tsc --noEmit — 0 errors
    Existing driver-pay tests in __tests__/ still pass (no regressions): `npx vitest run src/app/api/driver-pay/__tests__`
  </verify>
  <done>
    7 vitest tests pass covering RBAC, tenant isolation, dispute validation, status gating, PDF ownership. Full web + mobile TypeScript clean. No regressions to existing driver-pay tests.
  </done>
</task>

</tasks>

<verification>
End-to-end driver experience:
- Log in as DRIVER (web) → /pay shows 4 tabs with data → click settlement → see breakdown → dispute (FINALIZED only) → audit log row written
- Log in as DRIVER (mobile, Android emulator only) → Pay tab → 4-tab hub → settlement detail → dispute → success
- Log in as OWNER → cannot access /pay (driver layout enforces DRIVER role); MANAGER cannot hit /me/ routes (403)
- Cross-tenant: driver in tenant A cannot see tenant B data via any /me/ route

API contract checks (curl-style):
- `GET /api/driver-pay/me/settlements` (driver session) → 200, only own
- `GET /api/driver-pay/me/settlements/<other-driver-id>` → 404
- `POST /api/driver-pay/me/settlements/<paid-id>/dispute` → 400
- `POST /api/driver-pay/me/settlements/<finalized-id>/dispute` with 49-char msg → 400
- `POST /api/driver-pay/me/settlements/<finalized-id>/dispute` with 100-char msg + valid category → 201 + DriverDispute row + audit log

TypeScript + tests:
- `cd apps/web && npx tsc --noEmit` → 0 errors
- `cd apps/mobile && npx tsc --noEmit` → 0 errors
- `cd apps/web && npx vitest run src/app/api/driver-pay/__tests__` → all green

Schema:
- Verify NO new migrations created (DriverDispute model already exists in schema since earlier driver-pay phase)
</verification>

<success_criteria>
- 7 new /me/ API routes exist, RBAC enforced, dual-auth (Supabase session + Bearer token) via shared requireDriver helper
- DriverDispute rows created on POST dispute with proper validation; audit log written
- Web /pay portal: 4 tabs, settlement detail, dispute modal, status badges with correct colors, empty states match spec copy
- Mobile pay screens: hub + detail + dispute, FlashList + theme tokens + NativeWind v4, Pay tab in bottom nav
- Driver nav (sidebar + bottom nav) on web includes Pay link with DollarSign icon
- Vitest suite covers 7 RBAC + validation scenarios, all pass
- TypeScript strict clean across apps/web and apps/mobile
- No native float math anywhere (decimal.js only)
- All atomic commits made with feat(driver-pay)/test(driver-pay) prefixes
- No new npm packages added
</success_criteria>

<output>
After completion, create `.planning/quick/306-build-phase-9-of-the-driver-pay-module-d/306-SUMMARY.md` capturing:
- Files created/modified count
- Confirmation that DriverDispute model was pre-existing (no migration)
- The dual-auth helper approach taken (session + Bearer)
- Vitest test count + pass status
- Any deviations from this plan (and why)
</output>
