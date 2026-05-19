---
phase: 377-tkt-0030-diagnosis-audit-recurring-frequ
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "The exact location and input type of the recurring frequency field on the desktop carrier route template form is known"
    - "Whether a parallel mobile route template create screen exists (and what input it uses) is determined"
    - "The Prisma field definition for recurrence/frequency on RouteTemplate is documented"
    - "Any live DB CHECK constraint on the frequency column is captured verbatim from Supabase"
    - "Spec-defined canonical values (if any) are surfaced; if none exist, this is stated explicitly"
    - "A clear status verdict is rendered: already resolved, open with decision needed, or feature not yet built"
  artifacts:
    - path: ".planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/377-SUMMARY.md"
      provides: "Full diagnosis report with comparison table and verdict"
      contains: "Layer comparison table, status verdict, recommended (but not chosen) canonical values"
  key_links:
    - from: "diagnosis findings"
      to: "TKT-0030 verdict"
      via: "comparison table → status statement"
      pattern: "Status:|Verdict:|TKT-0030"
---

<objective>
Diagnose TKT-0030: the carrier route template form's "recurring frequency" field is reportedly a textbox but should be a dropdown. Determine where the field lives (desktop, mobile, both), its current input type, the Prisma/DB shape, and any spec-defined canonical values. NO code changes. Output is a single SUMMARY.md with a layer comparison table and a status verdict.

