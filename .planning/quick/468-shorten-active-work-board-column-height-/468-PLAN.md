# Quick Task 468 — Shorten Active Work Board Column Height to ~4 Cards

**Date:** 2026-06-17  
**Directory:** .planning/quick/468-shorten-active-work-board-column-height-

## Goal

Follow-up to QT 467. The Active Work Board swimlane columns scroll internally but the visible window is too tall (~viewport height). Shorten to show ~4 cards before scrolling begins.

## Single Task

**Task 1: Change scroll window max-height in SwimlaneColumn**

File: `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx`

Change on line 234:
```
// Before
<div className="flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[calc(100vh-260px)] pr-1">

// After
<div className="flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[376px] pr-1">
```

**Why 376px:** Each InstanceCard is ~85px tall including the gap-3 spacing between cards. 4 cards = 4 × 85px = 340px + a little padding = 376px. This is a fixed cap that shows ~4 cards and then scrolls internally.

**Verification checklist:**
1. All three columns share the same `SwimlaneColumn` component — one change applies equally to Needs Attention, In Progress, and Completed Today.
2. `overflow-y-auto` stays intact — content scrolls within the capped window.
3. Mobile (below `md:`) is unrestricted — no mobile class changed.
4. No logic, no restructure — purely a CSS class value change.
5. TypeScript unaffected — className is a string.
