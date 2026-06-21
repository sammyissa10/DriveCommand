---
phase: quick-461
plan: 461
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "The full failing STATEMENT text from the Postgres logs for the 18:18-18:37 UTC window is captured verbatim"
    - "Each failing query is classified as raw SQL ($queryRaw/$executeRaw) or Prisma ORM, with file:line evidence"
    - "A definitive (a) missing-schema vs (b) raw-SQL-casing-bug verdict is issued"
    - "The 18:18 onset / 18:37 recovery is explained (or explicitly marked unexplained with reasoning)"
    - "Nothing is applied — production DB and code are untouched"
  artifacts:
    - path: ".planning/quick/461-read-only-diagnostic-reconcile-qt-459-vs/461-SUMMARY.md"
      provides: "Full statement text, (a)/(b) verdict, offending query list + exact fixes, onset/recovery explanation"
      min_lines: 60
  key_links:
    - from: "Postgres error log (Supabase MCP get_logs)"
      to: "code query site (file:line)"
      via: "match failing identifier to grep hit in apps/web/src"
      pattern: "CarrierDriver|\\borgId\\b|\\bfirstName\\b|queryRaw|executeRaw"
---

<objective>
Resolve the QT-459 vs QT-460 contradiction: was the 18:18-18:37 UTC outage caused by MISSING SCHEMA (QT-459 view) or by raw-SQL casing/name bugs against existing snake_case tables (QT-460 view)?

QT-460 proved there is ZERO schema drift: `carrier_drivers` exists with `org_id`, `first_name`, `user_id`; the column is `triggerKey` not `trigger`; `grid_preference` exists. So the errors `relation "CarrierDriver" does not exist`, `column cd.orgId does not exist`, `column cd.firstName does not exist`, `notificationTemplateId/trigger/subject does not exist` must be explained. The leading hypothesis: hand-written SQL using Prisma MODEL names / camelCase identifiers against tables whose real names are snake_case.

Purpose: A single, evidence-backed verdict so the right fix (schema vs code) is applied later. This is READ-ONLY.
Output: 461-SUMMARY.md with the smoking-gun statement text, the (a)/(b) verdict, the offending-query list with exact identifier fixes, and the onset/recovery explanation.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/460-urgent-prod-schema-drift-investigation-e/460-SUMMARY.md
@.planning/quick/459-fix-silent-resend-failure-log-failed-sta/459-SUMMARY.md
</context>

<constraints>
READ-ONLY. Do NOT apply any changes. No code edits, no schema edits, no `apply_migration`,
no `prisma migrate`, no DML/DDL. Use only Supabase MCP read tools (get_logs, execute_sql with
SELECT only) and read-only code search (Grep/Read). Report findings in 461-SUMMARY.md only.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Pull the full failing STATEMENT text from Postgres logs (the smoking gun)</name>
  <files>(read-only — no files modified)</files>
  <action>
    Use the Supabase MCP `get_logs` tool (service: postgres, and also try `api`/`auth` if needed)
    to retrieve the error log for the incident window 18:18-18:37 UTC on the incident date
    (confirm the date from STATE.md / Vercel context — the QT-458/459 era, ~2026-06-16).

    For EACH distinct error, capture VERBATIM and UNTRUNCATED:
    - The error message (e.g. `relation "CarrierDriver" does not exist`)
    - The full failing STATEMENT text if Postgres logged it (Postgres logs the failing
      STATEMENT alongside the ERROR when log_statement / log_min_error_statement is on).
      This is the smoking gun — we need to see whether the failing query reads
      `SELECT ... FROM "CarrierDriver" cd WHERE cd."orgId" ...` (raw camelCase/PascalCase)
      vs a Prisma-generated query (which uses `carrier_drivers` and quoted snake_case columns).
    - The SQLSTATE code (42P01 = undefined_table, 42703 = undefined_column).

    If `get_logs` truncates, query `SELECT * FROM information_schema` is NOT the source —
    instead try the Supabase log views via `execute_sql` if exposed, or widen the time
    window incrementally. Record exactly which retrieval method yielded the statement text.

    Enumerate every distinct failing identifier seen:
    - `"CarrierDriver"` (PascalCase table name)
    - `cd.orgId`, `cd.firstName` (camelCase columns)
    - `trigger` (vs real `triggerKey`)
    - `notificationTemplateId`, `subject` (confirm against real column names)
    - `grid_preferences` (vs real `grid_preference`)
  </action>
  <verify>
    461-SUMMARY.md contains a "Smoking Gun — Full Statement Text" section with the verbatim
    failing STATEMENT for at least the `CarrierDriver` / `orgId` / `triggerKey` errors, plus
    the SQLSTATE code for each. If Postgres did not log statement text, that fact is stated
    explicitly with the retrieval attempts made.
  </verify>
  <done>
    The full (or best-available) failing statement text for each distinct error in the
    18:18-18:37 window is captured verbatim, classified by SQLSTATE, with the retrieval
    method documented.
  </done>
</task>

