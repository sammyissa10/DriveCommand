---
phase: quick-372
plan: 372
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "Diagnosis report exists at .planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md"
    - "Report shows every field on the New Facility form"
    - "Report shows every field on the CarrierFacility Prisma model"
    - "Report shows every column on the facilities DB table"
    - "Report quotes TC-04 steps 4 and 5 verbatim from the QA test script"
    - "Report contains a 4-column comparison table for Lumper Required + Appointment Required"
    - "Report concludes whether TKT-0023 is resolved or still open with evidence"
    - "No source code, migrations, or DB rows are modified during diagnosis"
  artifacts:
    - path: ".planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md"
      provides: "TKT-0023 audit findings — form vs schema vs DB vs spec"
      contains: "Lumper Required"
  key_links:
    - from: "372-DIAGNOSIS.md"
      to: "apps/web/src/components/carrier/facility-form.tsx"
      via: "form field inventory"
      pattern: "facility-form"
    - from: "372-DIAGNOSIS.md"
      to: "apps/web/prisma/schema.prisma"
      via: "CarrierFacility model field list"
      pattern: "model CarrierFacility"
    - from: "372-DIAGNOSIS.md"
      to: "Supabase facilities table"
      via: "information_schema.columns query"
      pattern: "facilities"
---

<objective>
Diagnose TKT-0023: determine whether the "Lumper Required" and "Appointment Required" toggles are missing from the New Facility form, and whether the gap exists in the spec, DB schema, Prisma model, and/or UI.

