---
task: 186
type: quick
title: "Fix all carrier ops bugs found during QA testing"
status: planned
---

<objective>
Fix 19 carrier ops QA bugs across dashboard, sidebar, layout guards, role-based visibility, facility types, facility list contacts, client form fields, and portal access toggle. Constraints: no database constraint changes, no existing migration changes.

Purpose: Resolve all QA-reported issues in carrier ops module so it is production-ready.
Output: All 19 bugs fixed, `npx tsc --noEmit` passes cleanly.
</objective>

<context>
@apps/web/src/app/(owner)/dashboard/page.tsx
@apps/web/src/app/(owner)/actions/dashboard.ts
@apps/web/src/app/(owner)/actions/notifications.ts
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/app/(owner)/carrier/layout.tsx
@apps/web/src/components/carrier/contracts/ContractList.tsx
@apps/web/src/components/carrier/clients/ClientList.tsx
@apps/web/src/components/carrier/clients/ClientForm.tsx
@apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
@apps/web/src/components/carrier/facilities/FacilityList.tsx
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
@apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
@apps/web/src/lib/carrier/clients.ts
@apps/web/prisma/schema.prisma
@apps/web/scripts/seed-qa-accounts.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix dashboard timeouts, sidebar labels, layout guard, and role-based button visibility</name>
  <files>
    apps/web/src/app/(owner)/actions/dashboard.ts
    apps/web/src/app/(owner)/actions/notifications.ts
    apps/web/src/components/navigation/sidebar.tsx
    apps/web/src/app/(owner)/carrier/layout.tsx
    apps/web/src/components/carrier/contracts/ContractList.tsx
    apps/web/src/components/carrier/clients/ClientList.tsx
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
  </files>
  <action>
**BUG-01 — Dashboard Prisma transaction timeouts:**
In `apps/web/src/app/(owner)/actions/dashboard.ts`, wrap the `_fetchDashboardMetrics` function's `Promise.all` so that each of the 7 individual queries has its own `.catch()` returning a safe default (0 for counts, empty array for findMany). This way if `load.count`, `truck.findMany`, or `scheduledService.findMany` times out, the rest still resolve. Specifically:
- Each `db.*.count(...)` call: `.catch(() => 0)`
- Each `db.*.findMany(...)` call: `.catch(() => [])`
Apply the same pattern inside `_fetchNotificationAlerts` for its 4-query `Promise.all`.

In `apps/web/src/app/(owner)/actions/notifications.ts`, wrap the `_fetchUpcomingMaintenance` function's `db.scheduledService.findMany` in a try/catch returning `[]` on error. Do the same for `_fetchExpiringDocuments` `db.truck.findMany`.

**BUG-02, 03, 04 — Duplicate sidebar items:**
In `apps/web/src/components/navigation/sidebar.tsx`:
- Line ~457: Change `<span>Loads</span>` inside Carrier Ops section to `<span>Carrier Loads</span>`
- Line ~477: Change `Drivers` inside Carrier Ops > Fleet sub-menu to `Carrier Drivers`
- Line ~487: Change `Trucks` inside Carrier Ops > Fleet sub-menu to `Carrier Trucks`

**BUG-05 — Two unlabeled Dashboards:**
In same sidebar file, line ~391: Change `<span>Dashboard</span>` inside Carrier Ops section to `<span>Carrier Dashboard</span>`. Also update the tooltip on line ~387 from `"Dashboard"` to `"Carrier Dashboard"`.

**BUG-06 — Driver role redirects to /unauthorized:**
In `apps/web/src/app/(owner)/carrier/layout.tsx`, change line 26 from `redirect("/my-load")` to `redirect("/my-route")` (the task description says /my-route).

**BUG-07 — Manager role can see "New Contract" button:**
In `apps/web/src/components/carrier/contracts/ContractList.tsx`, the component needs a `role` prop. Add an optional `role?: string` prop. Wrap the "New Contract" Link in `{role !== 'MANAGER' && (...)}`. Update the parent page `apps/web/src/app/(owner)/carrier/contracts/page.tsx` to pass `role={session.role}` to ContractList.

**BUG-08 — Manager role can see "New Client" button:**
In `apps/web/src/components/carrier/clients/ClientList.tsx`, add optional `role?: string` prop. Wrap the "New Client" Link in `{role !== 'MANAGER' && (...)}`. Update parent page `apps/web/src/app/(owner)/carrier/clients/page.tsx` to pass `role={session.role}`.

