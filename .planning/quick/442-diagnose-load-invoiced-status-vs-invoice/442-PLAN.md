---
phase: quick-442
plan: 442
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Spec intent on load↔invoice coupling is quoted with passage location"
    - "Every code path that sets CarrierLoad.status='invoiced' is enumerated with file:line"
    - "Every Invoice creation call is enumerated with its trigger and file:line"
    - "Read-only data counts of invoiced loads vs matching Invoice rows are reported per non-sample tenant"
    - "An explicit A/B/C verdict is stated with the smallest fix if C"
  artifacts:
    - path: ".planning/quick/442-diagnose-load-invoiced-status-vs-invoice/442-DIAGNOSIS.md"
      provides: "The investigation report answering questions 1-5"
      min_lines: 40
  key_links: []
---

<objective>
Determine the intended (spec) and actual (code + data) relationship between a CarrierLoad reaching status='invoiced' and an Invoice record existing. This is a READ-ONLY diagnosis prior to building invoice send/template UI (Phases 4-5). No code, schema, or data changes.

Purpose: Phase 1 reconciled the Open Invoices KPI to the Invoice model. The Demo tenant now shows Open Invoices = 0 and /invoices = 0 invoices, yet loads historically carry status='invoiced'. We must know whether 'invoiced' loads are SUPPOSED to have Invoice rows, and whether they actually do, before assuming a bug.

Output: A diagnosis report (442-DIAGNOSIS.md) answering questions 1-5 with spec quotes, file:line evidence, read-only data counts, and an explicit A/B/C verdict.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Spec (Workflow Engine / financials intent)
@docs/specs/workflow-engine.md

# Invoice + CarrierLoad schema models
@apps/web/prisma/schema.prisma

# Known code locations from initial scan
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
@apps/web/src/app/(owner)/actions/invoices.ts
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/lib/carrier/clients.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Establish spec intent + map all 'invoiced' status transitions and Invoice creation paths</name>
  <files>.planning/quick/442-diagnose-load-invoiced-status-vs-invoice/442-DIAGNOSIS.md (create, partial)</files>
  <action>
    READ ONLY. Do not modify any source file.

    Part A — SPEC INTENT (Question 1):
    - Search docs/specs/ (workflow-engine.md, DriveCommand_Workflow_Engine_v2.md, DriverPay_TechnicalSpec_v4.md, and any other spec mentioning invoice/billing/invoiced) for passages describing when an Invoice is created relative to a load being invoiced or delivered.
    - Use Grep across docs/specs/ for: "invoice", "invoiced", "billing", "auto-create", "delivered", "rate confirmation".
    - Quote the exact relevant passage(s). If the spec is silent, state that explicitly (silence is itself a finding).
    - State clearly: per spec, are load.status='invoiced' and Invoice existence meant to be COUPLED (one implies the other) or INDEPENDENT (separate manual actions)?

    Part B — STATUS TRANSITIONS (Question 2):
    - Find EVERY code path that sets a CarrierLoad's status to 'invoiced'. Grep apps/web for: "'invoiced'", '"invoiced"', "status: 'invoiced'", "status === 'invoiced'", and any status-update helper in src/lib/carrier/loads.ts and the load route handler.
    - Known starting points: apps/web/src/lib/carrier/loads.ts, apps/web/src/app/api/v1/carrier/loads/[id]/route.ts. Trace any status-mutation function they call.
    - For EACH path: does it ALSO create an Invoice row (look for invoice.create in same transaction/function), or does it only flip the status? Cite file:line for each.

    Part C — INVOICE CREATION (Question 3):
    - Find EVERY Invoice creation call. Grep apps/web for: "invoice.create", "Invoice.create", "tx.invoice.create", "prisma.invoice.create". Known files: src/app/(owner)/actions/invoices.ts, mobile owner invoices routes. Exclude SysAdminInvoice (different model) and src/generated/prisma (generated client).
    - For each Invoice.create(): what triggers it (manual owner action? load event? cron?)? Does it set the related load's status to 'invoiced' as a side effect? Does it set Invoice.loadId? Cite file:line.

    Write findings for Parts A, B, C into 442-DIAGNOSIS.md under headings "1. Spec Intent", "2. Status Transitions to 'invoiced'", "3. Invoice Creation Paths". Use the exact CarrierLoad and Invoice model fields from schema.prisma (confirm Invoice has a loadId/load relation and what CarrierLoad.status values exist).
  </action>
  <verify>442-DIAGNOSIS.md contains spec quote(s) with location, a complete enumerated list of 'invoiced' transition sites with file:line, and a complete enumerated list of Invoice.create sites with file:line and trigger. Each claim cites file:line.</verify>
  <done>Questions 1-3 fully answered in 442-DIAGNOSIS.md with spec citations and file:line evidence; coupling-by-design and coupling-in-code are each explicitly characterized.</done>
