---
phase: quick-312
plan: "01"
subsystem: navigation
tags: [sidebar, nav-cleanup, duplicates]
dependency_graph:
  requires: []
  provides: [clean-sidebar-nav]
  affects: [apps/web/src/components/navigation/sidebar.tsx]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - apps/web/src/components/navigation/sidebar.tsx
decisions:
  - "Only one REMOVE: the Driver Pay sub-item under Reports (/carrier/reports/driver-pay). All other candidate entries (Loads, Drivers, Trucks, Routes, CRM, Payroll) have no duplicate in the sidebar."
metrics:
  duration: "~5 minutes"
  completed: "2026-05-14"
---

# Quick-312: Sidebar Cleanup — Remove Duplicate Legacy Entries

**One-liner:** Removed the duplicate `Driver Pay` sub-entry at `/carrier/reports/driver-pay` from the Reports sub-group; the canonical module at `/carrier/driver-pay/` is the only remaining Driver Pay nav entry.

---

## Before-State Nav Tree

```
INTELLIGENCE (owner/manager + liveMap permission)
  Live Map → /live-map

CARRIER OPS (owner/manager)
  Carrier Dashboard → /carrier/dashboard
  Clients → /carrier/clients
  Contracts → /carrier/contracts
  Templates → /carrier/templates
  Dispatches → /carrier/dispatches
  Carrier Loads → /carrier/loads
  Messages → /carrier/messages
  Fleet (sub-group)
    Carrier Drivers → /carrier/fleet/drivers
    Carrier Trucks → /carrier/fleet/trucks
    Facilities → /carrier/facilities
  Driver Pay (sub-group)
    Pending Pay → /carrier/driver-pay/pending
    Settlements → /carrier/driver-pay/settlements
    Reports → /carrier/driver-pay/reports
  Reports (sub-group)
    Revenue → /carrier/reports/revenue
    Driver Pay → /carrier/reports/driver-pay   ← DUPLICATE (removed)
    AR Aging → /carrier/reports/aging
    Performance → /carrier/reports/performance

WORKFLOWS (owner/manager)
  Checklists & Workflows → /checklists

BUSINESS (owner/manager + aiDocuments permission)
  AI Documents → /ai-documents

SETTINGS (owner/manager)
  Team Permissions → /settings/team-permissions  (owner only)
  Subscription → /subscription  (owner only)
  Expense Categories → /settings/expense-categories
  Expense Templates → /settings/expense-templates
  Integrations → /settings/integrations

SUPPORT (all roles)
  My Tickets → /support
  Help Center → /help
```

---

## Audit Table

| Legacy Entry | Path | Carrier Ops Equivalent | Decision |
|---|---|---|---|
| Driver Pay (Reports sub-item) | /carrier/reports/driver-pay | Driver Pay module → /carrier/driver-pay/* | REMOVE |
| Loads (legacy) | — | Carrier Loads → /carrier/loads | No duplicate found — nothing to remove |
| Drivers (legacy) | — | Carrier Drivers → /carrier/fleet/drivers | No duplicate found — nothing to remove |
| Trucks (legacy) | — | Carrier Trucks → /carrier/fleet/trucks | No duplicate found — nothing to remove |
| Routes | — | — | Not present in sidebar at all — nothing to remove |
| CRM | — | — | Not present in sidebar at all — nothing to remove |
| Payroll | — | — | Not present in sidebar at all — nothing to remove |

**Total REMOVE decisions: 1** (within the ≤ 6 threshold — proceeded with removal)

---

## Entries Removed

1. `Driver Pay` sub-item under the Reports sub-group at `/carrier/reports/driver-pay` (lines 371-382 in original file, wrapped in `<PermissionGuard permission="driverPayReport">`)

**Total removed: 1 entry, 12 lines**
**Commit:** 8067d80

---

## Entries Flagged for Investigation

None. All other candidate entries either had no duplicate present, or did not exist in the sidebar at all.

---

## After-State Nav Tree

```
INTELLIGENCE (owner/manager + liveMap permission)
  Live Map → /live-map

CARRIER OPS (owner/manager)
  Carrier Dashboard → /carrier/dashboard
  Clients → /carrier/clients
  Contracts → /carrier/contracts
  Templates → /carrier/templates
  Dispatches → /carrier/dispatches
  Carrier Loads → /carrier/loads
  Messages → /carrier/messages
  Fleet (sub-group)
    Carrier Drivers → /carrier/fleet/drivers
    Carrier Trucks → /carrier/fleet/trucks
    Facilities → /carrier/facilities
  Driver Pay (sub-group)
    Pending Pay → /carrier/driver-pay/pending
    Settlements → /carrier/driver-pay/settlements
    Reports → /carrier/driver-pay/reports
  Reports (sub-group)
    Revenue → /carrier/reports/revenue
    AR Aging → /carrier/reports/aging
    Performance → /carrier/reports/performance

WORKFLOWS (owner/manager)
  Checklists & Workflows → /checklists

BUSINESS (owner/manager + aiDocuments permission)
  AI Documents → /ai-documents

SETTINGS (owner/manager)
  Team Permissions → /settings/team-permissions  (owner only)
  Subscription → /subscription  (owner only)
  Expense Categories → /settings/expense-categories
  Expense Templates → /settings/expense-templates
  Integrations → /settings/integrations

SUPPORT (all roles)
  My Tickets → /support
  Help Center → /help
```

---

## tsc --noEmit Result

```
npm warn config ignoring workspace config at apps/web/.npmrc
(exit code 0 — zero TypeScript errors)
```

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Self-Check: PASSED

- apps/web/src/components/navigation/sidebar.tsx: modified (not deleted)
- Commit 8067d80: found in git log
- grep "Driver Pay" sidebar.tsx: 3 matches — all belong to the single canonical CARRIER OPS Driver Pay parent entry (comment, tooltip, label). Zero matches for /carrier/reports/driver-pay.
- No files under apps/web/src/app/ were touched.
