---
phase: quick-46
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — Double-click
  - src/components/trucks/truck-list.tsx
  - src/components/drivers/driver-list.tsx
  - src/components/routes/route-list.tsx
  - src/components/loads/load-list.tsx
  - src/components/invoices/invoice-list.tsx
  - src/components/payroll/payroll-list.tsx
  # Task 2 — Soft-delete + archive schema
  - prisma/schema.prisma
  - src/app/(owner)/actions/trucks.ts
  - src/app/(owner)/actions/drivers.ts
  - src/app/(owner)/actions/routes.ts
  - src/app/(owner)/actions/loads.ts
  - src/app/(owner)/actions/invoices.ts
  - src/app/(owner)/actions/payroll.ts
  - src/app/(owner)/trucks/page.tsx
  - src/app/(owner)/drivers/page.tsx
  - src/app/(owner)/routes/page.tsx
  - src/app/(owner)/loads/page.tsx
  - src/app/(owner)/invoices/page.tsx
  - src/app/(owner)/payroll/page.tsx
  # Task 3 — Audit trail schema + fix doc type bug
  - prisma/schema.prisma
  - src/app/(owner)/actions/trucks.ts
  - src/app/(owner)/actions/drivers.ts
  - src/app/(owner)/actions/routes.ts
  - src/app/(owner)/actions/loads.ts
  - src/app/(owner)/actions/invoices.ts
  - src/app/(owner)/actions/payroll.ts
  - src/app/(owner)/trucks/[id]/page.tsx
  - src/app/(owner)/drivers/[id]/page.tsx
  - src/app/(owner)/routes/[id]/page.tsx
  - src/app/(owner)/loads/[id]/page.tsx
  - src/app/(owner)/invoices/[id]/page.tsx
  - src/app/(owner)/payroll/[id]/page.tsx
  - src/components/documents/driver-document-upload.tsx
autonomous: true

must_haves:
  truths:
    - "Double-clicking any row on trucks/drivers/routes/loads/invoices/payroll pages navigates to the detail page"
    - "Delete actions on trucks/routes/loads/invoices set archivedAt instead of hard-deleting; drivers continue using isActive=false"
    - "Each entity list page excludes archived records by default (archivedAt IS NULL)"
    - "Every detail page shows Created by, Created date, Last changed by, Last changed date at the bottom"
    - "Driver document type field does not show an editable dropdown when the driver detail page is in view mode"
  artifacts:
    - path: "src/components/trucks/truck-list.tsx"
      provides: "onDoubleClick on <tr> navigating to /trucks/{id}"
    - path: "prisma/schema.prisma"
      provides: "archivedAt field on Truck, Route, Load, Invoice, PayrollRecord; createdById/updatedById on same models"
    - path: "src/app/(owner)/trucks/[id]/page.tsx"
      provides: "Audit trail section at bottom of detail page"
    - path: "src/components/documents/driver-document-upload.tsx"
      provides: "Upload form collapsed by default; document type select not visible in view mode"
  key_links:
    - from: "truck-list.tsx <tr>"
      to: "/trucks/{id}"
      via: "onDoubleClick + useRouter.push"
    - from: "deleteTruck server action"
      to: "prisma.truck.update({ archivedAt: new Date() })"
      via: "soft-delete instead of truck.delete"
    - from: "detail page"
      to: "createdBy / updatedBy User records"
      via: "include: { createdByUser: true, updatedByUser: true } in server action query"
---

<objective>
Implement four UX standard improvements across the DriveCommand platform:
1. Double-click row to open detail page on all list/table views
2. Soft-delete with archivedAt timestamp instead of hard-delete for trucks, routes, loads, invoices, payroll records
3. Audit trail (created by, created date, last changed by, last changed date) on all detail pages
4. Fix driver document upload form always showing document type select in view mode

Purpose: Consistent UX patterns that match professional fleet management software expectations.
Output: All six list pages support double-click navigation; six entity types soft-delete to archive; six detail pages show audit info; driver detail page no longer shows upload form by default.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add double-click row navigation to all six list components</name>
  <files>
    src/components/trucks/truck-list.tsx
    src/components/drivers/driver-list.tsx
    src/components/routes/route-list.tsx
    src/components/loads/load-list.tsx
    src/components/invoices/invoice-list.tsx
    src/components/payroll/payroll-list.tsx
  </files>
  <action>
