---
phase: quick-199
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/pay-calculator.ts
  - apps/web/src/lib/carrier/expenses.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts
autonomous: true
must_haves:
  truths:
    - "Pay records created at dispatch completion include sum of approved reimbursable expenses"
    - "Approving an expense after pay record exists updates that pay record's reimbursements and net_pay"
    - "net_pay always equals base_pay + bonuses + tips - deductions + reimbursements"
    - "Paid pay records cannot be recalculated (returns 422)"
    - "PATCH /api/v1/carrier/pay-records/[id]/recalculate re-fetches expenses and recomputes net_pay"
  artifacts:
    - path: "apps/web/src/lib/carrier/pay-calculator.ts"
      provides: "Exported recalculatePayRecordReimbursements helper + correct net_pay formula"
    - path: "apps/web/src/lib/carrier/expenses.ts"
      provides: "approveExpense updates existing pay records on approval"
    - path: "apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts"
      provides: "PATCH endpoint for manual recalculation"
  key_links:
    - from: "apps/web/src/lib/carrier/expenses.ts"
      to: "apps/web/src/lib/carrier/pay-calculator.ts"
      via: "approveExpense calls recalculatePayRecordReimbursements"
      pattern: "recalculatePayRecordReimbursements"
    - from: "apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts"
      to: "apps/web/src/lib/carrier/pay-calculator.ts"
      via: "PATCH handler calls recalculatePayRecordReimbursements"
      pattern: "recalculatePayRecordReimbursements"
---

<objective>
Fix reimbursements not flowing into driver pay records.

Purpose: When expenses are approved (especially after pay record creation), the pay record's reimbursements and net_pay must update. Currently approveExpense does not propagate changes to existing pay records, and the net_pay formula omits bonuses/tips/deductions.

Output: Working reimbursement flow + manual recalculate endpoint.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/pay-calculator.ts
@apps/web/src/lib/carrier/expenses.ts
@apps/web/src/app/api/v1/carrier/expenses/[id]/approve/route.ts
@apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
@apps/web/prisma/schema.prisma (DriverPayRecord model at line ~1692)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add recalculatePayRecordReimbursements helper and fix net_pay formula in pay-calculator.ts</name>
  <files>apps/web/src/lib/carrier/pay-calculator.ts</files>
  <action>
1. Fix the net_pay formula everywhere in generateDriverPayRecords. Currently `netPay = basePay + reimbursements`. Change to: `netPay = basePay + bonuses + tips - deductions + reimbursements`. Since bonuses/tips/deductions default to 0 in the DB and are not set during generation, use 0 for now but make the formula correct so future changes work. Apply this in both the percentage_gross loop (line ~134) and the general case (line ~249).

2. Extract a shared `computeNetPay` helper at the top of the file:
```ts
function computeNetPay(basePay: number, bonuses: number, tips: number, deductions: number, reimbursements: number): number {
  return basePay + bonuses + tips - deductions + reimbursements;
}
```
Use it in both places where netPay is computed.

3. Add a new exported async function `recalculatePayRecordReimbursements`:
```ts
export async function recalculatePayRecordReimbursements(
  orgId: string,
  payRecordId: string
): Promise<{ error: string; status: number } | { data: { id: string; reimbursements: number; netPay: number } }> {
```
Logic:
- Fetch the pay record by id + orgId. Return 404 if not found.
- If record.status === 'paid', return { error: 'Cannot recalculate a paid record', status: 422 }.
- Query carrierExpense WHERE dispatchId = record.dispatchId AND driverId = record.driverId AND reimbursable = true AND approvedAt IS NOT NULL. Sum amounts using toNum() and reduce.
- For percentage_gross records that have a loadId, also filter expenses by loadId? No -- reimbursements are per-driver-per-dispatch regardless of load split. But if multiple pay records exist for the same driver+dispatch (percentage_gross creates one per load), split reimbursements evenly across those records. Query count of pay records for same driverId+dispatchId, divide total reimbursements by that count.
- Compute new netPay using computeNetPay(toNum(record.basePay), toNum(record.bonuses), toNum(record.tips), toNum(record.deductions), reimbursementShare).
- Update the pay record with new reimbursements and netPay (as Prisma.Decimal).
- Return { data: { id, reimbursements: reimbursementShare, netPay } }.

