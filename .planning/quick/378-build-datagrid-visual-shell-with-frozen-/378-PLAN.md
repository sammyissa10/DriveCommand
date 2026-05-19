---
quick: 378
title: Build DataGrid visual shell with frozen panes, virtualization, and interactions
type: execute
files_modified:
  - apps/web/src/components/data-grid/shell/GridShell.tsx
  - apps/web/src/components/data-grid/shell/GridHeader.tsx
  - apps/web/src/components/data-grid/shell/GridBody.tsx
  - apps/web/src/components/data-grid/shell/GridRow.tsx
  - apps/web/src/components/data-grid/shell/GridCell.tsx
  - apps/web/src/components/data-grid/shell/GridFooter.tsx
  - apps/web/src/components/data-grid/shell/GridToolbar.tsx
  - apps/web/src/components/data-grid/shell/BulkActionsBar.tsx
  - apps/web/src/components/data-grid/shell/QuickActions.tsx
  - apps/web/src/components/data-grid/shell/EmptyState.tsx
  - apps/web/src/components/data-grid/shell/LoadingSkeleton.tsx
  - apps/web/src/components/data-grid/shell/ErrorState.tsx
  - apps/web/src/components/data-grid/shell/ColumnDragHandle.tsx
  - apps/web/src/components/data-grid/shell/index.ts
  - apps/web/src/components/data-grid/index.ts
  - apps/web/src/app/(dev)/data-grid-demo/page.tsx
autonomous: true
---

<objective>
Build the complete visual shell for the DataGrid component system, consuming the headless foundation from quick-377.

Purpose: Provide a fully styled, accessible, performant data grid matching the spec with frozen panes, virtualization, keyboard navigation, bulk actions, and all interaction patterns.

Output: 13 shell components + barrel export + demo page at /data-grid-demo
</objective>

<context>
@apps/web/src/components/data-grid/index.ts (headless foundation exports)
@apps/web/src/components/data-grid/core/types.ts (type definitions)
@apps/web/src/components/data-grid/core/useDataGrid.ts (orchestration hook)
@apps/web/src/components/data-grid/core/DataGrid.tsx (headless component + context)
@apps/web/src/components/ui/table.tsx (shadcn table primitives)
@apps/web/src/components/ui/skeleton.tsx (skeleton component)
@apps/web/src/components/ui/empty-state.tsx (empty state pattern)
@apps/web/src/components/ui/alert-dialog.tsx (delete confirmation)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Core shell structure (GridShell, GridHeader, GridBody, GridRow, GridCell)</name>
  <files>
    apps/web/src/components/data-grid/shell/GridShell.tsx
    apps/web/src/components/data-grid/shell/GridHeader.tsx
    apps/web/src/components/data-grid/shell/GridBody.tsx
    apps/web/src/components/data-grid/shell/GridRow.tsx
    apps/web/src/components/data-grid/shell/GridCell.tsx
  </files>
  <action>
Create 5 core shell components that consume useDataGridContext from the headless layer:

**GridShell.tsx** (~150 lines):
- Main visual frame with CSS Grid layout for frozen panes
- Props: children, className
- Uses `useDataGridContext()` to access table, preferences, selection
- Renders: toolbar slot (top), header (sticky), body (scrollable), footer (sticky bottom), bulk actions bar (slides in from bottom when selection.selectedCount > 0)
- CSS Grid structure:
  ```
  grid-template-areas:
    "toolbar toolbar toolbar"
    "frozen-left header frozen-right"
    "frozen-left body frozen-right"
    "footer footer footer"
    "bulk bulk bulk"
  ```
- Frozen columns get `position: sticky` with `left: 0` / `right: 0` and shadow on inner edge (`shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]` for left, mirror for right)
- Container has `role="grid"` and `aria-rowcount`, `aria-colcount`
- Keyboard handler at container level for grid navigation (arrows, Enter, Space, Shift+arrows, Cmd+A)

**GridHeader.tsx** (~120 lines):
- Sticky header row rendering column headers
- Props: onColumnResize, onColumnReorder (callbacks)
- Uses `table.getHeaderGroups()` from context
- Each header cell has:
  - Sort indicator (ChevronUp/ChevronDown from lucide-react) with `aria-sort="ascending|descending|none"`
  - Resize handle (vertical bar on right edge, cursor-col-resize, draggable)
  - Column menu trigger (MoreVertical icon, shows popover with: Sort Asc, Sort Desc, Hide Column, Freeze Column)
  - Drag handle for reorder (GripVertical icon, only visible on hover)