Add `useRouter` from `next/navigation` to each list component. On the `<tr>` body row element, add:
- `onDoubleClick={() => router.push('/entity/{row.original.id}')}` (or equivalent depending on component structure — loads/invoices/payroll use a different non-tanstack-table pattern, check for the row container element)
- `className` update: add `cursor-pointer` to the existing hover class string so the cursor communicates clickability

Detail for each component:

**truck-list.tsx** (tanstack-table): Change the body `<tr>` from:
```
<tr key={row.id} className="hover:bg-muted/30 transition-colors">
```
to:
```
<tr key={row.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onDoubleClick={() => router.push(`/trucks/${row.original.id}`)}>
```

**driver-list.tsx** (tanstack-table): Same pattern, URL `/drivers/{row.original.id}`.

**route-list.tsx** (tanstack-table or card/row): Read existing row structure, apply onDoubleClick to the clickable row element, URL `/routes/{route.id}`.

**load-list.tsx** (custom table rows): Read existing row structure, apply onDoubleClick to the row element that currently contains the View/Details link, URL `/loads/{load.id}`.

**invoice-list.tsx** (custom rows): Same pattern, URL `/invoices/{invoice.id}`.

**payroll-list.tsx** (custom rows): Same pattern, URL `/payroll/{record.id}`.

For components that are not 'use client' yet, add the directive. For components where useRouter cannot be used directly (pure table row cells), lift the router call to the component function level and reference it from the row closure.

Do NOT add onDoubleClick to header rows, action button cells, or the deactivate/delete buttons — those clicks should not trigger navigation. The double-click fires on any cell that is not itself an interactive element.
  </action>
  <verify>Open /trucks, double-click a row → navigates to /trucks/{id}. Open /drivers, double-click → /drivers/{id}. Repeat for routes, loads, invoices, payroll.</verify>
  <done>All six list pages navigate to detail on row double-click. Single-click still works as before (no accidental navigation). Action buttons still work.</done>
</task>

<task type="auto">
  <name>Task 2: Soft-delete schema migration + update delete actions to archive</name>
  <files>
    prisma/schema.prisma
    src/app/(owner)/actions/trucks.ts
    src/app/(owner)/actions/routes.ts
    src/app/(owner)/actions/loads.ts
    src/app/(owner)/actions/invoices.ts
    src/app/(owner)/actions/payroll.ts
    src/app/(owner)/trucks/page.tsx
    src/app/(owner)/routes/page.tsx
    src/app/(owner)/loads/page.tsx
    src/app/(owner)/invoices/page.tsx
    src/app/(owner)/payroll/page.tsx
    src/app/(owner)/trucks/truck-list-wrapper.tsx
  </files>
  <action>
**Step 1: Update prisma/schema.prisma**

Add `archivedAt DateTime? @db.Timestamptz` field and `@@index([archivedAt])` to these models (after the existing `updatedAt` field):
- `Truck`
- `Route`
- `Load`
- `Invoice`
- `PayrollRecord`

Note: `RouteExpense` and `RoutePayment` already have `deletedAt` — do NOT change those. `User`/drivers use `isActive` — do NOT add archivedAt to User.

**Step 2: Generate and apply migration**

Run:
```bash
npx prisma migrate dev --name add_archived_at_fields
```

If that fails (e.g., no DATABASE_URL), fall back to:
```bash
npx prisma db push
```

**Step 3: Update delete server actions to soft-delete**

For `deleteTruck` in `trucks.ts`: Change `prisma.truck.delete({ where: { id } })` to:
```ts
prisma.truck.update({ where: { id }, data: { archivedAt: new Date() } })
```

For routes, loads, invoices, payroll: locate the delete action in each file and apply the same pattern — `update` with `archivedAt: new Date()` instead of `delete`.

**Step 4: Filter archived records from list queries**

In each list server action (or directly in page.tsx if the query is there), add `archivedAt: null` to the `where` clause so archived records do not appear in default list views. Pattern:
```ts
prisma.truck.findMany({
  where: { tenantId, archivedAt: null },
  ...
})
```

Apply to: trucks, routes, loads, invoices, payroll record list queries.

**Step 5: Update truck-list-wrapper.tsx optimistic remove**

The `TruckListWrapper` currently calls `deleteAction` and removes the truck optimistically. Since delete is now a soft-delete returning `{ success: true }`, the optimistic behavior still works — no change needed there. Verify the other list wrappers (routes, loads, etc.) if they have wrappers with similar optimistic remove patterns and ensure they still work.

