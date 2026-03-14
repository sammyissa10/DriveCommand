---
phase: quick-59
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/app/(owner)/actions/driver-route-joins.ts
  - src/lib/validations/driver-route-join.schemas.ts
  - src/app/(owner)/routes/[id]/driver-assignments-section.tsx
  - src/app/(owner)/routes/[id]/page.tsx
  - src/app/(owner)/routes/[id]/route-page-client.tsx
  - src/app/(owner)/drivers/[id]/page.tsx
  - src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
autonomous: true

must_haves:
  truths:
    - "DriverRouteJoin model exists in schema with all required fields and passes prisma db push"
    - "Route detail page lists all DriverRouteJoin entries for that route with add/edit/delete"
    - "Driver detail page lists all DriverRouteJoin entries for that driver"
    - "Adding a join entry from the route page pre-fills the routeId"
    - "Monetary fields (fixedAmount, hourlyRate, perMileRate) are stored as Decimal"
    - "isMainDriver flag is displayed visually and editable"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "DriverRouteJoin model with DriverPaymentMethod enum"
      contains: "model DriverRouteJoin"
    - path: "src/app/(owner)/actions/driver-route-joins.ts"
      provides: "CRUD server actions"
      exports: ["listDriverRouteJoinsByRoute", "listDriverRouteJoinsByDriver", "createDriverRouteJoin", "updateDriverRouteJoin", "deleteDriverRouteJoin"]
    - path: "src/app/(owner)/routes/[id]/driver-assignments-section.tsx"
      provides: "Route-scoped DriverRouteJoin section with add/edit/delete UI"
    - path: "src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx"
      provides: "Driver-scoped DriverRouteJoin section (read + manage)"
  key_links:
    - from: "src/app/(owner)/routes/[id]/driver-assignments-section.tsx"
      to: "src/app/(owner)/actions/driver-route-joins.ts"
      via: "createDriverRouteJoin / updateDriverRouteJoin / deleteDriverRouteJoin calls"
    - from: "src/app/(owner)/routes/[id]/page.tsx"
      to: "listDriverRouteJoinsByRoute"
      via: "server fetch in Promise.all"
    - from: "src/app/(owner)/drivers/[id]/page.tsx"
      to: "listDriverRouteJoinsByDriver"
      via: "server fetch in Promise.all"
---

<objective>
Implement the DriverRouteJoin feature: a rich join table between Driver and Route recording payment method details, plus full CRUD UI on both the Route detail page and the Driver detail page.