<task type="auto">
  <name>Task 2: Locate each failing query in code and classify raw-SQL vs Prisma ORM</name>
  <files>(read-only — no files modified)</files>
  <action>
    For each failing route seen in Vercel logs — /api/v1/carrier/dispatches,
    /api/v1/carrier/notifications, /api/v1/carrier/messages/conversations,
    /api/v1/carrier/dashboard/messages, /api/user/grid-preferences (and any others surfaced
    in Task 1) — find the actual query in code under apps/web/src.

    Use Grep to find every raw-SQL usage and the offending identifiers:
    - `\$queryRaw`, `\$executeRaw`, `\$queryRawUnsafe`, `\$executeRawUnsafe`
    - `"CarrierDriver"` (PascalCase model name used as a table name in raw SQL)
    - `\borgId\b`, `\bfirstName\b` referenced as SQL column literals (cd.orgId etc.)
    - a literal column named `trigger` (vs `triggerKey`)
    - `grid_preferences` (vs `grid_preference`)

    For EACH hit, cite file:line and quote the surrounding query. Classify:
    - RAW SQL with literal identifiers → casing/name bug candidate (this is hypothesis b)
    - Prisma ORM (`prisma.carrierDriver.findMany`, etc.) → would use @map automatically,
      so a P2022/42P01 from here would instead indicate true drift (hypothesis a)

    Critically: determine whether `relation "CarrierDriver" does not exist` originates from
    raw SQL that used the Prisma MODEL name (`CarrierDriver`) instead of the mapped TABLE
    name (`carrier_drivers`). That is the signature of hand-written SQL using the wrong
    identifier. Confirm the model→table @@map in apps/web/prisma/schema.prisma
    (CarrierDriver @@map("carrier_drivers"), org_id via @map, etc.).
  </action>
  <verify>
    461-SUMMARY.md contains an "Offending Queries" table: route | file:line | raw-or-ORM |
    failing identifier | correct identifier. Each `CarrierDriver`/`orgId`/`trigger`/
    `grid_preferences` error is traced to a specific file:line OR explicitly marked
    "not found in code" (which would point toward hypothesis a).
  </verify>
  <done>
    Every distinct failing identifier from Task 1 is either tied to a raw-SQL file:line with
    the exact fix, or shown to come from Prisma ORM / not present in code.
  </done>
</task>

<task type="auto">
  <name>Task 3: Issue the (a)/(b) verdict and explain 18:18 onset / 18:37 recovery</name>
  <files>(read-only — no files modified)</files>
  <action>
    Reconcile the two views definitively. Using the QT-460 finding (zero schema drift —
    all tables/columns present, triggerKey correct, grid_preference exists) plus the
    Task 1 statement text and Task 2 code evidence, pick ONE verdict:
    - (a) missing schema [QT-459 view], OR
    - (b) raw-SQL casing/name bugs against existing tables [QT-460 view]

    If (b): produce the complete list of offending raw queries with the exact identifier
    fix for each (e.g. `"CarrierDriver"` → `carrier_drivers`, `cd."orgId"` → `cd.org_id`,
    `cd."firstName"` → `cd.first_name`, `trigger` → `"triggerKey"`,
    `grid_preferences` → `grid_preference`). Note any that need quoting because the real
    column is camelCase (e.g. `triggerKey` must be double-quoted in raw SQL).

    Explain the 18:18 onset / 18:37 recovery. If the tables always existed and the SQL was
    always wrong, the code path must only be hit under specific conditions. Investigate and
    state the most likely trigger, citing evidence:
    - A deploy at ~18:18 introduced/changed the raw query (check git log around that time
      for commits touching the offending files)
    - A specific tenant/feature path only exercised during that window
    - A cold container / first-hit-after-deploy code path
    - A revert/redeploy at ~18:37 that removed the bad query
    Cross-reference git log timestamps for the offending files. If the data cannot
    distinguish causes, list the candidates ranked by likelihood with the evidence for each.

    Write all findings to 461-SUMMARY.md. Apply nothing.
  </action>
  <verify>
    461-SUMMARY.md contains: a single bolded VERDICT (a) or (b) with one-paragraph
    justification citing both the statement text and file:line; if (b), a complete
    "Offending Query → Exact Fix" list; and an "Onset & Recovery" section explaining
    18:18-18:37 with git-log or log evidence (or ranked candidates if indeterminate).
  </verify>
  <done>
    A definitive, evidence-backed verdict exists with the fix list (if code-side) and the
    onset/recovery explanation. No production or code changes were made.
  </done>
</task>

</tasks>

<verification>
- 461-SUMMARY.md exists with: Smoking Gun statement text, Offending Queries table,
  bolded (a)/(b) verdict, exact-fix list, Onset & Recovery section.
- Every claim is backed by either verbatim log text, file:line, or git-log timestamp.
- No code files modified (`git status` shows no new changes under apps/web/src).
- No DDL/DML executed — only SELECT queries and MCP read tools used.
</verification>

<success_criteria>
- A single (a)/(b) verdict is issued with evidence from BOTH the Postgres statement text
  and the code (file:line).
- If (b): every offending raw query is listed with its exact identifier fix.
- The 18:18 onset and 18:37 recovery are explained or ranked with evidence.
- Nothing was applied to production or the codebase.
</success_criteria>

<output>
After completion, create `.planning/quick/461-read-only-diagnostic-reconcile-qt-459-vs/461-SUMMARY.md`
</output>
