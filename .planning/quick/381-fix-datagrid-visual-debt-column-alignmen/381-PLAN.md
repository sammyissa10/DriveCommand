---
phase: quick-381
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/data-grid/core/types.ts
  - apps/web/src/components/data-grid/core/useDataGrid.ts
  - apps/web/src/components/data-grid/hooks/useColumnSizing.tsx
  - apps/web/src/components/data-grid/shell/shared/SelectAllCheckbox.tsx
  - apps/web/src/components/data-grid/shell/shared/QuickActions.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridRow.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridBody.tsx
  - apps/web/src/components/data-grid/shell/shared/FilterSheet.tsx
  - apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx
  - apps/web/src/components/data-grid/shell/mobile/GridCard.tsx
  - apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx
  - apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx
  - apps/web/src/components/data-grid/shell/GridShell.tsx
  - apps/web/src/components/data-grid/DESIGN.md
  - apps/web/src/app/(owner)/data-grid-demo/page.tsx
autonomous: true

must_haves:
  truths:
    - "Header columns and body columns are perfectly pixel-aligned via shared CSS grid template"
    - "Quick actions column is the FIRST column, always visible (not hover-revealed)"
    - "Select-all checkbox is tri-state (unchecked/indeterminate/checked)"
    - "ID column sorts numerically (1, 2, 10) not lexically (1, 10, 2)"
    - "Filter button opens FilterSheet side panel"
    - "Mobile cards have clear 3-zone visual hierarchy"
    - "Mobile toolbar has proper hierarchy (Filter primary, Sort/Columns secondary)"
    - "GridCardList has 80px bottom padding for FAB clearance"
  artifacts:
    - path: "apps/web/src/components/data-grid/hooks/useColumnSizing.tsx"
      provides: "Column sizing context with templateColumns string"
      exports: ["ColumnSizingProvider", "useColumnSizing"]
    - path: "apps/web/src/components/data-grid/shell/shared/SelectAllCheckbox.tsx"
      provides: "Tri-state select-all checkbox component"
      exports: ["SelectAllCheckbox"]
    - path: "apps/web/src/components/data-grid/shell/shared/FilterSheet.tsx"
      provides: "Filter side panel (desktop=right, mobile=bottom)"
      exports: ["FilterSheet"]
  key_links:
    - from: "GridHeader.tsx"
      to: "useColumnSizing"
      via: "CSS grid template string"
      pattern: "gridTemplateColumns.*templateColumns"
    - from: "GridRow.tsx"
      to: "useColumnSizing"
      via: "Same CSS grid template string"
      pattern: "gridTemplateColumns.*templateColumns"
    - from: "GridToolbar.tsx"
      to: "FilterSheet"
      via: "onFilterClick opens sheet"
      pattern: "setFilterSheetOpen\\(true\\)"
---

<objective>
Fix DataGrid visual debt — column alignment, quick action placement, broken sort, broken filter, and mobile polish.

Purpose: The DataGrid visual shell (quick-380) has functional bugs that break professional presentation: columns drift out of alignment, quick actions are hidden on hover (should be always visible), sort is lexical instead of numeric, filter button does nothing, and mobile cards lack visual hierarchy.

Output: A polished DataGrid with pixel-perfect column alignment via CSS Grid, always-visible quick actions as the first column, tri-state select-all, proper numeric sorting, working filter panel stub, and refined mobile UX.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/data-grid/core/types.ts
@apps/web/src/components/data-grid/core/useDataGrid.ts
@apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx
@apps/web/src/components/data-grid/shell/desktop/GridRow.tsx
@apps/web/src/components/data-grid/shell/desktop/GridBody.tsx
@apps/web/src/components/data-grid/shell/shared/QuickActions.tsx
@apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx
@apps/web/src/components/data-grid/shell/mobile/GridCard.tsx
@apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx
@apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx
@apps/web/src/components/data-grid/shell/GridShell.tsx
@apps/web/src/components/data-grid/DESIGN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create useColumnSizing hook + Fix column alignment</name>
  <files>
    - apps/web/src/components/data-grid/hooks/useColumnSizing.tsx
    - apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx
    - apps/web/src/components/data-grid/shell/desktop/GridRow.tsx
    - apps/web/src/components/data-grid/shell/desktop/GridBody.tsx
    - apps/web/src/components/data-grid/shell/GridShell.tsx
  </files>
  <action>
