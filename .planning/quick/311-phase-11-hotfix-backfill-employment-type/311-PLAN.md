---
phase: quick
plan: "311"
type: execute
wave: 1
depends_on: ["310"]
files_modified:
  - apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx
  - apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts
autonomous: false

must_haves:
  truths:
    - "Existing FINALIZED+PAID settlements on demoteam have employment_type_snapshot populated"
    - "Export Payroll modal counts only FINALIZED+PAID settlements with a snapshot and deleted_at IS NULL"
    - "VOIDED settlements are excluded from the export count"
    - "Modal confirm string shows count, total amount, format, and correct pluralization"
    - "PAID settlements are NOT modified (immutable)"
  artifacts:
    - path: "apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql"
      provides: "Idempotent retry of employment_type_snapshot backfill"
      contains: "WHERE employment_type_snapshot IS NULL AND status IN ('FINALIZED','PAID') AND deleted_at IS NULL"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx"
      provides: "Server-side eligible settlement IDs + total computed via decimal.js"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx"
      provides: "Confirm string with count, total, format, correct pluralization"
    - path: "apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts"
      provides: "Regression test for eligibility filter + modal confirm string"
  key_links:
    - from: "settlements/page.tsx"
      to: "ExportPayrollButton"
      via: "eligibleSettlementIds + eligibleTotalCents props"
      pattern: "eligibleSettlementIds=\\{"
    - from: "ExportPayrollButton"
      to: "ExportPayrollModal"
      via: "eligibleSettlementIds + eligibleTotal props"
      pattern: "eligibleTotal="
---

<objective>
Close two Phase 11 (quick-310) hotfix bugs:
1. Backfill of `DriverSettlement.employment_type_snapshot` did not populate existing FINALIZED+PAID rows on demoteam production. A PAID settlement ($641.13, period May 9-15) has NULL snapshot, blocking export with "Re-finalize them" — but PAID is immutable, so this is a dead-end.
2. The Export Payroll modal counts ALL shown settlements (including VOIDED), reporting "Export 2 settlements" when one is VOIDED. Eligibility must be FINALIZED+PAID only with `deleted_at IS NULL` AND `employment_type_snapshot IS NOT NULL`.

