---
phase: quick-352
plan: "01"
subsystem: notifications
tags: [notifications, email, team-permissions, triggers]
dependency_graph:
  requires: [dispatchNotification, send-driver-invitation pattern, NotificationCategory.USER]
  provides: [manager.invited TriggerKey, sendManagerInvitation wrapper, manager.invited DB template]
  affects: [inviteTeamMember(), notification analytics, per-trigger tenant preferences]
tech_stack:
  added: []
  patterns: [dispatchNotification trigger wrapper, NotificationTemplateSeed upsert]
key_files:
  created:
    - apps/web/src/lib/email/send-manager-invitation.ts
  modified:
    - apps/web/src/lib/notifications/types.ts
    - apps/web/prisma/seeds/notification-template-data/user.ts
    - apps/web/src/app/(owner)/actions/team-permissions.ts
decisions:
  - "Used NotificationCategory.USER for manager.invited seed entry — no MANAGER enum value exists in NotificationCategory"
  - "relatedEntity.type stays 'DriverInvitation' in the wrapper — underlying Prisma model is DriverInvitation, schema unchanged"
  - "Legacy fallback reuses DriverInvitationEmail react component — adding a new react email component is out of scope; copy is generic enough for fallback path"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-16"
  tasks_completed: 3
  files_changed: 4
---

# Phase quick-352 Plan 01: Add manager.invited notification trigger — Summary

Dedicated `manager.invited` trigger + NotificationTemplate for team-member (manager) invites, routing through `dispatchNotification` instead of reusing the driver.invited path.

## What Was Built

### Task 1 — types.ts
Added `manager.invited` to two places in `apps/web/src/lib/notifications/types.ts`:
- `TriggerKey` union: new Manager section after the Driver block (`| 'manager.invited'`, count updated 36→37)
- `NotificationPayload` mapped type: `'manager.invited': { managerEmail: string; firstName: string; tenantName: string; inviteUrl: string }`

### Task 2 — Seed entry + wrapper
**Seed entry** appended to `userTemplates` array in `apps/web/prisma/seeds/notification-template-data/user.ts`:
- triggerKey: `manager.invited`
- category: `NotificationCategory.USER` (no MANAGER enum value exists — USER is correct)
- displayName: `Manager Invited`
- defaultRecipients: `[{ type: 'external_email', payloadKey: 'managerEmail' }]`
- isActive: true, inAppEnabled: false

**New wrapper** `apps/web/src/lib/email/send-manager-invitation.ts` (61 lines):
- Exports `ManagerInvitationEmailData` interface and `sendManagerInvitation()` function
- Dispatches `dispatchNotification('manager.invited', { tenantId, payload: { managerEmail, firstName, tenantName, inviteUrl } })`
- Legacy SMTP fallback via `DriverInvitationEmail` component preserved in `legacySendManagerInvitation()`

### Task 3 — Call site rewire + seed run
`apps/web/src/app/(owner)/actions/team-permissions.ts`:
- Line 14: import swapped from `sendDriverInvitation` → `sendManagerInvitation`
- Line 178: call site swapped from `sendDriverInvitation(...)` → `sendManagerInvitation(...)`
- Argument shape is identical (`ManagerInvitationEmailData` matches `DriverInvitationEmailData`)

Seed run result:
```
Total templates to seed: 37
Validation: passed
Inserted: 1
Updated:  36
Total:    37
```
The 1 inserted row is `manager.invited`.

## DB Verification

Seed ran successfully with `npm run seed:notifications` reporting:
- 37 total templates (was 36 before quick-352)
- 1 inserted = the new `manager.invited` row
- 0 errors during validation (all `{{vars}}` in template body declared in `availableVariables`)

Expected DB state:
```
triggerKey    | category | displayName      | isActive | inAppEnabled
--------------+----------+------------------+----------+--------------
manager.invited | USER    | Manager Invited  | true     | false
```

## Driver Path — Untouched

Confirmed unchanged by git diff scope (only 4 files listed in plan modified):
- `send-driver-invitation.ts` — no changes
- `DriverInvitationEmail` component — no changes
- `accept-invitation` page/route/POST handler — no changes
- `DriverInvitation` Prisma model — no changes
- `driver.invited` seed entry in `driver.ts` — no changes

## TypeScript

`cd apps/web && npx tsc --noEmit` — exits 0 (clean) after all 3 tasks.

## Deviations from Plan

None — plan executed exactly as written. The `relatedEntity.type: 'DriverInvitation'` in the wrapper is intentional per plan (Prisma model is unchanged); this is noted in the wrapper's JSDoc.

## Self-Check: PASSED

Files created/modified:
- apps/web/src/lib/notifications/types.ts — FOUND (2 manager.invited hits)
- apps/web/prisma/seeds/notification-template-data/user.ts — FOUND (1 manager.invited hit)
- apps/web/src/lib/email/send-manager-invitation.ts — FOUND (exports sendManagerInvitation)
- apps/web/src/app/(owner)/actions/team-permissions.ts — FOUND (2 sendManagerInvitation hits, 0 sendDriverInvitation hits)

Commits:
- 1e6c269: feat(quick-352): Task 1 — add manager.invited to TriggerKey union + NotificationPayload
- bbff90c: feat(quick-352): Task 2 — seed entry + sendManagerInvitation wrapper
- 197eab3: feat(quick-352): Task 3 — rewire inviteTeamMember() to sendManagerInvitation