**Step 6: Update confirmation dialogs to say "Archive" not "Delete"**

In `truck-list.tsx`, change the `window.confirm` message from "delete this truck" to "archive this truck (recoverable within 30 days)". In other list components that show delete confirmation, update similarly.

Note: Do NOT create archive view pages in this task — that is a scope addition. The plan only requires the data goes to archive; archive views can be added later. Do NOT add a cron job — that is out of scope for this task.
  </action>
  <verify>
1. `npx prisma studio` (or query) shows archivedAt column exists on Truck, Route, Load, Invoice, PayrollRecord tables.
2. Delete a truck from the UI → it disappears from the list but the record exists in DB with archivedAt set.
3. List pages do not show archived records.
  </verify>
  <done>
- Schema has archivedAt on 5 models
- Delete actions perform UPDATE archivedAt instead of DELETE
- List queries filter WHERE archivedAt IS NULL
- Confirmation text says "archive" not "delete"
  </done>
</task>

<task type="auto">
  <name>Task 3: Audit trail schema + detail page display + fix driver doc type bug</name>
  <files>
    prisma/schema.prisma
    src/app/(owner)/actions/trucks.ts
    src/app/(owner)/actions/routes.ts
    src/app/(owner)/actions/loads.ts
    src/app/(owner)/actions/invoices.ts
    src/app/(owner)/actions/payroll.ts
    src/app/(owner)/trucks/[id]/page.tsx
    src/app/(owner)/drivers/[id]/page.tsx
    src/app/(owner)/routes/[id]/page.tsx
    src/app/(owner)/loads/[id]/page.tsx
    src/app/(owner)/invoices/[id]/page.tsx
    src/app/(owner)/payroll/[id]/page.tsx
    src/components/documents/driver-document-upload.tsx
  </files>
  <action>
**Step 1: Add createdById / updatedById to schema**

Add to these models in prisma/schema.prisma:
```
createdById  String?  @db.Uuid
updatedById  String?  @db.Uuid
```

And add relations (use `@relation(name: "TruckCreatedBy")` pattern to avoid ambiguity since User already has many relations):
```
createdBy    User?  @relation(name: "TruckCreatedBy", fields: [createdById], references: [id])
updatedBy    User?  @relation(name: "TruckUpdatedBy", fields: [updatedById], references: [id])
```

Add corresponding back-relations to the `User` model (array, with the same name):
```
trucksCreated  Truck[]  @relation(name: "TruckCreatedBy")
trucksUpdated  Truck[]  @relation(name: "TruckUpdatedBy")
```

Apply this pattern to: Truck, Route, Load, Invoice, PayrollRecord.

The User model will need one pair of back-relations per entity. Add them all at once.

Run migration:
```bash
npx prisma migrate dev --name add_audit_fields
```
Or `npx prisma db push` if migrate fails.

**Step 2: Capture createdById / updatedById in server actions**

In each create action, after `await requireAuth()` (which returns the userId), pass `createdById: userId, updatedById: userId` to `prisma.*.create({ data: { ..., createdById: userId, updatedById: userId } })`.

In each update action, pass `updatedById: userId` to the `prisma.*.update` data.

Use `requireAuth()` from `@/lib/auth/server` to get the userId — it returns the session userId string.

Pattern for create:
```ts
const userId = await requireAuth();
// ... existing role check ...
await prisma.truck.create({ data: { ...result.data, tenantId, createdById: userId, updatedById: userId } });
```

Pattern for update:
```ts
const userId = await requireAuth();
// ... existing role check ...
await prisma.truck.update({ where: { id }, data: { ...result.data, updatedById: userId } });
```

Apply to: trucks.ts, routes.ts, loads.ts, invoices.ts, payroll.ts (create and update actions in each).

Note: drivers use a different flow (invitation-based). Skip createdById/updatedById on User model for now — the User model is getting complex. Driver audit trail will show createdAt/updatedAt timestamps without user attribution.

**Step 3: Add audit trail section to detail pages**

In each `[id]/page.tsx`, update the server-side data fetch to include `createdBy` and `updatedBy` user relations:
```ts
const truck = await prisma.truck.findUnique({
  where: { id },
  include: {
    createdBy: { select: { firstName: true, lastName: true, email: true } },
    updatedBy: { select: { firstName: true, lastName: true, email: true } },
  },
});
```

