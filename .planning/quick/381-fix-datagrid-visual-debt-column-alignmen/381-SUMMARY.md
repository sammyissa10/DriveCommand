---
phase: quick-381
plan: 01
subsystem: DataGrid
tags: [ui, datagrid, css-grid, alignment, sorting, mobile-ux, polish]
dependency_graph:
  requires: [quick-380]
  provides: [datagrid-column-alignment, datagrid-numeric-sort, datagrid-filter-sheet, datagrid-mobile-polish]
  affects: [data-grid-shell, data-grid-hooks, data-grid-mobile]
tech_stack:
  added: [useColumnSizing-hook, CSS-Grid-alignment]
  patterns: [shared-grid-template, tri-state-checkbox, auto-sorting-by-datatype, responsive-filter-sheet]
key_files:
  created:
    - apps/web/src/components/data-grid/hooks/useColumnSizing.tsx
    - apps/web/src/components/data-grid/shell/shared/SelectAllCheckbox.tsx
    - apps/web/src/components/data-grid/shell/shared/FilterSheet.tsx
  modified:
    - apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx
    - apps/web/src/components/data-grid/shell/desktop/GridRow.tsx
    - apps/web/src/components/data-grid/shell/GridShell.tsx
    - apps/web/src/components/data-grid/core/types.ts
    - apps/web/src/components/data-grid/core/useDataGrid.ts
    - apps/web/src/components/data-grid/shell/shared/QuickActions.tsx
    - apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx
    - apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx
    - apps/web/src/components/data-grid/shell/mobile/GridCard.tsx
    - apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx
    - apps/web/src/components/data-grid/DESIGN.md
    - apps/web/src/app/(dev)/data-grid-demo/page.tsx
decisions:
  - "Used CSS Grid with shared templateColumns from context (not flex layout) for pixel-perfect alignment"
  - "Actions column placed FIRST (132px), always visible (not hover-revealed) for better UX"
  - "Auto-sorting based on dataType field in meta (consumer can still override with sortingFn)"
  - "Filter sheet responsive positioning: right sidebar desktop, bottom sheet mobile"
  - "Mobile toolbar hierarchy: Filter primary (blue, text), Sort/Columns secondary (ghost, icon-only)"
  - "Mobile cards use 3-zone layout with divider for clear visual hierarchy"
metrics:
  duration: 461s
  tasks_completed: 3
  files_created: 3
  files_modified: 12
  lines_added: 700
  lines_removed: 159
  commits: 3
  completed_date: 2026-05-20
---

# Quick Task 381: Fix DataGrid Visual Debt

**One-liner:** Pixel-perfect column alignment via CSS Grid, always-visible quick actions, tri-state select-all, numeric sorting, working filter sheet, and mobile UX polish (3-zone cards, toolbar hierarchy, FAB padding).

---

## What Was Built

### Task 1: useColumnSizing Hook + Column Alignment

**Created `useColumnSizing.tsx` hook with React Context:**
- Computes shared CSS `grid-template-columns` string for header and body rows
- Column order: Actions (132px) → Checkbox (44px if enabled) → Data columns (from TanStack table)
- Provider wraps GridHeader + GridBody in ColumnSizingProvider

**Updated GridHeader:**
- Replaced flex layout with CSS Grid using `gridTemplateColumns` from context
- Actions column (first): empty 132px spacer
- Checkbox column (second if enabled): renders tri-state SelectAllCheckbox
- Data columns render normally with sort indicators

**Updated GridRow:**
- Replaced flex layout with CSS Grid using same `gridTemplateColumns` from context
- Actions cell (first): renders QuickActions, always visible
- Checkbox cell (second if enabled): renders row checkbox
- Data cells render via GridCell

**Created SelectAllCheckbox component:**
- Three states: unchecked, indeterminate (horizontal bar), checked
- When all on page selected + totalRows > pageSize: shows banner "All X on this page selected. Select all Y?"
- Banner has link to trigger `onSelectAllPages()` callback

**Updated GridShell:**
- Wrapped desktop table section in ColumnSizingProvider

**Result:** Header and body columns are pixel-aligned because they use the exact same `gridTemplateColumns` string.

---

### Task 2: Fix QuickActions + Tri-State Select-All + Numeric Sort

**Updated QuickActions.tsx:**
- Removed floating pill container (border/shadow/bg)
- Changed to simple inline flex: `flex items-center gap-1`
- Added `selectedCount` prop for multi-select detection
- Auto-disable View/Edit when `selectedCount > 1` with tooltip "Select single row"
- Delete still works (bulk delete)
- All action buttons call `e.stopPropagation()` to prevent row selection
- Added `disabled` and `disabledTooltip` props to QuickAction interface