Purpose: Unblock payroll export on demoteam without re-finalizing PAID settlements. Make the modal honest about what will actually be exported.
Output: New idempotent backfill migration applied via Supabase MCP; eligibility computed server-side; modal shows accurate count + total.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/310-driver-pay-phase-11-payroll-export-gener/310-SUMMARY.md
@apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql
@apps/web/src/app/api/reports/payroll-export/route.ts
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx
@apps/web/src/lib/driver-pay/snapshot.ts
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Diagnose demoteam state + apply idempotent backfill retry migration via Supabase MCP</name>
  <files>apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql</files>
  <action>
    Step A — Diagnose (via Supabase MCP `execute_sql`):
    Run this query and report raw rows:

    ```sql
    SELECT
      ds.id,
      ds.settlement_reference,
      ds.status,
      ds.period_start,
      ds.period_end,
      ds.net_pay,
      ds.employment_type_snapshot,
      ds.finalized_at,
      ds.created_at,
      ds.deleted_at,
      dct.id AS template_id,
      dct.employment_type AS template_employment_type,
      dct.effective_from,
      dct.effective_to
    FROM driver_settlements ds
    JOIN tenants t ON t.id = ds.tenant_id
    LEFT JOIN driver_compensation_templates dct
      ON dct.driver_id = ds.driver_id
     AND dct.tenant_id = ds.tenant_id
     AND dct.effective_from <= COALESCE(ds.finalized_at, ds.created_at)
     AND (dct.effective_to IS NULL OR dct.effective_to >= COALESCE(ds.finalized_at, ds.created_at))
    WHERE t.slug = 'demoteam'
    ORDER BY ds.created_at DESC;
    ```

    Step B — Diagnose root cause. Compare the Phase 11 migration (apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql) against actual rows. Determine cause:
    - (a) SQL never executed (column exists but NO rows updated despite matching templates)
    - (b) WHERE clause too narrow (rows excluded by status/deleted_at filter)
    - (c) Template lookup join failed (no matching template found for date range — possible date type mismatch between timestamp and date)

    STOP and surface findings if cause is none of (a)/(b)/(c). Otherwise proceed.

    Step C — Write new idempotent migration file at:
    `apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql`

    Contents:
    ```sql
    -- Phase 11 hotfix (quick-311): retry backfill of employment_type_snapshot
    -- Idempotent — only updates rows where snapshot is still NULL.
    -- PAID rows are mutated ONLY in this snapshot column (immutability of pay math preserved).

    UPDATE driver_settlements ds
    SET employment_type_snapshot = sub.employment_type
    FROM (
      SELECT DISTINCT ON (ds2.id)
        ds2.id AS settlement_id,
        dct.employment_type
      FROM driver_settlements ds2
      JOIN driver_compensation_templates dct
        ON dct.driver_id = ds2.driver_id
       AND dct.tenant_id = ds2.tenant_id
       AND dct.effective_from <= COALESCE(ds2.finalized_at, ds2.created_at)
       AND (dct.effective_to IS NULL
            OR dct.effective_to >= COALESCE(ds2.finalized_at, ds2.created_at))
       AND dct.deleted_at IS NULL
      WHERE ds2.status IN ('FINALIZED', 'PAID')
        AND ds2.deleted_at IS NULL
        AND ds2.employment_type_snapshot IS NULL
      ORDER BY ds2.id, dct.effective_from DESC
    ) sub
    WHERE ds.id = sub.settlement_id
      AND ds.employment_type_snapshot IS NULL
      AND ds.status IN ('FINALIZED', 'PAID')
      AND ds.deleted_at IS NULL;

    -- Fallback for settlements whose template lookup failed via date range:
    -- if any non-VOIDED, non-deleted settlement still has NULL snapshot AND the driver has
    -- exactly ONE active compensation template (effective_to IS NULL), use that.
    UPDATE driver_settlements ds
    SET employment_type_snapshot = dct.employment_type
    FROM driver_compensation_templates dct
    WHERE ds.driver_id = dct.driver_id
      AND ds.tenant_id = dct.tenant_id
      AND dct.effective_to IS NULL
      AND dct.deleted_at IS NULL
      AND ds.employment_type_snapshot IS NULL
      AND ds.status IN ('FINALIZED', 'PAID')
      AND ds.deleted_at IS NULL
      AND (
        SELECT COUNT(*) FROM driver_compensation_templates dct2
        WHERE dct2.driver_id = ds.driver_id
          AND dct2.tenant_id = ds.tenant_id
          AND dct2.effective_to IS NULL
          AND dct2.deleted_at IS NULL
      ) = 1;
    ```

    Step D — Apply via Supabase MCP `apply_migration` with name `backfill_employment_type_snapshot_retry`.

    Step E — Re-run Step A query, confirm:
    - All demoteam FINALIZED+PAID rows with `deleted_at IS NULL` now have non-NULL `employment_type_snapshot`
    - VOIDED and soft-deleted rows untouched
    - All net_pay values unchanged (no pay math mutation)

    Report final raw rows.

    Do NOT use the migration tool to rebuild prisma client — schema is unchanged, only data backfilled.
  </action>
  <what-built>
    New migration file + idempotent backfill applied to demoteam Supabase. Diagnosis report on why the original Phase 11 backfill missed rows.
  </what-built>
  <how-to-verify>
    1. User confirms diagnosis report identifies one of (a)/(b)/(c) as root cause.
    2. User confirms post-backfill query shows: the $641.13 PAID settlement (period May 9-15) now has employment_type_snapshot = 'W2_EMPLOYEE' or 'OWNER_OPERATOR_1099' (not NULL).
    3. User confirms VOIDED settlement still has employment_type_snapshot unchanged (whatever it was — backfill must not touch VOIDED).
    4. User confirms net_pay on the PAID settlement is still $641.13 (no pay math mutation).
  </how-to-verify>
  <verify>Migration file exists at apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql; Supabase MCP returned success on apply_migration; verification query shows all eligible demoteam rows have non-NULL snapshot.</verify>
  <done>Demoteam production no longer has FINALIZED+PAID settlements with NULL employment_type_snapshot. Migration is idempotent (safe to re-run).</done>
  <resume-signal>Type "approved" once you've reviewed the diagnosis and confirmed the backfill query shows no remaining NULL snapshots on FINALIZED+PAID rows.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Server-side eligibility filter + total in settlements page</name>
  <files>
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
  </files>
  <action>
    In `settlements/page.tsx`:

    1. Replace the prop passed to `<ExportPayrollButton settlementIds={settlements.map((s) => s.id)} />` with a server-computed eligibility query AFTER the existing `findMany`/`count` calls. Use a separate `prisma.driverSettlement.findMany` keyed on the SAME `where` filter chain that powers the list (so it respects driver/period filters) BUT additionally requires:
       - `status: { in: ['FINALIZED', 'PAID'] }`
       - `deletedAt: null`
       - `employmentTypeSnapshot: { not: null }`

    Select only `{ id: true, netPay: true }`. Do NOT apply `skip`/`take` — eligibility spans the entire filtered set, not just the current page.

    2. Compute the total via decimal.js:
       ```ts
       import Decimal from 'decimal.js';
       // ...
       const eligibleTotal = eligible.reduce(
         (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
         new Decimal(0),
       ).toFixed(2);
       const eligibleSettlementIds = eligible.map((s) => s.id);
       ```

    3. Pass new props:
       ```tsx
       <ExportPayrollButton
         eligibleSettlementIds={eligibleSettlementIds}
         eligibleTotal={eligibleTotal}
       />
       ```

    In `ExportPayrollButton.tsx`:

    4. Replace `settlementIds` prop with two props: `eligibleSettlementIds: string[]` and `eligibleTotal: string` (decimal string like "641.13"). Forward both to `<ExportPayrollModal>`. Keep `disabled={eligibleSettlementIds.length === 0}`.

    Why decimal.js: Phase 11 already uses decimal.js for all pay math. Floating-point sum of net_pay would drift on large settlement counts. The total flows into a confirmation UI string only, but consistency with existing pay-math practice prevents future re-use bugs.

    Why server-side filter (not client filter): client-side filter could be bypassed by stale props, and the count must match what the API would actually export. Server is the source of truth.

    Do NOT touch the four exporter implementations, finalize route, or the payroll-export route's own eligibility check (route already filters by `deletedAt: null` and rejects DRAFT/missing-snapshot — that defense-in-depth stays).
  </action>
  <verify>
    Run `npx tsc --noEmit -p apps/web/tsconfig.json` from repo root → 0 errors.
    Grep confirms ExportPayrollButton receives `eligibleSettlementIds` (not `settlementIds`).
    Manual: load /carrier/driver-pay/settlements as owner — button label still "Export Payroll", count of disabled state correct (button disabled when no FINALIZED+PAID-with-snapshot rows visible).
  </verify>
  <done>
    Settlements page computes eligible IDs server-side (FINALIZED+PAID, deleted_at IS NULL, snapshot IS NOT NULL).
    VOIDED, DRAFT, soft-deleted, and snapshot-NULL settlements excluded.
    Total computed via decimal.js as a decimal string with 2 fractional digits.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update ExportPayrollModal confirm string with total + correct pluralization</name>
  <files>apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx</files>
  <action>
    1. Change props interface:
       ```ts
       interface ExportPayrollModalProps {
         open: boolean;
         onOpenChange: (open: boolean) => void;
         eligibleSettlementIds: string[];
         eligibleTotal: string; // decimal string like "641.13"
       }
       ```

    2. Replace the `confirmText` line. New format:
       ```ts
       const count = eligibleSettlementIds.length;
       const noun = count === 1 ? 'settlement' : 'settlements';
       const confirmText = `Export ${count} ${noun} totaling $${eligibleTotal} in ${FORMAT_LABELS[format]}?`;
       ```

    3. Update the read-only summary paragraph (line ~151) to match:
       ```tsx
       <p className="text-sm text-muted-foreground">
         Exporting {count} {noun} totaling ${eligibleTotal}
       </p>
       ```

    4. Update `handleDownload` to use `eligibleSettlementIds` instead of `settlementIds` in both the POST body and the disabled check (`disabled={isLoading || count === 0}` on the Download button).

    5. Remove references to the old `settlementIds` prop everywhere in the file.

    Format the total with a US thousands separator only if simple to do without an external dep. If not trivial, leave as-is — `eligibleTotal` is already pre-formatted to 2 decimals server-side, plain dollar prefix is acceptable for this hotfix.

    Do NOT change format options, employment-type options, error-handling for 422 draftIds (this remains as defense-in-depth), or the download/blob flow.
  </action>
  <verify>
    `npx tsc --noEmit -p apps/web/tsconfig.json` → 0 errors.
    Grep `grep -n "eligibleSettlementIds\|eligibleTotal\|totaling" ExportPayrollModal.tsx` shows all 3 references.
    Grep `grep -n "settlementIds.length\|settlementIds\\[" ExportPayrollModal.tsx` returns 0 hits for the old prop name.
  </verify>
  <done>
    Modal title/description renders: "Export 1 settlement totaling $641.13 in Generic CSV?" for count=1.
    For count=3 with total $2,000.00: "Export 3 settlements totaling $2000.00 in Generic CSV?".
    Button disabled when count=0.
  </done>
