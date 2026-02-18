---
phase: quick-11
plan: 01
subsystem: ui
tags: [compliance, documents, expiry, safety, dashboard, prisma]

# Dependency graph
requires:
  - phase: phase-18
    provides: Driver document storage with expiryDate field and documentType enum
  - phase: quick-1
    provides: Truck documentMetadata JSONB with registrationExpiry/insuranceExpiry
  - phase: quick-10
    provides: Sidebar Intelligence section and lane-analytics page as structural reference

provides:
  - Compliance dashboard at /compliance with 4-section layout
  - getComplianceDashboard() server action returning ComplianceDashboardData
  - Driver document expiry tracking with OK/EXPIRING_SOON/EXPIRED status classification
  - Truck registration and insurance expiry tracking with NOT_SET fallback
  - Safety event aggregation (HIGH/CRITICAL counts per driver, last 90 days)
  - Prioritized alerts panel (EXPIRED first, then soonest EXPIRING_SOON)
  - Sidebar Compliance link under Intelligence for OWNER/MANAGER
affects: [compliance, drivers, trucks, safety, sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "30-day threshold for EXPIRING_SOON status (consistent with Phase 18-02)"
    - "documentMetadataSchema.safeParse() for safe JSONB parsing with NOT_SET fallback"
    - "worstStatus aggregation pattern for multi-document/multi-field overall status"
    - "Alerts sorted EXPIRED first, then ascending daysUntilExpiry"

key-files:
  created:
    - src/app/(owner)/actions/compliance.ts
    - src/app/(owner)/compliance/page.tsx
    - src/components/compliance/compliance-summary-cards.tsx
    - src/components/compliance/compliance-alerts-panel.tsx
    - src/components/compliance/driver-compliance-table.tsx
    - src/components/compliance/truck-compliance-table.tsx
  modified:
    - src/components/navigation/sidebar.tsx

key-decisions:
  - "Used documentMetadataSchema.safeParse() for truck JSONB - invalid/null metadata gracefully becomes NOT_SET"
  - "Alerts show daysUntilExpiry as negative when already expired (days overdue)"
  - "worstTruckStatus ranks NOT_SET below OK so trucks without metadata don't falsely dominate overall status"
  - "Safety event counts shown per driver using color-coded thresholds: green=0, amber=1-2, red=3+"
  - "date-fns addDays/subDays used for expiry threshold calculations (consistent with Phase 18-02)"

patterns-established:
  - "Compliance status: EXPIRED (past now) > EXPIRING_SOON (within 30 days) > OK (beyond 30 days)"
  - "Truck compliance: NOT_SET status for missing documentMetadata fields (no crash, graceful UI)"
  - "DriverComplianceItem groups all documents by driver ID with computed overallStatus"

# Metrics
duration: 4min
completed: 2026-02-18
---

# Quick Task 11: Build Compliance Dashboard Summary

**Fleet-wide compliance monitoring dashboard at /compliance with driver document expiry, truck registration/insurance status, safety violation counts, and prioritized alerts panel — all driven by a single getComplianceDashboard() server action.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-18T21:31:49Z
- **Completed:** 2026-02-18T21:35:45Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- getComplianceDashboard() server action aggregates driver documents, truck documentMetadata, and safety events into a single typed response
- /compliance page with 4 sections: summary cards, alerts panel, driver compliance table, truck compliance table
- 30-day expiry threshold (EXPIRING_SOON), consistent with Phase 18-02 decisions
- Trucks with null/missing documentMetadata show "Not Set" gracefully without crashes
- Alerts panel shows "All Clear" with green CheckCircle when no issues exist
- Sidebar Compliance link (ClipboardCheck icon) added under Intelligence for OWNER/MANAGER

## Task Commits

Each task was committed atomically:

1. **Task 1: Compliance data action** - `5b8c900` (feat)
2. **Task 2: Compliance page and components** - `4fbb6b9` (feat)

**Plan metadata:** _(created in this step)_

## Files Created/Modified
- `src/app/(owner)/actions/compliance.ts` - Server action: getComplianceDashboard(), full type exports
- `src/app/(owner)/compliance/page.tsx` - Server component page at /compliance
- `src/components/compliance/compliance-summary-cards.tsx` - 4-card grid: expired, expiring soon, critical/high safety
- `src/components/compliance/compliance-alerts-panel.tsx` - Prioritized alerts list with badges and entity links
- `src/components/compliance/driver-compliance-table.tsx` - Per-driver doc status, safety event color-coding
- `src/components/compliance/truck-compliance-table.tsx` - Registration/insurance status with NOT_SET handling
- `src/components/navigation/sidebar.tsx` - Added ClipboardCheck Compliance link under Intelligence

## Decisions Made
- Used documentMetadataSchema.safeParse() for truck JSONB — invalid/null metadata gracefully becomes NOT_SET rather than crashing
- Alerts show daysUntilExpiry as negative when already expired so UI can display "X days overdue"
- worstTruckStatus ranks NOT_SET below OK so trucks without metadata don't falsely dominate overall status
- Safety event counts shown per driver using color-coded thresholds: green=0, amber=1-2, red=3+
- date-fns addDays/subDays used for threshold calculations, consistent with Phase 18-02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Compliance dashboard live at /compliance
- Ready to extend with more document types, compliance export (PDF/CSV), or notification triggers for near-expiry items
- Foundation in place for compliance audit log if needed

---
*Phase: quick-11*
*Completed: 2026-02-18*
