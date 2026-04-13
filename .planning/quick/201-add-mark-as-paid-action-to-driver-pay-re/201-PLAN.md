---
phase: quick-201
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
  - apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
  - apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can mark an approved pay record as paid from dispatch detail"
    - "Owner can mark an approved pay record as paid from driver pay report"
    - "Paid records display a green Paid badge and no action buttons"
    - "Confirmation dialog prevents accidental marking"
    - "Only approved records can be marked as paid (API enforces 422 for pending/paid/voided)"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts"
      provides: "PATCH endpoint to transition approved -> paid"
      exports: ["PATCH"]
    - path: "apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx"
      provides: "Mark as Paid button on approved records"
    - path: "apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx"
      provides: "Mark as Paid button on approved rows in report table"
  key_links:
    - from: "DispatchPayRecordsPanel.tsx"
      to: "/api/v1/carrier/pay-records/[id]/mark-paid"
      via: "fetch PATCH on button click after confirm()"
      pattern: "fetch.*mark-paid.*PATCH"
    - from: "driver-pay/page.tsx"
      to: "/api/v1/carrier/pay-records/[id]/mark-paid"
      via: "fetch PATCH on button click after confirm()"
      pattern: "fetch.*mark-paid.*PATCH"
---

<objective>
Add "Mark as Paid" action to driver pay records so owners can transition approved records to paid status with a confirmation dialog, from both the dispatch detail panel and the driver pay report page.

Purpose: Complete the pay record lifecycle (pending -> approved -> paid) so owners can track which records have been disbursed.
Output: 1 new API route + 2 modified UI components with Mark as Paid buttons and paid badge styling.
</objective>

<context>
@apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts (pattern to follow for mark-paid endpoint)
@apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx (existing approve/recalculate button patterns)
@apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx (existing bulk approve and table layout)
@apps/web/prisma/schema.prisma (DriverPayRecord model — need to add paidAt field)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add paidAt field to schema and create mark-paid API endpoint</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
  </files>
  <action>
1. In `apps/web/prisma/schema.prisma`, add `paidAt` field to the `DriverPayRecord` model (after `approvedAt`):
   ```
   paidAt            DateTime? @map("paid_at") @db.Timestamptz
   ```
   Run `npx prisma migrate dev --name add-paid-at-to-driver-pay-record` from `apps/web/`.
   Then run `npx prisma generate` to update the client.

2. Create `apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts`:
   - Mirror the approve endpoint pattern exactly (same imports: NextRequest, NextResponse, getSession, logger, prisma).
   - PATCH handler:
     - Get session, verify auth + orgId (401/403 like approve route).
     - Extract `id` from `await params`.
     - Find record with `prisma.driverPayRecord.findFirst({ where: { id, orgId } })` — 404 if not found.
     - If `record.status !== 'approved'`, return 422 with descriptive error:
       - If status is `paid`: `{ error: 'Record is already paid' }`
       - If status is `pending`: `{ error: 'Record must be approved before marking as paid' }`
       - If status is `voided`: `{ error: 'Voided records cannot be marked as paid' }`
       - Default: `{ error: 'Only approved records can be marked as paid' }`
     - Update: `prisma.driverPayRecord.update({ where: { id }, data: { status: 'paid', paidAt: new Date() } })`.
     - Return `{ data: updated }`.
     - Wrap in try/catch, log error with `logger.error('PATCH /api/v1/carrier/pay-records/[id]/mark-paid failed', err)`.
  </action>
  <verify>
    Run `npx prisma validate` from `apps/web/` to confirm schema is valid.
    Run `npx tsc --noEmit` from project root to confirm no type errors in the new route.
  </verify>
  <done>
    PATCH /api/v1/carrier/pay-records/[id]/mark-paid returns 200 for approved records (sets status=paid, paidAt=now), returns 422 for pending/paid/voided records, returns 404 for unknown IDs.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Mark as Paid button to DispatchPayRecordsPanel and driver pay report</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
    apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx
  </files>
  <action>
**DispatchPayRecordsPanel.tsx changes:**

1. Add `paid` to `PAY_STATUS_BADGE` map:
   ```
   paid: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
   ```

2. Add state: `const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);`

