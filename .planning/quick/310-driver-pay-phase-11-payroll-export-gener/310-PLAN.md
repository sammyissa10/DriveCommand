---
phase: quick
plan: "310"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql
  - apps/web/src/lib/driver-pay/state-machine.ts
  - apps/web/src/lib/driver-pay/exporters/index.ts
  - apps/web/src/lib/driver-pay/exporters/generic-csv.ts
  - apps/web/src/lib/driver-pay/exporters/quickbooks.ts
  - apps/web/src/lib/driver-pay/exporters/adp.ts
  - apps/web/src/lib/driver-pay/exporters/gusto.ts
  - apps/web/src/lib/driver-pay/exporters/README.md
  - apps/web/src/app/api/reports/payroll-export/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx
  - apps/web/src/lib/driver-pay/__tests__/exporters/generic-csv.golden.test.ts
  - apps/web/src/lib/driver-pay/__tests__/exporters/quickbooks.golden.test.ts
  - apps/web/src/lib/driver-pay/__tests__/exporters/adp.golden.test.ts
  - apps/web/src/lib/driver-pay/__tests__/exporters/gusto.golden.test.ts
  - apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/
  - apps/web/src/app/api/driver-pay/__tests__/payroll-export-rbac.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/payroll-export-audit.test.ts
autonomous: true

must_haves:
  truths:
    - "DriverSettlement rows have an immutable employment_type_snapshot stamped at FINALIZED"
    - "ADMIN can request a payroll export filtered by settlement IDs + format + employmentType (W2 / 1099 / Both)"
    - "Each of the 4 formats produces a downloadable file whose bytes are deterministic and golden-file-tested"
    - "W-2 and 1099 settlements never appear in the same single-format export file (split is enforced by employment_type_snapshot)"
    - 'Selecting "Both" produces a zip with two separate files (one per employment type)'
    - "Any DRAFT settlement in the requested set blocks the export with HTTP 422 (must finalize first)"
    - "Non-ADMIN roles (OWNER, MANAGER, DRIVER) get HTTP 403"
    - "Each successful export writes exactly one driver_pay_audit_logs row with format + settlement IDs + employment split"
    - "Export response is streamed (chunked Readable), never buffers the full file in memory"
    - "All money math in every exporter uses decimal.js (no native float arithmetic)"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "DriverSettlement.employmentTypeSnapshot enum field"
      contains: "employmentTypeSnapshot"
    - path: "apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql"
      provides: "ALTER TABLE + backfill from DriverCompensationTemplate effective at finalized_at"
    - path: "apps/web/src/lib/driver-pay/exporters/index.ts"
      provides: "Exporter interface, ExportFormat enum, registry function"
      exports: ["Exporter", "ExportFormat", "getExporter"]
    - path: "apps/web/src/lib/driver-pay/exporters/generic-csv.ts"
      provides: "Generic CSV exporter implementation"
      exports: ["genericCsvExporter"]
    - path: "apps/web/src/lib/driver-pay/exporters/quickbooks.ts"
      provides: "QuickBooks exporter (format documented in header comment)"
      exports: ["quickbooksExporter"]
    - path: "apps/web/src/lib/driver-pay/exporters/adp.ts"
      provides: "ADP CSV exporter"
      exports: ["adpExporter"]
    - path: "apps/web/src/lib/driver-pay/exporters/gusto.ts"
      provides: "Gusto CSV exporter"
      exports: ["gustoExporter"]
    - path: "apps/web/src/lib/driver-pay/exporters/README.md"
      provides: "Per-format spec source URLs, verified columns, TODO unverified columns, sandbox import status"
    - path: "apps/web/src/app/api/reports/payroll-export/route.ts"
      provides: "POST endpoint — ADMIN-only, Zod-validated, streams Readable response"
      exports: ["POST"]
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx"
      provides: "Button mounted in settlements list header (opens modal)"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx"
      provides: "Pattern E modal — format select + employmentType radio + Download trigger"
  key_links:
    - from: "apps/web/src/lib/driver-pay/state-machine.ts"
      to: "DriverSettlement.employmentTypeSnapshot"
      via: "FINALIZED transition writes snapshot atomically"
      pattern: "employmentTypeSnapshot.*FINALIZED|finalize.*employmentTypeSnapshot"
    - from: "apps/web/src/app/api/reports/payroll-export/route.ts"
      to: "apps/web/src/lib/driver-pay/exporters/index.ts"
      via: "getExporter(format) -> Exporter.build(settlements)"
      pattern: "getExporter|exporter\\.build"
    - from: "apps/web/src/app/api/reports/payroll-export/route.ts"
      to: "DriverPayAuditLog"
      via: "prisma.driverPayAuditLog.create on success"
      pattern: "driverPayAuditLog\\.create"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx"
      to: "ExportPayrollButton"
      via: "Header mount alongside Generate Settlements button"
      pattern: "ExportPayrollButton"