- Row height: 40px
- Background: `bg-muted/50`
- Font: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- All interactive elements have `aria-label`

**GridBody.tsx** (~100 lines):
- Virtualized row container using @tanstack/react-virtual
- Props: renderRow (optional custom row renderer), overscan (default: 5)
- Uses `useVirtualizer` with `estimateSize` based on density (compact: 28px, normal: 36px, comfortable: 44px)
- Renders only visible rows + overscan
- Absolute positioning for virtualized rows with `transform: translateY()`
- Container has `role="rowgroup"` and `aria-live="polite"` for screen readers
- Passes row data + virtualRow to GridRow

**GridRow.tsx** (~80 lines):
- Single row with selection, hover, click handlers
- Props: row (TanStack Row), index, virtualRow, onRowClick, onRowDoubleClick
- Uses selection from context: `isSelected(row.id)`, `selectRow(row.id, event)`
- Visual states:
  - Hover: `hover:bg-muted/50`
  - Selected: `bg-primary/5` with 3px accent bar on left edge (`border-l-3 border-primary`)
  - Focused: `ring-2 ring-primary ring-inset`
- Renders cells via `row.getVisibleCells().map()` into GridCell
- Row has `role="row"`, `aria-rowindex`, `aria-selected`, `tabIndex={0}`
- Keyboard: Enter/Space = select, arrow keys = navigate (handled at GridShell level)

**GridCell.tsx** (~60 lines):
- Cell renderer with inline-edit slot
- Props: cell (TanStack Cell), isEditing, onStartEdit, onEndEdit, children (for custom content)
- Uses `flexRender(cell.column.columnDef.cell, cell.getContext())` for default rendering
- Supports inline edit mode: when isEditing=true, renders Input instead of value
- Cell has `role="gridcell"`, `aria-colindex`
- Truncates long content with `truncate` class
- Padding based on density from context

All components use Tailwind only, semantic colors (`text-foreground`, `bg-background`, `border-border`, etc.), and import `cn` from `@/lib/utils`.
  </action>
  <verify>
    - `tsc --noEmit` passes
    - All 5 files exist with correct exports
    - No inline styles except dynamic width/height/transform
  </verify>
  <done>
    GridShell renders a CSS Grid layout with frozen pane support, GridHeader shows sortable/resizable columns, GridBody virtualizes rows, GridRow handles selection states, GridCell renders cell content with edit slot.
  </done>
</task>

<task type="auto">
  <name>Task 2: Toolbar, Footer, and state components (GridToolbar, GridFooter, EmptyState, LoadingSkeleton, ErrorState)</name>
  <files>
    apps/web/src/components/data-grid/shell/GridToolbar.tsx
    apps/web/src/components/data-grid/shell/GridFooter.tsx
    apps/web/src/components/data-grid/shell/EmptyState.tsx
    apps/web/src/components/data-grid/shell/LoadingSkeleton.tsx
    apps/web/src/components/data-grid/shell/ErrorState.tsx
  </files>
  <action>
Create toolbar, footer, and state components:

**GridToolbar.tsx** (~180 lines):
- Sticky toolbar above header
- Props: onNew (callback), showNew (boolean), searchPlaceholder, exportFilename
- Layout: `flex items-center gap-2 p-2 border-b bg-background`
- Components (left to right):
  1. Search input with debounce 300ms (uses urlState.setSearch from context or local state)
     - Icon: Search from lucide-react
     - Placeholder: searchPlaceholder or "Search..."
     - `w-64` width, uses shadcn Input
  2. Spacer (`flex-1`)
  3. Density toggle (DropdownMenu with 3 options: Compact/Normal/Comfortable)
     - Icon: Rows3 for normal, Rows2 for compact, Rows4 for comfortable
     - Uses preferences.setDensity from context
  4. Column visibility (DropdownMenu with checkboxes for each column)
     - Icon: Columns3 from lucide-react
     - Checkbox for each column, checked = visible
     - Uses preferences.setHiddenColumns
  5. Export CSV button
     - Icon: Download from lucide-react
     - Calls context exportCsv(exportFilename)
  6. "New" button (if showNew=true)
     - Primary variant, Plus icon
     - Calls onNew()
- All buttons use shadcn Button with `variant="ghost"` or `variant="outline"` + `size="sm"`
- Tooltips on icon-only buttons

