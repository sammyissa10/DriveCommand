---
phase: 305-driver-pay-phase-8-cleanup-gaps
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260513000001_driver_pay_phase8_partial_unique/migration.sql
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can re-generate a settlement for the same driver+period after voiding the prior one"
    - "Voiding a non-PAID settlement releases assignments back to APPROVED pay_status"
    - "Voiding a non-PAID settlement clears settlement_id on associated bonuses"
    - "Voiding a non-PAID settlement decrements amount_collected on every deduction recorded in the snapshot"
    - "Voiding a non-PAID settlement writes a driver_pay_audit_log row with action='settlement:voided'"
    - "Voiding a PAID settlement returns 409 with a clear error message"
    - "MANAGER role can void a settlement; DRIVER cannot"
    - "Settlement detail Deductions section shows both per-load DEDUCTION pay components AND recurring driver-level deductions"
    - "The sum displayed in the unified Deductions section equals the Pay Summary 'Total Deductions' value"
  artifacts:
    - path: "apps/web/prisma/migrations/20260513000001_driver_pay_phase8_partial_unique/migration.sql"
      provides: "Drops ds_unique_period, creates partial unique index excluding VOIDED + soft-deleted rows"
      contains: "DROP CONSTRAINT ds_unique_period"
    - path: "apps/web/prisma/schema.prisma"
      provides: "DriverSettlement model with schema-level comment documenting the partial unique index"
      contains: "/// @@unique partial"
    - path: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts"
      provides: "Void handler that resets pay_status on assignments and allows MANAGER role"
      contains: "payStatus: 'APPROVED'"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx"
      provides: "Unified Deductions section with type indicator (Per-Load vs Recurring)"
      contains: "Per-Load"
  key_links:
    - from: "POST /api/driver-pay/settlements/[settlementId]/void"
      to: "prisma.$transaction"
      via: "atomic cascade"
      pattern: "prisma\\.\\$transaction\\("
    - from: "void handler"
      to: "loadDriverAssignment.updateMany"
      via: "settlementId clear + payStatus revert"
      pattern: "payStatus:\\s*['\"]APPROVED['\"]"
    - from: "SettlementDetailView Deductions section"
      to: "assignments[].payComponents (category=DEDUCTION) + deductionsApplied"
      via: "client-side merge with type indicator"
      pattern: "Per-Load|Recurring"
---

<objective>
Close four Phase 8 cleanup gaps that were patched manually with raw SQL during verification on 2026-05-13:

1. **Gap 1** — Replace blanket unique constraint on `driver_settlements (driver_id, period_start, period_end)` with a **partial unique index** that excludes VOIDED and soft-deleted rows. This allows re-generation after a void without a unique-violation error.
2. **Gap 2** — Update the void route handler to also reset `pay_status` to `'APPROVED'` on released assignments and broaden RBAC to allow MANAGER (currently OWNER-only). Other cascade behavior (clear settlement_id on assignments + bonuses, audit log, $transaction wrapper) is already implemented.
3. **Gap 3** — Verify (and harden if needed) that the void route decrements `amount_collected` on each deduction recorded in the `_deductionsApplied` snapshot. Already implemented; this plan only adds a test to lock the behavior in.
4. **Gap 4** — UI fix: `SettlementDetailView` Deductions section must show **both** load-level pay components with `category='DEDUCTION'` AND recurring driver-level `driverDeductions`, with a per-row "Per-Load" / "Recurring" indicator. The sum must reconcile to the Pay Summary "Total Deductions" value.

Purpose: Permanently close gaps found in manual testing so re-generation, void cascade, and deductions visibility all work without SQL patches.

Output: One migration, schema comment, void route update, settlement detail page server-side data shaping, and UI render update.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md

# Files to read before editing
@apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
@apps/web/prisma/schema.prisma
@apps/web/src/lib/auth/roles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add partial unique index migration for driver_settlements</name>
  <files>
    apps/web/prisma/migrations/20260513000001_driver_pay_phase8_partial_unique/migration.sql
    apps/web/prisma/schema.prisma
  </files>
  <action>
Create new Prisma migration directory and SQL file at:
`apps/web/prisma/migrations/20260513000001_driver_pay_phase8_partial_unique/migration.sql`

SQL contents (backwards-compatible, idempotent):

