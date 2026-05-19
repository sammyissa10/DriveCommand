---
phase: quick-379
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Filter components
  - apps/web/src/components/data-grid/filters/FilterPanel.tsx
  - apps/web/src/components/data-grid/filters/FilterChip.tsx
  - apps/web/src/components/data-grid/filters/filterTypes/TextFilter.tsx
  - apps/web/src/components/data-grid/filters/filterTypes/SelectFilter.tsx
  - apps/web/src/components/data-grid/filters/filterTypes/DateRangeFilter.tsx
  - apps/web/src/components/data-grid/filters/filterTypes/NumberRangeFilter.tsx
  - apps/web/src/components/data-grid/filters/index.ts
  # Saved views
  - apps/web/src/components/data-grid/views/SavedViewsMenu.tsx
  - apps/web/src/components/data-grid/views/useSavedViews.ts
  - apps/web/src/components/data-grid/views/index.ts
  - apps/web/src/app/api/user/grid-views/[gridId]/route.ts
  - apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
  - apps/web/prisma/schema.prisma
  # Export
  - apps/web/src/components/data-grid/export/exportToCsv.ts
  - apps/web/src/components/data-grid/export/index.ts
  # Inline edit
  - apps/web/src/components/data-grid/inline-edit/InlineEditCell.tsx
  - apps/web/src/components/data-grid/inline-edit/index.ts
  # Integration
  - apps/web/src/components/data-grid/shell/GridToolbar.tsx
  - apps/web/src/components/data-grid/shell/GridCell.tsx
  - apps/web/src/components/data-grid/core/types.ts
  - apps/web/src/components/data-grid/index.ts
  # Clients migration
  - apps/web/src/app/(owner)/carrier/clients/page.tsx
  - apps/web/src/lib/carrier/clients.ts
  - apps/web/src/app/api/v1/carrier/clients/route.ts
  # Docs
  - apps/web/src/components/data-grid/MIGRATION.md
  - apps/web/src/components/data-grid/README.md
  # Demo
  - apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
autonomous: true
must_haves:
  truths:
    - "User can filter grid by text, select, date range, and number range operators"
    - "User can save current view (filters+sort+columns) and switch between saved views"
    - "User can inline edit cells marked as editable with optimistic updates"
    - "User can export visible/selected/all rows to CSV"
    - "Clients page uses DataGrid with all features working (no regressions)"
    - "Filter state persists in URL and is shareable"
  artifacts:
    - path: "apps/web/src/components/data-grid/filters/FilterPanel.tsx"
      provides: "Slide-out filter builder panel"
      min_lines: 150
    - path: "apps/web/src/components/data-grid/views/SavedViewsMenu.tsx"
      provides: "Dropdown for saved view CRUD"
      min_lines: 100
    - path: "apps/web/src/components/data-grid/export/exportToCsv.ts"
      provides: "CSV export with papaparse streaming"
      min_lines: 80
    - path: "apps/web/src/components/data-grid/inline-edit/InlineEditCell.tsx"
      provides: "Inline edit with text/select/date variants"
      min_lines: 120
    - path: "apps/web/prisma/schema.prisma"
      provides: "GridView model for saved views"
      contains: "model GridView"
    - path: "apps/web/src/components/data-grid/MIGRATION.md"
      provides: "Step-by-step migration playbook"
      min_lines: 50
  key_links:
    - from: "apps/web/src/components/data-grid/shell/GridToolbar.tsx"
      to: "FilterPanel, SavedViewsMenu"
      via: "imports and renders"
      pattern: "FilterPanel|SavedViewsMenu"
    - from: "apps/web/src/app/(owner)/carrier/clients/page.tsx"
      to: "DataGrid"
      via: "replaces ClientList with DataGrid"
      pattern: "DataGrid|dataFetcher"
---

<objective>
Complete DataGrid with filters, saved views, inline edit, CSV export, and migrate Clients page as reference implementation.

Purpose: Deliver power-user features that make DataGrid production-ready: rich filtering with URL serialization, saved views for workflow persistence, inline editing with optimistic updates, and robust CSV export. The Clients page migration serves as the canonical example for migrating other list pages.

