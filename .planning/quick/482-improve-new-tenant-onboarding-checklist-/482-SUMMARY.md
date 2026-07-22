# Quick 482 — Summary

## Problem
New tenants stalled: the "Get started checklist" step "Send your first load in
transit" deep-linked to the Trips overview, which only showed
"No trips yet. Tap + to plan your first trip." Nothing told users the required
order: **Client → Contract → Load → Trip → dispatch**, so they hit an empty
screen with no path forward.

## Changes
### 1. Get started checklist (`app/onboarding/welcome/checklist.tsx` + `page.tsx`)
- Steps rewritten to the dependency chain, in order, each deep-linking to the
  correct create form:
  1. Add your first client → `/carrier/clients/new`
  2. Create a contract for that client → `/carrier/contracts/new`
  3. Create your first load → `/carrier/loads/new`
  4. Assign the load to a trip and dispatch → `/carrier/trips/new`
- Each step is complete **when the record actually exists**, not when the link
  was clicked: new `getOnboardingFlags(tenantId)` counts clients/contracts/
  loads/trips, excluding **sample** (`isSample`) and **soft-deleted**
  (`deletedAt`) rows so seeded demo data can't falsely complete a step.
- Progress % is derived in the component from the booleans (account + 4 steps);
  100% keeps the existing "You're all set!" view. Wired into all three render
  paths (normal, hydrate-catch, unauthenticated preview).

### 2. Trips empty state (`carrier/trips/page.tsx` + `TripsMobile.tsx`)
- `page.tsx` passes `hasLoads` = real (non-sample, non-deleted) load count > 0.
- Guided empty state (owner/manager-with-create, not filtering):
  - **No loads:** "Create a load first" / "Before you can plan a trip, create a
    load and assign it here." + primary button → New Load.
  - **Loads but no trips:** "Assign a load to start a trip" / "Pick a load, add a
    truck and driver, then dispatch." + primary button → New Trip (assign flow).
  - Read-only (Manager) and filtered-empty states unchanged.

## State walkthrough (what each screen shows)
Checklist (Get started, `/onboarding/welcome`):
- **No client:** 20% bar; "Account created" ✓; four open rows, "Add your first
  client" is the next action → clients/new.
- **Client, no contract:** 40%; client ✓; next action "Create a contract for that
  client" → contracts/new.
- **Contract, no load:** 60%; next "Create your first load" → loads/new.
- **Load, no trip:** 80%; next "Assign the load to a trip and dispatch" →
  trips/new.
- **Trip exists:** 100% → "You're all set!" + Go to Dashboard.

Trips overview (mobile-web):
- **No load:** "Create a load first" + [New load] → loads/new.
- **Load, no trip:** "Assign a load to start a trip" + [Assign a load] →
  trips/new.
- **Trips exist:** normal list (KPIs, search, filters).

## Constraints honored
- Trip creation flow and data model **unchanged** — only reads (counts) + a new
  prop were added.
- Copy is short, action-oriented, jargon-free.

## Verification
- `npx tsc --noEmit` → **0 errors**.

## Out of scope
- Desktop `DispatchesGrid` uses the generic data-grid empty state (the quoted
  copy is the mobile-web view); left unchanged.
