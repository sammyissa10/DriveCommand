---
phase: quick-432
plan: 432
type: diagnosis
wave: 1
depends_on: []
files_modified: []
autonomous: true
read_only: true
must_haves:
  truths:
    - "Diagnosis identifies outcome (a), (b), or (c) with file/line evidence"
    - "One-line fix is stated for the applicable outcome"
  artifacts: []
  key_links: []
---

<objective>
Diagnose why creating a trip from /carrier/trips/new does not advance onboarding
(ActivationProgress) and leaves the "Finish Setup" banner visible.

READ-ONLY. No code changes. Diagnosis complete — findings below.
</objective>

<diagnosis>

## Outcome: (a) WIRING GAP — by design mismatch

Creating a trip is NOT an activation event in the current system. The activation
tracker only advances onboarding when a load/trip transitions to **IN_TRANSIT**,
not when a trip is created. The trip create path never calls the tracker at all.

## Evidence

### 1. ActivationProgress steps (apps/web/prisma/schema.prisma:2825-2844)
Four trackable onboarding steps + accountCreated baseline:
- `firstRealTruckAt`     — first real truck added
- `firstRealDriverAt`    — first real driver added
- `firstRealClientAt`    — first real client added
- `firstLoadInTransitAt` — first real load goes IN_TRANSIT
- `completionPct` starts at 20 (account created), +20 per step, 100 = activated
- `isActivated` boolean, set true only when completionPct hits 100

There is **no "trip created" step**. The closest step is `firstLoadInTransitAt`,
which fires on status transition, not creation.

### 2. ActivationEventType enum (apps/web/src/lib/onboarding/activation-tracker.ts:11-15)
Only four events exist: `first_real_truck`, `first_real_driver`,
`first_real_client`, `first_load_in_transit`. No "trip/dispatch created" event.

### 3. Trip create path does NOT call the tracker
`createTrip(orgId, data)` at apps/web/src/lib/carrier/trips.ts:169 contains no
`recordActivationEvent(...)` call. The only two occurrences of the import in
trips.ts are:
- line 5: the import statement
- line 622: inside `transitionTripStatus` when a real load reaches IN_TRANSIT:
  `await recordActivationEvent(orgId, 'first_load_in_transit');`

So even the IN_TRANSIT activation requires a separate status transition AFTER
create — never the create itself.

### 4. isActivated is ALL-steps, not per-step (activation-tracker.ts:113-128)
`newPct = 20 * (1 + truckDone + driverDone + clientDone + transitDone)`.
`isActivated` only flips true when `newPct === 100` (all 4 steps done). Therefore
even if a trip-create event existed, the banner would correctly stay up unless
truck + driver + client + first-in-transit were ALL already complete.

### 5. Banner reads isActivated server-side (apps/web/src/app/(owner)/layout.tsx:50-63)
The owner layout queries `ActivationProgress.isActivated` on each server render and
passes `onboardingComplete` to `OwnerShell`. This is a fresh server query (no
client cache), so a *real* update would surface on next navigation/refresh. Not a
stale-cache problem.

## Why the user saw no change
Creating a trip writes a Trip row but fires zero activation events. The
`firstLoadInTransitAt` step only advances when the trip/load is moved to IN_TRANSIT
via `transitionTripStatus` (trips.ts:622) or `updateLoadStatus`
(loads.ts:608). The "create a trip advances onboarding" expectation does not match
the implemented model — the system tracks "first load IN TRANSIT", not "first trip
created".

## Ruled out
- (b) banner correct because other steps pending — possible contributor, but the
  primary cause is no event fires on create at all. Even with all other steps done,
  creating a trip alone would not flip isActivated.
- (c) stale cache — ruled out. layout.tsx:52 runs a live $queryRaw per render; no
  caching layer sits between it and the banner.

## One-line fix (whichever the product intends)
- If "create trip" SHOULD count as the load step: add
  `await recordActivationEvent(orgId, 'first_load_in_transit')` at the end of
  `createTrip` in apps/web/src/lib/carrier/trips.ts (after the trip is created),
  OR
- If the design is intentional (activation = first IN_TRANSIT, not create): no code
  fix — the banner is behaving correctly; the user must move a trip to IN_TRANSIT,
  and all of truck/driver/client must also be complete for isActivated to flip.

Recommended: confirm product intent first. The cleanest interpretation matching the
existing model is to keep IN_TRANSIT as the trigger and treat the user report as an
expectation mismatch, not a bug — but if create should count, the one-liner above
in createTrip closes the gap.

</diagnosis>

<success_criteria>
- Outcome identified: (a) wiring gap, with (b) as secondary contributor
- File/line evidence cited for all 5 investigation steps
- One-line fix provided per product intent
</success_criteria>