---

<objective>
Driver Pay Phase 11 — Payroll Export. Produce deterministic, golden-file-tested CSV/IIF exports for 4 payroll providers (Generic CSV, QuickBooks, ADP, Gusto). W-2 employees and 1099 owner-operators export separately, gated on a settlement-time employment_type_snapshot so future driver tax-status changes never rewrite history. ADMIN-only, streaming response, auditable.

Purpose: Final phase of Driver Pay (phases 1-10 shipped). Carriers can now hand off finalized settlements to their actual payroll provider with zero hand-editing.
Output: Schema + migration, state-machine snapshot write, exporter library (interface + 4 impls + README), API route, UI button + modal, golden + RBAC + audit tests.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/DriverPay_TechnicalSpec_v4.md
@.planning/quick/304-driver-pay-phase-8-settlement-generation/304-SUMMARY.md
@.planning/quick/307-driver-pay-phase-10-read-only-reporting-/307-SUMMARY.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/driver-pay/state-machine.ts
@apps/web/src/lib/driver-pay/settlement-generator.ts
@apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + migration + state-machine snapshot wiring</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql
    apps/web/src/lib/driver-pay/state-machine.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
    apps/web/src/lib/driver-pay/__tests__/state-machine.finalize.snapshot.test.ts
  </files>
  <action>
    Add `employmentTypeSnapshot` to `DriverSettlement` and wire it into the FINALIZED transition.

    1. **Schema** — In `apps/web/prisma/schema.prisma`, in the `DriverSettlement` model (around line 2767), add:
       ```
       employmentTypeSnapshot EmploymentType? @map("employment_type_snapshot")
       ```
       Place it directly after `notes`, before the `// Standard tenant columns` block. Keep nullable for backfill safety; FINALIZED rows from now on will always populate it.

    2. **Migration** — Create `apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql`:
       ```sql
       -- Phase 11: payroll export employment-type snapshot
       ALTER TABLE driver_settlements
         ADD COLUMN employment_type_snapshot "EmploymentType";

       -- Backfill existing FINALIZED and PAID rows from the DriverCompensationTemplate
       -- effective at finalized_at (or created_at if finalized_at is null).
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
         WHERE ds2.status IN ('FINALIZED', 'PAID')
         ORDER BY ds2.id, dct.effective_from DESC
       ) sub
       WHERE ds.id = sub.settlement_id
         AND ds.employment_type_snapshot IS NULL;

       CREATE INDEX IF NOT EXISTS driver_settlements_employment_snapshot_idx
         ON driver_settlements(tenant_id, employment_type_snapshot)
         WHERE employment_type_snapshot IS NOT NULL;
       ```
       The migration hook will auto-apply via Supabase MCP. If the hook misses, apply manually via Supabase MCP.

    3. **Prisma generate** — Run from repo root:
       ```
       cd apps/web && npx prisma generate
       ```

    4. **Finalize route wiring** — In `apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts`, modify the `prisma.driverSettlement.update` call (currently around line 155) to compute and write `employmentTypeSnapshot` inside the same update.

       Logic: BEFORE the update, fetch the active `DriverCompensationTemplate` for `settlement.driverId` where `effectiveFrom <= now()` and (`effectiveTo IS NULL OR effectiveTo >= now()`). Order by `effectiveFrom DESC` and take the first row. Pass `employmentTypeSnapshot: template.employmentType` into the update data.

       If no active template found (defensive — should not happen since Phase 6 requires a template), throw a 409 with message `'Cannot finalize: driver has no active compensation template'`.

       Also extend the audit log `newValue` to include `employmentTypeSnapshot`.

       NOTE: spec says "modify state-machine.ts" but the actual DB write for settlement.FINALIZED lives in the finalize route (state-machine.ts only handles per-component PayStatus transitions — confirmed by grep). Add a clarifying comment at top of `state-machine.ts` noting that settlement-status transitions live in the finalize/mark-paid/void route handlers, not here. Do not refactor state-machine.ts beyond the comment.

    5. **Unit test** — Create `apps/web/src/lib/driver-pay/__tests__/state-machine.finalize.snapshot.test.ts`. Mock `prisma` and assert that a FINALIZE flow on a driver with `employmentType: 'W2_EMPLOYEE'` in their active template results in `driverSettlement.update` being called with `employmentTypeSnapshot: 'W2_EMPLOYEE'`. Add a second case for `OWNER_OPERATOR_1099`. Tests should mock the route's prisma chain — follow the mocking pattern in `settlements-finalize.test.ts`.

    Constraints:
    - DO NOT touch any other transition (DRAFT->FINALIZED logic only)
    - DO NOT modify DriverCompensationTemplate.employmentType — it is already correct
    - Once nullable column is backfilled, future migration (out of scope) can make it NOT NULL
    - `tsc --noEmit` must be clean (cd apps/web && npx tsc --noEmit)
  </action>
  <verify>
    cd apps/web && npx prisma generate
    cd apps/web && npx tsc --noEmit
    cd apps/web && npx vitest run src/lib/driver-pay/__tests__/state-machine.finalize.snapshot.test.ts
    cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/settlements-finalize.test.ts  # existing finalize tests must still pass
    Supabase MCP: SELECT column_name FROM information_schema.columns WHERE table_name='driver_settlements' AND column_name='employment_type_snapshot';  # must return one row
  </verify>
  <done>
    employment_type_snapshot column exists on driver_settlements; backfill ran without errors; finalize route writes the snapshot from the active DriverCompensationTemplate; both new snapshot unit tests pass; all existing settlements-finalize tests still pass; tsc --noEmit clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Exporter library (interface + 4 implementations + README)</name>
  <files>
    apps/web/src/lib/driver-pay/exporters/index.ts
    apps/web/src/lib/driver-pay/exporters/generic-csv.ts
    apps/web/src/lib/driver-pay/exporters/quickbooks.ts
    apps/web/src/lib/driver-pay/exporters/adp.ts
    apps/web/src/lib/driver-pay/exporters/gusto.ts
    apps/web/src/lib/driver-pay/exporters/README.md
  </files>
  <action>
    Build the exporter abstraction and 4 concrete implementations. All money math uses `decimal.js`. All four exporters return a Node `Readable` stream (use `node:stream` Readable.from on a generator).

    1. **`exporters/index.ts`** — Define:
       ```ts
       import type { Readable } from 'node:stream';
       import type { DriverSettlement, LoadPayComponent, CarrierDriver, DriverBonus } from '@/generated/prisma';

       export type ExportFormat = 'generic_csv' | 'quickbooks' | 'adp' | 'gusto';

       export interface SettlementWithLines {
         settlement: DriverSettlement & { driver: Pick<CarrierDriver, 'id' | 'firstName' | 'lastName' | 'email' | 'phone'> };
         payComponents: LoadPayComponent[];                // direct rows — DO NOT use computeDeductionBreakdown or reporting.ts
         bonuses: DriverBonus[];
         deductionsSnapshot: Array<{ deductionId: string; description: string; amount: string; type: string }>;  // parsed from settlement.notes JSON
       }

       export interface Exporter {
         format: ExportFormat;
         fileExtension: string;     // 'csv' | 'iif'
         mimeType: string;          // 'text/csv' | 'application/octet-stream'
         build(settlements: SettlementWithLines[]): Readable;
       }

       export function getExporter(format: ExportFormat): Exporter { /* switch */ }
       ```

       Implement `getExporter` as a switch returning one of the four named exporter objects.

    2. **`exporters/generic-csv.ts`** — Header comment cites: "Generic per-driver/per-settlement CSV. No external spec — DriveCommand canonical layout." Columns (verified):
       `settlement_reference,driver_id,driver_first_name,driver_last_name,driver_email,period_start,period_end,employment_type,gross_taxable,gross_non_taxable,total_deductions,net_pay,line_count,bonus_count,deduction_count`.
       One row per settlement. Use `decimal.js` for any aggregation. Escape CSV per RFC 4180 (wrap any value containing `,` `"` or newline in `"..."`, double internal quotes).

    3. **`exporters/quickbooks.ts`** — Header comment cites public spec URL: `https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data/format-csv-files-quickbooks-desktop/L9CqaWqaY_US_en_US` (QuickBooks Desktop "General Journal Entry" CSV import). Use CSV (NOT IIF) — CSV is the format with stable, current Intuit-published documentation. IIF format is legacy and Intuit has marked it deprecated for new integrations.
       Columns (verified per Intuit docs): `Date,Journal No.,Account,Debits,Credits,Description,Name,Class,Memo`.
       Per settlement, emit ONE debit row (gross to "Payroll Expense") + ONE credit row per deduction + ONE credit row to "Cash/Checking" for net pay. Date = `settlement.finalizedAt` formatted `MM/DD/YYYY`. `Name` = driver full name. `Journal No.` = `settlement.settlementReference`.
       Mark `Account` column values for deductions as `TODO: needs carrier chart-of-accounts mapping` — emit a literal `"TODO:DEDUCTION_ACCOUNT"` placeholder string and record the TODO in README.

    4. **`exporters/adp.ts`** — Header comment cites: ADP Run "Paydata Grid" CSV import (`https://support.adp.com/adp_payroll/content/hybrid/paydata_import.htm`). Columns (verified subset): `Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount,Earnings 3 Code,Earnings 3 Amount,Memo`.
       For W-2 settlements: split gross_taxable into Reg Hours (use total miles or driven hours from pay components as `Reg Hours` if hourly model; else emit gross as `Earnings 3` with code `MISC`). For 1099 settlements: emit `Earnings 3 Code = 1099` with full gross amount.
       Columns we cannot verify (`Co Code`, `Batch ID`, `File #` — carrier-specific identifiers): emit literal `TODO:CO_CODE`, `TODO:BATCH_ID`, `TODO:FILE_NUM` placeholders. Record in README.

    5. **`exporters/gusto.ts`** — Header comment cites: Gusto "Bulk hours and earnings" CSV (`https://support.gusto.com/article/106621964100000`). Columns (verified): `employee_email,regular_hours,overtime_hours,double_overtime_hours,bonus,commission,reimbursement,other_hours_code,other_hours_amount,paycheck_tip_amount,cash_tip_amount,personal_note`.
       For W-2: use `employee_email` from `driver.email`; map gross_taxable to `regular_hours * hourly_rate` if hourly OR to `bonus` if flat (since Gusto's CSV is designed for hourly W-2 staff). For 1099: Gusto handles contractors via a SEPARATE flow (`https://support.gusto.com/article/213842491000000`); emit using their contractor-pay columns: `contractor_email,wage,reimbursement,bonus`. Detect employment type and emit the appropriate row shape (the exporter MUST handle both shapes by emitting two header rows split by a blank line, OR by aborting if both types are mixed — choose: emit single shape per call. The route already splits W-2 vs 1099 into separate exporter invocations, so each call gets a homogeneous list).
       If `payComponents` lacks an hourly rate, emit `regular_hours = 0` and place full gross into `bonus`. Document this trade-off in README.

    6. **`exporters/README.md`** — Table of contents:
       - Per format: source URL, verified columns, unverified-TODO columns, manual-sandbox-import status (mark all as `Not yet manually verified — TODO before production rollout`).
       - "How to verify": short checklist for each format (create sandbox account, import a sample, fix TODOs).
       - "W-2 vs 1099 split rationale": explain that employment_type_snapshot drives split, never the driver's current employmentType.

    Streaming detail: each `build()` returns `Readable.from((async function*() { yield headerLine; for (const s of settlements) yield rowLine(s); })())`. The async generator yields strings; pipe straight to the response. Never `Array.join('\n')` the whole file.

    Decimal handling: all sums use `new Decimal(...).plus(...)`. Final formatting uses `.toFixed(2)` for currency, `.toFixed(4)` for hours/miles where applicable. `grossAmount` from `LoadPayComponent` rows where `category === 'DEDUCTION'` is stored as NEGATIVE per spec — preserve sign, do not `.abs()`. Sum of all `payComponents.grossAmount + bonuses.amount + deductionsSnapshot.amount` should reconcile to `settlement.netPay` within 1 cent — assert this with a runtime check; if mismatch, throw a `PayrollExportReconciliationError` (define and export from `index.ts`).

    Constraints:
    - DO NOT use `computeDeductionBreakdown` or anything from `apps/web/src/lib/driver-pay/reporting.ts`
    - DO NOT use `JSON.stringify` for CSV escaping — implement per RFC 4180
    - No `any` types in any exporter (`type-check` clean)
    - Each row generation uses `decimal.js`, never native float
    - Header comment in each exporter MUST contain the spec URL it implements
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit
    cd apps/web && node -e "const { getExporter } = require('./src/lib/driver-pay/exporters/index.ts'); console.log(['generic_csv','quickbooks','adp','gusto'].map(f => getExporter(f).format));"  # or via vitest sanity test in Task 4
    ls apps/web/src/lib/driver-pay/exporters/  # confirm all 6 files present (index, 4 impls, README)
  </verify>
  <done>
    Five `.ts` files + README.md exist under `apps/web/src/lib/driver-pay/exporters/`; each impl's header comment cites its public spec URL; `getExporter` returns the correct exporter per format; all four `build()` calls return a `Readable`; `tsc --noEmit` clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: API route + UI (button + modal) + settlements page mount</name>
  <files>
    apps/web/src/app/api/reports/payroll-export/route.ts
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
    apps/web/package.json
  </files>
  <action>
    Build the streaming export endpoint + Pattern E modal UI.

    1. **Install archiver** — `cd apps/web && pnpm add archiver && pnpm add -D @types/archiver`. (Used only for the "Both" case to zip two streams together.)

    2. **`apps/web/src/app/api/reports/payroll-export/route.ts`** — `POST` handler.

       Request body (Zod):
       ```ts
       const Body = z.object({
         format: z.enum(['generic_csv', 'quickbooks', 'adp', 'gusto']),
         employmentType: z.enum(['W2_EMPLOYEE', 'OWNER_OPERATOR_1099', 'BOTH']),
         settlementIds: z.array(z.string().uuid()).min(1).max(500),
       });
       ```

       Flow:
       1. `const session = await getSession()`; redirect logic — for API, return 401 if `!session`.
       2. Role check — `if (session.role.toUpperCase() !== UserRole.SYSTEM_ADMIN)` return 403 JSON `{ error: 'Forbidden: ADMIN role required for payroll export' }`. Match the existing role-check pattern from settlements/route.ts (the spec says ADMIN-only — that maps to `SYSTEM_ADMIN` in this codebase; confirm against `UserRole` enum, use whichever name represents the carrier admin).
       3. `const prisma = await getTenantPrisma()` — tenant isolation via Prisma middleware.
       4. Fetch settlements: `prisma.driverSettlement.findMany({ where: { id: { in: body.settlementIds }, tenantId: session.tenantId, deletedAt: null }, include: { driver: { select: { id, firstName, lastName, email, phone } } } })`.
       5. Validate: if any settlement has `status === 'DRAFT'`, return 422 JSON `{ error: 'Cannot export DRAFT settlements. Finalize them first.', draftIds: [...] }`. Also reject if any settlement lacks `employmentTypeSnapshot` (return 422 with `unfinalizedIds`).
       6. For each settlement, fetch `payComponents` (from LoadPayComponent rows linked via `assignmentId` → `LoadDriverAssignment.settlementId`), `bonuses` (DriverBonus.settlementId), and parse `deductionsSnapshot` from `settlement.notes` JSON (`JSON.parse(settlement.notes ?? '{}')._deductionsApplied ?? []`).
       7. Split into `w2` and `c1099` arrays by `employmentTypeSnapshot`.
       8. Build response:
          - **Single-type (W2_EMPLOYEE or OWNER_OPERATOR_1099):** filter to that type, call `getExporter(format).build(filtered)`, return `NextResponse` with streamed body, `Content-Type: <exporter.mimeType>`, `Content-Disposition: attachment; filename="payroll_<format>_<empType>_<YYYYMMDD>.<ext>"`.
          - **BOTH:** create an `archiver('zip')` instance, append both streams (`archive.append(w2Stream, { name: 'w2.<ext>' })`, `archive.append(c1099Stream, { name: '1099.<ext>' })`), call `archive.finalize()`, return zip stream. `Content-Type: application/zip`, filename ends in `.zip`.
       9. After response stream construction (BEFORE returning), write audit log:
          ```ts
          await prisma.driverPayAuditLog.create({
            data: {
              tenantId: session.tenantId,
              entityType: 'PayrollExport',
              entityId: session.userId, // no FK target — use actor as anchor
              action: 'payroll:exported',
              previousValue: null as unknown as Prisma.InputJsonValue,  // or Prisma.JsonNull
              newValue: { format, employmentType: body.employmentType, settlementCount: settlements.length, settlementIds: body.settlementIds, w2Count: w2.length, c1099Count: c1099.length } as unknown as Prisma.InputJsonValue,
              actorId: session.userId,
              createdBy: session.userId,
            },
          });
          ```
       10. Wrap entire handler in try/catch; on `PayrollExportReconciliationError` return 500 with the error message; on Zod parse error return 400.

       Use `Readable.toWeb()` from `node:stream` to convert the Node stream to a Web `ReadableStream` for `NextResponse`. See `apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts` for streaming buffer pattern (adapt to true stream rather than buffered).

    3. **`ExportPayrollModal.tsx`** (client component) — Pattern E modal using existing shadcn `Dialog` + `Select` + `RadioGroup` (or `Switch` if RadioGroup unavailable — check `apps/web/src/components/ui/`).
       Props: `{ open: boolean; onOpenChange: (open: boolean) => void; selectedSettlementIds: string[] }`.
       Fields:
       - `format`: Select with 4 options (Generic CSV / QuickBooks / ADP / Gusto)
       - `employmentType`: Select or RadioGroup — W-2 Only / 1099 Only / Both
       - Read-only count: "Exporting {selectedSettlementIds.length} settlement(s)"
       - "Download" button → POSTs to `/api/reports/payroll-export`, reads response as blob, triggers browser download via `URL.createObjectURL(blob)` + temporary `<a download>` click.
       - On non-2xx: parse `error` JSON, show inline error message (especially the 422 DRAFT settlements case — show the list of `draftIds`).
       - Loading state: disable Download button + show "Building export..." text.

    4. **`ExportPayrollButton.tsx`** (client component) — Button + state for modal open + checkbox-selection bridging. For v1 simplicity, select-all-shown-settlements on click (no per-row checkbox UI required by spec). Props: `{ settlementIds: string[] }`. Renders `<Button>Export Payroll</Button>` that opens the modal with those IDs.

    5. **`settlements/page.tsx`** — Mount `<ExportPayrollButton settlementIds={settlements.map(s => s.id)} />` in the header, next to the existing "Generate Settlements" link. Only render for ADMIN role:
       ```tsx
       {role === UserRole.SYSTEM_ADMIN && <ExportPayrollButton settlementIds={settlements.map(s => s.id)} />}
       ```
       (Match whichever role name corresponds to the ADMIN check used in Task 3 step 2.)

    Constraints:
    - DO NOT add a sidebar nav entry — button lives on existing settlements page
    - DO NOT buffer the full export in memory — must stream via Readable
    - DO NOT modify the existing Generate Settlements / SettlementListTable code beyond the header mount
    - The audit log row is created EXACTLY ONCE per successful request (even for the BOTH case)
    - 422 on DRAFT must include the list of offending IDs in the JSON body for UI display
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit
    cd apps/web && pnpm build  # next build sanity check
    Manual: visit /carrier/driver-pay/settlements as ADMIN → Export Payroll button visible → modal opens → selecting Generic CSV + W-2 + Download streams a .csv file
    Manual: visit /carrier/driver-pay/settlements as OWNER (non-admin) → Export Payroll button NOT visible
  </verify>
  <done>
    POST /api/reports/payroll-export responds with streamed file for single-type and zip for BOTH; 403 for non-ADMIN; 422 with draftIds for DRAFT-included requests; audit log row created on success; Export Payroll button visible to ADMIN on settlements page; modal triggers browser file download; `tsc --noEmit` clean; `next build` passes.
  </done>
</task>

<task type="auto">
  <name>Task 4: Golden tests + RBAC test + audit log test</name>
  <files>
    apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/settlements.fixture.ts
    apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/generic-csv.golden.csv
    apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/quickbooks.golden.csv
    apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/adp.golden.csv
    apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/gusto.golden.csv
    apps/web/src/lib/driver-pay/__tests__/exporters/generic-csv.golden.test.ts
    apps/web/src/lib/driver-pay/__tests__/exporters/quickbooks.golden.test.ts
    apps/web/src/lib/driver-pay/__tests__/exporters/adp.golden.test.ts
    apps/web/src/lib/driver-pay/__tests__/exporters/gusto.golden.test.ts
    apps/web/src/app/api/driver-pay/__tests__/payroll-export-rbac.test.ts
    apps/web/src/app/api/driver-pay/__tests__/payroll-export-audit.test.ts
  </files>
  <action>
    Note on location: project convention puts unit tests in `src/lib/driver-pay/__tests__/` (NOT `apps/web/__tests__/` — that directory does not exist). API route tests live in `src/app/api/driver-pay/__tests__/`. Use these conventional locations. Spec's path `apps/web/__tests__/driver-pay/exporters/` is overridden by codebase convention.

    1. **Fixture file** — `__fixtures__/settlements.fixture.ts` exports two `SettlementWithLines` objects:
       - `w2Settlement`: driver "FIRST_W2 / LAST_W2", email `w2.driver+test@example.invalid`, employment_type_snapshot=W2_EMPLOYEE, periodStart 2026-04-01, periodEnd 2026-04-07, finalizedAt 2026-04-08T12:00:00Z, settlementReference "SET-2026-04-W2-001", grossTaxable 2500.00, grossNonTaxable 50.00, totalDeductions 425.50, netPay 2124.50. Three pay components (linehaul, detention, deduction-uniform), two bonuses (safety $100, on-time $50), two deductions (uniform -$25.50 quantity=1, garnishment -$400 quantity=1).
       - `c1099Settlement`: driver "FIRST_1099 / LAST_1099", email `c1099.driver+test@example.invalid`, employment_type_snapshot=OWNER_OPERATOR_1099, periodStart 2026-04-01, periodEnd 2026-04-07, finalizedAt 2026-04-08T12:00:00Z, settlementReference "SET-2026-04-1099-001", grossTaxable 3800.00, grossNonTaxable 0, totalDeductions 950.00, netPay 2850.00. Two pay components (percentage of revenue qty=2), one bonus, one deduction (truck-lease -$950 qty=1).
       - All values use string-form to avoid Decimal/Prisma round-trip in tests; helper converts to Decimal where the exporter expects it.
       - NO real names, NO real emails (use `.invalid` TLD per RFC 6761).

    2. **Four golden tests** (one per format) — each test:
       ```ts
       import { describe, it, expect } from 'vitest';
       import { readFileSync } from 'node:fs';
       import { genericCsvExporter } from '../../exporters/generic-csv';
       import { w2Settlement, c1099Settlement } from './__fixtures__/settlements.fixture';

       async function streamToString(stream: Readable): Promise<string> {
         const chunks: Buffer[] = [];
         for await (const chunk of stream) chunks.push(Buffer.from(chunk));
         return Buffer.concat(chunks).toString('utf8');
       }

       describe('genericCsvExporter golden', () => {
         it('matches golden for mixed W-2 + 1099 input', async () => {
           const stream = genericCsvExporter.build([w2Settlement, c1099Settlement]);
           const actual = await streamToString(stream);
           const expected = readFileSync(__dirname + '/__fixtures__/generic-csv.golden.csv', 'utf8');
           expect(actual).toBe(expected);
         });

         it('handles 1099-only input without W-2 rows', async () => { /* ... */ });
       });
       ```
       Generate the four golden files by running each exporter ONCE with the fixtures, write the bytes to `__fixtures__/<format>.golden.csv`, then add the byte-equality assertion. Commit goldens alongside tests.

       Each golden test must include at minimum:
       - W-2 + 1099 combined input
       - 1099-only input
       - quantity > 1 case (the 1099 settlement has qty=2)
       - At least one deduction (negative gross_amount)
       - At least one bonus

       For Gusto specifically, since W-2 and 1099 produce different row shapes, write two separate goldens (`gusto.w2.golden.csv` and `gusto.1099.golden.csv`) and call build() twice (once per homogeneous list).

    3. **`payroll-export-rbac.test.ts`** — Mock `getSession` to return each non-ADMIN role (`OWNER`, `MANAGER`, `DRIVER`) and assert POST returns 403. Then mock as `SYSTEM_ADMIN` (or the ADMIN role used in Task 3) and assert it does NOT return 403. Follow the mocking pattern from `settlements-finalize.test.ts`.

    4. **`payroll-export-audit.test.ts`** — Mock prisma with `driverPayAuditLog.create` as a vitest spy. Submit a valid request as ADMIN. Assert:
       - `driverPayAuditLog.create` called exactly once
       - `entityType === 'PayrollExport'`
       - `action === 'payroll:exported'`
       - `newValue` contains `format`, `employmentType`, `settlementCount`, `settlementIds`
       - Second test: when 422 is returned (DRAFT settlement included), `driverPayAuditLog.create` is called ZERO times.

    Constraints:
    - All goldens use LF line endings (no CRLF) — set in writeFileSync explicitly if generated on Windows
    - No real names, no real emails, no real driver IDs in fixtures
    - Each golden file must be deterministic — no timestamps in output that aren't from the fixture's finalizedAt
    - Tests must pass on first run after fixture-driven golden generation
    - DO NOT mutate the fixture objects between tests (use deep clone if needed)
  </action>
  <verify>
    cd apps/web && npx vitest run src/lib/driver-pay/__tests__/exporters/  # all four golden tests pass
    cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/payroll-export-rbac.test.ts
    cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/payroll-export-audit.test.ts
    cd apps/web && npx vitest run src/lib/driver-pay/ src/app/api/driver-pay/  # full driver-pay suite still green
    cd apps/web && npx tsc --noEmit
  </verify>
  <done>
    All 4 golden tests pass (≥2 cases each); RBAC test asserts 403 for OWNER+MANAGER+DRIVER and not-403 for ADMIN; audit log test asserts exactly-one and zero-on-error; full driver-pay test suite still green; tsc clean.
  </done>
</task>

</tasks>

<verification>
End-to-end check (manual + automated):

1. `cd apps/web && npx prisma generate && npx tsc --noEmit` — clean
2. `cd apps/web && pnpm build` — passes
3. `cd apps/web && npx vitest run src/lib/driver-pay/ src/app/api/driver-pay/` — all green (including 52 existing tests from Phase 8 + new exporter/rbac/audit tests)
4. Supabase MCP: `SELECT employment_type_snapshot FROM driver_settlements WHERE status IN ('FINALIZED','PAID') LIMIT 5` — all rows populated (post-backfill)
5. Manual smoke: log in as ADMIN, visit `/carrier/driver-pay/settlements`, click Export Payroll, pick "Generic CSV" + "W-2 Only", download the file, open in Excel — opens cleanly with one row per settlement.
6. Manual smoke: pick "Both" → downloads a `.zip` with `w2.csv` and `1099.csv` inside.
7. Manual smoke: log in as OWNER → Export Payroll button is hidden; direct POST to `/api/reports/payroll-export` returns 403.
8. Manual smoke: attempt export with a DRAFT settlement in the list → modal shows "Cannot export DRAFT settlements" error with the offending settlement IDs.
9. DB check: after one successful export, `SELECT * FROM driver_pay_audit_logs WHERE action='payroll:exported' ORDER BY created_at DESC LIMIT 1` — one row, correct payload.
</verification>

<success_criteria>
- DriverSettlement has `employment_type_snapshot` column, backfilled for all historical FINALIZED/PAID rows
- FINALIZED transition stamps `employmentTypeSnapshot` atomically from active DriverCompensationTemplate
- All 4 exporters (generic CSV, QuickBooks CSV, ADP, Gusto) implemented with header-comment spec URLs and decimal.js math
- README documents per-format verified columns + TODO unverified columns + sandbox status
- POST /api/reports/payroll-export: ADMIN-only, Zod-validated, 422 on DRAFT, streams response, zips on BOTH, writes exactly one audit log on success
- Export Payroll button mounted on settlements page header, ADMIN-gated, opens Pattern E modal
- 4 golden tests + RBAC test + audit log test all pass; W-2 and 1099 split is enforced by tests
- `tsc --noEmit` clean; `pnpm build` passes; no `any` types in exporter code
- No real names / real emails / real driver IDs in fixtures (`.invalid` TLD used)
- Tenant isolation preserved via standard Prisma middleware
- DO NOT use computeDeductionBreakdown or reporting.ts (enforced by code review of exporter imports)
</success_criteria>

<output>
After completion, create `.planning/quick/310-driver-pay-phase-11-payroll-export-gener/310-SUMMARY.md` using the standard summary template.
</output>
