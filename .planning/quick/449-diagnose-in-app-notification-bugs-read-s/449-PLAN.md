# Quick-449: Diagnose In-App Notification Bugs — Read-State Reverts & Displayed Age Wrong

**Type:** READ ONLY diagnostic  
**Date:** 2026-06-15  
**Status:** COMPLETE

---

## Objective

Definitively root-cause two in-app notification bugs observed live on `/carrier/dashboard` without making any code changes. Produce file:line citations, spec-section evidence, and smallest-correct-fix recommendations for each bug.

---

## Authoritative Spec

`docs/specs/Notifications System Technical Documentation.md`  
Key sections: Dispatch Architecture (10-step flow), Database Architecture, Idempotency.

---

## Files to Read (Diagnostic Scope)

1. `docs/specs/Notifications System Technical Documentation.md` — spec anchor
2. `apps/web/prisma/schema.prisma` — `InAppNotification` model shape
3. `apps/web/src/components/navigation/notification-center.tsx` — bell dropdown
4. `apps/web/src/components/navigation/notification-bell.tsx` — polling component
5. `apps/web/src/components/dashboard/notifications-panel.tsx` — alerts panel
6. `apps/web/src/app/(owner)/actions/dashboard.ts` — alert timestamp source
7. `apps/web/src/app/api/v1/carrier/notifications/route.ts` — GET handler
8. `apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts` — PATCH handler
9. `apps/web/src/lib/carrier/in-app-notifications.ts` — legacy insertion path
10. `apps/web/src/lib/notifications/in-app-writer.ts` — Phase 41 insertion path
11. `apps/web/src/lib/notifications/dispatcher.ts` — Phase 41 dispatch orchestrator
12. `apps/web/src/lib/notifications/idempotency.ts` — Phase 41 idempotency keys
13. `apps/web/src/lib/notifications/notification-deduplication.ts` — legacy idempotency
14. `apps/web/src/lib/carrier/notifications.ts` — legacy senders

---

## Bug Hypotheses to Evaluate

**Bug A (read-state reverts):**
- A1: `mark-read` not persisting to DB
- A2: Bell polling refetch overwrites local read state
- A3: Duplicate `InAppNotification` rows inserted → user marks one, sibling remains unread

**Bug B (displayed age wrong):**
- B1: Display reads wrong field (entity date, not notification creation time)
- B2: `createdAt` value itself is stale (inserted with entity date or old timestamp)

---

## Tasks

- [x] Read spec (Dispatch Architecture, Idempotency sections)
- [x] Read `InAppNotification` schema shape
- [x] Trace "X ago" field from DB → API → component for both panels
- [x] Trace mark-read persistence end-to-end
- [x] Audit bell polling scope (does it refetch notification list?)
- [x] Audit in-app insertion paths for idempotency guards
- [x] Produce final diagnostic report (449-SUMMARY.md)