Output:
- Filter system (4 filter types + panel + chips)
- Saved views system (API + UI + Prisma model)
- Inline edit system (3 variants with optimistic updates)
- CSV export (papaparse streaming, 50k row cap)
- Migrated Clients page
- MIGRATION.md playbook
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/data-grid/core/types.ts
@apps/web/src/components/data-grid/core/useDataGrid.ts
@apps/web/src/components/data-grid/core/useGridUrlState.ts
@apps/web/src/components/data-grid/shell/GridToolbar.tsx
@apps/web/src/components/data-grid/shell/GridCell.tsx
@apps/web/src/app/(owner)/carrier/clients/page.tsx
@apps/web/src/components/carrier/clients/ClientList.tsx
@apps/web/src/lib/carrier/clients.ts
@apps/web/src/app/api/v1/carrier/clients/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build filter system and saved views infrastructure</name>
  <files>
    apps/web/src/components/data-grid/filters/filterTypes/TextFilter.tsx
    apps/web/src/components/data-grid/filters/filterTypes/SelectFilter.tsx
    apps/web/src/components/data-grid/filters/filterTypes/DateRangeFilter.tsx
    apps/web/src/components/data-grid/filters/filterTypes/NumberRangeFilter.tsx
    apps/web/src/components/data-grid/filters/FilterPanel.tsx
    apps/web/src/components/data-grid/filters/FilterChip.tsx
    apps/web/src/components/data-grid/filters/index.ts
    apps/web/src/components/data-grid/views/useSavedViews.ts
    apps/web/src/components/data-grid/views/SavedViewsMenu.tsx
    apps/web/src/components/data-grid/views/index.ts
    apps/web/src/app/api/user/grid-views/[gridId]/route.ts
    apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
    apps/web/prisma/schema.prisma
    apps/web/src/components/data-grid/core/types.ts
  </files>
  <action>
    **Design decisions (per task requirements):**

    (a) **Filter URL serialization:** Use human-readable format `?filters=status:eq:active,mrr:gt:1000`. Each filter is `columnId:operator:value`, comma-separated. For `between` operator: `columnId:between:min~max`. For multi-select: `columnId:anyOf:val1|val2|val3`. Decode/encode in useGridUrlState. This keeps URLs debuggable by support.

    (b) **Saved view conflict resolution:** Track `isDirty` state by comparing current grid state to selected view's serialized state. Show asterisk (*) next to view name when dirty. On view switch with unsaved changes, show confirmation dialog: "Discard changes?" with options "Discard" / "Save as new" / "Cancel".

    (c) **Inline edit optimistic pattern:** On edit commit, immediately update local state, call onCellEdit(rowId, colId, newValue, oldValue) which returns Promise. Show spinner in cell during save. On success: green flash 300ms. On error: red flash, revert to oldValue, show toast via sonner.

    (d) **Export progress UX:** For "Export all" with server-side data, show toast with progress bar. Paginate-fetch 1000 rows at a time, update progress. Use async generator to stream rows into papaparse. Hard cap 50k rows with clear error toast if exceeded.

    **Filter types implementation:**

    1. Create `filterTypes/TextFilter.tsx`:
       - Props: `{ value: string, onChange, operator, onOperatorChange }`
       - Operators: contains, equals, startsWith, endsWith, isEmpty, isNotEmpty
       - Input hidden when operator is isEmpty/isNotEmpty
       - Use shadcn Select for operator, Input for value

    2. Create `filterTypes/SelectFilter.tsx`:
       - Props: `{ value: string[], onChange, operator, onOperatorChange, options }`
       - Operators: anyOf, noneOf, isEmpty
       - Multi-select dropdown using shadcn Command/Popover
       - Badge count for selected items

    3. Create `filterTypes/DateRangeFilter.tsx`:
       - Props: `{ value: { from?: Date, to?: Date }, onChange, operator, onOperatorChange }`
       - Operators: is, before, after, between, inLastNDays, isEmpty
       - Use date-fns for date math
       - DatePicker from shadcn for single dates, two pickers for between
       - Number input for "in last N days"

    4. Create `filterTypes/NumberRangeFilter.tsx`:
       - Props: `{ value: { min?: number, max?: number }, onChange, operator, onOperatorChange }`
       - Operators: eq (=), neq (!=), gt (>), lt (<), between, isEmpty
       - One Input for single-value operators, two for between

    **FilterPanel implementation:**
    - 400px wide slide-out from right (Sheet component)
    - "Add filter" button reveals column picker (only filterable columns)
    - Each active filter: column name, operator dropdown, value input, X remove button
    - "Clear all" link in footer
    - Apply button commits filters to URL state

    **FilterChip implementation:**
    - Renders active filter as removable pill
    - Shows: column label, operator, value summary
    - X button removes filter
    - Truncate long values with tooltip

    **Saved views Prisma model:**
    ```prisma
    model GridView {
      id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      gridId       String   // e.g., "clients", "contracts"
      userId       String   @db.Uuid
      name         String
      isDefault    Boolean  @default(false)
      schemaVersion Int     @default(1)  // For future migrations
      state        Json     // GridViewState serialized
      createdAt    DateTime @default(now()) @db.Timestamptz
      updatedAt    DateTime @updatedAt @db.Timestamptz

      user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

      @@unique([gridId, userId, name])
      @@index([gridId, userId])
    }
    ```

    **API routes:**
    - GET `/api/user/grid-views/[gridId]` - List views for current user + grid
    - POST `/api/user/grid-views/[gridId]` - Create new view `{ name, isDefault?, state }`
    - PUT `/api/user/grid-views/[gridId]/[viewId]` - Update view
    - DELETE `/api/user/grid-views/[gridId]/[viewId]` - Delete view

    **useSavedViews hook:**
    - Uses TanStack Query for CRUD
    - `views`, `selectedViewId`, `isDirty`, `selectView`, `saveView`, `updateView`, `deleteView`, `resetToDefault`
    - Compares current state to selected view's state for dirty detection

    **SavedViewsMenu:**
    - Dropdown button showing current view name (or "All [records]")
    - Asterisk when dirty
    - Menu items: list of views, divider, "Save current view as...", "Update current view" (disabled if not dirty), "Delete view", "Reset to default"
    - Save dialog: name input, "Set as default" checkbox

    **Update types.ts:**
    - Add `GridViewState` interface capturing all view state
    - Add filter operator types for each filter type
    - Add `exportValue?(row: TData): string` to column meta
  </action>
  <verify>
    - Run `npx prisma generate` and `npx prisma db push` - no errors
    - Run `tsc --noEmit` - no TypeScript errors
    - Filter components render without errors in demo page
  </verify>
  <done>
    - 4 filter type components with consistent API
    - FilterPanel slides out, shows active filters, allows add/remove
    - FilterChip displays and removes individual filters
    - GridView Prisma model created and migrated
    - API routes for view CRUD working
    - useSavedViews hook with dirty detection
    - SavedViewsMenu with full CRUD UI
  </done>