Purpose: Confirm whether TKT-0030 is already fixed, still open (and what decision is needed), or references a feature that doesn't exist yet.
Output: `.planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/377-SUMMARY.md`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Inspect desktop route template form and Prisma schema</name>
  <files>
    READ ONLY:
    - apps/web/src/app/(owner)/carrier/templates/new/page.tsx
    - The RouteTemplateForm component referenced by the page (search apps/web for `RouteTemplateForm` and any file named similarly under apps/web/src/components or apps/web/src/app/(owner)/carrier/templates)
    - Any sibling files involved in template creation (edit page, server action, schema/zod validation)
    - apps/web/prisma/schema.prisma (RouteTemplate model)
    - packages/validation/src/* (search for routeTemplate / RouteTemplate / recurrence / frequency)
  </files>
  <action>
    Diagnosis only — do NOT modify any files.

    1. Locate the carrier templates "new" route:
       - Read `apps/web/src/app/(owner)/carrier/templates/new/page.tsx`
       - Identify the form component it renders (likely `RouteTemplateForm` or similar)
       - Read that form component end-to-end

    2. Find the recurring frequency field. Search the form (and any imported field components) for any of:
       - `recurringFrequency`, `recurrence_frequency`, `recurrence`, `frequency`, `cadence`, `recurring`, `schedule`, `repeat`
       - Use Grep across apps/web/src for these identifiers if not found inline

    3. For the matched field, capture:
       a. Field name (exact identifier in code)
       b. Current input type: `<input type="text">`, `<Input>`, `<Select>`, `<RadioGroup>`, `<Combobox>`, etc.
       c. The exact JSX block (paste verbatim into SUMMARY.md, including label + control)
       d. Whether values are constrained anywhere on the client (zod enum, options array, etc.)

    4. Inspect `apps/web/prisma/schema.prisma`:
       - Locate the `RouteTemplate` model (note: table name may be `route_templates` via `@@map`)
       - For any recurrence/frequency/cadence field, capture:
         - Field name, TS type, `@db.*` decorator, default value, `@@map`, related enum (if any)
       - If no such field exists, state that explicitly

    5. Inspect packages/validation/src for route template schemas:
       - Grep for `routeTemplate`, `RouteTemplate`, `frequency`, `recurrence`
       - Capture any zod enum / literal union for the frequency field

    If the field does NOT exist anywhere on the desktop form, state that explicitly — it may be a not-yet-built feature.

    Do not write the SUMMARY yet — collect findings into scratch notes for Task 3.
  </action>
  <verify>
    Findings collected for: (a) desktop form field + JSX, (b) Prisma field, (c) any zod/validation enum. Each item is either documented or explicitly noted as "not present".
  </verify>
  <done>
    Desktop form, Prisma model, and shared validation have all been read and the recurring frequency field's current state across these layers is captured (or absence is documented).
  </done>
</task>

<task type="auto">
  <name>Task 2: Check live DB CHECK constraints, mobile app parity, and spec canonical values</name>
  <files>
    READ ONLY:
    - Supabase (via MCP) — pg_constraint introspection
    - apps/mobile/app/** — search for any route template create screen
    - docs/specs/** and /mnt/project (if accessible) — grep for canonical recurrence values
  </files>
  <action>
    Diagnosis only — do NOT modify any database or files.

    1. Query Supabase via the Supabase MCP tool for CHECK constraints on the route_templates table.
       Execute (via `execute_sql` MCP tool):
       ```sql
       SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'route_templates'::regclass
         AND contype = 'c';
       ```
       Also run a fallback if the table name differs:
       ```sql
       SELECT table_name FROM information_schema.tables
       WHERE table_name ILIKE '%route_template%' OR table_name ILIKE '%routetemplate%';
       ```
       Capture every CHECK constraint definition verbatim. Flag any that mention frequency/recurrence/cadence.

    2. Also pull the column definition for the frequency-ish column from `information_schema.columns`:
       ```sql
       SELECT column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'route_templates';
       ```
       Capture the row for the frequency column (if present).

    3. Mobile app parity check:
       - List `apps/mobile/app/(owner)/` recursively and look for any folder/file matching `templates`, `route-templates`, `routes`, `recurring`
       - If a route template create screen exists, read it and capture:
         a. Field name for frequency
         b. Input type (TextInput / Picker / dropdown component / etc.)
         c. Verbatim JSX snippet
       - If no such screen exists, state that explicitly.

    4. Spec-defined canonical values search:
       - Grep `docs/specs/` for: `recurring`, `recurrence`, `frequency`, `cadence`, `Daily`, `Weekly`, `Bi-weekly`, `Monthly`
       - Specifically check `docs/specs/workflow-engine.md` and any DriveCommand spec PDFs/markdowns related to route templates
       - If `/mnt/project` is not accessible from this environment, note that and skip — do NOT fabricate values
       - Capture canonical values verbatim if found; otherwise state "no spec-defined canonical values found"

    Collect all findings into scratch notes for Task 3.
  </action>
  <verify>
    All three sub-investigations produced an explicit answer (either captured data OR explicit "not present / not accessible" note). No silent omissions.
  </verify>
  <done>
    DB CHECK constraint, mobile parity, and spec canonical values are each documented (present-with-evidence or explicitly-absent). Ready to compose the comparison table.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write SUMMARY.md diagnosis report with comparison table and verdict</name>
  <files>
    CREATE:
    - .planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/377-SUMMARY.md
  </files>
  <action>
    Compose the diagnosis report. NO code changes anywhere else.

    Structure of `377-SUMMARY.md`:

    ```
    # TKT-0030 — Recurring Frequency Field Diagnosis

    **Status:** {Resolved | Open — decision needed | Feature not built}
    **Filed:** Apr 7, 2026 by demo@drivecommand.com (Mobile platform tag)
    **Page reported:** /carrier/templates/new
    **Diagnosis date:** 2026-05-19

    ## 1. Desktop form
    - File: `apps/web/src/app/(owner)/carrier/templates/new/page.tsx`
    - Form component: `<exact path>`
    - Field identifier: `<name or "not present">`
    - Current input type: `<text input | Select | RadioGroup | not present>`
    - Verbatim JSX:
      ```tsx
      <paste exact block>
      ```
    - Client-side value constraint: `<zod enum / options array / none>`

    ## 2. Prisma schema (RouteTemplate)
    - File: `apps/web/prisma/schema.prisma`
    - Field: `<name : Type @decorators>` (or "not present")
    - Related enum (if any): `<enum block>` or "none"

    ## 3. Shared validation (packages/validation)
    - `<file path>` — `<zod schema fragment>` or "no route template schema in shared validation"

    ## 4. Live DB CHECK constraints (Supabase introspection)
    Query: `pg_constraint WHERE conrelid = 'route_templates'::regclass AND contype = 'c'`
    - Result:
      | conname | definition |
      |---------|------------|
      | ... | ... |
    - Column definition (information_schema.columns):
      `<column_name | data_type | udt_name | varchar length | nullable | default>`
    - Frequency-related constraint: `<verbatim definition>` or "none"

    ## 5. Mobile app parity (apps/mobile)
    - Route template create screen: `<file path or "does not exist">`
    - If exists — field, input type, verbatim JSX

    ## 6. Spec-defined canonical values
    - Sources searched: `docs/specs/`, `docs/specs/workflow-engine.md`, `/mnt/project` (if accessible)
    - Canonical values found: `<verbatim list>` or "no spec-defined canonical values found"

    ## 7. Comparison table
    | Layer | Current state |
    |-------|---------------|
    | Desktop form input | text / select / radio / not present |
    | Mobile form input | <state or "screen does not exist"> |
    | Prisma field type | String / enum / not present |
    | DB CHECK constraint | none / "<verbatim>" |
    | Spec-defined canonical values | none / "<list>" |

    ## 8. Verdict
    Choose ONE and justify in one paragraph:
    - **A — Already resolved:** Desktop field is a `<Select>` (or equivalent) with proper bounded values. Close TKT-0030.
    - **B — Open, decision needed:** Field is still a free-text input. Fix requires (i) swap to `<Select>` component, (ii) decide canonical value list before implementing. Decision blocker because no spec values exist (or spec values exist but conflict with current data).
    - **C — Feature not built:** No recurrence/frequency field exists on the route template form. TKT-0030 may have been filed against an unbuilt feature; recommend clarifying with the reporter.

    ## 9. Recommended (NOT chosen) canonical values
    Only fill in if Verdict = B and no spec exists. Note explicitly: "Recommendation only — requires user/product decision before implementation."
    - Daily
    - Weekdays (Mon–Fri)
    - Weekly
    - Bi-weekly
    - Monthly
    - Custom

    ## 10. Files inspected (no modifications)
    - <list every file read during diagnosis>

    ## 11. Notes
    - Mobile platform tag on ticket: user likely opened the desktop site in a mobile browser since the reported URL is `/carrier/templates/new` (desktop owner route). Confirmed/contradicted by mobile parity finding above.
    - Any other observations (e.g. inconsistency between Prisma and DB CHECK).
    ```

    Fill in every section from the Task 1 + Task 2 scratch notes. Use verbatim values; do not paraphrase JSX or SQL output. If a section's data was "not present", state that explicitly — do not omit the section.

    Do NOT modify any source files, schema files, or run any migrations. Do NOT pick canonical values in section 8 — only recommend in section 9 if applicable.
  </action>
  <verify>
    `.planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/377-SUMMARY.md` exists. All 11 sections are present. Section 8 (Verdict) contains exactly one of A/B/C with a one-paragraph justification grounded in the comparison table. No source files outside `.planning/quick/377-*` were modified.
  </verify>
  <done>
    SUMMARY.md is written and renders a defensible verdict. The reader can determine TKT-0030's status without re-running any of the diagnosis queries.
  </done>
</task>

</tasks>

<verification>
- `377-SUMMARY.md` exists at the expected path
- Comparison table is populated for all 5 layers (with "not present" where applicable)
- Verdict is one of: Resolved / Open (decision needed) / Feature not built
- No files outside `.planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/` were modified
- No DB writes were performed (only SELECT introspection queries)
</verification>

<success_criteria>
- TKT-0030 status is clearly resolved/open/not-built with evidence
- If "Open", the blocking decision (canonical value list) is flagged explicitly and NOT pre-decided by Claude
- All findings are verbatim (JSX, Prisma fragment, SQL output) so a follow-up fix plan can be written without re-investigation
</success_criteria>

<output>
After completion, the diagnosis report lives at:
`.planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/377-SUMMARY.md`
</output>