Purpose: Allows fleet owners to track how each driver is compensated per route (fixed, hourly, or per-mile) and whether they are the main driver for that assignment.
Output: Schema model, server actions, and two UI sections wired into existing detail pages.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@prisma/schema.prisma
@src/app/(owner)/actions/payments.ts
@src/app/(owner)/routes/[id]/page.tsx
@src/app/(owner)/routes/[id]/route-page-client.tsx
@src/app/(owner)/drivers/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + Server Actions</name>
  <files>
    prisma/schema.prisma
    src/lib/validations/driver-route-join.schemas.ts
    src/app/(owner)/actions/driver-route-joins.ts
  </files>
  <action>
    **prisma/schema.prisma** — Add enum and model. Append after the RouteDriver model (around line 301):

    ```
    enum DriverPaymentMethod {
      FIXED_AMOUNT
      HOURLY
      PER_MILE
    }

    model DriverRouteJoin {
      id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      tenantId        String              @db.Uuid
      routeId         String              @db.Uuid
      driverId        String              @db.Uuid
      isMainDriver    Boolean             @default(false)
      paymentMethod   DriverPaymentMethod
      fixedAmount     Decimal?            @db.Decimal(10, 2)
      hourlyRate      Decimal?            @db.Decimal(10, 2)
      numberOfHours   Decimal?            @db.Decimal(10, 2)
      perMileRate     Decimal?            @db.Decimal(10, 4)
      numberOfMiles   Decimal?            @db.Decimal(10, 2)
      createdAt       DateTime            @default(now()) @db.Timestamptz
      updatedAt       DateTime            @updatedAt @db.Timestamptz

      tenant  Tenant @relation(fields: [tenantId], references: [id])
      route   Route  @relation(fields: [routeId], references: [id], onDelete: Cascade)
      driver  User   @relation(name: "DriverRouteJoins", fields: [driverId], references: [id])

      @@unique([routeId, driverId])
      @@index([tenantId])
      @@index([routeId])
      @@index([driverId])
    }
    ```

    Also add the back-relations to existing models:
    - On `Tenant`: add `driverRouteJoins DriverRouteJoin[]`
    - On `Route`: add `driverAssignments DriverRouteJoin[]`
    - On `User`: add `driverRouteJoins DriverRouteJoin[] @relation(name: "DriverRouteJoins")`

    Run: `npx prisma db push` to apply the schema without migration drift. Then run `npx prisma generate` if the client is not auto-regenerated.

    **src/lib/validations/driver-route-join.schemas.ts** — Zod schemas for create and update:

    ```ts
    import { z } from 'zod';

    export const driverRouteJoinCreateSchema = z.object({
      routeId: z.string().uuid(),
      driverId: z.string().uuid(),
      isMainDriver: z.boolean().default(false),
      paymentMethod: z.enum(['FIXED_AMOUNT', 'HOURLY', 'PER_MILE']),
      fixedAmount: z.string().optional(),
      hourlyRate: z.string().optional(),
      numberOfHours: z.string().optional(),
      perMileRate: z.string().optional(),
      numberOfMiles: z.string().optional(),
    }).superRefine((val, ctx) => {
      if (val.paymentMethod === 'FIXED_AMOUNT' && !val.fixedAmount) {
        ctx.addIssue({ code: 'custom', path: ['fixedAmount'], message: 'Fixed amount is required' });
      }
      if (val.paymentMethod === 'HOURLY' && (!val.hourlyRate || !val.numberOfHours)) {
        ctx.addIssue({ code: 'custom', path: ['hourlyRate'], message: 'Hourly rate and number of hours are required' });
      }
      if (val.paymentMethod === 'PER_MILE' && (!val.perMileRate || !val.numberOfMiles)) {
        ctx.addIssue({ code: 'custom', path: ['perMileRate'], message: 'Per-mile rate and number of miles are required' });
      }
    });

    export const driverRouteJoinUpdateSchema = driverRouteJoinCreateSchema.partial().omit({ routeId: true, driverId: true });
    ```

    **src/app/(owner)/actions/driver-route-joins.ts** — Server actions following the exact pattern of `payments.ts`:

    - `'use server'` directive at top
    - Import: `requireRole`, `UserRole`, `getTenantPrisma`, `requireTenantId`, `revalidatePath`, `Prisma`
    - Import schemas from the validations file
    - `const Decimal = Prisma.Decimal;`

    Implement these five functions:

    1. `listDriverRouteJoinsByRoute(routeId: string)` — `requireRole([OWNER, MANAGER, DRIVER])`, query `prisma.driverRouteJoin.findMany({ where: { routeId }, include: { driver: { select: { id, firstName, lastName, email } } }, orderBy: { createdAt: 'asc' } })`

    2. `listDriverRouteJoinsByDriver(driverId: string)` — same auth, query by `driverId`, include `{ route: { select: { id, name, origin, destination, scheduledDate, status } } }`, orderBy `createdAt desc`

    3. `createDriverRouteJoin(prevState: any, formData: FormData)` — `requireRole([OWNER, MANAGER])`, `requireTenantId()`, parse all fields from formData (isMainDriver from `formData.get('isMainDriver') === 'true'`), validate with schema, create record using `new Decimal(...)` for monetary fields (only set fields relevant to the paymentMethod, others null), revalidate `/routes/${routeId}` and `/drivers/${driverId}`, return `{ success: true }` or `{ error: string }`

    4. `updateDriverRouteJoin(joinId: string, prevState: any, formData: FormData)` — same auth (no `requireTenantId` needed since getTenantPrisma scopes it), fetch existing join first to get routeId and driverId for revalidation, validate update schema, update record, revalidate both paths

    5. `deleteDriverRouteJoin(joinId: string)` — `requireRole([OWNER, MANAGER])`, fetch join for path revalidation, delete (hard delete — no soft delete needed here since there is no deletedAt field on this model), revalidate paths

    Monetary field null logic in create/update: only persist `fixedAmount` when `paymentMethod === 'FIXED_AMOUNT'` (else null), only `hourlyRate`/`numberOfHours` when HOURLY, only `perMileRate`/`numberOfMiles` when PER_MILE.
  </action>
  <verify>
    1. `npx prisma db push` exits 0 with no errors
    2. `npx tsc --noEmit` passes with no type errors in the new files
    3. `npx prisma studio` shows the DriverRouteJoin table exists (optional sanity check)
  </verify>
  <done>Schema exists in DB, Prisma client regenerated with DriverRouteJoin type, all five server actions compile cleanly with correct auth and Decimal usage.</done>