**GridFooter.tsx** (~100 lines):
- Sticky footer with pagination
- Uses table.getPageCount(), table.getState().pagination from context
- Layout: `flex items-center justify-between p-2 border-t bg-background`
- Left side: "Showing X-Y of Z results" text
- Right side:
  1. Page size selector (Select with options: 10, 25, 50, 100)
     - Uses preferences.setPageSize or urlState.setPageSize
  2. Pagination controls:
     - First page (ChevronsLeft icon)
     - Previous page (ChevronLeft icon)
     - Page indicator: "Page X of Y"
     - Next page (ChevronRight icon)
     - Last page (ChevronsRight icon)
  - Uses table.previousPage(), table.nextPage(), table.setPageIndex()
  - Buttons disabled at boundaries (getCanPreviousPage, getCanNextPage)
- All buttons have `aria-label`

**EmptyState.tsx** (~50 lines):
- Empty state for no data or filtered empty
- Props: type ('no-data' | 'filtered-empty'), onClearFilters (callback)
- no-data: Inbox icon, "No data yet", "Add your first item to get started"
- filtered-empty: SearchX icon, "No results found", "Try adjusting your search or filters", + "Clear filters" button
- Uses the existing EmptyState pattern from @/components/ui/empty-state as reference but custom for DataGrid

**LoadingSkeleton.tsx** (~40 lines):
- Skeleton loader matching grid structure
- Props: rowCount (default: 10), columnCount (default: 5)
- Renders fake header row + N skeleton body rows
- Each row has columnCount Skeleton cells with varying widths (randomized but consistent via seeded pattern)
- Uses Skeleton from @/components/ui/skeleton

**ErrorState.tsx** (~40 lines):
- Error state with retry
- Props: error (Error | string), onRetry (callback)
- AlertTriangle icon (red), "Something went wrong", error message, "Try again" button
- Centered in grid body area

All components use Tailwind semantic colors and shadcn primitives.
  </action>
  <verify>
    - `tsc --noEmit` passes
    - All 5 files exist
    - Debounce on search input is 300ms
    - Pagination buttons properly disabled at boundaries
  </verify>
  <done>
    GridToolbar provides search/density/columns/export/new controls, GridFooter shows pagination with page size selector, EmptyState handles no-data and filtered-empty, LoadingSkeleton shows animated placeholder, ErrorState displays error with retry.
  </done>
</task>

<task type="auto">
  <name>Task 3: Interaction components (BulkActionsBar, QuickActions, ColumnDragHandle, delete confirmations)</name>
  <files>
    apps/web/src/components/data-grid/shell/BulkActionsBar.tsx
    apps/web/src/components/data-grid/shell/QuickActions.tsx
    apps/web/src/components/data-grid/shell/ColumnDragHandle.tsx
    apps/web/src/components/data-grid/shell/DeleteConfirmDialog.tsx
  </files>
  <action>
Create interaction components for bulk actions, row actions, and column reordering:

**BulkActionsBar.tsx** (~100 lines):
- Sticky bar that slides in from bottom when rows selected
- Props: actions (array of { label, icon, onClick, variant? }), onDelete (callback for built-in delete)
- Uses selection.selectedCount from context
- Animation: `translate-y-full` when hidden, `translate-y-0` when visible, `transition-transform duration-200`
- Layout: `fixed bottom-0 left-0 right-0 p-3 bg-background border-t shadow-lg z-50`
- Shows: "{N} selected" text + action buttons + "Delete" button (destructive variant)
- Delete button triggers DeleteConfirmDialog
- "Clear selection" link/button on right
- Has `role="toolbar"` and `aria-label="Bulk actions"`

**QuickActions.tsx** (~80 lines):
- Per-row action buttons (view/edit/delete)
- Props: row, onView, onEdit, onDelete, customActions (optional array)
- Renders in last cell of row (actions column)
- Hidden by default, visible on row hover via CSS (parent `group` class, actions have `opacity-0 group-hover:opacity-100`)
- Actions:
  1. View (Eye icon) - calls onView(row)
  2. Edit (Pencil icon) - calls onEdit(row)
  3. Delete (Trash2 icon) - calls onDelete(row), triggers single-item DeleteConfirmDialog
- All buttons: `size="icon"` `variant="ghost"` with `h-7 w-7`
- Custom actions render before the built-in ones
- Has `role="group"` and `aria-label="Row actions"`

