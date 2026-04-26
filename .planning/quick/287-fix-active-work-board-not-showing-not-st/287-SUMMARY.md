---
phase: quick-287
plan: "01"
subsystem: workflows / checklists
tags: [bug-fix, workflow-engine, active-work-board, swimlane, NOT_STARTED]
dependency_graph:
  requires: []
  provides: ["NOT_STARTED instances visible on Active Work Board"]
  affects: ["apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx"]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - apps/web/src/server/api/routers/workflows/instance.ts
    - apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx
decisions:
  - "Bug was entirely client-side: the swimlane classifier silently returned null for NOT_STARTED, not a missing server filter"
  - "NOT_STARTED shares the same overdue-detection logic as IN_PROGRESS — both are active instances per spec"
metrics:
  duration_seconds: 81
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 287: Fix Active Work Board Not Showing NOT_STARTED Instances

**One-liner:** Client-side swimlane classifier was silently dropping NOT_STARTED PlaybookInstances; fixed by adding an explicit branch that routes them to In Progress or Needs Attention based on overdue step detection.

---

## What Was Fixed

### Root Cause

The bug was entirely **client-side** in `classifyInstance()` inside `WorkBoardSection.tsx`. The function handled three cases:

- `BLOCKED` → `'attention'`
- `COMPLETED` → `'completed'` or `null`
- `IN_PROGRESS` → overdue check → `'attention'` or `'progress'`

Any other status fell through to `return null`, causing the instance to be excluded from all three swimlanes. `NOT_STARTED` was that uncovered case.

The server (`instance.list`) was **already correct**: when no `status` filter is passed, the Prisma `where` clause includes no status restriction (`...(status ? { status } : {})`), so all four statuses come back. `DashboardClient.tsx` calls the procedure with no `status` argument, so NOT_STARTED instances were always being fetched — they just vanished at the client classifier.

---

## Files Modified

### `apps/web/src/server/api/routers/workflows/instance.ts` — commit `bf0a273`

No behavioral change. Two documentation additions:

1. **JSDoc updated** (line 6): The `list` entry now explicitly states it returns all statuses (NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED) when no filter is passed, and that callers wanting to exclude statuses must do so explicitly or client-side.
2. **Inline comment added** (line 47, above the spread): `// No filter ⇒ returns all statuses including NOT_STARTED — Active Work Board relies on this.`

Where clause, sort order, and `tenantId: ctx.tenantId` filter are byte-identical to before.

### `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx` — commit `8a8f1d4`

`classifyInstance()` (lines 28-55) updated. The `IN_PROGRESS`-only branch was replaced with a combined branch covering both `IN_PROGRESS` and `NOT_STARTED`:

```diff
-  if (instance.status === 'IN_PROGRESS') {
-    const hasOverdue = instance.stepInstances.some(
-      (s) =>
-        s.status !== 'COMPLETE' &&
-        s.status !== 'SKIPPED' &&
-        s.dueDate != null &&
-        new Date(s.dueDate) < new Date(),
-    );
-    return hasOverdue ? 'attention' : 'progress';
-  }
-  return null;
+  // NOT_STARTED and IN_PROGRESS are both "active" — show on the board.
+  // Route to 'attention' if any step is overdue, otherwise 'progress'.
+  if (instance.status === 'IN_PROGRESS' || instance.status === 'NOT_STARTED') {
+    const now = new Date();
+    const hasOverdue = instance.stepInstances.some(
+      (s) =>
+        s.status !== 'COMPLETE' &&
+        s.status !== 'SKIPPED' &&
+        s.dueDate != null &&
+        new Date(s.dueDate) < now,
+    );
+    return hasOverdue ? 'attention' : 'progress';
+  }
+
+  return null;
```

No other functions or components in the file were modified.

---

## Swimlane Behavior After Fix

| Status | Overdue steps? | Swimlane |
|--------|---------------|----------|
| NOT_STARTED | No | In Progress (yellow) |
| NOT_STARTED | Yes | Needs Attention (red) |
| IN_PROGRESS | No | In Progress (yellow) |
| IN_PROGRESS | Yes | Needs Attention (red) |
| BLOCKED | N/A | Needs Attention (red) |
| COMPLETED (today) | N/A | Completed Today (green) |
| COMPLETED (older) | N/A | Not shown |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check

**Files exist:**
- `apps/web/src/server/api/routers/workflows/instance.ts` — FOUND
- `apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx` — FOUND

**Commits exist:**
- `bf0a273` — docs(287-01): document all-statuses contract on instance.list — FOUND
- `8a8f1d4` — fix(287-02): bucket NOT_STARTED instances in Active Work Board swimlanes — FOUND

**TypeScript:** `npx tsc --noEmit -p apps/web/tsconfig.json` — PASSED (no output = no errors)

**Diff scope:** Only two files in frontmatter `files_modified` were changed — CONFIRMED

## Self-Check: PASSED