Purpose: TKT-0023 was filed 2026-04-05 and may already be resolved during intervening work. We need a single source of truth before deciding whether to reopen, close, or fix.
Output: A single diagnostic report at `.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md` with field inventory, comparison table, and verdict.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Source artifacts to inspect (read-only)
@apps/web/src/components/carrier/facility-form.tsx
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Inventory facility form, Prisma model, DB schema, and spec references</name>
  <files>.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md</files>
  <action>
    Gather evidence from four sources. DO NOT modify any code, migrations, or DB rows.

    1. **Form field inventory** — Locate the New Facility form component. Start with
       `apps/web/src/components/carrier/facility-form.tsx`. If not found, use Glob/Grep:
       - `Glob` pattern `apps/web/src/**/facility-form*`
       - `Grep` pattern `New Facility` in `apps/web/src/app/carrier/facilities/new/**`
       Read the form file in full. List every form field by name + type (input/select/checkbox/switch).
       Explicitly note whether any field references `lumper` or `appointment` (case-insensitive).

    2. **Prisma model inventory** — Read `apps/web/prisma/schema.prisma`. Locate the
       `CarrierFacility` model (or whichever model maps to `facilities`). List every field
       with its type, defaults, and nullability. Highlight any field whose name contains
       `lumper` or `appointment`.

    3. **DB column inventory** — Call the Supabase MCP `execute_sql` tool with:
       `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'facilities' ORDER BY ordinal_position;`
       Record the full result set in the report. Highlight any column whose name contains
       `lumper` or `appointment`.

    4. **Project-wide grep** — Use the Grep tool twice:
       - pattern `lumper` (case-insensitive, `-C 2`, content mode)
       - pattern `appointment` (case-insensitive, `-C 2`, content mode), filtered to
         exclude obvious unrelated noise (e.g., calendar libs in node_modules — use the
         repo as path).
       For each hit, capture `file:line` plus the 2-line context.

    5. **Spec reference (TC-04)** — Find the QA test script. Try in order:
       - `Glob` pattern `docs/**/DriveCommand_QA_Test_Script*`
       - `Glob` pattern `docs/specs/**/QA*`
       - `Grep` pattern `TC-04` across the repo
       Open the matching file (HTML/PDF/MD). Locate TC-04. Quote steps 4 and 5 verbatim
       in the report. If the file is binary (PDF) and unreadable, note that explicitly
       and fall back to grepping for `TC-04` text alone.

    Write a draft of `372-DIAGNOSIS.md` capturing the four inventories with exact quoted
    text and `file:line` citations. Do not yet build the comparison table or verdict —
    that is Task 2.
  </action>
  <verify>
    `372-DIAGNOSIS.md` exists and contains four labelled sections:
    "Form Fields", "Prisma Model", "DB Columns", "Project Grep + TC-04". Each section
    references concrete file paths or query results. No files outside `.planning/` are
    modified.
  </verify>
  <done>
    Diagnosis evidence collected: form inventory, Prisma inventory, DB inventory, grep
    hits, and TC-04 spec quote (or documented inability to read source) all captured in
    the report draft. Zero code or DB modifications.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build comparison table, render verdict, and identify last-touched commit</name>
  <files>.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md</files>
  <action>
    Append to `372-DIAGNOSIS.md` (from Task 1) the following sections.

    1. **Comparison table** — produce this markdown table using the evidence from Task 1:

       ```
       | Field                | In Spec (TC-04)? | In DB schema? | In Prisma model? | In UI form? |
       |----------------------|------------------|---------------|------------------|-------------|
       | Lumper Required      | yes/no + quote   | yes/no + col  | yes/no + field   | yes/no      |
       | Appointment Required | yes/no + quote   | yes/no + col  | yes/no + field   | yes/no      |
       ```

       Each cell must cite the evidence: column name, prisma field name, form field name,
       or spec line reference. "no" cells must explicitly say "absent — searched X and
       found nothing".

    2. **Verdict** — one of two outcomes, with reasoning grounded in the table:
       - **RESOLVED** — both fields present in DB, Prisma, and UI. TKT-0023 can be
         closed. Provide the file paths + line numbers proving each field is wired
         end-to-end.
       - **STILL OPEN** — at least one of the four cells per row is "no". Identify
         exactly which layer(s) are missing the field.

    3. **If STILL OPEN, last-touched commit** — run via Bash (read-only):
       `git log -1 --format="%h %ad %s" --date=short -- apps/web/src/components/carrier/facility-form.tsx`
       Record the commit hash, date, and subject. If the file path differs (Task 1 may
       have found a different location), use the actual path discovered. Do NOT propose
       a fix or new tasks — that belongs to a follow-up planning round.

    4. **Constraints recap** — append a short "Scope" section reaffirming: no code
       modified, no migrations run, no DB rows changed, no fix proposed.

    Reread `372-DIAGNOSIS.md` once to confirm: (a) all four evidence sections from Task 1
    are intact, (b) comparison table renders, (c) verdict is unambiguous, (d) if still
    open, last-touched commit metadata is present.
  </action>
  <verify>
    `372-DIAGNOSIS.md` contains a 2-row, 5-column comparison table; an explicit
    RESOLVED-or-STILL-OPEN verdict with citations; and (if open) a `git log` line for
    the last commit touching the facility form file. `git status` shows no modifications
    outside `.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/`.
  </verify>
  <done>
    Diagnostic report is complete and self-contained. A reader can decide in under 60
    seconds whether to close TKT-0023 or schedule a fix, based on the table and verdict
    alone. No source code, schema, or DB state was changed.
  </done>
</task>

</tasks>

<verification>
- `.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md` exists
- Report contains: Form Fields section, Prisma Model section, DB Columns section, Project Grep + TC-04 section, Comparison Table, Verdict, Scope recap
- `git status` shows no modifications to any file outside `.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/`
- No `prisma migrate` or `supabase` write commands were issued
</verification>

<success_criteria>
- Single diagnostic report file produced
- 4-source evidence (form / Prisma / DB / spec+grep) all captured with citations
- Comparison table for `Lumper Required` and `Appointment Required` populated
- Verdict (RESOLVED or STILL OPEN) is unambiguous and cites the table
- If STILL OPEN, the last commit touching the facility form is identified by hash/date/subject
- Zero code, migration, or DB modifications
</success_criteria>

<output>
After completion, create `.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-SUMMARY.md` summarising:
- Verdict (RESOLVED / STILL OPEN)
- Which of the 2 fields × 4 layers are present vs missing
- Link to `372-DIAGNOSIS.md` for full evidence
- If STILL OPEN, recommended next step (e.g., "run `/gsd:quick` to plan the fix")
</output>
