---
phase: 375-tkt-0027-diagnosis-audit-create-new-faci
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Diagnosis document explains current Create New Facility button behavior on /carrier/templates/new"
    - "Diagnosis identifies whether the click navigates (router.push) vs opens a sheet/modal"
    - "Diagnosis identifies whether template form state is preserved when the button is clicked"
    - "Diagnosis lists every file involved in the broken flow with exact line references"
    - "Diagnosis proposes a fix approach (Sheet vs nested Dialog vs navigation with state) without implementing it"
    - "Bug 42 root cause is connected to or distinguished from TKT-0027"
  artifacts:
    - path: ".planning/quick/375-tkt-0027-diagnosis-audit-create-new-faci/375-SUMMARY.md"
      provides: "Full diagnosis findings, root cause, affected files, and proposed fix approach"
      min_lines: 60
  key_links:
    - from: "FacilitySearchModal.tsx Create New Facility button"
      to: "FacilityForm or /carrier/facilities/new route"
      via: "onClick handler (router.push or setState)"
      pattern: "(router\\.push|onCreateNew|onClick).*facility"
---

<objective>
Diagnose TKT-0027: On /carrier/templates/new, clicking "Create New Facility" inside the facility search modal closes the modal and returns the user to the template form instead of opening a side-sheet to create a facility without leaving the template flow. Also evaluate whether QA Bug 42 ("navigating back from New Facility modal loses template form data") shares the same root cause.

Purpose: Produce a definitive read-only audit so the next quick task can implement a precise fix (likely a nested shadcn Sheet) without having to re-investigate.

Output: A SUMMARY.md documenting the broken flow, exact file/line references, and a recommended fix approach.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Confirmed-to-exist starting points for the audit
@apps/web/src/app/(owner)/carrier/templates/new/page.tsx
@apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
@apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Trace Create New Facility click handler from template page to facility form</name>
  <files>
    READ ONLY — no files modified. Files to read (start here, expand as needed):
    - apps/web/src/app/(owner)/carrier/templates/new/page.tsx
    - apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
    - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
    - apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
    - Any RouteTemplateForm / RouteTemplateBuilder component imported by templates/new/page.tsx
    - The FacilityForm component used at /carrier/facilities/new
    - shadcn Sheet primitive: apps/web/src/components/ui/sheet.tsx (confirm it exists)
  </files>
  <action>
    Perform a read-only audit. Do NOT modify any files. Specifically:

    1. Open apps/web/src/app/(owner)/carrier/templates/new/page.tsx and identify:
       - Which form/builder component renders the route template UI (likely RouteTemplateForm, RouteTemplateBuilder, or similar — find it by grep on the page.tsx imports)
       - Where local form state lives (useState, useReducer, react-hook-form, Zustand) — record the exact mechanism, since this is the state Bug 42 says gets lost

    2. Open apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx and locate:
       - The "Create New Facility" button (exact line number)
       - Its onClick handler — capture the exact code
       - Whether the handler:
         (a) calls router.push('/carrier/facilities/new') — full navigation (likely cause of both TKT-0027 and Bug 42)
         (b) calls a parent-provided onCreateNew callback — check what the parent does with it
         (c) renders a nested Sheet/Dialog — check why it isn't appearing
       - Whether the modal is a shadcn Dialog or Sheet, and whether it's controlled (open={...} from parent) or uncontrolled

    3. Also inspect apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx — it appeared in the grep for "Create New Facility". Determine whether:
       - It is the same modal used by the template page, or a separate one for the stop builder
       - It has the same broken behavior (relevant for scope of the future fix)

    4. Open apps/web/src/app/(owner)/carrier/facilities/new/page.tsx and the FacilityForm component:
       - Confirm whether FacilityForm is a standalone page component or a reusable component that can be embedded in a Sheet
       - Note any required props (onSuccess callback, initial values, server action)
       - Check whether it accepts a `mode` or `embedded` prop already

    5. Confirm shadcn Sheet primitive exists at apps/web/src/components/ui/sheet.tsx and is the right side-sheet to use. Find one existing usage in the codebase to mirror (grep for `import.*Sheet.*from.*components/ui/sheet`).

    6. Reproduce the flow mentally and write down the sequence of events that produces the bug:
       - User on /carrier/templates/new with partially filled form
       - User opens FacilitySearchModal
       - User clicks "Create New Facility"
       - [Exact thing that happens — based on findings above]
       - Result: template form data is lost (Bug 42) and user is no longer in the template flow (TKT-0027)

    7. Determine the root cause and decide: are TKT-0027 and Bug 42 the SAME bug (both caused by full-page navigation) or two related but distinct issues?

    8. Propose a fix approach (do NOT implement). Recommend one of:
       - Replace router.push with a nested shadcn Sheet that renders FacilityForm inline
       - Refactor FacilityForm to accept onSuccess callback so it can close the sheet and pass the new facility back to the search modal
       - Persist template form state to sessionStorage before navigation (worse — workaround, not root fix)
       Pick the cleanest option and justify in 2-3 sentences.
  </action>
  <verify>
    Run from repo root (PowerShell):
    - `Test-Path .\.planning\quick\375-tkt-0027-diagnosis-audit-create-new-faci\375-SUMMARY.md` returns True
    - SUMMARY.md contains all six sections described in <done>
    - SUMMARY.md cites at least 4 specific files with line numbers (use file:line format)
    - No files outside .planning/quick/375-* were modified (run `git status` — should show only the SUMMARY.md as new file)
  </verify>
  <done>
    .planning/quick/375-tkt-0027-diagnosis-audit-create-new-faci/375-SUMMARY.md exists with these sections:
    1. **Reproduction** — exact user steps and observed broken behavior
    2. **Files involved** — full path + line numbers for every component in the flow
    3. **Root cause** — what the click handler actually does and why it breaks both TKT-0027 and (if related) Bug 42
    4. **Template state mechanism** — how form state is held and why it's lost on navigation
    5. **Relationship to Bug 42** — same bug, related bug, or unrelated
    6. **Recommended fix approach** — one paragraph, names the components to change, names the shadcn primitive to use, and is small enough to fit in a single follow-up quick task

    Zero source-code files modified. Only SUMMARY.md created.
  </done>
</task>

</tasks>

<verification>
- `git status` shows only `.planning/quick/375-tkt-0027-diagnosis-audit-create-new-faci/375-SUMMARY.md` as new (plus the PLAN.md from planning)
- `git diff` shows no source-code changes under `apps/`, `packages/`
- SUMMARY.md is readable, names real components, real file paths, and real line numbers
</verification>

<success_criteria>
A future Claude could read SUMMARY.md and immediately scaffold the fix without re-opening any of the audited files. The recommended fix approach is concrete enough to estimate as a single quick task (1-3 tasks, ~30-60 min of execution).
</success_criteria>

<output>
After completion, create `.planning/quick/375-tkt-0027-diagnosis-audit-create-new-faci/375-SUMMARY.md` following the structure described in Task 1's <done>.
</output>
