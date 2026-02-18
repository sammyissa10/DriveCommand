---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/validations/load.schemas.ts
  - src/app/(owner)/actions/loads.ts
  - src/components/loads/load-form.tsx
  - src/components/loads/load-list.tsx
  - src/components/loads/load-status-badge.tsx
  - src/components/loads/dispatch-modal.tsx
  - src/components/loads/status-update-button.tsx
  - src/components/loads/delete-load-button.tsx
  - src/app/(owner)/loads/page.tsx
  - src/app/(owner)/loads/new/page.tsx
  - src/app/(owner)/loads/[id]/page.tsx
  - src/app/(owner)/loads/[id]/edit/page.tsx
  - src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "User can see all loads in a list with status filter tabs"
    - "User can create a new load linked to a customer"
    - "User can view a load's full details with linked customer, driver, truck"
    - "User can dispatch a load by assigning driver and truck"
    - "User can progress load status through lifecycle"
    - "User can edit and delete loads"
    - "Loads link appears in sidebar navigation"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "Load model with LoadStatus enum"
      contains: "model Load"
    - path: "src/app/(owner)/actions/loads.ts"
      provides: "CRUD + dispatch + status update server actions"
      exports: ["createLoad", "updateLoad", "deleteLoad", "dispatchLoad", "updateLoadStatus"]
    - path: "src/app/(owner)/loads/page.tsx"
      provides: "Load board list page with status tabs"
    - path: "src/components/loads/dispatch-modal.tsx"
      provides: "One-click dispatch with driver/truck dropdowns"
  key_links:
    - from: "src/app/(owner)/loads/page.tsx"
      to: "prisma.load.findMany"
      via: "getTenantPrisma query"
    - from: "src/components/loads/load-form.tsx"
      to: "src/app/(owner)/actions/loads.ts"
      via: "useActionState form submission"
    - from: "src/components/loads/dispatch-modal.tsx"
      to: "dispatchLoad action"
      via: "useActionState with driverId + truckId"
---

<objective>
Build a complete Load Management / Dispatch system with Prisma model, CRUD server actions, load board with status filter tabs, one-click dispatch, status lifecycle progression, and sidebar navigation.

Purpose: Enable dispatchers to create loads linked to customers, assign drivers/trucks via one-click dispatch, and track loads through PENDING -> DISPATCHED -> PICKED_UP -> IN_TRANSIT -> DELIVERED -> INVOICED lifecycle.

Output: Load model in DB, server actions, 4 pages (list/new/detail/edit), dispatch modal, status progression, sidebar link.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma
@src/app/(owner)/actions/customers.ts
@src/app/(owner)/actions/invoices.ts
@src/lib/validations/customer.schemas.ts
@src/lib/validations/invoice.schemas.ts
@src/components/crm/customer-form.tsx
@src/components/crm/customer-list.tsx
@src/components/crm/delete-customer-button.tsx
@src/app/(owner)/crm/page.tsx
@src/app/(owner)/crm/[id]/page.tsx
@src/app/(owner)/crm/new/page.tsx
@src/app/(owner)/crm/[id]/edit/page.tsx
@src/app/(owner)/invoices/page.tsx
@src/components/navigation/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Load model, migration, Zod schemas, and all server actions</name>
  <files>
    prisma/schema.prisma
    src/lib/validations/load.schemas.ts
    src/app/(owner)/actions/loads.ts
  </files>
  <action>
**1. Add LoadStatus enum and Load model to prisma/schema.prisma:**

Add enum BEFORE the models section:
```
enum LoadStatus {
  PENDING
  DISPATCHED
  PICKED_UP
  IN_TRANSIT
  DELIVERED
  INVOICED
  CANCELLED
}
```