</task>

<task type="auto">
  <name>Task 4: Regression test for eligibility filter + modal confirm string</name>
  <files>apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts</files>
  <action>
    Create a new vitest file. Two test cases — one for the server-side eligibility query, one for the modal confirm string. Use the same prisma-mocking pattern as `payroll-export-rbac.test.ts`.

    Fixtures (NO real names — use "Driver Alpha", "Driver Beta", etc.):
    - Settlement A: status=PAID, deletedAt=null, employmentTypeSnapshot='W2_EMPLOYEE', netPay=Decimal('500.00')
    - Settlement B: status=VOIDED, deletedAt=null, employmentTypeSnapshot='W2_EMPLOYEE', netPay=Decimal('200.00')
    - Settlement C: status=PAID, deletedAt=null, employmentTypeSnapshot=null, netPay=Decimal('300.00')
    - Settlement D: status=FINALIZED, deletedAt=null, employmentTypeSnapshot='OWNER_OPERATOR_1099', netPay=Decimal('141.13')
    - Settlement E: status=PAID, deletedAt=new Date(), employmentTypeSnapshot='W2_EMPLOYEE', netPay=Decimal('999.00')

    Test 1 — "eligibility filter excludes VOIDED, NULL-snapshot, and soft-deleted":
    Replicate the Prisma `where` clause used in settlements/page.tsx. Mock `prisma.driverSettlement.findMany` to assert it is called with:
    ```ts
    {
      where: expect.objectContaining({
        status: { in: ['FINALIZED', 'PAID'] },
        deletedAt: null,
        employmentTypeSnapshot: { not: null },
      }),
      select: { id: true, netPay: true },
    }
    ```
    Given mock returns [A, D] (filter applied), assert:
    - `eligibleSettlementIds` = [A.id, D.id]
    - `eligibleTotal` (computed via decimal.js, .toFixed(2)) = "641.13"

    Extract the eligibility logic into either an exported helper or duplicate the small reduce in the test — whichever is simpler. If page.tsx is hard to import (server component), create a tiny exported helper `computeExportEligibility(rows: Array<{id: string; netPay: Decimal}>): { ids: string[]; total: string }` in a sibling file (e.g., `apps/web/src/app/(owner)/carrier/driver-pay/settlements/_lib/export-eligibility.ts`) and use it from both page.tsx and the test. Note: if you add this helper file, also add it to the plan's files_modified (the orchestrator's git commit step will pick up untracked files).

    Test 2 — "modal confirm string with count=1":
    Pure function test. Either extract a `buildConfirmText(count: number, total: string, formatLabel: string): string` helper from the modal OR inline-replicate the format string in the test. Assert:
    - count=1, total="641.13", formatLabel="Generic CSV" → "Export 1 settlement totaling $641.13 in Generic CSV?"
    - count=3, total="2000.00", formatLabel="ADP" → "Export 3 settlements totaling $2000.00 in ADP?"
    - count=0, total="0.00", formatLabel="QuickBooks" → "Export 0 settlements totaling $0.00 in QuickBooks?"

    Run `npx vitest run apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts` → all tests pass.
  </action>
  <verify>
    `npx vitest run apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts` → all tests pass.
    `npx tsc --noEmit -p apps/web/tsconfig.json` → 0 errors.
  </verify>
  <done>
    Regression test pinning eligibility filter (FINALIZED+PAID, deletedAt null, snapshot not null) and modal confirm string format (singular vs plural, total formatting).
    Test uses fixture names like "Driver Alpha" — no real names.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` → 0 errors
- `npx vitest run apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts` → all tests pass
- Supabase MCP verification query (from Task 1, Step E) shows no FINALIZED+PAID rows with NULL employment_type_snapshot on demoteam
- Manual smoke (optional): hit /carrier/driver-pay/settlements on demoteam as owner, click Export Payroll, confirm modal shows "Export 1 settlement totaling $641.13 in Generic CSV?" (VOIDED row excluded)
- Existing tests still pass: `npx vitest run apps/web/src/app/api/driver-pay/__tests__/payroll-export-rbac.test.ts apps/web/src/app/api/driver-pay/__tests__/payroll-export-audit.test.ts`
</verification>

<success_criteria>
- [ ] Diagnosis report identifies root cause (a/b/c) of Phase 11 backfill miss
- [ ] New idempotent migration applied via Supabase MCP, demoteam's $641.13 PAID settlement has non-NULL snapshot
- [ ] VOIDED settlements untouched by backfill
- [ ] Eligibility query computed server-side in settlements/page.tsx (FINALIZED+PAID, deleted_at null, snapshot not null)
- [ ] Total computed via decimal.js, passed to modal as decimal string
- [ ] Modal renders "Export N settlement(s) totaling $X.XX in [Format]?" with correct pluralization
- [ ] VOIDED no longer counted; "Export 2 settlements" bug is gone
- [ ] Regression test passes
- [ ] tsc --noEmit clean
- [ ] PAID settlement pay math (net_pay, line items) unchanged — only employment_type_snapshot mutated
- [ ] "Re-finalize them" path no longer needed for backfilled rows
</success_criteria>

<output>
After completion, create `.planning/quick/311-phase-11-hotfix-backfill-employment-type/311-SUMMARY.md` documenting:
- Root cause diagnosis (which of a/b/c)
- Migration filename + idempotent strategy
- Eligibility filter location (page.tsx + optional helper file)
- Modal string format with examples
- Regression test coverage
</output>
