---
phase: quick-40
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(driver)/actions/driver-load.ts
  - src/app/(driver)/my-load/page.tsx
  - src/components/driver/driver-nav.tsx
autonomous: true
must_haves:
  truths:
    - "Driver sees their active load details (origin, destination, dates, weight, commodity, rate, customer)"
    - "Driver can advance load status forward: Dispatched -> Picked Up -> In Transit -> Delivered"
    - "Driver cannot revert status or skip steps"
    - "Driver sees status timeline with completed/active/future steps visually distinguished"
    - "Empty state shown when no active load assigned"
    - "My Load nav link appears in driver portal navigation"
  artifacts:
    - path: "src/app/(driver)/actions/driver-load.ts"
      provides: "Server actions for fetching and advancing driver load status"
      exports: ["getMyActiveLoad", "advanceLoadStatus"]
    - path: "src/app/(driver)/my-load/page.tsx"
      provides: "Driver load status page with timeline and action buttons"
    - path: "src/components/driver/driver-nav.tsx"
      provides: "Updated nav with My Load link"
  key_links:
    - from: "src/app/(driver)/my-load/page.tsx"
      to: "src/app/(driver)/actions/driver-load.ts"
      via: "server action imports"
      pattern: "getMyActiveLoad|advanceLoadStatus"
    - from: "src/app/(driver)/actions/driver-load.ts"
      to: "prisma.load"
      via: "getTenantPrisma query"
      pattern: "prisma\\.load\\.(findFirst|update)"
---

<objective>
Add a "My Load" page to the driver portal showing the driver's currently assigned load with status timeline and forward-only status advancement buttons.

Purpose: Drivers need to see their active load and update its status through the workflow (Dispatched -> Picked Up -> In Transit -> Delivered) from their mobile device.
Output: Server action file, page component, updated nav.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(driver)/actions/driver-routes.ts (pattern: requireRole, getCurrentUser, getTenantPrisma, revalidatePath)
@src/app/(driver)/my-route/page.tsx (pattern: empty state, card styling, page structure)
@src/app/(owner)/loads/[id]/page.tsx (pattern: STATUS_LIFECYCLE timeline rendering, STATUS_LABELS, load detail card layout)
@src/components/driver/driver-nav.tsx (nav items array to extend)
@prisma/schema.prisma (Load model fields, LoadStatus enum: PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED, INVOICED, CANCELLED)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create driver-load server actions and My Load nav link</name>
  <files>src/app/(driver)/actions/driver-load.ts, src/components/driver/driver-nav.tsx</files>
  <action>
Create `src/app/(driver)/actions/driver-load.ts` following the exact pattern from `driver-routes.ts`:

1. `'use server'` directive at top.

2. `getMyActiveLoad()`:
   - `await requireRole([UserRole.DRIVER])` then `getCurrentUser()` (same pattern as `getMyAssignedRoute`).
   - `const prisma = await getTenantPrisma()`.
   - `prisma.load.findFirst` where `driverId: user.id` AND `status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] }`.
   - Include `customer: { select: { companyName: true } }`.
   - Order by `pickupDate: 'asc'` to get earliest active.
   - Return the load or null.

3. `advanceLoadStatus(loadId: string)`:
   - `await requireRole([UserRole.DRIVER])` then `getCurrentUser()`.
   - `const prisma = await getTenantPrisma()`.
   - Find load where `id: loadId` AND `driverId: user.id` (security: verify ownership).
   - If not found, return `{ error: 'Load not found or not assigned to you' }`.
   - Define status progression map: `DISPATCHED -> PICKED_UP`, `PICKED_UP -> IN_TRANSIT`, `IN_TRANSIT -> DELIVERED`.
   - If current status not in map keys, return `{ error: 'Cannot advance this load status' }`.
   - `prisma.load.update` with `data: { status: nextStatus }`.
   - `revalidatePath('/my-load')`.
   - Return `{ success: true, newStatus: nextStatus }`.