Add Load model AFTER the PayrollRecord model (before closing):
```
model Load {
  id           String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String     @db.Uuid
  loadNumber   String
  customerId   String     @db.Uuid
  routeId      String?    @db.Uuid
  driverId     String?    @db.Uuid
  truckId      String?    @db.Uuid
  origin       String
  destination  String
  pickupDate   DateTime   @db.Timestamptz
  deliveryDate DateTime?  @db.Timestamptz
  weight       Int?
  commodity    String?
  rate         Decimal    @db.Decimal(12, 2)
  status       LoadStatus @default(PENDING)
  notes        String?
  createdAt    DateTime   @default(now()) @db.Timestamptz
  updatedAt    DateTime   @updatedAt @db.Timestamptz

  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  customer Customer  @relation(fields: [customerId], references: [id])
  route    Route?    @relation(fields: [routeId], references: [id])
  driver   User?     @relation(name: "DriverLoads", fields: [driverId], references: [id])
  truck    Truck?    @relation(fields: [truckId], references: [id])

  @@unique([tenantId, loadNumber])
  @@index([tenantId])
  @@index([customerId])
  @@index([driverId])
  @@index([truckId])
  @@index([status])
  @@index([pickupDate])
}
```

Add the reverse relations:
- On `Tenant` model: add `loads Load[]`
- On `Customer` model: add `loads Load[]`
- On `Route` model: add `loads Load[]`
- On `User` model: add `driverLoads Load[] @relation(name: "DriverLoads")`
- On `Truck` model: add `loads Load[]`

Run `npx prisma db push` to apply. Then apply RLS policy:
```sql
-- Connect to DB and run:
ALTER TABLE "Load" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "Load"
  USING ("tenantId" = current_setting('app.current_tenant_id')::uuid);
```
Use `npx prisma db execute --stdin` or the existing pattern from prior migrations.

**2. Create src/lib/validations/load.schemas.ts:**

Follow the customer.schemas.ts pattern:
```typescript
import { z } from 'zod';

export const loadCreateSchema = z.object({
  customerId: z.string().uuid('Select a customer'),
  origin: z.string().min(1, 'Origin is required').max(200),
  destination: z.string().min(1, 'Destination is required').max(200),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  deliveryDate: z.string().optional().or(z.literal('')),
  weight: z.coerce.number().int().positive().optional().or(z.literal(0)),
  commodity: z.string().max(100).optional().or(z.literal('')),
  rate: z.coerce.number().positive('Rate must be positive'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const loadUpdateSchema = loadCreateSchema;

export const dispatchLoadSchema = z.object({
  driverId: z.string().uuid('Select a driver'),
  truckId: z.string().uuid('Select a truck'),
});

export type LoadCreate = z.infer<typeof loadCreateSchema>;
export type LoadUpdate = z.infer<typeof loadUpdateSchema>;
export type DispatchLoad = z.infer<typeof dispatchLoadSchema>;
```

**3. Create src/app/(owner)/actions/loads.ts:**

Follow the customers.ts and invoices.ts patterns exactly:
- `'use server'` directive at top
- Import `requireRole`, `UserRole`, `getTenantPrisma`, `requireTenantId`, `revalidatePath`, `redirect`
- Import `Prisma` from `@/generated/prisma` for Decimal
- Import schemas from load.schemas.ts

Actions to implement:

**createLoad(prevState, formData):**
- requireRole([OWNER, MANAGER])
- Parse formData fields: customerId, origin, destination, pickupDate, deliveryDate, weight, commodity, rate, notes
- Validate with loadCreateSchema.safeParse
- Auto-generate loadNumber: query the latest load by loadNumber DESC, parse number, increment. Format: `LD-NNNN` (e.g., LD-0001). If no loads exist, start at LD-0001.
- Create with `new Decimal(result.data.rate)` for the rate field
- deliveryDate: if provided, `new Date(result.data.deliveryDate)`, else null
- weight: if 0 or falsy, set to null
- commodity/notes: if empty string, set to null
- revalidatePath('/loads') then redirect(`/loads/${createdId}`) — OUTSIDE try/catch

**updateLoad(id, prevState, formData):**
- requireRole([OWNER, MANAGER])
- Same parsing/validation as create
- Prisma update where: { id }
- Handle P2025 (not found)
- revalidatePath('/loads') then redirect(`/loads/${id}`) — OUTSIDE try/catch

**deleteLoad(id):**
- requireRole([OWNER, MANAGER])
- Only allow deletion of PENDING or CANCELLED loads (fetch first, check status)
- Hard delete (loads are not financial records requiring soft delete)
- revalidatePath('/loads') then redirect('/loads') — OUTSIDE try/catch

