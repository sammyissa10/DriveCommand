# Quick Task 448 — SUMMARY

**Task:** Routes help category dispatch→trip terminology sweep  
**Date:** 2026-06-15  
**Commit:** d7c42d80

## What Changed

**File:** `apps/web/src/components/help/help.config.ts`  
**Scope:** Routes category only (lines 271–284)

| Article slug | Field | Before | After |
|---|---|---|---|
| `dispatching-from-route` | title | "Dispatching from a route" | "Generating trips from a route" |
| `dispatching-from-route` | preview | "Turn a route template into an active load." | "Turn a route template into active trips." |
| `dispatching-from-route` | keywords | `["dispatch", ...]` | `["trip", "generate trip", ...]` |
| `route-scheduling` | preview | "Automate recurring dispatches on a schedule." | "Automate recurring trips on a schedule." |

## Verification

- No user-facing "dispatch"/"dispatching" remains in Routes category titles, previews, or keywords
- Remaining `dispatch` occurrences in the file are: internal slugs (`dispatching-from-route`, `dispatch-workflow`, `loads-and-dispatches`) and the job title "dispatchers" in Getting Started — all out of scope
- "route"/"route template" wording preserved throughout
- TypeScript: no new errors (file is pure config data, no type changes)
- Only Routes category modified; Loads & Trips and other categories untouched

## Diff (4 lines)
```
-        title: "Dispatching from a route",
+        title: "Generating trips from a route",
-        preview: "Turn a route template into an active load.",
+        preview: "Turn a route template into active trips.",
-        keywords: ["dispatch", "route template", "create from route", "use route"],
+        keywords: ["trip", "generate trip", "route template", "create from route", "use route"],
-        preview: "Automate recurring dispatches on a schedule.",
+        preview: "Automate recurring trips on a schedule.",
```