</task>

<task type="auto">
  <name>Task 2: Route Detail Page — Driver Assignments Section</name>
  <files>
    src/app/(owner)/routes/[id]/driver-assignments-section.tsx
    src/app/(owner)/routes/[id]/page.tsx
    src/app/(owner)/routes/[id]/route-page-client.tsx
  </files>
  <action>
    **src/app/(owner)/routes/[id]/driver-assignments-section.tsx** — `'use client'` component.

    Props: `{ routeId: string; drivers: Array<{ id: string; firstName: string|null; lastName: string|null; email: string }>; initialAssignments: DriverRouteJoinWithDriver[] }`

    Where `DriverRouteJoinWithDriver` is the return type of `listDriverRouteJoinsByRoute` (inline the type or import from Prisma generated types).

    UI structure (match existing card style: `rounded-xl border border-border bg-card p-6 shadow-sm`):

    - Section header: "Driver Assignments" with an "Add Driver" button (+ icon, opens add form inline or in a dialog — use inline expand pattern matching existing sections like RouteExpensesSection)
    - Table (or card list) of existing assignments. Each row shows:
      - Driver name (firstName + lastName or email fallback)
      - "Main Driver" badge if `isMainDriver` is true (emerald badge, same style as the Active badge in driver page)
      - Payment method label: "Fixed: $X", "Hourly: $X/hr × N hrs", or "Per Mile: $X/mi × N mi"
      - Computed total (fixedAmount, or hourlyRate * numberOfHours, or perMileRate * numberOfMiles) — compute on the client, format as USD
      - Edit button (pencil icon) and Delete button (trash icon) with confirm dialog before delete
    - Empty state: "No driver assignments yet. Add a driver to track payment details."

    Add form fields (show/hide based on paymentMethod selection):
    - Driver select (dropdown from `drivers` prop, exclude already-assigned driverIds)
    - "Main Driver" checkbox
    - Payment Method select: FIXED_AMOUNT | HOURLY | PER_MILE
    - Conditional fields:
      - FIXED_AMOUNT: fixedAmount input
      - HOURLY: hourlyRate + numberOfHours inputs
      - PER_MILE: perMileRate + numberOfMiles inputs
    - Submit uses `useActionState` with `createDriverRouteJoin` (pass `routeId` as hidden input)
    - Edit form: same fields pre-populated, submits to `updateDriverRouteJoin` (bind joinId)
    - Delete: calls `deleteDriverRouteJoin(joinId)` directly (no formData needed), show window.confirm or a simple inline confirm state

    Use `useState` for: open add form, which joinId is being edited, optimistic updates (update local state on success, or rely on revalidatePath to refresh server component).

    Style inputs consistently with existing forms in the codebase (look at RouteExpensesSection or RoutePaymentsSection as reference for the inline form pattern).

    **src/app/(owner)/routes/[id]/page.tsx** — Add parallel fetch:
    - Import `listDriverRouteJoinsByRoute` from driver-route-joins actions
    - Add to the `Promise.all` array: `listDriverRouteJoinsByRoute(id).catch(() => [])`
    - Destructure result as `driverAssignments`
    - Pass `driverAssignments` and `drivers` to `RoutePageClient`

    **src/app/(owner)/routes/[id]/route-page-client.tsx** — Add prop:
    - Add `driverAssignments: DriverRouteJoinWithDriver[]` to `RoutePageClientProps`
    - Import and render `<DriverAssignmentsSection routeId={route.id} drivers={drivers} initialAssignments={driverAssignments} />` inside the JSX, after the route detail card and before expenses. The `drivers` prop is already available in RoutePageClient.
  </action>
  <verify>
    1. Navigate to `/routes/[any-route-id]` — "Driver Assignments" section renders without error
    2. Click "Add Driver" — form expands with driver select and payment fields
    3. Select HOURLY → hourlyRate and numberOfHours inputs appear; select FIXED_AMOUNT → fixedAmount input appears
    4. Submit a new assignment → row appears in the table with correct payment info
    5. Edit an existing assignment → form pre-fills correctly, update saves
    6. Delete an assignment → row disappears
    7. `npx tsc --noEmit` passes
  </verify>
  <done>Route detail page shows all DriverRouteJoin entries with working add/edit/delete. Payment method conditional fields work correctly. Main driver badge renders.</done>
