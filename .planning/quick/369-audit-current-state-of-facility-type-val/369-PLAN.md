---
phase: 369-audit-current-state-of-facility-type-val
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
read_only: true

must_haves:
  truths:
    - "Exact UI dropdown options for facility_type are documented"
    - "Exact Prisma schema declaration for CarrierFacility.facility_type is documented"
    - "Live DB CHECK constraint(s) on facilities.facility_type are documented"
    - "Canonical spec values (if any) for facility_type are documented"
    - "Comparison table covering all sources is produced"
    - "Final status (TKT-0016 resolved vs still open) is determined with evidence"
    - "Most recent git commit touching the New Facility form is identified"
  artifacts:
    - path: ".planning/quick/369-audit-current-state-of-facility-type-val/369-SUMMARY.md"
      provides: "Read-only diagnosis report for TKT-0016 facility_type drift"
      contains: "Comparison table + status determination + git log entry"
  key_links:
    - from: "UI dropdown options"
      to: "DB CHECK constraint allowed values"
      via: "comparison table"
      pattern: "facility_type"
    - from: "DB CHECK constraint allowed values"
      to: "Prisma schema field declaration"
      via: "comparison table"
      pattern: "facility_type"
    - from: "Spec document values"
      to: "UI / DB / Prisma"
      via: "comparison table"
      pattern: "facility_type"
---

<objective>
Diagnose the current state of `facility_type` values across four sources (UI dropdown, Prisma schema, live DB CHECK constraint, project spec docs) to determine whether TKT-0016 is already resolved or still open.

Purpose: TKT-0016 tracks drift between facility_type values used in the New Facility form, the Prisma schema, the DB CHECK constraint, and the canonical spec. Before any fix is planned, we need a definitive read-only audit of the current state of all four sources.

Output: A 369-SUMMARY.md file documenting exact values from each source, a comparison table, a resolved/open determination with evidence, and the most recent git commit touching the New Facility form.

**STRICT CONSTRAINT: This is read-only diagnosis. No file edits. No DB migrations. No `apply_migration`, no `git commit`, no `Write`/`Edit` calls except the final 369-SUMMARY.md report file.**
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/369-audit-current-state-of-facility-type-val/

# Likely-relevant paths (verify via Glob/Grep before reading):
# apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
# apps/web/prisma/schema.prisma
# docs/specs/ (look for facility_type references in PDFs/MDs)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gather facility_type values from UI, Prisma, live DB, and spec</name>
  <files>
    (READ-ONLY — no files modified in this task)
  </files>
  <action>
Perform read-only investigation across all four sources. Do NOT modify any files or run any DB migrations.

**Step 1 — UI dropdown options:**
- Find the New Facility form. Try this path first:
  `apps/web/src/app/(owner)/carrier/facilities/new/page.tsx`
- If not at that exact path, use Glob: `apps/web/src/app/**/facilities/new/**` and Grep for `facility_type` across `apps/web/src/`.
- Read the form file and extract the EXACT dropdown options array/list for `facility_type`. Record each value verbatim (case-sensitive, including any underscores/hyphens/spaces).

**Step 2 — Prisma schema declaration:**
- Read `apps/web/prisma/schema.prisma` (use Grep to locate the `CarrierFacility` model first, then Read the relevant line range to avoid loading the whole file).
- Extract the EXACT field declaration for `facility_type` (type, optionality, default, enum reference if any).
- If `facility_type` references a Prisma `enum`, locate and record the enum definition with all values.

**Step 3 — Live DB CHECK constraints (Supabase MCP, READ-ONLY):**
- Use the Supabase MCP `execute_sql` tool to run EXACTLY this query:
  ```sql
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'facilities'::regclass
    AND contype = 'c';
  ```
- Record every CHECK constraint returned. For any constraint mentioning `facility_type`, extract the exact list of allowed values from the constraint definition.
- If the table is named differently (e.g., `carrier_facilities`), try that table name as well. Confirm correct table name by checking Prisma `@@map` directive on `CarrierFacility`.
- **DO NOT use `apply_migration` or any write tool.** Only `execute_sql` for SELECT queries.

**Step 4 — Canonical spec values:**
- Glob for spec files: `docs/specs/**/*.md`, `docs/specs/**/*.pdf`, and any root-level `*.md` / `*.pdf` files.
- Grep for `facility_type` (case-insensitive) across `docs/`, the repo root, and any `specs/` directory.
- For each spec hit:
  - If it's an `.md` file, Read the relevant section.
  - If it's a `.pdf` file, use the Read tool with the `pages` parameter to read the relevant pages (use Grep results to identify which pages).
- Record what each spec says the canonical `facility_type` values should be. If no spec mentions `facility_type`, record "No spec values found."

**Step 5 — Git log:**
- Run: `git log --oneline -5 -- apps/web/src/app/\\(owner\\)/carrier/facilities/new/page.tsx`
- If the path differs, substitute the actual file path discovered in Step 1.
- Record the most recent commit hash + subject line touching that file.

