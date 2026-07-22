# Quick 482 — Onboarding checklist + guided Trips empty state

New users stalled: the "Get started checklist" item "Send your first load in
transit" deep-linked to the Trips overview, which only said "No trips yet. Tap +
to plan your first trip." Nothing conveyed the required order
Client → Contract → Load → Trip.

## Part 1 — Get started checklist (`app/onboarding/welcome/`)
`checklist.tsx` steps rewritten to the dependency chain, in order, each
deep-linking to the correct create form:
1. Add your first client → `/carrier/clients/new`
2. Create a contract for that client → `/carrier/contracts/new`
3. Create your first load → `/carrier/loads/new`
4. Assign the load to a trip and dispatch → `/carrier/trips/new`

Completion is derived from **real records existing**, not click-tracking:
`page.tsx` `getOnboardingFlags(tenantId)` counts clients/contracts/loads/trips,
excluding sample (`isSample`) and soft-deleted (`deletedAt`) rows so seeded demo
data never marks a step done. Progress % is computed in the component from the
booleans (account + 4 chain steps); 100% keeps the "You're all set!" view.

## Part 2 — Trips empty state (`carrier/trips/TripsMobile.tsx`)
`page.tsx` passes `hasLoads` (real, non-sample, non-deleted load count > 0).
Empty state (not filtering, can create):
- No loads: "Create a load first" / "Before you can plan a trip, create a load
  and assign it here." + primary button → New Load (`/carrier/loads/new`).
- Loads but no trips: "Assign a load to start a trip" / "Pick a load, add a truck
  and driver, then dispatch." + primary button → New Trip (`/carrier/trips/new`).
Manager (can't create) + filtered-empty states unchanged.

## Constraints honored
- Trip creation flow + data model unchanged (only reads: counts + a prop).
- Copy short, action-oriented, no jargon.

## Out of scope
Desktop `DispatchesGrid` uses the generic data-grid empty state (the quoted copy
is the mobile-web view); left unchanged.
