---
phase: quick-353
plan: "01"
subsystem: notifications
tags: [backfill, notifications, seed, html-cache]
dependency_graph:
  requires: [quick-352]
  provides: [manager.invited-html-cache-populated]
  affects: [notification-dispatcher, seed-notifications]
tech_stack:
  added: []
  patterns: [chained-npm-scripts, tsx-backfill]
key_files:
  created: []
  modified:
    - apps/web/package.json
decisions:
  - "Chain backfill into seed:notifications so future template seeds always populate HTML cache"
metrics:
  duration: "~2 minutes"
  completed: "2026-05-17"
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 353: Backfill manager.invited HTML Cache + Chain Seed Script — Summary

## One-liner

Backfilled `manager.invited` defaultHtmlCache (372 chars) and chained the backfill script into `seed:notifications` to prevent the NULL-cache regression on future seeds.

## What Was Done

### Task 1: Run HTML Cache Backfill

Ran the backfill script from `apps/web`:

```
npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts
```

**Backfill script output:**
```
[backfill] found 1 NotificationTemplate rows with NULL defaultHtmlCache
[backfill] manager.invited -> 372 chars cached
[backfill] done
```

**Idempotency check (re-run):**
```
[backfill] found 0 NotificationTemplate rows with NULL defaultHtmlCache
[backfill] done
```

Confirms the row is fully populated and the script is safe to run repeatedly.

**Supabase verification (via idempotency + script output):**

| triggerKey       | html_length |
|-----------------|-------------|
| manager.invited  | 372         |
| driver.invited   | (unchanged) |

`manager.invited.defaultHtmlCache` is now non-null with 372 characters. `driver.invited` was not touched (already had a populated cache — backfill script only updates NULL rows).

### Task 2: Chain Backfill into seed:notifications

**Old value:**
```
"seed:notifications": "tsx prisma/seeds/seed-notifications.ts"
```

**New value:**
```
"seed:notifications": "tsx --env-file=.env.local prisma/seeds/seed-notifications.ts && tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts"
```

**TypeScript check result:** `npx tsc --noEmit` — zero errors.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

**Files exist:**
- `apps/web/package.json` — FOUND (modified)

**Commits exist:**
- `419c89c` — FOUND: chore(quick-353): chain backfill into seed:notifications

**Git diff scope:** 1 file changed, 1 insertion, 1 deletion — only `apps/web/package.json`.

## Self-Check: PASSED
