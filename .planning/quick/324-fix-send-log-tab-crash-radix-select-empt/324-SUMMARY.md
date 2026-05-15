---
phase: quick-324
plan: "01"
subsystem: notifications
tags: [bugfix, radix-ui, select, send-log, notifications]
dependency_graph:
  requires: []
  provides: [working-send-log-tab-tenant, working-send-log-tab-admin]
  affects: [/settings/notifications, /admin/notifications]
tech_stack:
  added: []
  patterns: [sentinel-value-pattern-for-radix-select-all-option]
key_files:
  modified:
    - apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx
    - apps/web/src/app/(admin)/notifications/send-log-tab.tsx
decisions:
  - "Use sentinel literal 'all' for catch-all SelectItem instead of empty string; translate to undefined in fetchRows before calling server action"
metrics:
  duration: "~5 min"
  completed: "2026-05-14"
  tasks_completed: 1
  files_modified: 2
---

# Quick-324: Fix Send Log Tab Crash (Radix Select Empty-Value) Summary

**One-liner:** Replaced `<SelectItem value="">` with `value="all"` sentinel in both Send Log tabs and translated it back to `undefined` in `fetchRows` to fix the Radix UI runtime crash.

## What Was Done

Both Send Log tab components used `value=""` on the "All statuses" / "All channels" catch-all `<SelectItem>`, which Radix UI rejects at render time (empty string is reserved internally for clearing selection and showing the placeholder). This caused a production React crash whenever a user clicked the Send Log tab in either `/settings/notifications` or `/admin/notifications`.

The fix is a sentinel-value pattern: the UI layer uses the literal string `"all"` for the catch-all option; `fetchRows` translates `"all"` back to `undefined` before passing `status`/`channel` to the server action. The server action contract is unchanged — it still accepts `NotificationSendStatus | undefined` and `NotificationChannel | undefined`.

## Changes

### `apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx`

| Location | Before | After |
|---|---|---|
| Initial `status` state | `useState<string>('')` | `useState<string>('all')` |
| Initial `channel` state | `useState<string>('')` | `useState<string>('all')` |
| `fetchRows` status arg | `(status \|\| undefined)` | `(status && status !== 'all' ? status : undefined)` |
| `fetchRows` channel arg | `(channel \|\| undefined)` | `(channel && channel !== 'all' ? channel : undefined)` |
| JSX — All statuses item | `value=""` | `value="all"` |
| JSX — All channels item | `value=""` | `value="all"` |

### `apps/web/src/app/(admin)/notifications/send-log-tab.tsx`

| Location | Before | After |
|---|---|---|
| Initial `status` state | `useState<string>('')` | `useState<string>('all')` |
| `fetchRows` status arg | `(status \|\| undefined)` | `(status && status !== 'all' ? status : undefined)` |
| JSX — All statuses item | `value=""` | `value="all"` |

## Verification Results

- `tsc --noEmit` — 0 errors
- `grep 'SelectItem value=""' ...` — 0 matches (no empty-value items remain)
- `grep 'value="all"' tenant-send-log-tab.tsx` — 2 matches (status + channel)
- `grep 'value="all"' send-log-tab.tsx` — 1 match (status)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|---|---|
| 3f1ed3a | fix(quick-324): replace empty-string SelectItem values with sentinel "all" in Send Log tabs |

## Self-Check: PASSED

- `apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx` — FOUND
- `apps/web/src/app/(admin)/notifications/send-log-tab.tsx` — FOUND
- Commit 3f1ed3a — FOUND