Create `useColumnSizing.tsx` hook with React Context provider:

```tsx
// Interface
interface ColumnSizingContextValue {
  templateColumns: string;  // CSS grid-template-columns string
  columnWidths: Record<string, number>;
  setColumnWidth: (columnId: string, width: number) => void;
}
```

Column width rules:
- Actions column: FIRST column, fixed 132px
- Checkbox column: 44px
- Data columns: Use TanStack column.getSize() or default 150px
- Build templateColumns string: `"132px 44px 150px 1fr 150px..."` etc.

The hook should:
1. Accept `columns` from TanStack table and `enableSelection` boolean
2. Compute `templateColumns` string from columns array
3. Wrap children in ColumnSizingProvider

Update **GridHeader.tsx**:
- Remove current flex layout
- Import and use `useColumnSizing()` context
- Apply `display: grid` with `gridTemplateColumns: templateColumns` from context
- Actions header cell (first) shows nothing (just 132px spacer)
- Checkbox header cell (second if enableSelection) shows tri-state SelectAllCheckbox
- Data columns render normally with sort indicators

Update **GridRow.tsx**:
- Remove current flex layout
- Import and use `useColumnSizing()` context
- Apply `display: grid` with same `gridTemplateColumns` from context
- Actions cell (first column) renders QuickActions always-visible (NOT hover)
- Checkbox cell (second if enableSelection) renders row checkbox
- Data cells render via GridCell

Update **GridBody.tsx**:
- Pass through the grid layout (no changes needed for alignment, rows handle it)

Update **GridShell.tsx**:
- Wrap desktop table section in `<ColumnSizingProvider columns={...} enableSelection={...}>`
- The provider should sit around GridHeader + GridBody so they share context

This CSS Grid approach ensures header and body columns are always aligned because they use the exact same `gridTemplateColumns` string.
  </action>
  <verify>
1. Open `/data-grid-demo` page
2. Inspect header row with DevTools - should have `display: grid` and `grid-template-columns`
3. Inspect body rows - should have identical `grid-template-columns` value
4. Columns should be perfectly aligned between header and body
5. Quick actions column should be first (leftmost)
  </verify>
  <done>Header and body columns are pixel-aligned via shared CSS Grid template. Actions column is first (132px), checkbox second (44px if enabled), data columns follow.</done>
</task>

<task type="auto">
  <name>Task 2: Fix QuickActions + SelectAllCheckbox + Sort</name>
  <files>
    - apps/web/src/components/data-grid/shell/shared/QuickActions.tsx
    - apps/web/src/components/data-grid/shell/shared/SelectAllCheckbox.tsx
    - apps/web/src/components/data-grid/core/types.ts
    - apps/web/src/components/data-grid/core/useDataGrid.ts
    - apps/web/src/app/(owner)/data-grid-demo/page.tsx
  </files>
  <action>
