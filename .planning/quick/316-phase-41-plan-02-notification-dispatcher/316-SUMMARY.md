---
phase: quick-316
plan: "01"
subsystem: notifications
tags: [notifications, dispatcher, email, in-app, tiptap, react-email, vitest]
dependency_graph:
  requires: [quick-315]
  provides: [dispatchNotification, notification-dispatcher-library]
  affects: [server-actions, cron-routes, plans-03-05]
tech_stack:
  added:
    - "@tiptap/html@^3.23.4"
    - "@tiptap/core@^3.23.4"
    - "@tiptap/starter-kit@^3.23.4"
  patterns:
    - bypass_rls transaction for audit log writes
    - per-recipient error isolation with try/catch
    - idempotency key via NotificationSendLog SENT-row probe
    - React Email shell with dangerouslySetInnerHTML (single injection site)
key_files:
  created:
    - apps/web/src/lib/notifications/dispatcher.ts
    - apps/web/src/lib/notifications/recipient-resolver.ts
    - apps/web/src/lib/notifications/template-renderer.ts
    - apps/web/src/lib/notifications/idempotency.ts
    - apps/web/src/lib/notifications/audit-log.ts
    - apps/web/src/lib/notifications/in-app-writer.ts
    - apps/web/src/emails/dynamic-template.tsx
    - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
    - apps/web/src/lib/notifications/README.md
    - apps/web/prisma/migrations/20260514200002_add_notification_send_status_idempotent/migration.sql
  modified:
    - apps/web/prisma/schema.prisma (added SKIPPED_IDEMPOTENT to NotificationSendStatus enum)
    - apps/web/package.json (added @tiptap packages)
decisions:
  - "Used isActive (not isEnabled) for TenantNotificationSettings gate — matched actual schema"
  - "Added SKIPPED_IDEMPOTENT enum value via migration — needed for distinct audit status"
  - "Mocked template-renderer in tests to bypass react/react-dom version mismatch in root monorepo node_modules"
  - "DefaultRecipientRule discriminant is 'type' (not 'kind') — matched actual types.ts"
  - "Prisma client import path is @/lib/db/prisma (not @/lib/prisma)"
metrics:
  duration: "~45 minutes"
  completed: "2026-05-14"
  tasks: 10
  files: 10
---

# Phase Quick-316: Notification Dispatcher Library Summary

**One-liner:** `dispatchNotification()` 10-step orchestrator with Tiptap rendering, Resend email, InApp writer, bypass_rls audit log, idempotency, and 6/6 passing Vitest tests.

## What Was Built

A self-contained notification dispatcher library at `apps/web/src/lib/notifications/` plus a React Email shell component. This is the sole runtime engine for the Tenant-Configurable Notification System (Phase 41, Plan 02 of 5).

### Files Created

| File | Lines | Purpose |
|---|---|---|
| `dispatcher.ts` | 295 | Public API + 10-step orchestrator |
| `recipient-resolver.ts` | 133 | Role/owner/related rules + subscriptions union |
| `template-renderer.ts` | 92 | Tiptap JSON → HTML → substitution → shell |
| `idempotency.ts` | 59 | Key builder + SENT-row DB probe |
| `audit-log.ts` | 68 | Bulk NotificationSendLog writer (bypass_rls) |
| `in-app-writer.ts` | 88 | InAppNotification row writer + enum mapping |
| `dynamic-template.tsx` | 116 | React Email shell (sole HTML injection site) |
| `__tests__/dispatcher.test.ts` | 402 | 6 Vitest unit tests |
| `README.md` | 196 | Developer docs |
| `migration.sql` | 5 | SKIPPED_IDEMPOTENT enum value |

## Dispatch Flow as Implemented

Exactly matches the design doc's 10-step flow:

1. `notificationTemplate.findUnique({ where: { triggerKey } })` — short-circuit SKIPPED_DISABLED if missing or `isActive=false`
2. `tenantNotificationSettings.findUnique({ where: { tenantId_triggerKey: {...} } })` — short-circuit SKIPPED_DISABLED if `isActive=false`
3. `resolveRecipients()` — expands DefaultRecipientRules, unions NotificationSubscription, dedupes by userId
4. Pick content: `customBlockJson ?? defaultBlockJson`, `customSubject ?? defaultSubject`
5. `renderTemplate()` — Tiptap blockJson → generateHTML → substituteVariables → React Email shell → string
6. Per recipient: idempotency check → `resend.emails.send({ from, to, subject, react })`
7. Per recipient: `writeInAppNotification()` → InAppNotification row
8. Per-recipient try/catch — one failure never aborts others
9. Preference gating — emailEnabled / inAppEnabled per user → SKIPPED_USER_PREF
10. `writeAuditLog(db, audits)` in `finally` — always runs, bypass_rls transaction

