---
phase: 376-tkt-0028-diagnosis-audit-facility-result
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
diagnosis_only: true

must_haves:
  truths:
    - "FacilitySearchModal row click handler is located and documented"
    - "StopBuilderAddModal callback wiring is located and documented"
    - "Route Stops state mutation point is identified"
    - "End-to-end click→state-update flow is traced step by step"
    - "Most recent commits on both files are recorded"
    - "Status verdict issued: resolved or still-open with break point"
  artifacts:
    - path: ".planning/quick/376-tkt-0028-diagnosis-audit-facility-result/376-SUMMARY.md"
      provides: "Diagnosis report with onClick code, callback signature, 4-step trace, commit history, status verdict"
      contains: "Diagnosis complete."
  key_links:
    - from: "FacilitySearchModal.tsx row click"
      to: "StopBuilderAddModal callback"
      via: "onSelect / onFacilitySelected prop"
      pattern: "onSelect|onFacility|onPick"
    - from: "StopBuilderAddModal callback"
      to: "RouteTemplateForm stops state"
      via: "setStops / append handler"
      pattern: "setStops|appendStop|addStop"
---

<objective>
Diagnose TKT-0028: clicking an existing facility result in FacilitySearchModal on /carrier/templates/new closes the modal but no stop is added to Route Stops.

Purpose: Determine whether this is already fixed (like sister ticket TKT-0027 in quick-185/quick-314) or a separate gap in the facility-pick handler chain.

Output: A diagnosis SUMMARY.md with onClick code, callback wiring, 4-step click→state trace, commit history, and a clear status verdict. NO code changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Sister ticket diagnosis (TKT-0027 — Create New Facility button, same modal)
# Already confirmed resolved in quick-185 + quick-314
@.planning/quick/375-tkt-0027-diagnosis-audit-create-new-facili/375-PLAN.md

# Files to READ (do NOT modify)
# Note: exact paths confirmed during QT 375 — use Glob to locate if needed
</context>

<tasks>

<task type="auto">
  <name>Task 1: Locate files and audit FacilitySearchModal row click handler</name>
  <files>NONE — read-only diagnosis</files>
  <action>
Locate the relevant files using Glob. Likely paths (confirm via Glob):
- apps/web/src/components/carrier/**/FacilitySearchModal.tsx
- apps/web/src/components/carrier/**/StopBuilderAddModal.tsx
- apps/web/src/components/carrier/**/RouteTemplateForm.tsx (or similar parent)
- apps/web/src/components/carrier/**/StopBuilder*.tsx

If not under carrier/, also try:
- apps/web/src/components/**/FacilitySearchModal.tsx
- apps/web/src/app/carrier/templates/new/**/*.tsx

Once located, in FacilitySearchModal.tsx:
1. Find the JSX that renders the list/rows of facility search results
2. Extract the EXACT onClick handler attached to a facility result row (the clickable element when user picks "QA Warehouse Chicago")
3. Identify the prop/callback the modal invokes to notify the parent of selection (e.g., onSelect, onFacilitySelected, onPick)
4. Note the callback signature (what arguments does it pass — full facility object, id only, etc.)
5. Note whether the modal closes itself (e.g., calls onClose() or setOpen(false)) BEFORE, AFTER, or INSTEAD OF invoking the parent callback

Record findings in scratch notes. Do NOT write SUMMARY.md yet.
  </action>
  <verify>Files located via Glob, onClick code copied verbatim, callback prop name + signature identified, modal-close timing relative to callback noted.</verify>
  <done>FacilitySearchModal row click handler fully documented with verbatim code snippet, callback name, and close-timing.</done>
</task>

<task type="auto">
  <name>Task 2: Trace parent wiring and identify break point</name>
  <files>NONE — read-only diagnosis</files>
  <action>
Step A — StopBuilderAddModal.tsx (parent):
1. Locate where FacilitySearchModal is rendered/instantiated
2. Find the handler passed to the callback prop identified in Task 1
3. Determine what that handler does when called with a facility:
   - Does it construct a new stop object?
   - Does it call an append/add function passed down from a higher parent?
   - Does it also close itself (setShowSearchModal(false))?