**ColumnDragHandle.tsx** (~50 lines):
- Drag handle for column reordering using @dnd-kit/core
- Props: columnId, listeners (from useSortable), attributes (from useSortable)
- Icon: GripVertical from lucide-react
- Only visible on header hover (similar pattern to QuickActions)
- Uses `useSortable` from @dnd-kit/sortable
- Cursor: `cursor-grab` default, `cursor-grabbing` when dragging
- Has `aria-label="Drag to reorder column"`
- Note: The actual DnD context wrapping will be in GridHeader

**DeleteConfirmDialog.tsx** (~80 lines):
- Delete confirmation using AlertDialog
- Props: open, onOpenChange, itemCount, itemLabel (singular), onConfirm, requireTypedConfirmation (boolean)
- Two modes:
  1. Simple (itemCount < 4): Standard AlertDialog with "Delete {N} {itemLabel}(s)?" and Cancel/Delete buttons
  2. Typed confirmation (itemCount >= 4 OR requireTypedConfirmation=true):
     - Shows "Type DELETE to confirm"
     - Input field that must match "DELETE" exactly
     - Delete button disabled until input matches
- Delete button: `variant="destructive"`
- Uses AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction from @/components/ui/alert-dialog
  </action>
  <verify>
    - `tsc --noEmit` passes
    - All 4 files exist
    - BulkActionsBar animates in/out
    - DeleteConfirmDialog has typed confirmation for 4+ items
    - QuickActions visible on hover
  </verify>
  <done>
    BulkActionsBar slides in with selection count and bulk actions, QuickActions shows view/edit/delete on row hover, ColumnDragHandle enables drag-to-reorder, DeleteConfirmDialog handles single and bulk delete with typed confirmation for 4+.
  </done>
</task>

<task type="auto">
  <name>Task 4: Barrel exports and demo page</name>
  <files>
    apps/web/src/components/data-grid/shell/index.ts
    apps/web/src/components/data-grid/index.ts
    apps/web/src/app/(dev)/data-grid-demo/page.tsx
  </files>
  <action>
Create barrel exports and a demo page:

**shell/index.ts** (~30 lines):
- Export all shell components:
```typescript
export { GridShell } from './GridShell';
export { GridHeader } from './GridHeader';
export { GridBody } from './GridBody';
export { GridRow } from './GridRow';
export { GridCell } from './GridCell';
export { GridFooter } from './GridFooter';
export { GridToolbar } from './GridToolbar';
export { BulkActionsBar } from './BulkActionsBar';
export { QuickActions } from './QuickActions';
export { EmptyState as GridEmptyState } from './EmptyState';
export { LoadingSkeleton as GridLoadingSkeleton } from './LoadingSkeleton';
export { ErrorState as GridErrorState } from './ErrorState';
export { ColumnDragHandle } from './ColumnDragHandle';
export { DeleteConfirmDialog } from './DeleteConfirmDialog';
```

**Update data-grid/index.ts**:
- Add shell exports at the bottom:
```typescript
// Shell components (visual layer)
export * from './shell';
```

**Create (dev) route group and demo page** at `apps/web/src/app/(dev)/data-grid-demo/page.tsx` (~200 lines):
- Server component that renders a client component
- Demo data: 100 fake users with id, name, email, role, status, createdAt
- Columns: checkbox (selection), name, email, role (badge), status (badge with color), createdAt (formatted date), actions (QuickActions)
- Features demonstrated:
  1. Full DataGrid with all shell components
  2. Frozen first column (checkbox + name)
  3. Sortable columns
  4. Resizable columns
  5. Search filtering
  6. Density toggle
  7. Column visibility
  8. Pagination (25 per page)
  9. Row selection with shift-click
  10. Bulk actions bar
  11. Quick actions (view/edit/delete with toast feedback)
  12. Empty state (filter to show no results)
  13. Export CSV
- Uses fake static data (no server fetching for demo)
- Layout: Full page with `h-screen` and padding
- Title: "DataGrid Demo" in h1
- Note: This is a development-only page, add to .gitignore or exclude from production build if needed

The demo page should compose all components:
```tsx
<DataGrid gridId="demo-users" columns={columns} data={users} enableSelection enablePersistence>
  <GridShell>
    <GridToolbar showNew onNew={handleNew} />
    <GridHeader />
    <GridBody />
    <GridFooter />
    <BulkActionsBar actions={bulkActions} onDelete={handleBulkDelete} />
  </GridShell>
</DataGrid>
```
  </action>
  <verify>
    - `tsc --noEmit` passes
    - `npm run build` succeeds
    - Navigate to http://localhost:3000/data-grid-demo shows working demo
    - All features work: sort, resize, search, select, bulk actions, pagination
  </verify>
  <done>
    Shell components exported via barrel, main data-grid index updated, demo page at /data-grid-demo shows all features working together.
  </done>
