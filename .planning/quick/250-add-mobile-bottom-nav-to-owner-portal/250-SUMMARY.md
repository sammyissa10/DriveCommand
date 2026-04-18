---
phase: quick-250
plan: "01"
subsystem: web-navigation
tags: [mobile, bottom-nav, owner-portal, navigation, overlay-menu]
dependency_graph:
  requires: []
  provides: [owner-mobile-bottom-nav, owner-more-menu-overlay]
  affects: [owner-shell, owner-portal-navigation]
tech_stack:
  added: []
  patterns: [full-screen-overlay, pathname-active-detection, mobile-first-nav]
key_files:
  created:
    - apps/web/src/components/navigation/owner-more-menu.tsx
  modified:
    - apps/web/src/components/navigation/owner-bottom-nav.tsx
decisions:
  - "Used React.ComponentType<{ className?: string }> for icon typing instead of as const to allow optional center prop"
  - "Used lg:hidden (1024px) not md:hidden (768px) to match existing Tailwind breakpoint conventions in codebase"
metrics:
  duration: "13 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 250: Add Mobile Bottom Nav to Owner Portal — Summary

## One-liner

5-tab mobile bottom nav (Dispatches, Loads, Dashboard, Live Map, More) with full-screen More overlay containing categorized carrier ops links and logout.

## What Was Built

### OwnerMoreMenu (`owner-more-menu.tsx`) — new file

A full-screen overlay component (`z-[60]`) that renders when the More tab is tapped:

- Dark header (`bg-slate-900`) with "More" title and X close button
- Scrollable body (`bg-slate-950`) with 4 sections: Carrier Ops, Fleet, Reports, Other
- Each section has bold uppercase heading and full-width tappable rows with chevron right icons
- Active item detection via `pathname.startsWith(href)` with `text-blue-400` highlight
- Log Out button with red styling, calls `/api/auth/logout` then redirects to `/sign-in`
- `pb-[env(safe-area-inset-bottom)]` for iOS safe area

### OwnerBottomNav (`owner-bottom-nav.tsx`) — rewritten

Replaced old 5-tab nav (Dashboard, Loads, Drivers, Trucks, Routes) with new design:

1. Dispatches — Truck icon — `/carrier/dispatches`
2. Loads — Package icon — `/carrier/loads`
3. Dashboard — Home icon — `/carrier/dashboard` — CENTER, h-6 w-6 (24px)
4. Live Map — Map icon — `/live-map`
5. More — LayoutGrid icon — triggers OwnerMoreMenu overlay

Styling: `bg-slate-900` dark background, `text-blue-400` active state, `text-slate-400` inactive, `lg:hidden` to stay mobile-only.

### owner-shell.tsx — unchanged

The existing `pb-20 lg:pb-6` on the main element was already correct — no changes needed.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — zero new TypeScript errors (3 pre-existing e2e test errors unrelated to this task)
- `npx next build` — succeeded (exit code 0, 91 static pages generated)
- Desktop sidebar untouched — `lg:hidden` on bottom nav keeps it mobile-only
- Main content `pb-20` prevents overlap with fixed bottom nav

## Self-Check: PASSED

Files exist:
- `/c/Users/sammy/Projects/DriveCommand/apps/web/src/components/navigation/owner-more-menu.tsx` — FOUND
- `/c/Users/sammy/Projects/DriveCommand/apps/web/src/components/navigation/owner-bottom-nav.tsx` — FOUND

Commits:
- `0b3177e` — Task 1: OwnerMoreMenu
- `b2562a4` — Task 2: OwnerBottomNav rewrite