</task>

<task type="auto">
  <name>Task 2: Build inline edit system, CSV export, and wire into GridToolbar</name>
  <files>
    apps/web/src/components/data-grid/inline-edit/InlineEditCell.tsx
    apps/web/src/components/data-grid/inline-edit/index.ts
    apps/web/src/components/data-grid/export/exportToCsv.ts
    apps/web/src/components/data-grid/export/index.ts
    apps/web/src/components/data-grid/shell/GridToolbar.tsx
    apps/web/src/components/data-grid/shell/GridCell.tsx
    apps/web/src/components/data-grid/core/useDataGrid.ts
    apps/web/src/components/data-grid/index.ts
    apps/web/package.json
  </files>
  <action>
    **Install dependencies:**
    ```bash
    cd apps/web && npm install papaparse date-fns && npm install -D @types/papaparse
    ```

    **InlineEditCell implementation:**
    - Props: `{ row, column, value, onCellEdit, editType: 'text' | 'select' | 'date', selectOptions? }`
    - Render states: view mode (show value + hover pencil icon), edit mode (input/select/datepicker), saving (spinner), success (green flash 300ms), error (red flash + revert)
    - View mode: on hover, show small pencil icon top-right
    - Enter edit: double-click cell OR press Enter when cell focused
    - Edit mode:
      - Text: Input with auto-focus and select-all
      - Select: shadcn Select dropdown
      - Date: shadcn DatePicker (calendar popover)
    - Commit: Enter key or blur
    - Cancel: Escape key (reverts to original value)
    - On commit:
      1. Show inline spinner (Loader2 icon)
      2. Call `onCellEdit(row.id, column.id, newValue, oldValue)` which returns Promise
      3. On resolve: green ring flash animation 300ms
      4. On reject: red ring flash, revert value, toast error via sonner
    - Do NOT use modal - all inline

    **Update GridCell.tsx:**
    - Import and use InlineEditCell when column.meta.editable = true
    - Pass editType from column.meta.editType (default: 'text')
    - Pass selectOptions from column.meta.filterOptions (reuse for select edit)
    - Wire onCellEdit from context

    **CSV export implementation (exportToCsv.ts):**
    - Use papaparse for CSV generation
    - Three modes:
      1. `exportVisible(rows, columns)` - in-memory, immediate download
      2. `exportSelected(selectedIds, rows, columns)` - filter to selected, immediate
      3. `exportAll(dataFetcher, columns, gridId)` - async with progress
    - For exportAll:
      - Show toast with progress bar via sonner
      - Paginate fetch: 1000 rows per request
      - Use async generator to yield rows
      - Stream into papaparse unparse
      - Hard cap 50k rows - if total > 50k, show error toast suggesting backend export
      - Filename: `${gridId}-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
    - Respect column.meta.exportValue?(row) for custom export formatting
    - Respect column visibility and order
    - Escape CSV special characters properly

    **Update GridToolbar.tsx:**
    - Replace stub filter button with FilterPanel trigger (Filter icon)
    - Add FilterChip row below toolbar when filters active
    - Replace stub density/export with real implementations
    - Add SavedViewsMenu next to filter button
    - Update export button to show dropdown menu:
      - "Export visible rows" (always enabled)
      - "Export selected rows" (disabled if none selected, show count)
      - "Export all rows (current filters)" (shows total count)
    - Wire density change to preferences.setDensity
    - Pass onCellEdit through context for inline edit

    **Update useDataGrid.ts:**
    - Add onCellEdit prop to DataGridProps
    - Expose onCellEdit in context value
    - Add refreshAfterEdit option (default: true) to re-fetch after inline edit

    **Update index.ts barrel exports:**
    - Export FilterPanel, FilterChip, filter types
    - Export SavedViewsMenu, useSavedViews
    - Export InlineEditCell
    - Export exportToCsv utilities
  </action>
  <verify>
    - Run `npm run build` in apps/web - no errors
    - Run `tsc --noEmit` - no TypeScript errors
    - Demo page: can filter, switch views, inline edit, export CSV
  </verify>
  <done>
    - InlineEditCell with text/select/date variants, optimistic updates, visual feedback
    - exportToCsv with visible/selected/all modes, papaparse streaming, 50k cap
    - GridToolbar fully wired: real FilterPanel, SavedViewsMenu, export dropdown
    - GridCell uses InlineEditCell for editable columns
    - All exports updated in index.ts
  </done>
</task>

<task type="auto">
  <name>Task 3: Migrate Clients page and create migration playbook</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/page.tsx
    apps/web/src/lib/carrier/clients.ts
    apps/web/src/app/api/v1/carrier/clients/route.ts
    apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
    apps/web/src/components/data-grid/MIGRATION.md
    apps/web/src/components/data-grid/README.md
    apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
  </files>
  <action>
    **Extend Clients API for DataGrid:**
    Update `GET /api/v1/carrier/clients` to accept full DataGrid params:
    - `sort` (string, e.g., "name:asc")
    - `filters` (JSON string, parsed to GridFilter[])
    - `page` (number, 1-indexed)
    - `pageSize` (number)
    - `search` (string for global text search)

    Update `listClients` in lib/carrier/clients.ts:
    - Add `sort?: { field: string, direction: 'asc' | 'desc' }`
    - Add `filters?: GridFilter[]` - map to Prisma where clauses
    - Filter mapping:
      - text equals/contains/startsWith/endsWith -> Prisma string filters
      - select anyOf -> `{ in: values }`
      - number gt/lt/between -> Prisma number comparisons
      - date before/after/between -> Prisma date comparisons
      - isEmpty -> `{ equals: null }` or `{ equals: '' }`

    **Migrate Clients page:**
    Replace ClientList component usage with DataGrid:

    ```tsx
    // Server component fetches initial data
    const initialData = await listClients(orgId, { page: 1, pageSize: 25 });

    // Pass to client component
    <ClientsDataGrid
      initialData={initialData}
      role={session.role}
    />
    ```

    Create `ClientsDataGrid` client component:
    - gridId: "clients"
    - Define columns:
      - Name: frozen left, editable (text), sortable, text filter
      - Status: editable (select), select filter with options [active, inactive, blocked]
      - Primary Contact: sortable, text filter
      - Email: sortable, text filter
      - Location (city + state): sortable
      - Portal Access: boolean badge
      - Created: date filter, sortable
    - dataFetcher: calls `/api/v1/carrier/clients` with ServerFetchParams
    - enableUrlSync: true
    - enablePersistence: true
    - enableSelection: true
    - onRowDoubleClick: router.push(`/carrier/clients/${row.id}`)
    - onCellEdit: PATCH `/api/v1/carrier/clients/[id]` with { [columnId]: newValue }
    - Bulk actions: "Delete selected" (soft delete to inactive)
    - "New Client" button -> router.push('/carrier/clients/new')

    **Verify no regressions:**
    Clients page must support:
    - [x] List clients with pagination
    - [x] Search by name/contact/email (global search)
    - [x] Filter by status (select filter)
    - [x] Sort by any column
    - [x] Click row -> view client detail
    - [x] New Client button -> create flow
    - [x] Edit client inline (name, status)
    - [x] Sample pill badge on sample data
    - [x] Status count chips in header
    - [x] Empty state when no clients
    - [x] URL state shareable

    **Create MIGRATION.md playbook:**
    ```markdown
    # DataGrid Migration Playbook

    ## Overview
    Step-by-step guide to migrate existing list pages to the DataGrid component.

    ## Prerequisites
    - Existing list page with bespoke table
    - API endpoint that can be extended for sort/filter/page params

    ## Step 1: Extend API Endpoint
    ...

    ## Step 2: Define Column Configuration
    ...

    ## Step 3: Create DataGrid Client Component
    ...

    ## Step 4: Wire Actions
    ...

    ## Step 5: Test Checklist
    ...

    ## Common Gotchas
    - Filter URL encoding edge cases
    - Column ID must match API field name
    - ...

    ## Code Review Checklist
    - [ ] All existing functionality preserved
    - [ ] URL state is shareable
    - [ ] Keyboard navigation works
    - [ ] Empty/loading/error states render
    - [ ] Inline edit has proper error handling
    - [ ] Export respects column visibility
    ```

    **Update demo page:**
    - Add filter examples (all 4 types)
    - Add saved view demo
    - Add inline edit demo (text, select, date columns)
    - Add export buttons
    - Show filter chips when filters active

    **Update README.md:**
    - Document new features (filters, saved views, inline edit, export)
    - Add API reference for new props
    - Link to MIGRATION.md
  </action>
  <verify>
    - Run `tsc --noEmit` - no TypeScript errors
    - Run `npm run build` - successful build
    - Visit /carrier/clients - page loads with DataGrid
    - Test: search, filter by status, sort by name, paginate
    - Test: click row -> navigates to detail
    - Test: inline edit name -> saves, shows success flash
    - Test: inline edit status -> select dropdown works
    - Test: export visible rows -> downloads CSV
    - Test: copy URL with filters, paste in incognito -> same view (with auth)
    - Test: keyboard navigation (Tab, arrows, Enter to edit)
    - Verify demo page shows all features working
  </verify>
  <done>
    - Clients API extended with full filter/sort/page params
    - Clients page fully migrated to DataGrid
    - All existing functionality preserved (no regressions)
    - Inline edit working for name and status columns
    - URL state shareable
    - MIGRATION.md playbook complete
    - README.md updated with new features
    - Demo page exercises all new features
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `tsc --noEmit` passes with no errors
2. `npm run build` succeeds in apps/web
3. Prisma migration applied successfully
4. Clients page regression test:
   - List renders with pagination
   - Search works
   - Status filter works
   - Sort by any column works
   - Row click navigates to detail
   - New Client button works
   - Inline edit name saves
   - Inline edit status saves
   - Export CSV downloads
   - URL with filters is shareable
5. Demo page shows all features
6. Keyboard-only user can perform all actions
</verification>

<success_criteria>
- 4 filter type components with consistent API (value, onChange, operator, onOperatorChange)
- FilterPanel slide-out with add/remove filters
- FilterChip toolbar row for active filters
- Human-readable filter URL format: `?filters=status:eq:active,mrr:gt:1000`
- GridView Prisma model with schemaVersion for future migrations
- Saved views API (GET/POST/PUT/DELETE)
- useSavedViews hook with dirty detection
- SavedViewsMenu with full CRUD + conflict resolution dialog
- InlineEditCell with text/select/date variants
- Optimistic update pattern with visual feedback (spinner, green/red flash)
- exportToCsv with visible/selected/all modes
- Papaparse streaming for large exports, 50k row cap
- GridToolbar wired with real FilterPanel, SavedViewsMenu, export dropdown
- Clients page migrated with zero regressions
- MIGRATION.md playbook with step-by-step guide
- README.md updated with new features
- Demo page exercising all features
</success_criteria>

<output>
After completion, create `.planning/quick/379-complete-datagrid-with-filters-saved-vie/379-SUMMARY.md`
</output>