Save raw notes from each step in your scratchpad — you will compile them in Task 2.
  </action>
  <verify>
- UI dropdown options listed verbatim
- Prisma `facility_type` declaration captured (and enum definition if applicable)
- DB CHECK constraint query executed via Supabase MCP, results captured
- Spec search performed across `docs/` and root, results captured (even if empty)
- `git log` entry for New Facility form captured
- NO files modified, NO migrations applied
  </verify>
  <done>
All four sources investigated read-only, raw values captured for compilation in Task 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build comparison table, determine status, write 369-SUMMARY.md</name>
  <files>
    .planning/quick/369-audit-current-state-of-facility-type-val/369-SUMMARY.md
  </files>
  <action>
Compile findings from Task 1 into a final diagnosis report. **This is the ONLY file write in this entire plan.**

Build the report with the following sections:

**1. Sources investigated**
- File path + line numbers of the UI dropdown
- File path + line numbers of the Prisma model (and enum, if applicable)
- DB table name + constraint names queried
- Spec files searched (paths) + whether they mention `facility_type`

**2. Raw values per source**

Under each source heading, list values verbatim:

```
### UI Dropdown (apps/web/src/app/.../new/page.tsx:NN)
- VALUE_A
- VALUE_B
- ...

### Prisma Schema (apps/web/prisma/schema.prisma:NN)
field declaration: `facility_type  String  @db.VarChar(...)` (or enum FacilityType?)
enum values (if any): [...]

### DB CHECK Constraint (constraint name: facility_type_check)
allowed values: ('VALUE_A', 'VALUE_B', ...)
exact constraint def: <pg_get_constraintdef output>

### Spec (docs/specs/<file>.pdf, page N)
canonical values: [...]   OR   "No spec values found."
```

**3. Comparison table**

Build a markdown table with one row per UNIQUE value found across ALL sources. Use checkmarks for presence:

```
| Value | In Spec? | In DB CHECK? | In Prisma? | In UI Dropdown? |
|-------|----------|--------------|------------|-----------------|
| WAREHOUSE | Y | Y | Y (free string) | Y |
| DISTRO_CENTER | Y | N | Y (free string) | N |
| ...
```

Note: If Prisma stores `facility_type` as a free `String` (no enum), mark Prisma column as "Y (free string)" since it doesn't constrain values.

**4. Status determination**

Based on the comparison table:
- **If all sources agree** (every value appears in every applicable source): write **"TKT-0016 already resolved."** and include the most recent git commit hash + subject touching the New Facility form as evidence.
- **If mismatch exists**: write **"TKT-0016 still open."** and list each out-of-sync value with which source(s) it's missing from, e.g.:
  - `DISTRO_CENTER` — in Spec + Prisma, **missing from DB CHECK and UI dropdown**
  - `OTHER` — in UI dropdown only, **missing from Spec, DB CHECK, Prisma enum**

**5. Most recent git commit**

Quote the `git log` output line from Task 1 Step 5.

**6. Recommendation (one paragraph max)**

- If resolved: "No action needed."
- If open: One sentence stating which source(s) need updating and the canonical source of truth (typically the spec).

**Constraints on this task:**
- Write ONLY to `.planning/quick/369-audit-current-state-of-facility-type-val/369-SUMMARY.md`
- Do NOT modify any source files, Prisma schema, migration files, or run any DB writes
- Do NOT git commit (this plan is read-only diagnosis; the user will decide next steps based on the report)
  </action>
  <verify>
- `.planning/quick/369-audit-current-state-of-facility-type-val/369-SUMMARY.md` exists
- File contains all 6 sections: Sources, Raw values, Comparison table, Status determination, Git commit, Recommendation
- Comparison table covers every unique value found across UI/Prisma/DB/Spec
- Status determination is explicit ("TKT-0016 already resolved." OR "TKT-0016 still open.")
- No other files modified, no DB writes, no git commit
  </verify>
  <done>
369-SUMMARY.md report exists with full diagnosis; user can read it and decide whether to plan a fix or close TKT-0016.
  </done>
</task>

</tasks>

<verification>
- All four sources audited read-only (UI, Prisma, live DB CHECK, spec)
- 369-SUMMARY.md exists with comparison table and explicit status determination
- Zero files modified outside `.planning/quick/369-audit-current-state-of-facility-type-val/`
- Zero DB migrations applied
- Zero git commits created
</verification>

<success_criteria>
- A reader of 369-SUMMARY.md can answer: "What values does each source allow for facility_type?" with exact strings
- A reader can answer: "Is TKT-0016 resolved or still open?" with one explicit sentence
- A reader can answer: "If open, which source(s) are out of sync?" with a specific list
- A reader can answer: "When was the New Facility form last touched?" with a commit hash + subject
</success_criteria>

<output>
After completion, the report lives at:
`.planning/quick/369-audit-current-state-of-facility-type-val/369-SUMMARY.md`

This serves as both the execution summary and the diagnosis deliverable. No separate SUMMARY file is needed since the report IS the deliverable.
</output>