Step B — RouteTemplateForm / StopBuilder (higher parent):
1. Locate the state that holds Route Stops (likely useState<Stop[]>([])  or similar)
2. Find the append function (e.g., addStop, setStops([...stops, newStop]))
3. Confirm the chain terminates here

Step C — 4-step trace:
Write out the explicit click event flow:
- Step 1: user clicks facility row in FacilitySearchModal → [what is called]
- Step 2: [callback in StopBuilderAddModal] → [what it does]
- Step 3: [add-stop function in RouteTemplateForm] → [what it does]
- Step 4 (final): stops state updated via setStops

For EACH step, note:
- Is the handler actually wired / non-null?
- Does it call the next step in the chain?
- Are there any early returns, conditionals, or guards that could block execution?
- Any typos in prop names (e.g., parent passes `onSelect` but child expects `onSelected`)?

Identify the FIRST step where the chain breaks (if any). If chain is intact, note "no break found."

Step D — Git history:
Run these commands and capture the most recent commit on each file:
  git log -1 --format="%H %s (%ad)" --date=short -- "<path to FacilitySearchModal.tsx>"
  git log -1 --format="%H %s (%ad)" --date=short -- "<path to StopBuilderAddModal.tsx>"
  git log -1 --format="%H %s (%ad)" --date=short -- "<path to RouteTemplateForm.tsx or StopBuilder>"

Also search for any quick-185 / quick-314 / TKT-0027 / TKT-0028 references touching these files:
  git log --all --oneline --grep="quick-185\|quick-314\|TKT-0027\|TKT-0028\|facility" -- "<file paths>"

Step E — Status verdict:
Based on the trace, issue ONE of:
- "TKT-0028 already resolved" — if flow is intact end-to-end and behavior should work
- "TKT-0028 still open, broken at: Step N — [specific reason]" — if a break is found

Write the diagnosis report to:
.planning/quick/376-tkt-0028-diagnosis-audit-facility-result/376-SUMMARY.md

Required SUMMARY.md sections:
1. Ticket: TKT-0028 — Facility result click in FacilitySearchModal does not add stop
2. Files audited (with full paths)
3. FacilitySearchModal row click handler (verbatim code)
4. Callback signature and parent wiring
5. 4-step click→state trace (with break point if any)
6. Most recent commits per file
7. Status verdict
8. Final line: "Diagnosis complete."

Do NOT modify any source code. Diagnosis only.
  </action>
  <verify>SUMMARY.md exists at .planning/quick/376-tkt-0028-diagnosis-audit-facility-result/376-SUMMARY.md, contains all 8 required sections, ends with "Diagnosis complete." line. No source files modified (git status shows only the SUMMARY.md as new file under .planning/).</verify>
  <done>Diagnosis report committed to SUMMARY.md with verbatim onClick code, full callback wiring, 4-step trace with break-point identification, commit history, and status verdict (resolved | still-open).</done>
</task>

</tasks>

<verification>
- Both target files (FacilitySearchModal.tsx and StopBuilderAddModal.tsx) were located and read
- onClick handler for facility result rows captured verbatim
- Callback prop name and signature documented
- 4-step click-to-state trace written out
- Break point identified (or absence confirmed)
- Most recent commit on each file recorded
- Status verdict issued
- SUMMARY.md ends with "Diagnosis complete."
- git status shows ZERO modifications to apps/web source files
</verification>

<success_criteria>
- 376-SUMMARY.md exists and contains all 8 required sections
- Status verdict is unambiguous: "TKT-0028 already resolved" OR "TKT-0028 still open, broken at: Step N"
- Zero source code changes (diagnosis only)
- User can act on the verdict immediately (either close the ticket or escalate to a fix plan)
</success_criteria>

<output>
After completion, the SUMMARY.md at `.planning/quick/376-tkt-0028-diagnosis-audit-facility-result/376-SUMMARY.md` IS the deliverable. No additional summary file needed.
</output>