</task>

<task type="auto">
  <name>Task 2: Read-only data check across non-sample tenants + write verdict</name>
  <files>.planning/quick/442-diagnose-load-invoiced-status-vs-invoice/442-DIAGNOSIS.md (append)</files>
  <action>
    READ ONLY. Use the Supabase MCP read-only query path (or a read-only SELECT via the existing DB connection) — NO writes, NO migrations, NO data mutation.

    Part D — DATA CHECK (Question 4):
    - First confirm column/table names from schema.prisma: the physical table names for CarrierLoad and Invoice (check @@map), the status column, the Invoice→load FK column (loadId/load_id), and the tenant scoping column. Confirm how "sample"/Demo tenants are identified (e.g., a Tenant.isSample / isDemo / name flag — inspect the Tenant model in schema.prisma).
    - Run read-only SELECTs to report, across ALL NON-sample tenants:
      (a) Count of CarrierLoad rows with status='invoiced'.
      (b) Of those, how many have a matching Invoice row joined via Invoice.loadId = CarrierLoad.id.
      (c) The gap: invoiced loads with NO matching Invoice.
      - Provide a per-tenant breakdown AND a total. Account for soft-delete columns (exclude soft-deleted rows if the models have deletedAt — match the convention used in app queries).
    - Report exact counts in 442-DIAGNOSIS.md under heading "4. Data Check".

    Part E — VERDICT (Question 5):
    - Based on Tasks 1-2, state plainly ONE of:
      (A) Coupled by design AND coupled in code — no gap.
      (B) Independent by design — legitimately separate states; no gap.
      (C) Coupled by design but NOT coupled in code — a real bug.
    - Cross-check the verdict against the data: e.g., if verdict is B but data shows invoiced loads were expected to bill, note tension. If C, identify the EXACT missing link (which status-transition site should also create an Invoice, or which Invoice.create should also set status) and describe the SMALLEST correct fix in prose. Do NOT implement it.
    - Write under heading "5. Verdict".
  </action>
  <verify>442-DIAGNOSIS.md "4. Data Check" shows per-tenant + total counts for invoiced loads, matched Invoices, and the gap, all from read-only SELECTs. "5. Verdict" states exactly one of A/B/C with justification; if C, names the precise missing link and smallest fix. No source/schema/data was modified.</verify>
  <done>Questions 4-5 answered; report is complete and internally consistent (verdict reconciles with both code evidence from Task 1 and the data counts).</done>
</task>

</tasks>

<verification>
- 442-DIAGNOSIS.md exists and answers all 5 questions in order.
- Every code/spec claim cites a specific spec passage or file:line.
- Data counts come from read-only SELECTs against non-sample tenants only.
- Zero changes to source files, schema, migrations, or table data (git status shows only the new diagnosis .md under .planning/).
</verification>

<success_criteria>
- Q1 Spec intent: coupled vs independent stated, with quoted passage or explicit "spec is silent" finding.
- Q2: complete list of status→'invoiced' sites (file:line), each annotated whether it also creates an Invoice.
- Q3: complete list of Invoice.create sites (file:line), each annotated with trigger and whether it sets load status.
- Q4: per-tenant + total counts of invoiced loads, matching Invoices, and the gap.
- Q5: explicit A/B/C verdict; if C, exact missing link + smallest fix described (not implemented).
</success_criteria>

<output>
Write the diagnosis to `.planning/quick/442-diagnose-load-invoiced-status-vs-invoice/442-DIAGNOSIS.md`.
After completion, create `.planning/quick/442-diagnose-load-invoiced-status-vs-invoice/442-SUMMARY.md`.
</output>
