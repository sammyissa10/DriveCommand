---
phase: quick-402
plan: 01
subsystem: carrier-operations
tags: [investigation, architecture, data-model, trip-load-redesign]
dependency-graph:
  requires: []
  provides:
    - investigation-findings
    - data-universe-documentation
    - ui-component-catalog
    - stop-completion-flow-spec
  affects:
    - carrier-operations
    - mobile-app
    - original-loads-routes
tech-stack:
  added: []
  patterns:
    - Read-only investigation
    - Schema analysis
    - Data model comparison
key-files:
  created:
    - .planning/investigations/trip-load-redesign-findings.md
  modified: []
decisions:
  - Two parallel data universes exist and are both FULLY LIVE (not dead code)
  - Migration recommendation: Gradual Convergence (Option B) — add carrierLoadId FK, dual-write, migrate incrementally
  - UI component gaps identified: <StopSequenceEditor />, <LoadForm />, <RevenueBreakdown />, <StatusTransitionModal />
  - Workflow engine gap: no stop-level playbooks (only dispatch-level)
metrics:
  duration: 355s
  completed: 2026-05-24T16:18:45Z
  tasks: 3
  files: 1
---

# Phase quick-402 Plan 01: Read-Only Investigation — Map Trip/Load/Driver Assignment Data Model

**One-liner:** Comprehensive investigation mapping two parallel data universes (PascalCase Load/Route vs snake_case CarrierLoad/CarrierDispatch), documenting relationships, route templates, UI components, and driver stop-completion flow.

---

## Overview

**Objective:** Conduct a read-only investigation to understand the current trip/load/driver assignment data model and identify opportunities for future redesign.

**Context:** DriveCommand has two coexisting data models for loads and trips. This investigation maps both systems, documents their relationships, and provides a foundation for future consolidation decisions.

**Outcome:** Produced comprehensive 1003-line findings document covering 5 investigation areas with migration recommendations and UI component gap analysis.

---

## What Was Built

### Investigation Findings Document

**File:** `.planning/investigations/trip-load-redesign-findings.md` (1003 lines)

**Section 1: Two Parallel Data Universes**
- Documented **PascalCase universe** (original DriveCommand):
  - Tables: Load, Route, RouteStop, Customer, Truck, User, Invoice, Document
  - Key relationships: Load.routeId → Route, RouteStop.loadId → Load, Load.customerId → Customer
  - Pages using this: `/loads/*`, `/routes/*`, `/invoices/*`, driver portal (web + mobile)
  - Assessment: **FULLY LIVE** — used by owner/driver portals, mobile app, invoicing, CRM
- Documented **snake_case universe** (Carrier Operations):
  - Tables: CarrierLoad, CarrierDispatch, CarrierStop, CarrierClient, CarrierTruck, CarrierDriver, CarrierFacility, RouteTemplate
  - Key relationships: CarrierLoad.dispatchId → CarrierDispatch, CarrierStop.loadId → CarrierLoad, CarrierStop.facilityId → CarrierFacility
  - Pages using this: `/carrier/loads/*`, `/carrier/dispatches/*`, `/carrier/facilities/*`
  - Assessment: **FULLY LIVE** — used by Carrier Operations portal, dispatch board, driver pay system
- **Critical finding:** Two "Load" tables (Load vs CarrierLoad) are NOT connected:
  - Different customer FKs (Customer vs CarrierClient)
  - Different rate models (single rate field vs itemized rate components)
  - Different addressing (free-text origin/destination vs facility-based)
  - No foreign keys between universes
- **Dead code assessment:** Neither universe is dead code. Both are actively used.

**Section 2: Current Dispatch/Trip Model**
- Documented entity relationships:
  - Can load exist before truck assigned? **YES** — CarrierLoad.dispatchId is nullable
  - Can one dispatch carry multiple loads? **YES** — one-to-many relation
  - Where does stop sequence live? CarrierStop.sequenceOrder + unique constraint (dispatchId, sequenceOrder)
  - Where does revenue live? CarrierLoad.totalRevenue (calculated + stored)
- Documented status state machines:
  - **CarrierDispatch:** planned → in_progress → completed (or planned → cancelled/tonu)
  - **CarrierLoad:** pending → in_transit → delivered → invoiced (or pending → cancelled)
  - **CarrierStop:** pending → arrived → completed (or any → skipped)