**BUG-18 — Contracts tab on client detail shows "New Contract" for all roles:**
In `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx`, the component needs a `role` prop passed from the page. Add `role?: string` to the component props. In the contracts tab section (around line 374), wrap the "New Contract" Link in `{role !== 'MANAGER' && (...)}`. Update the parent page `apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx` to read session role and pass it to ClientDetail.
  </action>
  <verify>
    Run `npx tsc --noEmit` from apps/web — no type errors on modified files. Visually inspect sidebar labels show "Carrier Dashboard", "Carrier Loads", "Carrier Drivers", "Carrier Trucks". Confirm "New Contract" and "New Client" buttons are hidden for MANAGER role.
  </verify>
  <done>
    BUGs 01-08, 18 resolved: dashboard queries fail gracefully, sidebar labels are unique, carrier layout redirects drivers to /my-route, role-gated buttons hidden for MANAGER.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix facility types, facility contact display, client payment fields, and portal access toggle</name>
  <files>
    apps/web/src/components/carrier/facilities/FacilityForm.tsx
    apps/web/src/components/carrier/facilities/FacilityList.tsx
    apps/web/src/app/(owner)/carrier/facilities/page.tsx
    apps/web/src/lib/carrier/facilities.ts
    apps/web/scripts/seed-qa-accounts.ts
    apps/web/prisma/schema.prisma
    apps/web/src/components/carrier/clients/ClientForm.tsx
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
    apps/web/src/app/api/v1/carrier/clients/route.ts
    apps/web/src/lib/carrier/clients.ts
  </files>
  <action>
**BUG-09 — Facility type dropdown options don't match spec:**
In `apps/web/src/components/carrier/facilities/FacilityForm.tsx`, replace the `FACILITY_TYPES` array with:
```
{ value: 'shipper', label: 'Shipper' },
{ value: 'receiver', label: 'Receiver' },
{ value: 'terminal', label: 'Terminal' },
{ value: 'fuel_stop', label: 'Fuel Stop' },
{ value: 'other', label: 'Other' },
```

In `apps/web/src/components/carrier/facilities/FacilityList.tsx`, replace the `FACILITY_TYPES` array with the same 5 options. Update `BADGE_CLASSES` to have entries for: shipper, receiver, terminal, fuel_stop, other (pick distinct color combos for each).

In `apps/web/scripts/seed-qa-accounts.ts`, update the two seed facilities:
- Change `facilityType: 'warehouse'` to `facilityType: 'shipper'`
- Change `facilityType: 'customer_site'` to `facilityType: 'receiver'`

Do NOT create any new migration files. Do NOT change database constraints. The `facilityType` column is a plain String field in the schema — the dropdown values are enforced at the application level only.

**BUG-14 — Facilities list does not display contact information:**
The `FacilityList` component already has a Contact column that shows `f.contactName`. The `contacts` JSON field (array of objects with `name`, `phone`, `email`, `role`) is the newer data source. Update the `FacilityItem` interface in `FacilityList.tsx` to add `contacts?: Array<{ name: string; phone?: string; email?: string; role?: string }>`. In the Contact table cell, display: if `f.contacts` array has items, show `f.contacts[0].name`; else fall back to `f.contactName ?? '—'`.

Update the facilities page (`apps/web/src/app/(owner)/carrier/facilities/page.tsx`) to pass `contacts` in the mapped facility objects. Check `apps/web/src/lib/carrier/facilities.ts` — if `listFacilities` doesn't select/return the `contacts` field, add it to the select/return.

**BUG-17 — Client form missing Payment Terms and Credit Limit fields:**
1. In `apps/web/prisma/schema.prisma`, add two fields to the `CarrierClient` model:
   ```
   paymentTerms  Int      @default(30) @map("payment_terms")
   creditLimit   Decimal? @map("credit_limit") @db.Decimal(12, 2)
   ```
   Then run `npx prisma db push` from apps/web to sync the schema to the database without creating a migration file.

2. In `apps/web/src/components/carrier/clients/ClientForm.tsx`:
   - Add `paymentTerms` and `creditLimit` to the `ClientData` interface (paymentTerms: number, creditLimit: string | null)
   - Add form state fields: `paymentTerms: initialData?.paymentTerms?.toString() ?? '30'`, `creditLimit: initialData?.creditLimit ?? ''`
   - Add a "Billing" section in the form between Contact and Portal Access with:
     - Payment Terms (days): number input, default 30
     - Credit Limit: text input, optional, placeholder "$0.00"
   - Include in the submit body: `paymentTerms: parseInt(values.paymentTerms) || 30`, and `creditLimit` only if non-empty (as a string — Prisma handles Decimal conversion)

