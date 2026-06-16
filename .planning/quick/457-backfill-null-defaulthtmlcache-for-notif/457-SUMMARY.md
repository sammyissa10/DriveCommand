---
phase: quick-457
plan: "01"
subsystem: notifications
tags: [backfill, notifications, production, diagnostics]
dependency_graph:
  requires: []
  provides: ["all NotificationTemplate rows have populated defaultHtmlCache"]
  affects: ["dispatchNotification", "driver.invited", "all notification triggers"]
tech_stack:
  added: []
  patterns: ["npx tsx --env-file=.env.local for production scripts"]
key_files:
  created: []
  modified: []
decisions:
  - "Production was already in a clean state: 0 of 37 rows had NULL defaultHtmlCache — backfill ran cleanly with no writes needed"
  - "Root cause identified: seed UPDATE path omits defaultHtmlCache; INSERT path also omits it; cache only exists if backfill script was previously run or SysAdmin saved template via UI"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-16"
  tasks_completed: 5
  files_changed: 0
---

# Phase quick-457 Plan 01: Backfill NULL defaultHtmlCache for NotificationTemplate Summary

**One-liner:** Production diagnostic confirmed 0 of 37 NotificationTemplate rows had NULL defaultHtmlCache — backfill script ran cleanly (no writes needed), root cause documented.

## What Was Done

Ran read-only diagnostics (Tasks 1–3), confirmed pre-authorized production backfill script (Task 4), and ran post-backfill verification (Task 5).

### Task 1 — Scope diagnostic

SQL query against production returned all 37 NotificationTemplate rows. **0 rows had NULL defaultHtmlCache.** This includes `driver.invited` (active, cache populated).

Full result: 37 of 37 templates have populated cache. No silently broken triggers.

### Task 2 — Root cause analysis

Two root causes identified from reading the source code:

**Root cause 1 — Seed UPDATE path omits defaultHtmlCache:**
`apps/web/prisma/seeds/seed-notifications.ts` lines 102–113: the UPDATE branch writes `category`, `displayName`, `description`, `defaultSubject`, `defaultBlockJson`, `availableVariables`, `defaultRecipients` — but does NOT include `defaultHtmlCache`. The INSERT branch (lines 117–130) also omits `defaultHtmlCache`. This means any row seeded before the backfill script was run will have NULL cache and silently fail in `dispatchNotification`.

**Root cause 2 — Admin save-flow fragility:**
`apps/web/src/app/(admin)/actions/notifications.ts` `updateNotificationTemplate` writes `defaultHtmlCache: data.cachedHtml` directly. The TypeScript type requires `cachedHtml: string`, but if a malformed client request passed null/undefined and TypeScript was bypassed, it would overwrite an existing good cache with NULL. This is a fragility point, not a confirmed bug.

**Why driver.invited was broken in the past:** Row was created via seed INSERT (no `defaultHtmlCache` written), then seed was re-run via UPDATE (still no `defaultHtmlCache` written). The backfill script `backfill-notification-html-cache.ts` was previously run and fixed it — explaining the current clean state.

### Task 3 — Backfill script scope confirmation

From reading `apps/web/scripts/backfill-notification-html-cache.ts`:
- `where: { defaultHtmlCache: null }` — only touches NULL rows, never overwrites populated caches
- `data: { defaultHtmlCache: html }` — only writes `defaultHtmlCache`, no other fields touched
- Uses `DIRECT_URL` (bypasses pgbouncer) — correct for scripts

**Script confirmed safe.**

### Task 4 — Backfill script execution

```
[backfill] found 0 NotificationTemplate rows with NULL defaultHtmlCache
[backfill] done
```

Exit code 0. No FAILED lines. No writes needed — production was already clean.

### Task 5 — Post-backfill verification

Post-run SQL query: 37 of 37 rows have populated cache, 0 NULL. `VERIFICATION PASSED: Zero NULL rows.`

**Before: 0 NULL. After: 0 NULL.** (Production was already in a clean state before this task ran.)

## Deviations from Plan

### Unexpected Finding (not a deviation)

**Production was already fully backfilled.** The plan assumed `driver.invited` and potentially other rows would be NULL in production. Instead, all 37 rows had populated caches. The backfill script ran cleanly with `found 0 rows`. This is a positive outcome — the original backfill script was already successfully applied to production previously. This quick task confirms the clean state and documents root causes for future reference.

No code changes were made. No files were modified.

## Self-Check

**Created files:** None
**Modified files:** None (no code changes in this task)
**Script run:** `scripts/backfill-notification-html-cache.ts` — confirmed exit code 0

## Self-Check: PASSED

All success criteria met:
- SQL diagnostic confirmed 0 NULL rows (Task 1)
- Root cause documented (Task 2)
- Script scope confirmed safe (Task 3)
- Script ran cleanly: `found 0 rows`, `done`, exit 0 (Task 4)
- Post-backfill SQL confirms 0 NULL rows remain (Task 5)
- No application code changed
- dispatchNotification finds populated cache for all 37 active triggers