- Documented cascades:
  - Stop completion → load status update (pickup → in_transit, last delivery → delivered)
  - All stops done → dispatch completion → driver pay record generation

**Section 3: Route Templates**
- Documented RouteTemplate schema:
  - `recurrenceRule` — iCal RRULE (FREQ=DAILY/WEEKLY/MONTHLY)
  - `scheduledDepartureTime` — time-only string (e.g., "08:00")
  - `defaultDriverId`, `defaultTruckId` — carry-forward for auto-generated dispatches
  - `estimatedMiles` — inherited by generated dispatches
- Documented RRULE parsing:
  - `computeNextOccurrence()` — custom parser (no library dependency)
  - Supports: DAILY, WEEKLY (with BYDAY), MONTHLY (with BYMONTHDAY)
  - Handles: UNTIL, COUNT, INTERVAL
- Documented dispatch generation:
  - **Manual:** User creates dispatch with routeTemplateId → inherits stops
  - **Auto:** Dispatch completion triggers next occurrence generation (if recurrenceRule exists)
  - Deduplication: checks for existing dispatch on next date + template before creating
- **Key finding:** Loads do NOT attach to templates. Templates generate dispatches, loads attach to dispatches.

**Section 4: Existing UI Building Blocks**
- Catalogued stop management:
  - `StopInput` interface (well-designed, reusable)
  - `persistStops()` helper (transaction-based, tenant-isolated, sequence-offset logic)
  - **Gap:** No frontend `<StopSequenceEditor />` component
- Catalogued dispatch pages:
  - List/detail pages use DataGrid pattern (reusable as-is)
  - **Gap:** Status transition UI is inline buttons (extract `<StatusTransitionModal />`)
- Catalogued load pages:
  - Carrier Operations: list/detail/create (reusable with changes)
  - Original: `/loads/*` pages (legacy, phase out after migration)
  - **Gap:** Create page has inline stop builder (use shared `<StopSequenceEditor />`)
- Catalogued driver views:
  - Web driver portal uses original Load/Route models
  - Mobile app uses original Load/Route models
  - **Blocker:** Cannot migrate to Carrier Operations without breaking mobile app
- Identified missing components:
  - `<StopSequenceEditor />` — drag-and-drop, facility picker, appointment times
  - `<LoadForm />` — freight fields, rate calculator, dispatch picker
  - `<RevenueBreakdown />` — itemized revenue display
  - `<StatusTransitionModal />` — reusable status change modal

**Section 5: Driver Stop-Completion Flow**
- Documented 3-stage cascade:
  1. `arriveStop()` — pending → arrived, sets arrivedAt
  2. `completeStop()` — arrived → completed:
     - Enforces BOL/POD requirements (from RouteTemplateStop config)
     - Computes dwellMinutes
     - Cascade to load: pickup → in_transit, last delivery → delivered + revenue recalc
     - Cascade to dispatch: all stops done → completed + pay record generation
  3. `skipStop()` — any → skipped (admin override, requires skipReason)
- Documented document upload flow:
  - CarrierDocument table with stopId FK
  - Document types: bol, pod, rate_confirmation, inspection, other
  - Enforcement: completeStop() checks for document OR number before allowing completion
  - **Gap:** `bypassDocumentCheck=true` has no audit trail
- Documented workflow engine integration:
  - Dispatch-level playbooks: ON_DISPATCH_CREATE, ON_DISPATCH_DEPART, ON_DISPATCH_DELIVER
  - **Gap:** No stop-level playbooks (stops are NOT entities in workflow engine)

**Section 6-8: Summary, Appendix, Checklist**
- Provided migration path recommendations:
  - **Option A:** Full migration (high risk, high reward)
  - **Option B:** Gradual convergence (low risk, slower) — **RECOMMENDED**
- Provided UI component reusability matrix
- Provided stop-completion enhancement recommendations
- Provided route template improvement recommendations
- File references appendix (all service layer files, pages, APIs)
- Investigation completion checklist (8/8 items checked)

---

## Deviations from Plan

None — plan executed exactly as written. All investigation scope items documented.

---

## Key Decisions