3. In `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts`, add `paymentTerms: z.number().int().optional()` and `creditLimit: z.union([z.string(), z.number()]).optional().nullable()` to `ClientUpdateSchema`.

4. In `apps/web/src/app/api/v1/carrier/clients/route.ts`, add the same fields to the POST create schema.

5. In `apps/web/src/lib/carrier/clients.ts`, add `paymentTerms?: number` and `creditLimit?: string | number` to `ClientCreateInput` and `ClientUpdateInput`.

6. In `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx`:
   - Add `paymentTerms` and `creditLimit` to the `ClientSerialized` interface
   - In the Overview tab, add a "Billing" section between Contact and Portal Access showing Payment Terms and Credit Limit fields using the existing `Field` component

**BUG-19 — Client portal access toggle fails to update:**
In `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts`, check the `ClientUpdateSchema`. The `portalAccess: z.boolean().optional()` looks correct. The issue is likely that when `portalAccess` is the ONLY field being sent, the sparse body construction in the PATCH handler might be stripping it. Debug: ensure `parsed.data` passes through correctly to `updateClient`. Check `updateClient` in `apps/web/src/lib/carrier/clients.ts` — the function takes `data` and passes it directly to `prisma.carrierClient.update({ data })`. This should work. The real issue might be that when toggling OFF, the body `{ portalAccess: false }` is parsed, but `false` is falsy — check if any middleware or transform is stripping falsy values. If not found in backend, check the ClientDetail component's `handlePortalToggle` — ensure the fetch body is `JSON.stringify({ portalAccess: val })` where val is explicitly boolean. If the toggle works on PATCH but the UI doesn't update, ensure `setPortalAccess(val)` runs after success. Also verify `portalEmail` field appears when `portalAccess` is toggled ON — the current code checks `portalAccess && client.portalEmail` but after toggling ON, `client.portalEmail` might be null (not yet set). Change the condition to show the portalEmail field when `portalAccess` is true (not just when client.portalEmail exists) — use an input field instead of just a display field so the user can enter the email after enabling access.
  </action>
  <verify>
    Run `npx prisma db push` from apps/web directory (sync schema). Run `npx tsc --noEmit` from apps/web — zero errors. Verify facility form dropdown shows exactly 5 options (Shipper, Receiver, Terminal, Fuel Stop, Other). Verify client form has Payment Terms and Credit Limit fields. Verify portal access toggle sends PATCH and updates UI.
  </verify>
  <done>
    BUGs 09, 14, 17, 19 resolved: facility types match spec, facility list shows contacts, client form has payment terms + credit limit, portal access toggle works correctly.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify already-fixed bugs and run final TypeScript check</name>
  <files>
    (read-only verification of files related to BUGs 10, 11, 12, 13, 15, 16)
  </files>
  <action>
**BUGs 10, 11, 12, 13, 15, 16 — Already fixed, verify:**
Read the relevant files for these bugs to confirm they are resolved. These were listed as "already fixed" in the bug report. Simply confirm by reading the code that the fixes are in place.

**Final TypeScript check:**
Run `npx tsc --noEmit` from the `apps/web` directory. If any type errors surface from the changes in Tasks 1 and 2, fix them. Common issues to watch for:
- New props added to components but not passed from parent pages
- Decimal type handling for creditLimit
- The `contacts` JSON field type from Prisma (it's `Json` type, needs casting)

Run `npx tsc --noEmit` again after any fixes to confirm zero errors.
  </action>
  <verify>
    `npx tsc --noEmit` exits with code 0 from apps/web directory.
  </verify>
  <done>
    All 19 bugs addressed. TypeScript compiles cleanly. No database constraints modified, no existing migrations changed.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in apps/web with zero errors
- Sidebar shows unique labels: "Carrier Dashboard", "Carrier Loads", "Carrier Drivers", "Carrier Trucks"
- Dashboard page loads without timeout errors (queries fail gracefully)
- Driver role accessing /carrier/* redirects to /my-route (not /unauthorized)
- MANAGER role cannot see "New Contract" or "New Client" buttons
- Facility form dropdown shows: Shipper, Receiver, Terminal, Fuel Stop, Other
- Facility list Contact column shows primary contact from contacts JSON array
- Client form includes Payment Terms and Credit Limit fields
- Client detail Overview tab displays payment terms and credit limit
- Portal access toggle successfully updates via PATCH and shows portal_email input when ON
</verification>

<success_criteria>
All 19 carrier ops QA bugs fixed. TypeScript compiles cleanly. No database constraints or existing migrations modified.
</success_criteria>