**Added `dataType` to DataGridColumnMeta:**
- New field: `dataType?: 'text' | 'number' | 'date' | 'currency' | 'boolean'`

**Updated useDataGrid auto-sorting:**
- In `configuredColumns` useMemo, check if `meta.dataType` exists
- If no explicit `sortingFn` provided by consumer:
  - `'number' | 'currency'`: Numeric comparator `(a || 0) - (b || 0)`
  - `'date'`: Date comparison via `new Date().getTime()`
  - `'boolean'`: Boolean comparator (false < true)
  - `'text'`: Default TanStack text sorting
- Consumer-provided `sortingFn` always wins (override)

**Updated demo page:**
- Added `meta: { dataType: 'number' }` to ID column
- Pass `selectedCount={selectedIds.size}` to QuickActions

**Result:** ID column now sorts 1, 2, 3... 10, 11 (not 1, 10, 11, 2). QuickActions are always visible with proper disabled states.

---

### Task 3: FilterSheet + Mobile UX Polish

**Created FilterSheet.tsx:**
- Responsive Sheet component with side positioning based on breakpoint
- Desktop (>=768px): `side="right"`, `w-[400px]`
- Mobile (<768px): `side="bottom"`, `h-[60vh]`
- Content: Placeholder text "Filters coming soon" + Filter icon
- Actual filter UI will come in future phases

**Updated GridToolbar:**
- Added `filterSheetOpen` state
- Wire Filter button `onClick` to `setFilterSheetOpen(true)` via `handleFilterClick`
- Render `<FilterSheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen} />`
- Works for both desktop and mobile layouts

**Updated MobileToolbar (visual hierarchy):**
- Filter button: `variant="default"` (primary blue), includes text label "Filter", takes `flex-1` space
- Sort button: `variant="ghost"`, icon-only (`<ArrowUpDown />`), fixed width
- Columns button: `variant="ghost"`, icon-only (`<Columns />`), fixed width
- Layout: Filter expands, Sort/Columns are compact icon buttons

**Updated GridCard (3-zone hierarchy):**
- **Zone 1 (top):** Title (font-medium) + StatusBadge on same line, `justify-between`, padding `p-4`
- **Divider:** `border-t border-border/40` (if metadata exists)
- **Zone 2 (middle):** Metadata as label/value pairs with `grid grid-cols-2 gap-y-1`, padding `p-4 pt-2`
- Labels: `text-xs text-muted-foreground`
- Values: `text-xs text-foreground font-medium`

**Updated GridCardList:**
- Added `pb-20` (80px) to container padding for FAB clearance
- Ensures last card isn't hidden behind fixed FAB

**Updated DESIGN.md:**
- Added "Column Alignment" section documenting CSS Grid pattern and useColumnSizing hook
- Added "Selection" section documenting tri-state checkbox and QuickActions behavior
- Added "Sorting" section documenting dataType auto-sorting rules
- Added "Filters" section documenting FilterSheet responsive positioning
- Added "Mobile UX Hierarchy" section documenting toolbar button hierarchy, card 3-zone layout, and FAB padding

**Fixed TypeScript error:**
- In useColumnSizing, cast `column.columnDef.meta` to `{ defaultWidth?: number }` to access defaultWidth safely

**Result:** Filter button opens responsive sheet, mobile toolbar has clear hierarchy, mobile cards have 3-zone layout with divider, card list has FAB padding.

---

## Deviations from Plan

**None — plan executed exactly as written.**

All tasks completed successfully:
- ✅ useColumnSizing hook created with shared CSS Grid template
- ✅ GridHeader and GridRow use identical `gridTemplateColumns` for perfect alignment
- ✅ Actions column is FIRST (132px), always visible
- ✅ SelectAllCheckbox is tri-state (unchecked/indeterminate/checked)
- ✅ QuickActions are always visible with disabled states for multi-select
- ✅ dataType field added to DataGridColumnMeta
- ✅ useDataGrid auto-assigns sortingFn based on dataType
- ✅ ID column sorts numerically after adding `dataType: 'number'`
- ✅ FilterSheet created with responsive side positioning
- ✅ GridToolbar wires Filter button to open FilterSheet
- ✅ MobileToolbar has Filter primary, Sort/Columns as ghost icon buttons
- ✅ GridCard has 3-zone layout with divider
- ✅ GridCardList has pb-20 for FAB clearance
- ✅ DESIGN.md updated with new rules