1. **Two parallel universes are both LIVE** — Neither is dead code. Both serve active parts of the application.
2. **Migration recommendation: Gradual Convergence** — Add `carrierLoadId` FK to original Load, dual-write, migrate incrementally (Option B).
3. **Mobile app is migration blocker** — Mobile uses original Load/Route models. Cannot switch to Carrier Operations without breaking app.
4. **UI component gaps identified** — Need 4 shared components: StopSequenceEditor, LoadForm, RevenueBreakdown, StatusTransitionModal.
5. **Workflow engine gap** — No stop-level playbooks. Stops are not entities in workflow engine (future enhancement needed).

---

## Technical Notes

**Investigation Method:**
- Schema analysis: Grep'd `model Route`, `model CarrierDispatch`, etc. from `schema.prisma`
- Service layer review: Read `dispatches.ts`, `loads.ts`, `route-templates.ts`, `stop-completion.ts`
- Page usage mapping: Glob'd `**/loads/**/*.tsx` and `**/carrier/loads/**/*.tsx`, grep'd for `prisma.load` vs `prisma.carrierLoad`
- Relationship tracing: Followed FK chains (Load → Route → RouteStop, CarrierLoad → CarrierDispatch → CarrierStop)
- State machine documentation: Traced `transitionDispatchStatus()` and `completeStop()` cascades

**Key Observations:**
- **Zero foreign keys** between the two universes (Load vs CarrierLoad, Customer vs CarrierClient)
- **Mobile API** (`/api/mobile/driver/loads`) uses original Load model
- **Carrier Operations API** (`/api/v1/carrier/loads`) uses CarrierLoad model
- **Invoice table** has `loadId` FK pointing to original Load (not CarrierLoad)
- **Customer tracking** uses `Load.trackingToken` (public tracking page)
- **Driver pay system** depends on CarrierDispatch/CarrierLoad (cannot migrate without breaking pay)

**Migration Complexity:**
- **High:** Invoice generation tied to Load.id (need historical invoice FK migration)
- **High:** Mobile app compiled with original Load model (need v6.0 rebuild + OTA update)
- **Medium:** Customer tracking tokens (need Load.trackingToken → CarrierLoad.trackingToken migration)
- **Low:** UI pages (can run both in parallel during migration)

---

## Self-Check: PASSED

**Created files exist:**
- [x] `.planning/investigations/trip-load-redesign-findings.md` — 1003 lines

**No commits:**
- Investigation produced findings document only (no code changes)

**All 5 sections complete:**
- [x] Section 1: Two Parallel Data Universes (PascalCase + snake_case)
- [x] Section 2: Current Dispatch/Trip Model
- [x] Section 3: Route Templates
- [x] Section 4: Existing UI Building Blocks
- [x] Section 5: Driver Stop-Completion Flow

**Bonus sections:**
- [x] Section 6: Summary and Recommendations
- [x] Section 7: Appendix: File References
- [x] Section 8: Investigation Completion Checklist

---

## Commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 | 993cfd96 | Map two parallel data universes (PascalCase vs snake_case), document schemas, assess live/dead code |
| 2-3 | 47beb11f | Document dispatch/trip model relationships, route templates (RRULE), UI components, driver stop flow |

---

## Duration

**Total:** 355 seconds (~6 minutes)

---

## Next Steps

**For future trip/load redesign work:**
1. Review findings document with product team
2. Decide on migration strategy (Option A vs Option B)
3. If Option B (Gradual Convergence):
   - Phase 1: Add `carrierLoadId` FK to original Load table
   - Phase 2: Implement dual-write (create CarrierLoad shadow record on every Load create)
   - Phase 3: Migrate invoicing to use CarrierLoad (start with new invoices)
   - Phase 4: Mobile v6.0 — switch to Carrier Operations API
   - Phase 5: Deprecate original Load/Route models after all devices updated
4. Extract shared UI components:
   - `<StopSequenceEditor />` — drag-and-drop stop builder
   - `<LoadForm />` — reusable load creation form
   - `<RevenueBreakdown />` — itemized revenue display
   - `<StatusTransitionModal />` — reusable status change modal
5. Add workflow engine stop-level playbooks:
   - `TriggerEvent.ON_STOP_ARRIVE`
   - `TriggerEvent.ON_STOP_COMPLETE`
   - Allow `PlaybookInstance.entityType = 'stop'`
