---
phase: quick-370
plan: 370
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "Every read site of carrier_catalog_meta in apps/web/src is enumerated with file:line"
    - "Every read site of carrier_catalog_meta in apps/mobile is enumerated with file:line"
    - "Each read site is annotated with whether it filters by enum_group = 'facility_type'"
    - "All distinct enum_group values consumed in the codebase are inventoried"
    - "Final verdict states unambiguously whether facility_type values from carrier_catalog_meta are read anywhere"
  artifacts:
    - path: ".planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md"
      provides: "Diagnosis report with read sites, enum_group inventory, and verdict"
      contains: "Verdict"
  key_links: []
---

<objective>
TKT-0016 follow-up diagnosis: determine whether anything in the DriveCommand codebase actually reads `carrier_catalog_meta` rows filtered by `enum_group = 'facility_type'`.

Context: QT 369 confirmed the UI/DB fix for TKT-0016 (facility_type CHECK constraint) is in place, but `carrier_catalog_meta` still contains out-of-sync `facility_type` rows (`shipper`/`receiver`/`fuel_stop`/`other`) that do not match the DB CHECK constraint. Before deciding how to fix the seed data, we must know whether any read path consumes these rows.

This is **READ-ONLY diagnosis**: no code changes, no DB changes, no migrations. Output is a written report only.

Purpose: De-risk the seed data fix by proving whether facility_type catalog rows are dead data or live data.
Output: `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` containing read sites, enum_group inventory, and final verdict.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/369-tkt-0016-prompt-1-diagnosis-which-table-d/369-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enumerate all read sites of carrier_catalog_meta and annotate facility_type filters</name>
  <files>.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md</files>
  <action>
    Perform a read-only grep audit across the codebase. Do NOT modify any source files.

    Step 1 — Grep for the table name in both casings across both apps:
      - Use Grep tool with pattern `carrier_catalog_meta` across `apps/web/src` (output_mode: content, -n: true)
      - Use Grep tool with pattern `carrier_catalog_meta` across `apps/mobile` (output_mode: content, -n: true)
      - Use Grep tool with pattern `carrierCatalogMeta` across `apps/web/src` (Prisma camelCase accessor) (output_mode: content, -n: true)
      - Use Grep tool with pattern `carrierCatalogMeta` across `apps/mobile` (output_mode: content, -n: true)
      - Also check `packages/` for any shared references: pattern `carrier_catalog_meta|carrierCatalogMeta` across `packages/` (multiline ok)

    Step 2 — For each hit found in Step 1:
      - Read enough surrounding context (Grep with -B 5 -A 15, or Read the file at the hit line) to classify the call site as READ, WRITE, MIGRATION, or COMMENT/DOC.
      - For READ sites only, determine whether the query filters by `enum_group = 'facility_type'` (or any constant resolving to that string). Look for `where: { enum_group: 'facility_type' }`, raw SQL with `enum_group = 'facility_type'`, or variable indirection.
      - Record exact file path + line number for each hit.

    Step 3 — Inventory all enum_group values consumed anywhere in the codebase:
      - Use Grep tool with pattern `enum_group` across the whole repo (output_mode: content, -n: true). Limit head_limit generously.
      - From the matches, collect the distinct literal string values passed in (e.g. `'facility_type'`, `'fuel_grade'`, `'route_status'`, etc.).
      - Note where each enum_group is used (file:line).

    Step 4 — Write the diagnosis report to `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` with these sections:
      1. **Scope** — what was searched, what was excluded.
      2. **Read sites of carrier_catalog_meta** — table with columns: file:line | app (web/mobile/packages) | classification (READ / WRITE / MIGRATION / DOC) | filters by enum_group='facility_type'? (yes/no/n-a) | brief snippet.
      3. **enum_group inventory** — table with columns: enum_group value | consumer file:line | purpose (if obvious).
      4. **Verdict** — one paragraph answering: "Is `carrier_catalog_meta` read anywhere with `enum_group = 'facility_type'`?" Answer: YES (list the sites) or NO (dead data, safe to delete or normalize without runtime risk). Include any caveats (e.g. dynamic enum_group passed via variable that may resolve to 'facility_type' at runtime).
      5. **Recommended next action** — one of:
         - "Delete the out-of-sync rows in carrier_catalog_meta (dead data)"
         - "Re-seed carrier_catalog_meta facility_type rows to match the DB CHECK constraint (live data, breaking)"
         - "Investigate dynamic call site at {file:line} before deciding"

    Constraints:
      - Do NOT modify any code or DB.
      - Do NOT run Prisma commands or hit the database.
      - If a grep returns zero hits, explicitly state "zero hits" in the report rather than omitting the section.
      - Use the Grep tool only; do not invoke `grep` or `rg` via Bash.
  </action>
  <verify>
    Read the produced `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` and confirm:
      - It contains all four required sections (Scope, Read sites, enum_group inventory, Verdict, Recommended next action).
      - Every grep hit found is listed with file:line.
      - The Verdict is unambiguous (YES or NO, not "maybe").
      - No source files outside the `.planning/` tree were modified (run `git status` to confirm only the SUMMARY.md is new/changed).
  </verify>
  <done>
    `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` exists, contains the four required sections, lists every read site with file:line, gives an unambiguous YES/NO verdict, and `git status` shows no source code changes outside `.planning/`.
  </done>
</task>

</tasks>

<verification>
- `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` exists and is readable.
- The report answers: "Is carrier_catalog_meta read anywhere with enum_group = 'facility_type'?" with YES (sites listed) or NO (dead data confirmed).
- `git status` shows no modifications to `apps/web/src`, `apps/mobile`, `packages/`, or `prisma/` — only the new SUMMARY.md.
</verification>

<success_criteria>
- Every occurrence of `carrier_catalog_meta` and `carrierCatalogMeta` in `apps/web/src`, `apps/mobile`, and `packages/` is enumerated.
- Each occurrence is classified (READ / WRITE / MIGRATION / DOC) and annotated with whether it filters by `enum_group = 'facility_type'`.
- All distinct `enum_group` literal values used in the codebase are inventoried with file:line.
- The verdict gives the user a clear go/no-go signal for the next TKT-0016 seed-data fix.
- Zero code or DB changes.
</success_criteria>

<output>
After completion, the SUMMARY.md at `.planning/quick/370-tkt-0016-follow-up-diagnosis-is-carrier-/370-SUMMARY.md` IS the deliverable (no separate summary needed since this quick task is itself a diagnosis report).
</output>