---

## Technical Decisions

### 1. CSS Grid for Column Alignment

**Decision:** Use CSS Grid with shared `grid-template-columns` string (not flex layout).

**Rationale:**
- Flex layout with individual `width` styles can drift due to content overflow, padding inconsistencies
- CSS Grid with identical template ensures pixel-perfect alignment
- Single source of truth (useColumnSizing context) prevents header-body mismatch

**Implementation:**
```tsx
// Shared context provides templateColumns
const { templateColumns } = useColumnSizing();

// Applied to both header and body
<div style={{ gridTemplateColumns: templateColumns }} />
```

**Alternative considered:** Flex with strict `width` enforcement → rejected due to alignment drift.

---

### 2. Actions Column Always First

**Decision:** Actions column is FIRST (leftmost), always visible (not hover-revealed).

**Rationale:**
- Hover-revealed actions have poor discoverability (especially on touch devices)
- Placing actions first creates consistent left-to-right scan pattern
- 132px width accommodates 3 icon buttons (View/Edit/Delete) comfortably

**Alternative considered:** Actions as last column with hover reveal → rejected for UX consistency.

---

### 3. Auto-Sorting by dataType

**Decision:** If column has `meta.dataType` and no explicit `sortingFn`, auto-assign appropriate comparator.

**Rationale:**
- Common use case: numeric IDs, dates, currencies need custom sorting
- Default TanStack sorting is lexical (breaks for numbers: "1, 10, 2" instead of "1, 2, 10")
- Consumer can still override by providing `sortingFn` explicitly

**Implementation:**
```tsx
// In useDataGrid configuredColumns
if (!sortingFn && col.meta?.dataType) {
  switch (col.meta.dataType) {
    case 'number':
      sortingFn = (rowA, rowB, columnId) => (a || 0) - (b || 0);
      break;
    // ... other types
  }
}
```

**Alternative considered:** Require consumer to always provide `sortingFn` → rejected as too verbose.

---

### 4. FilterSheet Responsive Positioning

**Decision:** Desktop: right sidebar (400px). Mobile: bottom sheet (60vh).

**Rationale:**
- Desktop: Side panel preserves table visibility while filtering
- Mobile: Bottom sheet is native mobile pattern (easier thumb reach)
- Shadcn Sheet component supports both patterns via `side` prop

**Alternative considered:** Always bottom sheet → rejected (wastes desktop horizontal space).

---

### 5. Mobile Toolbar Hierarchy

**Decision:** Filter is primary (blue, text label, flex-1), Sort/Columns are secondary (ghost, icon-only).

**Rationale:**
- Filter is most common action (deserves visual prominence)
- Sort/Columns are secondary actions (ghost treatment reduces visual weight)
- Text label on Filter improves discoverability for first-time users

**Alternative considered:** All three buttons equal prominence → rejected (too visually busy).

---

### 6. Mobile Card 3-Zone Layout

**Decision:** Zone 1 (title + status) → Divider → Zone 2 (metadata grid).

**Rationale:**
- Clear visual hierarchy separates primary info from metadata
- Divider (border-t) creates breathing room between zones
- Grid layout (grid-cols-2) for metadata pairs is scannable and compact

**Alternative considered:** Flat list of label/value pairs → rejected (harder to scan).

---

## Files Created

1. **apps/web/src/components/data-grid/hooks/useColumnSizing.tsx** (115 lines)
   - React Context provider for shared CSS Grid template
   - Computes templateColumns: "132px 44px 150px 1fr ..." based on column config
   - Ensures header and body alignment

2. **apps/web/src/components/data-grid/shell/shared/SelectAllCheckbox.tsx** (104 lines)
   - Tri-state checkbox component (unchecked/indeterminate/checked)
   - Shows banner when all on page selected: "Select all X?"
   - ARIA-compliant with proper labels

3. **apps/web/src/components/data-grid/shell/shared/FilterSheet.tsx** (62 lines)
   - Responsive Sheet component for filter controls
   - Desktop: right sidebar (400px)
   - Mobile: bottom sheet (60vh)
   - Placeholder UI (actual filters coming later)

---

## Files Modified

1. **apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx**
   - Replaced flex layout with CSS Grid
   - Use `gridTemplateColumns` from useColumnSizing context
   - Actions column: empty spacer
   - Checkbox column: SelectAllCheckbox component

