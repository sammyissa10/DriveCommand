---
phase: quick-467
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx
autonomous: true

must_haves:
  truths:
    - "On /checklists, the page no longer grows ~20x card height; it stays a fixed-height board on desktop"
    - "The In Progress column with up to 20 cards scrolls internally; all cards remain present and reachable by scrolling"
    - "Column headers (label + count) stay pinned above the scroll area while cards scroll"
    - "All three columns align to equal height on the desktop (md+) layout"
    - "Mobile/stacked layout still renders one column per row without the desktop max-height clamp"
    - "classifyInstance, sort order, one-card-per-instance, and InstanceCard contents are functionally unchanged"
  artifacts:
    - path: "apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx"
      provides: "WorkBoardSection with internal-scroll swimlane columns"
      contains: "overflow-y-auto"
  key_links:
    - from: "SwimlaneColumn header"
      to: "scroll container"
      via: "header rendered outside the overflow-y-auto card-mapping wrapper"
      pattern: "overflow-y-auto"
---

<objective>
Contain the Active Work Board column overflow on /checklists. The In Progress column can hold up to 20 PlaybookInstance cards in an unbounded flex column, causing the page to grow ~20x card height instead of scrolling within the column.

Purpose: Make the board read as a balanced three-column board with internal column scrolling, per DriveCommand_Workflow_Engine_v2.pdf Section 8.1. This is a pure layout/overflow change — no data, logic, or classification changes.

Output: Updated WorkBoardSection.tsx where each column body is a fixed-max-height internal scroll area, columns align to equal height, and the page no longer grows with card count.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add internal scroll containment to swimlane columns</name>
  <files>apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx</files>
  <action>
Modify ONLY the layout in SwimlaneColumn and the grid wrapper in WorkBoardSection. Do NOT touch classifyInstance, getNextStepLabel, sorting, bucketing loop, InstanceCard contents, or the InstanceListItem type.

1. SwimlaneColumn (currently lines ~218-243):
   - Change the outer wrapper so the column is a flex column that can stretch to full height: keep `flex flex-col min-w-0` but make the column fill the row height (e.g. `h-full`). Move `gap-3` off the outer wrapper.
   - Keep the header block (`<div className="flex items-center gap-2">` with the `<h3>` title + count span) OUTSIDE the scroll area so it stays pinned. Add a small bottom margin (e.g. `mb-3`) since gap-3 is being moved.
   - Wrap the card-mapping area (the `instances.length === 0 ? ... : instances.map(...)` block) in a NEW scroll container div:
     - Classes: `flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[calc(100vh-260px)] pr-1`
     - Rationale: `flex-1` lets the scroll area fill remaining column height; `md:max-h-[...]` applies the clamp only at desktop breakpoint so the mobile/stacked layout (one column per row) is NOT capped; `overflow-y-auto` gives internal scroll; `pr-1` prevents the scrollbar from overlapping card content.
   - Keep the empty-state `<p>Nothing here</p>` and the `instances.map((inst) => <InstanceCard ... />)` exactly as-is inside this new scroll container — same keys, same sort/order, same InstanceCard props.

2. WorkBoardSection grid wrapper (currently line ~287):
   - Change `<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">` to align columns to equal height. With CSS grid, grid items already stretch by default, so adding `items-stretch` is explicit and safe: `grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 items-stretch`.
   - This combined with `h-full` on each SwimlaneColumn makes all three columns share equal height, so the shorter columns' scroll areas match the tallest column.

3. Do NOT change the isLoading skeleton block or the !hasAny empty-state block.
4. No grouping, capping, pagination, or virtualization — scroll containment only.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit  (no NEW TypeScript errors introduced in WorkBoardSection.tsx; pre-existing baseline errors are acceptable per project note)
Grep confirms `overflow-y-auto` and `md:max-h-[calc(100vh-260px)]` present in WorkBoardSection.tsx.
Grep confirms classifyInstance body is unchanged (still returns 'attention'/'progress'/'completed'/null with same conditions).
Confirm instances.map and InstanceCard usage are byte-identical to before (same key={inst.id}, same props).
  </verify>
  <done>
SwimlaneColumn renders a pinned header above an internal overflow-y-auto scroll area clamped to md:max-h-[calc(100vh-260px)]; the grid wrapper uses items-stretch with h-full columns so all three columns are equal height; classification, sort, one-card-per-instance, and InstanceCard contents are functionally unchanged; tsc --noEmit shows no new errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Inspect InstanceCard for spec-required elements and record findings</name>
  <files>apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx</files>
  <action>
Read the InstanceCard component (already in the file, ~lines 141-210) and verify each spec-required element from Section 8.1. Do NOT add or fix any missing element in this task — only record findings for the SUMMARY.

Checklist to verify:
- entity name + avatar: entity name IS present (Link with getEntityName, ~line 164). NOTE whether an avatar is rendered (currently appears to be name-only, no avatar element).
- playbook name + icon: playbook name IS present (~line 166). NOTE whether a playbook icon is rendered (currently appears name-only; only bucket-status icons in the badge exist).
- completion ring: present (CircularProgress, ~line 168).
- next/overdue step label: present (~lines 172-181).
- single action button: present (View Checklist button, ~lines 200-205).

Record any MISSING spec elements (e.g. entity avatar, playbook icon) in the SUMMARY's findings/notes section. Do NOT modify the card to add them — that is out of scope for this task.
  </action>
  <verify>
Findings documented: each of the five spec elements marked present or missing, based on actual code read. No code changes made for this inspection beyond what Task 1 already applied.
  </verify>
  <done>
SUMMARY contains an InstanceCard spec-compliance note listing which Section 8.1 elements are present and which (if any) are missing, with no fixes applied to missing elements.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` introduces no new errors in WorkBoardSection.tsx (baseline pre-existing errors acceptable).
- WorkBoardSection.tsx contains `overflow-y-auto` and `md:max-h-[calc(100vh-260px)]`.
- classifyInstance logic, sort order, bucketing, one-card-per-instance, and InstanceCard contents are functionally identical to the original.
- Only WorkBoardSection.tsx is modified; DashboardClient.tsx, the tRPC router, and the take:20 query param are untouched.
</verification>

<success_criteria>
- Each column body is a fixed-max-height internal scroll area on desktop (md+); all cards remain present and scrollable, nothing hidden or capped.
- Column headers stay pinned above the scroll area.
- All three columns align to equal height (grid items-stretch + h-full).
- The page no longer grows with card count on desktop; mobile stacked layout preserved without the desktop clamp.
- No grouping/dedup/pagination/virtualization introduced.
- InstanceCard spec-compliance check recorded in SUMMARY (missing elements reported, not fixed).
</success_criteria>

<output>
After completion, create `.planning/quick/467-contain-active-work-board-column-overflo/467-SUMMARY.md`
</output>
