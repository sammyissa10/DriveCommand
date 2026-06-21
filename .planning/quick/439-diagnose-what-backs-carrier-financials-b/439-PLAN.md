---
phase: quick-439
plan: 439
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Report classifies all 6 help-doc financial features as A/B/C/D with file+line evidence"
    - "Report states whether the financial layer is Load-centric or Route-legacy"
    - "Report identifies the exact model/table backing the dashboard 'Open Invoices' KPI"
    - "Report proposes the smallest shippable /carrier/financials page"
  artifacts: []
  key_links: []
---

<objective>
READ-ONLY investigation. Diagnose what data and code already back a `/carrier/financials`
page before anyone builds it. Produce a single diagnostic report — no code, no schema,
no new files beyond the report returned as the final message.

Purpose: De-risk the financials build by classifying each advertised feature against
what actually exists (model / read code / UI).
Output: A diagnostic report (returned as final message — NOT written as a project .md file).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Pre-verified evidence (confirmed during planning — re-read to cite exact lines)
# schema.prisma model line numbers:
#   ExpenseCategory:814  RouteExpense:834  ExpenseTemplate:860  RoutePayment:895
#   Invoice:1044  InvoiceItem:1087  PayrollRecord:1187
# Server actions:  apps/web/src/app/(owner)/actions/{invoices,expenses,expense-categories,expense-templates}.ts
# API routes:      apps/web/src/app/api/v1/carrier/{expenses,pay-records}/  (NO invoices route here)
# UI pages:        apps/web/src/app/(owner)/{invoices, settings/financial, settings/expense-categories, settings/expense-templates}/
#                  (NO apps/web/src/app/carrier/**/financials/ exists)
# KPI 'Open Invoices' = CarrierLoad where status='invoiced' (NOT the Invoice model)
#   apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts:50
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit financial models, read code, and KPI source</name>
  <files>NONE — read-only. Do not create or edit any file.</files>
  <action>
    Inspect the Prisma schema and confirm, for each of these 7 models, whether it exists
    (non-deprecated), whether it is Load-centric or Route-legacy, and its key relation fields:
    Invoice, InvoiceItem, RouteExpense, RoutePayment, ExpenseCategory, ExpenseTemplate, PayrollRecord.

    - Read apps/web/prisma/schema.prisma at the line ranges noted in context (814–900, 1044–1110, 1187+).
      For each model record: existence, @@map / deprecated comment if any, FK fields
      (e.g. loadId vs routeId — this determines Load-centric vs Route-legacy).
    - For each existing model, find working READ code scoped by tenant via getTenantPrisma().
      Search apps/web/src/app/(owner)/actions/{invoices,expenses,expense-categories,expense-templates}.ts
      and apps/web/src/app/api/v1/carrier/{expenses,pay-records}/**. Cite file + line for each
      getTenantPrisma() query. Note that PayrollRecord read code may live in pay-records routes.
    - Open apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts and confirm exactly which
      model/table backs the "Open Invoices" KPI (planning found CarrierLoad status='invoiced'
      at line ~50, NOT the Invoice model). Cite the model and line.

    Capture file:line evidence for every claim. Do NOT modify anything.
  </action>
  <verify>For each of the 7 models, a yes/no on existence + Load-vs-Route classification + a cited read-code location (or "none found"). KPI-backing model identified with file:line.</verify>
  <done>Evidence table assembled covering all 7 models, their read code, and the Open Invoices KPI source.</done>
</task>

<task type="auto">
  <name>Task 2: Audit existing financial UI and classify the 6 features</name>
  <files>NONE — read-only. Do not create or edit any file.</files>
  <action>
    Determine which UI already exists that creates or views invoices/expenses/payments,
    and confirm no /carrier/financials page exists yet.

    - List the UI under apps/web/src/app/(owner)/invoices/, (owner)/settings/financial/,
      (owner)/settings/expense-categories/, (owner)/settings/expense-templates/. For each,
      record the route path and the page.tsx file path, and one line on what it does
      (create? view? list?).
    - Confirm apps/web/src/app/carrier/**/financials/ does NOT exist (planning confirmed absent).
    - Check whether invoice/expense UI lives in an owner route group vs a carrier route group —
      this matters for whether it is reachable from a carrier-facing /carrier/financials page.

    Then classify each of the 6 help-doc features as A/B/C/D using:
      A = model exists + read code exists + UI exists
      B = model exists + read code exists + NO UI
      C = model exists + NO read code + NO UI
      D = no model exists
    Features:
      1. Financials dashboard (profit at a glance)
      2. Logging expenses
      3. Sending an invoice
      4. Customizing invoice templates
      5. Tracking payments
      6. Profit-per-load

    For each feature cite the model (Task 1 evidence), read-code file:line, and UI file path.
  </action>
  <verify>All 6 features have an A/B/C/D label backed by model + read-code + UI evidence (or explicit "none").</verify>
  <done>6-feature classification complete with file/line evidence for each.</done>
</task>

<task type="auto">
  <name>Task 3: Assemble the diagnostic report</name>
  <files>NONE — return report as final message. Do NOT write a project .md file.</files>
  <action>
    Combine Task 1 + Task 2 findings into the required report structure and return it as the
    final assistant message (per agent rules — do NOT create a findings .md file):

    1. Markdown table: 6 features × A/B/C/D status, each row with file/line evidence
       (model location, read-code location, UI location).
    2. A one-line statement: is the financial layer Load-centric or Route-legacy?
       Justify with the FK evidence from Task 1 (e.g. RouteExpense.routeId is legacy;
       Invoice/expense linkage to CarrierLoad is Load-centric).
    3. One paragraph: the smallest /carrier/financials page shippable by July 27 —
       built strictly from features already classified A or B (existing model + read code),
       avoiding any feature classified C or D. Name the concrete data sources it would read.

    Keep it tight and evidence-first. No speculation beyond the shippability paragraph.
  </action>
  <verify>Report contains all three required sections; every A/B/C/D cell has evidence; shippability paragraph references only A/B features.</verify>
  <done>Diagnostic report returned answering all 5 investigation questions.</done>
</task>

</tasks>

<verification>
- No files created or modified anywhere in the repo (read-only investigation).
- All 7 models classified (exist? Load vs Route? read code location?).
- Open Invoices KPI source identified with file:line.
- All 6 features labeled A/B/C/D with evidence.
- Load-centric vs Route-legacy statement made.
- Shippable-page paragraph references only A/B features.
</verification>

<success_criteria>
The report answers all five investigation questions with file:line evidence, classifies the
6 features, states the architecture (Load-centric vs Route-legacy), and proposes the smallest
shippable /carrier/financials page using only existing (A/B) capabilities. Zero code changes.
</success_criteria>

<output>
Return the diagnostic report as the final assistant message. Do NOT write a SUMMARY or findings
.md file — the orchestrator consumes the text output directly.
</output>
