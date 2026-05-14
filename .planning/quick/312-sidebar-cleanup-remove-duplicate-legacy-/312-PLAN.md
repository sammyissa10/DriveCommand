---
phase: quick-312
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "Sidebar no longer shows duplicate 'Driver Pay' entry under legacy Reports section"
    - "Only one active Driver Pay nav entry remains (under CARRIER OPS)"
    - "No legacy duplicates remain for Loads, Drivers, Trucks, Routes, CRM, or Payroll where a Carrier Ops equivalent exists"
    - "Surviving entries retain their original labels, paths, and role-based visibility"
    - "tsc --noEmit reports zero errors after edits"
  artifacts:
    - path: "apps/web/src/components/navigation/sidebar.tsx"
      provides: "Cleaned sidebar nav definition with duplicates removed"
      contains: "CARRIER OPS"
  key_links:
    - from: "apps/web/src/components/navigation/sidebar.tsx"
      to: "Carrier Ops Driver Pay route"
      via: "Single nav entry retained under CARRIER OPS section"
      pattern: "Driver Pay"
---

<objective>
Remove duplicate legacy navigation entries from the DriveCommand sidebar. The sidebar currently has duplicate Driver Pay entries (one under CARRIER OPS = active module from Phases 1-11, one under legacy Reports = stale). Same duplication pattern may exist for Loads, Drivers, Trucks, Routes, CRM, Payroll.

Purpose: Eliminate user confusion from stale duplicate sidebar entries. Surface only the canonical Carrier Ops modules to navigation.

Output:
- apps/web/src/components/navigation/sidebar.tsx — duplicate legacy entries removed
- Audit table printed (legacy entry | path | Carrier Ops equivalent | decision)
- After-state nav tree printed
- tsc --noEmit clean
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/navigation/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit sidebar nav structure and build duplicate decision table</name>
  <files>apps/web/src/components/navigation/sidebar.tsx</files>
  <action>
Read apps/web/src/components/navigation/sidebar.tsx in full (586 lines). Extract the complete current nav structure as a tree, organized by section (CARRIER OPS, legacy Reports, and any other sections that exist).

Build a duplicate audit table in this exact format:

| Legacy Entry | Path | Carrier Ops Equivalent | Decision |
|--------------|------|------------------------|----------|
| Driver Pay (legacy Reports) | /carrier/reports/driver-pay (or similar) | Driver Pay (CARRIER OPS) | REMOVE |
| ... | ... | ... | REMOVE / KEEP / INVESTIGATE |

Apply these decision rules:
- REMOVE: Legacy entry has a clear Carrier Ops equivalent serving the same domain (Loads, Drivers, Trucks, Routes, CRM, Payroll, Driver Pay)
- KEEP: Legacy entry has no Carrier Ops equivalent (e.g., a Reports sub-page with unique functionality)
- INVESTIGATE / FLAG: Ambiguous — entry's path or purpose is unclear, or Carrier Ops equivalent may differ in scope

Definitely include in the table:
- "Driver Pay" under legacy Reports section (confirmed REMOVE per task brief)

Also audit and include rows for: Loads, Drivers, Trucks, Routes, CRM, Payroll (look for legacy duplicates of each).

STOP CONDITION: If the total REMOVE count exceeds 6 entries, do NOT modify the file. Print the full audit table, then halt and report. Wait for user confirmation before proceeding to Task 2.

If REMOVE count is ≤ 6, print the audit table and proceed to Task 2.

Print the audit table to the agent's final output (this is for the user — not committed to a file).

DO NOT modify the sidebar.tsx file in this task. Read-only audit.
  </action>
  <verify>
- Audit table printed with all rows including paths and decisions
- Total REMOVE count is stated explicitly
- If REMOVE count > 6, halt is announced and Task 2 is skipped
  </verify>
  <done>
Audit table built. REMOVE list contains ≤ 6 entries OR halt has been triggered with full report.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove confirmed duplicate entries and verify typecheck</name>
  <files>apps/web/src/components/navigation/sidebar.tsx</files>
  <action>
ONLY proceed if Task 1's REMOVE count is ≤ 6. Otherwise this task is skipped.

For each entry marked REMOVE in the Task 1 audit:
1. Locate the entry object/JSX in apps/web/src/components/navigation/sidebar.tsx
2. Delete only that entry (the object literal or JSX element representing it)
3. Do not touch sibling entries, section labels, role guards, or styling

Hard constraints:
- DO NOT delete page files, route handlers, or components — only sidebar nav entries
- DO NOT rename surviving entries
- DO NOT alter role-based visibility logic for surviving entries (preserve any `role` / `roles` / permission checks on each surviving entry)
- DO NOT touch sidebar collapse behavior, sidebar styling, sidebar layout
- DO NOT touch any imports unless an import becomes unused as a direct consequence of removed entries (e.g., an icon used only by a removed entry) — if so, remove that unused import only
- INVESTIGATE / FLAG rows from Task 1 are LEFT IN PLACE — do not remove

After edits, run:
  npx tsc --noEmit

Working directory for tsc: apps/web (or wherever the web tsconfig lives — use the project's standard typecheck command).

Print the after-state nav tree (organized by section) to the agent's final output so the user can see what remains.
  </action>
  <verify>
- `npx tsc --noEmit` (in apps/web) exits with code 0 — zero TypeScript errors
- After-state nav tree printed showing surviving entries grouped by section
- Driver Pay under legacy Reports is gone; Driver Pay under CARRIER OPS remains
- No page files, route handlers, or components were modified or deleted
- File diff shows only deletions of nav entry objects/JSX (plus possibly unused icon imports)
  </verify>
  <done>
Sidebar.tsx has duplicate legacy entries removed (≤ 6 deletions), tsc --noEmit is clean, after-state nav tree is printed, and the surviving Driver Pay entry under CARRIER OPS is the only Driver Pay nav entry.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` from apps/web exits 0
- Manual grep: `grep -n "Driver Pay" apps/web/src/components/navigation/sidebar.tsx` returns exactly one match (under CARRIER OPS)
- Git diff confined to apps/web/src/components/navigation/sidebar.tsx
- No deletions of files under apps/web/src/app/ (routes/pages untouched)
</verification>

<success_criteria>
- Duplicate "Driver Pay" entry under legacy Reports section is removed
- Other clear-duplicate legacy entries (Loads/Drivers/Trucks/Routes/CRM/Payroll) are removed where a Carrier Ops equivalent exists
- INVESTIGATE / FLAG entries are reported but NOT removed
- tsc --noEmit clean
- Audit table + after-state nav tree printed for user review
- Total entries removed ≤ 6 (or task halted before deletions if > 6)
</success_criteria>

<output>
After completion, create `.planning/quick/312-sidebar-cleanup-remove-duplicate-legacy-/312-SUMMARY.md` containing:
- Audit table (legacy entry | path | Carrier Ops equivalent | decision)
- Entries removed (count + list)
- Entries flagged for investigation (if any)
- Before/after nav tree
- tsc --noEmit result
</output>
