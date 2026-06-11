---
quick_task: 432
description: Diagnose why creating a trip does not update onboarding ActivationProgress
date: 2026-06-11
outcome: diagnosis-complete
---

# Quick-432 Summary — ActivationProgress / Trip Create Diagnosis

## Result: Outcome (a) — WIRING GAP (by design mismatch)

Creating a trip fires **zero** activation events. The system tracks "first load IN_TRANSIT," not "trip created." The banner is displaying correctly given the current model — the expectation doesn't match the implementation.

---

## Evidence

### 1. ActivationProgress schema (`apps/web/prisma/schema.prisma:2825-2844`)
Four trackable steps:
- `firstRealTruckAt` — first real truck added
- `firstRealDriverAt` — first real driver added
- `firstRealClientAt` — first real client added
- `firstLoadInTransitAt` — first real load reaches IN_TRANSIT

`completionPct` starts at 20 (account created), +20 per step; `isActivated` flips `true` only when `completionPct === 100` (ALL 4 steps done). **No "trip created" step exists.**

### 2. `ActivationEventType` enum (`apps/web/src/lib/onboarding/activation-tracker.ts:11-15`)
Only: `first_real_truck`, `first_real_driver`, `first_real_client`, `first_load_in_transit`. No trip/dispatch creation event.

### 3. `createTrip` never calls the tracker (`apps/web/src/lib/carrier/trips.ts:169`)
Zero `recordActivationEvent(...)` calls in the create path. The tracker is only called at:
- `trips.ts:622` — inside `transitionTripStatus`, only when status reaches `IN_TRANSIT`

### 4. `isActivated` is all-steps, not per-step (`activation-tracker.ts:113-128`)
All four steps must be complete. Even if a trip-create event existed, the banner would correctly stay up unless truck + driver + client + first-in-transit were all done.

### 5. No stale cache (`apps/web/src/app/(owner)/layout.tsx:50-63`)
Owner layout runs a live `$queryRaw` per server render; no caching layer. Outcome (c) ruled out — a real update would show on next navigation.

---

## Ruled Out
- **(b) banner correct because other steps pending** — possible secondary contributor, but primary cause is no event fires at all on trip create.
- **(c) stale cache** — ruled out. Fresh server query per render.

---

## One-Line Fix (pending product intent)

**Option A — if "create trip" should count as the load step:**
In `apps/web/src/lib/carrier/trips.ts` after the trip is created in `createTrip()`:
```ts
await recordActivationEvent(orgId, 'first_load_in_transit');
```

**Option B — if IN_TRANSIT trigger is intentional:**
No code fix. The banner is correct. User must move a trip to IN_TRANSIT status (via the status update modal) AND have truck/driver/client steps already complete.

**Recommendation:** Confirm product intent. The cleanest path is Option B (keep IN_TRANSIT as the trigger) and treat this as an expectation mismatch, not a bug — the onboarding model is deliberately progressive. If create should count, Option A is the one-line change.
