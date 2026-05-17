---
phase: quick-333
plan: 01
subsystem: ui/sidebar
tags: [contrast, accessibility, wcag, css-variables, sidebar]

dependency-graph:
  requires: []
  provides:
    - "WCAG AA compliant sidebar text hierarchy"
    - "--sidebar-bg-active CSS variable"
    - "--sidebar-bg-hover CSS variable"
  affects:
    - SidebarItem component
    - Sidebar header

tech-stack:
  added: []
  patterns:
    - "HSL CSS variables for consistent theming"
    - "Active/hover state separation via distinct background variables"

key-files:
  created: []
  modified:
    - apps/web/src/app/globals.css
    - apps/web/src/components/Sidebar/SidebarItem.tsx
    - apps/web/src/components/Sidebar/index.tsx

decisions:
  - "Fixed --sidebar-fg to be bright (98% L) in BOTH light and dark mode since sidebar always has dark background"
  - "Bumped --sidebar-fg-muted from 75% to 82% lightness for ~9:1 contrast ratio"
  - "Bumped --sidebar-fg-subtle from 60% to 65% lightness for ~5.5:1 contrast ratio"
  - "Created separate --sidebar-bg-active (14% L) and --sidebar-bg-hover (10-11% L) variables for clear visual hierarchy"
  - "Active items no longer show additional hover effect (already at max prominence)"
  - "Removed Fleet Management subtitle for cleaner logo header"

metrics:
  duration: 99s
  completed: 2026-05-16
  tasks: 3
  files: 3
---

# Quick 333: Fix Sidebar Active State Contrast + Bump Inactive Readability

**One-liner:** Fixed CSS variable bug where light-mode foreground colors were applied to always-dark sidebar, added elevated active/hover background states, and simplified logo header.

## Summary

The sidebar had a critical contrast inversion bug: in light mode, `--sidebar-fg` was set to a dark value (`240 10% 12%`) even though the sidebar always uses a dark background. This caused active nav items to have dark text on dark background, making them nearly invisible. Additionally, inactive items needed a readability bump, and the logo header had an unnecessary subtitle.

## Changes

### Task 1: Fix sidebar CSS variables (ecc286c1)

Updated CSS variables in both `:root` and `.dark` sections:

| Variable | Before (light) | After | Contrast Ratio |
|----------|----------------|-------|----------------|
| `--sidebar-fg` | 240 10% 12% (dark) | 0 0% 98% (bright) | ~15:1 |
| `--sidebar-fg-muted` | 240 8% 35% | 220 12% 82% | ~9:1 |
| `--sidebar-fg-subtle` | 240 6% 45% | 220 10% 65% | ~5.5:1 |

Added new variables:
- `--sidebar-bg-active`: 228 25% 14% (light) / 228 20% 14% (dark) - elevated pill background
- `--sidebar-bg-hover`: 228 20% 11% (light) / 228 15% 10% (dark) - subtle hover state

### Task 2: Update SidebarItem active/hover states (b9e2150d)

Changed SidebarItem to use the new CSS variables:
- Active state: `bg-[hsl(var(--sidebar-bg-active))]`
- Hover state (inactive only): `hover:bg-[hsl(var(--sidebar-bg-hover))]`
- Active items no longer show additional hover effect

### Task 3: Remove Fleet Management subtitle (c923c49f)

Simplified logo header to show only icon + "DriveCommand" wordmark. Changed container from `grid text-left text-sm leading-tight` to `flex items-center` for proper vertical centering.

## Verification

- Grep confirms new variables in both `:root` and `.dark` sections
- Grep confirms "Fleet Management" no longer appears in Sidebar/index.tsx
- TypeScript compiles without errors

## Deviations from Plan

None - plan executed exactly as written.

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/app/globals.css` | Fixed --sidebar-fg, bumped muted/subtle values, added --sidebar-bg-active and --sidebar-bg-hover in both theme sections |
| `apps/web/src/components/Sidebar/SidebarItem.tsx` | Updated className to use new active/hover background variables |
| `apps/web/src/components/Sidebar/index.tsx` | Removed Fleet Management subtitle, simplified container styling |

## Commits

| Hash | Message |
|------|---------|
| ecc286c1 | feat(quick-333): fix sidebar CSS variables for proper contrast hierarchy |
| b9e2150d | feat(quick-333): update SidebarItem to use new active/hover bg variables |
| c923c49f | feat(quick-333): remove Fleet Management subtitle from logo header |

## Self-Check: PASSED

- [x] apps/web/src/app/globals.css modified
- [x] apps/web/src/components/Sidebar/SidebarItem.tsx modified
- [x] apps/web/src/components/Sidebar/index.tsx modified
- [x] Commit ecc286c1 exists
- [x] Commit b9e2150d exists
- [x] Commit c923c49f exists
- [x] TypeScript compiles without errors
