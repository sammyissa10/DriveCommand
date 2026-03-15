---
phase: quick-69
plan: "01"
subsystem: maintenance
tags: [edit, crud, scheduled-services, server-actions, forms]
dependency_graph:
  requires: []
  provides: [edit-scheduled-service-flow]
  affects: [maintenance-page, scheduled-service-list]
tech_stack:
  added: []
  patterns: [server-action-bind, redirect-outside-try-catch, optimistic-ui, initialValues-pattern]
key_files:
  created:
    - src/app/(owner)/trucks/[id]/maintenance/[serviceId]/edit/page.tsx
  modified:
    - src/app/(owner)/actions/maintenance.ts
    - src/components/maintenance/scheduled-service-form.tsx
    - src/components/maintenance/scheduled-service-list.tsx
    - src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
decisions:
  - "Used updateScheduledService.bind(null, truckId, serviceId) to pass route params to server action, matching existing createScheduledService pattern"
  - "baselineDate formatted via toISOString().split('T')[0] to ensure YYYY-MM-DD for date input defaultValue"
metrics:
  duration: 160s
  completed: "2026-03-15"
  tasks: 2
  files: 5
---

# Quick Task 69: TKT-0022 — Add Edit Functionality for Scheduled Services Summary

**One-liner:** Full edit flow for scheduled services — getScheduledService + updateScheduledService server actions, edit page at /trucks/[id]/maintenance/[serviceId]/edit with pre-filled form, and Edit links in the service list table.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add server actions and update form for edit support | e11a0e4 | maintenance.ts, scheduled-service-form.tsx |
| 2 | Create edit page and add Edit links to list | a7e8c30 | edit/page.tsx, scheduled-service-list.tsx, maintenance-page-client.tsx |

## What Was Built

**Server Actions (maintenance.ts):**
- `getScheduledService(id)` — fetches single scheduled service by ID with OWNER/MANAGER role check
- `updateScheduledService(truckId, serviceId, prevState, formData)` — parses and validates FormData using same schema as create, updates record, revalidates path, redirects (outside try/catch per Next.js NEXT_REDIRECT pattern)

**Form (scheduled-service-form.tsx):**
- Added optional `initialValues` prop with typed fields for all 6 inputs
- Each input now uses `initialValues?.field ?? defaultFallback` for defaultValue

**Edit Page (/trucks/[id]/maintenance/[serviceId]/edit/page.tsx):**
- Fetches truck and service in parallel via `Promise.all`
- Formats `baselineDate` to YYYY-MM-DD for date input compatibility
- Binds action with both `truckId` and `serviceId`
- Same layout as schedule-service page (ArrowLeft back link, h1, card with form)
- Returns `notFound()` if truck or service missing

**List (scheduled-service-list.tsx):**
- Added `truckId: string` prop
- Added `import Link from 'next/link'`
- Actions column now renders `<>Edit link | Delete button</>` fragment

**Client (maintenance-page-client.tsx):**
- Passes `truckId={truckId}` to `<ScheduledServiceList>`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with no errors
- `npm run build` succeeds, route `/trucks/[id]/maintenance/[serviceId]/edit` listed as dynamic (ƒ)

## Self-Check: PASSED

Files exist:
- src/app/(owner)/trucks/[id]/maintenance/[serviceId]/edit/page.tsx - FOUND
- src/app/(owner)/actions/maintenance.ts - FOUND
- src/components/maintenance/scheduled-service-form.tsx - FOUND
- src/components/maintenance/scheduled-service-list.tsx - FOUND
- src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx - FOUND

Commits:
- e11a0e4 - FOUND
- a7e8c30 - FOUND