**FIX QuickActions.tsx:**
- Remove the floating pill container styling (bg-background border shadow-sm)
- Change to simple inline flex: `flex items-center gap-1`
- Icons: Eye, Pencil, Trash2 at 16px (`h-4 w-4`) with `strokeWidth={1.5}`
- Always visible (remove opacity-0 hover logic - that's in GridRow now removed)
- Add `disabled` prop to each action for multi-select scenario
- When selectedCount > 1, View and Edit should be disabled with tooltip "Select single row"
- Delete still works (bulk delete)
- Add `selectedCount` prop to QuickActions
- All button clicks call `e.stopPropagation()` to prevent row selection

**CREATE SelectAllCheckbox.tsx:**
```tsx
interface SelectAllCheckboxProps {
  checked: 'unchecked' | 'indeterminate' | 'checked';
  onCheckedChange: (checked: boolean) => void;
  currentPageCount: number;
  totalRows: number;
  pageSize: number;
}
```
- Visual states: unchecked (empty), indeterminate (horizontal bar/dash), checked (checkmark)
- Use shadcn Checkbox with `data-state` manipulation for indeterminate
- When clicked in indeterminate state -> select all on current page
- When totalRows > pageSize and all current page selected, show banner: "All {pageSize} on this page selected. Select all {totalRows}?"
- Banner has link that calls `onSelectAllPages()` callback

**FIX SORT in types.ts:**
Add `dataType` field to `DataGridColumnMeta`:
```ts
export interface DataGridColumnMeta {
  // ... existing fields
  /** Data type for auto-sorting. Defaults to 'text'. */
  dataType?: 'text' | 'number' | 'date' | 'currency' | 'boolean';
}
```

**FIX SORT in useDataGrid.ts:**
In the `configuredColumns` useMemo, for each column:
1. Check if `meta.dataType` exists
2. If no explicit `sortingFn` provided by consumer, assign one based on dataType:
   - `'number' | 'currency'`: Use TanStack's built-in `alphanumeric` or create custom numeric comparator
   - `'date'`: Use TanStack's `datetime` sorting
   - `'boolean'`: Simple boolean comparator
   - `'text'` (default): Standard string sorting (default TanStack behavior)
3. Consumer-provided `sortingFn` always wins (override)

**UPDATE demo page:**
In `/data-grid-demo/page.tsx`, add `dataType: 'number'` to the ID column meta:
```tsx
{
  id: 'id',
  accessorKey: 'id',
  header: 'ID',
  meta: { dataType: 'number' },
}
```
  </action>
  <verify>
1. Quick actions (Eye/Pencil/Trash) should be always visible in first column
2. Select 2+ rows - View/Edit icons should be visually disabled with tooltip
3. Click ID column header to sort - should sort 1, 2, 3... 10, 11 (not 1, 10, 11, 2)
4. Header checkbox should show indeterminate state when some rows selected
5. Clicking header checkbox when indeterminate -> selects all on page
  </verify>
  <done>Quick actions are always visible with proper disabled states. SelectAllCheckbox is tri-state. ID column sorts numerically.</done>
</task>

<task type="auto">
  <name>Task 3: FilterSheet + Mobile UX polish</name>
  <files>
    - apps/web/src/components/data-grid/shell/shared/FilterSheet.tsx
    - apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx
    - apps/web/src/components/data-grid/shell/mobile/GridCard.tsx
    - apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx
    - apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx
    - apps/web/src/components/data-grid/shell/GridShell.tsx
    - apps/web/src/components/data-grid/DESIGN.md
  </files>
  <action>
**CREATE FilterSheet.tsx:**
```tsx
interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```
- Use shadcn `Sheet` component
- Desktop (useBreakpoint().isDesktop): `side="right"` with `w-[400px]`
- Mobile: `side="bottom"` with `h-[60vh]`
- Content: `<SheetHeader>` with title "Filters"
- Body: Placeholder text "Filters coming soon" + icon `<Filter className="h-8 w-8 text-muted-foreground" />`
- Later phases will add actual filter UI

**UPDATE GridToolbar.tsx:**
- Add `filterSheetOpen` state
- Wire Filter button `onClick` to `setFilterSheetOpen(true)`
- Render `<FilterSheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen} />`

**UPDATE MobileToolbar.tsx - Visual hierarchy:**
- Filter button: `variant="default"` (primary blue), includes text label "Filter"
- Sort button: `variant="ghost"`, icon-only (`<ArrowUpDown />`), no text
- Columns button: `variant="ghost"`, icon-only (`<Columns />`), no text
- Layout: Filter takes flex space, Sort/Columns are fixed icon buttons
```tsx
<div className="flex items-center gap-2">
  <Button variant="default" size="sm" className="flex-1">
    <Filter className="mr-2 h-4 w-4" strokeWidth={1.5} />
    Filter
    {badge}
  </Button>
  <Button variant="ghost" size="icon" aria-label="Sort">
    <ArrowUpDown className="h-4 w-4" strokeWidth={1.5} />
  </Button>
  <Button variant="ghost" size="icon" aria-label="Columns">
    <Columns className="h-4 w-4" strokeWidth={1.5} />
  </Button>
</div>
```

**UPDATE GridCard.tsx - 3-zone hierarchy:**
Replace flat layout with clear zones:
```
┌─────────────────────────────────────┐
│ TITLE                    [STATUS]  │  <- Zone 1: Primary info
├─────────────────────────────────────┤  <- Divider (border-t)
│ Label          Value               │  <- Zone 2: Metadata pairs
│ Label          Value               │
├─────────────────────────────────────┤  <- Optional Zone 3 border
│ [Actions or timestamp]             │  <- Zone 3: Optional secondary
└─────────────────────────────────────┘
```
- Zone 1: Title (font-medium) + StatusBadge on same line, `justify-between`
- Divider: `<Separator />` or `border-t border-border/40 my-2`
- Zone 2: Metadata as label/value pairs with `grid grid-cols-2 gap-y-1`
- Zone 3 (optional): Secondary actions or timestamps at bottom

**UPDATE GridCardList.tsx:**
- Add `pb-20` (80px) to the container padding for FAB clearance
- This ensures last card isn't hidden behind fixed FAB

**ADD SwipeHint (optional, nice-to-have):**
Create a subtle one-time animation hint on first card load:
- On first visit (check sessionStorage), animate first card with a quick translateX(-20px) then back
- Set `sessionStorage.setItem('datagrid-swipe-hint-shown', 'true')`
- Skip if already shown this session

**UPDATE DESIGN.md:**
Add new sections documenting:
- Column alignment via CSS Grid (useColumnSizing)
- Actions column placement (first, 132px)
- SelectAllCheckbox tri-state behavior
- dataType sorting rules
- Mobile 3-zone card hierarchy
- Mobile toolbar button hierarchy
  </action>
  <verify>
1. Click Filter button on desktop - sheet slides in from right (400px wide)
2. Click Filter button on mobile (resize browser) - sheet slides up from bottom
3. Mobile toolbar: Filter is blue primary button, Sort/Columns are ghost icons
4. Mobile cards show clear 3-zone hierarchy with divider
5. Scroll to bottom of mobile card list - 80px padding visible before FAB
6. `npm run lint` passes
7. `npm run typecheck` passes (or `tsc --noEmit`)
  </verify>
  <done>FilterSheet opens on button click. Mobile toolbar has proper visual hierarchy. Mobile cards have 3-zone layout. GridCardList has FAB padding.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. Desktop: columns perfectly aligned between header and body
2. Desktop: actions column is first, always visible
3. Desktop: select-all checkbox is tri-state
4. Desktop: ID sort is numeric (1, 2, 10 not 1, 10, 2)
5. Desktop: Filter button opens right-side sheet
6. Mobile: Filter button is primary, Sort/Columns are icon-only
7. Mobile: Cards have 3-zone visual hierarchy
8. Mobile: CardList has bottom padding for FAB
9. `npm run lint` passes
10. `npm run typecheck` passes
</verification>

<success_criteria>
- [ ] useColumnSizing hook created and provides shared templateColumns to header + body
- [ ] GridHeader and GridRow both use CSS Grid with identical grid-template-columns
- [ ] Actions column is FIRST (132px), checkbox is SECOND (44px if enabled)
- [ ] QuickActions are always visible (no hover reveal)
- [ ] View/Edit disabled with tooltip when multiple rows selected
- [ ] SelectAllCheckbox shows unchecked/indeterminate/checked states correctly
- [ ] types.ts has dataType field in DataGridColumnMeta
- [ ] useDataGrid auto-assigns sortingFn based on dataType
- [ ] ID column sorts numerically after adding dataType: 'number'
- [ ] FilterSheet component created with responsive side positioning
- [ ] GridToolbar wires Filter button to open FilterSheet
- [ ] MobileToolbar has Filter primary, Sort/Columns as ghost icon buttons
- [ ] GridCard has 3-zone visual hierarchy with divider
- [ ] GridCardList has pb-20 for FAB clearance
- [ ] DESIGN.md updated with new rules
- [ ] All TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/381-fix-datagrid-visual-debt-column-alignmen/381-SUMMARY.md`
</output>