```sql
-- Phase 8 Cleanup Gap 1 — partial unique on driver_settlements
-- Allows re-generation after a settlement is VOIDED or soft-deleted.
-- The original constraint `ds_unique_period` blocked re-generation because
-- VOIDED rows still occupied the (driver_id, period_start, period_end) slot.

-- Drop the legacy table constraint (idempotent)
ALTER TABLE driver_settlements
  DROP CONSTRAINT IF EXISTS ds_unique_period;

-- Drop any leftover index Prisma may have produced previously (idempotent)
DROP INDEX IF EXISTS driver_settlements_driver_id_period_start_period_end_key;

-- Create partial unique index — only enforces uniqueness for ACTIVE settlements
CREATE UNIQUE INDEX IF NOT EXISTS ds_unique_period_active
  ON driver_settlements (driver_id, period_start, period_end)
  WHERE deleted_at IS NULL
    AND status <> 'VOIDED';
```

Then edit `apps/web/prisma/schema.prisma` `DriverSettlement` model:

1. **Remove** the `@@unique([driverId, periodStart, periodEnd])` line (line ~2790) — Prisma can't express partial unique indexes natively, and leaving it would cause `prisma migrate dev` to try to re-add the blanket constraint.
2. **Add a triple-slash schema comment** directly above the model documenting the manual partial unique index, e.g.:

```prisma
/// Note: partial unique index `ds_unique_period_active` on
/// (driver_id, period_start, period_end) WHERE deleted_at IS NULL AND status <> 'VOIDED'
/// is defined manually in migration 20260513000001_driver_pay_phase8_partial_unique
/// because Prisma does not support partial unique indexes natively.
model DriverSettlement {
  ...
}
```

3. Run `pnpm prisma generate` (and let the auto-deploy hook apply the migration to Supabase) — do NOT run `prisma migrate dev` (it would try to reconcile the removed @@unique).
  </action>
  <verify>
- Migration file exists at the path above with the partial unique index DDL.
- `apps/web/prisma/schema.prisma` no longer has `@@unique([driverId, periodStart, periodEnd])` on DriverSettlement.
- `apps/web/prisma/schema.prisma` has a triple-slash comment above `model DriverSettlement` referencing the manual partial unique index.
- `pnpm tsc --noEmit` passes from `apps/web` (no type errors after Prisma client regeneration).
- Confirm in Supabase: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'driver_settlements';` shows `ds_unique_period_active` with `WHERE` clause.
  </verify>
  <done>
Partial unique index `ds_unique_period_active` exists in Supabase. Schema.prisma reflects the manual index via comment. Re-generating a settlement for a driver+period that has a VOIDED prior settlement succeeds (no unique-violation error).
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix void route — reset pay_status to APPROVED + broaden RBAC to MANAGER</name>
  <files>apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts</files>
  <action>
Edit `apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts`. Two surgical changes — DO NOT rewrite the file.

**Change 1 — Broaden RBAC (line ~44-50):**
The current check rejects MANAGER. Update to allow OWNER, MANAGER, and SYSTEM_ADMIN:

```ts
// 2. RBAC — OWNER, MANAGER, SYSTEM_ADMIN only
const role = session.role.toUpperCase();
if (
  role !== UserRole.OWNER &&
  role !== UserRole.MANAGER &&
  role !== UserRole.SYSTEM_ADMIN
) {
  return NextResponse.json(
    { error: 'Only owners and managers can void settlements.' },
    { status: 403 },
  );
}
```

**Change 2 — Reset payStatus on released assignments (line ~151-154):**
The current `updateMany` only clears `settlementId`. Update it to also revert `payStatus` back to `'APPROVED'` so the assignments become eligible for inclusion in a new settlement:

```ts
prisma.loadDriverAssignment.updateMany({
  where: { settlementId },
  data: {
    settlementId: null,
    payStatus: 'APPROVED',
  },
}),
```

Do not touch:
- The deduction `amountCollected` decrement loop (Gap 3 — already correct).
- The audit log write (already correct).
- The `_deductionsApplied` snapshot parsing.
- The bonus release (already correct).
- The PAID-cannot-void 409 guard.

The file uses `payStatus` as a string literal in other server code; verify the type accepts `'APPROVED'` by reading the `LoadDriverAssignment` model in schema.prisma to confirm `payStatus` is a string-backed enum that includes `APPROVED`. If TypeScript complains, cast to the generated enum (e.g. `PayStatus.APPROVED` or `'APPROVED' as any` only as a last resort — prefer the typed enum import from `@/generated/prisma`).
  </action>
  <verify>
- `apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts` RBAC check accepts MANAGER.
- `loadDriverAssignment.updateMany` data block includes both `settlementId: null` and `payStatus: 'APPROVED'`.
- `pnpm tsc --noEmit` passes from `apps/web`.
- Functional test (manual or curl):
  1. Generate a DRAFT settlement.
  2. POST `/api/driver-pay/settlements/{id}/void` with `{ "reason": "test void cascade" }` as a MANAGER user → returns 200.
  3. Query Supabase: `SELECT settlement_id, pay_status FROM load_driver_assignments WHERE id = ...` → settlement_id IS NULL AND pay_status = 'APPROVED'.
  4. Voiding a PAID settlement still returns 409.
  </verify>
  <done>
Void route correctly resets pay_status to APPROVED on released assignments and accepts MANAGER role. PAID guard still works. amountCollected decrement and audit log unchanged and still functioning.
  </done>
</task>

<task type="auto">
  <name>Task 3: Unify Deductions section in SettlementDetailView (per-load + recurring)</name>
  <files>
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
  </files>
  <action>
**Part A — Server page (`[settlementId]/page.tsx`):**
Compute a unified `deductionsView` array on the server before passing to the client component. Walk every assignment, collect any `payComponents` where `category === 'DEDUCTION'`, and merge with the existing `deductionsApplied` (recurring) array.

After the existing `deductionsApplied` block (~line 82), add:

```ts
type UnifiedDeduction = {
  key: string;
  source: 'per-load' | 'recurring';
  label: string;
  subLabel: string | null;
  amount: string; // positive string e.g. "150.00"
};