**dispatchLoad(id, prevState, formData):**
- requireRole([OWNER, MANAGER])
- Parse driverId, truckId from formData
- Validate with dispatchLoadSchema.safeParse
- Fetch load, verify status is PENDING (return error if not)
- Update load: set driverId, truckId, status = 'DISPATCHED'
- revalidatePath('/loads') then redirect(`/loads/${id}`) — OUTSIDE try/catch

**updateLoadStatus(id, newStatus: string):**
- requireRole([OWNER, MANAGER])
- Validate status transition: define allowed transitions map:
  - DISPATCHED -> PICKED_UP
  - PICKED_UP -> IN_TRANSIT
  - IN_TRANSIT -> DELIVERED
  - DELIVERED -> INVOICED
  - Any non-INVOICED/DELIVERED -> CANCELLED
- Fetch current load, check current status allows transition to newStatus
- Update status
- revalidatePath('/loads') then redirect(`/loads/${id}`) — OUTSIDE try/catch
  </action>
  <verify>
Run `npx prisma db push` succeeds without errors. Run `npx prisma generate` succeeds. Verify the Load model is accessible via `import { Load } from '@/generated/prisma'`. Run `npx tsc --noEmit` to verify all TypeScript compiles (may have some pre-existing issues, focus on new files).
  </verify>
  <done>
Load model exists in DB with RLS policy. Zod schemas validate all inputs. Five server actions (createLoad, updateLoad, deleteLoad, dispatchLoad, updateLoadStatus) follow established patterns with proper auth, validation, Decimal.js for rate, and redirect/revalidatePath outside try/catch.
  </done>
</task>

<task type="auto">
  <name>Task 2: Load UI components (form, list with status tabs, dispatch modal, status buttons)</name>
  <files>
    src/components/loads/load-form.tsx
    src/components/loads/load-list.tsx
    src/components/loads/load-status-badge.tsx
    src/components/loads/dispatch-modal.tsx
    src/components/loads/status-update-button.tsx
    src/components/loads/delete-load-button.tsx
  </files>
  <action>
Create `src/components/loads/` directory with all components.

**1. load-status-badge.tsx (client component):**
Small utility component for rendering colored status badges. Color map:
- PENDING: bg-yellow-100 text-yellow-700
- DISPATCHED: bg-blue-100 text-blue-700
- PICKED_UP: bg-indigo-100 text-indigo-700
- IN_TRANSIT: bg-purple-100 text-purple-700
- DELIVERED: bg-green-100 text-green-700
- INVOICED: bg-emerald-100 text-emerald-700
- CANCELLED: bg-gray-100 text-gray-700

Props: `{ status: string }`. Renders a `<span>` with rounded-full px-2.5 py-0.5 text-xs font-medium classes (matching CRM pattern).

**2. load-form.tsx (client component):**
Follow CustomerForm pattern exactly:
- `'use client'` + `useActionState`
- Props: `{ action, initialData?, submitLabel, customers }` where customers is `Array<{ id: string; companyName: string }>`
- Use same inputClass and labelClass as CustomerForm
- Fields:
  - Customer dropdown (select with customers list, required)
  - Origin (text input, required)
  - Destination (text input, required)
  - Pickup Date (date input, required)
  - Delivery Date (date input, optional)
  - Weight (number input, optional, placeholder "lbs")
  - Commodity (text input, optional)
  - Rate (number input, required, step="0.01", placeholder "$0.00")
  - Notes (textarea, optional)
- Layout: section headers like CustomerForm ("Load Details", "Schedule", "Pricing")
- Grid layout for date pairs, origin/destination pair
- Error display matching CustomerForm pattern

**3. load-list.tsx (client component):**
Follow CustomerList pattern but with status filter tabs:
- `'use client'` with `useState` for active tab
- Props: `{ loads: Array<{ id, loadNumber, customer: { companyName }, origin, destination, pickupDate, rate, status, driver?: { firstName, lastName }, truck?: { make, model } }> }`
- Tab bar at top: All, Pending, Dispatched, In Transit, Delivered — styled as horizontal button group
- Filter loads by selected tab status
- Table columns: Load #, Customer, Origin -> Destination, Pickup Date, Rate, Driver, Status
- Load # links to `/loads/{id}`
- Rate displayed with `$` and toLocaleString(undefined, { minimumFractionDigits: 2 })
- Empty state with Package icon and "No loads yet" message (matching CRM empty state pattern)
- Status shown via LoadStatusBadge component

