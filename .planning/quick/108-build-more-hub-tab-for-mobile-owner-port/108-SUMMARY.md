---
phase: quick-108
plan: 01
subsystem: mobile-owner
tags: [mobile, navigation, tab-bar, owner-portal, hub-screen]
dependency_graph:
  requires: [apps/mobile/app/(owner)/_layout.tsx, apps/mobile/app/(owner)/fleet.tsx]
  provides: [more-tab, more-hub-screen, stub-sub-screens, settings-stack]
  affects: [apps/mobile/app/(owner)/_layout.tsx]
tech_stack:
  added: []
  patterns: [hub-navigation, hidden-tabs, settings-stack-navigator]
key_files:
  created:
    - apps/mobile/app/(owner)/more.tsx
    - apps/mobile/app/(owner)/invoices.tsx
    - apps/mobile/app/(owner)/crm.tsx
    - apps/mobile/app/(owner)/payroll.tsx
    - apps/mobile/app/(owner)/ai-documents.tsx
    - apps/mobile/app/(owner)/trucks.tsx
    - apps/mobile/app/(owner)/compliance.tsx
    - apps/mobile/app/(owner)/settings/_layout.tsx
    - apps/mobile/app/(owner)/settings/team.tsx
    - apps/mobile/app/(owner)/settings/account.tsx
  modified:
    - apps/mobile/app/(owner)/_layout.tsx
decisions:
  - "Used href: null pattern for hidden Tabs.Screen entries to keep sub-screens out of tab bar"
  - "Settings sub-screens use a nested Stack navigator with slide_from_right animation"
  - "More hub uses typed array constant for section/row data to keep JSX clean"
  - "hexToRgba helper converts icon hex colors to 15% opacity backgrounds inline"
metrics:
  duration: 143s
  completed: "2026-03-25"
  tasks_completed: 3
  files_changed: 11
---

# Quick Task 108: More Hub Tab for Mobile Owner Portal Summary

## One-liner

Replaced the 5th Messages tab with a More hub tab that organizes 10 features (Communications, Business, Fleet, Settings) behind grouped navigation rows with colored icons.

## What Was Built

The owner portal's tab bar previously had a dedicated Messages (fleet) tab as the 5th item. This task replaced it with a "More" hub that consolidates secondary features behind a single tab, keeping the tab bar clean at exactly 5 items.

### Tab Layout Update

`apps/mobile/app/(owner)/_layout.tsx` was updated to:
- Replace the `fleet` tab with a `more` tab using the `Grid2X2` icon
- Register 8 hidden `Tabs.Screen` entries (`fleet`, `invoices`, `crm`, `payroll`, `ai-documents`, `trucks`, `compliance`, `settings`) with `href: null` so they are navigable but not visible in the tab bar

### More Hub Screen

`apps/mobile/app/(owner)/more.tsx` is a scrollable hub with 4 grouped sections:

| Section | Rows |
|---------|------|
| COMMUNICATIONS | Messages |
| BUSINESS | Invoices, CRM, Payroll, AI Documents |
| FLEET | Trucks, Compliance |
| SETTINGS | Team Permissions, Account & Subscription |

Each row displays a colored icon with 15% opacity background, label, subtitle, and chevron. Pressing any row fires `haptic.light()` and navigates via `router.push()`.

### Stub Sub-Screens

6 stub screens in `(owner)/` and 3 in `(owner)/settings/`:
- All follow identical dark-theme pattern: header with back button, centered Coming Soon card with icon
- Settings screens use a nested Stack navigator (`settings/_layout.tsx`) with `slide_from_right` animation

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created:
- apps/mobile/app/(owner)/more.tsx: EXISTS
- apps/mobile/app/(owner)/invoices.tsx: EXISTS
- apps/mobile/app/(owner)/crm.tsx: EXISTS
- apps/mobile/app/(owner)/payroll.tsx: EXISTS
- apps/mobile/app/(owner)/ai-documents.tsx: EXISTS
- apps/mobile/app/(owner)/trucks.tsx: EXISTS
- apps/mobile/app/(owner)/compliance.tsx: EXISTS
- apps/mobile/app/(owner)/settings/_layout.tsx: EXISTS
- apps/mobile/app/(owner)/settings/team.tsx: EXISTS
- apps/mobile/app/(owner)/settings/account.tsx: EXISTS

Commits:
- c2a5c8c: feat(quick-108-01): replace Messages tab with More tab, register hidden screens
- c06443b: feat(quick-108-01): create More hub screen with 4 sections and 10 navigation rows
- b802658: feat(quick-108-01): create 6 stub screens and settings stack navigator

## Self-Check: PASSED
