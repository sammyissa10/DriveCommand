---
phase: quick-440
plan: 440
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "A canonical financial schema decision (Load-centric vs Route-legacy) is documented with evidence"
    - "Each of the 5 investigation questions has a cited, file:line-backed answer"
    - "The exact change to make Open Invoices KPI read the Invoice model is specified (no code written)"
    - "Tenant-scoping correctness of Load-centric tables and RLS-allowlist status of legacy tables is confirmed"
  artifacts:
    - path: ".planning/quick/440-diagnose-canonical-financial-schema-befo/440-SUMMARY.md"
      provides: "Decision-grade diagnostic report answering all 5 questions"
      min_lines: 60
  key_links:
    - from: "440-SUMMARY.md"
      to: "439-SUMMARY.md"
      via: "builds on prior model/code/UI audit, does not repeat it"
      pattern: "439"
---

<objective>
Produce a decision-grade diagnostic that picks the canonical financial schema BEFORE any /carrier/financials UI is written. Quick task 439 already mapped the two parallel systems (Route-legacy: RouteExpense/RoutePayment/PayrollRecord scoped by tenantId; Load-centric: CarrierLoad/CarrierExpense/DriverPayRecord scoped by orgId via getTenantPrisma RLS). This task goes deeper on the five specific schema decisions that block the build.

Purpose: De-risk the financials module by locking the canonical data sources, surfacing the exact KPI reconciliation change, and confirming tenant-scoping/RLS correctness so the build phase writes zero throwaway code.

Output: `.planning/quick/440-diagnose-canonical-financial-schema-befo/440-SUMMARY.md`

THIS IS A READ-ONLY DIAGNOSTIC. No schema changes, no migrations, no API routes, no UI code. Every claim must cite file:line.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/439-diagnose-what-backs-carrier-financials-b/439-SUMMARY.md
@apps/web/prisma/schema.prisma

Known anchors (verified during planning — re-confirm, do not assume):
- Invoice model: schema.prisma ~line 1044. Has tenantId (NOT orgId), optional routeId? + loadId?, Prisma `load` relation but NO `route` relation, @@index([loadId]) and @@unique([tenantId, invoiceNumber]).
- Open Invoices KPI counts CarrierLoad where status='invoiced' (NOT Invoice): apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts ~line 46.
- RLS Section 4.12 allowlist documented in MEMORY (project_rls_advisor_fix). Phase 1 grants: migration 20260602000001_phase1_grant_app_user_dml.
- getTenantPrisma() lives in the auth/db layer; carrier API routes use orgId filtering.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Invoice model usage + Expenses/Payments schema comparison</name>
  <files>(read-only) apps/web/prisma/schema.prisma, apps/web/src/app/(owner)/invoices/page.tsx, apps/web/src/app/(owner)/invoices/[id]/page.tsx, apps/web/src/app/(owner)/actions/invoices.ts, apps/web/src/app/(owner)/actions/expenses.ts, apps/web/src/app/(owner)/actions/payments.ts</files>
  <action>
    Answer investigation questions 1, 2, and 3. Read only — write nothing except the SUMMARY in Task 3.

    Q1 — Invoice model actively used?
    - Confirm Invoice FK columns from schema (tenantId, routeId?, loadId?) and which Prisma relations exist (load yes / route no). Cite schema.prisma line numbers.
    - Cite the /invoices UI code that reads/writes Invoice: list aggregation (invoices/page.tsx — note the prisma.invoice.groupBy usage and stat cards), detail page (invoices/[id]/page.tsx), and the create/update/markPaid/delete actions in actions/invoices.ts. Confirm each is tenant-scoped via getTenantPrisma.
    - State verdict: is Invoice actively used (yes/no) and is it Load-centric or Route-legacy in practice (driven by which FK is populated by the create action).

    Q2 — RouteExpense vs CarrierExpense:
    - Side-by-side field comparison from schema: tenant FK (tenantId vs orgId), entity FK (routeId vs loadId?/dispatchId?/driverId?), money fields, status/approval fields, category linkage. Cite line numbers.
    - State what each is MISSING for a load-centric financials UI (e.g. RouteExpense has no loadId, no orgId; CarrierExpense has loadId? but no standalone owner-portal UI — note API route exists at api/v1/carrier/expenses).
    - Verdict: which is canonical for /carrier/financials expenses, and the gap to close.

    Q3 — Payments: RoutePayment vs Invoice.paidDate:
    - Compare RoutePayment (routeId FK, PaymentStatus enum, scoped by tenantId) against the Invoice payment approach (status=PAID + paidDate, markInvoicePaid action). Cite line numbers.
    - For Load-centric payments, state which approach the financials module should adopt and why (RoutePayment cannot be queried by load; Invoice.paidDate is load-reachable via loadId).
  </action>
  <verify>Each of Q1/Q2/Q3 has at least 3 file:line citations; verdicts state Load-centric vs Route-legacy explicitly.</verify>
  <done>Findings for Q1, Q2, Q3 captured with citations, ready to fold into SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 2: KPI reconciliation spec + tenant-scoping / RLS audit</name>
  <files>(read-only) apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts, apps/web/src/app/(owner)/invoices/page.tsx, apps/web/src/app/api/v1/carrier/expenses/route.ts, apps/web/src/app/api/v1/carrier/pay-records/route.ts, apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/migration.sql</files>
  <action>
    Answer investigation questions 4 and 5. Read only.

    Q4 — KPI reconciliation:
    - Quote the current openInvoices query in kpi/route.ts (count CarrierLoad where orgId, isSample:false, status='invoiced') with line number.
    - Specify EXACTLY what it takes to make Open Invoices read the Invoice model instead: which Invoice statuses count as "open" (e.g. SENT + OVERDUE, excluding DRAFT/PAID — confirm against the InvoiceStatus enum in schema), whether to count rows or sum totalAmount, and the join/scoping concern (Invoice is scoped by tenantId, KPI route is scoped by orgId — call out the orgId-vs-tenantId mismatch and how it must be resolved before this swap is safe).
    - Reference the existing prisma.invoice.groupBy pattern in invoices/page.tsx as the proven query shape to reuse.
    - Output: a precise spec (not code) of the one query change + the tenant-scoping prerequisite.

    Q5 — Tenant scoping correctness:
    - Confirm Load-centric tables (CarrierLoad, CarrierExpense, DriverPayRecord) are accessed through getTenantPrisma() / orgId filtering in their API routes. Cite the orgId filter usage in expenses/route.ts and pay-records/route.ts.
    - Confirm whether the legacy tenantId-scoped tables (RouteExpense, RoutePayment, PayrollRecord, Invoice, InvoiceItem) appear in the Phase 1 app_user DML grant migration (20260602000001) and/or the documented RLS Section 4.12 allowlist. Locate the allowlist source (search migrations + any rls policy SQL); cite file:line. Note any table that is NOT covered (RLS gap risk).
    - Verdict: is the orgId vs tenantId split a blocker for a single financials query layer, and what must be reconciled.
  </action>
  <verify>Q4 names exact InvoiceStatus values treated as "open" and calls out orgId-vs-tenantId mismatch; Q5 cites the grant migration and allowlist source with file:line.</verify>
  <done>Findings for Q4, Q5 captured with citations and the KPI-swap prerequisite identified.</done>
