---
quick: 378
title: Build DataGrid visual shell with frozen panes, virtualization, and interactions
completed: 2026-05-19
duration: 17m
tasks_completed: 5
tasks_total: 5
commits:
  - c8ac7546: feat(quick-378): add core shell structure for DataGrid
  - b22ff61f: feat(quick-378): add toolbar, footer, and state components
  - fc08b1ce: feat(quick-378): add interaction components for DataGrid
  - 8a9ad132: feat(quick-378): add barrel exports and demo page
  - d3d3622d: feat(quick-378): add keyboard navigation hook
  - 00f2174a: fix(quick-378): add nuqs adapter and suspense for demo page
key-files:
  created:
    - apps/web/src/components/data-grid/shell/GridShell.tsx
    - apps/web/src/components/data-grid/shell/GridHeader.tsx
    - apps/web/src/components/data-grid/shell/GridBody.tsx
    - apps/web/src/components/data-grid/shell/GridRow.tsx
    - apps/web/src/components/data-grid/shell/GridCell.tsx
    - apps/web/src/components/data-grid/shell/GridToolbar.tsx
    - apps/web/src/components/data-grid/shell/GridFooter.tsx
    - apps/web/src/components/data-grid/shell/EmptyState.tsx
    - apps/web/src/components/data-grid/shell/LoadingSkeleton.tsx
    - apps/web/src/components/data-grid/shell/ErrorState.tsx
    - apps/web/src/components/data-grid/shell/BulkActionsBar.tsx
    - apps/web/src/components/data-grid/shell/QuickActions.tsx
    - apps/web/src/components/data-grid/shell/ColumnDragHandle.tsx
    - apps/web/src/components/data-grid/shell/DeleteConfirmDialog.tsx
    - apps/web/src/components/data-grid/shell/useGridKeyboardNav.ts
    - apps/web/src/components/data-grid/shell/index.ts
    - apps/web/src/app/(dev)/data-grid-demo/page.tsx
    - apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
    - apps/web/src/app/(dev)/layout.tsx
  modified:
    - apps/web/src/components/data-grid/index.ts
---

# Quick 378: DataGrid Visual Shell Summary

Complete visual shell layer for the DataGrid component system, consuming the headless foundation from quick-377.

## What Was Built

### Core Layout Components (Task 1)

**GridShell.tsx** - Main container with CSS Grid layout, frozen pane support, keyboard navigation at container level, ARIA role="grid" with rowcount/colcount

**GridHeader.tsx** - Sticky header with sortable columns, resize handles, column menus (sort/hide/freeze), drag-and-drop reordering via @dnd-kit

**GridBody.tsx** - Virtualized rows using @tanstack/react-virtual, density-aware row heights (compact: 28px, normal: 36px, comfortable: 44px), overscan support

**GridRow.tsx** - Selection states (hover, selected with accent bar, focused ring), ARIA row/rowindex/selected attributes, keyboard handlers

**GridCell.tsx** - Inline edit mode (Enter to edit, Esc cancels, Enter/blur commits), density-aware padding, truncation

### Toolbar, Footer, State Components (Task 2)

**GridToolbar.tsx** - Search with 300ms debounce, density toggle (Compact/Normal/Comfortable), column visibility checkboxes, CSV export, "New" button slot

**GridFooter.tsx** - Pagination with page size selector (10/25/50/100), first/prev/next/last nav buttons with proper disabled states

**EmptyState.tsx** - Two variants: no-data (Inbox icon) and filtered-empty (SearchX icon with clear filters)

**LoadingSkeleton.tsx** - Seeded random widths for consistent skeleton appearance

**ErrorState.tsx** - AlertTriangle icon with error message and retry button

### Interaction Components (Task 3)

**BulkActionsBar.tsx** - Slides in from bottom when rows selected, shows count + custom actions + delete, transition animation

**QuickActions.tsx** - Per-row view/edit/delete buttons, hover-revealed on desktop, supports custom actions

**ColumnDragHandle.tsx** - GripVertical icon for column reordering, integrates with @dnd-kit

**DeleteConfirmDialog.tsx** - Simple confirmation for <4 items, typed "DELETE" confirmation for 4+ items

### Keyboard Navigation (Task 5)

**useGridKeyboardNav.ts** - Full keyboard support:
- Arrow keys: cell navigation
- Home/End: row boundaries (Ctrl: grid boundaries)
- PageUp/Down: 10-row jumps
- Space: toggle row selection
- Enter: activate cell/row
- Shift+Arrow: extend selection
- Cmd+A: select all
- Escape: clear selection

### Demo Page (Task 4)

**/data-grid-demo** - Development-only page demonstrating all features with 100 fake users. Features demonstrated:
- Sorting by any column
- Column resizing
- Search filtering
- Density toggle
- Column visibility
- Row selection (click, shift-click, Cmd+A)
- Bulk actions bar
- Quick actions (view/edit/delete)
- CSV export
- Pagination
- Empty and loading states

## Technical Details

### Dependencies Used
- @tanstack/react-virtual (already installed in quick-377)
- @dnd-kit/core, @dnd-kit/sortable (already installed)
- lucide-react icons
- shadcn/ui components (Button, Input, Select, DropdownMenu, AlertDialog, Checkbox, Badge, Skeleton, Tooltip)

### Accessibility
- ARIA: role="grid/row/gridcell/columnheader", aria-rowcount, aria-colcount, aria-rowindex, aria-colindex, aria-selected, aria-sort, aria-activedescendant
- Full keyboard navigation
- Focus visible rings on all interactive elements
- aria-labels on icon-only buttons
- aria-live="polite" on body for dynamic updates

### Styling
- Tailwind CSS only, no inline styles except dynamic width/height/transform
- Semantic color tokens (bg-background, text-foreground, border-border, text-muted-foreground, bg-muted, bg-primary, etc.)
- Dark mode compatible via Tailwind semantic colors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] NuqsAdapter for demo page**
- **Found during:** Task 4 verification (build)
- **Issue:** nuqs requires adapter for Next.js App Router, demo page failed static generation
- **Fix:** Created (dev)/layout.tsx with NuqsAdapter, wrapped demo in Suspense boundary
- **Files created:** apps/web/src/app/(dev)/layout.tsx, apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
- **Commit:** 00f2174a

**2. [Rule 1 - Bug] TypeScript column type mismatch**
- **Found during:** Task 4 verification (tsc)
- **Issue:** ExtendedColumnDef type didn't match createColumnHelper output
- **Fix:** Used ColumnDef<User, unknown> directly with type assertions
- **Commit:** 8a9ad132

**3. [Rule 1 - Bug] Checkbox indeterminate prop**
- **Found during:** Task 1 verification (tsc)
- **Issue:** Radix Checkbox doesn't have indeterminate on DOM element
- **Fix:** Used checked='indeterminate' pattern instead of ref manipulation
- **Commit:** c8ac7546

## Self-Check: PASSED

All created files verified:
- 16 shell component files in apps/web/src/components/data-grid/shell/
- Demo page with Suspense wrapper at apps/web/src/app/(dev)/data-grid-demo/
- (dev) layout with NuqsAdapter

All commits verified:
- c8ac7546, b22ff61f, fc08b1ce, 8a9ad132, d3d3622d, 00f2174a

TypeScript: `tsc --noEmit` passes
Production build: `npm run build` succeeds