const perLoadDeductions: UnifiedDeduction[] = settlement.assignments.flatMap((a) =>
  a.payComponents
    .filter((c) => c.category === 'DEDUCTION')
    .map((c) => ({
      key: `pc-${c.id}`,
      source: 'per-load' as const,
      label: c.description,
      subLabel: `Load #${a.load?.referenceNumber ?? a.loadId.slice(0, 8)}`,
      amount: new Decimal(c.grossAmount.toString()).abs().toFixed(2),
    })),
);

const recurringDeductions: UnifiedDeduction[] = deductionsApplied.map((d) => {
  const ded = d.deduction as { id: string; deductionType: string; schedule: string };
  return {
    key: `dd-${ded.id}`,
    source: 'recurring' as const,
    label: ded.deductionType,
    subLabel: ded.schedule,
    amount: new Decimal(d.appliedAmount).abs().toFixed(2),
  };
});

const deductionsView = [...perLoadDeductions, ...recurringDeductions];
```

Pass `deductionsView` as a new prop (do NOT remove `deductionsApplied` — keep it for backwards compatibility of any other consumer, but actually no other consumer exists, so optionally remove the prop entirely from the component once you've updated SettlementDetailView). Cleanest: replace `deductionsApplied` prop with `deductions` (new shape).

**Part B — Client (`SettlementDetailView.tsx`):**
1. Replace the `DeductionApplied` interface and `deductionsApplied` prop with:

```ts
interface UnifiedDeduction {
  key: string;
  source: 'per-load' | 'recurring';
  label: string;
  subLabel: string | null;
  amount: string;
}