**4. dispatch-modal.tsx (client component):**
- `'use client'` with `useState` for modal open/close + `useActionState`
- Props: `{ loadId: string, dispatchAction: (id: string, prevState: any, formData: FormData) => Promise<any>, drivers: Array<{ id: string; firstName: string; lastName: string }>, trucks: Array<{ id: string; make: string; model: string; licensePlate: string }> }`
- Button that opens a modal overlay (fixed inset-0 bg-black/50 z-50 with centered card)
- Inside modal: Driver dropdown, Truck dropdown, Dispatch button
- Use useActionState with the bound dispatchAction
- Close button and Escape key handler
- Error display inside modal

**5. status-update-button.tsx (client component):**
- `'use client'` with `useState` for pending state
- Props: `{ loadId: string, currentStatus: string, updateStatusAction: (id: string, newStatus: string) => Promise<any> }`
- Determine next valid status from current:
  - DISPATCHED -> "Mark Picked Up"
  - PICKED_UP -> "Mark In Transit"
  - IN_TRANSIT -> "Mark Delivered"
  - DELIVERED -> "Mark Invoiced"
- Show a primary-styled button with the next action label
- Also show a "Cancel Load" secondary/destructive button if status is not DELIVERED/INVOICED
- Uses window.confirm() before cancel action
- On click, calls updateStatusAction(loadId, nextStatus)

**6. delete-load-button.tsx (client component):**
Copy the DeleteCustomerButton pattern exactly but for loads. Props: `{ loadId: string, deleteAction: (id: string) => Promise<any> }`. Only renders if status allows deletion (pass a `canDelete` prop or just always render and let server action handle the error).
  </action>
  <verify>
Run `npx tsc --noEmit` to check all components compile. Verify all files exist under src/components/loads/. Ensure all components use 'use client' directive and follow established patterns.
  </verify>
  <done>
Six components created: LoadStatusBadge, LoadForm (with customer dropdown, dates, rate), LoadList (with status filter tabs), DispatchModal (driver/truck selection), StatusUpdateButton (lifecycle progression), DeleteLoadButton. All use useActionState/useState, matching CRM/invoice component patterns.
  </done>
</task>

<task type="auto">
  <name>Task 3: Load pages (list, new, detail, edit) and sidebar navigation link</name>
  <files>
    src/app/(owner)/loads/page.tsx
    src/app/(owner)/loads/new/page.tsx
    src/app/(owner)/loads/[id]/page.tsx
    src/app/(owner)/loads/[id]/edit/page.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
