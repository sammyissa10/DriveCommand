---
phase: quick-467
plan: 01
subsystem: checklists/work-board
tags: [overflow, layout, css, swimlane, tailwind]
dependency_graph:
  requires: []
  provides: [WorkBoardSection with internal-scroll swimlane columns]
  affects: [apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx]
tech_stack:
  added: []
  patterns: [overflow-y-auto internal scroll, md: breakpoint-gated max-height, CSS grid items-stretch equal-height columns]
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx
decisions:
  - "md:max-h-[calc(100vh-260px)] applied only at md+ breakpoint — mobile stacked layout remains uncapped"
  - "Header rendered outside the overflow-y-auto div so it stays pinned while cards scroll"
  - "items-stretch on the grid + h-full on each SwimlaneColumn achieves equal-height columns without JS"
  - "pr-1 on scroll container prevents scrollbar from overlapping InstanceCard content"
metrics:
  duration: 71s
  completed: 2026-06-17
  tasks_completed: 2
  files_modified: 1
---

# Phase quick-467 Plan 01: Contain Active Work Board Column Overflow Summary

**One-liner:** Added `overflow-y-auto md:max-h-[calc(100vh-260px)]` internal scroll to each Work Board swimlane column with pinned header and CSS grid equal-height alignment.

## What Was Built

The `/checklists` Active Work Board previously rendered each swimlane column as an unbounded flex column, allowing the In Progress column (up to 20 cards) to push the page to ~20x card height on desktop. This was a pure layout/overflow fix per Workflow Engine spec Section 8.1.

### Changes Applied (WorkBoardSection.tsx)

**SwimlaneColumn:**
- Outer wrapper changed from `flex flex-col gap-3 min-w-0` to `flex flex-col min-w-0 h-full` — `h-full` enables equal-height stretching from the CSS grid parent; `gap-3` moved off the wrapper.
- Header div (`flex items-center gap-2`) gains `mb-3` (replaces the removed `gap-3` spacing).
- Card-mapping block (`instances.length === 0 ? ... : instances.map(...)`) wrapped in a new scroll container: `flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[calc(100vh-260px)] pr-1`.
  - `flex-1` lets the scroll area fill remaining column height.
  - `md:max-h-[...]` clamps height only at the 3-column desktop breakpoint; mobile stacked layout is uncapped.
  - `overflow-y-auto` enables internal scroll.
  - `pr-1` prevents the scrollbar from overlapping card content.

**WorkBoardSection grid wrapper:**
- Changed from `grid grid-cols-1 md:grid-cols-3 gap-4 mb-8` to `grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 items-stretch`.
- `items-stretch` is explicit; CSS grid already stretches by default, but this ensures all three columns fill the row height so shorter columns' scroll areas match the tallest column.

**Unchanged:** `classifyInstance`, `getNextStepLabel`, sort order, bucketing loop, `InstanceCard` contents, `isLoading` skeleton block, `!hasAny` empty-state block.

## Deviations from Plan

None - plan executed exactly as written.

## InstanceCard Spec Compliance Findings (Task 2 — Inspect Only, No Fixes)

Per Section 8.1 of the Workflow Engine spec, the following elements were verified in `InstanceCard` (~lines 141-209):

| Element | Status | Notes |
|---------|--------|-------|
| Entity name | PRESENT | `Link` with `getEntityName()` output (line 163) |
| Entity avatar | MISSING | Name-only display; no `<img>`, `<Avatar>`, or initials element |
| Playbook name | PRESENT | `<p>` with `getPlaybookName()` output (line 166) |
| Playbook icon | MISSING | No icon associated with playbook name; only bucket-status icons (AlertCircle/Clock/CheckCircle2) in the badge |
| Completion ring | PRESENT | `<CircularProgress percent={instance.completionPercent} />` SVG (line 168) |
| Next/overdue step label | PRESENT | `getNextStepLabel()` with "Overdue:"/"Next:" prefix (lines 172-180) |
| Single action button | PRESENT | "View Checklist" Button + ChevronRight linking to `/checklists/instances/${instance.id}` (lines 200-205) |

**Missing elements (not fixed — out of scope for this task):**
- Entity avatar — spec expects an avatar/initials element next to the entity name link
- Playbook icon — spec expects an icon representing the playbook type/category alongside the playbook name

These findings are recorded for a future task to address.

## Verification

- `tsc --noEmit`: 0 errors (baseline confirmed clean)
- `overflow-y-auto` present in WorkBoardSection.tsx: confirmed
- `md:max-h-[calc(100vh-260px)]` present in WorkBoardSection.tsx: confirmed
- `items-stretch` present in grid wrapper: confirmed
- `classifyInstance` body unchanged: confirmed (returns 'attention'/'progress'/'completed'/null with same conditions)
- `instances.map((inst) => <InstanceCard key={inst.id} instance={inst} bucket={bucket} />)` identical to before: confirmed
- Only WorkBoardSection.tsx modified: confirmed

## Self-Check: PASSED

Files created/modified:
- `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx` — FOUND

Commits:
- `57726932` — fix(quick-467): add scroll containment to Work Board swimlane columns — FOUND
