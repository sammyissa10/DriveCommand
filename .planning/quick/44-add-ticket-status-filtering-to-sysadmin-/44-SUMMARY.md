---
phase: quick-44
plan: "01"
subsystem: admin-support
tags:
  - client-filtering
  - tab-ui
  - support-tickets
  - admin-portal
dependency_graph:
  requires:
    - quick-41 (SupportTicket system, AdminTicketList component)
  provides:
    - Status tab filtering on admin support dashboard
  affects:
    - src/app/(admin)/admin-support/ticket-list.tsx
tech_stack:
  added: []
  patterns:
    - useState tab selection with derived filtered list
    - Pre-computed tab counts from full unfiltered prop
key_files:
  modified:
    - src/app/(admin)/admin-support/ticket-list.tsx
decisions:
  - Combined RESOLVED + CLOSED into one "Closed" tab — both represent resolved work and reduce visual noise for admins triaging open issues
  - Used plain flex button row instead of shadcn Tabs — no new dependency, simpler markup
  - Counts computed from full `tickets` prop (not filtered) so tab counts are always accurate regardless of which tab is active
  - Empty state message shown when filtered list is empty (instead of silence)
metrics:
  duration: ~60s
  completed: "2026-03-07"
  tasks_completed: 1
  files_modified: 1
---

# Quick-44: Add Ticket Status Filtering to Sysadmin Dashboard — Summary

**One-liner:** Client-side tab filter (All / Open / In Progress / Closed) with per-tab counts added to AdminTicketList, with RESOLVED + CLOSED combined into a single Closed bucket.

## What Was Built

The `AdminTicketList` component previously rendered every ticket in a flat list with no way to focus on a specific status. Admins had to scroll past closed tickets to reach open ones needing triage.

A tab bar was added above the existing count/hint row. Tabs:
- **All** — shows all tickets (default)
- **Open** — `status === 'OPEN'`
- **In Progress** — `status === 'IN_PROGRESS'`
- **Closed** — `status === 'RESOLVED' || status === 'CLOSED'` (combined bucket)

Each tab label shows a count computed from the full unfiltered `tickets` prop so numbers stay accurate regardless of the selected tab. The heading below the tabs reflects the active filter (e.g. "Open Tickets (3)"). An empty-state message is shown if a filtered view has no tickets.

The active tab uses `bg-white border shadow-sm text-gray-900 font-semibold`; inactive tabs use `text-gray-500 hover:text-gray-700 hover:bg-gray-100`. All tab buttons share `px-3 py-1.5 rounded-md text-sm transition-colors`.

No changes to `TicketRow`, the status update logic, `page.tsx`, or any other behavior.

## Commits

| Hash | Description |
|------|-------------|
| f393887 | feat(quick-44-01): add status tab filtering to AdminTicketList |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/app/(admin)/admin-support/ticket-list.tsx` modified with tab UI
- [x] `npx tsc --noEmit` produced zero errors
- [x] Commit f393887 exists
