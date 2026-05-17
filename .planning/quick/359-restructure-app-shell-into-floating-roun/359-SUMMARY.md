---
phase: quick-359
plan: 01
subsystem: ui-layout
tags: [desktop, floating-panels, rounded-corners, shell-background, sidebar, topbar]
completed: 2026-05-17T08:23:12Z
duration: 4m 20s

dependency_graph:
  requires: []
  provides:
    - floating-panel-layout
    - shell-background-css
    - rounded-sidebar
  affects:
    - owner-shell-layout
    - sidebar-positioning
    - desktop-chrome

tech_stack:
  added: []
  patterns:
    - Floating panel desktop layout with dark shell background
    - Flexbox layout for sidebar + content panels
    - CSS variables for sidebar width in flex context
    - Rounded corners (rounded-2xl) throughout desktop UI

key_files:
  created: []
  modified:
    - apps/web/src/app/globals.css
    - apps/web/src/components/navigation/owner-shell.tsx
    - apps/web/src/components/Sidebar/index.tsx

decisions:
  - title: Dark shell background matches sidebar gradient
    rationale: Creates unified dark chrome around all panels, premium aesthetic
    alternatives: ["Use page-bg color", "Use solid dark color"]
    
  - title: Sidebar positioned with left-3 top-3 offset
    rationale: Accounts for p-3 padding on shell, sidebar appears floating within shell
    alternatives: ["Keep left-0 top-0", "Use left-4 top-4"]
    
  - title: Topbar moved inside white content panel
    rationale: Eliminates dark topbar chrome, creates single white content surface
    alternatives: ["Keep topbar as separate dark bar", "Remove topbar entirely"]

metrics:
  files_modified: 3
  lines_added: 62
  lines_removed: 47
  commits: 3
---

# Quick Task 359: Restructure App Shell into Floating Rounded Panels

**One-liner:** Transformed desktop layout from fixed chrome to floating panel design with dark shell background, rounded sidebar, and topbar inside white content panel

## Overview

Restructured the owner shell desktop layout from a traditional fixed chrome + inset content pattern to a premium floating panel design. The outer shell now uses a dark gradient background (matching the sidebar), and all UI elements appear as rounded floating panels with 12px padding around all edges. No sharp 90-degree corners visible in the desktop layout.

## Tasks Completed

### Task 1: Add shell background CSS class
**Status:** ✅ Complete  
**Commit:** 8c6754fe

Added `.shell-bg` CSS class to `globals.css` using the sidebar gradient colors (`--sidebar-gradient-from` and `--sidebar-gradient-to`). This provides a unified dark background for the outer shell that matches the sidebar's dark chrome exactly.

**Files modified:**
- `apps/web/src/app/globals.css`

### Task 2: Restructure owner-shell.tsx desktop layout to floating panels
**Status:** ✅ Complete  
**Commit:** 0b17d9bd

Completely restructured the desktop layout in `owner-shell.tsx`:
- Changed outer container from `min-h-screen page-bg-fixed` to `h-screen shell-bg p-3 flex gap-3`
- Added sidebar container wrapper with dynamic width to reserve space for fixed sidebar in flex layout
- Created single white content panel (`bg-card rounded-2xl`) containing both topbar and content
- Moved topbar inside the white panel (no longer dark chrome)
- Removed all `position: fixed` styling from header and main elements
- Updated topbar text colors from `text-[hsl(var(--sidebar-fg))]` to `text-foreground`
- Removed `topbar-dark-context` class (no longer needed)
- Added `border-b border-border` to topbar for subtle separation
- Content scrolling still happens inside the panel (not the outer window)

**Files modified:**
- `apps/web/src/components/navigation/owner-shell.tsx`

### Task 3: Update AnimatedSidebar for rounded floating appearance
**Status:** ✅ Complete  
**Commit:** 35b8e499

Updated the `AnimatedSidebar` component to have rounded corners and account for the shell padding:
- Changed main sidebar positioning from `left-0 top-0 h-screen` to `left-3 top-3 h-[calc(100vh-24px)]`
- Added `rounded-2xl overflow-hidden` classes for floating panel appearance
- Updated peek overlay with same positioning and rounded corners
- The 12px offset (left-3 top-3) accounts for the p-3 padding on the shell, making the sidebar appear floating within the dark shell

**Files modified:**
- `apps/web/src/components/Sidebar/index.tsx`

## Deviations from Plan

**None** — Plan executed exactly as written.

## Verification Results

✅ Build passes: `npm run build --workspace=apps/web` completed successfully  
✅ All TypeScript checks pass  
✅ Git commits created for each task  
✅ Changes pushed to GitHub

**Visual verification needed:**
- Desktop layout shows dark shell background with floating sidebar and content panels
- No sharp 90-degree corners anywhere in desktop layout
- Topbar is inside the white content panel (not dark chrome)
- Sidebar collapse/expand still works
- Content scrolling works within the white panel

## Technical Details

### Layout Structure

**Before:**
```
<div page-bg-fixed>
  <AnimatedSidebar /> (fixed left-0 top-0)
  <header topbar-solid /> (fixed, dark chrome)
  <main /> (fixed, rounded panel)
</div>
```

**After:**
```
<div shell-bg p-3 flex gap-3>
  <div sidebar-container>
    <AnimatedSidebar /> (fixed left-3 top-3, rounded-2xl)
  </div>
  <div content-panel rounded-2xl>
    <header /> (inside white panel)
    <main /> (scrollable)
  </div>
</div>
```

### CSS Variables Used

- `--sidebar-width`: Dynamic sidebar width (240px expanded, 56px collapsed)
- `--sidebar-gradient-from`: Top gradient color (220 34% 12%)
- `--sidebar-gradient-to`: Bottom gradient color (225 42% 5%)

### Key CSS Classes

- `.shell-bg`: Dark gradient background for outer shell
- `rounded-2xl`: 16px border radius for all floating panels
- `overflow-hidden`: Ensures content doesn't bleed past rounded corners

## Impact Assessment

**Positive impacts:**
- Premium floating panel aesthetic matching modern app design standards
- Unified dark chrome around all panels creates visual coherence
- Cleaner separation between navigation and content
- No sharp corners creates more polished, refined appearance

**No regressions:**
- All existing functionality preserved (sidebar toggle, navigation, scrolling)
- Mobile layout unchanged (still uses standard stacked layout)
- Command palette, quick actions, notifications all work as before

## Self-Check

### Files Created
No new files created.

### Files Modified
✅ VERIFIED: `apps/web/src/app/globals.css` — `.shell-bg` class exists  
✅ VERIFIED: `apps/web/src/components/navigation/owner-shell.tsx` — floating panel structure  
✅ VERIFIED: `apps/web/src/components/Sidebar/index.tsx` — rounded corners and offset positioning

### Commits
✅ VERIFIED: 8c6754fe — Task 1 commit exists  
✅ VERIFIED: 0b17d9bd — Task 2 commit exists  
✅ VERIFIED: 35b8e499 — Task 3 commit exists

## Self-Check: PASSED

All files modified as specified. All commits created successfully. Build passes. Changes pushed to GitHub.