</task>

<task type="auto">
  <name>Task 5: Keyboard navigation and accessibility polish</name>
  <files>
    apps/web/src/components/data-grid/shell/useGridKeyboardNav.ts
    apps/web/src/components/data-grid/shell/GridShell.tsx
  </files>
  <action>
Create keyboard navigation hook and integrate into GridShell:

**useGridKeyboardNav.ts** (~120 lines):
- Custom hook for full keyboard navigation
- Props: table (TanStack Table), selection, gridRef (ref to container)
- State: focusedCell { rowIndex, colIndex }
- Keyboard handlers:
  1. ArrowUp/Down: Move focus between rows
  2. ArrowLeft/Right: Move focus between cells
  3. Home: Jump to first cell in row
  4. End: Jump to last cell in row
  5. Ctrl+Home: Jump to first cell in grid
  6. Ctrl+End: Jump to last cell in grid
  7. PageUp/PageDown: Jump 10 rows (or to boundary)
  8. Enter: Activate cell (start edit if editable, or trigger row action)
  9. Space: Toggle row selection
  10. Shift+ArrowUp/Down: Extend selection range
  11. Ctrl+A (Cmd+A on Mac): Select all rows
  12. Escape: Clear selection or exit edit mode
- Returns: { focusedCell, setFocusedCell, handleKeyDown }
- Uses `document.activeElement` and `element.focus()` for actual focus management
- Manages `data-focused="true"` attribute on focused cell for styling
- Respects column visibility (skip hidden columns)

**Update GridShell.tsx**:
- Integrate useGridKeyboardNav hook
- Add `onKeyDown={handleKeyDown}` to container
- Add `ref={gridRef}` to container
- Pass focusedCell to GridBody for visual indication
- Ensure `tabIndex={0}` on container for focus capture
- Add `aria-activedescendant` pointing to focused cell ID

Accessibility checklist:
- [ ] All interactive elements have aria-label
- [ ] Grid has role="grid", rows have role="row", cells have role="gridcell"
- [ ] aria-rowcount and aria-colcount on grid
- [ ] aria-rowindex on each row
- [ ] aria-colindex on each cell
- [ ] aria-selected on selected rows
- [ ] aria-sort on sortable column headers
- [ ] aria-live="polite" on body for dynamic updates
- [ ] Focus visible ring on all focusable elements
- [ ] Color contrast meets WCAG AA (handled by semantic Tailwind colors)
  </action>
  <verify>
    - `tsc --noEmit` passes
    - Arrow keys navigate cells in demo
    - Enter/Space select rows
    - Cmd+A selects all
    - Escape clears selection
    - Screen reader announces grid structure correctly (test with VoiceOver or similar)
  </verify>
  <done>
    Full keyboard navigation implemented with arrow keys, Enter/Space for selection, Cmd+A for select all, and proper ARIA attributes throughout for screen reader support.
  </done>
</task>

</tasks>

<verification>
After all tasks:
1. `cd apps/web && tsc --noEmit` — no TypeScript errors
2. `cd apps/web && npm run build` — production build succeeds
3. `cd apps/web && npm run dev` then visit http://localhost:3000/data-grid-demo — demo renders
4. Test in demo:
   - Click column header to sort (indicator shows)
   - Drag column edge to resize
   - Type in search to filter (debounced)
   - Toggle density (row heights change)
   - Toggle column visibility
   - Click rows to select (checkbox appears checked)
   - Shift+click for range select
   - Bulk actions bar appears with selection
   - Delete triggers confirmation dialog
   - Bulk delete 4+ items requires typing DELETE
   - Export downloads CSV
   - Arrow keys navigate cells
   - Tab moves between toolbar/grid/footer
   - VoiceOver/screen reader announces grid structure
</verification>

<success_criteria>
- All 14 shell component files created and exported
- Demo page at /data-grid-demo working
- Frozen columns render with sticky positioning and shadow
- Virtualization renders only visible rows (check with 1000+ rows)
- Keyboard navigation works for all specified keys
- All ARIA attributes present and correct
- Delete confirmations work for single and bulk
- TypeScript compiles without errors
- Production build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/378-build-datagrid-visual-shell-with-frozen-/378-SUMMARY.md`
</output>