Important: Use parseFloat(String(d)) via the existing toNum helper for all Decimal conversions. Never do arithmetic directly on Prisma Decimal objects.
  </action>
  <verify>npx tsc --noEmit (from apps/web) — no type errors in pay-calculator.ts</verify>
  <done>pay-calculator.ts exports recalculatePayRecordReimbursements, net_pay formula includes all 5 components, TypeScript clean</done>
</task>

<task type="auto">
  <name>Task 2: Update approveExpense to propagate reimbursements to existing pay records</name>
  <files>apps/web/src/lib/carrier/expenses.ts</files>
  <action>
In the approveExpense function (line ~182), after the expense is updated with approvedAt/approvedBy:

1. Import recalculatePayRecordReimbursements from './pay-calculator'.
2. After the update, check if the approved expense is reimbursable (updated.reimbursable === true) AND has a dispatchId AND has a driverId.
3. If so, find all DriverPayRecord rows WHERE orgId = orgId AND dispatchId = updated.dispatchId AND driverId = updated.driverId AND status != 'paid'.
4. For each matching pay record, call recalculatePayRecordReimbursements(orgId, record.id). Log results but do NOT fail the approval if recalculation fails — wrap in try/catch and log warnings.
5. This is fire-and-forget from the approval perspective: the expense approval always succeeds, pay record updates are best-effort with logging.

Do NOT change the return type or signature of approveExpense.
  </action>
  <verify>npx tsc --noEmit (from apps/web) — no type errors in expenses.ts</verify>
  <done>Approving a reimbursable expense with dispatchId+driverId automatically updates all non-paid pay records for that driver+dispatch</done>
</task>

<task type="auto">
  <name>Task 3: Create PATCH /api/v1/carrier/pay-records/[id]/recalculate endpoint</name>
  <files>apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts</files>
  <action>
Create a new route file at the path above. Pattern it after the existing approve route (same file: apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts).

1. Export async function PATCH(req, { params }).
2. Auth: getSession(), check session + orgId (same pattern as approve route).
3. Extract id from params.
4. Call recalculatePayRecordReimbursements(orgId, id) from '@/lib/carrier/pay-calculator'.
5. If result has 'error', return NextResponse.json({ error }, { status }).
6. Otherwise return NextResponse.json(result).
7. Wrap in try/catch, log errors with logger.error.

This gives owners a manual way to trigger reimbursement recalculation on any non-paid pay record.
  </action>
  <verify>npx tsc --noEmit (from apps/web) — no type errors. Confirm file exists at correct path.</verify>
  <done>PATCH /api/v1/carrier/pay-records/[id]/recalculate returns updated reimbursements+netPay for non-paid records, 422 for paid records, 404 for missing</done>
</task>

</tasks>

<verification>
Run from apps/web:
1. `npx tsc --noEmit` — zero errors
2. Grep pay-calculator.ts for computeNetPay to confirm formula uses all 5 fields
3. Grep expenses.ts for recalculatePayRecordReimbursements to confirm propagation on approve
4. Confirm recalculate route file exists at correct path
</verification>

<success_criteria>
- net_pay = base_pay + bonuses + tips - deductions + reimbursements in all code paths
- Approving a reimbursable expense updates existing non-paid pay records automatically
- PATCH recalculate endpoint works for manual recalculation
- Paid records are protected (422 on recalculate)
- TypeScript clean (tsc --noEmit passes)
- No schema or migration changes
</success_criteria>

<output>
After completion, create `.planning/quick/199-fix-reimbursements-not-flowing-into-driv/199-SUMMARY.md`
</output>