Update `src/components/driver/driver-nav.tsx`:
- Import `Package` from lucide-react (alongside existing icons).
- Add `{ href: '/my-load', label: 'My Load', icon: Package }` to the `navItems` array, inserted as the second item (after My Route, before Messages).
  </action>
  <verify>TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -30`. Grep for `getMyActiveLoad` and `advanceLoadStatus` exports in the file. Grep for `/my-load` in driver-nav.tsx.</verify>
  <done>Two server actions exported, nav link added. No type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Create My Load page with status timeline and action buttons</name>
  <files>src/app/(driver)/my-load/page.tsx</files>
  <action>
Create `src/app/(driver)/my-load/page.tsx` as a server component (like my-route/page.tsx). This page needs a client component for the action button, so embed it or create inline.

**Page structure:**

1. Import `getMyActiveLoad`, `advanceLoadStatus` from actions/driver-load.
2. Call `getMyActiveLoad()` in try/catch.
3. If no load, show empty state matching my-route pattern: centered icon (Package from lucide), "No active load assigned", "You don't have an active load right now. Check back later or contact your dispatcher."

4. If load exists, render:

**Header section:**
- `<h1>` "My Load" with `text-2xl font-bold text-foreground`
- Subtitle: `Load #{load.loadNumber} - {load.origin} to {load.destination}`

**Load details card** (rounded-lg border border-border bg-card p-5):
- Origin, Destination (with MapPin icons)
- Pickup Date, Delivery Date (with Calendar icons)
- Weight (if exists), Commodity (if exists)
- Rate (formatted as currency, text-xl font-bold text-green-600)
- Customer company name

**Status Timeline** (reuse the exact pattern from owner's load detail page lines 298-355):
- Define `DRIVER_STATUS_LIFECYCLE = ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']` (no INVOICED for driver view).
- Same STATUS_LABELS map.
- Same circle + connector rendering: green completed, primary ring for current, muted for future.
- Use `overflow-x-auto` for mobile scroll.

**Action Button section** — This needs a client component. Create a separate client component `LoadStatusButton` either inline in the file or as a simple component at the bottom wrapped in `'use client'`. Since we can't mix server/client in one file, create it as a small client component within the page file using a pattern like:

Actually, create a separate client component file `src/components/driver/load-status-button.tsx`:
- Props: `loadId: string`, `currentStatus: string`, `advanceAction: (loadId: string) => Promise<{ success?: boolean; error?: string; newStatus?: string }>`.
- Button text based on status: DISPATCHED -> "Mark Picked Up", PICKED_UP -> "Mark In Transit", IN_TRANSIT -> "Mark Delivered".
- If DELIVERED: show a green check icon with "Load Delivered" text (no button).
- Button: `className="w-full sm:w-auto min-h-[44px] px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-base shadow-sm hover:bg-primary/90 transition-colors"` (44px touch target).
- `useState` for loading state, disable button while pending.
- On click: call `advanceAction(loadId)`, handle error with alert or inline message.
- Use `useTransition` for the server action call.

Back in the page, pass `advanceLoadStatus.bind(null, load.id)` or pass loadId + action separately.

**Style requirements:**
- All design token classes (bg-card, text-foreground, text-muted-foreground, border-border).
- Mobile-first: single column, full-width cards.
- 44px min touch targets on action button.
- Match the card style from my-route page (rounded-lg border border-border bg-card p-5/p-6 shadow-sm).
  </action>
  <verify>
1. `npx tsc --noEmit --pretty 2>&1 | head -30` — no type errors.
2. `npx next build 2>&1 | tail -20` — page compiles.
3. Visually confirm page exists at /my-load route.
  </verify>
  <done>My Load page renders with load details, status timeline, and forward-only action buttons. Empty state shown when no load assigned. Nav link works. Mobile-responsive with 44px touch targets.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Driver nav shows 5 items: My Route, My Load, Messages, Hours, Report
- `/my-load` page renders server-side without errors
- Status button labels match: "Mark Picked Up" / "Mark In Transit" / "Mark Delivered"
- advanceLoadStatus validates driver ownership before updating
</verification>

<success_criteria>
- Driver can navigate to My Load from the driver portal nav
- Page shows load details (origin, destination, dates, weight, commodity, rate, customer)
- Status timeline visually shows completed/current/future steps
- Action button advances status forward one step
- Empty state displayed when no active load exists
- All styling uses design tokens, 44px touch targets, mobile-first layout
</success_criteria>

<output>
After completion, create `.planning/quick/40-add-driver-load-status-page-to-driver-po/40-SUMMARY.md`
</output>
