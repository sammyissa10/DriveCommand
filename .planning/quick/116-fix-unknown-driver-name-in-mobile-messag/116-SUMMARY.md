---
phase: quick-116
plan: "01"
subsystem: mobile-api
tags: [bug-fix, mobile, fleet-messages, owner-portal]
dependency_graph:
  requires: []
  provides: [owner-fleet-messages-name-resolution]
  affects: [apps/web/src/app/api/mobile/owner/fleet/messages/route.ts, apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts]
tech_stack:
  added: []
  patterns: [email-fallback-for-display-name]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
decisions:
  - "Use email as fallback display name when firstName/lastName are both null/empty, then 'Driver' as absolute last resort (user not found in DB)"
  - "Owner POST sender in [recipientId]/route.ts also uses email fallback before 'Owner' for consistency"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-28"
  tasks_completed: 2
  files_modified: 2
---

# Quick-116: Fix Unknown Driver Name in Mobile Fleet Messages

**One-liner:** Replace hardcoded "Unknown Driver"/"Unknown" fallbacks with email-based display name resolution in both owner fleet message API routes.

## What Was Done

When a driver's `firstName` and `lastName` are both null or empty, the owner's mobile fleet messages API was returning the string "Unknown Driver" in conversation lists and "Unknown" in thread headers/message bubbles. This made it impossible for the owner to identify which driver sent a message.

The fix adds `email: true` to all `prisma.user` select calls in the two affected routes, then uses `u.email` as the fallback display name before resorting to a generic string.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix name resolution in owner fleet conversation list API | e7b5785 | apps/web/src/app/api/mobile/owner/fleet/messages/route.ts |
| 2 | Fix name resolution in owner fleet conversation thread API | e7b5785 | apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts |

## Changes Made

### `route.ts` (conversation list)

- `tx.user.findMany` select: added `email: true`
- nameMap building (line 73): `|| 'Unknown Driver'` → `|| u.email`
- convMap fallback (line 105): `?? 'Unknown Driver'` → `?? 'Driver'`
- POST `tx.user.findUnique` select: added `email: true`
- POST recipientName (line 235): `|| 'Unknown Driver'` → `|| recipient.email || 'Driver'`

### `[recipientId]/route.ts` (conversation thread)

- `tx.user.findMany` select: added `email: true`
- nameMap building (line 86): `|| 'Unknown'` → `|| u.email || 'Driver'`
- GET `tx.user.findUnique` select (recipient): added `email: true`
- GET recipientName (line 102): `|| 'Unknown Driver'` → `|| recipient.email || 'Driver'`
- result map senderName (line 110): `?? 'Unknown'` → `?? 'Driver'`
- POST `tx.user.findUnique` select (sender): added `email: true`
- POST senderName (line 177): `|| 'Owner'` → `|| sender.email || 'Owner'`

## Verification

- `npx tsc --noEmit -p apps/web/tsconfig.json` — no errors in fleet messages files
- Grep for "Unknown Driver" in both files: zero matches
- Grep for `'Unknown'` in both files: zero matches

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/app/api/mobile/owner/fleet/messages/route.ts` — modified and committed
- `apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts` — modified and committed
- Commit `e7b5785` exists in git log