interface Props {
  settlement: Settlement;
  driver: Driver | null;
  assignments: Assignment[];
  bonuses: Bonus[];
  deductions: UnifiedDeduction[]; // unified list
  anomaly: AnomalyResult;
}
```

2. Replace the existing Deductions card (lines 557-581) with a unified render. Each row shows label, a small "Per-Load" or "Recurring" badge, optional subLabel (load reference or schedule), and amount in red prefixed with `-`. Render the card only when `deductions.length > 0`. Example:

```tsx
{deductions.length > 0 && (
  <Card>
    <CardContent className="pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Deductions
      </h2>
      <div className="space-y-2">
        {deductions.map((d) => (
          <div key={d.key} className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs py-0">
                {d.source === 'per-load' ? 'Per-Load' : 'Recurring'}
              </Badge>
              <span>{d.label}</span>
              {d.subLabel && (
                <span className="text-xs text-muted-foreground">({d.subLabel})</span>
              )}
            </div>
            <span className="font-medium text-red-600 dark:text-red-400">
              -{formatMoney(d.amount)}
            </span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

3. **Remove the duplicate DEDUCTION row inside the per-load `CollapsibleContent`** (lines ~497-518). Currently each per-load card already shows DEDUCTION components inline in the Load Breakdown section, which now duplicates the unified Deductions card. Filter them out of the inner render — only show non-DEDUCTION pay components in the load card, e.g.:

```tsx
{a.payComponents
  .filter((c) => c.category !== 'DEDUCTION')
  .map((c) => ( /* existing row */ ))}
```

This avoids double-counting visually. The Load Breakdown still shows LINEHAUL/FSC/DETENTION/BONUS components per load.

4. Decimal sanity: do NOT do client-side sum-checks. The Pay Summary `totalDeductions` already comes from the server's reconciled value. The visible sum of the unified Deductions section should match `settlement.totalDeductions` because both per-load DEDUCTION components and recurring deductions are what compose that total on the server (per generation logic).

**Money math:** Use `decimal.js` `Decimal` on the server for any abs/format. The client just formats string amounts with `formatMoney`.
  </action>
  <verify>
- `apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx` builds `deductionsView` array combining per-load DEDUCTION pay components and recurring deductions; passes it as `deductions` prop.
- `apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx` renders unified Deductions card with "Per-Load" / "Recurring" badge per row.
- Load Breakdown collapsible no longer shows DEDUCTION pay components (filtered out).
- `pnpm tsc --noEmit` passes from `apps/web`.
- Visual test in browser: Open a settlement detail page that has at least one per-load DEDUCTION component (e.g. CHARGEBACK) AND a recurring deduction. The Deductions card shows both with correct labels and sub-labels. Sum visually matches Pay Summary "Total Deductions".
  </verify>
  <done>
Settlement detail page unifies per-load and recurring deductions in one section with a type indicator. Per-load deductions no longer appear inside the Load Breakdown collapsibles (no double-display). Sum of displayed deductions equals the Pay Summary Total Deductions row.
  </done>
</task>

</tasks>

<verification>
End-to-end smoke test:
1. Pick an existing VOIDED settlement (or void one for testing) — confirm a new settlement can be generated for the same driver+period (Gap 1 closed).
2. Generate a DRAFT settlement → void it as a MANAGER user → confirm:
   - Released assignments have `settlement_id = NULL` AND `pay_status = 'APPROVED'` (Gap 2)
   - Released bonuses have `settlement_id = NULL` (Gap 2, already worked)
   - `driver_deductions.amount_collected` for any deduction in the snapshot is decremented (Gap 3)
   - A row exists in `driver_pay_audit_log` with `action = 'settlement:voided'` (Gap 2)
3. Open a settlement detail page that has both per-load DEDUCTION components (CHARGEBACK etc.) and recurring deductions — Deductions section shows both with type indicators (Gap 4); sum matches Pay Summary Total Deductions.

Run `pnpm tsc --noEmit` from `apps/web` — must pass clean before deploying.
</verification>

<success_criteria>
- Migration `20260513000001_driver_pay_phase8_partial_unique` applied to Supabase, partial unique index `ds_unique_period_active` exists.
- `apps/web/prisma/schema.prisma` no longer declares the blanket `@@unique` on DriverSettlement; schema comment documents the manual partial index.
- Void route handler accepts MANAGER role and resets `pay_status = 'APPROVED'` on released assignments inside the existing `$transaction`.
- Settlement detail page renders a single, unified Deductions card showing both per-load and recurring deductions with "Per-Load" / "Recurring" type indicators.
- Load Breakdown collapsibles no longer display DEDUCTION pay components.
- `pnpm tsc --noEmit` passes clean from `apps/web`.
- Manual test: re-generation after void works without unique violation. Void cascade releases assignments to APPROVED. UI deductions sum reconciles to Pay Summary Total Deductions.
</success_criteria>

<output>
After completion, create `.planning/quick/305-close-four-phase-8-cleanup-gaps-partial-/305-SUMMARY.md` summarizing:
- Migration file path
- Schema comment added
- Two specific changes to void route (RBAC + payStatus)
- Server-side `deductionsView` shape and client component prop change
- Any TypeScript or test fallout encountered
- Confirmation that Supabase index `ds_unique_period_active` exists with the WHERE clause
</output>