</task>

<task type="auto">
  <name>Task 3: Write 440-SUMMARY.md canonical-schema decision report</name>
  <files>.planning/quick/440-diagnose-canonical-financial-schema-befo/440-SUMMARY.md</files>
  <action>
    Synthesize Task 1 + Task 2 findings into a decision-grade report. Do NOT repeat the full 439 model/code/UI tables — reference 439-SUMMARY.md and add only the deeper decision content.

    Structure:
    1. Header (date 2026-06-15, READ-ONLY scope, "builds on 439").
    2. Q1 — Invoice model usage: verdict + FK table + UI citations.
    3. Q2 — Expenses (RouteExpense vs CarrierExpense): comparison table + missing-fields + canonical pick.
    4. Q3 — Payments (RoutePayment vs Invoice.paidDate): comparison + canonical pick.
    5. Q4 — KPI reconciliation spec: current query, target query shape (statuses, count vs sum), orgId-vs-tenantId prerequisite. NO code, just the spec.
    6. Q5 — Tenant scoping / RLS: getTenantPrisma correctness for Load-centric tables, allowlist coverage of legacy tables, gaps.
    7. CANONICAL DECISION: one clear statement of which system is canonical (expected: Load-centric — CarrierLoad + CarrierExpense + DriverPayRecord + Invoice-via-loadId), the single hard blocker to resolve first (orgId vs tenantId reconciliation), and an ordered list of what the build phase must do before writing UI.

    Every factual claim cites file:line. End with a 1-paragraph recommendation for the financials build sequencing.
  </action>
  <verify>File exists, >=60 lines, answers all 5 questions, contains an explicit "CANONICAL DECISION" section, and references 439-SUMMARY.md without duplicating its tables.</verify>
  <done>440-SUMMARY.md written with all 5 answers cited and a canonical-schema decision stated.</done>
</task>

</tasks>

<verification>
- 440-SUMMARY.md exists and answers Q1–Q5, each with file:line citations.
- A single explicit canonical-schema decision is stated (Load-centric vs Route-legacy).
- The orgId-vs-tenantId reconciliation is identified as the prerequisite blocker for the KPI swap and unified query layer.
- No schema files, migrations, API routes, or UI were modified (git status shows only the new SUMMARY under .planning/quick/440-*).
</verification>

<success_criteria>
- All 5 investigation questions answered with evidence.
- Canonical schema chosen with a clear, ordered "do this before building" list.
- Zero code/schema/migration changes (read-only diagnostic honored).
- Targets ~30% context (3 focused read-only tasks, no implementation).
</success_criteria>

<output>
After completion, create `.planning/quick/440-diagnose-canonical-financial-schema-befo/440-SUMMARY.md`
</output>