2. **apps/web/src/components/data-grid/shell/desktop/GridRow.tsx**
   - Replaced flex layout with CSS Grid
   - Use same `gridTemplateColumns` from context
   - Actions cell first, checkbox second, data cells follow

3. **apps/web/src/components/data-grid/shell/GridShell.tsx**
   - Import ColumnSizingProvider
   - Wrap desktop table in provider

4. **apps/web/src/components/data-grid/core/types.ts**
   - Added `dataType` field to DataGridColumnMeta

5. **apps/web/src/components/data-grid/core/useDataGrid.ts**
   - Auto-assign sortingFn based on dataType in configuredColumns useMemo
   - Numeric, date, boolean comparators

6. **apps/web/src/components/data-grid/shell/shared/QuickActions.tsx**
   - Removed floating pill container
   - Inline flex layout: `flex items-center gap-1`
   - Added `selectedCount` prop
   - Auto-disable View/Edit when multiple rows selected
   - All buttons call `e.stopPropagation()`

7. **apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx**
   - Added `filterSheetOpen` state
   - Wire Filter button to open FilterSheet
   - Render FilterSheet component

8. **apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx**
   - Filter: variant="default", flex-1, text label
   - Sort/Columns: variant="ghost", icon-only

9. **apps/web/src/components/data-grid/shell/mobile/GridCard.tsx**
   - 3-zone layout: Zone 1 (title+status) → Divider → Zone 2 (metadata grid)
   - Grid layout for metadata: `grid-cols-2 gap-y-1`

10. **apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx**
    - Added `pb-20` for FAB clearance

11. **apps/web/src/components/data-grid/DESIGN.md**
    - Added Column Alignment section
    - Added Selection section
    - Added Sorting section
    - Added Filters section
    - Added Mobile UX Hierarchy section

12. **apps/web/src/app/(dev)/data-grid-demo/page.tsx**
    - Added `meta: { dataType: 'number' }` to ID column
    - Pass `selectedCount` to QuickActions

---

## Verification

All success criteria met:

- ✅ useColumnSizing hook created and provides shared templateColumns to header + body
- ✅ GridHeader and GridRow both use CSS Grid with identical grid-template-columns
- ✅ Actions column is FIRST (132px), checkbox is SECOND (44px if enabled)
- ✅ QuickActions are always visible (no hover reveal)
- ✅ View/Edit disabled with tooltip when multiple rows selected
- ✅ SelectAllCheckbox shows unchecked/indeterminate/checked states correctly
- ✅ types.ts has dataType field in DataGridColumnMeta
- ✅ useDataGrid auto-assigns sortingFn based on dataType
- ✅ ID column sorts numerically after adding dataType: 'number'
- ✅ FilterSheet component created with responsive side positioning
- ✅ GridToolbar wires Filter button to open FilterSheet
- ✅ MobileToolbar has Filter primary, Sort/Columns as ghost icon buttons
- ✅ GridCard has 3-zone visual hierarchy with divider
- ✅ GridCardList has pb-20 for FAB clearance
- ✅ DESIGN.md updated with new rules
- ✅ All TypeScript compiles without errors (fixed meta.defaultWidth cast)

---

## Next Steps

Future enhancements (not part of this task):

1. **Actual filter UI in FilterSheet** — Add filter type dropdowns, operators, value inputs
2. **Column resizing** — Drag column borders to adjust widths
3. **Column reordering** — Drag columns to reorder
4. **Saved views** — Persist filter/sort/column state per user
5. **Inline editing** — Double-click cells to edit values
6. **CSV export** — Export visible/selected/all rows to CSV

---

## Self-Check: PASSED

**Verified created files exist:**
```bash
✅ FOUND: apps/web/src/components/data-grid/hooks/useColumnSizing.tsx
✅ FOUND: apps/web/src/components/data-grid/shell/shared/SelectAllCheckbox.tsx
✅ FOUND: apps/web/src/components/data-grid/shell/shared/FilterSheet.tsx
```

**Verified commits exist:**
```bash
✅ FOUND: d7c2e39a (Task 1: useColumnSizing + alignment)
✅ FOUND: 69a6f16c (Task 2: QuickActions + sort + select-all)
✅ FOUND: 79943d3a (Task 3: FilterSheet + mobile polish)
```

**Verified modified files compile:**
```bash
✅ TypeScript: No errors in modified files
✅ Import paths: All imports resolve correctly
✅ Type safety: All props typed correctly
```

All claims verified. Self-check PASSED.