At the bottom of each detail page JSX (after all existing sections), add an audit trail section:
```tsx
{/* Audit Trail */}
<div className="rounded-xl border border-border bg-card p-6 shadow-sm">
  <h2 className="text-lg font-semibold text-card-foreground mb-4">Record History</h2>
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <dt className="text-sm font-medium text-muted-foreground">Created by</dt>
      <dd className="mt-1 text-sm text-card-foreground">
        {truck.createdBy
          ? `${truck.createdBy.firstName ?? ''} ${truck.createdBy.lastName ?? ''}`.trim() || truck.createdBy.email
          : 'System'}
      </dd>
    </div>
    <div>
      <dt className="text-sm font-medium text-muted-foreground">Created</dt>
      <dd className="mt-1 text-sm text-card-foreground">
        {new Date(truck.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </dd>
    </div>
    <div>
      <dt className="text-sm font-medium text-muted-foreground">Last changed by</dt>
      <dd className="mt-1 text-sm text-card-foreground">
        {truck.updatedBy
          ? `${truck.updatedBy.firstName ?? ''} ${truck.updatedBy.lastName ?? ''}`.trim() || truck.updatedBy.email
          : 'System'}
      </dd>
    </div>
    <div>
      <dt className="text-sm font-medium text-muted-foreground">Last changed</dt>
      <dd className="mt-1 text-sm text-card-foreground">
        {new Date(truck.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </dd>
    </div>
  </dl>
</div>
```

Apply to all 6 detail pages, adapting the variable name (truck / route / load / invoice / payrollRecord / driver). For the driver detail page, skip the createdBy/updatedBy relations (not added to User) and just show createdAt / updatedAt with "System" for the by fields.

**Step 4: Fix driver document upload form visibility bug**

In `src/components/documents/driver-document-upload.tsx`, the form fields (document type select, expiry date, file picker) are always rendered. This means when viewing a driver profile, the upload form is permanently visible — the document type select appears as an editable field in view mode.

Fix: Wrap the entire upload form in a collapsible. Add a boolean `isOpen` state defaulting to `false`. Render a button "Upload Document" that sets `isOpen = true`. Only render the form fields when `isOpen === true`. When upload completes (inside `resetForm()`), also set `isOpen = false`.

```tsx
const [isOpen, setIsOpen] = useState(false);

if (!isOpen) {
  return (
    <button
      onClick={() => setIsOpen(true)}
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center"
    >
      <Upload className="h-4 w-4" />
      Upload Document
    </button>
  );
}

// existing form JSX follows, unchanged
// In resetForm(), add: setIsOpen(false);
```

Import `Upload` from `lucide-react`. This ensures the document type select is never visible in view mode — it only appears after clicking the "Upload Document" button.
  </action>
  <verify>
1. `npx prisma studio` confirms createdById/updatedById columns exist on Truck, Route, Load, Invoice, PayrollRecord tables.
2. Create a truck, navigate to its detail page → Record History section shows at bottom with created/updated dates.
3. Navigate to /drivers/{id} → "Upload Document" button is visible but no select dropdown is rendered by default; click the button → form expands with document type select.
4. TypeScript check: `npx tsc --noEmit` passes (no TS errors from new relations or component changes).
  </verify>
  <done>
- Schema has createdById/updatedById on 5 entity models
- Create/update actions capture userId from session
- All 6 detail pages show Record History section at bottom
- Driver detail page shows upload form only after clicking "Upload Document"
- No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. Double-click any row on /trucks, /drivers, /routes, /loads, /invoices, /payroll → navigates to detail page
2. Delete a truck from /trucks → confirmation says "archive", record disappears from list, DB row has archivedAt set
3. /trucks/{id} has "Record History" section at bottom with created by, created date, last changed by, last changed date
4. /drivers/{id} has no visible document type select on initial load; only visible after clicking "Upload Document"
5. `npx tsc --noEmit` passes
6. `npx prisma validate` passes
</verification>

<success_criteria>
- All 6 list pages: row double-click navigates to detail
- All 6 entity types: delete = soft archive (archivedAt), not hard delete
- All 6 detail pages: Record History section renders correctly
- Driver detail page: upload form collapsed by default
- No TypeScript or Prisma validation errors
</success_criteria>

<output>
After completion, create `.planning/quick/46-tkt-0008-ux-standards-double-click-to-op/46-SUMMARY.md`
</output>
