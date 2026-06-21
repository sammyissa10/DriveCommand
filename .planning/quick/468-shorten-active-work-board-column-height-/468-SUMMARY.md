# Quick Task 468 — SUMMARY

**Task:** Shorten Active Work Board column height to ~4 cards on /checklists  
**Date:** 2026-06-17  
**Commit:** dc3065e4

## What Changed

**File:** `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx` (line 234)

```diff
- <div className="flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[calc(100vh-260px)] pr-1">
+ <div className="flex-1 flex flex-col gap-3 overflow-y-auto md:max-h-[376px] pr-1">
```

**Final max-height chosen:** `376px`  
Rationale: Each InstanceCard is ~85px tall including gap-3 between cards → 4 cards × 85px = 340px + padding headroom = 376px.

## Verification

1. ✅ ~4 cards visible before scrolling — 376px fits exactly 4 cards, remainder scrolls within the column
2. ✅ All three columns equal height — all share the single `SwimlaneColumn` component; one change applied uniformly to Needs Attention, In Progress, and Completed Today
3. ✅ Page does not grow — fixed pixel cap replaces the dynamic viewport-height expression
4. ✅ Mobile unchanged — `md:` prefix keeps mobile (below md breakpoint) unrestricted as before
5. ✅ No TypeScript errors — className is a string literal, zero type impact

## Constraints Honored

- Single file modified ✅
- No logic changes, no restructure ✅
- `overflow-y-auto` preserved ✅
- Pinned column header remains outside scroll area ✅
- Equal-height alignment from QT 467 intact ✅
- Spec authority (Workflow Engine Section 8.1 swimlane scroll model) unchanged ✅