**1. src/app/(owner)/loads/page.tsx (server component):**
Follow CRM page.tsx pattern:
- Import getTenantPrisma, LoadList component, Link, Plus icon
- Query loads with `prisma.load.findMany({ orderBy: { createdAt: 'desc' }, include: { customer: { select: { companyName: true } }, driver: { select: { firstName: true, lastName: true } }, truck: { select: { make: true, model: true, licensePlate: true } } } })`
- Compute stats: total, pending count, inTransit count, totalRate (sum of all non-cancelled loads' rates)
- Stats cards grid (4 columns on lg): Total Loads, Pending, In Transit, Total Revenue
- Header with "Loads" title and "New Load" primary button linking to /loads/new
- Render LoadList with loads data

**2. src/app/(owner)/loads/new/page.tsx (server component):**
Follow CRM new/page.tsx pattern:
- Import createLoad action, LoadForm component
- Fetch customers list for dropdown: `prisma.customer.findMany({ where: { status: 'ACTIVE' }, select: { id: true, companyName: true }, orderBy: { companyName: 'asc' } })`
- Render page with title "Create Load", subtitle "Add a new load to your board"
- Render LoadForm with action={createLoad}, customers list, submitLabel="Create Load"

**3. src/app/(owner)/loads/[id]/page.tsx (server component):**
Follow CRM [id]/page.tsx pattern with additions for dispatch and status:
- Import getTenantPrisma, notFound, Link, icons (ArrowLeft, Pencil, Trash2, Package)
- Import LoadStatusBadge, DispatchModal, StatusUpdateButton, DeleteLoadButton
- Import dispatchLoad, deleteLoad, updateLoadStatus actions
- Fetch load with includes: `{ customer: true, driver: { select: { firstName: true, lastName: true, email: true } }, truck: { select: { make: true, model: true, year: true, licensePlate: true } } }`
- If status is PENDING, also fetch available drivers and trucks for dispatch modal:
  - `prisma.user.findMany({ where: { role: 'DRIVER', isActive: true }, select: { id, firstName, lastName } })`
  - `prisma.truck.findMany({ select: { id, make, model, licensePlate } })`
- Layout: Back link, title (Load # + loadNumber), status badge
- Action buttons area (top right):
  - If PENDING: show DispatchModal button (opens modal with driver/truck dropdowns)
  - If DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED: show StatusUpdateButton
  - Edit link button (always, except INVOICED/CANCELLED)
  - DeleteLoadButton (only for PENDING/CANCELLED)
- Info grid (3 columns on lg):
  - Left column: Load Details card (origin, destination, pickup date, delivery date, weight, commodity, rate, notes)
  - Middle column: Customer card (linked customer name as link to /crm/{customerId}, contact info)
  - Right column: Assignment card (driver name + truck info, or "Not yet dispatched" if PENDING)
- Status timeline section at bottom: show all statuses in order with checkmarks for completed ones, current status highlighted. Simple horizontal or vertical list with dots/lines.
- Bind dispatch action: `dispatchLoad.bind(null, id)`

**4. src/app/(owner)/loads/[id]/edit/page.tsx (server component):**
Follow CRM [id]/edit/page.tsx pattern exactly:
- Fetch load and customer list
- Bind updateLoad action with id
- Render LoadForm with initialData populated from load, customers list

**5. Update src/components/navigation/sidebar.tsx:**
- Import `Package` icon from lucide-react (for loads/dispatch)
- In the "Business" section (the `canViewFleetIntelligence` block), add a "Loads" menu item BEFORE the CRM item:
```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname.startsWith("/loads")}
    tooltip="Loads"
  >
    <Link href="/loads">
      <Package />
      <span>Loads</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```
Place it first in the Business group since dispatch/loads is the core operational feature.
  </action>
  <verify>
Run `npm run build` (or `npx next build`) to verify all pages compile and routes are valid. Navigate to http://localhost:3000/loads in browser (or verify build output includes /loads route). Verify sidebar shows "Loads" link in Business section. Run `npx tsc --noEmit` for type checking.
  </verify>
  <done>
Four pages created: /loads (list with stats + status tabs), /loads/new (create form with customer dropdown), /loads/[id] (detail with dispatch modal, status updates, customer/driver/truck info, status timeline), /loads/[id]/edit (edit form). Sidebar updated with Loads link in Business section using Package icon.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma db push` applies Load model and LoadStatus enum without errors
2. RLS policy exists on Load table
3. `npx tsc --noEmit` compiles without new errors
4. `npm run build` succeeds with all /loads routes
5. Sidebar shows "Loads" link in Business section
6. Creating a load auto-generates load number (LD-0001 format)
7. Dispatch modal assigns driver + truck and moves status to DISPATCHED
8. Status update buttons progress through lifecycle correctly
</verification>

<success_criteria>
- Load model in database with RLS tenant isolation
- Full CRUD for loads with customer linkage
- Load board with status filter tabs showing All/Pending/Dispatched/In Transit/Delivered
- One-click dispatch via modal with driver and truck dropdowns
- Status lifecycle progression (PENDING through INVOICED/CANCELLED)
- Load detail page shows customer info, driver/truck assignment, status timeline
- Rate field uses Decimal.js (never floating point)
- Sidebar includes Loads link in Business section
- All server actions follow established patterns (requireRole, getTenantPrisma, redirect outside try/catch)
</success_criteria>

<output>
After completion, create `.planning/quick/8-build-dispatch-and-load-management-with-/8-SUMMARY.md`
</output>
