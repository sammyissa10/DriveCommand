---
phase: quick-380
plan: 380
subsystem: driver-portal/notifications
tags: [diagnosis, mobile-web, notifications, tkt-0032]
dependency_graph:
  requires: []
  provides: [380-DIAGNOSIS.md]
  affects: [driver-notification-panel, driver-notification-bell, sonner-toaster]
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md
  modified: []
decisions:
  - Primary cutoff cause: DriverNotificationPanel max-h-[480px] clips on viewports shorter than 544px (e.g., iPhone 5 at 568px)
  - Width cutoff fixed by quick-235 (w-[calc(100vw-2rem)]) but bottom cutoff was not addressed
  - Recommended fix: replace max-h-[480px] with max-h-[calc(100dvh-140px)] using dynamic viewport height
metrics:
  duration: 260s
  completed: 2026-05-19
  tasks_completed: 3
  files_changed: 1
---

# Phase quick Plan 380: TKT-0032 Notification Popup Cutoff Diagnosis Summary

**One-liner:** DriverNotificationPanel with hardcoded max-h-[480px] clips on short mobile viewports (< 568px) because the panel base starts 64px from the top, leaving only 504px remaining on a 568px iPhone 5 — and even less when browser chrome is visible.

## What Was Built

Read-only diagnosis of TKT-0032. No source code modified.

Produced `.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md` with:
- Full identification of the /my-load page file path and wrapping layouts
- Enumeration of all notification popup candidates with file:line citations
- CSS positioning analysis for DriverNotificationPanel and global Toaster
- Mobile layout obstruction analysis (bottom nav: 60px fixed, header: ~56px static)
- 6-hypothesis table ranked by plausibility
- Git history of all candidate files including the quick-235 partial fix and TKT-0032 filing date
- Recommended dvh-based fix for follow-up ticket

## Key Findings

1. **Primary suspect:** `DriverNotificationPanel` (`apps/web/src/components/driver/driver-notification-panel.tsx:117`) — `max-h-[480px]` is a hardcoded pixel value. On viewports shorter than 544px (iPhone 5/SE 1st gen, or any device with browser chrome visible), the panel bottom gets cut off because: header(56px) + dropdown offset(8px) + max panel height(480px) = 544px.

2. **Prior partial fix:** quick-235 (Apr 16, 2026) changed panel width from `w-[340px]` to `w-[calc(100vw-2rem)]` to fix horizontal overflow. TKT-0032 was filed 3 days later (Apr 19), suggesting the width fix resolved horizontal cutoff but the bottom cutoff remained.

3. **Toaster:** `position="top-right"`, no toast triggers on /my-load page in normal flow — Toaster is not the cause on this page.

4. **Bottom nav:** `fixed bottom-0 z-50 lg:hidden min-h-[60px]` — does not obstruct the notification panel (panel is near the top). Content has `pb-24` clearance.

5. **Safe-area:** `viewport-fit=cover` is NOT set → `env(safe-area-inset-bottom)` in the bottom nav resolves to 0px in standard browsers.

## Deviations from Plan

None — plan executed exactly as written. Read-only diagnosis only; zero source code changes confirmed via `git diff --name-only apps/web/` returning empty.

## Self-Check

- DIAGNOSIS.md exists at `.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md`: FOUND
- Final line of DIAGNOSIS.md ends with required sentence: FOUND
- `git diff --name-only apps/web/` returned empty (no source changes): CONFIRMED
- Commit `564d3c4a` exists: CONFIRMED

## Self-Check: PASSED