</task>

<task type="auto">
  <name>Task 3: Driver Detail Page — Route Assignments Section</name>
  <files>
    src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx
    src/app/(owner)/drivers/[id]/page.tsx
  </files>
  <action>
    **src/app/(owner)/drivers/[id]/driver-route-assignments-section.tsx** — `'use client'` component.

    Props: `{ driverId: string; initialAssignments: DriverRouteJoinWithRoute[] }`

    Where each assignment includes the nested `route` (id, name, origin, destination, scheduledDate, status).

    UI structure (same card style):

    - Section header: "Route Assignments"
    - Table or card list of assignments. Each row shows:
      - Route name or "origin → destination" if name is null
      - Route status badge (PLANNED/IN_PROGRESS/COMPLETED — use same badge styles as elsewhere)
      - Scheduled date (formatted as "Jan 1, 2026")
      - "Main Driver" badge if isMainDriver
      - Payment summary: same format as Task 2 ("Fixed: $X", "Hourly: $X/hr × N hrs", "Per Mile: $X/mi × N mi") and computed total
      - Link to route: clicking row or route name navigates to `/routes/[routeId]`
      - Delete button (trash icon) — removes the assignment, with confirm. No edit from driver page (edit lives on route page).
    - Empty state: "This driver has no route assignments."

    Delete: calls `deleteDriverRouteJoin(joinId)` and removes from local state on success.

    **src/app/(owner)/drivers/[id]/page.tsx** — Add parallel fetch:
    - Import `listDriverRouteJoinsByDriver` from driver-route-joins actions
    - Wrap existing `getDriver(id)` and `listDriverDocuments(id)` in a `Promise.all` alongside `listDriverRouteJoinsByDriver(id).catch(() => [])`
    - Destructure `routeAssignments`
    - Import and render `<DriverRouteAssignmentsSection driverId={id} initialAssignments={routeAssignments} />` in the page JSX, after the Driver Information card and before the Driver Documents section
  </action>
  <verify>
    1. Navigate to `/drivers/[any-driver-id]` — "Route Assignments" section renders without error
    2. If driver has DriverRouteJoin records (created in Task 2 test), they appear with route name, status, payment info
    3. Clicking the route name navigates to the correct route detail page
    4. Delete removes the row and the join is gone when checking the route detail page
    5. Empty state shows correctly for a driver with no assignments
    6. `npx tsc --noEmit` passes with no errors
  </verify>
  <done>Driver detail page shows all DriverRouteJoin entries for that driver. Deletion works. Route links are correct. Full round-trip tested: add on route page, verify appears on driver page, delete from driver page, verify gone on route page.</done>
</task>

</tasks>

<verification>
End-to-end flow:
1. Go to a route detail page → add a driver assignment with HOURLY payment → verify row appears with correct computed total
2. Go to that driver's detail page → verify the same assignment appears under "Route Assignments" with the route linked
3. Delete the assignment from the driver page → go back to route page → verify it is gone
4. Add a FIXED_AMOUNT assignment → verify only fixedAmount fields rendered in form (hourly/per-mile hidden)
5. Add a PER_MILE assignment → verify computed total = perMileRate * numberOfMiles
6. `npx tsc --noEmit` — zero errors
7. `npx prisma validate` — schema valid
</verification>

<success_criteria>
- DriverRouteJoin model in Prisma schema with all specified fields (isMainDriver, paymentMethod enum, 5 monetary/quantity Decimal fields), tenantId, cascade delete from Route
- Route detail page: functional add/edit/delete UI for DriverRouteJoin entries
- Driver detail page: read + delete UI for DriverRouteJoin entries with route links
- All monetary fields stored as Prisma.Decimal, never JS number
- Auth: reads allow DRIVER role, writes require OWNER or MANAGER
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/59-tkt-0017-driverroutejoin/59-SUMMARY.md` using the summary template.
</output>