3. Add `handleMarkPaid(id: string)` function (similar pattern to `handleRecalculate`):
   - Show `window.confirm('Mark this pay record as paid? This cannot be undone.')` — if cancelled, return early.
   - Set `markingPaidId` to `id`.
   - `fetch(`/api/v1/carrier/pay-records/${id}/mark-paid`, { method: 'PATCH' })`.
   - On success: `toast.success('Pay record marked as paid')`, `router.refresh()`.
   - On error: parse error JSON, `toast.error(...)`.
   - Finally: `setMarkingPaidId(null)`.

4. In the record card's action buttons area (the `<div className="flex items-center gap-2">` at line ~171):
   - For records with `status === 'paid'`: hide the Recalculate button. The status badge already shows "Paid" via the badge map. Do NOT render any action buttons (no Approve, no Recalculate, no Mark as Paid).
   - For records with `status === 'approved'`: keep existing Recalculate button, replace/remove the Approve button (it won't show since status !== pending), and ADD a "Mark as Paid" button:
     ```tsx
     {record.status === 'approved' && (
       <Button
         size="sm"
         variant="outline"
         disabled={markingPaidId === record.id}
         onClick={() => handleMarkPaid(record.id)}
         className="h-7 text-xs"
       >
         {markingPaidId === record.id ? 'Marking...' : 'Mark as Paid'}
       </Button>
     )}
     ```
   - Update the Recalculate button condition: change `(record.status === 'pending' || record.status === 'approved')` to exclude `paid` (it already does, but make sure `paid` records show NO action buttons at all).

5. For paid records, the existing badge rendering already works because we added `paid` to the badge map. No further changes needed for the badge.

**driver-pay/page.tsx changes:**

1. The `STATUS_BADGE` map already has `paid` (blue). The `STATUS_LABEL` map already has `paid: 'Paid'`. No changes needed there.

2. Add state: `const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);`

3. Add `handleMarkPaid(id: string)` function (same pattern as DispatchPayRecordsPanel):
   - `window.confirm('Mark this pay record as paid? This cannot be undone.')` — return if cancelled.
   - Set `markingPaidId`, fetch PATCH, toast success/error, `fetchRows()` on success, finally clear state.

4. Add an "Actions" column header after the Status column in the `<thead>`:
   ```tsx
   <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
   ```

5. In each `<tr>`, add a new `<td>` after the status cell:
   ```tsx
   <td className="px-4 py-3 text-center">
     {r.status === 'approved' && (
       <button
         onClick={() => handleMarkPaid(r.id)}
         disabled={markingPaidId === r.id}
         className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
       >
         {markingPaidId === r.id ? 'Marking...' : 'Mark as Paid'}
       </button>
     )}
   </td>
   ```
   For non-approved rows this cell renders empty (no button).

Do NOT add any new shared components. All confirmation uses `window.confirm()` inline. Do NOT modify pay-calculator.ts or any other files.
  </action>
  <verify>
    Run `npx tsc --noEmit` from project root to confirm no type errors.
    Visually confirm: pending records show Approve button only, approved records show Mark as Paid button, paid records show Paid badge and no action buttons.
  </verify>
  <done>
    Both DispatchPayRecordsPanel and driver pay report page show "Mark as Paid" button on approved records, confirmation dialog on click, toast on success, paid records display blue "Paid" badge with no action buttons.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma validate` passes (schema valid with new paidAt field).
2. `npx tsc --noEmit` passes with zero errors.
3. API: PATCH /api/v1/carrier/pay-records/{id}/mark-paid returns 200 for approved records, 422 for pending/paid/voided, 404 for missing.
4. DispatchPayRecordsPanel: approved records show "Mark as Paid" button, paid records show blue badge + no buttons.
5. Driver Pay Report: approved rows show "Mark as Paid" button in Actions column, paid rows show blue badge + empty Actions cell.
</verification>

<success_criteria>
- Pay record lifecycle is complete: pending -> approved -> paid
- Paid records are immutable (API returns 422, UI shows no action buttons)
- Confirmation dialog prevents accidental marking
- Both UI surfaces (dispatch detail + driver pay report) have consistent Mark as Paid functionality
- paidAt timestamp is stored on the record
</success_criteria>