## Test Results

**6/6 passing.** Run with: `cd apps/web && npx vitest run src/lib/notifications/__tests__/dispatcher.test.ts`

| Test | Scenario | Result |
|---|---|---|
| 1 | Globally inactive trigger → SKIPPED_DISABLED, no email | PASS |
| 2 | Tenant-disabled trigger → SKIPPED_DISABLED, no email | PASS |
| 3 | email-off + in-app-on per-user pref → email skipped, in-app fires | PASS |
| 4 | Idempotent re-send → second call skips email | PASS |
| 5 | Variable substitution through full pipeline | PASS |
| 6 | One recipient throws → others still receive | PASS |

## Field-Name Adjustments After Reading Schema

| Design Doc Said | Actual Schema Field | File Affected |
|---|---|---|
| `isEnabled` (TenantNotificationSettings) | `isActive` | `dispatcher.ts` step 2 |
| `kind` (DefaultRecipientRule discriminant) | `type` | `recipient-resolver.ts` |
| `@/lib/prisma` (prisma client path) | `@/lib/db/prisma` | `dispatcher.ts`, `idempotency.ts`, `audit-log.ts` |
| SKIPPED_IDEMPOTENT (enum value) | Missing — added via migration | `schema.prisma` + `migration.sql` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added SKIPPED_IDEMPOTENT to NotificationSendStatus enum**
- **Found during:** Task 5 (audit-log.ts implementation)
- **Issue:** The `NotificationSendStatus` enum in schema.prisma only had `PENDING`, `SENT`, `FAILED`, `SKIPPED_DISABLED`, `SKIPPED_USER_PREF` — no `SKIPPED_IDEMPOTENT`. Using `SKIPPED_DISABLED` as a fallback would have created ambiguous audit rows.
- **Fix:** Added enum value to schema.prisma + created migration `20260514200002_add_notification_send_status_idempotent`
- **Files:** `apps/web/prisma/schema.prisma`, `apps/web/prisma/migrations/20260514200002_*/migration.sql`
- **Commit:** 131572c

**2. [Rule 1 - Bug] Mocked template-renderer in unit tests**
- **Found during:** Task 9 (Vitest tests)
- **Issue:** Root monorepo `node_modules` has `react@19.2.0` vs `react-dom@19.2.4` — a minor version mismatch that causes `@react-email/render` to throw `Incompatible React versions` in the test environment (Vitest runs from root). This doesn't affect production (Next.js resolves versions correctly from its own lockfile).
- **Fix:** Added `vi.mock('../template-renderer', ...)` that performs real variable substitution but bypasses the React rendering. The mock faithfully tests the dispatcher's behavior.
- **Files:** `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts`
- **Commit:** 131572c

## Outstanding Follow-ups for Plans 03-05

1. **Plan 03 (Admin Editor UI):** Must use `@tiptap/starter-kit` with the same extension set as `template-renderer.ts` to guarantee identical server-side vs. editor-side rendering. Do not add extra extensions on either side without updating both.

2. **Plan 04 (Trigger call sites):** Server actions and cron routes call `dispatchNotification()` — import path is `@/lib/notifications/dispatcher`. The `payload` type is fully inferred from `TriggerKey` via `NotificationPayload[K]`.

3. **Plan 05 (Digest runner):** Use `isDigest: true` when calling `buildIdempotencyKey()` to get per-day deduplication instead of per-second.

4. **InAppNotificationType enum extension:** When Phase 41 is complete and the enum needs new values (e.g., for `route.*`, `user.*`, `digest.*`), extend the enum in schema.prisma and update `in-app-writer.ts`'s `mapTriggerToType()` function.

5. **React version fix:** The root monorepo should align `react` and `react-dom` to the same patch version to unblock unit-testing the template-renderer without mocking.

## Self-Check: PASSED

All files exist at expected paths. Commit 131572c found in git log. TypeScript passes. 6/6 tests pass.
